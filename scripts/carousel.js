document.addEventListener('DOMContentLoaded', () => {
  // Sélection des éléments du carrousel
  const track = document.querySelector('.carousel-track');
  const slides = Array.from(document.querySelectorAll('.carousel-item'));
  const dotsContainer = document.querySelector('.carousel-dots');
  const prevButton = document.querySelector('.prev-btn');
  const nextButton = document.querySelector('.next-btn');
  const pauseButton = document.querySelector('.pause-btn');
  const pauseIcon = document.getElementById('pause-icon');
  
  // Variables pour le contrôle du carrousel
  let currentIndex = 0;
  let isPlaying = true;
  let interval = null;
  let isTransitioning = false;
  const slideInterval = 1900; // 1.9 secondes entre chaque diapositive
  
  // Cloner les premiers et derniers slides pour le défilement infini
  function setupInfiniteCarousel() {
    // Cloner plusieurs slides pour garantir une expérience vraiment continue
    const firstSlideClone1 = slides[0].cloneNode(true);
    const secondSlideClone = slides[1].cloneNode(true);
    const lastSlideClone1 = slides[slides.length - 1].cloneNode(true);
    const secondLastSlideClone = slides[slides.length - 2].cloneNode(true);
    
    // Ajouter les classes pour les identifier
    firstSlideClone1.classList.add('clone');
    secondSlideClone.classList.add('clone');
    lastSlideClone1.classList.add('clone');
    secondLastSlideClone.classList.add('clone');
    
    // Ajouter les clones au track
    track.appendChild(firstSlideClone1);
    track.appendChild(secondSlideClone);
    track.insertBefore(lastSlideClone1, slides[0]);
    track.insertBefore(secondLastSlideClone, lastSlideClone1);
    
    // Positionner directement sur le premier slide réel
    goToSlide(2, false);
  }
  
  // Création des points indicateurs
  slides.forEach((_, index) => {
    const dot = document.createElement('div');
    dot.classList.add('dot');
    if (index === 0) dot.classList.add('active');
    dot.addEventListener('click', () => {
      // +2 car on a ajouté deux clones au début
      goToSlide(index + 2);
    });
    dotsContainer.appendChild(dot);
  });
  
  // Fonction pour aller à un slide spécifique
  function goToSlide(index, animate = true) {
    if (isTransitioning && animate) return;
    
    // Mise à jour de l'index courant
    currentIndex = index;
    
    // Appliquer la transition seulement si animate est true
    track.style.transition = animate ? 'transform 0.5s ease-in-out' : 'none';
    
    // Positionner le slide actif
    const slideWidth = 50; // Correspond à min-width: 50%
    const offset = (100 - slideWidth) / 2;
    track.style.transform = `translateX(calc(-${currentIndex * slideWidth}% + ${offset}%))`;
    
    // Mettre à jour les points indicateurs
    const actualIndex = (currentIndex - 2 + slides.length) % slides.length;
    document.querySelectorAll('.dot').forEach((dot, i) => {
      dot.classList.toggle('active', i === actualIndex);
    });
    
    // Gérer le repositionnement invisible quand on atteint les clones
    if (animate) {
      isTransitioning = true;
      
      // Attendre la fin de l'animation pour vérifier si on doit sauter
      setTimeout(() => {
        isTransitioning = false;
        
        // Si on est sur les premiers clones
        if (currentIndex <= 1) {
          goToSlide(currentIndex + slides.length, false);
        }
        // Si on est sur les derniers clones
        else if (currentIndex >= slides.length + 2) {
          goToSlide(currentIndex - slides.length, false);
        }
      }, 500);
    }
    
    // Réinitialiser l'intervalle UNIQUEMENT si isPlaying est true
    if (isPlaying) {
      stopAutoplay(); // Arrêter l'autoplay existant avant d'en démarrer un nouveau
      startAutoplay();
    }
  }
  
  // Arrêt complet du défilement automatique
  function stopAutoplay() {
    if (interval !== null) {
      clearInterval(interval);
      interval = null;
    }
  }
  
  // Démarrage du défilement automatique
  function startAutoplay() {
    // S'assurer qu'il n'y a pas d'intervalle existant
    stopAutoplay();
    
    // Créer un nouvel intervalle
    interval = setInterval(() => {
      if (isPlaying) { // Vérification supplémentaire
        goToSlide(currentIndex + 1);
      }
    }, slideInterval);
  }
  
  // Gérer le bouton pause/play - VERSION CORRIGÉE
  function togglePlayPause() {
    isPlaying = !isPlaying;
    
    if (isPlaying) {
      // Mode lecture
      pauseIcon.className = 'fa fa-pause';
      startAutoplay();
    } else {
      // Mode pause
      pauseIcon.className = 'fa fa-play';
      stopAutoplay();
    }
  }
  
  // Event listeners pour les boutons de navigation
  prevButton.addEventListener('click', () => {
    goToSlide(currentIndex - 1);
    // Quand l'utilisateur navigue manuellement, ne pas interférer avec l'état de lecture/pause
  });
  
  nextButton.addEventListener('click', () => {
    goToSlide(currentIndex + 1);
    // Quand l'utilisateur navigue manuellement, ne pas interférer avec l'état de lecture/pause
  });
  
  pauseButton.addEventListener('click', togglePlayPause);
  
  // Gestion des touches du clavier
  document.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      goToSlide(currentIndex - 1);
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      goToSlide(currentIndex + 1);
    } else if (e.key === ' ' || e.code === 'Space') {
      e.preventDefault();
      togglePlayPause();
    }
  });
  
  // Initialiser le carrousel infini
  setupInfiniteCarousel();
  startAutoplay();
  
  // Mise en évidence du focus sur le carrousel
  track.setAttribute('tabindex', '0');
  track.addEventListener('focus', () => {
    track.style.outline = '2px solid rgba(52, 152, 219, 0.5)';
  });
  track.addEventListener('blur', () => {
    track.style.outline = 'none';
  });
  
  // Gérer le redimensionnement de la fenêtre
  window.addEventListener('resize', () => {
    track.style.transition = 'none';
    setTimeout(() => {
      goToSlide(currentIndex, false);
      setTimeout(() => {
        track.style.transition = 'transform 0.5s ease-in-out';
      }, 50);
    }, 50);
  });

  // Gestion de l'effet hover permanent avec pause automatique
  const projectPreviews = document.querySelectorAll('.project-preview');
  let wasPlaying = isPlaying; // Pour mémoriser l'état avant survol
  
  projectPreviews.forEach(preview => {
    preview.addEventListener('mouseenter', () => {
      // Ajouter une classe pour simuler l'effet hover permanent
      preview.classList.add('hover-active');
      
      // Option: mettre en pause automatiquement le carrousel pendant le survol
      if (isPlaying) {
        wasPlaying = true;
        togglePlayPause(); // Mettre en pause
      }
    });
    
    preview.addEventListener('mouseleave', () => {
      // Retirer la classe quand le curseur quitte l'élément
      preview.classList.remove('hover-active');
      
      // Option: reprendre le défilement si c'était en lecture avant le survol
      if (wasPlaying && !isPlaying) {
        togglePlayPause(); // Reprendre la lecture
      }
    });
  });
});