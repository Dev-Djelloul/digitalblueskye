document.addEventListener('DOMContentLoaded', () => {
  function getToggleLabel(expanded) {
    const lang = (document.documentElement.lang || 'fr').toLowerCase().startsWith('en') ? 'en' : 'fr';
    if (lang === 'en') {
      return expanded ? 'Hide details' : 'Show details';
    }
    return expanded ? 'Masquer les détails' : 'Afficher les détails';
  }

  function setToggleState(col, expanded) {
    const button = col.querySelector('.trust-cert-toggle');
    const content = col.querySelector('.trust-cert-content');
    if (!button || !content) return;
    col.classList.toggle('is-open', expanded);
    button.setAttribute('aria-expanded', expanded ? 'true' : 'false');
    button.setAttribute('aria-label', getToggleLabel(expanded));
    button.setAttribute('title', getToggleLabel(expanded));
    content.hidden = !expanded;
  }

  function setMergedToggleState(card, expanded) {
    const button = card.querySelector('.trust-cert-toggle--merged');
    const contents = Array.from(card.querySelectorAll('.trust-cert-content'));
    const columns = Array.from(card.querySelectorAll('.trust-card-merged-col'));
    if (!button || !contents.length) return;
    card.classList.toggle('is-open', expanded);
    columns.forEach((col) => col.classList.toggle('is-open', expanded));
    contents.forEach((content) => {
      content.hidden = !expanded;
    });
    button.setAttribute('aria-expanded', expanded ? 'true' : 'false');
    button.setAttribute('aria-label', getToggleLabel(expanded));
    button.setAttribute('title', getToggleLabel(expanded));
  }

  const mergedCards = Array.from(document.querySelectorAll('.trust-card--merged'));
  mergedCards.forEach((card) => {
    const button = card.querySelector('.trust-cert-toggle--merged');
    if (!button) return;
    setMergedToggleState(card, false);
    button.addEventListener('click', () => {
      const isExpanded = button.getAttribute('aria-expanded') === 'true';
      setMergedToggleState(card, !isExpanded);
    });
  });

  const certColumns = Array.from(document.querySelectorAll('.trust-card-merged-col'));

  certColumns.forEach((col) => {
    const button = col.querySelector('.trust-cert-toggle');
    if (!button) return;
    setToggleState(col, false);
    button.addEventListener('click', () => {
      const isExpanded = button.getAttribute('aria-expanded') === 'true';
      setToggleState(col, !isExpanded);
    });
  });

  // Ouverture automatique du bloc OpenClassrooms / Studi au scroll, une seule fois.
  // On ne commence à observer qu'après un premier vrai geste de scroll de l'utilisateur,
  // pour ne jamais ouvrir le bloc automatiquement dès le chargement (grand écran, page
  // courte...) : il ne doit s'ouvrir qu'en réaction à une action de scroll réelle.
  if ('IntersectionObserver' in window && mergedCards.length) {
    const startAutoOpen = () => {
      const autoOpenObserver = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          const card = entry.target;
          const button = card.querySelector('.trust-cert-toggle--merged');
          if (button && button.getAttribute('aria-expanded') !== 'true') {
            setMergedToggleState(card, true);
          }
          autoOpenObserver.unobserve(card);
        });
      }, { threshold: 0.4 });

      mergedCards.forEach((card) => autoOpenObserver.observe(card));
    };

    window.addEventListener('scroll', startAutoOpen, { once: true, passive: true });
  }

  document.addEventListener('translationCompleted', () => {
    mergedCards.forEach((card) => {
      const button = card.querySelector('.trust-cert-toggle--merged');
      if (!button) return;
      const isExpanded = button.getAttribute('aria-expanded') === 'true';
      button.setAttribute('aria-label', getToggleLabel(isExpanded));
      button.setAttribute('title', getToggleLabel(isExpanded));
    });

    certColumns.forEach((col) => {
      const button = col.querySelector('.trust-cert-toggle');
      if (!button) return;
      const isExpanded = button.getAttribute('aria-expanded') === 'true';
      button.setAttribute('aria-label', getToggleLabel(isExpanded));
      button.setAttribute('title', getToggleLabel(isExpanded));
    });
  });
});
