/**
 * Script pour la page du blog Le coin Digital
 * Version corrigée pour les problèmes de pagination et de changement de langue
 * Avec ajout du bouton de réinitialisation de recherche
 */
document.addEventListener('DOMContentLoaded', function() {
  // Référence aux éléments de recherche et filtrage
  const searchInput = document.getElementById('blog-search');
  const categorySelect = document.getElementById('category-select');
  const articlesGrid = document.querySelector('.articles-grid');
  const articleCards = document.querySelectorAll('.blog-card');
  const paginationContainer = document.querySelector('.pagination');
  const languageButton = document.getElementById('switch-to-fr') || document.getElementById('switch-to-en');
  const searchButton = document.getElementById('search-btn');
  
  // === Gestion du bouton de recherche/effacement ===
  if (searchInput && searchButton) {
    const searchIcon = searchButton.querySelector('.icon-search');
    
    if (searchIcon) {
      // État initial
      updateSearchButtonState();
      
      // Surveiller les changements dans le champ de recherche
      searchInput.addEventListener('input', updateSearchButtonState);
      
      // Gérer le clic sur le bouton
      searchButton.addEventListener('click', function(e) {
        e.preventDefault();
        
        // Si le champ contient du texte, l'effacer
        if (searchInput.value.length > 0) {
          searchInput.value = '';
          updateSearchButtonState();
          
          // Déclencher l'événement input pour mettre à jour les résultats
          const inputEvent = new Event('input', { bubbles: true });
          searchInput.dispatchEvent(inputEvent);
        }
      });
      
      // Fonction pour mettre à jour l'état du bouton
      function updateSearchButtonState() {
        if (searchInput.value.length > 0) {
          // Champ avec du texte -> montrer une croix (X)
          searchIcon.textContent = '✕';
          searchButton.setAttribute('aria-label', 'Effacer la recherche');
        } else {
          // Champ vide -> montrer l'icône de recherche
          searchIcon.textContent = '🔍';
          searchButton.setAttribute('aria-label', 'Rechercher');
        }
      }
    } else {
      console.error("L'élément .icon-search n'a pas été trouvé dans le bouton de recherche");
    }
  }
  
  // Variables pour suivre l'état
  let articlesContent = {}; // Contenu complet des articles (chargé depuis JSON)
  let currentPage = 1;      // Suivre la page de pagination actuelle
  
  // Charger le contenu des articles au démarrage
  loadArticlesContent();
  
  // Détecter les changements de langue
  if (languageButton) {
    languageButton.addEventListener('click', function() {
      // Sauvegarder la page actuelle avant le changement de langue
      const savedPage = currentPage;
      
      // Réinitialiser après un court délai pour s'assurer que la page est chargée
      setTimeout(() => {
        loadArticlesContent(savedPage); // Passer la page sauvegardée
      }, 500);
    });
  }
  
  // Observer les changements d'attribut lang sur html
  const htmlElement = document.documentElement;
  const observer = new MutationObserver(function(mutations) {
    mutations.forEach(function(mutation) {
      if (mutation.attributeName === 'lang') {
        console.log('Langue changée à:', htmlElement.lang);
        
        // Sauvegarder la page actuelle avant le changement de langue
        const savedPage = currentPage;
        loadArticlesContent(savedPage); // Passer la page sauvegardée
      }
    });
  });
  
  observer.observe(htmlElement, { attributes: true });
  
  // Fonction pour charger le contenu des articles
  function loadArticlesContent(pageToShow = 1) {
    const currentLang = document.documentElement.lang || 'fr';
    console.log('Chargement du contenu pour la langue:', currentLang);
    
    fetch(`/translations/${currentLang}.json`)
      .then(response => response.json())
      .then(data => {
        console.log('Fichier JSON chargé avec succès pour', currentLang);
        
        // Récupérer le contenu des articles depuis la section "news" du JSON
        if (data && data.news) {
          articlesContent = data.news;
          console.log('Articles chargés:', Object.keys(articlesContent));
          
          // Créer les attributs data-article-id sur les cartes pour faciliter la correspondance
          matchCardsToJsonContent();
          
          // Initialiser la pagination à la page spécifiée (ou sauvegardée)
          currentPage = pageToShow; // Mettre à jour la variable de suivi
          showArticlesForPage(currentPage);
          
          // Mettre à jour l'UI pour montrer la page active
          updatePaginationUI(currentPage);
          
          // Réappliquer le filtre si une recherche est en cours
          if (searchInput && searchInput.value.trim() !== '') {
            filterArticles();
          }
        } else {
          console.error('Structure JSON incorrecte: section "news" non trouvée');
        }
      })
      .catch(error => {
        console.error('Erreur lors du chargement du JSON:', error);
        
        // Initialiser quand même la page en cas d'erreur
        showArticlesForPage(currentPage);
        updatePaginationUI(currentPage);
      });
  }
  
  // Fonction pour faire correspondre les cartes HTML aux données JSON
  function matchCardsToJsonContent() {
    articleCards.forEach((card, index) => {
      const title = card.querySelector('.blog-card-title').textContent;
      
      // Chercher l'article correspondant dans le JSON par titre
      for (const articleKey in articlesContent) {
        const article = articlesContent[articleKey];
        if (article && article.title && article.title === title) {
          // Ajouter un attribut data pour identifier facilement cette carte
          card.setAttribute('data-article-id', articleKey);
          console.log(`Correspondance trouvée: "${title}" = ${articleKey}`);
          break;
        }
      }
      
      // Si aucune correspondance n'est trouvée, utiliser l'index comme fallback
      if (!card.getAttribute('data-article-id')) {
        card.setAttribute('data-article-id', `article${index + 1}`);
        console.log(`Pas de correspondance exacte pour "${title}", utilisé article${index + 1}`);
      }
    });
  }
  
  // Fonction de recherche
  if (searchInput) {
    searchInput.addEventListener('input', filterArticles);
  }
  
  // Fonction de filtre par catégorie
  if (categorySelect) {
    categorySelect.addEventListener('change', filterArticles);
  }
  
  // Pagination fonctionnelle
  const paginationButtons = document.querySelectorAll('.pagination-btn');
  const articlesPerPage = 3; // Nombre d'articles par page

  if (paginationButtons.length > 0) {
    paginationButtons.forEach(btn => {
      btn.addEventListener('click', function() {
        // Récupérer le numéro de la page
        const pageNumber = parseInt(this.textContent);
        
        // Mettre à jour la variable de suivi
        currentPage = pageNumber;
        
        // Afficher les articles correspondant à la page sélectionnée
        showArticlesForPage(currentPage);
        
        // Mettre à jour l'UI pour montrer la page active
        updatePaginationUI(currentPage);
      });
    });
  }

  // Mappage des valeurs du select vers les textes réels des catégories
  const categoryMap = {
    'all': '', 
    'technology': ['Technologie', 'Technology'],
    'regulation': ['Réglementation', 'Regulation'],
    'csr': ['RSE & Impact', 'CSR & Impact'],
    'foresight': ['Prospective', 'Foresight']
  };

  // Nouvelle fonction pour mettre à jour l'UI de pagination
  function updatePaginationUI(activePage) {
    if (paginationButtons.length > 0) {
      // D'abord, supprimer la classe active de tous les boutons
      paginationButtons.forEach(btn => btn.classList.remove('active'));
      
      // Ensuite, ajouter la classe active uniquement au bouton de la page active
      const activeBtn = Array.from(paginationButtons).find(
        btn => parseInt(btn.textContent) === activePage
      );
      
      if (activeBtn) {
        activeBtn.classList.add('active');
      }
    }
  }

  // Fonction qui combine recherche et filtre
  function filterArticles() {
    const searchTerm = searchInput ? searchInput.value.toLowerCase() : '';
    const selectedCategory = categorySelect ? categorySelect.value : 'all';
    const currentLang = document.documentElement.lang || 'fr';
    const categoryTexts = categoryMap[selectedCategory] || [''];
    const isSearching = searchTerm !== '' || selectedCategory !== 'all';
    
    console.log(`Recherche du terme "${searchTerm}" dans la langue "${currentLang}"`);
    
    if (isSearching) {
      // Variables pour suivre les résultats
      let hasVisibleArticles = false;
      let matchedArticles = {};
      
      // ÉTAPE 1: Effectuer la recherche dans le contenu JSON complet
      if (searchTerm !== '') {
        // Pour chaque article dans le JSON
        for (const articleKey in articlesContent) {
          const article = articlesContent[articleKey];
          
          // Si l'article a un contenu complet
          if (article && article.fullContent) {
            // Vérifier si le terme est dans le titre, le résumé ou le contenu complet
            const titleMatch = article.title && article.title.toLowerCase().includes(searchTerm);
            const summaryMatch = article.summary && article.summary.toLowerCase().includes(searchTerm);
            const contentMatch = article.fullContent && article.fullContent.toLowerCase().includes(searchTerm);
            
            if (titleMatch || summaryMatch || contentMatch) {
              // Stocker l'article correspondant avec son index pour l'étape 2
              matchedArticles[articleKey] = true;
              console.log(`Correspondance trouvée dans l'article: ${article.title}`);
            }
          }
        }
      }
      
      // ÉTAPE 2: Appliquer les résultats et le filtre de catégorie aux cartes visibles
      articleCards.forEach((card) => {
        // Extraire les données de l'article
        const title = card.querySelector('.blog-card-title').textContent;
        const categoryElement = card.querySelector('.blog-card-category');
        const category = categoryElement ? categoryElement.textContent : '';
        
        // Déterminer l'identifiant de l'article depuis l'attribut data
        const articleId = card.getAttribute('data-article-id');
        
        // Un article correspond à la recherche si:
        // - pas de terme de recherche, OU
        // - terme trouvé dans les données JSON (étape 1)
        let matchesSearch = !searchTerm || matchedArticles[articleId];
        
        // Un article correspond à la catégorie si:
        // - toutes catégories sélectionnées, OU
        // - la catégorie correspond à l'une des traductions possibles
        const matchesCategory = selectedCategory === 'all' || categoryTexts.includes(category);
        
        // Afficher ou masquer l'article
        if (matchesSearch && matchesCategory) {
          card.style.display = 'block';
          hasVisibleArticles = true;
          console.log(`Article "${title}" affiché`);
        } else {
          card.style.display = 'none';
          console.log(`Article "${title}" masqué`);
        }
      });
      
      // Masquer la pagination en mode recherche
      if (paginationContainer) {
        paginationContainer.style.display = 'none';
      }
      
      // Vérifier s'il y a des résultats
      if (!hasVisibleArticles) {
        showNoResultsMessage();
      } else {
        removeNoResultsMessage();
      }
    } else {
      // Mode normal: revenir à la pagination
      if (paginationContainer) {
        paginationContainer.style.display = 'flex';
      }
      
      // Afficher les articles de la page actuelle (pas forcément la première)
      showArticlesForPage(currentPage);
      
      // Mettre à jour l'UI pour montrer la page active
      updatePaginationUI(currentPage);
    }
  }
  
  // Fonction pour afficher les articles de la page sélectionnée
  function showArticlesForPage(pageNumber) {
    const searchTerm = searchInput ? searchInput.value.toLowerCase() : '';
    const selectedCategory = categorySelect ? categorySelect.value : 'all';
    const isSearching = searchTerm !== '' || selectedCategory !== 'all';
    
    if (isSearching) {
      // En mode recherche, ne pas paginer
      return;
    }
    
    // Calculer les indices de début et de fin
    const startIndex = (pageNumber - 1) * articlesPerPage;
    const endIndex = startIndex + articlesPerPage;
    
    let hasVisibleArticles = false;
    
    // Parcourir tous les articles
    articleCards.forEach((card, index) => {
      // Vérifier si l'article est dans la plage de la page actuelle
      if (index >= startIndex && index < endIndex) {
        card.style.display = 'block';
        hasVisibleArticles = true;
      } else {
        card.style.display = 'none';
      }
    });
    
    // Vérifier s'il y a des résultats
    if (!hasVisibleArticles) {
      showNoResultsMessage();
    } else {
      removeNoResultsMessage();
    }
  }
  
  // Affiche le message "Aucun résultat"
  function showNoResultsMessage() {
    removeNoResultsMessage();
    
    const noResultsMsg = document.createElement('p');
    noResultsMsg.className = 'no-results-message';
    noResultsMsg.setAttribute('data-i18n', 'blog.noResults');
    
    const currentLang = document.documentElement.lang || 'fr';
    noResultsMsg.textContent = currentLang === 'en' 
      ? 'No articles match your search' 
      : 'Aucun article ne correspond à votre recherche';
    
    articlesGrid.appendChild(noResultsMsg);
  }
  
  // Supprime le message "Aucun résultat"
  function removeNoResultsMessage() {
    const noResultsMsg = document.querySelector('.no-results-message');
    if (noResultsMsg) {
      noResultsMsg.remove();
    }
  }
});