/**
 * Script de traduction pour le site YellowBlueSkye
 * Version corrigée pour éviter les redirections
 */
document.addEventListener('DOMContentLoaded', function() {
  console.log("Translator script initialized");
  
  // Configuration de la langue
  let currentLanguage = localStorage.getItem('language') || 'fr';
  let translations = {};

  // Éléments DOM pour les boutons de langue
  const switchToEN = document.getElementById('switch-to-en');
  const switchToFR = document.getElementById('switch-to-fr');
  
  // Fonction pour mettre à jour l'affichage des boutons de langue
  function updateLanguageButtons() {
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
    
    // --- Traduction des éléments avec data-i18n ---
    const elements = document.querySelectorAll('[data-i18n]');
    console.log("Found " + elements.length + " elements with [data-i18n]");

    // ... (Code existant pour les titres h1/h2) ...
    const headings = document.querySelectorAll('h1[data-i18n], h2[data-i18n]');
    console.log("Found " + headings.length + " headings to translate specifically");
    headings.forEach(heading => {
      const key = heading.getAttribute('data-i18n');
      const translation = getNestedTranslation(translations, key);
      if (translation) {
        heading.innerHTML = translation;
      } else {
        console.warn("No translation found for heading key: " + key);
      }
    });
    
    elements.forEach(element => {
      const key = element.getAttribute('data-i18n');
      const translation = getNestedTranslation(translations, key);
      
      if (translation) {
        // --- NOUVEAU : Gestion spécifique pour les boutons de navigation projet ---
        if (element.matches('.prev-project, .next-project')) {
          const projectKey = element.getAttribute('data-project-key');
          const projectNameTranslation = getNestedTranslation(translations, 'projectNames.' + projectKey);

          if (projectNameTranslation) {
            // Remplace le marqueur {projectName} par le nom traduit
            element.textContent = translation.replace('{projectName}', projectNameTranslation);
          } else {
            // Fallback si le nom du projet n'est pas trouvé (affiche juste le format)
            element.textContent = translation.replace('{projectName}', projectKey); // Affiche la clé en fallback
            console.warn(`Project name translation not found for key: projectNames.${projectKey}`);
          }
        }
        // --- FIN NOUVEAU ---

        // Si l'élément est un input avec value (EXISTANT)
        else if (element.value !== undefined && element.tagName.toLowerCase() === 'input' && element.type !== 'password') {
          if (element.type === 'submit' || element.type === 'button') {
            element.value = translation;
          }
        }
        // Si l'élément a des attributs title ou alt (EXISTANT)
        else if (element.title !== undefined && key.includes('title')) {
          element.title = translation;
        }
        else if (element.alt !== undefined && key.includes('alt')) {
          element.alt = translation;
        }
        // Pour les méta tags (EXISTANT)
        else if (element.tagName.toLowerCase() === 'meta' && element.name === 'description') {
          element.content = translation;
        }
        // Pour le titre de la page (EXISTANT)
        else if (element.tagName.toLowerCase() === 'title') {
          document.title = translation;
        }
        // Pour tous les autres éléments (sauf les titres déjà traités) (EXISTANT)
        else if (!element.matches('h1, h2')) { // Évite de retraduire les titres
          element.textContent = translation;
        }
      } else {
        // Ne pas afficher d'avertissement pour les titres car ils sont traités séparément
        if (!element.matches('h1, h2')) {
          console.warn("No translation found for key: " + key);
        }
      }
    });

    // --- NOUVEAU : Traduction des placeholders avec data-i18n-placeholder ---
    const placeholderElements = document.querySelectorAll('[data-i18n-placeholder]');
    console.log("Found " + placeholderElements.length + " elements with [data-i18n-placeholder]");

    placeholderElements.forEach(element => {
      const key = element.getAttribute('data-i18n-placeholder');
      const translation = getNestedTranslation(translations, key);

      if (translation) {
        // Appliquer la traduction à l'attribut placeholder
        element.placeholder = translation;
      } else {
        console.warn("No placeholder translation found for key: " + key);
      }
    });
    // --- FIN NOUVEAU ---


    // ... (Code existant pour le traitement spécial de skills-title) ...
    const skillsTitle = document.getElementById('skills-title');
    if (skillsTitle) {
      // ... (code existant) ...
    }

    // ... (Reste du code de la fonction translatePage : mise à jour lang, boutons, localStorage, AOS, etc.) ...
    document.documentElement.lang = currentLanguage;
    updateLanguageButtons();
    localStorage.setItem('language', currentLanguage);
    if (typeof AOS !== 'undefined') {
      setTimeout(() => { AOS.refresh(); }, 100);
    }
    document.dispatchEvent(new CustomEvent('translationCompleted', { detail: { language: currentLanguage } }));
  }

  // Fonction pour mettre à jour la navigation des projets (simplifiée)
  function updateProjectNavigation(translations) {
    const prevLink = document.querySelector('.prev-project');
    const nextLink = document.querySelector('.next-project');

    // --- Mise à jour du TITLE UNIQUEMENT ---

    if (prevLink && prevLink.dataset.projectKey) {
      const projectKey = prevLink.dataset.projectKey;
      const projectName = getNestedTranslation(translations, 'projectNames.' + projectKey); // On a toujours besoin du nom traduit pour le title
      const titleKey = prevLink.dataset.i18nTitle;
      
      // Mettre à jour le title si data-i18n-title est utilisé
      if (titleKey && projectName) {
          let titleTemplate = getNestedTranslation(translations, titleKey);
          if (titleTemplate) {
              prevLink.setAttribute('title', titleTemplate.replace('{projectName}', projectName));
          }
      } 
      // else { // Si pas de nom traduit, on peut mettre un title générique ou laisser celui du HTML
      //    prevLink.setAttribute('title', 'Previous Project'); 
      // }
    }

    if (nextLink && nextLink.dataset.projectKey) {
      const projectKey = nextLink.dataset.projectKey;
      const projectName = getNestedTranslation(translations, 'projectNames.' + projectKey); // On a toujours besoin du nom traduit pour le title
      const titleKey = nextLink.dataset.i18nTitle;

      // Mettre à jour le title si data-i18n-title est utilisé
       if (titleKey && projectName) {
           let titleTemplate = getNestedTranslation(translations, titleKey);
           if (titleTemplate) {
               nextLink.setAttribute('title', titleTemplate.replace('{projectName}', projectName));
           }
       }
       // else { // Si pas de nom traduit, on peut mettre un title générique ou laisser celui du HTML
       //    nextLink.setAttribute('title', 'Next Project'); 
       // }
    }
  }

  // Fonction pour charger les traductions
  async function loadTranslations(lang) {
    try {
      console.log("Loading translations for: " + lang);
      const response = await fetch(`translations/${lang}.json`);
      if (!response.ok) {
        throw new Error(`HTTP error: ${response.status}`);
      }
      translations = await response.json();
      console.log("Translations loaded successfully");
      translatePage();
      updateProjectNavigation(translations);
    } catch (error) {
      console.error(`Error loading translations: ${error}`);
      // Fallback: if file not found, try relative path
      try {
        const fallbackResponse = await fetch(`../translations/${lang}.json`);
        if (!fallbackResponse.ok) {
          throw new Error(`HTTP error: ${fallbackResponse.status}`);
        }
        translations = await fallbackResponse.json();
        translatePage();
        updateProjectNavigation(translations);
      } catch (fallbackError) {
        console.error(`Fallback error loading translations: ${fallbackError}`);
      }
    }
  }

  // Événements pour les boutons de langue
  if (switchToEN) {
    console.log("Adding event listener to English button");
    switchToEN.addEventListener('click', function(e) {
      console.log("English button clicked");
      if (e.preventDefault) e.preventDefault();
      currentLanguage = 'en';
      loadTranslations(currentLanguage);
      return false; // Pour s'assurer qu'il n'y a pas de redirection
    });
  } else {
    console.warn("English language button not found");
  }

  if (switchToFR) {
    console.log("Adding event listener to French button");
    switchToFR.addEventListener('click', function(e) {
      console.log("French button clicked");
      if (e.preventDefault) e.preventDefault();
      currentLanguage = 'fr';
      loadTranslations(currentLanguage);
      return false; // Pour s'assurer qu'il n'y a pas de redirection
    });
  } else {
    console.warn("French language button not found");
  }

  // Initialisation - charger les traductions pour la langue actuelle
  console.log("Initial loading of translations");
  loadTranslations(currentLanguage);
});