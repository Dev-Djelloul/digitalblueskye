/**
 * Script pour la page du blog Le coin Digital
 */
document.addEventListener('DOMContentLoaded', function() {
  // Référence aux éléments de recherche et filtrage
  const searchInput = document.getElementById('blog-search');
  const categorySelect = document.getElementById('category-select');
  const articlesGrid = document.querySelector('.articles-grid');
  const articleCards = document.querySelectorAll('.blog-card');
  
  // Fonction de recherche
  if (searchInput) {
    searchInput.addEventListener('input', filterArticles);
  }
  
  // Fonction de filtre par catégorie
  if (categorySelect) {
    categorySelect.addEventListener('change', filterArticles);
  }
  
  // Fonction qui combine recherche et filtre
  function filterArticles() {
    const searchTerm = searchInput ? searchInput.value.toLowerCase() : '';
    const selectedCategory = categorySelect ? categorySelect.value : 'all';
    
    articleCards.forEach(card => {
      const title = card.querySelector('.blog-card-title').textContent.toLowerCase();
      const summary = card.querySelector('.blog-card-summary').textContent.toLowerCase();
      const category = card.querySelector('.blog-card-category').textContent.toLowerCase();
      
      const matchesSearch = title.includes(searchTerm) || summary.includes(searchTerm);
      const matchesCategory = selectedCategory === 'all' || category.includes(selectedCategory);
      
      // Afficher ou masquer la carte selon les critères
      if (matchesSearch && matchesCategory) {
        card.style.display = 'block';
      } else {
        card.style.display = 'none';
      }
    });
    
    // Vérifier si des résultats sont affichés
    checkNoResults();
  }
  
  // Ajoute un message si aucun résultat
  function checkNoResults() {
    // Vérifier les cartes visibles
    let visibleCount = 0;
    articleCards.forEach(card => {
      if (window.getComputedStyle(card).display !== 'none') {
        visibleCount++;
      }
    });
    
    let noResultsMsg = document.querySelector('.no-results-message');
    
    if (visibleCount === 0) {
      if (!noResultsMsg) {
        noResultsMsg = document.createElement('p');
        noResultsMsg.className = 'no-results-message';
        noResultsMsg.setAttribute('data-i18n', 'blog.noResults');
        
        // Déterminer la langue actuelle
        const currentLang = document.documentElement.lang || 'fr';
        
        // Définir le message selon la langue
        if (currentLang === 'en') {
          noResultsMsg.textContent = 'No articles match your search';
        } else {
          noResultsMsg.textContent = 'Aucun article ne correspond à votre recherche';
        }
        
        articlesGrid.appendChild(noResultsMsg);
        
        // Essayer d'appliquer le système de traduction après l'ajout au DOM
        setTimeout(() => {
          if (window.translator) {
            try {
              if (typeof window.translator.applyTranslations === 'function') {
                window.translator.applyTranslations(noResultsMsg.parentNode);
              } else if (typeof window.translator.translateElement === 'function') {
                window.translator.translateElement(noResultsMsg);
              }
            } catch (e) {
              console.log('Traduction automatique non disponible pour le message dynamique');
            }
          }
        }, 50);
      }
    } else if (noResultsMsg) {
      noResultsMsg.remove();
    }
  }
  
  // Pagination (simulation)
  const paginationButtons = document.querySelectorAll('.pagination-btn');
  if (paginationButtons.length > 0) {
    paginationButtons.forEach(btn => {
      btn.addEventListener('click', function() {
        // Retirer la classe active de tous les boutons
        paginationButtons.forEach(b => b.classList.remove('active'));
        // Ajouter la classe active au bouton cliqué
        this.classList.add('active');
        
        // Pour l'instant c'est juste visuel (à implémenter quand tu auras plus d'articles)
        if (this.textContent === "2") {
          alert("Prochains articles à venir !");
        }
      });
    });
  }
}); 