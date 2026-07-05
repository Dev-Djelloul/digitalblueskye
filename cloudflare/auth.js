/**
 * Authentification serveur OAuth pour Digital Blue Skye (Worker digitalblueskye-api).
 *
 * Fournit :
 *   - GET  /auth/providers        -> fournisseurs actives
 *   - GET  /auth/login/:provider  -> redirection OAuth (state + PKCE)
 *   - GET  /auth/callback/:provider -> echange code, cree session, pose cookie
 *   - GET  /auth/me               -> etat de session (source de verite)
 *   - POST /auth/logout           -> revoque la session + supprime le cookie
 *   - PATCH /auth/profile         -> maj displayName / preferences
 *   - POST /ai/chat               -> proxy IA protege (session + rate limit + log)
 *
 * SECURITE :
 *   - Les client_secret ne vivent que cote Worker (secrets Wrangler), jamais au front.
 *   - La session est un cookie HttpOnly ; seul le SHA-256 du token est stocke en D1.
 *   - Le front ne peut PAS prouver son identite : /auth/me est la seule verite.
 *   - Aucun access_token OAuth n'est persiste en D1 dans cette version.
 *
 * Ce module est autonome : worker-api.js n'a qu'a router vers handleAuthRoutes()
 * et handleAiChat(). Toute la config vient de env (voir docs/CHATBOT_AUTH_SECURITY.md).
 */

const SESSION_COOKIE = 'dbs_session';
const OAUTH_COOKIE = 'dbs_oauth';
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 jours
const OAUTH_STATE_TTL_MS = 10 * 60 * 1000; // 10 minutes

// ---------------------------------------------------------------------------
// Fournisseurs OAuth (metadonnees ; les secrets viennent de env).
// ---------------------------------------------------------------------------
const PROVIDERS = {
  google: {
    scopes: 'openid email profile',
    usesPkce: true,
    authorizeUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    userInfoUrl: 'https://openidconnect.googleapis.com/v1/userinfo',
    idEnv: 'GOOGLE_CLIENT_ID',
    secretEnv: 'GOOGLE_CLIENT_SECRET'
  },
  github: {
    scopes: 'read:user user:email',
    usesPkce: false,
    authorizeUrl: 'https://github.com/login/oauth/authorize',
    tokenUrl: 'https://github.com/login/oauth/access_token',
    userInfoUrl: 'https://api.github.com/user',
    emailsUrl: 'https://api.github.com/user/emails',
    idEnv: 'GITHUB_CLIENT_ID',
    secretEnv: 'GITHUB_CLIENT_SECRET'
  },
  facebook: {
    scopes: 'email public_profile',
    usesPkce: false,
    authorizeUrl: 'https://www.facebook.com/v19.0/dialog/oauth',
    tokenUrl: 'https://graph.facebook.com/v19.0/oauth/access_token',
    userInfoUrl: 'https://graph.facebook.com/me?fields=id,name,email,picture.type(large)',
    idEnv: 'FACEBOOK_CLIENT_ID',
    secretEnv: 'FACEBOOK_CLIENT_SECRET'
  }
};

function providerConfigured(env, provider) {
  const meta = PROVIDERS[provider];
  if (!meta) return false;
  return isSet(env[meta.idEnv]) && isSet(env[meta.secretEnv]);
}

function isSet(value) {
  return String(value || '').trim().length > 0;
}

function nowIso() {
  return new Date().toISOString();
}

// ---------------------------------------------------------------------------
// Crypto helpers (Web Crypto, disponible dans les Workers).
// ---------------------------------------------------------------------------
const encoder = new TextEncoder();

function toHex(buffer) {
  const bytes = new Uint8Array(buffer);
  let out = '';
  for (let i = 0; i < bytes.length; i += 1) out += bytes[i].toString(16).padStart(2, '0');
  return out;
}

function randomToken(bytes = 32) {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return toHex(arr.buffer);
}

async function sha256Hex(input) {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(input));
  return toHex(digest);
}

