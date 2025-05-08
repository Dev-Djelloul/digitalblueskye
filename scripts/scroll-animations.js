document.addEventListener('DOMContentLoaded', function() {
  // Fonction d'initialisation des animations au défilement
  function initScrollAnimations() {
    // Détecter si l'appareil est mobile
    const isMobile = window.innerWidth <= 768;
    
    // Configurer les options de l'observateur en fonction du type d'appareil
    const observerOptions = {
      root: null, // viewport
      threshold: isMobile ? 0.05 : 0.15, // Réduire le seuil sur mobile (5% au lieu de 15%)
      rootMargin: isMobile ? '0px 0px -20px 0px' : '0px 0px -50px 0px' // Ajuster la marge pour mobile
    };
    
    // Créer l'observateur d'intersection
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        // Si l'élément est visible
        if (entry.isIntersecting) {
          // Ajouter la classe pour déclencher l'animation avec un léger délai sur mobile
          if (isMobile) {
            setTimeout(() => {
              entry.target.classList.add('slide-visible');
            }, 100); // Petit délai pour s'assurer que les transitions fonctionnent
          } else {
            entry.target.classList.add('slide-visible');
          }
          
          // Si l'animation ne doit être jouée qu'une fois
          if (entry.target.classList.contains('once') || isMobile) { // Sur mobile, on joue l'animation qu'une seule fois
            observer.unobserve(entry.target);
          }
        } else {
          // Si l'animation doit être répétée lorsque l'élément n'est plus visible
          if (!entry.target.classList.contains('once') && !isMobile) {
            entry.target.classList.remove('slide-visible');
          }
        }
      });
    }, observerOptions);

    // Sélectionner tous les éléments avec des classes d'animation
    const animatedElements = document.querySelectorAll(
      '.slide-from-left, .slide-from-right, .slide-from-bottom, .fade-in, .cascade-container, .slide-hidden'
    );

    // Observer chaque élément
    animatedElements.forEach(el => {
      if (!el.classList.contains('slide-hidden')) {
        el.classList.add('slide-hidden');
      }
      
      // Forcer l'état initial pour les appareils mobiles
      if (isMobile) {
        el.style.willChange = 'transform, opacity'; // Optimisation des performances
      }
      
      observer.observe(el);
    });
  }

  // Initialiser les animations
  initScrollAnimations();
  
  // Réinitialiser les animations lors du redimensionnement (changement d'orientation mobile)
  let resizeTimer;
  window.addEventListener('resize', function() {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function() {
      // Réinitialiser les animations
      document.querySelectorAll('.slide-visible').forEach(el => {
        el.classList.remove('slide-visible');
      });
      initScrollAnimations();
    }, 250);
  });
});