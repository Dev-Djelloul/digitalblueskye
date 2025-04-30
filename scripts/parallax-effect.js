/**
 * Script pour l'effet parallaxe sur les images
 */
document.addEventListener('DOMContentLoaded', function() {
  // Sélectionner toutes les project-card
  const projectCards = document.querySelectorAll('.project-card');
  
  // Convertir les images simples en images avec effet parallaxe
  projectCards.forEach(card => {
    const img = card.querySelector('img');
    if (!img) return;
    
    // Sauvegarder les attributs importants
    const src = img.getAttribute('src');
    const alt = img.getAttribute('alt');
    
    // Créer un conteneur pour l'effet parallaxe
    const container = document.createElement('div');
    container.className = 'parallax-container';
    container.style.height = img.offsetHeight + 'px';
    
    // Créer la nouvelle image avec classe parallaxe
    const parallaxImg = document.createElement('img');
    parallaxImg.className = 'parallax-image';
    parallaxImg.src = src;
    parallaxImg.alt = alt;
    
    // Remplacer l'image par le conteneur avec l'effet parallaxe
    container.appendChild(parallaxImg);
    img.parentNode.replaceChild(container, img);
    
    // Ajouter l'effet de mouvement
    container.addEventListener('mousemove', e => {
      const rect = container.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;
      
      // Calculer la position relative (de -1 à 1)
      const xPos = (mouseX / rect.width - 0.5) * 2;
      const yPos = (mouseY / rect.height - 0.5) * 2;
      
      // Appliquer la transformation (mouvement inverse pour effet naturel)
      parallaxImg.style.transform = `translateX(${xPos * -15}px) translateY(${yPos * -15}px)`;
    });
    
    // Réinitialiser la position au départ de la souris
    container.addEventListener('mouseleave', () => {
      parallaxImg.style.transform = 'translateX(0) translateY(0)';
    });
  });
});