function base64UrlEncode(str) {
  return btoa(unescape(encodeURIComponent(str))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlDecode(str) {
  const padded = str.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((str.length + 3) % 4);
  return decodeURIComponent(escape(atob(padded)));
}

async function hmacSign(secret, data) {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(data));
  return toHex(sig).replace(/=+$/, '');
}

// PKCE : code_challenge = base64url(SHA-256(code_verifier)).
async function pkceChallenge(verifier) {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(verifier));
  const bytes = new Uint8Array(digest);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 1) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// Signature d'une charge utile (state OAuth) : payload.signature en base64url.
async function signPayload(secret, obj) {
  const json = JSON.stringify(obj);
  const body = base64UrlEncode(json);
  const sig = await hmacSign(secret, body);
  return `${body}.${sig}`;
}

async function verifyPayload(secret, token) {
  if (!token || typeof token !== 'string' || !token.includes('.')) return null;
  const [body, sig] = token.split('.');
  const expected = await hmacSign(secret, body);
  if (sig !== expected) return null;
  try {
    return JSON.parse(base64UrlDecode(body));
  } catch (error) {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Cookies / CORS.
// ---------------------------------------------------------------------------
function parseCookies(request) {
  const header = request.headers.get('Cookie') || '';
  const out = {};
  header.split(';').forEach((part) => {
    const idx = part.indexOf('=');
    if (idx === -1) return;
    const name = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    if (name) out[name] = decodeURIComponent(value);
  });
  return out;
}

function isLocalRequest(request) {
  const origin = request.headers.get('Origin') || '';
  const host = (() => { try { return new URL(request.url).hostname; } catch (_) { return ''; } })();
  return /localhost|127\.0\.0\.1/.test(origin) || /localhost|127\.0\.0\.1/.test(host);
}

// Cookie de session cross-site (front Netlify -> Worker API) : SameSite=None
// exige Secure. En local (http), on retombe sur Lax sans Secure. Surchargable
// via AUTH_COOKIE_SAMESITE (Lax quand un domaine API custom same-site existe).
function buildCookie(name, value, request, env, maxAgeSec) {
  const local = isLocalRequest(request);
  const sameSite = String(env.AUTH_COOKIE_SAMESITE || (local ? 'Lax' : 'None'));
  const secure = !local; // Secure obligatoire pour SameSite=None et en prod
  const parts = [
    `${name}=${encodeURIComponent(value)}`,
    'HttpOnly',
    'Path=/',
    `SameSite=${sameSite}`
  ];
  if (secure) parts.push('Secure');
  if (typeof maxAgeSec === 'number') parts.push(`Max-Age=${maxAgeSec}`);
  return parts.join('; ');
}

function clearCookie(name, request, env) {
  return buildCookie(name, '', request, env, 0);
}

function allowedOrigins(env) {
  const list = [];
  const push = (v) => String(v || '').split(',').forEach((o) => {
    const t = o.trim().replace(/\/+$/, '');
    if (t) list.push(t.toLowerCase());
  });
  push(env.FRONTEND_ORIGIN);
  push(env.ALLOWED_ORIGIN);
  return list;
}

function resolveOrigin(request, env) {
  const origin = String(request.headers.get('Origin') || '').trim().replace(/\/+$/, '');
  if (!origin) return '';
  const low = origin.toLowerCase();
  if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(low)) return origin;
  if (allowedOrigins(env).includes(low)) return origin;
  return '';
}

function authCorsHeaders(request, env, contentType = 'application/json; charset=utf-8') {
  const origin = resolveOrigin(request, env);
  const headers = {
    'Content-Type': contentType,
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    Vary: 'Origin'
  };
  if (origin) {
    headers['Access-Control-Allow-Origin'] = origin;
    headers['Access-Control-Allow-Credentials'] = 'true';
  }
  return headers;
}

function authJson(request, env, body, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...authCorsHeaders(request, env), ...extraHeaders }
  });
}

function authRedirect(location, extraHeaders = {}) {
  return new Response(null, { status: 302, headers: { Location: location, ...extraHeaders } });
}

function frontendBase(env) {
  return String(env.FRONTEND_ORIGIN || '').trim().replace(/\/+$/, '') || 'https://digitalblueskye.netlify.app';
}

function authBase(env, request) {
  const configured = String(env.AUTH_BASE_URL || '').trim().replace(/\/+$/, '');
  if (configured) return configured;
  try { return new URL(request.url).origin; } catch (_) { return ''; }
}

