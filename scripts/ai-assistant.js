document.addEventListener('DOMContentLoaded', function () {
  function ensureAssistantMarkup() {
    if (document.getElementById('ai-assistant-launcher') && document.getElementById('ai-assistant-panel')) {
      return;
    }

    const launcherMarkup = [
      '<button id="ai-assistant-launcher" class="ai-assistant-launcher" type="button"',
      'aria-controls="ai-assistant-panel" aria-expanded="false" aria-label="Open AI assistant" data-i18n-title="assistant.openTitle">',
      '<span class="ai-assistant-launcher__dot" aria-hidden="true"></span>',
      '<span data-i18n="assistant.launcher">Digital IA</span>',
      '</button>'
    ].join('');

    const panelMarkup = [
      '<aside id="ai-assistant-panel" class="ai-assistant-panel" aria-hidden="true" role="dialog" aria-label="Blue Skye AI Assistant">',
      '<header class="ai-assistant-header">',
      '<div class="ai-assistant-title-wrap">',
      '<h2 class="ai-assistant-title" data-i18n="assistant.panelTitle">Digital Blue Skye AI</h2>',
      '</div>',
      '<button id="ai-assistant-close" class="ai-assistant-close" type="button" title="Fermer" data-i18n-title="assistant.closeTitle" aria-label="Close">&times;</button>',
      '</header>',
      '<div id="ai-assistant-messages" class="ai-assistant-messages" aria-live="polite"></div>',
      '<div id="ai-assistant-quick-actions" class="ai-assistant-quick-actions"></div>',
      '<form id="ai-assistant-form" class="ai-assistant-form">',
      '<input id="ai-assistant-input" type="text" name="message" autocomplete="off" placeholder="Posez votre question..." data-i18n-placeholder="assistant.inputPlaceholder" />',
      '<button type="submit" data-i18n="assistant.send">Envoyer</button>',
      '</form>',
      '</aside>'
    ].join('');

    document.body.insertAdjacentHTML('beforeend', launcherMarkup + panelMarkup);
  }

  ensureAssistantMarkup();

  const launcher = document.getElementById('ai-assistant-launcher');
  const panel = document.getElementById('ai-assistant-panel');
  const closeButton = document.getElementById('ai-assistant-close');
  const messages = document.getElementById('ai-assistant-messages');
  const quickActions = document.getElementById('ai-assistant-quick-actions');
  const form = document.getElementById('ai-assistant-form');
  const input = document.getElementById('ai-assistant-input');

  if (!launcher || !panel || !closeButton || !messages || !quickActions || !form || !input) return;

  const isInfinityFreeHost = /(?:^|\.)infinityfreeapp\.com$/i.test(window.location.hostname)
    || /(?:^|\.)epizy\.com$/i.test(window.location.hostname)
    || /(?:^|\.)rf\.gd$/i.test(window.location.hostname)
    || /(?:^|\.)42web\.io$/i.test(window.location.hostname);

  const API_ENDPOINT = isInfinityFreeHost
    ? '/backend/ai-assistant.php?i=1'
    : '/backend/ai-assistant.php';
  const sessionId = getOrCreateSessionId();

  const copy = {
    fr: {
      launcher: 'Digital IA',
      panelTitle: 'Digital Blue Skye IA',
      subtitle: '',
      inputPlaceholder: 'Posez votre question...',
      send: 'Envoyer',
      openTitle: "Ouvrir l'assistant IA",
      closeTitle: "Fermer l'assistant IA",
      welcome:
        'Bonjour, je suis l\'assistant IA, Digital Blue Skye. Je vous oriente vers la bonne page en quelques secondes.',
      trust:
        "Assistant IA informatif. Ne partagez pas de donnees personnelles sensibles.",
      empty: 'Ecrivez votre besoin pour que je vous guide.',
      loading: 'Je regarde cela...',
      technicalError:
        "Je rencontre une difficulte technique. Vous pouvez passer par le formulaire de contact.",
      quickActions: [
        { key: 'profile', label: 'Profil chef de projet digital' },
        { key: 'projects', label: 'Projets pertinents' },
        { key: 'governance', label: 'Question RGPD / IA' },
        { key: 'contact', label: 'Demande de mission' }
      ]
    },
    en: {
      launcher: 'Digital AI',
      panelTitle: 'Digital Blue Skye AI',
      subtitle: '',
      inputPlaceholder: 'Ask your question...',
      send: 'Send',
      openTitle: 'Open AI assistant',
      closeTitle: 'Close AI assistant',
      welcome:
        'Hello, I am the AI Assistant of Digital Blue Skye. I can route you to the right page in seconds.',
      trust:
        'AI assistant for guidance only. Do not share sensitive personal data.',
      empty: 'Share your need and I will route you.',
      loading: 'Let me check that...',
      technicalError:
        'I am having a technical issue. You can use the contact form directly.',
      quickActions: [
        { key: 'profile', label: 'Digital PM profile' },
        { key: 'projects', label: 'Relevant projects' },
        { key: 'governance', label: 'GDPR / AI question' },
        { key: 'contact', label: 'Project request' }
      ]
    }
  };

  const chatHistory = [];
  let hasUserInteracted = false;

  function getOrCreateSessionId() {
    const storageKey = 'dbs_ai_session_id';

    try {
      const existing = localStorage.getItem(storageKey);
      if (existing) {
        return existing;
      }

      const generated = `ai_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
      localStorage.setItem(storageKey, generated);
      return generated;
    } catch (error) {
      return `ai_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
    }
  }

  function language() {
    const lang = (document.documentElement.lang || 'fr').toLowerCase();
    return lang.startsWith('en') ? 'en' : 'fr';
  }

  function activeCopy() {
    return copy[language()];
  }

  function openAssistant() {
    panel.classList.add('is-open');
    panel.setAttribute('aria-hidden', 'false');
    launcher.setAttribute('aria-expanded', 'true');
    document.documentElement.classList.add('ai-assistant-open');
    document.body.classList.add('ai-assistant-open');
    setTimeout(() => input.focus(), 60);
  }

  function closeAssistant() {
    panel.classList.remove('is-open');
    panel.setAttribute('aria-hidden', 'true');
    launcher.setAttribute('aria-expanded', 'false');
    document.documentElement.classList.remove('ai-assistant-open');
    document.body.classList.remove('ai-assistant-open');
  }

  function applyStaticCopy() {
    const c = activeCopy();
    const launcherText = launcher.querySelector('[data-i18n="assistant.launcher"], span:not(.ai-assistant-launcher__dot)');
    const titleEl = panel.querySelector('.ai-assistant-title');
    const subtitleEl = panel.querySelector('.ai-assistant-subtitle');
    const submitButton = form.querySelector('button[type="submit"]');

    if (launcherText) launcherText.textContent = c.launcher;
    if (titleEl) titleEl.textContent = c.panelTitle;
    if (subtitleEl) subtitleEl.textContent = c.subtitle;
    if (submitButton) submitButton.textContent = c.send;

    input.placeholder = c.inputPlaceholder;
    launcher.setAttribute('aria-label', c.openTitle);
    launcher.setAttribute('title', c.openTitle);
    closeButton.setAttribute('aria-label', c.closeTitle);
    closeButton.setAttribute('title', c.closeTitle);
    panel.setAttribute('aria-label', c.panelTitle);
  }

  function addMessage(kind, text, cta) {
    const bubble = document.createElement('article');
    bubble.className = `ai-assistant-message ai-assistant-message--${kind}`;

    const body = document.createElement('p');
    body.textContent = text;
    bubble.appendChild(body);

    if (cta && cta.href && cta.label) {
      const link = document.createElement('a');
      link.className = 'ai-assistant-link';
      link.href = cta.href;
      link.textContent = cta.label;
      link.dataset.assistantCtaHref = cta.href;
      bubble.appendChild(link);
    }

    messages.appendChild(bubble);
    messages.scrollTop = messages.scrollHeight;
    return bubble;
  }

  function resetAssistantMessages() {
    const c = activeCopy();
    messages.innerHTML = '';
    addMessage('bot', c.welcome);
  }

  function renderQuickActions() {
    const c = activeCopy();
    quickActions.innerHTML = '';

    c.quickActions.forEach((item) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'ai-assistant-quick-action';
      button.dataset.action = item.key;
      button.textContent = item.label;
      quickActions.appendChild(button);
    });
  }

  function pushHistory(role, content) {
    chatHistory.push({ role, content });

    if (chatHistory.length > 10) {
      chatHistory.splice(0, chatHistory.length - 10);
    }
  }

  async function sendEvent(eventType, eventValue, meta) {
    try {
      await fetch(API_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'event',
          event_type: eventType,
          event_value: eventValue || null,
          language: language(),
          session_id: sessionId,
          page_url: window.location.pathname,
          meta: meta || null
        })
      });
    } catch (error) {
      // Event logging should stay transparent for users.
    }
  }

  async function requestAssistantReply(userText) {
    const loadingBubble = addMessage('bot', activeCopy().loading);

    try {
      const response = await fetch(API_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'chat',
          message: userText,
          history: chatHistory,
          language: language(),
          session_id: sessionId,
          page_url: window.location.pathname
        })
      });

      const payload = await response.json();
      loadingBubble.remove();

      if (!response.ok || !payload || payload.ok !== true || !payload.reply) {
        addMessage('bot', activeCopy().technicalError, {
          label: language() === 'en' ? 'Go to contact' : 'Aller au contact',
          href: '/pages/contact.html'
        });
        sendEvent('assistant_error_response', 'invalid_payload');
        return;
      }

      addMessage('bot', payload.reply, payload.cta || null);
      pushHistory('assistant', payload.reply);

      if (payload.fallback === true) {
        sendEvent('assistant_fallback', payload.fallback_reason || 'unknown');
      }
    } catch (error) {
      loadingBubble.remove();
      addMessage('bot', activeCopy().technicalError, {
        label: language() === 'en' ? 'Go to contact' : 'Aller au contact',
        href: '/pages/contact.html'
      });
      sendEvent('assistant_error_response', 'network_or_parse_error');
    }
  }

  launcher.addEventListener('click', function () {
    if (panel.classList.contains('is-open')) {
      closeAssistant();
      return;
    }

    openAssistant();
    sendEvent('assistant_open', 'launcher_click');
  });

  closeButton.addEventListener('click', function () {
    closeAssistant();
    sendEvent('assistant_close', 'header_close');
  });

  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape' && panel.classList.contains('is-open')) {
      closeAssistant();
      sendEvent('assistant_close', 'escape_key');
    }
  });

  quickActions.addEventListener('click', function (event) {
    const target = event.target;

    if (!(target instanceof HTMLButtonElement)) {
      return;
    }

    const action = target.dataset.action;
    if (!action) {
      return;
    }

    const userText = target.textContent || '...';
    hasUserInteracted = true;
    addMessage('user', userText);
    pushHistory('user', userText);
    sendEvent('quick_action_click', action, { label: userText });
    requestAssistantReply(userText);
  });

  form.addEventListener('submit', function (event) {
    event.preventDefault();

    const userText = input.value.trim();
    if (!userText) {
      addMessage('bot', activeCopy().empty);
      return;
    }

    hasUserInteracted = true;
    addMessage('user', userText);
    pushHistory('user', userText);
    sendEvent('user_submit', userText.slice(0, 180));

    input.value = '';
    input.focus();

    requestAssistantReply(userText);
  });

  messages.addEventListener('click', function (event) {
    const target = event.target;

    if (!(target instanceof HTMLAnchorElement)) {
      return;
    }

    if (!target.dataset.assistantCtaHref) {
      return;
    }

    sendEvent('assistant_cta_click', target.dataset.assistantCtaHref);
  });

  document.addEventListener('translationCompleted', function (event) {
    if (!event || !event.detail) {
      return;
    }

    applyStaticCopy();
    renderQuickActions();

    if (!hasUserInteracted) {
      resetAssistantMessages();
    }
  });

  resetAssistantMessages();
  applyStaticCopy();
  renderQuickActions();
});
