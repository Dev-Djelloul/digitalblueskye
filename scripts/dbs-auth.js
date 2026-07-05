/*
 * Couche d'authentification front pour l'assistant IA — Digital Blue Skye.
 *
 * SOURCE DE VERITE = le serveur (GET /auth/me sur le Worker API). localStorage
 * ne sert plus QUE de cache UX leger (dernier nom affiche, preference, dernier
 * provider) : il n'est jamais une preuve de session. Toute decision sensible
 * (ouvrir le chat, afficher le profil) depend de /auth/me.
 *
 * Fournisseurs OAuth : Google, GitHub (redirection vers le Worker API qui
 * detient les client_secret). Aucune donnee OAuth sensible n'est stockee
 * cote navigateur.
 *
 * Connexion par email (magic link) : disponible pour tous les utilisateurs,
 * pas seulement OAuth. Le Worker envoie un lien de connexion a usage unique ;
 * aucun mot de passe n'est jamais stocke ou transite cote front.
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
  const PROFILE_PREFS_KEY = 'dbs_profile_preferences_cache';
  const LEGACY_SESSION_KEYS = ['dbs_user_session', 'dbs_user_profile'];

  const DEFAULT_ASSISTANT_PREFERENCES = Object.freeze({
    schemaVersion: 1,
    projectStyle: 'digital_project_manager',
    favoriteFormat: 'action_plan',
    detailLevel: 'balanced',
    preferredLanguage: 'fr',
    tone: 'standard',
    companion: 'skye',
    updatedAt: ''
  });

  const PREFERENCE_OPTIONS = Object.freeze({
    projectStyle: ['general', 'digital_project_manager', 'technical', 'product_strategy', 'marketing_content', 'watch_benchmark', 'portfolio_career'],
    favoriteFormat: ['text', 'table', 'checklist', 'action_plan', 'roadmap', 'synthesis', 'html_deliverable'],
    detailLevel: ['concise', 'balanced', 'detailed', 'expert'],
    preferredLanguage: ['fr', 'en', 'bilingual'],
    tone: ['standard', 'pedagogical', 'direct', 'expert', 'creative', 'strategic'],
    companion: ['skye', 'pilot', 'builder', 'scout', 'muse', 'guardian']
  });

  const AVATAR_FALLBACK = '/assets/images/portrait/my-notion-face-transparent.png';
  // Override avatar local (photo uploadee depuis profile.html) : jamais envoye
  // au serveur, juste un rendu front tant qu'aucun endpoint d'upload n'existe.
  const AVATAR_OVERRIDE_KEY = 'dbs_profile_avatar_override';

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

  function sanitizeAssistantPreferences(input = {}) {
    const fromSource = input && typeof input === 'object' ? input : {};
    const clean = { ...DEFAULT_ASSISTANT_PREFERENCES };
    Object.keys(PREFERENCE_OPTIONS).forEach((key) => {
      const value = String(fromSource[key] || '').trim();
      if (PREFERENCE_OPTIONS[key].includes(value)) clean[key] = value;
    });
    clean.schemaVersion = 1;
    clean.updatedAt = typeof fromSource.updatedAt === 'string' ? fromSource.updatedAt : '';
    return clean;
  }

  function readAssistantPreferenceCache() {
    try { return JSON.parse(localStorage.getItem(PROFILE_PREFS_KEY) || 'null'); } catch (_) { return null; }
  }

  // Preferences de personnalisation uniquement (jamais de securite). Ne
  // doivent jamais bloquer l'envoi d'un message si absentes ou corrompues.
  function getAssistantPreferences() {
    try {
      const userPreference = getCachedUser()?.preference || {};
      const cached = readAssistantPreferenceCache() || {};
      return sanitizeAssistantPreferences({ ...DEFAULT_ASSISTANT_PREFERENCES, ...userPreference, ...cached });
    } catch (_) {
      return { ...DEFAULT_ASSISTANT_PREFERENCES };
    }
  }

  async function saveAssistantPreferences(preferences = {}) {
    const next = sanitizeAssistantPreferences({
      ...getAssistantPreferences(),
      ...preferences,
      updatedAt: new Date().toISOString()
    });
    try { localStorage.setItem(PROFILE_PREFS_KEY, JSON.stringify(next)); } catch (_) { /* no-op */ }

    // TODO(profile V2) : migrer ces preferences vers user_preferences en D1.
    // Le backend actuel ne persiste que tone/theme ; le reste reste en cache
    // navigateur pour cette V1 front, sans jamais faire echouer la sauvegarde.
    let backend = null;
    try { backend = await updateProfile({ preference: { tone: next.tone } }); } catch (_) { /* no-op */ }
    dispatchChanged();
    return { ok: backend?.ok !== false, preferences: next, backend };
  }

  function clearLocalProfileData() {
    try {
      localStorage.removeItem(PROFILE_PREFS_KEY);
      LEGACY_SESSION_KEYS.forEach((key) => localStorage.removeItem(key));
    } catch (_) { /* no-op */ }
    dispatchChanged();
    return { ok: true, preferences: getAssistantPreferences() };
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
      state.providers = data?.providers || { google: false, github: false };
    } catch (_) {
      state.providers = { google: false, github: false };
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
    github: { label: 'GitHub', icon: '/assets/images/ui/icons8-github-96.png', cls: 'is-github' }
  };

  async function requestEmailLogin(email) {
    try {
      const res = await fetch(`${API_BASE}/auth/email/request`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      });
      const data = await res.json().catch(() => ({}));
      return { ok: data?.ok !== false };
    } catch (_) {
      return { ok: false, error: 'network_error' };
    }
  }

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
      const unavailable = en ? `${meta.label} unavailable` : `${meta.label} bientôt disponible`;
      return `<button type="button" class="dbs-oauth-btn ${meta.cls}" data-dbs-provider="${key}" ${enabled ? '' : 'disabled'}
        aria-label="${enabled ? `${cont} ${meta.label}` : unavailable}">
        <span class="dbs-oauth-icon" aria-hidden="true"><img src="${meta.icon}" alt=""></span>
        <span>${enabled ? `${cont} ${meta.label}` : unavailable}</span>
      </button>`;
    }).join('');

    const anyEnabled = Object.values(providers).some(Boolean);
    const notConfiguredNote = anyEnabled ? '' :
      `<p class="dbs-auth-note">${en ? 'OAuth providers are not configured on the server yet.' : "Les fournisseurs OAuth ne sont pas encore configurés côté serveur."}</p>`;

    // Connexion par email (magic link), ouverte a tous les utilisateurs.
    const emailLoginBlock = `
      <div class="dbs-auth-sep"><span>${en ? 'or' : 'ou'}</span></div>
      <form class="dbs-auth-form" data-dbs-email-form novalidate>
        <label class="dbs-auth-label" for="dbs-auth-magic-email">${en ? 'Sign in with email' : 'Se connecter par email'}</label>
        <input id="dbs-auth-magic-email" class="dbs-auth-input" type="email" autocomplete="email"
          placeholder="${en ? 'you@example.com' : 'vous@exemple.com'}" aria-label="${en ? 'Email address' : 'Adresse email'}" />
        <p class="dbs-auth-error" data-dbs-email-error role="alert" hidden></p>
        <p class="dbs-auth-note" data-dbs-email-sent role="status" hidden>${en ? 'Check your inbox: we sent you a sign-in link.' : 'Vérifiez votre boîte mail : un lien de connexion vient de vous être envoyé.'}</p>
        <button type="submit" class="dbs-auth-submit" data-dbs-email-submit>${en ? 'Send sign-in link' : 'Recevoir le lien de connexion'}</button>
      </form>`;

    // Fallback dev : uniquement en localhost, en plus de l'email magic link.
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
        ${emailLoginBlock}
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

    const emailForm = wrap.querySelector('[data-dbs-email-form]');
    if (emailForm) {
      const input = emailForm.querySelector('#dbs-auth-magic-email');
      const errorEl = emailForm.querySelector('[data-dbs-email-error]');
      const sentEl = emailForm.querySelector('[data-dbs-email-sent]');
      const submitBtn = emailForm.querySelector('[data-dbs-email-submit]');
      input.addEventListener('input', () => {
        if (!errorEl.hidden) { errorEl.hidden = true; input.classList.remove('is-invalid'); }
      });
      emailForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        const email = String(input.value || '').trim();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
          errorEl.hidden = false;
          errorEl.textContent = en ? 'Please enter a valid email address.' : 'Merci de saisir une adresse email valide.';
          input.classList.add('is-invalid');
          input.focus();
          return;
        }
        submitBtn.disabled = true;
        const result = await requestEmailLogin(email);
        submitBtn.disabled = false;
        if (!result.ok) {
          errorEl.hidden = false;
          errorEl.textContent = en ? 'Something went wrong. Please try again.' : 'Une erreur est survenue. Réessayez.';
          return;
        }
        errorEl.hidden = true;
        sentEl.hidden = false;
        input.disabled = true;
        submitBtn.hidden = true;
      });
    }

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
        // Meme logique que les connexions OAuth/email : apres connexion, l'IA
        // se retrouve dans sa page dediee. Si on y est deja (chat.html),
        // l'evenement dbs-auth-changed declenche son ouverture automatique.
        if (!document.body.classList.contains('chat-page')) window.location.href = '/chat.html';
      });
    }
  }

  async function openAuthModal() {
    await ensureAuthModal();
    // ensureAuthModal() est asynchrone (fetchProviders) : si une session s'est
    // confirmee entre-temps (ex. appelant qui ouvrait la modale de facon
    // optimiste avant que /auth/me ne reponde), ne jamais rouvrir une modale
    // de connexion par-dessus un utilisateur desormais authentifie.
    if (isAuthenticated()) { closeAuthModal(); return; }
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
  // Menu compte compact ancre a l'avatar, en bas du rail gauche de
  // l'assistant. IMPORTANT anti-regression : renderProfileAvatar() ne doit
  // JAMAIS muter le DOM quand l'etat affiche est deja correct (sinon le
  // MutationObserver de wireRailObserver se re-declenche a l'infini - c'est
  // la cause du crash "page blanche" du commit b064bfe revert).
  // ---------------------------------------------------------------------
  function accountMenuLabel() {
    return isEnglish() ? 'Open account menu' : 'Ouvrir le menu du compte';
  }

  function avatarSrc(user) {
    let override = '';
    try { override = localStorage.getItem(AVATAR_OVERRIDE_KEY) || ''; } catch (_) { override = ''; }
    if (override) return override;
    return (user && user.avatarUrl) ? user.avatarUrl : AVATAR_FALLBACK;
  }

  function updateAvatarContent(button, user) {
    button.setAttribute('aria-label', accountMenuLabel());
    button.setAttribute('aria-haspopup', 'menu');
    button.setAttribute('aria-controls', 'dbs-account-popover');
    if (!button.hasAttribute('aria-expanded')) button.setAttribute('aria-expanded', 'false');
    button.title = isEnglish() ? 'User account' : 'Compte utilisateur';
    const src = avatarSrc(user);
    let img = button.querySelector('img');
    if (!img) {
      button.innerHTML = `<img src="${src}" alt="" aria-hidden="true">`;
    } else if (img.getAttribute('src') !== src) {
      img.setAttribute('src', src);
    }
  }

  function currentTheme() {
    return document.documentElement.getAttribute('data-theme') || (() => {
      try { return localStorage.getItem('theme'); } catch (_) { return null; }
    })() || 'dark';
  }

  function themeActionLabel() {
    return currentTheme() === 'light'
      ? (isEnglish() ? 'Switch to dark theme' : 'Passer en thème sombre')
      : (isEnglish() ? 'Switch to light theme' : 'Passer en thème clair');
  }

  function toggleThemeFromAccount() {
    const themeSwitch = document.getElementById('theme-switch');
    if (themeSwitch) { themeSwitch.click(); return; }
    // Fallback si aucun bouton theme n'existe encore sur cette page (TODO :
    // brancher sur le futur composant theme partage si different).
    const next = currentTheme() === 'light' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', next);
    try { localStorage.setItem('theme', next); } catch (_) { /* no-op */ }
  }

  function accountUrl(hash = '') {
    return `/profile.html${hash ? `#${hash}` : ''}`;
  }

  function openAssistantSettingsFromAccount() {
    document.getElementById('ai-assistant-settings-open')?.click();
  }

  function ensureAccountPopover(slot) {
    let popover = slot.querySelector('#dbs-account-popover');
    if (popover) return popover;
    const labels = accountPopoverI18nLabels(isEnglish());
    popover = document.createElement('div');
    popover.id = 'dbs-account-popover';
    popover.className = 'dbs-account-popover';
    popover.hidden = true;
    popover.setAttribute('aria-hidden', 'true');
    popover.setAttribute('role', 'menu');
    popover.innerHTML = `
      <div class="dbs-account-popover-header">
        <img class="dbs-account-popover-avatar" src="${AVATAR_FALLBACK}" alt="" aria-hidden="true">
        <div class="dbs-account-popover-id">
          <strong class="dbs-account-popover-name"></strong>
        </div>
      </div>
      <div class="dbs-account-popover-actions">
        <a class="dbs-account-popover-action" role="menuitem" href="${accountUrl()}" data-dbs-account-i18n="profile">${labels.profile}</a>
        <a class="dbs-account-popover-action" role="menuitem" href="${accountUrl('preferences')}" data-dbs-account-i18n="preferences">${labels.preferences}</a>
        <a class="dbs-account-popover-action" role="menuitem" href="${accountUrl('security')}" data-dbs-account-i18n="security">${labels.security}</a>
        <button class="dbs-account-popover-action" type="button" role="menuitem" data-dbs-account-action="settings" data-dbs-account-i18n="settings">${labels.settings}</button>
        <button class="dbs-account-popover-action" type="button" role="menuitem" data-dbs-account-action="theme">${themeActionLabel()}</button>
        <button class="dbs-account-popover-action dbs-account-popover-danger" type="button" role="menuitem" data-dbs-account-action="logout" data-dbs-account-i18n="logout">${labels.logout}</button>
      </div>`;
    slot.appendChild(popover);
    popover.addEventListener('click', async (event) => {
      const action = event.target.closest('[data-dbs-account-action]');
      if (!action) return;
      if (action.dataset.dbsAccountAction === 'settings') {
        closeAccountPopover();
        openAssistantSettingsFromAccount();
        return;
      }
      if (action.dataset.dbsAccountAction === 'theme') {
        toggleThemeFromAccount();
        updateAccountPopover(getCachedUser());
        return;
      }
      if (action.dataset.dbsAccountAction === 'logout') {
        closeAccountPopover();
        await logout();
      }
    });
    return popover;
  }

  // Ecrit uniquement si la valeur change : un textContent/setAttribute
  // reecrit avec la meme valeur declenche quand meme un childList mutation
  // record, ce qui reboucle sur wireRailObserver a l'infini (voir plus haut).
  function setTextIfChanged(el, value) {
    if (el && el.textContent !== value) el.textContent = value;
  }
  function setAttrIfChanged(el, name, value) {
    if (el && el.getAttribute(name) !== value) el.setAttribute(name, value);
  }

  // Libelles statiques de la pop-up (hors theme, deja gere par
  // themeActionLabel()). La pop-up n'est creee qu'une seule fois (voir
  // ensureAccountPopover) : sans cette re-traduction a chaque ouverture, un
  // changement de langue apres la premiere ouverture laissait ces libelles
  // figes dans l'ancienne langue.
  function accountPopoverI18nLabels(en) {
    return {
      profile: en ? 'My profile' : 'Mon profil',
      preferences: en ? 'AI preferences' : 'Préférences IA',
      security: en ? 'Account security' : 'Sécurité du compte',
      settings: en ? 'Settings' : 'Paramètres',
      logout: en ? 'Sign out' : 'Se déconnecter'
    };
  }

  function updateAccountPopover(user) {
    const popover = document.getElementById('dbs-account-popover');
    if (!popover || !user) return;
    const displayName = user.displayName || user.email || 'Digitalblueskye';
    setAttrIfChanged(popover.querySelector('.dbs-account-popover-avatar'), 'src', avatarSrc(user));
    const nameEl = popover.querySelector('.dbs-account-popover-name');
    const themeEl = popover.querySelector('[data-dbs-account-action="theme"]');
    setTextIfChanged(nameEl, displayName);
    setTextIfChanged(themeEl, themeActionLabel());
    const labels = accountPopoverI18nLabels(isEnglish());
    popover.querySelectorAll('[data-dbs-account-i18n]').forEach((el) => {
      const key = el.dataset.dbsAccountI18n;
      if (labels[key]) setTextIfChanged(el, labels[key]);
    });
  }

  // La pop-up est en position:fixed (voir style.css) : son ancre (le rail de
  // l'assistant) est une colonne etroite positionnee en absolute, donc tout
  // positionnement CSS relatif a ce conteneur (left/right fixes) peut la
  // pousser hors du viewport des que la fenetre est etroite (mobile). On
  // calcule ici sa position en coordonnees viewport, avec des marges de
  // securite, et on la reajuste au resize tant qu'elle est ouverte.
  function positionAccountPopover(button, popover) {
    const margin = 12;
    const rect = button.getBoundingClientRect();
    const popRect = popover.getBoundingClientRect();
    const width = popRect.width || 240;
    const height = popRect.height || 260;

    let left = rect.right - width;
    left = Math.min(left, window.innerWidth - width - margin);
    left = Math.max(left, margin);

    let top = rect.top - height - 8;
    if (top < margin) top = rect.bottom + 8;
    top = Math.min(top, window.innerHeight - height - margin);
    top = Math.max(top, margin);

    popover.style.left = `${left}px`;
    popover.style.top = `${top}px`;
  }

  function repositionOpenAccountPopover() {
    const popover = document.getElementById('dbs-account-popover');
    const button = document.querySelector('.dbs-profile-rail-avatar[aria-expanded="true"]');
    if (!popover || popover.hidden || !button) return;
    positionAccountPopover(button, popover);
  }
  window.addEventListener('resize', repositionOpenAccountPopover);

  function openAccountPopover(button) {
    const user = getCachedUser();
    if (!user) return;
    const slot = button.closest('.dbs-rail-account-slot');
    const popover = slot ? ensureAccountPopover(slot) : null;
    if (!popover) return;
    updateAccountPopover(user);
    popover.hidden = false;
    popover.setAttribute('aria-hidden', 'false');
    button.setAttribute('aria-expanded', 'true');
    void popover.offsetWidth;
    positionAccountPopover(button, popover);
    popover.classList.add('is-open');
    setTimeout(() => popover.querySelector('.dbs-account-popover-action')?.focus(), 30);
  }

  function closeAccountPopover() {
    const popover = document.getElementById('dbs-account-popover');
    const button = document.querySelector('.dbs-profile-rail-avatar');
    if (!popover || popover.hidden) return;
    popover.classList.remove('is-open');
    popover.setAttribute('aria-hidden', 'true');
    button?.setAttribute('aria-expanded', 'false');
    setTimeout(() => { popover.hidden = true; }, 120);
  }

  function toggleAccountPopover(button) {
    const popover = document.getElementById('dbs-account-popover');
    if (popover && !popover.hidden) closeAccountPopover();
    else openAccountPopover(button);
  }

  // Idempotent par construction : si le slot/avatar existe deja et que l'etat
  // (connecte/deconnecte) n'a pas change, aucune mutation DOM n'est faite.
  function renderProfileAvatar() {
    const rail = document.getElementById('ai-assistant-rail');
    if (!rail) return;
    const slot = rail.querySelector('.dbs-rail-account-slot');

    if (!isAuthenticated()) {
      // Rien a faire si aucun slot n'existe deja : ne jamais creer puis
      // supprimer un slot pour un visiteur non connecte (boucle infinie).
      if (!slot) return;
      closeAccountPopover();
      slot.remove();
      return;
    }

    const user = getCachedUser();
    const finalSlot = slot || rail.appendChild(Object.assign(document.createElement('div'), { className: 'dbs-rail-account-slot' }));
    const existingAvatar = finalSlot.querySelector('.dbs-profile-rail-avatar');
    if (existingAvatar) {
      updateAvatarContent(existingAvatar, user);
      ensureAccountPopover(finalSlot);
      updateAccountPopover(user);
      return;
    }
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'dbs-profile-rail-avatar';
    button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      toggleAccountPopover(button);
    });
    updateAvatarContent(button, user);
    finalSlot.appendChild(button);
    ensureAccountPopover(finalSlot);
    updateAccountPopover(user);
  }

  function syncAuthUI() {
    try { renderProfileAvatar(); } catch (error) { console.warn('[dbs-auth] renderProfileAvatar failed', error); }
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
    // Observe uniquement l'ajout/suppression d'elements (childList/subtree) :
    // pas 'attributes', pour que les mises a jour d'attributs faites par
    // renderProfileAvatar() ne re-declenchent jamais ce callback.
    const observer = new MutationObserver(() => {
      if (document.getElementById('ai-assistant-rail')) syncAuthUI();
    });
    observer.observe(target, { childList: true, subtree: true });
  }

  function wireAccountPopoverDismiss() {
    if (document.documentElement.dataset.dbsAccountDismissWired) return;
    document.documentElement.dataset.dbsAccountDismissWired = 'true';
    document.addEventListener('click', (event) => {
      const popover = document.getElementById('dbs-account-popover');
      if (!popover || popover.hidden) return;
      if (event.target.closest('#dbs-account-popover') || event.target.closest('.dbs-profile-rail-avatar')) return;
      closeAccountPopover();
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') closeAccountPopover();
    });
  }

  document.addEventListener('dbs-auth-changed', syncAuthUI);

  function init() {
    try { wireLauncherGate(); } catch (error) { console.warn('[dbs-auth] wireLauncherGate failed', error); }
    try { wireRailObserver(); } catch (error) { console.warn('[dbs-auth] wireRailObserver failed', error); }
    try { wireAccountPopoverDismiss(); } catch (error) { console.warn('[dbs-auth] wireAccountPopoverDismiss failed', error); }
    // Hydrate depuis le serveur ; syncAuthUI() est appele via dbs-auth-changed.
    // Ne doit jamais bloquer l'affichage : refreshSession() est asynchrone et
    // catch deja toutes ses erreurs reseau en interne.
    refreshSession();
  }

  function safeInit() {
    try { init(); } catch (error) { console.warn('[dbs-auth] init failed, home stays visible', error); }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', safeInit);
  } else {
    safeInit();
  }

  // API publique.
  const api = {
    API_BASE,
    refreshSession,
    getCachedUser,
    isAuthenticated,
    fetchProviders,
    loginWithProvider,
    requestEmailLogin,
    logout,
    updateProfile,
    requireAuthBeforeChat,
    openAuthModal,
    closeAuthModal,
    getAssistantPreferences,
    saveAssistantPreferences,
    clearLocalProfileData,
    syncDbsAuthUI: syncAuthUI,
    renderDbsProfileAvatar: renderProfileAvatar
  };
  window.DBSAuth = api;
  window.DBS_AUTH = api; // alias retro-compatible
})();
