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

  const certColumns = Array.from(document.querySelectorAll('.trust-card-merged-col'));
  if (!certColumns.length) return;

  certColumns.forEach((col) => {
    const button = col.querySelector('.trust-cert-toggle');
    if (!button) return;
    setToggleState(col, false);
    button.addEventListener('click', () => {
      const isExpanded = button.getAttribute('aria-expanded') === 'true';
      setToggleState(col, !isExpanded);
    });
  });

  document.addEventListener('translationCompleted', () => {
    certColumns.forEach((col) => {
      const button = col.querySelector('.trust-cert-toggle');
      if (!button) return;
      const isExpanded = button.getAttribute('aria-expanded') === 'true';
      button.setAttribute('aria-label', getToggleLabel(isExpanded));
      button.setAttribute('title', getToggleLabel(isExpanded));
    });
  });
});
