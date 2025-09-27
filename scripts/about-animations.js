document.addEventListener('DOMContentLoaded', () => {
  const introText = document.querySelector('.intro-text');
  const profile = document.querySelector('.profile-photo-container');
  const loader = document.getElementById('loader-wrapper');

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
        observer.disconnect();
      }
    });
    observer.observe(loader, { attributes: true, attributeFilter: ['class'] });
  } else {
    launch();
  }

  setTimeout(() => typeof AOS !== 'undefined' && AOS.refresh(), 100);
});