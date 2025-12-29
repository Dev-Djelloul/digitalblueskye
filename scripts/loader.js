const CONSENT_KEY = 'dbs_consent_v1';
const CONSENT_VERSION = 1;
const CONSENT_ID_KEY = 'dbs_consent_id';
const CONSENT_SENT_KEY = 'dbs_consent_sent_v1';
const CONSENT_DELAY_MS = 10000;

if ('scrollRestoration' in history) {
  history.scrollRestoration = 'manual';
}

function setDefaultConsent() {
  const defaults = {
    ad_storage: 'denied',
    ad_user_data: 'denied',
    ad_personalization: 'denied',
    analytics_storage: 'denied',
    wait_for_update: 500
  };

  if (typeof window.gtag === 'function') {
    window.gtag('consent', 'default', defaults);
  } else {
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push(['consent', 'default', defaults]);
  }
}

function applyConsent(consent) {
  if (typeof window.gtag !== 'function') {
    return;
  }

  window.gtag('consent', 'update', {
    ad_storage: consent.marketing ? 'granted' : 'denied',
    ad_user_data: consent.marketing ? 'granted' : 'denied',
    ad_personalization: consent.marketing ? 'granted' : 'denied',
    analytics_storage: consent.analytics ? 'granted' : 'denied'
  });
}

function getSavedConsent() {
  try {
    const raw = localStorage.getItem(CONSENT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || parsed.version !== CONSENT_VERSION) return null;
    return parsed;
  } catch (error) {
    return null;
  }
}

function saveConsent(consent) {
  try {
    localStorage.setItem(
      CONSENT_KEY,
      JSON.stringify({
        version: CONSENT_VERSION,
        timestamp: new Date().toISOString(),
        ...consent
      })
    );
  } catch (error) {
    // Ignore storage errors
  }
}

function getConsentSentMarker() {
  try {
    return localStorage.getItem(CONSENT_SENT_KEY) || '';
  } catch (error) {
    return '';
  }
}

function markConsentSent(consent) {
  try {
    if (consent && consent.timestamp) {
      localStorage.setItem(CONSENT_SENT_KEY, consent.timestamp);
    }
  } catch (error) {
    // Ignore storage errors
  }
}

function shouldSendConsent(consent) {
  if (!consent || !consent.timestamp) {
    return false;
  }
  return getConsentSentMarker() !== consent.timestamp;
}

function getConsentId() {
  try {
    let consentId = localStorage.getItem(CONSENT_ID_KEY);
    if (!consentId) {
      consentId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
      localStorage.setItem(CONSENT_ID_KEY, consentId);
    }
    return consentId;
  } catch (error) {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  }
}

function sendConsentToServer(consent) {
  function normalizeLanguage(value) {
    if (!value) return '';
    return value.toString().trim().toLowerCase().split(/[-_]/)[0] || '';
  }

  const language =
    normalizeLanguage(
      document.documentElement.lang ||
        localStorage.getItem('language') ||
        'fr'
    ) || 'fr';
  const theme =
    document.documentElement.getAttribute('data-theme') ||
    localStorage.getItem('theme') ||
    'dark';

  fetch('/backend/consent.php', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      consent_id: getConsentId(),
      analytics: !!consent.analytics,
      marketing: !!consent.marketing,
      language: language,
      theme: theme,
      page_url: window.location.href
    })
  }).catch(() => {
    // Fail silently
  });
}

function getConsentCopy() {
  function getCookie(name) {
    const cookieString = `; ${document.cookie}`;
    const parts = cookieString.split(`; ${name}=`);
    if (parts.length === 2) {
      return decodeURIComponent(parts.pop().split(';').shift());
    }
    return '';
  }

  function normalizeLanguage(value) {
    if (!value) return '';
    return value.toString().trim().toLowerCase().split(/[-_]/)[0] || '';
  }

  const lang = normalizeLanguage(
    getCookie('language') ||
      localStorage.getItem('language') ||
      document.documentElement.lang ||
      'fr'
  ) || 'fr';
  const copy = {
    fr: {
      title: 'Gestion des données personnelles',
      description:
        "Nous utilisons des cookies pour améliorer l'expérience, mesurer l'audience et proposer du contenu pertinent. Vous pouvez accepter, refuser ou personnaliser.",
      necessary: 'Strictement nécessaires',
      necessaryNote: 'Obligatoire',
      analytics: "Mesure d'audience",
      analyticsNote: 'GA4',
      marketing: 'Marketing et publicité',
      marketingNote: 'Ads',
      acceptAll: 'Tout accepter',
      rejectAll: 'Tout refuser',
      customize: 'Personnaliser',
      save: 'Enregistrer mes choix',
      info: 'Vous pouvez modifier vos choix à tout moment.',
      privacy: 'Politique de confidentialité',
      cookies: 'Gestion des cookies',
      terms: "Conditions d'utilisation",
      manage: 'Cookies'
    },
    en: {
      title: 'Personal data settings',
      description:
        'We use cookies to improve your experience, measure audience, and deliver relevant content. You can accept, refuse, or customize.',
      necessary: 'Strictly necessary',
      necessaryNote: 'Required',
      analytics: 'Analytics',
      analyticsNote: 'GA4',
      marketing: 'Marketing & advertising',
      marketingNote: 'Ads',
      acceptAll: 'Accept all',
      rejectAll: 'Reject all',
      customize: 'Customize',
      save: 'Save my choices',
      info: 'You can change your choices at any time.',
      privacy: 'Privacy policy',
      cookies: 'Cookie management',
      terms: 'Terms of use',
      manage: 'Cookies'
    }
  };

  return copy[lang] || copy.fr;
}

