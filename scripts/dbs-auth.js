/*
 * Couche d'authentification front pour l'assistant IA — Digital Blue Skye.
 *
 * SOURCE DE VERITE = le serveur (GET /auth/me sur le Worker API). localStorage
 * ne sert plus QUE de cache UX leger (dernier nom affiche, preference, dernier
 * provider) : il n'est jamais une preuve de session. Toute decision sensible
 * (ouvrir le chat, afficher le profil) depend de /auth/me.
 *
 * Fournisseurs OAuth : Google, GitHub, Facebook (redirection vers le Worker
 * API qui detient les client_secret). Aucune donnee OAuth sensible n'est
 * stockee cote navigateur.
 *
 * Fallback developpement : une "connexion locale de test" reste disponible
 * UNIQUEMENT sur localhost/127.0.0.1, pour continuer a travailler sans OAuth
 * configure. Elle n'a aucune valeur cote serveur.
 *
 * Details securite serveur : docs/CHATBOT_AUTH_SECURITY.md.
 */
(function () {
  'use strict';

  const API_BASE = (String(window.DBS_API_BASE || '').trim().replace(/\/+$/, '')) ||
    'https://digitalblueskye-api.djelloulabid75.workers.dev';

  // Cache UX (jamais une preuve).
  const CACHE_KEY = 'dbs_user_cache';
  const DEV_SESSION_KEY = 'dbs_dev_session';

  const AVATAR_FALLBACK = '/assets/images/portrait/my-notion-face-transparent.png';

  const isEnglish = () => (document.documentElement.lang || '').toLowerCase().startsWith('en');
  const isLocalhost = () => /^(localhost|127\.0\.0\.1)$/.test(window.location.hostname);

  // Etat en memoire, hydrate par refreshSession().
  let state = { authenticated: false, user: null, providers: null, loaded: false };

  function readCache() {
    try { return JSON.parse(localStorage.getItem(CACHE_KEY) || 'null'); } catch (_) { return null; }
  }
  function writeCache(user) {
    try {
      if (!user) { localStorage.removeItem(CACHE_KEY); return; }
      localStorage.setItem(CACHE_KEY, JSON.stringify({
        displayName: user.displayName || '',
        avatarUrl: user.avatarUrl || '',
        provider: user.provider || '',
        preference: user.preference || { tone: 'standard', theme: 'system' }
      }));
    } catch (_) { /* no-op */ }
  }

  // --- Fallback dev (localhost uniquement) ---------------------------------
  function getDevSession() {
    if (!isLocalhost()) return null;
    try { return JSON.parse(localStorage.getItem(DEV_SESSION_KEY) || 'null'); } catch (_) { return null; }
  }
  function devLogin(email) {
    const normalized = String(email || '').trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) return { ok: false };
    const user = {
      id: `dev_${normalized}`, email: normalized, displayName: normalized.split('@')[0],
      avatarUrl: '', provider: 'local-dev', preference: { tone: 'standard', theme: 'system' }
    };
    try { localStorage.setItem(DEV_SESSION_KEY, JSON.stringify(user)); } catch (_) { /* no-op */ }
    state = { ...state, authenticated: true, user };
    writeCache(user);
    dispatchChanged();
    return { ok: true };
  }
  function devLogout() {
    try { localStorage.removeItem(DEV_SESSION_KEY); } catch (_) { /* no-op */ }
  }

  function dispatchChanged() {
    document.dispatchEvent(new CustomEvent('dbs-auth-changed', {
      detail: { authenticated: state.authenticated }
    }));
  }

  // --- Source de verite serveur --------------------------------------------
  async function refreshSession() {
    // Fallback dev prioritaire uniquement en localhost si une dev-session existe.
    const dev = getDevSession();
    if (dev) {
      state = { ...state, authenticated: true, user: dev, loaded: true };
      writeCache(dev);
      dispatchChanged();
      return true;
    }
    try {
      const res = await fetch(`${API_BASE}/auth/me`, { credentials: 'include' });
      const data = await res.json().catch(() => ({}));
      if (data?.ok && data.authenticated && data.user) {
        state = { ...state, authenticated: true, user: data.user, loaded: true };
        writeCache(data.user);
      } else {
        state = { ...state, authenticated: false, user: null, loaded: true };
        writeCache(null);
      }
    } catch (_) {
      // Reseau/Worker indisponible : on considere non authentifie, sans planter.
      state = { ...state, authenticated: false, user: null, loaded: true };
    }
    dispatchChanged();
    return state.authenticated;
  }

  async function fetchProviders() {
    if (state.providers) return state.providers;
    try {
      const res = await fetch(`${API_BASE}/auth/providers`, { credentials: 'include' });
      const data = await res.json().catch(() => ({}));
      state.providers = data?.providers || { google: false, github: false, facebook: false };
    } catch (_) {
      state.providers = { google: false, github: false, facebook: false };
    }
    return state.providers;
  }

  function isAuthenticated() { return state.authenticated; }
  function getCachedUser() { return state.user || readCache(); }

  function loginWithProvider(provider) {
    window.location.href = `${API_BASE}/auth/login/${encodeURIComponent(provider)}`;
  }

  async function logout() {
    devLogout();
    try { await fetch(`${API_BASE}/auth/logout`, { method: 'POST', credentials: 'include' }); } catch (_) { /* no-op */ }
    state = { ...state, authenticated: false, user: null };
    writeCache(null);
    closeAssistantPanelIfOpen();
    dispatchChanged();
  }

  async function updateProfile(patch) {
    // Dev session : maj purement locale.
    if (getDevSession()) {
      const user = { ...getDevSession(), ...patch, preference: { ...(getDevSession().preference || {}), ...(patch.preference || {}) } };
      try { localStorage.setItem(DEV_SESSION_KEY, JSON.stringify(user)); } catch (_) { /* no-op */ }
      state = { ...state, user };
      writeCache(user);
      dispatchChanged();
      return { ok: true, user };
    }
    try {
      const res = await fetch(`${API_BASE}/auth/profile`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch)
      });
      const data = await res.json().catch(() => ({}));
      if (data?.ok && data.user) {
        state = { ...state, user: data.user };
        writeCache(data.user);
        dispatchChanged();
      }
      return data;
    } catch (_) {
      return { ok: false, error: 'network_error' };
    }
  }

  function closeAssistantPanelIfOpen() {
    const panel = document.getElementById('ai-assistant-panel');
    if (panel && panel.classList.contains('is-open')) {
      document.getElementById('ai-assistant-close')?.click();
    }
  }

  // Gate d'ouverture du chat : renvoie true si autorise, sinon ouvre la modale.
  function requireAuthBeforeChat() {
    if (isAuthenticated()) return true;
    openAuthModal();
    return false;
  }

  // ---------------------------------------------------------------------
  // Modale de connexion OAuth (.dbs-auth-modal / .dbs-auth-panel).
  // ---------------------------------------------------------------------
  let lastFocusedBeforeModal = null;

  const PROVIDER_META = {
    google: { label: 'Google', icon: '/assets/images/ui/icons8-google-50.png', cls: 'is-google' },
    github: { label: 'GitHub', icon: '/assets/images/ui/icons8-github-96.png', cls: 'is-github' },
    facebook: { label: 'Facebook', icon: '/assets/images/ui/icons8-facebook-64.png', cls: 'is-facebook' }
  };

  async function ensureAuthModal() {
    if (document.getElementById('dbs-auth-modal')) return;
    const en = isEnglish();
    const providers = await fetchProviders();

    const wrap = document.createElement('div');
    wrap.id = 'dbs-auth-modal';
    wrap.className = 'dbs-auth-modal';
    wrap.setAttribute('aria-hidden', 'true');
    wrap.hidden = true;

    const providerButtons = Object.keys(PROVIDER_META).map((key) => {
      const meta = PROVIDER_META[key];
      const enabled = Boolean(providers[key]);
      const cont = en ? 'Continue with' : 'Continuer avec';
      return `<button type="button" class="dbs-oauth-btn ${meta.cls}" data-dbs-provider="${key}" ${enabled ? '' : 'disabled'}
        aria-label="${cont} ${meta.label}">
        <span class="dbs-oauth-icon" aria-hidden="true"><img src="${meta.icon}" alt=""></span>
        <span>${cont} ${meta.label}</span>
      </button>`;
    }).join('');

    const anyEnabled = Object.values(providers).some(Boolean);
    const notConfiguredNote = anyEnabled ? '' :
      `<p class="dbs-auth-note">${en ? 'OAuth providers are not configured on the server yet.' : "Les fournisseurs OAuth ne sont pas encore configurés côté serveur."}</p>`;

    // Fallback dev : uniquement en localhost.
    const devFallback = isLocalhost() ? `
      <div class="dbs-auth-sep"><span>${en ? 'or' : 'ou'}</span></div>
      <form class="dbs-auth-form" data-dbs-dev-form novalidate>
        <label class="dbs-auth-label" for="dbs-auth-email">${en ? 'Local test sign-in (dev)' : 'Connexion locale de test (dev)'}</label>
        <input id="dbs-auth-email" class="dbs-auth-input" type="email" autocomplete="email"
          placeholder="${en ? 'you@example.com' : 'vous@exemple.com'}" aria-label="${en ? 'Email address' : 'Adresse email'}" />
        <p class="dbs-auth-error" data-dbs-auth-error role="alert" hidden></p>
        <button type="submit" class="dbs-auth-submit">${en ? 'Local sign-in' : 'Connexion locale'}</button>
      </form>` : '';

    wrap.innerHTML = `
      <div class="dbs-auth-modal-backdrop" data-dbs-auth-close></div>
      <div class="dbs-auth-panel" role="dialog" aria-modal="true" aria-labelledby="dbs-auth-title">
        <button type="button" class="dbs-auth-panel-close" data-dbs-auth-close aria-label="${en ? 'Close' : 'Fermer'}">&times;</button>
        <h2 id="dbs-auth-title" class="dbs-auth-panel-title">${en ? 'Sign in to Digital Blue Skye AI' : 'Connexion à Digital Blue Skye AI'}</h2>
        <p class="dbs-auth-panel-desc">${en
          ? 'Sign in to use the AI assistant, keep your profile and secure your conversations.'
          : "Connectez-vous pour utiliser l'assistant IA, retrouver votre profil et sécuriser vos échanges."}</p>
        <div class="dbs-oauth-list">${providerButtons}</div>
        ${notConfiguredNote}
        ${devFallback}
      </div>`;
    document.body.appendChild(wrap);

    wrap.addEventListener('click', (event) => {
      if (event.target.closest('[data-dbs-auth-close]')) { closeAuthModal(); return; }
      const providerBtn = event.target.closest('[data-dbs-provider]');
      if (providerBtn && !providerBtn.disabled) loginWithProvider(providerBtn.dataset.dbsProvider);
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && !wrap.hidden) closeAuthModal();
    });

    const devForm = wrap.querySelector('[data-dbs-dev-form]');
    if (devForm) {
      const input = devForm.querySelector('#dbs-auth-email');
      const errorEl = devForm.querySelector('[data-dbs-auth-error]');
      input.addEventListener('input', () => {
        if (!errorEl.hidden) { errorEl.hidden = true; input.classList.remove('is-invalid'); }
      });
      devForm.addEventListener('submit', (event) => {
        event.preventDefault();
        const result = devLogin(input.value);
        if (!result.ok) {
          errorEl.hidden = false;
          errorEl.textContent = en ? 'Please enter a valid email address.' : 'Merci de saisir une adresse email valide.';
          input.classList.add('is-invalid');
          input.focus();
          return;
        }
        closeAuthModal();
        syncAuthUI();
        document.getElementById('ai-assistant-launcher')?.click();
      });
    }
  }

  async function openAuthModal() {
    await ensureAuthModal();
    const modal = document.getElementById('dbs-auth-modal');
    if (!modal) return;
    lastFocusedBeforeModal = document.activeElement;
    modal.hidden = false;
    modal.setAttribute('aria-hidden', 'false');
    void modal.offsetWidth;
    modal.classList.add('is-open');
    setTimeout(() => {
      (modal.querySelector('.dbs-oauth-btn:not([disabled])') || modal.querySelector('#dbs-auth-email') || modal.querySelector('[data-dbs-auth-close]'))?.focus();
    }, 60);
  }

  function closeAuthModal() {
    const modal = document.getElementById('dbs-auth-modal');
    if (!modal) return;
    modal.classList.remove('is-open');
    modal.setAttribute('aria-hidden', 'true');
    setTimeout(() => { modal.hidden = true; }, 160);
    if (lastFocusedBeforeModal instanceof HTMLElement) lastFocusedBeforeModal.focus();
  }

  // ---------------------------------------------------------------------
  // Avatar unique du profil dans le rail gauche.
  // ---------------------------------------------------------------------
  function avatarLabel(user) {
    const en = isEnglish();
    const who = (user?.displayName || user?.email || '').trim();
    if (!who) return en ? 'Open my profile' : 'Ouvrir mon profil';
    return en ? `Open my profile (${who})` : `Ouvrir mon profil (${who})`;
  }

  function avatarSrc(user) {
    return (user && user.avatarUrl) ? user.avatarUrl : AVATAR_FALLBACK;
  }

  function updateAvatarContent(button, user) {
    const label = avatarLabel(user);
    button.setAttribute('aria-label', label);
    button.title = label;
    const src = avatarSrc(user);
    let img = button.querySelector('img');
    if (!img) {
      button.innerHTML = `<img src="${src}" alt="" aria-hidden="true">`;
    } else if (img.getAttribute('src') !== src) {
      img.setAttribute('src', src);
    }
  }

  function renderProfileAvatar() {
    const rail = document.getElementById('ai-assistant-rail');
    if (!rail) return;
    const existing = rail.querySelector('.dbs-profile-rail-avatar');
    if (!isAuthenticated()) { existing?.remove(); return; }
    const user = getCachedUser();
    if (existing) { updateAvatarContent(existing, user); return; }
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'dbs-profile-rail-avatar';
    button.addEventListener('click', () => { window.location.href = '/profile.html'; });
    updateAvatarContent(button, user);
    (rail.querySelector('.ai-assistant-rail-group') || rail).appendChild(button);
  }

  function syncAuthUI() {
    renderProfileAvatar();
  }

  // ---------------------------------------------------------------------
  // Gate du launcher (capture, avant le handler d'ouverture d'ai-assistant.js).
  // ---------------------------------------------------------------------
  function wireLauncherGate() {
    const launcher = document.getElementById('ai-assistant-launcher');
    if (!launcher || launcher.dataset.dbsGateWired) return;
    launcher.dataset.dbsGateWired = 'true';
    launcher.addEventListener('click', (event) => {
      if (isAuthenticated()) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      openAuthModal();
    }, true);
  }

  function wireRailObserver() {
    const target = document.getElementById('ai-assistant-panel') || document.body;
    const observer = new MutationObserver(() => {
      if (document.getElementById('ai-assistant-rail')) syncAuthUI();
    });
    observer.observe(target, { childList: true, subtree: true });
  }

  document.addEventListener('dbs-auth-changed', syncAuthUI);

  function init() {
    wireLauncherGate();
    wireRailObserver();
    // Hydrate depuis le serveur ; syncAuthUI() est appele via dbs-auth-changed.
    refreshSession();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // API publique.
  const api = {
    API_BASE,
    refreshSession,
    getCachedUser,
    isAuthenticated,
    fetchProviders,
    loginWithProvider,
    logout,
    updateProfile,
    requireAuthBeforeChat,
    openAuthModal,
    closeAuthModal,
    syncDbsAuthUI: syncAuthUI,
    renderDbsProfileAvatar: renderProfileAvatar
  };
  window.DBSAuth = api;
  window.DBS_AUTH = api; // alias retro-compatible
})();