// ---------------------------------------------------------------------------
// D1 : creation paresseuse des tables (idempotente) + CRUD session/utilisateur.
// La migration SQL de reference vit dans cloudflare/d1/auth-schema.sql ; ce
// bloc garantit que le Worker fonctionne meme si la migration n'a pas encore
// ete appliquee manuellement.
// ---------------------------------------------------------------------------
let schemaReady = false;
async function ensureSchema(env) {
  if (schemaReady || !env.DB) return;
  const stmts = [
    `CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, display_name TEXT,
      avatar_url TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, last_login_at TEXT)`,
    `CREATE TABLE IF NOT EXISTS user_identities (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL, provider TEXT NOT NULL,
      provider_user_id TEXT NOT NULL, email TEXT, created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL, UNIQUE(provider, provider_user_id))`,
    `CREATE TABLE IF NOT EXISTS user_sessions (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL, session_hash TEXT NOT NULL,
      created_at TEXT NOT NULL, expires_at TEXT NOT NULL, revoked_at TEXT,
      user_agent TEXT, ip_hash TEXT)`,
    `CREATE TABLE IF NOT EXISTS user_preferences (
      user_id TEXT PRIMARY KEY, tone TEXT DEFAULT 'standard',
      theme TEXT DEFAULT 'system', updated_at TEXT NOT NULL)`,
    `CREATE TABLE IF NOT EXISTS ai_usage_events (
      id TEXT PRIMARY KEY, user_id TEXT, session_id TEXT, ip_hash TEXT, model TEXT,
      prompt_chars INTEGER, response_chars INTEGER, created_at TEXT NOT NULL,
      status TEXT, error_code TEXT)`,
    `CREATE TABLE IF NOT EXISTS ai_rate_limits (
      rate_key TEXT PRIMARY KEY, window_start TEXT NOT NULL, count INTEGER NOT NULL,
      updated_at TEXT NOT NULL)`,
    `CREATE INDEX IF NOT EXISTS idx_user_sessions_hash ON user_sessions(session_hash)`,
    `CREATE INDEX IF NOT EXISTS idx_user_identities_user ON user_identities(user_id)`
  ];
  for (const sql of stmts) {
    try { await env.DB.prepare(sql).run(); } catch (error) { /* best-effort */ }
  }
  schemaReady = true;
}

async function hashIp(request) {
  const ip = request.headers.get('CF-Connecting-IP') || request.headers.get('X-Forwarded-For') || '';
  if (!ip) return null;
  return (await sha256Hex(ip)).slice(0, 32);
}

