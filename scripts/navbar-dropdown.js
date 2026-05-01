document.addEventListener('DOMContentLoaded', function() {
  // Éléments du DOM
  const hamburger = document.getElementById('hamburger');
  const dropdownMenu = document.getElementById('dropdown-menu');
  const menuOverlay = document.getElementById('menu-overlay');
  const header = document.querySelector('.site-header') || document.querySelector('header');
  const logoVideo = document.getElementById('logo-video');

  // Détection desktop (hover) vs mobile (tap)
  const isDesktop = window.matchMedia('(hover: hover) and (pointer: fine)');

  // Injecte une barre sociale dans le header à partir des liens déjà présents dans le dropdown.
  function initHeaderSocialStrip() {
    const menuControls = header ? header.querySelector('.menu-controls') : null;
    const dropdownSocial = dropdownMenu ? dropdownMenu.querySelector('.social-media') : null;

    if (!header || header.querySelector('.header-social-strip')) {
      return;
    }

    const sourceLinks = dropdownSocial ? dropdownSocial.querySelectorAll('a') : [];
    if (!sourceLinks.length && !menuControls) {
      return;
    }

    const strip = document.createElement('div');
    strip.className = 'header-social-strip';
    strip.setAttribute('aria-label', 'Liens sociaux et préférences');

    const links = document.createElement('div');
    links.className = 'header-social-links';

    sourceLinks.forEach((link) => {
      const clone = link.cloneNode(true);
      clone.classList.add('header-social-link');
      const cloneIcon = clone.querySelector('img');
      if (cloneIcon) {
        cloneIcon.classList.add('header-social-icon');
      }
      links.appendChild(clone);
    });

    if (links.children.length) {
      strip.appendChild(links);
    }
    if (menuControls) {
      strip.appendChild(menuControls);
    }
    if (dropdownSocial) {
      dropdownSocial.remove();
    }
    header.insertBefore(strip, header.firstElementChild);
  }

  initHeaderSocialStrip();

  // ===== Gestion du menu dropdown =====
  function openMenu() {
    header.classList.remove('nav-hidden');
    dropdownMenu.classList.add('active');
    menuOverlay.classList.add('active');
    hamburger.classList.add('active');
    document.body.classList.add('body-menu-open');
    // a11y
    hamburger.setAttribute('aria-expanded', 'true');
    hamburger.setAttribute('aria-controls', 'dropdown-menu');
  }

  function closeMenu() {
    dropdownMenu.classList.remove('active');
    menuOverlay.classList.remove('active');
    hamburger.classList.remove('active');
    document.body.classList.remove('body-menu-open');
    // a11y
    hamburger.setAttribute('aria-expanded', 'false');
  }

  // Clic hamburger: uniquement sur mobile/tablette (sur desktop → hover gère)
  hamburger.addEventListener('click', function(e) {
    if (isDesktop.matches) return; // desktop: ignorer le clic
    e.preventDefault();
    if (dropdownMenu.classList.contains('active')) closeMenu();
    else openMenu();
  });

  // Fermer le menu en cliquant sur l'overlay
  if (menuOverlay) {
    menuOverlay.addEventListener('click', closeMenu);
  }

  // Ouvrir/fermer au survol sur desktop (menu reste ouvert tant que hamburger/menu/overlay est survolé)
  let hoverCloseTimer = null;
  if (hamburger && dropdownMenu && menuOverlay && isDesktop.matches) {
    const onEnter = () => {
      if (hoverCloseTimer) { clearTimeout(hoverCloseTimer); hoverCloseTimer = null; }
      openMenu();
    };
    const onLeave = () => {
      if (hoverCloseTimer) clearTimeout(hoverCloseTimer);
      hoverCloseTimer = setTimeout(() => {
        if (!hamburger.matches(':hover') &&
            !dropdownMenu.matches(':hover') &&
            !menuOverlay.matches(':hover')) {
          closeMenu();
        }
      }, 200); // délai anti-clignotement
    };

    [hamburger, dropdownMenu, menuOverlay].forEach(el => {
      el.addEventListener('mouseenter', onEnter);
      el.addEventListener('mouseleave', onLeave);
    });
  }

  // Fermer le sous-menu quand la souris sort (évite le focus collé au clic)
  const dropdownSubmenus = document.querySelectorAll('.dropdown-submenu');
  dropdownSubmenus.forEach(submenu => {
    submenu.addEventListener('mouseleave', () => {
      if (!isDesktop.matches) return;
      const active = document.activeElement;
      if (active && submenu.contains(active)) {
        active.blur();
      }
    });
  });
  
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
  
  // ===== Header fixe (pas de masquage au scroll) =====
  function updateNavbarState() {
    const currentScrollY = window.scrollY;
    if (currentScrollY > 20) {
      header.classList.add('nav-scrolled');
    } else {
      header.classList.remove('nav-scrolled');
    }
    header.classList.remove('nav-hidden');
  }

  updateNavbarState();
  window.addEventListener('scroll', updateNavbarState, { passive: true });
  
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
    const socialStrip = header.querySelector('.header-social-strip');
    const socialStripHeight = socialStrip ? socialStrip.offsetHeight : 0;

    document.documentElement.style.setProperty('--site-header-height', header.offsetHeight + 'px');
    document.documentElement.style.setProperty('--site-header-social-height', socialStripHeight + 'px');

    if (
      document.body.classList.contains('home-page')
      || document.body.classList.contains('inspirations-page')
    ) {
      document.body.style.paddingTop = '0px';
      return;
    }

    document.body.style.paddingTop = header.offsetHeight + 'px';
  }
  
  // Initialiser le padding et le recalculer au redimensionnement
  updateBodyPadding();
  window.addEventListener('load', updateBodyPadding);
  window.addEventListener('resize', updateBodyPadding);
  
  // ===== Simuler les comportements des sélecteurs =====
  
  // Thème sombre/clair (simulation)
  const themeSwitch = document.getElementById('theme-switch');
  if (themeSwitch) {
    themeSwitch.addEventListener('click', function() {
      document.body.classList.toggle('dark-theme');
      
      // Changer l'icône
      const icon = themeSwitch.querySelector('i');
      if (!icon) return;
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
