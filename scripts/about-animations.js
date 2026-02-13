document.addEventListener('DOMContentLoaded', () => {
  const introText = document.querySelector('.intro-text');
  const profile = document.querySelector('.profile-photo-container');
  const loader = document.getElementById('loader-wrapper');
  const isAboutPage = document.body.classList.contains('page-about');

  function isElementInViewport(element) {
    const rect = element.getBoundingClientRect();
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
    return rect.top < viewportHeight * 0.95 && rect.bottom > 0;
  }

  function refreshAboutAnimations() {
    if (!isAboutPage || typeof AOS === 'undefined') return;

    // La traduction remplace du HTML dynamique (timeline/process): il faut un refresh complet.
    if (typeof AOS.refreshHard === 'function') {
      AOS.refreshHard();
    } else {
      AOS.refresh();
    }

    // Si l'utilisateur est déjà sur la section timeline au moment du switch langue,
    // certains éléments peuvent rester en état caché; on les révèle s'ils sont dans le viewport.
    const visibleAnimatedElements = document.querySelectorAll('.about-text-box [data-aos], .about-text-box[data-aos]');
    visibleAnimatedElements.forEach((element) => {
      if (isElementInViewport(element)) {
        element.classList.add('aos-animate');
      }
    });
  }

  const launch = () => {
    if (!profile) return;
    profile.style.opacity = '0';
    profile.style.transform = 'translateY(-500px)';
    profile.style.transition = 'opacity 1s ease, transform 1s ease';
    setTimeout(() => {
      profile.style.opacity = '1';
      profile.style.transform = 'translateX(0)';
    }, 1200);
  };

  if (introText) introText.style.display = 'block';

  if (loader) {
    const observer = new MutationObserver((mutations) => {
      if (mutations[0].target.classList.contains('hidden')) {
        launch();
        setTimeout(refreshAboutAnimations, 100);
        observer.disconnect();
      }
    });
    observer.observe(loader, { attributes: true, attributeFilter: ['class'] });
  } else {
    launch();
    setTimeout(refreshAboutAnimations, 100);
  }

  setTimeout(refreshAboutAnimations, 100);
  document.addEventListener('translationCompleted', () => {
    setTimeout(refreshAboutAnimations, 120);
  });
});