async function upsertUserAndIdentity(env, profile) {
  const email = String(profile.email || '').trim().toLowerCase();
  const now = nowIso();

  // Identite existante ?
  const identity = await env.DB
    .prepare('SELECT user_id FROM user_identities WHERE provider = ? AND provider_user_id = ?')
    .bind(profile.provider, String(profile.providerUserId))
    .first();

  let userId = identity?.user_id || null;

  if (!userId && email) {
    const existing = await env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(email).first();
    if (existing?.id) userId = existing.id;
  }

  if (!userId) {
    userId = `usr_${randomToken(12)}`;
    await env.DB
      .prepare('INSERT INTO users (id, email, display_name, avatar_url, created_at, updated_at, last_login_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .bind(userId, email, profile.displayName || '', profile.avatarUrl || '', now, now, now)
      .run();
    await env.DB
      .prepare('INSERT OR IGNORE INTO user_preferences (user_id, tone, theme, updated_at) VALUES (?, ?, ?, ?)')
      .bind(userId, 'standard', 'system', now)
      .run();
  } else {
    await env.DB
      .prepare('UPDATE users SET display_name = COALESCE(NULLIF(display_name, \'\'), ?), avatar_url = COALESCE(NULLIF(?, \'\'), avatar_url), updated_at = ?, last_login_at = ? WHERE id = ?')
      .bind(profile.displayName || '', profile.avatarUrl || '', now, now, userId)
      .run();
  }

  await env.DB
    .prepare('INSERT INTO user_identities (id, user_id, provider, provider_user_id, email, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(provider, provider_user_id) DO UPDATE SET email = excluded.email, updated_at = excluded.updated_at')
    .bind(`idn_${randomToken(10)}`, userId, profile.provider, String(profile.providerUserId), email, now, now)
    .run();

  return userId;
}

async function createSession(env, request, userId) {
  const token = randomToken(32);
  const sessionHash = await sha256Hex(token);
  const id = `ses_${randomToken(12)}`;
  const now = Date.now();
  await env.DB
    .prepare('INSERT INTO user_sessions (id, user_id, session_hash, created_at, expires_at, revoked_at, user_agent, ip_hash) VALUES (?, ?, ?, ?, ?, NULL, ?, ?)')
    .bind(
      id,
      userId,
      sessionHash,
      new Date(now).toISOString(),
      new Date(now + SESSION_TTL_MS).toISOString(),
      String(request.headers.get('User-Agent') || '').slice(0, 255),
      await hashIp(request)
    )
    .run();
  return { token, id };
}

async function getSessionUser(env, request) {
  if (!env.DB) return null;
  const token = parseCookies(request)[SESSION_COOKIE];
  if (!token) return null;
  const sessionHash = await sha256Hex(token);
  const row = await env.DB
    .prepare(`SELECT s.id AS session_id, s.expires_at, s.revoked_at, u.id, u.email, u.display_name, u.avatar_url,
                     p.tone, p.theme,
                     (SELECT provider FROM user_identities WHERE user_id = u.id ORDER BY updated_at DESC LIMIT 1) AS provider
              FROM user_sessions s JOIN users u ON u.id = s.user_id
              LEFT JOIN user_preferences p ON p.user_id = u.id
              WHERE s.session_hash = ?`)
    .bind(sessionHash)
    .first();
  if (!row) return null;
  if (row.revoked_at) return null;
  if (Date.parse(row.expires_at) <= Date.now()) return null;
  return {
    sessionId: row.session_id,
    id: row.id,
    email: row.email,
    displayName: row.display_name || '',
    avatarUrl: row.avatar_url || '',
    provider: row.provider || '',
    preference: { tone: row.tone || 'standard', theme: row.theme || 'system' }
  };
}

async function revokeSession(env, request) {
  const token = parseCookies(request)[SESSION_COOKIE];
  if (!token || !env.DB) return;
  const sessionHash = await sha256Hex(token);
  await env.DB
    .prepare('UPDATE user_sessions SET revoked_at = ? WHERE session_hash = ? AND revoked_at IS NULL')
    .bind(nowIso(), sessionHash)
    .run();
}

// ---------------------------------------------------------------------------
// OAuth : login (redirection) + callback (echange + session).
// ---------------------------------------------------------------------------
async function handleLogin(request, env, provider) {
  if (!PROVIDERS[provider]) return authJson(request, env, { ok: false, error: 'unknown_provider' }, 404);
  if (!providerConfigured(env, provider)) {
    return authJson(request, env, { ok: false, error: 'provider_not_configured', message: `Le fournisseur ${provider} n'est pas encore configuré côté serveur.` }, 503);
  }
  if (!isSet(env.AUTH_SESSION_SECRET)) {
    return authJson(request, env, { ok: false, error: 'auth_not_configured', message: 'AUTH_SESSION_SECRET manquant.' }, 503);
  }

  const meta = PROVIDERS[provider];
  const state = randomToken(16);
  const codeVerifier = meta.usesPkce ? randomToken(32) : '';
  const redirectUri = `${authBase(env, request)}/auth/callback/${provider}`;

  const params = new URLSearchParams({
    client_id: env[meta.idEnv],
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: meta.scopes,
    state
  });
  if (provider === 'google') params.set('access_type', 'online');
  if (meta.usesPkce) {
    params.set('code_challenge', await pkceChallenge(codeVerifier));
    params.set('code_challenge_method', 'S256');
  }

  const cookiePayload = await signPayload(env.AUTH_SESSION_SECRET, { provider, state, codeVerifier, ts: Date.now() });
  const setCookie = buildCookie(OAUTH_COOKIE, cookiePayload, request, env, Math.floor(OAUTH_STATE_TTL_MS / 1000));

  return authRedirect(`${meta.authorizeUrl}?${params.toString()}`, { 'Set-Cookie': setCookie });
}

async function handleCallback(request, env, provider, url) {
  const fail = (reason) => authRedirect(`${frontendBase(env)}/profile.html?auth=error&reason=${encodeURIComponent(reason)}`, {
    'Set-Cookie': clearCookie(OAUTH_COOKIE, request, env)
  });

  if (!PROVIDERS[provider]) return fail('unknown_provider');
  if (!providerConfigured(env, provider) || !isSet(env.AUTH_SESSION_SECRET)) return fail('not_configured');

  const code = url.searchParams.get('code');
  const stateParam = url.searchParams.get('state');
  if (!code || !stateParam) return fail('missing_code');

  const cookieToken = parseCookies(request)[OAUTH_COOKIE];
  const payload = await verifyPayload(env.AUTH_SESSION_SECRET, cookieToken);
  if (!payload || payload.provider !== provider) return fail('bad_state');
  if (payload.state !== stateParam) return fail('state_mismatch');
  if (Date.now() - Number(payload.ts || 0) > OAUTH_STATE_TTL_MS) return fail('state_expired');

  const meta = PROVIDERS[provider];
  const redirectUri = `${authBase(env, request)}/auth/callback/${provider}`;

  let accessToken;
  try {
    accessToken = await exchangeCode(env, meta, provider, code, redirectUri, payload.codeVerifier);
  } catch (error) {
    return fail('token_exchange_failed');
  }
  if (!accessToken) return fail('no_access_token');

  let profile;
  try {
    profile = await fetchProfile(meta, provider, accessToken);
  } catch (error) {
    return fail('profile_fetch_failed');
  }
  if (!profile?.email) return fail('no_email');

  await ensureSchema(env);
  const userId = await upsertUserAndIdentity(env, profile);
  const { token } = await createSession(env, request, userId);

  const headers = new Headers();
  headers.append('Set-Cookie', buildCookie(SESSION_COOKIE, token, request, env, Math.floor(SESSION_TTL_MS / 1000)));
  headers.append('Set-Cookie', clearCookie(OAUTH_COOKIE, request, env));
  headers.set('Location', `${frontendBase(env)}/profile.html?auth=success`);
  return new Response(null, { status: 302, headers });
}

async function exchangeCode(env, meta, provider, code, redirectUri, codeVerifier) {
  const body = new URLSearchParams({
    client_id: env[meta.idEnv],
    client_secret: env[meta.secretEnv],
    code,
    redirect_uri: redirectUri,
    grant_type: 'authorization_code'
  });
  if (meta.usesPkce && codeVerifier) body.set('code_verifier', codeVerifier);

  const response = await fetch(meta.tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: body.toString()
  });
  const data = await response.json().catch(() => ({}));
  return data.access_token || null;
}