function updateConsentText(banner, floatingButton) {
  const copy = getConsentCopy();
  banner.querySelector('[data-consent="title"]').textContent = copy.title;
  banner.querySelector('[data-consent="description"]').textContent = copy.description;
  banner.querySelector('[data-consent="necessary"]').textContent = copy.necessary;
  banner.querySelector('[data-consent="necessary-note"]').textContent = copy.necessaryNote;
  banner.querySelector('[data-consent="analytics"]').textContent = copy.analytics;
  banner.querySelector('[data-consent="analytics-note"]').textContent = copy.analyticsNote;
  banner.querySelector('[data-consent="marketing"]').textContent = copy.marketing;
  banner.querySelector('[data-consent="marketing-note"]').textContent = copy.marketingNote;
  banner.querySelector('[data-consent="accept"]').textContent = copy.acceptAll;
  banner.querySelector('[data-consent="reject"]').textContent = copy.rejectAll;
  banner.querySelector('[data-consent="customize"]').textContent = copy.customize;
  banner.querySelector('[data-consent="save"]').textContent = copy.save;
  banner.querySelector('[data-consent="info"]').textContent = copy.info;
  banner.querySelector('[data-consent="privacy"]').textContent = copy.privacy;
  banner.querySelector('[data-consent="cookies"]').textContent = copy.cookies;
  banner.querySelector('[data-consent="terms"]').textContent = copy.terms;
  floatingButton.textContent = copy.manage;
}

