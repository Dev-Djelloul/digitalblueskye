/**
 * Script pour la gestion de la newsletter
 */
document.addEventListener('DOMContentLoaded', function() {
  const newsletterForms = document.querySelectorAll('.newsletter-form');
  
  if (newsletterForms.length > 0) {
    newsletterForms.forEach(form => {
      form.addEventListener('submit', function(e) {
        e.preventDefault();
        
        const emailInput = this.querySelector('input[type="email"]');
        const submitButton = this.querySelector('button[type="submit"]');
        
        if (emailInput && emailInput.value) {
          // Vérifier que l'email a un format valide
          const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
          if (!emailPattern.test(emailInput.value)) {
            // Afficher une erreur pour email invalide
            showMessage(form, 'newsletter.errorMessage', 'error');
            return;
          }
          
          // Désactiver le bouton pendant le "traitement"
          if (submitButton) {
            submitButton.disabled = true;
            const originalText = submitButton.textContent;
            submitButton.textContent = submitButton.getAttribute('data-loading-text') || '...';
          }
          
          // Simulation d'un appel API (à remplacer par votre véritable appel API)
          setTimeout(() => {
            // Réactiver le bouton
            if (submitButton) {
              submitButton.disabled = false;
              submitButton.textContent = submitButton.getAttribute('data-success-text') || '✓';
              
              // Remettre le texte original après un délai
              setTimeout(() => {
                submitButton.textContent = originalText;
              }, 2000);
            }
            
            // Message de succès
            showMessage(form, 'newsletter.successMessage');
            
            // Effacer l'entrée
            emailInput.value = '';
          }, 800);
        }
      });
    });
  }
  
  // Fonction utilitaire pour afficher un message
  function showMessage(form, i18nKey, type = 'success') {
    // Supprimer tout message existant
    const existingMessage = form.parentNode.querySelector('.newsletter-success-message, .newsletter-error-message');
    if (existingMessage) existingMessage.remove();
    
    // Créer le nouveau message
    const message = document.createElement('div');
    message.className = type === 'success' ? 'newsletter-success-message' : 'newsletter-error-message';
    message.setAttribute('data-i18n', i18nKey);
    
    // Déterminer la langue actuelle
    const currentLang = document.documentElement.lang || 'fr';
    
    // Définir le texte selon le type et la langue
    if (type === 'success') {
      message.textContent = currentLang === 'en' ? 
        'Thank you for subscribing to the newsletter!' : 
        'Merci de vous être inscrit à la newsletter !';
    } else {
      message.textContent = currentLang === 'en' ? 
        'Please enter a valid email address.' : 
        'Veuillez entrer une adresse email valide.';
      
      // Style spécifique pour l'erreur
      message.style.color = '#ff4c4c';
    }
    
    // Insérer le message après le formulaire
    form.insertAdjacentElement('afterend', message);
    
    // Faire disparaître le message après un délai
    setTimeout(() => {
      message.style.opacity = '0';
      setTimeout(() => message.remove(), 500);
    }, 3000);
  }
});