async function fetchProfile(meta, provider, accessToken) {
  const authHeaders = {
    Authorization: `Bearer ${accessToken}`,
    Accept: 'application/json',
    'User-Agent': 'digitalblueskye-auth'
  };
  const res = await fetch(meta.userInfoUrl, { headers: authHeaders });
  const info = await res.json().catch(() => ({}));

  if (provider === 'google') {
    return {
      provider,
      providerUserId: info.sub,
      email: String(info.email || '').toLowerCase(),
      displayName: info.name || '',
      avatarUrl: info.picture || ''
    };
  }
  if (provider === 'github') {
    let email = info.email;
    if (!email && meta.emailsUrl) {
      const emailsRes = await fetch(meta.emailsUrl, { headers: authHeaders });
      const emails = await emailsRes.json().catch(() => []);
      const primary = Array.isArray(emails) ? emails.find((e) => e.primary && e.verified) || emails.find((e) => e.verified) : null;
      email = primary?.email || '';
    }
    return {
      provider,
      providerUserId: info.id,
      email: String(email || '').toLowerCase(),
      displayName: info.name || info.login || '',
      avatarUrl: info.avatar_url || ''
    };
  }
  // facebook
  return {
    provider,
    providerUserId: info.id,
    email: String(info.email || '').toLowerCase(),
    displayName: info.name || '',
    avatarUrl: info.picture?.data?.url || ''
  };
}

// ---------------------------------------------------------------------------
// /auth/me, /auth/logout, /auth/profile.
// ---------------------------------------------------------------------------
async function handleMe(request, env) {
  await ensureSchema(env);
  const user = await getSessionUser(env, request);
  if (!user) return authJson(request, env, { ok: true, authenticated: false });
  return authJson(request, env, {
    ok: true,
    authenticated: true,
    user: {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      avatarUrl: user.avatarUrl,
      provider: user.provider,
      preference: user.preference
    }
  });
}

