/**
 * Footer Injector - Injecte automatiquement le footer sur toutes les pages
 * Simplifie la maintenance et assure la cohérence du footer
 */

function injectFooter() {
  // Vérifier si un footer existe déjà
  if (document.querySelector('footer#footer')) {
    return; // Ne pas injecter si le footer existe déjà
  }

  // Template HTML du footer
  const footerHTML = `
    <footer id="footer">
      <div class="footer-container">
        <!-- Section About (réduite) -->
        <div class="footer-section footer-about">
          <h3 data-i18n="footer.about">À propos</h3>
          <p data-i18n="footer.aboutDesc">Chef de projet digital & consultant en stratégie numérique.</p>
        </div>

        <!-- Section Services -->
        <div class="footer-section">
          <h3 data-i18n="footer.services">Services</h3>
          <ul>
            <li><a href="/pages/projects.html" data-i18n="footer.projects">Nos projets</a></li>
            <li><a href="/blog/digital/blogArticles.html" data-i18n="footer.blog">Blog & Articles</a></li>
            <li><a href="/pages/about.html" data-i18n="footer.expertise">Mon expertise</a></li>
            <li><a href="/pages/contact.html" data-i18n="footer.contact">Formulaire de contact</a></li>
          </ul>
        </div>

        <!-- Section Réseaux Sociaux -->
        <div class="footer-section">
          <h3 data-i18n="footer.followUs">Suivez-moi</h3>
          <div class="footer-social">
            <a href="https://github.com/Dev-Djelloul" target="_blank" rel="noopener noreferrer" title="GitHub">
              <img src="/assets/images/ui/icons8-github-64.png" alt="Github" />
            </a>
            <a href="https://www.linkedin.com/in/yellowblueskye/" target="_blank" rel="noopener noreferrer" title="LinkedIn">
              <img src="/assets/images/ui/icons8-linkedin-64.png" alt="LinkedIn" />
            </a>
            <a href="https://x.com/digitalblueskye" target="_blank" rel="noopener noreferrer" title="X">
              <img src="/assets/images/ui/icons8-x-64.png" alt="X" />
            </a>
          </div>
        </div>

        <!-- Section Légal -->
        <div class="footer-section">
          <h3 data-i18n="footer.legal">Légal</h3>
          <ul>
            <li><a href="#" data-i18n="footer.privacy">Politique de confidentialité</a></li>
            <li><a href="#" data-i18n="footer.terms">Conditions d'utilisation</a></li>
            <li><a href="#" data-i18n="footer.cookies">Gestion des cookies</a></li>
          </ul>
        </div>
      </div>

      <!-- Copyright -->
      <div class="footer-bottom">
        <p data-i18n="footer.copyright">
          &copy; 2025 Digitalblueskye. Tous droits réservés.
        </p>
      </div>
    </footer>
  `;

  // Injecter le footer avant </body>
  const bodyTag = document.querySelector('body');
  if (bodyTag) {
    bodyTag.insertAdjacentHTML('beforeend', footerHTML);

    // Si le translator est disponible, traduire les clés data-i18n du footer
    if (typeof updateTranslations === 'function') {
      updateTranslations();
    }
  }
}

// Attendre que le DOM soit chargé
document.addEventListener('DOMContentLoaded', injectFooter);

// Également injecter si le script est chargé après DOMContentLoaded
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', injectFooter);
} else {
  injectFooter();
}
