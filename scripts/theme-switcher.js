/**
 * Script pour la gestion du mode clair/sombre
 */
document.addEventListener('DOMContentLoaded', function() {
  const themeSwitch = document.getElementById('theme-switch');
  const moonIcon = themeSwitch.querySelector('.moon-icon');
  const sunIcon = themeSwitch.querySelector('.sun-icon');

  function resolveApiUrl(path) {
    const defaultBase = 'https://api.digitalblueskye.com';
    const explicitBase = String(window.DBS_API_BASE || '').trim();
    const inferredBase =
      window.location.hostname.startsWith('www.')
        ? `${window.location.protocol}//api.${window.location.hostname.slice(4)}`
        : '';
    const base = (explicitBase || inferredBase || defaultBase).replace(/\/+$/, '');
    return base ? `${base}${path}` : path;
  }

  function getCookie(name) {
    const cookieString = `; ${document.cookie}`;
    const parts = cookieString.split(`; ${name}=`);
    if (parts.length === 2) {
      return decodeURIComponent(parts.pop().split(';').shift());
    }
    return '';
  }

  function setCookie(name, value, days) {
    const maxAge = days * 24 * 60 * 60;
    document.cookie = `${name}=${encodeURIComponent(value)}; max-age=${maxAge}; path=/; samesite=lax`;
  }

  function normalizeLanguage(value) {
    if (!value) return '';
    return value.toString().trim().toLowerCase().split(/[-_]/)[0] || '';
  }

  function getConsentId() {
    try {
      let consentId = localStorage.getItem('dbs_consent_id');
      if (!consentId) {
        consentId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
        localStorage.setItem('dbs_consent_id', consentId);
      }
      return consentId;
    } catch (error) {
      return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
    }
  }

  function getSavedConsent() {
    try {
      const raw = localStorage.getItem('dbs_consent_v1');
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (error) {
      return null;
    }
  }

  function sendPreferenceUpdate(theme) {
    const saved = getSavedConsent() || {};
    const language =
      normalizeLanguage(
        document.documentElement.lang ||
          localStorage.getItem('language') ||
          'fr'
      ) || 'fr';

    fetch(resolveApiUrl('/backend/consent.php'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        consent_id: getConsentId(),
        analytics: !!saved.analytics,
        marketing: !!saved.marketing,
        language: language,
        theme: theme,
        page_url: window.location.href
      })
    }).catch(() => {
      // Fail silently
    });
  }
  
  // Récupérer le thème enregistré ou utiliser le thème sombre par défaut
  const savedTheme = getCookie('theme') || localStorage.getItem('theme') || 'dark';
  
  // Appliquer le thème sauvegardé au chargement
  applyTheme(savedTheme);
  
  // Fonction pour appliquer un thème
  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    
    // Mettre à jour l'apparence des icônes
    if (theme === 'light') {
      moonIcon.style.display = 'none';
      sunIcon.style.display = 'block';
    } else {
      moonIcon.style.display = 'block';
      sunIcon.style.display = 'none';
    }
    
    // Enregistrer le thème dans localStorage
    localStorage.setItem('theme', theme);
    setCookie('theme', theme, 365);
  }
  
  // Gérer le clic sur le bouton
  themeSwitch.addEventListener('click', function() {
    const currentTheme = document.documentElement.getAttribute('data-theme');
    const newTheme = currentTheme === 'light' ? 'dark' : 'light';
    
    applyTheme(newTheme);
    sendPreferenceUpdate(newTheme);
    
    // Animation lors du changement
    document.body.style.transition = 'background-color 0.5s ease, color 0.5s ease';
    setTimeout(() => {
      document.body.style.transition = '';
    }, 500);
  });
});
