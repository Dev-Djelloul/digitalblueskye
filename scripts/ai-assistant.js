document.addEventListener('DOMContentLoaded', function () {
  function ensureAssistantMarkup() {
    if (document.getElementById('ai-assistant-launcher')) return;
    const markup = `
      <button id="ai-assistant-launcher" class="ai-assistant-launcher" type="button">
        <span class="ai-assistant-launcher__dot"></span>
        <span>Digital IA</span>
      </button>
      <aside id="ai-assistant-panel" class="ai-assistant-panel" aria-hidden="true">
        <header class="ai-assistant-header">
          <h2 class="ai-assistant-title">Digital Blue Skye AI</h2>
          <button id="ai-assistant-close" type="button">&times;</button>
        </header>
        <div id="ai-assistant-messages" class="ai-assistant-messages"></div>
        <div id="ai-assistant-quick-actions" class="ai-assistant-quick-actions"></div>
        <form id="ai-assistant-form" class="ai-assistant-form">
          <input id="ai-assistant-input" type="text" autocomplete="off" placeholder="Posez votre question...">
          <button type="submit">Envoyer</button>
        </form>
      </aside>`;
    document.body.insertAdjacentHTML('beforeend', markup);
  }

  ensureAssistantMarkup();

  const API_ENDPOINT = 'https://digitalblueskye-ai.djelloulabid75.workers.dev';
  const messagesContainer = document.getElementById('ai-assistant-messages');
  const input = document.getElementById('ai-assistant-input');
  let chatHistory = [];

  function escapeHtml(value) {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function formatBotMessageHtml(rawText) {
    const safe = escapeHtml(String(rawText || ''))
      .replace(/\r/g, '')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

    // If the model chains dashes inline, force one bullet per line.
    const normalizedBullets = safe.replace(/\s+-\s+/g, '\n- ');
    const lines = normalizedBullets.split('\n').map((line) => line.trim());

    let html = '';
    let inList = false;

    for (const line of lines) {
      if (!line) {
        if (inList) {
          html += '</ul>';
          inList = false;
        }
        continue;
      }

      if (line.startsWith('- ')) {
        if (!inList) {
          html += '<ul>';
          inList = true;
        }
        html += `<li>${line.slice(2).trim()}</li>`;
        continue;
      }

      if (inList) {
        html += '</ul>';
        inList = false;
      }
      html += `<p>${line}</p>`;
    }

    if (inList) {
      html += '</ul>';
    }

    return html || `<p>${safe}</p>`;
  }

  function addMessage(kind, text) {
    const bubble = document.createElement('article');
    bubble.className = `ai-assistant-message ai-assistant-message--${kind}`;

    if (kind === 'bot') {
      bubble.innerHTML = formatBotMessageHtml(text);
    } else {
      const p = document.createElement('p');
      p.textContent = text;
      bubble.appendChild(p);
    }

    messagesContainer.appendChild(bubble);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
    return bubble;
  }

  async function askAI(userText) {
    const loading = addMessage('bot', '...');
    try {
      const response = await fetch(API_ENDPOINT, {
        method: 'POST',
        // Utilisation de headers propres pour éviter les erreurs CORS OPTIONS
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: userText,
          history: chatHistory,
          mode: 'chat'
        })
      });

      const data = await response.json();
      loading.remove();

      if (data.ok) {
        addMessage('bot', data.reply);
        chatHistory.push({ role: 'user', content: userText });
        chatHistory.push({ role: 'assistant', content: data.reply });
      } else {
        addMessage('bot', "Erreur: " + (data.error || "Problème de connexion"));
      }
    } catch (e) {
      if(loading) loading.remove();
      addMessage('bot', "L'assistant est indisponible actuellement.");
    }
  }

  document.getElementById('ai-assistant-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text) return;
    addMessage('user', text);
    input.value = '';
    askAI(text);
  });

  document.getElementById('ai-assistant-launcher').addEventListener('click', () => {
    document.getElementById('ai-assistant-panel').classList.toggle('is-open');
  });

  document.getElementById('ai-assistant-close').addEventListener('click', () => {
    document.getElementById('ai-assistant-panel').classList.remove('is-open');
  });
  
  addMessage('bot', "Bonjour ! Comment puis-je vous aider ?");
});
