/**
 * Script de traduction pour le site Digitalblueskye
 * Version corrigée pour éviter les redirections et gérer innerHTML
 */
document.addEventListener('DOMContentLoaded', function() {
  console.log("Translator script initialized");

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

  function sendPreferenceUpdate(language) {
    const saved = getSavedConsent() || {};
    const theme =
      document.documentElement.getAttribute('data-theme') ||
      localStorage.getItem('theme') ||
      'dark';
    const normalizedLanguage = normalizeLanguage(language) || 'fr';

    fetch(resolveApiUrl('/backend/consent.php'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        consent_id: getConsentId(),
        analytics: !!saved.analytics,
        marketing: !!saved.marketing,
        language: normalizedLanguage,
        theme: theme,
        page_url: window.location.href
      })
    }).catch(() => {
      // Fail silently
    });
  }
  
  // Configuration de la langue
  let currentLanguage = getCookie('language') || localStorage.getItem('language') || 'fr';
  currentLanguage = normalizeLanguage(currentLanguage) || 'fr';
  let translations = {};

  // Éléments DOM pour les boutons de langue
  const switchToEN = document.getElementById('switch-to-en');
  const switchToFR = document.getElementById('switch-to-fr');
  
  // Fonction pour mettre à jour l'affichage des boutons de langue
  function updateLanguageButtons() {
    if (!switchToEN || !switchToFR) {
      console.warn("Language switch buttons not found, cannot update display.");
      return;
    }
    if (currentLanguage === 'fr') {
      switchToEN.style.display = 'block';
      switchToFR.style.display = 'none';
    } else {
      switchToEN.style.display = 'none';
      switchToFR.style.display = 'block';
    }
  }

  // Fonction pour obtenir la valeur depuis un objet imbriqué via une chaîne de clés
  function getNestedTranslation(obj, path) {
    return path.split('.').reduce((prev, curr) => {
      return prev && prev[curr] ? prev[curr] : null;
    }, obj);
  }

  // Fonction de traduction
  function translatePage() {
    console.log("Translating page to: " + currentLanguage);
    
    // --- Traduction des éléments avec data-i18n (contenu principal) ---
    const elements = document.querySelectorAll('[data-i18n]');
    console.log("Found " + elements.length + " elements with [data-i18n] for main content.");

    elements.forEach(element => {
      const key = element.getAttribute('data-i18n');
      const translation = getNestedTranslation(translations, key);
      
      if (translation) {
        // Gestion spécifique pour les titres h1/h2 (peuvent contenir des <i>)
        if (element.matches('h1, h2')) {
          element.innerHTML = translation;
        }
        // Gestion spécifique pour les boutons de navigation projet
        else if (element.matches('.prev-project, .next-project') && !element.hasAttribute('data-i18n-title')) { // S'assurer que ce n'est pas pour le title
          const projectKey = element.getAttribute('data-project-key');
          const projectNameTranslation = getNestedTranslation(translations, 'projectNames.' + projectKey);

          if (projectNameTranslation) {
            element.textContent = translation.replace('{projectName}', projectNameTranslation);
          } else {
            element.textContent = translation.replace('{projectName}', projectKey);
            console.warn(`Project name translation not found for key: projectNames.${projectKey}`);
          }
        }
        // Si l'élément est un input avec value
        else if (element.value !== undefined && element.tagName.toLowerCase() === 'input' && element.type !== 'password') {
          if (element.type === 'submit' || element.type === 'button') {
            element.value = translation;
          }
        }
        // Si l'élément a un attribut alt
        else if (element.hasAttribute('alt')) {
          element.alt = translation;
        }
        // Pour les méta tags (description)
        else if (element.tagName.toLowerCase() === 'meta' && element.name === 'description') {
          element.content = translation;
        }
        // Pour le titre de la page (<title>)
        else if (element.tagName.toLowerCase() === 'title') {
          document.title = translation;
        }
        // Pour tous les autres éléments (contenu général)
        else {
          element.innerHTML = translation;
        }
      } else {
        console.warn("No translation found for main content key: " + key + " on element:", element);
      }
    });

    // --- Traduction des attributs title spécifiques avec data-i18n-title ---
    const titleElements = document.querySelectorAll('[data-i18n-title]');
    console.log("Found " + titleElements.length + " elements with [data-i18n-title].");
    titleElements.forEach(element => {
        const titleKey = element.getAttribute('data-i18n-title');
        const translation = getNestedTranslation(translations, titleKey);
        if (translation) {
            if (element.matches('.prev-project, .next-project') && element.dataset.projectKey) {
                const projectKey = element.dataset.projectKey;
                const projectName = getNestedTranslation(translations, 'projectNames.' + projectKey);
                if (projectName) {
                    element.setAttribute('title', translation.replace('{projectName}', projectName));
                } else {
                    element.setAttribute('title', translation.replace('{projectName}', projectKey)); // Fallback
                }
            } else {
                element.setAttribute('title', translation);
            }
        } else {
            console.warn("No title translation found for key: " + titleKey + " on element:", element);
        }
    });

    // --- Traduction des placeholders avec data-i18n-placeholder ---
    const placeholderElements = document.querySelectorAll('[data-i18n-placeholder]');
    console.log("Found " + placeholderElements.length + " elements with [data-i18n-placeholder].");
    placeholderElements.forEach(element => {
      const key = element.getAttribute('data-i18n-placeholder');
      const translation = getNestedTranslation(translations, key);
      if (translation) {
        element.placeholder = translation;
      } else {
        console.warn("No placeholder translation found for key: " + key + " on element:", element);
      }
    });
    
    // --- Traitement spécial pour skills-title (si nécessaire) ---
    const skillsTitle = document.getElementById('skills-title');
    if (skillsTitle && skillsTitle.hasAttribute('data-i18n')) { // S'assurer qu'il a l'attribut
      const key = skillsTitle.getAttribute('data-i18n');
      const translation = getNestedTranslation(translations, key);
      if (translation) {
        // Exemple de traitement si skills-title a besoin d'une structure HTML spécifique
        // skillsTitle.innerHTML = `<span>${translation}</span>`; 
        // Pour l'instant, on suppose qu'il est traité comme un h1/h2 normal si c'en est un
      }
    }

    // Mise à jour finale
    document.documentElement.lang = currentLanguage;
    updateLanguageButtons();
    localStorage.setItem('language', currentLanguage);
    setCookie('language', currentLanguage, 365);
    if (typeof AOS !== 'undefined') {
      setTimeout(() => { AOS.refresh(); }, 100);
    }
    document.dispatchEvent(new CustomEvent('translationCompleted', { detail: { language: currentLanguage } }));
    console.log("Page translation complete for " + currentLanguage);
  }

  // Fonction pour mettre à jour la navigation des projets (appelée après chargement des traductions)
  // Cette fonction est maintenant principalement pour les titles, le contenu textuel est géré par data-i18n
  function updateProjectNavigationTitles(translationsData) {
    // La logique de mise à jour des titles est déjà dans la boucle titleElements.forEach de translatePage()
    // Cette fonction pourrait être utilisée pour d'autres logiques spécifiques à la navigation si besoin.
    // Pour l'instant, on peut la laisser vide ou la supprimer si translatePage() couvre tout.
    console.log("Project navigation titles updated (handled within translatePage).");
  }

  // Fonction pour charger les traductions
  async function loadTranslations(lang) {
    try {
      console.log("Loading translations for: " + lang);
      const response = await fetch(`/translations/${lang}.json`); // Chemin relatif à la racine du site
      if (!response.ok) {
        // Essayer un chemin relatif au dossier parent (pour les pages dans des sous-dossiers comme /projects/)
        console.warn(`Failed to load translations from /translations/${lang}.json, trying ../translations/${lang}.json`);
        const fallbackResponse = await fetch(`../translations/${lang}.json`);
        if (!fallbackResponse.ok) {
          throw new Error(`HTTP error: ${fallbackResponse.status} (fallback also failed)`);
        }
        translations = await fallbackResponse.json();
      } else {
        translations = await response.json();
      }
      
      console.log("Translations loaded successfully for " + lang);
      translatePage(); // Appelle translatePage qui gère maintenant aussi les titles spécifiques
      // updateProjectNavigationTitles(translations); // Peut être redondant si translatePage gère tout
    } catch (error) {
      console.error(`Error loading translations for ${lang}: ${error}`);
      // Optionnel: afficher un message à l'utilisateur ou utiliser une langue par défaut codée en dur
    }
  }

  // Événements pour les boutons de langue
  if (switchToEN) {
    console.log("Adding event listener to English button");
    switchToEN.addEventListener('click', function(e) {
      e.preventDefault(); // Toujours prévenir le comportement par défaut
      console.log("English button clicked");
      if (currentLanguage !== 'en') {
        currentLanguage = 'en';
        sendPreferenceUpdate(currentLanguage);
        loadTranslations(currentLanguage);
      }
      return false;
    });
  } else {
    console.warn("English language button (switch-to-en) not found");
  }

  if (switchToFR) {
    console.log("Adding event listener to French button");
    switchToFR.addEventListener('click', function(e) {
      e.preventDefault(); // Toujours prévenir le comportement par défaut
      console.log("French button clicked");
      if (currentLanguage !== 'fr') {
        currentLanguage = 'fr';
        sendPreferenceUpdate(currentLanguage);
        loadTranslations(currentLanguage);
      }
      return false;
    });
  } else {
    console.warn("French language button (switch-to-fr) not found");
  }

  // Initialisation - charger les traductions pour la langue actuelle
  console.log("Initial loading of translations for: " + currentLanguage);
  loadTranslations(currentLanguage);
});
