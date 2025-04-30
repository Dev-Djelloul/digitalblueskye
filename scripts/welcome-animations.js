document.addEventListener('DOMContentLoaded', function() {
  const introText = document.querySelector('.intro-text');
  
  // Masquer l'intro-text au départ
  introText.style.display = 'none';
  
  // Supprimer la section "loading-screen" qui fait doublon
  const loadingScreen = document.querySelector('.loading-screen');
  if (loadingScreen) {
    loadingScreen.remove(); // Supprime complètement cette section
  }
  
  // Attendre que le loader principal soit terminé avant d'afficher l'intro
  // (Utilise un MutationObserver pour détecter quand le loader-wrapper devient caché)
  const loaderWrapper = document.getElementById('loader-wrapper');
  
  if (loaderWrapper) {
    const observer = new MutationObserver(function(mutations) {
      mutations.forEach(function(mutation) {
        if (mutation.target.classList.contains('hidden')) {
          // Le loader principal est terminé, afficher l'intro-text
          setTimeout(function() {
            introText.style.display = 'block';
            // Les animations CSS s'occuperont du reste
          }, 300);
          
          // Arrêter l'observation
          observer.disconnect();
        }
      });
    });
    
    // Observer les changements de classe sur le loader-wrapper
    observer.observe(loaderWrapper, { attributes: true, attributeFilter: ['class'] });
  } else {
    // Fallback si le loader-wrapper n'existe pas
    setTimeout(function() {
      introText.style.display = 'block';
    }, 500);
  }
});