function createConsentUI() {
  const banner = document.createElement('section');
  banner.className = 'consent-banner';
  banner.setAttribute('role', 'dialog');
  banner.setAttribute('aria-live', 'polite');
  banner.innerHTML = `
    <div class="consent-banner__content">
      <div class="consent-banner__header">
        <h3 class="consent-banner__title" data-consent="title"></h3>
        <p class="consent-banner__description" data-consent="description"></p>
      </div>
      <div class="consent-banner__details" hidden>
        <div class="consent-toggle">
          <div class="consent-toggle__text">
            <span class="consent-toggle__badge" data-consent="necessary-note"></span>
            <span class="consent-toggle__label" data-consent="necessary"></span>
          </div>
          <label class="consent-switch">
            <input type="checkbox" checked disabled />
            <span class="consent-slider"></span>
          </label>
        </div>
        <div class="consent-toggle">
          <div class="consent-toggle__text">
            <span class="consent-toggle__badge" data-consent="analytics-note"></span>
            <span class="consent-toggle__label" data-consent="analytics"></span>
          </div>
          <label class="consent-switch">
            <input type="checkbox" id="consent-analytics" />
            <span class="consent-slider"></span>
          </label>
        </div>
        <div class="consent-toggle">
          <div class="consent-toggle__text">
            <span class="consent-toggle__badge" data-consent="marketing-note"></span>
            <span class="consent-toggle__label" data-consent="marketing"></span>
          </div>
          <label class="consent-switch">
            <input type="checkbox" id="consent-marketing" />
            <span class="consent-slider"></span>
          </label>
        </div>
        <p class="consent-banner__info" data-consent="info"></p>
        <div class="consent-banner__links">
          <a href="/pages/privacy.html" data-consent="privacy"></a>
          <a href="/pages/cookies-policy.html" data-consent="cookies"></a>
          <a href="/pages/terms.html" data-consent="terms"></a>
        </div>
      </div>
      <div class="consent-banner__actions">
        <button class="consent-btn consent-btn--ghost" data-action="reject" data-consent="reject"></button>
        <button class="consent-btn consent-btn--secondary" data-action="customize" data-consent="customize"></button>
        <button class="consent-btn consent-btn--primary" data-action="accept" data-consent="accept"></button>
      </div>
      <div class="consent-banner__actions consent-banner__actions--save" hidden>
        <button class="consent-btn consent-btn--secondary" data-action="save" data-consent="save"></button>
      </div>
    </div>
  `;

  const floatingButton = document.createElement('button');
  floatingButton.className = 'consent-floating';
  floatingButton.setAttribute('type', 'button');
  floatingButton.setAttribute('aria-label', 'Gestion des cookies');

  document.body.appendChild(banner);
  document.body.appendChild(floatingButton);

  updateConsentText(banner, floatingButton);

  const details = banner.querySelector('.consent-banner__details');
  const actions = banner.querySelector('.consent-banner__actions');
  const saveActions = banner.querySelector('.consent-banner__actions--save');
  const analyticsInput = banner.querySelector('#consent-analytics');
  const marketingInput = banner.querySelector('#consent-marketing');

  function openPreferences() {
    details.hidden = false;
    saveActions.hidden = false;
    actions.hidden = true;
    banner.classList.add('consent-banner--expanded');
  }

  function closePreferences() {
    details.hidden = true;
    saveActions.hidden = true;
    actions.hidden = false;
    banner.classList.remove('consent-banner--expanded');
  }

  function hideBanner() {
    banner.classList.remove('consent-banner--visible');
    banner.classList.add('consent-banner--hidden');
    floatingButton.classList.add('consent-floating--visible');
  }

  function showBanner() {
    banner.classList.remove('consent-banner--hidden');
    banner.classList.add('consent-banner--visible');
    floatingButton.classList.remove('consent-floating--visible');
  }

  banner.addEventListener('click', (event) => {
    const action = event.target && event.target.dataset ? event.target.dataset.action : null;
    if (!action) return;

    if (action === 'customize') {
      openPreferences();
      return;
    }

    if (action === 'accept') {
      const consent = { necessary: true, analytics: true, marketing: true };
      saveConsent(consent);
      sendConsentToServer(consent);
      applyConsent(consent);
      hideBanner();
      return;
    }

    if (action === 'reject') {
      const consent = { necessary: true, analytics: false, marketing: false };
      saveConsent(consent);
      sendConsentToServer(consent);
      applyConsent(consent);
      hideBanner();
      return;
    }

    if (action === 'save') {
      const consent = {
        necessary: true,
        analytics: analyticsInput.checked,
        marketing: marketingInput.checked
      };
      saveConsent(consent);
      sendConsentToServer(consent);
      applyConsent(consent);
      hideBanner();
      closePreferences();
    }
  });

  floatingButton.addEventListener('click', () => {
    const saved = getSavedConsent();
    if (saved) {
      analyticsInput.checked = !!saved.analytics;
      marketingInput.checked = !!saved.marketing;
    }
    showBanner();
    openPreferences();
  });

  const savedConsent = getSavedConsent();
  if (savedConsent) {
    analyticsInput.checked = !!savedConsent.analytics;
    marketingInput.checked = !!savedConsent.marketing;
    applyConsent(savedConsent);
    if (shouldSendConsent(savedConsent)) {
      sendConsentToServer(savedConsent);
      markConsentSent(savedConsent);
    }
    hideBanner();
  } else {
    showBanner();
  }

  document.addEventListener('translationCompleted', () => {
    updateConsentText(banner, floatingButton);
  });
}

setDefaultConsent();

window.addEventListener('load', () => {
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
    const loaderWrapper = document.getElementById('loader-wrapper');
    if (loaderWrapper) {
      const minimumLoadTime = 4500; // Votre délai
      const loadEndTime = Date.now();
      const timeToWait = Math.max(0, minimumLoadTime - (loadEndTime - performance.timing.navigationStart)); 
  
      setTimeout(() => {
        loaderWrapper.classList.add('hidden');
  
        // >>> INITIALISER AOS ICI <<<
        AOS.init({
          duration: 1000, // Durée de l'animation
          once: true      // Animation une seule fois
          // offset: 200, // Optionnel: Déclencher l'animation un peu avant/après l'arrivée dans le viewport
          // delay: 100,  // Optionnel: Ajouter un délai avant le début de l'animation
        });
        // >>> FIN INITIALISATION AOS <<<
  
      }, timeToWait); 
    }

    setTimeout(() => {
      createConsentUI();
    }, CONSENT_DELAY_MS);
  });
  
