document.addEventListener('DOMContentLoaded', function() {
  // Éléments du DOM
  const hamburger = document.getElementById('hamburger');
  const dropdownMenu = document.getElementById('dropdown-menu');
  const menuOverlay = document.getElementById('menu-overlay');
  const header = document.querySelector('.site-header') || document.querySelector('header');
  const logoVideo = document.getElementById('logo-video');

  // URLs du portfolio par langue
  const portfolioUrls = {
    fr: 'https://gamma.app/docs/Djelloul-ABID-0qnry3fypmgwui3?mode=doc',
    en: 'https://gamma.app/docs/Djelloul-ABID-Professional-Portfolio-v8mrtkftqc53rg5?mode=doc'
  };

  // Fonction pour mettre à jour l'URL du portfolio selon la langue
  function updatePortfolioLinks(language) {
    const lang = language || document.documentElement.lang || localStorage.getItem('language') || 'fr';
    const portfolioUrl = portfolioUrls[lang] || portfolioUrls.fr;

    // Mettre à jour le lien avatar du header
    const avatarLink = header.querySelector('.header-portfolio-avatar');
    if (avatarLink) {
      avatarLink.href = portfolioUrl;
    }

    // Mettre à jour le lien dans le menu dropdown
    const gammaLink = dropdownMenu.querySelector('.dropdown-gamma-link');
    if (gammaLink) {
      gammaLink.href = portfolioUrl;
    }
  }

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

    const adminLink = document.createElement('a');
    adminLink.className = 'header-admin-link header-social-link';
    adminLink.href = '/pages/admin.html';
    adminLink.target = '_blank';
    adminLink.rel = 'noopener noreferrer';
    adminLink.setAttribute('aria-label', 'Accès admin');
    adminLink.title = 'Admin DigitalBlueSkye';
    adminLink.innerHTML = `
      <img
        class="header-social-icon"
        src="/assets/images/ui/icons8-admin-48.png"
        alt=""
        width="22"
        height="22"
        loading="lazy"
        aria-hidden="true"
      />
    `;
    strip.appendChild(adminLink);

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

  function initHeaderPortfolioAvatar() {
    if (!header || header.querySelector('.header-portfolio-avatar')) {
      return;
    }

    const lang = document.documentElement.lang || localStorage.getItem('language') || 'fr';
    const portfolioUrl = portfolioUrls[lang] || portfolioUrls.fr;

    const avatarLink = document.createElement('a');
    avatarLink.className = 'header-portfolio-avatar';
    avatarLink.href = portfolioUrl;
    avatarLink.target = '_blank';
    avatarLink.rel = 'noopener noreferrer';
    avatarLink.setAttribute('aria-label', 'Voir le portfolio Gamma');
    avatarLink.title = 'Portfolio - Chef de projet digital';
    avatarLink.innerHTML = `
      <img
        src="/assets/images/portrait/my-notion-face-transparent.png"
        alt=""
        width="60"
        height="60"
        loading="lazy"
        aria-hidden="true"
      />
    `;

    header.appendChild(avatarLink);
  }

  initHeaderPortfolioAvatar();

  function initDropdownCloseButton() {
    if (!dropdownMenu || dropdownMenu.querySelector('.dropdown-close')) {
      return;
    }

    const closeButton = document.createElement('button');
    closeButton.className = 'dropdown-close';
    closeButton.type = 'button';
    closeButton.setAttribute('aria-label', 'Fermer le menu');
    closeButton.innerHTML = '<span aria-hidden="true"></span>';
    closeButton.addEventListener('click', closeMenu);
    dropdownMenu.insertBefore(closeButton, dropdownMenu.firstElementChild);
  }

  initDropdownCloseButton();

  function initGammaPortfolioLink() {
    if (!dropdownMenu || dropdownMenu.querySelector('.dropdown-gamma-item')) {
      return;
    }

    const navList = dropdownMenu.querySelector('.dropdown-nav > ul');
    if (!navList) {
      return;
    }

    const lang = document.documentElement.lang || localStorage.getItem('language') || 'fr';
    const portfolioUrl = portfolioUrls[lang] || portfolioUrls.fr;

    const gammaItem = document.createElement('li');
    gammaItem.className = 'dropdown-gamma-item';
    gammaItem.innerHTML = `
      <a
        class="dropdown-gamma-link"
        href="${portfolioUrl}"
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Voir le portfolio interactif Gamma"
      >
        <span data-i18n="nav.gammaPortfolio">Portfolio métier</span>
        <img
          class="dropdown-gamma-avatar"
          src="/assets/images/portrait/my-notion-face-transparent.png"
          alt=""
          width="34"
          height="34"
          loading="lazy"
          aria-hidden="true"
        />
      </a>
    `;

    navList.appendChild(gammaItem);
  }

  initGammaPortfolioLink();

  // Écouter les changements de langue depuis translator.js
  document.addEventListener('translationCompleted', function(event) {
    const language = event.detail?.language || document.documentElement.lang || 'fr';
    updatePortfolioLinks(language);
  });

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
    document.querySelectorAll('.dropdown-submenu.is-open').forEach(submenu => {
      submenu.classList.remove('is-open');
      const submenuTrigger = submenu.querySelector('.nav-link-with-submenu');
      if (submenuTrigger) submenuTrigger.setAttribute('aria-expanded', 'false');
    });
    // a11y
    hamburger.setAttribute('aria-expanded', 'false');
  }

  // Clic hamburger: comportement unique sur tous les supports.
  hamburger.addEventListener('click', function(e) {
    e.preventDefault();
    if (dropdownMenu.classList.contains('active')) closeMenu();
    else openMenu();
  });

  // Fermer le menu en cliquant sur l'overlay
  if (menuOverlay) {
    menuOverlay.addEventListener('click', closeMenu);
  }

  // Nettoyer le focus du sous-menu quand la souris sort, sans ouverture au survol.
  const dropdownSubmenus = document.querySelectorAll('.dropdown-submenu');
  dropdownSubmenus.forEach(submenu => {
    const submenuTrigger = submenu.querySelector('.nav-link-with-submenu');
    if (submenuTrigger) {
      submenuTrigger.setAttribute('role', 'button');
      submenuTrigger.setAttribute('aria-expanded', 'false');
      submenuTrigger.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        const isOpen = submenu.classList.toggle('is-open');
        submenuTrigger.setAttribute('aria-expanded', String(isOpen));
      });
    }

    submenu.addEventListener('mouseleave', () => {
      const active = document.activeElement;
      if (active && submenu.contains(active)) {
        active.blur();
      }
    });
  });
  
  // Fermer le menu en cliquant sur les liens de navigation (sauf liens de langue)
  const navLinks = document.querySelectorAll('.dropdown-nav a:not(#switch-to-en):not(#switch-to-fr):not(.nav-link-with-submenu)');
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