async function handleLogout(request, env) {
  await revokeSession(env, request);
  return authJson(request, env, { ok: true }, 200, { 'Set-Cookie': clearCookie(SESSION_COOKIE, request, env) });
}

async function handleProfilePatch(request, env) {
  await ensureSchema(env);
  const user = await getSessionUser(env, request);
  if (!user) return authJson(request, env, { ok: false, error: 'AUTH_REQUIRED' }, 401);

  let body = {};
  try { body = await request.json(); } catch (_) { body = {}; }

  const now = nowIso();
  if (typeof body.displayName === 'string') {
    await env.DB.prepare('UPDATE users SET display_name = ?, updated_at = ? WHERE id = ?')
      .bind(body.displayName.trim().slice(0, 120), now, user.id).run();
  }
  const tone = typeof body?.preference?.tone === 'string' ? body.preference.tone.slice(0, 40) : user.preference.tone;
  const theme = typeof body?.preference?.theme === 'string' ? body.preference.theme.slice(0, 40) : user.preference.theme;
  await env.DB.prepare('INSERT INTO user_preferences (user_id, tone, theme, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET tone = excluded.tone, theme = excluded.theme, updated_at = excluded.updated_at')
    .bind(user.id, tone, theme, now).run();

  const fresh = await getSessionUser(env, request);
  return authJson(request, env, { ok: true, user: fresh && { id: fresh.id, email: fresh.email, displayName: fresh.displayName, avatarUrl: fresh.avatarUrl, provider: fresh.provider, preference: fresh.preference } });
}

// ---------------------------------------------------------------------------
// Rate limiting fixe par fenetre horaire (D1). Best-effort : toute erreur D1
// laisse passer la requete (fail-open) pour ne pas bloquer le service.
// ---------------------------------------------------------------------------
async function checkRateLimit(env, key, limit) {
  if (!env.DB || limit <= 0) return { allowed: true };
  const windowStart = new Date(Math.floor(Date.now() / 3600000) * 3600000).toISOString();
  try {
    const row = await env.DB.prepare('SELECT window_start, count FROM ai_rate_limits WHERE rate_key = ?').bind(key).first();
    if (!row || row.window_start !== windowStart) {
      await env.DB.prepare('INSERT INTO ai_rate_limits (rate_key, window_start, count, updated_at) VALUES (?, ?, 1, ?) ON CONFLICT(rate_key) DO UPDATE SET window_start = excluded.window_start, count = 1, updated_at = excluded.updated_at')
        .bind(key, windowStart, nowIso()).run();
      return { allowed: true };
    }
    if (row.count >= limit) return { allowed: false };
    await env.DB.prepare('UPDATE ai_rate_limits SET count = count + 1, updated_at = ? WHERE rate_key = ?')
      .bind(nowIso(), key).run();
    return { allowed: true };
  } catch (error) {
    return { allowed: true };
  }
}

