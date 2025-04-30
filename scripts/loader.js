window.addEventListener('load', () => {
    const loaderWrapper = document.getElementById('loader-wrapper');
    if (loaderWrapper) {
      const minimumLoadTime = 3500; // Votre délai
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
  });
  