document.addEventListener('DOMContentLoaded', function() {
  // Fonction d'initialisation des animations au défilement
  function initScrollAnimations() {
    // Créer l'observateur d'intersection
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        // Si l'élément est visible
        if (entry.isIntersecting) {
          // Ajouter la classe pour déclencher l'animation
          entry.target.classList.add('slide-visible');
          // Si l'animation ne doit être jouée qu'une fois
          if (entry.target.classList.contains('once')) {
            observer.unobserve(entry.target);
          }
        } else {
          // Si l'animation doit être répétée lorsque l'élément n'est plus visible
          if (!entry.target.classList.contains('once')) {
            entry.target.classList.remove('slide-visible');
          }
        }
      });
    }, {
      // Options de l'observateur
      root: null, // viewport
      threshold: 0.15, // 15% de l'élément doit être visible
      rootMargin: '0px 0px -50px 0px' // Déclenche un peu avant que l'élément soit visible
    });

    // Sélectionner tous les éléments avec des classes d'animation
    const animatedElements = document.querySelectorAll(
      '.slide-from-left, .slide-from-right, .slide-from-bottom, .fade-in, .cascade-container'
    );

    // Observer chaque élément
    animatedElements.forEach(el => {
      if (!el.classList.contains('slide-hidden')) {
        el.classList.add('slide-hidden');
      }
      observer.observe(el);
    });
  }

  // Initialiser les animations
  initScrollAnimations();
});