/**
 * Script pour la gestion du mode clair/sombre
 */
document.addEventListener('DOMContentLoaded', function() {
  const themeSwitch = document.getElementById('theme-switch');
  const moonIcon = themeSwitch.querySelector('.moon-icon');
  const sunIcon = themeSwitch.querySelector('.sun-icon');
  
  // Récupérer le thème enregistré ou utiliser le thème sombre par défaut
  const savedTheme = localStorage.getItem('theme') || 'dark';
  
  // Appliquer le thème sauvegardé au chargement
  applyTheme(savedTheme);
  
  // Fonction pour appliquer un thème
  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    
    // Mettre à jour l'apparence des icônes
    if (theme === 'light') {
      moonIcon.style.display = 'none';
      sunIcon.style.display = 'block';
    } else {
      moonIcon.style.display = 'block';
      sunIcon.style.display = 'none';
    }
    
    // Enregistrer le thème dans localStorage
    localStorage.setItem('theme', theme);
  }
  
  // Gérer le clic sur le bouton
  themeSwitch.addEventListener('click', function() {
    const currentTheme = document.documentElement.getAttribute('data-theme');
    const newTheme = currentTheme === 'light' ? 'dark' : 'light';
    
    applyTheme(newTheme);
    
    // Animation lors du changement
    document.body.style.transition = 'background-color 0.5s ease, color 0.5s ease';
    setTimeout(() => {
      document.body.style.transition = '';
    }, 500);
  });
});