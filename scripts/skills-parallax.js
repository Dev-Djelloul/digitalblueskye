/**
 * Script pour l'effet parallaxe sur les icônes de compétences
 */
document.addEventListener('DOMContentLoaded', function() {
  // Sélectionner tous les conteneurs de catégories de compétences
  const skillsCategories = document.querySelectorAll('.skills-category');
  
  skillsCategories.forEach(category => {
    // Ajouter l'événement de suivi de souris à chaque catégorie
    category.addEventListener('mousemove', e => {
      const skillIcons = category.querySelectorAll('.skill-icon');
      const rect = category.getBoundingClientRect();
      
      // Calculer la position relative de la souris dans le conteneur
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;
      
      // Calculer les pourcentages (de -1 à 1)
      const xPercent = (mouseX / rect.width - 0.5) * 2;
      const yPercent = (mouseY / rect.height - 0.5) * 2;
      
      // Appliquer le mouvement à chaque icône avec une intensité variable
      skillIcons.forEach(icon => {
        // Créer un facteur d'intensité aléatoire mais fixe pour chaque icône
        // On utilise le dataset pour stocker cette valeur
        if (!icon.dataset.parallaxFactor) {
          icon.dataset.parallaxFactor = (Math.random() * 0.5 + 0.5).toFixed(2); // Entre 0.5 et 1
        }
        
        const factor = parseFloat(icon.dataset.parallaxFactor);
        const img = icon.querySelector('img');
        
        // Mouvement léger basé sur la position de la souris
        const moveX = xPercent * 10 * factor;
        const moveY = yPercent * 10 * factor;
        const rotation = Math.max(-3, Math.min(3, xPercent * 5));
        
        img.style.transform = `translate(${moveX}px, ${moveY}px) rotate(${rotation}deg)`;
      });
    });
    
    // Réinitialiser la position quand la souris quitte la catégorie
    category.addEventListener('mouseleave', () => {
      const skillIcons = category.querySelectorAll('.skill-icon img');
      skillIcons.forEach(img => {
        img.style.transform = 'translate(0, 0) rotate(0deg)';
      });
    });
  });
});