document.addEventListener('DOMContentLoaded', function() {
  const newsletterForm = document.querySelector('.newsletter-form');
  
  if (newsletterForm) {
    const submitButton = newsletterForm.querySelector('button[type="submit"]');
    const emailInput = newsletterForm.querySelector('input[type="email"]');
    const originalButtonText = submitButton ? submitButton.textContent : 'S\'inscrire';
    
    // Validation en temps réel de l'email
    if (emailInput) {
      emailInput.addEventListener('input', function() {
        const isValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(this.value);
        this.classList.toggle('valid-email', isValid);
        this.classList.toggle('invalid-email', this.value && !isValid);
      });
    }
    
    // Animation de soumission
    newsletterForm.addEventListener('submit', function() {
      if (submitButton) {
        submitButton.textContent = '...';
        submitButton.classList.add('submitting');
        
        setTimeout(() => {
          submitButton.textContent = '✓';
          submitButton.classList.remove('submitting');
          submitButton.classList.add('success');
          
          setTimeout(() => {
            submitButton.textContent = originalButtonText;
            submitButton.classList.remove('success');
          }, 1500);
        }, 1000);
      }
    });
    
    // Sauvegarder l'email dans localStorage pour préremplir le formulaire plus tard
    if (localStorage.getItem('userEmail')) {
      const savedEmailForms = document.querySelectorAll('input[type="email"]');
      savedEmailForms.forEach(input => {
        if (!input.value) input.value = localStorage.getItem('userEmail');
      });
    }
    
    // Stocker l'email quand l'utilisateur commence à taper
    if (emailInput) {
      emailInput.addEventListener('change', function() {
        if (this.value) localStorage.setItem('userEmail', this.value);
      });
    }
  }
});