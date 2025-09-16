document.addEventListener('DOMContentLoaded', function() {
  // Éléments du DOM
  const hamburger = document.getElementById('hamburger');
  const dropdownMenu = document.getElementById('dropdown-menu');
  const menuOverlay = document.getElementById('menu-overlay');
const header = document.querySelector('.site-header') || document.querySelector('header');  const logoVideo = document.getElementById('logo-video');
  const icon = hamburger.querySelector('i');
  let headerTimeout;
  
  // ===== Gestion du menu dropdown =====
  
  // Fonction pour ouvrir le menu
  function openMenu() {
    header.classList.remove('nav-hidden'); // Assure que le header est visible
    dropdownMenu.classList.add('active');
    menuOverlay.classList.add('active');
    hamburger.classList.add('active'); // Pour la rotation du chevron
    document.body.classList.add('body-menu-open'); // AJOUTÉ : Pour décaler le contenu principal
  }
  
  // Fonction pour fermer le menu
  function closeMenu() {
    dropdownMenu.classList.remove('active');
    menuOverlay.classList.remove('active');
    hamburger.classList.remove('active');
    document.body.classList.remove('body-menu-open'); // AJOUTÉ : Pour remettre le contenu principal
  }
  
  // Événement pour le hamburger (toggle)
  hamburger.addEventListener('click', function() {
    if (dropdownMenu.classList.contains('active')) {
      closeMenu();
    } else {
      openMenu();
    }
  });
  
  // Fermer le menu en cliquant sur l'overlay
  if (menuOverlay) {
    menuOverlay.addEventListener('click', closeMenu);
  }
  
  // Fermer le menu en cliquant sur les liens de navigation (sauf liens de langue)
  const navLinks = document.querySelectorAll('.dropdown-nav a:not(#switch-to-en):not(#switch-to-fr)');
  navLinks.forEach(link => {
    link.addEventListener('click', closeMenu);
  });
  
  // Empêcher la fermeture du menu pour les boutons de langue
  const langButtons = document.querySelectorAll('#switch-to-en, #switch-to-fr, .lang-button');
  langButtons.forEach(button => {
    button.addEventListener('click', function(event) {
      // Empêcher la propagation de l'événement pour éviter la fermeture du menu
      event.stopPropagation();
      // Si le bouton est un lien <a>, empêcher aussi le comportement par défaut
      if (button.tagName.toLowerCase() === 'a') {
        event.preventDefault();
      }
    });
  });
  
  // ===== Gestion du header au scroll =====
  
  // Variables pour optimiser le scroll
  let lastScrollY = window.scrollY;
  let ticking = false;
  
  // Fonction pour mettre à jour l'état du header
  function updateNavbar() {
    const currentScrollY = window.scrollY;
    
    // Ajouter une classe si on a défilé (pour le fond)
    if (currentScrollY > 20) {
      header.classList.add('nav-scrolled');
    } else {
      header.classList.remove('nav-scrolled');
    }
    
    // Cacher le header quand on descend, le montrer quand on remonte suffisamment
    if (currentScrollY > lastScrollY && currentScrollY > 10) {
      // On descend - cacher immédiatement
      clearTimeout(headerTimeout);
      header.classList.add('nav-hidden');
    } else if (lastScrollY > currentScrollY) {
      // On remonte - attendre un peu avant de montrer
      clearTimeout(headerTimeout);
      headerTimeout = setTimeout(() => {
        header.classList.remove('nav-hidden');
      }, 400); // Attendre 200ms avant de montrer le header
    } 
    // Si on remonte de moins de 10px, on ne fait rien (header reste dans son état actuel)
    
    lastScrollY = currentScrollY;
    ticking = false;
  }
  
  // Optimisation des performances pour le scroll
  window.addEventListener('scroll', function() {
    if (!ticking) {
      window.requestAnimationFrame(function() {
        updateNavbar();
      });
      ticking = true;
    }
  }, { passive: true });
  
  // ===== Gestion de la vidéo =====
  
  // S'assurer que la vidéo se lance correctement
  if (logoVideo) {
    // Relancer la vidéo si elle se termine
    logoVideo.addEventListener('ended', function() {
      logoVideo.play();
    });
    
    // Essayer de lancer la vidéo si elle ne démarre pas automatiquement
    setTimeout(function() {
      if (logoVideo.paused) {
        logoVideo.play().catch(e => {
          console.log('Autoplay bloqué par le navigateur');
        });
      }
    }, 1000);
  }
  
  // ===== Adaptations responsive =====
  
  // Ajuster le padding-top du body selon la hauteur du header
  function updateBodyPadding() {
    document.body.style.paddingTop = header.offsetHeight + 'px';
  }
  
  // Initialiser le padding et le recalculer au redimensionnement
  updateBodyPadding();
  window.addEventListener('resize', updateBodyPadding);
  
  // ===== Simuler les comportements des sélecteurs =====
  
  // Thème sombre/clair (simulation)
  const themeSwitch = document.getElementById('theme-switch');
  if (themeSwitch) {
    themeSwitch.addEventListener('click', function() {
      document.body.classList.toggle('dark-theme');
      
      // Changer l'icône
      const icon = themeSwitch.querySelector('i');
      if (icon.classList.contains('fa-moon')) {
        icon.classList.remove('fa-moon');
        icon.classList.add('fa-sun');
      } else {
        icon.classList.remove('fa-sun');
        icon.classList.add('fa-moon');
      }
    });
  }
  
  // Sélecteur de langue (simulation)
  const switchToEn = document.getElementById('switch-to-en');
  const switchToFr = document.getElementById('switch-to-fr');
  
  if (switchToEn && switchToFr) {
    switchToEn.addEventListener('click', function() {
      switchToEn.style.display = 'none';
      switchToFr.style.display = 'block';
      console.log('Langue changée en anglais');
    });
    
    switchToFr.addEventListener('click', function() {
      switchToFr.style.display = 'none';
      switchToEn.style.display = 'block';
      console.log('Langue changée en français');
    });
  }
});