async function logUsage(env, fields) {
  if (!env.DB) return;
  try {
    await env.DB.prepare('INSERT INTO ai_usage_events (id, user_id, session_id, ip_hash, model, prompt_chars, response_chars, created_at, status, error_code) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(`aue_${randomToken(10)}`, fields.userId || null, fields.sessionId || null, fields.ipHash || null, fields.model || null, fields.promptChars || 0, fields.responseChars || 0, nowIso(), fields.status || 'ok', fields.errorCode || null)
      .run();
  } catch (error) { /* best-effort */ }
}

// ---------------------------------------------------------------------------
// Proxy IA protege : POST /ai/chat. Verifie la session, applique le rate limit,
// journalise, puis relaie vers AI_WORKER via service binding. Le userId est
// injecte cote serveur ; payload.user recu du front est ignore.
// ---------------------------------------------------------------------------
export async function handleAiChat(request, env) {
  if (request.method !== 'POST') {
    return authJson(request, env, { ok: false, error: 'method_not_allowed' }, 405);
  }
  await ensureSchema(env);
  const user = await getSessionUser(env, request);
  const ipHash = await hashIp(request);

  if (!user) {
    // Rate limit des tentatives anonymes pour limiter l'abus avant login.
    const anon = await checkRateLimit(env, `ip:${ipHash || 'unknown'}`, Number(env.AI_RATE_LIMIT_IP || 10));
    if (!anon.allowed) {
      return authJson(request, env, { ok: false, error: 'RATE_LIMITED', message: 'Limite temporaire atteinte. Réessayez plus tard.' }, 429);
    }
    return authJson(request, env, { ok: false, error: 'AUTH_REQUIRED', message: 'Connexion requise pour utiliser l’assistant IA.' }, 401);
  }

  const userLimit = await checkRateLimit(env, `user:${user.id}`, Number(env.AI_RATE_LIMIT_USER || 50));
  if (!userLimit.allowed) {
    return authJson(request, env, { ok: false, error: 'RATE_LIMITED', message: 'Limite temporaire atteinte. Réessayez plus tard.' }, 429);
  }

  if (!env.AI_WORKER) {
    return authJson(request, env, { ok: false, error: 'ai_unavailable', message: 'Service IA indisponible.' }, 502);
  }

  let payload = {};
  try { payload = await request.json(); } catch (_) { payload = {}; }
  // On ne fait jamais confiance au user envoye par le front : on le remplace
  // par l'identite verifiee cote serveur.
  payload.user = { userId: user.id, email: user.email, verified: true };

  const promptChars = JSON.stringify(payload.messages || payload.message || '').length;

  let aiResponse;
  try {
    aiResponse = await env.AI_WORKER.fetch(new Request('https://ai-worker/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }));
  } catch (error) {
    await logUsage(env, { userId: user.id, sessionId: user.sessionId, ipHash, status: 'error', errorCode: 'ai_fetch_failed', promptChars });
    return authJson(request, env, { ok: false, error: 'ai_fetch_failed', message: 'Service IA indisponible.' }, 502);
  }

  const text = await aiResponse.text();
  await logUsage(env, {
    userId: user.id,
    sessionId: user.sessionId,
    ipHash,
    model: (() => { try { return JSON.parse(text)?.resolved_model || JSON.parse(text)?.model || null; } catch (_) { return null; } })(),
    promptChars,
    responseChars: text.length,
    status: aiResponse.ok ? 'ok' : 'error',
    errorCode: aiResponse.ok ? null : `http_${aiResponse.status}`
  });

  return new Response(text, {
    status: aiResponse.status,
    headers: { ...authCorsHeaders(request, env), 'Content-Type': aiResponse.headers.get('Content-Type') || 'application/json; charset=utf-8' }
  });
}

// ---------------------------------------------------------------------------
// Routeur principal. Retourne une Response ou null si le chemin n'est pas gere.
// ---------------------------------------------------------------------------
export async function handleAuthRoutes(request, env, url) {
  const { pathname } = url;
  if (!pathname.startsWith('/auth/')) return null;

  if (pathname === '/auth/providers') {
    return authJson(request, env, {
      ok: true,
      providers: {
        google: providerConfigured(env, 'google'),
        github: providerConfigured(env, 'github'),
        facebook: providerConfigured(env, 'facebook')
      }
    });
  }

  const loginMatch = pathname.match(/^\/auth\/login\/([a-z]+)$/);
  if (loginMatch && request.method === 'GET') return handleLogin(request, env, loginMatch[1]);

  const cbMatch = pathname.match(/^\/auth\/callback\/([a-z]+)$/);
  if (cbMatch && request.method === 'GET') return handleCallback(request, env, cbMatch[1], url);

  if (pathname === '/auth/me' && request.method === 'GET') return handleMe(request, env);
  if (pathname === '/auth/logout' && request.method === 'POST') return handleLogout(request, env);
  if (pathname === '/auth/profile' && request.method === 'PATCH') return handleProfilePatch(request, env);

  return authJson(request, env, { ok: false, error: 'not_found' }, 404);
}

// Reponse OPTIONS dediee (credentials) pour les routes auth/ai.
export function authOptionsResponse(request, env) {
  return new Response(null, { status: 204, headers: authCorsHeaders(request, env) });
}

export function isAuthOrAiPath(pathname) {
  return pathname.startsWith('/auth/') || pathname === '/ai/chat';
}
