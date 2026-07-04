document.addEventListener('DOMContentLoaded', function() {
  const introText = document.querySelector('.intro-text');

  // Supprimer la section "loading-screen" qui fait doublon
  const loadingScreen = document.querySelector('.loading-screen');
  if (loadingScreen) {
    loadingScreen.remove();
  }

  if (!introText) {
    return;
  }

  // Fonction pour animer un élément
  function animateElement(element, delay = 0) {
      if (element) {
          setTimeout(() => {
              element.style.opacity = '1';
              element.style.transform = 'translateX(0)';
          }, delay);
      }
  }

  // Fonction pour démarrer les animations
  function startAnimations() {
    const animatedTitle = document.querySelector('.animated-title');
    const animatedParagraph = document.querySelector('.animated-paragraph');

    // ✅ Déclencher les animations MAINTENANT
    animateElement(animatedTitle, 2000);
    animateElement(animatedParagraph, 3000);
  }

  // Attendre que le loader principal soit terminé
  const loaderWrapper = document.getElementById('loader-wrapper');

  if (loaderWrapper) {
    const observer = new MutationObserver(function(mutations) {
      mutations.forEach(function(mutation) {
        if (mutation.target.classList.contains('hidden')) {
          // Le loader principal est terminé
          setTimeout(startAnimations, 300);

          observer.disconnect();
        }
      });
    });

    observer.observe(loaderWrapper, { attributes: true, attributeFilter: ['class'] });
  } else {
    // Fallback si le loader-wrapper n'existe pas
    startAnimations();
  }
});