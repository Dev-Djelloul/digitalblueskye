 document.addEventListener('DOMContentLoaded', function () {
  function normalizeLanguage(value) {
    if (!value) return '';
    return value.toString().trim().toLowerCase().split(/[-_]/)[0] || '';
  }

  function getCookie(name) {
    const cookieString = `; ${document.cookie}`;
    const parts = cookieString.split(`; ${name}=`);
    if (parts.length === 2) return decodeURIComponent(parts.pop().split(';').shift());
    return '';
  }

  function getPreferredLanguage() {
    return normalizeLanguage(localStorage.getItem('language'))
      || normalizeLanguage(getCookie('language'))
      || normalizeLanguage(document.documentElement.lang)
      || 'fr';
  }

  function getAssistantCurrentDateContext() {
    const now = new Date();
    const isoDate = now.toISOString().slice(0, 10);
    const formatter = new Intl.DateTimeFormat(currentLanguage === 'en' ? 'en-US' : 'fr-FR', {
      dateStyle: 'full',
      timeZone: 'Europe/Paris'
    });
    return {
      isoDate,
      localeDate: formatter.format(now),
      timezone: 'Europe/Paris'
    };
  }

  function getI18n(lang) {
    if (lang === 'en') {
      return {
        inputPlaceholder: 'Ask your question...',
        send: 'Send',
        voiceSelectLabel: 'Voice',
        voiceSelectAuto: 'Auto voice',
        attach: 'Add',
        attachMenu: 'Attachment options',
        attachFiles: 'Files',
        attachDrive: 'Google Drive',
        driveNotConfigured: 'Google Drive is not configured yet.',
        driveAuthFailed: 'Google Drive authentication failed.',
        drivePickerFailed: 'Unable to open Google Drive picker.',
        driveDownloadFailed: 'Unable to import file from Google Drive:',
        historyLabel: 'Conversations',
        newChat: 'New',
        deleteChat: 'Delete',
        sessionDefault: 'New conversation',
        selectedFiles: 'Selected files:',
        fileReady: 'Files are ready for analysis:',
        fileUnsupported: 'Unsupported file type:',
        fileReadFailed: 'Unable to read file:',
        imageReady: 'Image ready for visual analysis:',
        imageReadFailed: 'Unable to prepare image for visual analysis:',
        pdfLoading: 'Reading PDF content...',
        pdfNoText: 'No readable text found in PDF:',
        pdfReadFailed: 'Unable to read PDF:',
        ocrLoading: 'Reading image text (OCR)...',
        ocrNoText: 'No readable text found in image:',
        ocrUnavailable: 'OCR unavailable in this browser/session.',
        sendWithoutTextWithFiles: 'Please analyze the attached files.',
        copy: 'Copy',
        copied: 'Copied',
        scrollBottom: 'Go to latest message',
        expand: 'Expand',
        collapse: 'Collapse',
        maximizeTitle: 'Expand assistant',
        restoreTitle: 'Restore assistant',
        micOn: 'Enable microphone',
        micOff: 'Stop microphone',
        ttsOn: 'Voice playback enabled',
        ttsOff: 'Voice playback disabled',
        speechUnsupported: 'Voice dictation is not available on this browser',
        loading: '...',
        thinking: 'Thinking',
        rateLimitError: 'The AI provider is temporarily saturated. Please try again in a few moments.',
        friendlyApiError: 'I hit a temporary issue. Please try again in a few seconds.',
        fallbackConnectionError: 'Connection problem',
        assistantDown: 'The assistant is currently unavailable.',
        greeting: 'Hello! How can I help you?'
      };
    }
    return {
      inputPlaceholder: 'Posez votre question...',
      send: 'Envoyer',
      voiceSelectLabel: 'Voix',
      voiceSelectAuto: 'Voix auto',
      attach: 'Ajouter',
      attachMenu: "Options d'ajout",
      attachFiles: 'Fichiers',
      attachDrive: 'Google Drive',
      driveNotConfigured: "Google Drive n'est pas encore configuré.",
      driveAuthFailed: "L'authentification Google Drive a échoué.",
      drivePickerFailed: "Impossible d'ouvrir le sélecteur Google Drive.",
      driveDownloadFailed: "Impossible d'importer le fichier Google Drive :",
      historyLabel: 'Conversations',
      newChat: 'Nouveau',
      deleteChat: 'Supprimer',
      sessionDefault: 'Nouvelle conversation',
      selectedFiles: 'Fichiers sélectionnés :',
      fileReady: 'Fichiers prêts pour analyse :',
      fileUnsupported: 'Type de fichier non pris en charge :',
      fileReadFailed: 'Impossible de lire le fichier :',
      imageReady: "Image prête pour l'analyse visuelle :",
      imageReadFailed: "Impossible de préparer l'image pour l'analyse visuelle :",
      pdfLoading: 'Lecture du contenu PDF...',
      pdfNoText: 'Aucun texte lisible trouvé dans le PDF :',
      pdfReadFailed: 'Impossible de lire le PDF :',
      ocrLoading: 'Lecture du texte de l\u2019image (OCR)...',
      ocrNoText: 'Aucun texte lisible trouvé dans l\u2019image :',
      ocrUnavailable: 'OCR indisponible dans ce navigateur/session.',
      sendWithoutTextWithFiles: 'Merci d\u2019analyser les fichiers joints.',
      copy: 'Copier',
      copied: 'Copié',
      scrollBottom: 'Aller au dernier message',
      expand: 'Dérouler',
      collapse: 'Réduire',
      maximizeTitle: "Agrandir l'assistant IA",
      restoreTitle: "Réduire l'assistant IA",
      micOn: 'Activer le micro',
      micOff: 'Arrêter le micro',
      ttsOn: 'Lecture vocale activée',
      ttsOff: 'Lecture vocale désactivée',
      speechUnsupported: 'Dictée vocale non disponible sur ce navigateur',
      loading: '...',
      thinking: 'Réflexion',
      rateLimitError: "Le fournisseur IA est temporairement saturé. Réessaie dans quelques instants.",
      friendlyApiError: "Oups, je rencontre un souci temporaire. Réessaie dans quelques secondes.",
      fallbackConnectionError: 'Problème de connexion',
      assistantDown: "L'assistant est indisponible actuellement.",
      greeting: 'Bonjour ! Comment puis-je vous aider ?'
    };
  }

  let currentLanguage = getPreferredLanguage();
  let i18n = getI18n(currentLanguage);

  function resolveUiIconUrl(fileName) {
    const scriptEl = Array.from(document.scripts).find((script) => {
      const srcAttr = script.getAttribute('src') || '';
      return /(^|\/)scripts\/ai-assistant\.js(\?.*)?$/.test(srcAttr);
    });
    if (scriptEl?.src) {
      return new URL(`../assets/images/ui/${fileName}`, scriptEl.src).toString();
    }
    return `/assets/images/ui/${fileName}`;
  }
  const copyPasteIconUrl = resolveUiIconUrl('icons8-copy-paste-48.png');
  const filesIconUrl = resolveUiIconUrl('icons8-files-64.png');
  const driveIconUrl = resolveUiIconUrl('icons8-google-drive-64.png');
  const deleteIconUrl = resolveUiIconUrl('icons8-delete-48.png');

  function createAttachControlsMarkup() {
    return `
      <div class="ai-assistant-attach" id="ai-assistant-attach">
        <button id="ai-assistant-attach-toggle" class="ai-assistant-attach-toggle" type="button" aria-haspopup="true" aria-expanded="false" title="${i18n.attach}" aria-label="${i18n.attach}">+</button>
        <div id="ai-assistant-attach-menu" class="ai-assistant-attach-menu" role="menu" aria-label="${i18n.attachMenu}">
          <button id="ai-assistant-attach-file" class="ai-assistant-attach-item" type="button" role="menuitem">
            <img src="${filesIconUrl}" alt="" aria-hidden="true">
            <span>${i18n.attachFiles}</span>
          </button>
          <button id="ai-assistant-attach-drive" class="ai-assistant-attach-item" type="button" role="menuitem">
            <img src="${driveIconUrl}" alt="" aria-hidden="true">
            <span>${i18n.attachDrive}</span>
          </button>
        </div>
      </div>`;
  }

  function createSessionControlsMarkup() {
    return `
      <div class="ai-assistant-session-bar">
        <label class="ai-assistant-session-label" for="ai-assistant-session-select">${i18n.historyLabel}</label>
        <select id="ai-assistant-session-select" class="ai-assistant-session-select" aria-label="${i18n.historyLabel}"></select>
        <button id="ai-assistant-session-new" class="ai-assistant-session-new" type="button" title="${i18n.newChat}" aria-label="${i18n.newChat}">+</button>
        <button id="ai-assistant-session-delete" class="ai-assistant-session-delete" type="button" title="${i18n.deleteChat}" aria-label="${i18n.deleteChat}">
          <img src="${deleteIconUrl}" alt="" aria-hidden="true">
        </button>
      </div>`;
  }

  function createVoiceControlsMarkup(micIconUrl, voiceIconUrl) {
    return `
      <select id="ai-assistant-voice-select" class="ai-assistant-voice-select" aria-label="${i18n.voiceSelectLabel}" title="${i18n.voiceSelectLabel}"></select>
      <div class="ai-assistant-voice-controls">
        <button id="ai-assistant-mic" type="button" class="ai-assistant-voice-btn" title="${i18n.micOn}" aria-label="${i18n.micOn}">
          <img src="${micIconUrl}" alt="" aria-hidden="true">
        </button>
        <button id="ai-assistant-tts" type="button" class="ai-assistant-voice-btn is-active" title="${i18n.ttsOn}" aria-label="${i18n.ttsOn}">
          <img src="${voiceIconUrl}" alt="" aria-hidden="true">
        </button>
      </div>`;
  }

  function ensureAssistantMarkup() {
    const launcher = document.getElementById('ai-assistant-launcher');
    const panel = document.getElementById('ai-assistant-panel');
    const micIconUrl = resolveUiIconUrl('icons8-mic-48.png');
    const voiceIconUrl = resolveUiIconUrl('icons8-voice-64.png');
    if (!launcher || !panel) {
      const markup = `
        <button id="ai-assistant-launcher" class="ai-assistant-launcher" type="button">
          <img class="ai-assistant-launcher__robot" src="/assets/images/logo/Robot.png" alt="" width="56" height="56" loading="lazy" aria-hidden="true">
        </button>
        <aside id="ai-assistant-panel" class="ai-assistant-panel" aria-hidden="true">
          <header class="ai-assistant-header">
            <img class="ai-assistant-header-icon" src="/assets/images/logo/AI.png" alt="" width="42" height="46" loading="lazy" aria-hidden="true">
            <div class="ai-assistant-title-wrap">
              <h2 class="ai-assistant-title">Digital Blue Skye AI</h2>
            </div>
            <button id="ai-assistant-expand" class="ai-assistant-expand" type="button" title="${i18n.maximizeTitle}" aria-label="${i18n.maximizeTitle}" aria-pressed="false"><span aria-hidden="true"></span></button>
            <button id="ai-assistant-close" class="ai-assistant-close" type="button">&times;</button>
          </header>
          ${createSessionControlsMarkup()}
          <div id="ai-assistant-messages" class="ai-assistant-messages"></div>
          <button id="ai-assistant-scroll-bottom" class="ai-assistant-scroll-bottom" type="button" title="${i18n.scrollBottom}" aria-label="${i18n.scrollBottom}" aria-hidden="true">
            <span aria-hidden="true"></span>
          </button>
          <div id="ai-assistant-quick-actions" class="ai-assistant-quick-actions"></div>
          <form id="ai-assistant-form" class="ai-assistant-form">
            ${createAttachControlsMarkup()}
            <textarea id="ai-assistant-input" autocomplete="off" placeholder="${i18n.inputPlaceholder}" rows="1"></textarea>
            ${createVoiceControlsMarkup(micIconUrl, voiceIconUrl)}
            <button type="submit" class="ai-assistant-send-btn">${i18n.send}</button>
          </form>
          <span class="ai-assistant-resize-handle ai-assistant-resize-handle--nw" data-resize-corner="nw" aria-hidden="true"></span>
          <span class="ai-assistant-resize-handle ai-assistant-resize-handle--ne" data-resize-corner="ne" aria-hidden="true"></span>
          <span class="ai-assistant-resize-handle ai-assistant-resize-handle--sw" data-resize-corner="sw" aria-hidden="true"></span>
          <span class="ai-assistant-resize-handle ai-assistant-resize-handle--se" data-resize-corner="se" aria-hidden="true"></span>
        </aside>`;
      document.body.insertAdjacentHTML('beforeend', markup);
      return;
    }

    const form = document.getElementById('ai-assistant-form');
    const closeBtn = document.getElementById('ai-assistant-close');
    if (closeBtn) closeBtn.classList.add('ai-assistant-close');
    if (!form) return;

    if (!document.getElementById('ai-assistant-session-select')) {
      const header = document.querySelector('#ai-assistant-panel .ai-assistant-header');
      const wrapper = document.createElement('div');
      wrapper.innerHTML = createSessionControlsMarkup().trim();
      if (header && header.parentNode) {
        header.insertAdjacentElement('afterend', wrapper.firstElementChild);
      }
    }

    if (!document.getElementById('ai-assistant-scroll-bottom')) {
      const messages = document.getElementById('ai-assistant-messages');
      if (messages) {
        messages.insertAdjacentHTML(
          'afterend',
          `<button id="ai-assistant-scroll-bottom" class="ai-assistant-scroll-bottom" type="button" title="${i18n.scrollBottom}" aria-label="${i18n.scrollBottom}" aria-hidden="true"><span aria-hidden="true"></span></button>`
        );
      }
    }

    const submitBtn = form.querySelector('button[type="submit"]');
    if (submitBtn) submitBtn.classList.add('ai-assistant-send-btn');

    if (!document.getElementById('ai-assistant-attach-toggle')) {
      const wrapper = document.createElement('div');
      wrapper.innerHTML = createAttachControlsMarkup().trim();
      const attach = wrapper.firstElementChild;
      if (attach) {
        const reference = form.querySelector('#ai-assistant-input') || form.firstChild;
        if (reference) {
          form.insertBefore(attach, reference);
        } else {
          form.appendChild(attach);
        }
      }
    }

    if (!document.getElementById('ai-assistant-mic') || !document.getElementById('ai-assistant-tts')) {
      const submitButton = form.querySelector('.ai-assistant-send-btn') || form.querySelector('button[type="submit"]');
      const wrapper = document.createElement('div');
      wrapper.innerHTML = createVoiceControlsMarkup(micIconUrl, voiceIconUrl).trim();
      const appendedNodes = Array.from(wrapper.children);
      if (appendedNodes.length) {
        if (submitButton) {
          appendedNodes.forEach((node) => form.insertBefore(node, submitButton));
        } else {
          appendedNodes.forEach((node) => form.appendChild(node));
        }
      }
    } else if (!document.getElementById('ai-assistant-voice-select')) {
      const submitButton = form.querySelector('.ai-assistant-send-btn') || form.querySelector('button[type="submit"]');
      const select = document.createElement('select');
      select.id = 'ai-assistant-voice-select';
      select.className = 'ai-assistant-voice-select';
      if (submitButton) {
        form.insertBefore(select, submitButton);
      } else {
        form.appendChild(select);
      }
    }
  }

  ensureAssistantMarkup();

  const API_ENDPOINT = 'https://digitalblueskye-ai.djelloulabid75.workers.dev';
  const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.readonly';
  const DRIVE_PICKER_SCRIPT_URL = 'https://apis.google.com/js/api.js';
  const GOOGLE_IDENTITY_SCRIPT_URL = 'https://accounts.google.com/gsi/client';
  const DRIVE_API_KEY = String(window.DBS_GOOGLE_API_KEY || '').trim();
  const DRIVE_CLIENT_ID = String(window.DBS_GOOGLE_CLIENT_ID || '').trim();
  const DRIVE_APP_ID = String(window.DBS_GOOGLE_APP_ID || '').trim();
  const panel = document.getElementById('ai-assistant-panel');
  const panelHeader = panel ? panel.querySelector('.ai-assistant-header') : null;
  const launcherButton = document.getElementById('ai-assistant-launcher');
  const expandButton = document.getElementById('ai-assistant-expand');
  const closeButton = document.getElementById('ai-assistant-close');
  const messagesContainer = document.getElementById('ai-assistant-messages');
  const scrollBottomButton = document.getElementById('ai-assistant-scroll-bottom');
  const input = document.getElementById('ai-assistant-input');
  const sessionSelect = document.getElementById('ai-assistant-session-select');
  const sessionNewButton = document.getElementById('ai-assistant-session-new');
  const sessionDeleteButton = document.getElementById('ai-assistant-session-delete');
  const sessionLabel = document.querySelector('.ai-assistant-session-label');
  const attachRoot = document.getElementById('ai-assistant-attach');
  const attachToggle = document.getElementById('ai-assistant-attach-toggle');
  const attachMenu = document.getElementById('ai-assistant-attach-menu');
  const attachFileButton = document.getElementById('ai-assistant-attach-file');
  const attachDriveButton = document.getElementById('ai-assistant-attach-drive');
  const voiceSelect = document.getElementById('ai-assistant-voice-select');
  const micButton = document.getElementById('ai-assistant-mic');
  const ttsButton = document.getElementById('ai-assistant-tts');
  let fileInput = document.getElementById('ai-assistant-file-input');
  let chatHistory = [];
  let sessionsState = { activeSessionId: '', sessions: [] };
  let pendingFileContext = '';
  let pendingFileNames = [];
  let pendingVisionAttachments = [];
  let driveAccessToken = '';
  let pickerReadyPromise = null;
  let identityReadyPromise = null;
  let driveTokenClient = null;
  let isVoiceOutputEnabled = true;
  let isListening = false;
  let availableTtsVoices = [];
  let activeSpeechTracking = null;
  let speechTrackingToken = 0;
  const selectedTtsVoices = { fr: null, en: null };
  const voicePreferenceStorageKey = 'ai_assistant_voice_pref_v1';

  const preferredVoiceNames = {
    fr: ['Aurelie', 'Amelie', 'Virginie', 'Marie', 'Thomas'],
    en: ['Samantha', 'Karen', 'Allison', 'Ava', 'Serena', 'Moira', 'Daniel']
  };
  const conversationStorageKey = 'ai_assistant_conversations_v1';
  const panelPositionStorageKey = 'ai_assistant_panel_position_v1';
  const panelSizeStorageKey = 'ai_assistant_panel_size_v1';

  function setAssistantPanelOpen(open) {
    if (!panel) return;
    panel.classList.toggle('is-open', open);
    panel.setAttribute('aria-hidden', String(!open));
    if (launcherButton) {
      launcherButton.classList.toggle('is-panel-open', open);
      launcherButton.setAttribute('aria-expanded', String(open));
    }
  }

  function setAssistantExpanded(expanded) {
    if (!panel) return;
    panel.classList.toggle('is-expanded', expanded);
    if (expandButton) {
      const label = expanded ? i18n.restoreTitle : i18n.maximizeTitle;
      expandButton.classList.toggle('is-active', expanded);
      expandButton.setAttribute('aria-pressed', String(expanded));
      expandButton.setAttribute('aria-label', label);
      expandButton.title = label;
    }
  }

  function isConversationNearBottom() {
    if (!messagesContainer) return true;
    return messagesContainer.scrollHeight - messagesContainer.scrollTop - messagesContainer.clientHeight < 72;
  }

  function updateScrollBottomButton() {
    if (!scrollBottomButton || !messagesContainer) return;
    const shouldShow = panel?.classList.contains('is-open') && !isConversationNearBottom();
    scrollBottomButton.classList.toggle('is-visible', Boolean(shouldShow));
    scrollBottomButton.setAttribute('aria-hidden', String(!shouldShow));
    scrollBottomButton.tabIndex = shouldShow ? 0 : -1;
  }

  function scrollConversationToBottom(behavior = 'smooth') {
    if (!messagesContainer) return;
    messagesContainer.scrollTo({ top: messagesContainer.scrollHeight, behavior });
    window.setTimeout(updateScrollBottomButton, behavior === 'smooth' ? 260 : 0);
  }

  function isDesktopPanelDragEnabled() {
    return window.matchMedia('(min-width: 769px)').matches;
  }

  function clampPanelPosition(left, top) {
    if (!panel) return { left, top };
    const margin = 8;
    const docEl = document.documentElement;
    const maxLeft = Math.max(margin, docEl.clientWidth - panel.offsetWidth - margin);
    const maxTop = Math.max(margin, docEl.scrollHeight - panel.offsetHeight - margin);
    return {
      left: Math.min(Math.max(left, margin), maxLeft),
      top: Math.min(Math.max(top, margin), maxTop),
    };
  }

  function clampPanelSize(width, height) {
    const minWidth = 560;
    const minHeight = 420;
    const viewportMargin = 8;
    const maxWidth = Math.max(minWidth, window.innerWidth - (viewportMargin * 2));
    const maxHeight = Math.max(minHeight, window.innerHeight - (viewportMargin * 2));
    return {
      width: Math.min(Math.max(width, minWidth), maxWidth),
      height: Math.min(Math.max(height, minHeight), maxHeight),
    };
  }

  function applyPanelSize(width, height, persist = true) {
    if (!panel) return;
    const next = clampPanelSize(width, height);
    panel.style.width = `${next.width}px`;
    panel.style.height = `${next.height}px`;
    panel.style.maxWidth = 'none';
    panel.style.maxHeight = 'none';
    if (!persist) return;
    try {
      localStorage.setItem(panelSizeStorageKey, JSON.stringify(next));
    } catch (_) {}
  }

  function loadPanelSize() {
    if (!panel || !isDesktopPanelDragEnabled()) return;
    try {
      const raw = localStorage.getItem(panelSizeStorageKey);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      const width = Number(parsed?.width);
      const height = Number(parsed?.height);
      if (!Number.isFinite(width) || !Number.isFinite(height)) return;
      applyPanelSize(width, height, false);
    } catch (_) {}
  }

  function applyPanelPosition(left, top, persist = true) {
    if (!panel) return;
    const next = clampPanelPosition(left, top);
    panel.style.position = 'absolute';
    panel.style.left = `${next.left}px`;
    panel.style.top = `${next.top}px`;
    panel.style.transform = panel.classList.contains('is-open')
      ? 'translate(0, 0) scale(1)'
      : 'translate(0, 0) scale(0.98)';
    panel.classList.add('is-draggable');
    if (!persist) return;
    try {
      localStorage.setItem(panelPositionStorageKey, JSON.stringify(next));
    } catch (_) {}
  }

  function loadPanelPosition() {
    if (!panel || !isDesktopPanelDragEnabled()) return;
    try {
      const raw = localStorage.getItem(panelPositionStorageKey);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      const left = Number(parsed?.left);
      const top = Number(parsed?.top);
      if (!Number.isFinite(left) || !Number.isFinite(top)) return;
      applyPanelPosition(left, top, false);
    } catch (_) {}
  }

  function resetPanelPosition(removeSaved = false) {
    if (!panel) return;
    panel.classList.remove('is-draggable');
    panel.style.removeProperty('position');
    panel.style.removeProperty('left');
    panel.style.removeProperty('top');
    panel.style.removeProperty('transform');
    if (!removeSaved) return;
    try { localStorage.removeItem(panelPositionStorageKey); } catch (_) {}
  }

  function resetPanelSize(removeSaved = false) {
    if (!panel) return;
    panel.style.removeProperty('width');
    panel.style.removeProperty('height');
    panel.style.removeProperty('max-width');
    panel.style.removeProperty('max-height');
    if (!removeSaved) return;
    try { localStorage.removeItem(panelSizeStorageKey); } catch (_) {}
  }

  function placePanelInCurrentViewport() {
    if (!panel || !isDesktopPanelDragEnabled()) return;
    const panelWidth = panel.offsetWidth || Math.min(window.innerWidth - 24, 940);
    const panelHeight = panel.offsetHeight || Math.min(window.innerHeight - 128, 760);
    const left = window.scrollX + Math.max(8, Math.round((window.innerWidth - panelWidth) / 2));
    const top = window.scrollY + Math.max(8, Math.round((window.innerHeight - panelHeight) / 2));
    applyPanelPosition(left, top, false);
  }

  function setupPanelDrag() {
    if (!panel) return;
    let dragState = null;
    let resizeState = null;

    function autoScrollDuringDrag(event) {
      const edge = 36;
      const speed = 14;
      if (event.clientY >= window.innerHeight - edge) window.scrollBy(0, speed);
      else if (event.clientY <= edge) window.scrollBy(0, -speed);
    }

    function isInteractiveDragTarget(target) {
      if (!target || !target.closest) return false;
      return Boolean(target.closest(
        'input, textarea, button, select, option, a, label, [contenteditable="true"], .ai-assistant-attach-menu'
      ));
    }

    panelHeader?.addEventListener('mousedown', (event) => {
      if (!isDesktopPanelDragEnabled()) return;
      if (!panel.classList.contains('is-open')) return;
      if (panel.classList.contains('is-expanded')) return;
      if (event.button !== 0) return;
      if (isInteractiveDragTarget(event.target)) return;
      const rect = panel.getBoundingClientRect();
      const panelPageLeft = rect.left + window.scrollX;
      const panelPageTop = rect.top + window.scrollY;
      const offsetX = event.pageX - panelPageLeft;
      const offsetY = event.pageY - panelPageTop;
      const resizeHandleSize = 26;
      const isOnResizeHandle = offsetX >= rect.width - resizeHandleSize && offsetY >= rect.height - resizeHandleSize;
      if (isOnResizeHandle) return;
      dragState = { offsetX, offsetY };
      panel.classList.add('is-dragging');
      event.preventDefault();
    });

    window.addEventListener('mousemove', (event) => {
      if (!dragState || !panel) return;
      autoScrollDuringDrag(event);
      const left = event.pageX - dragState.offsetX;
      const top = event.pageY - dragState.offsetY;
      applyPanelPosition(left, top, false);
    });

    panel.querySelectorAll('[data-resize-corner]').forEach((handle) => {
      handle.addEventListener('mousedown', (event) => {
        if (!isDesktopPanelDragEnabled()) return;
        if (!panel.classList.contains('is-open')) return;
        if (panel.classList.contains('is-expanded')) return;
        if (event.button !== 0) return;
        const rect = panel.getBoundingClientRect();
        resizeState = {
          corner: handle.getAttribute('data-resize-corner') || 'se',
          startX: event.pageX, startY: event.pageY,
          startLeft: rect.left + window.scrollX,
          startTop: rect.top + window.scrollY,
          startWidth: rect.width, startHeight: rect.height,
        };
        panel.classList.add('is-resizing');
        event.preventDefault();
        event.stopPropagation();
      });
    });

    window.addEventListener('mousemove', (event) => {
      if (!resizeState || !panel) return;
      const dx = event.pageX - resizeState.startX;
      const dy = event.pageY - resizeState.startY;
      const minWidth = 560, minHeight = 420, margin = 8;
      const maxWidth = Math.max(minWidth, window.innerWidth - margin * 2);
      const maxHeight = Math.max(minHeight, window.innerHeight - margin * 2);
      const resizeFromLeft = resizeState.corner.includes('w');
      const resizeFromTop = resizeState.corner.includes('n');
      let width = resizeFromLeft ? resizeState.startWidth - dx : resizeState.startWidth + dx;
      let height = resizeFromTop ? resizeState.startHeight - dy : resizeState.startHeight + dy;
      width = Math.min(Math.max(width, minWidth), maxWidth);
      height = Math.min(Math.max(height, minHeight), maxHeight);
      const left = resizeFromLeft ? resizeState.startLeft + resizeState.startWidth - width : resizeState.startLeft;
      const top = resizeFromTop ? resizeState.startTop + resizeState.startHeight - height : resizeState.startTop;
      applyPanelSize(width, height, false);
      applyPanelPosition(left, top, false);
    });

    window.addEventListener('mouseup', () => {
      if (resizeState && panel) {
        resizeState = null;
        panel.classList.remove('is-resizing');
        const rect = panel.getBoundingClientRect();
        if (Number.isFinite(rect.width) && Number.isFinite(rect.height)) applyPanelSize(rect.width, rect.height, true);
        const left = Number.parseFloat(panel.style.left);
        const top = Number.parseFloat(panel.style.top);
        if (Number.isFinite(left) && Number.isFinite(top)) applyPanelPosition(left, top, true);
        return;
      }
      if (panel && isDesktopPanelDragEnabled()) {
        const rect = panel.getBoundingClientRect();
        if (Number.isFinite(rect.width) && Number.isFinite(rect.height)) applyPanelSize(rect.width, rect.height, true);
      }
      if (!dragState || !panel) return;
      dragState = null;
      panel.classList.remove('is-dragging');
      const left = Number.parseFloat(panel.style.left);
      const top = Number.parseFloat(panel.style.top);
      if (Number.isFinite(left) && Number.isFinite(top)) applyPanelPosition(left, top, true);
    });

    window.addEventListener('resize', () => {
      if (!panel) return;
      if (panel.classList.contains('is-expanded')) return;
      if (!isDesktopPanelDragEnabled()) { resetPanelPosition(false); resetPanelSize(false); return; }
      const width = Number.parseFloat(panel.style.width);
      const height = Number.parseFloat(panel.style.height);
      if (Number.isFinite(width) && Number.isFinite(height)) applyPanelSize(width, height, false);
      else loadPanelSize();
      const left = Number.parseFloat(panel.style.left);
      const top = Number.parseFloat(panel.style.top);
      if (Number.isFinite(left) && Number.isFinite(top)) applyPanelPosition(left, top, false);
      else loadPanelPosition();
    });
  }

  function normalizeHistory(history) {
    if (!Array.isArray(history)) return [];
    return history
      .map((entry) => {
        const role = entry?.role === 'assistant' ? 'assistant' : 'user';
        const content = typeof entry?.content === 'string' ? entry.content : String(entry?.content ?? '');
        return { role, content: content.trim() };
      })
      .filter((m) => m.content.length > 0)
      .slice(-16);
  }

  const readableFileExtensions = new Set(['txt','md','markdown','json','csv','log','xml','html','htm','js','ts','css','py','php','java','c','cpp','sql','yaml','yml']);
  const imageFileExtensions = new Set(['png','jpg','jpeg','webp','bmp','gif','tiff']);
  const pdfFileExtensions = new Set(['pdf']);
  let tesseractLoaderPromise = null;
  let pdfJsLoaderPromise = null;

  function getFileExtension(name) {
    const safeName = String(name || '');
    const idx = safeName.lastIndexOf('.');
    return idx >= 0 ? safeName.slice(idx + 1).toLowerCase() : '';
  }

  function isReadableTextFile(file) {
    if (!file) return false;
    const mime = String(file.type || '').toLowerCase();
    if (mime.startsWith('text/')) return true;
    if (mime.includes('json') || mime.includes('xml') || mime.includes('csv') || mime.includes('javascript')) return true;
    return readableFileExtensions.has(getFileExtension(file.name));
  }

  function isImageFile(file) {
    if (!file) return false;
    const mime = String(file.type || '').toLowerCase();
    if (mime.startsWith('image/')) return true;
    return imageFileExtensions.has(getFileExtension(file.name));
  }

  function isPdfFile(file) {
    if (!file) return false;
    const mime = String(file.type || '').toLowerCase();
    if (mime === 'application/pdf') return true;
    return pdfFileExtensions.has(getFileExtension(file.name));
  }

  function readFileAsText(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(new Error('file_read_error'));
      reader.readAsText(file);
    });
  }

  function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(new Error('file_dataurl_error'));
      reader.readAsDataURL(file);
    });
  }

  async function buildVisionAttachments(files) {
    const selected = Array.from(files || []).filter((file) => isImageFile(file)).slice(0, 2);
    const readyNames = [], failedNames = [], attachments = [];
    for (const file of selected) {
      try {
        const url = await readFileAsDataUrl(file);
        if (!url.startsWith('data:image/')) { failedNames.push(file.name); continue; }
        attachments.push({ type: 'image_url', name: file.name, url });
        readyNames.push(file.name);
      } catch (error) { failedNames.push(file.name); }
    }
    return { attachments, readyNames, failedNames };
  }

  function loadTesseractLibrary() {
    if (window.Tesseract?.recognize) return Promise.resolve(window.Tesseract);
    if (tesseractLoaderPromise) return tesseractLoaderPromise;
    tesseractLoaderPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';
      script.async = true;
      script.onload = () => window.Tesseract?.recognize ? resolve(window.Tesseract) : reject(new Error('ocr_library_missing'));
      script.onerror = () => reject(new Error('ocr_library_load_failed'));
      document.head.appendChild(script);
    });
    return tesseractLoaderPromise;
  }

  async function extractTextFromImage(file, lang) {
    const Tesseract = await loadTesseractLibrary();
    const ocrLang = lang === 'en' ? 'eng' : 'fra+eng';
    const result = await Tesseract.recognize(file, ocrLang);
    return String(result?.data?.text || '').replace(/\r/g, '').trim();
  }

  function loadPdfJsLibrary() {
    if (window.pdfjsLib?.getDocument) return Promise.resolve(window.pdfjsLib);
    if (pdfJsLoaderPromise) return pdfJsLoaderPromise;
    pdfJsLoaderPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
      script.async = true;
      script.onload = () => {
        if (!window.pdfjsLib?.getDocument) { reject(new Error('pdfjs_missing')); return; }
        window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
        resolve(window.pdfjsLib);
      };
      script.onerror = () => reject(new Error('pdfjs_load_failed'));
      document.head.appendChild(script);
    });
    return pdfJsLoaderPromise;
  }

  async function extractTextFromPdf(file, lang) {
    const pdfjsLib = await loadPdfJsLibrary();
    const data = await file.arrayBuffer();
    const pdfDoc = await pdfjsLib.getDocument({ data }).promise;
    const maxPages = Math.min(pdfDoc.numPages, 8);
    const textChunks = [];
    for (let pageNum = 1; pageNum <= maxPages; pageNum += 1) {
      const page = await pdfDoc.getPage(pageNum);
      const textContent = await page.getTextContent();
      const pageText = textContent.items.map((item) => item.str).join(' ').replace(/\s+/g, ' ').trim();
      if (pageText) textChunks.push(`Page ${pageNum}: ${pageText}`);
    }
    const extractedText = textChunks.join('\n\n').trim();
    if (extractedText) return extractedText;
    const ocrPages = Math.min(pdfDoc.numPages, 3);
    const ocrChunks = [];
    for (let pageNum = 1; pageNum <= ocrPages; pageNum += 1) {
      const page = await pdfDoc.getPage(pageNum);
      const viewport = page.getViewport({ scale: 1.5 });
      const canvas = document.createElement('canvas');
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      const context = canvas.getContext('2d');
      if (!context) continue;
      await page.render({ canvasContext: context, viewport }).promise;
      const ocrText = await extractTextFromImage(canvas, lang);
      if (ocrText) ocrChunks.push(`Page ${pageNum}: ${ocrText}`);
    }
    return ocrChunks.join('\n\n').trim();
  }

  async function buildLocalFileContext(files) {
    const maxFiles = 4, maxCharsPerFile = 5000;
    const selected = Array.from(files || []).slice(0, maxFiles);
    const readableNames = [], unsupportedNames = [], failedNames = [], noTextNames = [], snippets = [];
    for (const file of selected) {
      if (!isReadableTextFile(file)) {
        if (isPdfFile(file)) {
          try {
            const pdfText = await extractTextFromPdf(file, currentLanguage);
            if (!pdfText) { noTextNames.push(file.name); continue; }
            const excerpt = pdfText.length > maxCharsPerFile ? `${pdfText.slice(0, maxCharsPerFile)}\n...[truncated]` : pdfText;
            snippets.push(`Fichier PDF: ${file.name}\n${excerpt}`);
            readableNames.push(file.name);
            continue;
          } catch (error) { failedNames.push(file.name); continue; }
        }
        if (!isImageFile(file)) { unsupportedNames.push(file.name); continue; }
        try {
          const ocrText = await extractTextFromImage(file, currentLanguage);
          if (!ocrText) { noTextNames.push(file.name); continue; }
          const excerpt = ocrText.length > maxCharsPerFile ? `${ocrText.slice(0, maxCharsPerFile)}\n...[truncated]` : ocrText;
          snippets.push(`Fichier image (OCR): ${file.name}\n${excerpt}`);
          readableNames.push(file.name);
          continue;
        } catch (error) { failedNames.push(file.name); continue; }
      }
      try {
        const raw = await readFileAsText(file);
        const trimmed = raw.replace(/\r/g, '').trim();
        const excerpt = trimmed.length > maxCharsPerFile ? `${trimmed.slice(0, maxCharsPerFile)}\n...[truncated]` : trimmed;
        snippets.push(`Fichier: ${file.name}\n${excerpt || '[empty file]'}`);
        readableNames.push(file.name);
      } catch (error) { failedNames.push(file.name); }
    }
    return { context: snippets.join('\n\n'), readableNames, unsupportedNames, failedNames, noTextNames };
  }

  function loadExternalScript(src) {
    return new Promise((resolve, reject) => {
      const existing = document.querySelector(`script[src="${src}"]`);
      if (existing) {
        if (existing.dataset.loaded === 'true') { resolve(); return; }
        existing.addEventListener('load', () => resolve(), { once: true });
        existing.addEventListener('error', () => reject(new Error('script_load_failed')), { once: true });
        return;
      }
      const script = document.createElement('script');
      script.src = src;
      script.async = true;
      script.onload = () => { script.dataset.loaded = 'true'; resolve(); };
      script.onerror = () => reject(new Error('script_load_failed'));
      document.head.appendChild(script);
    });
  }

  function ensurePickerReady() {
    if (pickerReadyPromise) return pickerReadyPromise;
    pickerReadyPromise = loadExternalScript(DRIVE_PICKER_SCRIPT_URL)
      .then(() => new Promise((resolve, reject) => {
        if (!window.gapi?.load) { reject(new Error('gapi_missing')); return; }
        window.gapi.load('picker', {
          callback: () => resolve(),
          onerror: () => reject(new Error('picker_load_failed')),
          timeout: 5000,
          ontimeout: () => reject(new Error('picker_timeout')),
        });
      }));
    return pickerReadyPromise;
  }

  function ensureIdentityReady() {
    if (identityReadyPromise) return identityReadyPromise;
    identityReadyPromise = loadExternalScript(GOOGLE_IDENTITY_SCRIPT_URL).then(() => {
      if (!window.google?.accounts?.oauth2?.initTokenClient) throw new Error('google_identity_missing');
    });
    return identityReadyPromise;
  }

  function isDriveConfigured() {
    return Boolean(DRIVE_API_KEY && DRIVE_CLIENT_ID);
  }

  async function ensureDriveToken(forcePrompt = false) {
    await ensureIdentityReady();
    if (!driveTokenClient) {
      driveTokenClient = window.google.accounts.oauth2.initTokenClient({
        client_id: DRIVE_CLIENT_ID, scope: DRIVE_SCOPE, callback: () => {},
      });
    }
    return new Promise((resolve, reject) => {
      driveTokenClient.callback = (response) => {
        if (response?.access_token) { driveAccessToken = response.access_token; resolve(response.access_token); return; }
        reject(new Error('drive_token_missing'));
      };
      driveTokenClient.requestAccessToken({ prompt: forcePrompt || !driveAccessToken ? 'consent' : '' });
    });
  }

  function mapGoogleDocExport(meta) {
    const mime = String(meta?.mimeType || '');
    const map = {
      'application/vnd.google-apps.document': { mimeType: 'text/plain', ext: 'txt' },
      'application/vnd.google-apps.spreadsheet': { mimeType: 'text/csv', ext: 'csv' },
      'application/vnd.google-apps.presentation': { mimeType: 'text/plain', ext: 'txt' },
      'application/vnd.google-apps.drawing': { mimeType: 'image/png', ext: 'png' },
    };
    return map[mime] || null;
  }

  function sanitizeFilename(name, fallback = 'drive-file') {
    const safe = String(name || '').trim().replace(/[\\/:*?"<>|]/g, '_');
    return safe || fallback;
  }

  async function downloadDriveFile(doc, token) {
    const id = String(doc?.id || '').trim();
    const name = sanitizeFilename(doc?.name || 'drive-file');
    const mimeType = String(doc?.mimeType || '').trim();
    if (!id) throw new Error('drive_missing_id');
    const exportConf = mapGoogleDocExport({ mimeType });
    let url = '', resolvedMime = mimeType || 'application/octet-stream', resolvedName = name;
    if (exportConf) {
      url = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}/export?mimeType=${encodeURIComponent(exportConf.mimeType)}`;
      resolvedMime = exportConf.mimeType;
      if (!/\.[a-z0-9]{2,5}$/i.test(resolvedName)) resolvedName = `${resolvedName}.${exportConf.ext}`;
    } else {
      url = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}?alt=media`;
    }
    const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!response.ok) throw new Error(`drive_download_failed_${response.status}`);
    const blob = await response.blob();
    return new File([blob], resolvedName, { type: blob.type || resolvedMime, lastModified: Date.now() });
  }

  async function openDrivePicker() {
    await ensurePickerReady();
    const token = await ensureDriveToken(false).catch(() => ensureDriveToken(true));
    return new Promise((resolve, reject) => {
      const docsView = new window.google.picker.DocsView(window.google.picker.ViewId.DOCS)
        .setIncludeFolders(false).setSelectFolderEnabled(false);
      const pickerBuilder = new window.google.picker.PickerBuilder()
        .setDeveloperKey(DRIVE_API_KEY).setOAuthToken(token)
        .setOrigin(window.location.origin || `${window.location.protocol}//${window.location.host}`)
        .setTitle('Google Drive')
        .enableFeature(window.google.picker.Feature.MULTISELECT_ENABLED)
        .addView(docsView)
        .setCallback((data) => {
          if (!data?.action) return;
          if (data.action === window.google.picker.Action.PICKED) { resolve(Array.isArray(data.docs) ? data.docs : []); return; }
          if (data.action === window.google.picker.Action.CANCEL) { resolve([]); return; }
        });
      if (DRIVE_APP_ID) pickerBuilder.setAppId(DRIVE_APP_ID);
      pickerBuilder.build().setVisible(true);
    });
  }

  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  const speechRecognition = SpeechRecognition ? new SpeechRecognition() : null;
  if (speechRecognition) {
    speechRecognition.lang = currentLanguage === 'en' ? 'en-US' : 'fr-FR';
    speechRecognition.interimResults = false;
    speechRecognition.maxAlternatives = 1;
  }

  function applyAssistantLanguage(lang) {
    currentLanguage = normalizeLanguage(lang) || getPreferredLanguage();
    if (currentLanguage !== 'en' && currentLanguage !== 'fr') currentLanguage = 'fr';
    i18n = getI18n(currentLanguage);
    if (input) input.placeholder = i18n.inputPlaceholder;
    if (scrollBottomButton) {
      scrollBottomButton.title = i18n.scrollBottom;
      scrollBottomButton.setAttribute('aria-label', i18n.scrollBottom);
    }
    if (expandButton) {
      const expanded = panel?.classList.contains('is-expanded');
      const label = expanded ? i18n.restoreTitle : i18n.maximizeTitle;
      expandButton.title = label;
      expandButton.setAttribute('aria-label', label);
    }
    if (attachToggle) { attachToggle.title = i18n.attach; attachToggle.setAttribute('aria-label', i18n.attach); }
    if (attachMenu) attachMenu.setAttribute('aria-label', i18n.attachMenu);
    const attachFileLabel = attachFileButton?.querySelector('span');
    if (attachFileLabel) attachFileLabel.textContent = i18n.attachFiles;
    const attachDriveLabel = attachDriveButton?.querySelector('span');
    if (attachDriveLabel) attachDriveLabel.textContent = i18n.attachDrive;
    if (sessionLabel) sessionLabel.textContent = i18n.historyLabel;
    if (sessionSelect) sessionSelect.setAttribute('aria-label', i18n.historyLabel);
    if (sessionNewButton) { sessionNewButton.title = i18n.newChat; sessionNewButton.setAttribute('aria-label', i18n.newChat); }
    if (sessionDeleteButton) { sessionDeleteButton.title = i18n.deleteChat; sessionDeleteButton.setAttribute('aria-label', i18n.deleteChat); }
    const sendButton = document.querySelector('#ai-assistant-form .ai-assistant-send-btn');
    if (sendButton) sendButton.textContent = i18n.send;
    if (voiceSelect) { voiceSelect.title = i18n.voiceSelectLabel; voiceSelect.setAttribute('aria-label', i18n.voiceSelectLabel); }
    refreshBubbleActionLabels();
    renderSessionOptions();
    setMicState(isListening);
    setTtsState(isVoiceOutputEnabled);
    if (speechRecognition) speechRecognition.lang = currentLanguage === 'en' ? 'en-US' : 'fr-FR';
    populateVoiceSelect(currentLanguage);
    renderCurrentConversation();
  }

  function buildSessionId() { return `s_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`; }

  function makeDefaultSession() {
    return { id: buildSessionId(), title: i18n.sessionDefault, createdAt: Date.now(), updatedAt: Date.now(), history: [] };
  }

  function loadSessionsState() {
    try {
      const raw = localStorage.getItem(conversationStorageKey);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed?.sessions)) return null;
      const sessions = parsed.sessions.map((s) => ({
        id: typeof s?.id === 'string' ? s.id : buildSessionId(),
        title: typeof s?.title === 'string' && s.title.trim() ? s.title : i18n.sessionDefault,
        createdAt: Number(s?.createdAt) || Date.now(),
        updatedAt: Number(s?.updatedAt) || Date.now(),
        history: normalizeHistory(Array.isArray(s?.history) ? s.history : [])
      })).slice(-20);
      return { activeSessionId: typeof parsed?.activeSessionId === 'string' ? parsed.activeSessionId : '', sessions };
    } catch (error) { return null; }
  }

  function saveSessionsState() {
    try { localStorage.setItem(conversationStorageKey, JSON.stringify(sessionsState)); } catch (error) {}
  }

  function getActiveSession() {
    return sessionsState.sessions.find((s) => s.id === sessionsState.activeSessionId) || null;
  }

  function titleFromHistory(history) {
    const firstUser = history.find((h) => h.role === 'user');
    if (!firstUser?.content) return i18n.sessionDefault;
    const compact = firstUser.content.replace(/\s+/g, ' ').trim();
    return compact.length > 42 ? `${compact.slice(0, 42)}...` : compact;
  }

  function ensureSessionState() {
    const loaded = loadSessionsState();
    if (loaded?.sessions?.length) {
      sessionsState = loaded;
    } else {
      const first = makeDefaultSession();
      sessionsState = { activeSessionId: first.id, sessions: [first] };
      saveSessionsState();
    }
    if (!sessionsState.sessions.some((s) => s.id === sessionsState.activeSessionId)) {
      sessionsState.activeSessionId = sessionsState.sessions[0]?.id || makeDefaultSession().id;
    }
  }

  function renderSessionOptions() {
    if (!sessionSelect) return;
    sessionSelect.innerHTML = '';
    const sorted = [...sessionsState.sessions].sort((a, b) => b.updatedAt - a.updatedAt);
    for (const session of sorted) {
      const option = document.createElement('option');
      option.value = session.id;
      option.textContent = session.title || i18n.sessionDefault;
      sessionSelect.appendChild(option);
    }
    if (sessionsState.activeSessionId) sessionSelect.value = sessionsState.activeSessionId;
  }

  function renderCurrentConversation() {
    if (!messagesContainer) return;
    messagesContainer.innerHTML = '';
    const active = getActiveSession();
    chatHistory = active?.history ? [...active.history] : [];
    if (!chatHistory.length) { addMessage('bot', i18n.greeting); return; }
    for (const msg of chatHistory) addMessage(msg.role === 'assistant' ? 'bot' : 'user', msg.content);
  }

  function persistActiveConversation() {
    const active = getActiveSession();
    if (!active) return;
    active.history = normalizeHistory(chatHistory);
    active.updatedAt = Date.now();
    active.title = titleFromHistory(active.history);
    saveSessionsState();
    renderSessionOptions();
  }

  function switchSession(sessionId) {
    if (!sessionsState.sessions.some((s) => s.id === sessionId)) return;
    sessionsState.activeSessionId = sessionId;
    saveSessionsState();
    renderSessionOptions();
    renderCurrentConversation();
  }

  function createNewSession() {
    const next = makeDefaultSession();
    sessionsState.sessions.unshift(next);
    sessionsState.sessions = sessionsState.sessions.slice(0, 20);
    sessionsState.activeSessionId = next.id;
    saveSessionsState();
    renderSessionOptions();
    renderCurrentConversation();
  }

  function deleteActiveSession() {
    if (!sessionsState.sessions.length) return;
    const currentId = sessionsState.activeSessionId;
    sessionsState.sessions = sessionsState.sessions.filter((s) => s.id !== currentId);
    if (!sessionsState.sessions.length) {
      const fallback = makeDefaultSession();
      sessionsState.sessions = [fallback];
      sessionsState.activeSessionId = fallback.id;
    } else {
      sessionsState.activeSessionId = sessionsState.sessions[0].id;
    }
    saveSessionsState();
    renderSessionOptions();
    renderCurrentConversation();
  }

  function getStoredVoicePreferences() {
    try {
      const raw = localStorage.getItem(voicePreferenceStorageKey);
      if (!raw) return { fr: '', en: '' };
      const parsed = JSON.parse(raw);
      return { fr: typeof parsed.fr === 'string' ? parsed.fr : '', en: typeof parsed.en === 'string' ? parsed.en : '' };
    } catch (error) { return { fr: '', en: '' }; }
  }

  function setStoredVoicePreference(lang, voiceURI) {
    const current = getStoredVoicePreferences();
    current[lang] = typeof voiceURI === 'string' ? voiceURI : '';
    try { localStorage.setItem(voicePreferenceStorageKey, JSON.stringify(current)); } catch (error) {}
  }

  function getStoredVoicePreference(lang) { return getStoredVoicePreferences()[lang] || ''; }

  function chooseBestTtsVoice(lang) {
    const candidates = availableTtsVoices.filter((voice) => {
      const voiceLang = normalizeLanguage(voice.lang);
      return lang === 'en' ? voiceLang === 'en' : voiceLang === 'fr';
    });
    if (!candidates.length) return null;
    const preferredNames = preferredVoiceNames[lang] || [];
    let bestVoice = candidates[0], bestScore = -Infinity;
    for (const voice of candidates) {
      const name = (voice.name || '').toLowerCase();
      let score = 0;
      const preferredIndex = preferredNames.findIndex((needle) => name.includes(needle.toLowerCase()));
      if (preferredIndex >= 0) score += 150 - preferredIndex * 12;
      if (/enhanced|premium|neural|natural/.test(name)) score += 40;
      if (/compact/.test(name)) score -= 25;
      if (voice.default) score += 8;
      if (score > bestScore) { bestScore = score; bestVoice = voice; }
    }
    return bestVoice;
  }

  function getVoicesForLanguage(lang) {
    return availableTtsVoices.filter((voice) => {
      const voiceLang = normalizeLanguage(voice.lang);
      return lang === 'en' ? voiceLang === 'en' : voiceLang === 'fr';
    });
  }

  function resolveVoiceForLanguage(lang) {
    const preferredVoiceURI = getStoredVoicePreference(lang);
    const candidates = getVoicesForLanguage(lang);
    if (preferredVoiceURI) {
      const manuallySelectedVoice = candidates.find((voice) => voice.voiceURI === preferredVoiceURI);
      if (manuallySelectedVoice) return manuallySelectedVoice;
    }
    return chooseBestTtsVoice(lang);
  }

  function populateVoiceSelect(lang) {
    if (!voiceSelect) return;
    const candidates = getVoicesForLanguage(lang);
    const preferredVoiceURI = getStoredVoicePreference(lang);
    const bestVoice = chooseBestTtsVoice(lang);
    const selectedVoice = selectedTtsVoices[lang] || bestVoice;
    voiceSelect.innerHTML = '';
    const autoOption = document.createElement('option');
    autoOption.value = '';
    autoOption.textContent = i18n.voiceSelectAuto;
    voiceSelect.appendChild(autoOption);
    candidates.forEach((voice) => {
      const option = document.createElement('option');
      option.value = voice.voiceURI;
      option.textContent = voice.name || voice.voiceURI;
      voiceSelect.appendChild(option);
    });
    if (preferredVoiceURI && candidates.some((voice) => voice.voiceURI === preferredVoiceURI)) {
      voiceSelect.value = preferredVoiceURI; return;
    }
    voiceSelect.value = '';
    if (selectedVoice && selectedVoice.voiceURI !== (bestVoice?.voiceURI || '')) voiceSelect.value = selectedVoice.voiceURI;
  }

  function refreshTtsVoices() {
    if (!window.speechSynthesis) return;
    const voices = window.speechSynthesis.getVoices();
    if (!voices.length) return;
    availableTtsVoices = voices;
    selectedTtsVoices.fr = resolveVoiceForLanguage('fr');
    selectedTtsVoices.en = resolveVoiceForLanguage('en');
    populateVoiceSelect(currentLanguage);
  }

  if (window.speechSynthesis) {
    refreshTtsVoices();
    window.speechSynthesis.addEventListener('voiceschanged', refreshTtsVoices);
  }

  if (voiceSelect) {
    voiceSelect.addEventListener('change', () => {
      const activeLang = currentLanguage === 'en' ? 'en' : 'fr';
      const selectedVoiceURI = voiceSelect.value || '';
      setStoredVoicePreference(activeLang, selectedVoiceURI);
      selectedTtsVoices[activeLang] = resolveVoiceForLanguage(activeLang);
      populateVoiceSelect(activeLang);
    });
  }

  if (sessionSelect) sessionSelect.addEventListener('change', () => switchSession(sessionSelect.value));
  if (sessionNewButton) sessionNewButton.addEventListener('click', () => createNewSession());
  if (sessionDeleteButton) sessionDeleteButton.addEventListener('click', () => deleteActiveSession());
  if (messagesContainer) messagesContainer.addEventListener('scroll', updateScrollBottomButton, { passive: true });
  if (scrollBottomButton) scrollBottomButton.addEventListener('click', () => scrollConversationToBottom('smooth'));

  if (!fileInput) {
    const form = document.getElementById('ai-assistant-form');
    if (form) {
      fileInput = document.createElement('input');
      fileInput.id = 'ai-assistant-file-input';
      fileInput.type = 'file';
      fileInput.multiple = true;
      fileInput.className = 'ai-assistant-file-input';
      form.appendChild(fileInput);
    }
  }

  function closeAttachMenu() {
    if (!attachMenu || !attachToggle) return;
    attachMenu.classList.remove('is-open');
    attachToggle.setAttribute('aria-expanded', 'false');
  }

  function toggleAttachMenu() {
    if (!attachMenu || !attachToggle) return;
    const nextOpen = !attachMenu.classList.contains('is-open');
    attachMenu.classList.toggle('is-open', nextOpen);
    attachToggle.setAttribute('aria-expanded', String(nextOpen));
  }

  if (attachToggle) attachToggle.addEventListener('click', () => toggleAttachMenu());

  if (attachFileButton && fileInput) {
    attachFileButton.addEventListener('click', () => { closeAttachMenu(); fileInput.click(); });

    async function processSelectedFiles(files) {
      const normalizedFiles = Array.from(files || []);
      if (!normalizedFiles.length) return;
      const hasImages = normalizedFiles.some((file) => isImageFile(file));
      const hasPdf = normalizedFiles.some((file) => isPdfFile(file));
      let ocrLoadingBubble = null, pdfLoadingBubble = null;
      if (hasImages) ocrLoadingBubble = addMessage('bot', i18n.ocrLoading);
      if (hasPdf) pdfLoadingBubble = addMessage('bot', i18n.pdfLoading);
      const result = await buildLocalFileContext(normalizedFiles);
      const vision = await buildVisionAttachments(normalizedFiles);
      if (ocrLoadingBubble) ocrLoadingBubble.remove();
      if (pdfLoadingBubble) pdfLoadingBubble.remove();
      pendingFileContext = result.context;
      pendingFileNames = result.readableNames;
      pendingVisionAttachments = vision.attachments;
      if (result.readableNames.length) addMessage('bot', `${i18n.fileReady} ${result.readableNames.join(', ')}`);
      if (vision.readyNames.length) addMessage('bot', `${i18n.imageReady} ${vision.readyNames.join(', ')}`);
      if (vision.failedNames.length) addMessage('bot', `${i18n.imageReadFailed} ${vision.failedNames.join(', ')}`);
      if (result.unsupportedNames.length) addMessage('bot', `${i18n.fileUnsupported} ${result.unsupportedNames.join(', ')}`);
      if (result.failedNames.length) {
        const failedLabel = hasPdf ? i18n.pdfReadFailed : (hasImages ? i18n.ocrUnavailable : i18n.fileReadFailed);
        addMessage('bot', `${failedLabel} ${result.failedNames.join(', ')}`);
      }
      if (result.noTextNames?.length) {
        const noTextLabel = hasPdf ? i18n.pdfNoText : i18n.ocrNoText;
        addMessage('bot', `${noTextLabel} ${result.noTextNames.join(', ')}`);
      }
      input.focus();
    }

    fileInput.addEventListener('change', async () => {
      const files = Array.from(fileInput.files || []);
      if (!files.length) return;
      await processSelectedFiles(files);
    });

    if (attachDriveButton) {
      attachDriveButton.addEventListener('click', async () => {
        closeAttachMenu();
        if (!isDriveConfigured()) { addMessage('bot', i18n.driveNotConfigured); return; }
        try {
          const docs = await openDrivePicker();
          if (!docs.length) return;
          const files = [], failed = [];
          const token = driveAccessToken || await ensureDriveToken(false);
          for (const doc of docs.slice(0, 4)) {
            try { files.push(await downloadDriveFile(doc, token)); }
            catch (error) { failed.push(doc?.name || doc?.id || 'file'); }
          }
          if (failed.length) addMessage('bot', `${i18n.driveDownloadFailed} ${failed.join(', ')}`);
          await processSelectedFiles(files);
        } catch (error) {
          const msg = /token|auth|oauth/i.test(String(error?.message || '')) ? i18n.driveAuthFailed : i18n.drivePickerFailed;
          addMessage('bot', msg);
        }
      });
    }
  } else if (attachDriveButton) {
    attachDriveButton.addEventListener('click', () => { closeAttachMenu(); addMessage('bot', i18n.driveNotConfigured); });
  }

  document.addEventListener('click', (event) => {
    if (!attachRoot || !attachMenu?.classList.contains('is-open')) return;
    if (!attachRoot.contains(event.target)) closeAttachMenu();
  });

  function escapeHtml(value) {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // ─── FONCTION DE RENDU MARKDOWN AMÉLIORÉE ───────────────────────────────────
  function formatBotMessageHtml(rawText) {
    const codeBlocks = [];

    function stashCodeBlock(_, lang, code) {
      const language = String(lang || '').trim().toLowerCase().replace(/[^a-z0-9+#.-]/g, '');
      const highlighted = highlightCode(code, language);
      const label = language || 'code';
      codeBlocks.push(
        `<figure class="ai-assistant-code-block">
          <figcaption>${escapeHtml(label)}</figcaption>
          <pre><code class="language-${escapeHtml(language || 'plain')}">${highlighted}</code></pre>
        </figure>`
      );
      return `__AI_CODE_BLOCK_${codeBlocks.length - 1}__`;
    }

    function restoreCodeBlocks(html) {
      return html.replace(/__AI_CODE_BLOCK_(\d+)__/g, (_, idx) => codeBlocks[Number(idx)] || '');
    }

    function highlightCode(code, language) {
      let output = escapeHtml(String(code || '').replace(/\n$/, ''));
      const lang = language.toLowerCase();
      if (/^(js|javascript|ts|typescript)$/.test(lang)) {
        output = output
          .replace(/\b(const|let|var|function|return|async|await|if|else|for|while|switch|case|break|continue|try|catch|class|new|import|from|export|default|throw)\b/g, '<span class="ai-token ai-token--keyword">$1</span>')
          .replace(/\b(true|false|null|undefined)\b/g, '<span class="ai-token ai-token--literal">$1</span>')
          .replace(/(&quot;.*?&quot;|&#39;.*?&#39;|`.*?`)/g, '<span class="ai-token ai-token--string">$1</span>')
          .replace(/(\/\/.*)$/gm, '<span class="ai-token ai-token--comment">$1</span>');
      } else if (/^(html|xml)$/.test(lang)) {
        output = output
          .replace(/(&lt;\/?)([\w-]+)/g, '$1<span class="ai-token ai-token--tag">$2</span>')
          .replace(/([\w:-]+)=(&quot;.*?&quot;|&#39;.*?&#39;)/g, '<span class="ai-token ai-token--attr">$1</span>=<span class="ai-token ai-token--string">$2</span>');
      } else if (/^(css|scss)$/.test(lang)) {
        output = output
          .replace(/([\w-]+)(\s*:)/g, '<span class="ai-token ai-token--attr">$1</span>$2')
          .replace(/(#(?:[0-9a-f]{3}){1,2}\b|rgb[a]?\(.*?\))/gi, '<span class="ai-token ai-token--literal">$1</span>');
      } else if (/^(json)$/.test(lang)) {
        output = output
          .replace(/(&quot;[^&]+&quot;)(\s*:)/g, '<span class="ai-token ai-token--attr">$1</span>$2')
          .replace(/:\s*(&quot;.*?&quot;)/g, ': <span class="ai-token ai-token--string">$1</span>')
          .replace(/\b(true|false|null)\b/g, '<span class="ai-token ai-token--literal">$1</span>');
      }
      return output;
    }

    function linkifyLine(text) {
      const preservedAnchors = [];
      let output = text.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, (_, label, url) => {
        const anchor = `<a class="ai-assistant-inline-link" href="${url}" target="_blank" rel="noopener noreferrer">${label}</a>`;
        preservedAnchors.push(anchor);
        return `__AI_LINK_${preservedAnchors.length - 1}__`;
      });
      output = output.replace(/(https?:\/\/[^\s<]+)/g, (url) => {
        const cleanUrl = url.replace(/[),.;!?]+$/, '');
        const trailing = url.slice(cleanUrl.length);
        return `<a class="ai-assistant-inline-link" href="${cleanUrl}" target="_blank" rel="noopener noreferrer">${cleanUrl}</a>${trailing}`;
      });
      output = output.replace(/\[(\d{1,2})\]/g, '<sup class="ai-assistant-citation">[$1]</sup>');
      output = output.replace(/__AI_LINK_(\d+)__/g, (_, idx) => preservedAnchors[Number(idx)] || '');
      return output;
    }

    function injectTableStyles() {
      if (document.getElementById('ai-assistant-table-styles')) return;
      const style = document.createElement('style');
      style.id = 'ai-assistant-table-styles';
      style.textContent = `
        .ai-assistant-table-wrap { overflow-x: auto; margin: 8px 0; border-radius: 6px; }
        .ai-assistant-table { border-collapse: collapse; width: 100%; font-size: 0.83em; }
        .ai-assistant-table th,
        .ai-assistant-table td { border: 1px solid rgba(255,255,255,0.15); padding: 6px 10px; text-align: left; vertical-align: top; line-height: 1.4; }
        .ai-assistant-table th { background: rgba(255,255,255,0.1); font-weight: 600; }
        .ai-assistant-table tr:nth-child(even) td { background: rgba(255,255,255,0.04); }
        .ai-assistant-table tr:hover td { background: rgba(255,255,255,0.07); }
      `;
      document.head.appendChild(style);
    }

    injectTableStyles();

    const withCodeBlocks = String(rawText || '').replace(/```([a-zA-Z0-9+#.-]*)\n([\s\S]*?)```/g, stashCodeBlock);
    const safe = escapeHtml(withCodeBlocks)
      .replace(/\r/g, '')
      .replace(/&lt;br\s*\/?&gt;/gi, '\n')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/(\p{Extended_Pictographic}(?:\uFE0F|\uFE0E)?(?:\u200D\p{Extended_Pictographic}(?:\uFE0F|\uFE0E)?)*)/gu, '<span class="ai-assistant-emoji">$1</span>');

    const normalizedBullets = safe.replace(/\s+-\s+/g, '\n- ');
    const lines = normalizedBullets.split('\n').map((line) => line.trim());

    let html = '';
    let inList = false;
    let inOrderedList = false;
    let orderedListIndex = 1;
    let tableBuffer = [];
    let pendingBlankLine = false;

    function flushLists() {
      if (inList) { html += '</ul>'; inList = false; }
      if (inOrderedList) { html += '</ol>'; inOrderedList = false; }
    }

    function appendToLastListItem(text) {
      html = html.replace(/<\/li>$/, `<p class="ai-assistant-list-detail">${linkifyLine(text)}</p></li>`);
    }

    function flushTable() {
      if (!tableBuffer.length) return;
      const rows = tableBuffer.filter((row) => !/^\|[\s\-:| ]+\|$/.test(row));
      if (!rows.length) { tableBuffer = []; return; }
      html += '<div class="ai-assistant-table-wrap"><table class="ai-assistant-table">';
      rows.forEach((row, idx) => {
        const cells = row.split('|').slice(1, -1);
        const tag = idx === 0 ? 'th' : 'td';
        html += '<tr>' + cells.map((cell) => `<${tag}>${linkifyLine(cell.trim())}</${tag}>`).join('') + '</tr>';
      });
      html += '</table></div>';
      tableBuffer = [];
    }

    for (const line of lines) {
      // Tableau Markdown
      if (line.startsWith('|') && line.endsWith('|')) {
        flushLists();
        orderedListIndex = 1;
        tableBuffer.push(line);
        continue;
      }
      if (tableBuffer.length) flushTable();

      // Ligne vide
      if (!line) {
        pendingBlankLine = true;
        continue;
      }

      // Séparateurs Markdown: on les masque pour éviter les tirets visibles.
      if (/^[-*_]{3,}$/.test(line)) {
        pendingBlankLine = false;
        continue;
      }

      // Titres ## ###
      const headerMatch = line.match(/^(#{1,6})\s+(.+)$/);
      if (headerMatch) {
        flushLists();
        orderedListIndex = 1;
        pendingBlankLine = false;
        const level = Math.min(Math.max(headerMatch[1].length, 1), 6);
        html += `<h${level} class="ai-assistant-heading ai-assistant-heading--h${level}">${linkifyLine(headerMatch[2])}</h${level}>`;
        continue;
      }

      if (line.startsWith('&gt; ')) {
        flushLists();
        orderedListIndex = 1;
        pendingBlankLine = false;
        html += `<blockquote>${linkifyLine(line.slice(5).trim())}</blockquote>`;
        continue;
      }

      // Liste à puces
      if (line.startsWith('- ') || line.startsWith('* ')) {
        if (inOrderedList) { html += '</ol>'; inOrderedList = false; }
        orderedListIndex = 1;
        if (!inList) { html += '<ul>'; inList = true; }
        html += `<li>${linkifyLine(line.slice(2).trim())}</li>`;
        pendingBlankLine = false;
        continue;
      }

      // Liste numérotée
      const orderedMatch = line.match(/^\d+[.)]\s+(.+)$/);
      if (orderedMatch) {
        if (inList) { html += '</ul>'; inList = false; }
        if (!inOrderedList) {
          html += orderedListIndex > 1 ? `<ol start="${orderedListIndex}">` : '<ol>';
          inOrderedList = true;
        }
        html += `<li>${linkifyLine(orderedMatch[1])}</li>`;
        orderedListIndex += 1;
        pendingBlankLine = false;
        continue;
      }

      if ((inList || inOrderedList) && !pendingBlankLine) {
        appendToLastListItem(line);
        continue;
      }

      flushLists();
      orderedListIndex = 1;
      pendingBlankLine = false;
      html += `<p>${linkifyLine(line)}</p>`;
    }

    if (tableBuffer.length) flushTable();
    if (inList) html += '</ul>';
    if (inOrderedList) html += '</ol>';

    return restoreCodeBlocks(html || `<p>${safe}</p>`);
  }
  // ─────────────────────────────────────────────────────────────────────────────

  function addMessage(kind, text) {
    const bubble = document.createElement('article');
    bubble.className = `ai-assistant-message ai-assistant-message--${kind}`;
    bubble.setAttribute('data-role', kind === 'bot' ? 'assistant' : 'user');
    if (kind === 'bot') {
      bubble.innerHTML = formatBotMessageHtml(text);
      enhanceBotBubble(bubble);
    } else {
      const p = document.createElement('p');
      p.textContent = text;
      bubble.appendChild(p);
    }
    messagesContainer.appendChild(bubble);
    scrollConversationToBottom('auto');
    return bubble;
  }

  function addTypingMessage() {
    const bubble = document.createElement('article');
    bubble.className = 'ai-assistant-message ai-assistant-message--bot ai-assistant-message--typing';
    bubble.setAttribute('data-role', 'assistant');
    bubble.innerHTML = `
      <div class="ai-assistant-message-content">
        <span class="ai-assistant-thinking-label">${i18n.thinking}</span>
        <span class="ai-assistant-typing-dots" aria-hidden="true"><span></span><span></span><span></span></span>
      </div>`;
    messagesContainer.appendChild(bubble);
    scrollConversationToBottom('auto');
    return bubble;
  }

  function addStreamingBotMessage(text) {
    const fullText = String(text || '');
    const bubble = document.createElement('article');
    const content = document.createElement('div');
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    bubble.className = 'ai-assistant-message ai-assistant-message--bot is-streaming';
    bubble.setAttribute('data-role', 'assistant');
    content.className = 'ai-assistant-message-content';
    bubble.appendChild(content);
    messagesContainer.appendChild(bubble);
    if (reducedMotion || fullText.length < 90) {
      content.innerHTML = formatBotMessageHtml(fullText);
      bubble.classList.remove('is-streaming');
      enhanceBotBubble(bubble);
      scrollConversationToBottom('auto');
      return Promise.resolve(bubble);
    }
    return new Promise((resolve) => {
      let cursor = 0;
      const step = () => {
        cursor = Math.min(fullText.length, cursor + Math.max(2, Math.ceil(fullText.length / 85)));
        content.innerHTML = `${formatBotMessageHtml(fullText.slice(0, cursor))}<span class="ai-assistant-stream-caret" aria-hidden="true"></span>`;
        scrollConversationToBottom('auto');
        if (cursor >= fullText.length) {
          content.innerHTML = formatBotMessageHtml(fullText);
          bubble.classList.remove('is-streaming');
          enhanceBotBubble(bubble);
          resolve(bubble);
          return;
        }
        window.setTimeout(step, 18);
      };
      step();
    });
  }

  function copyTextToClipboard(text) {
    const safeText = String(text || '').trim();
    if (!safeText) return Promise.resolve(false);
    if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(safeText).then(() => true).catch(() => false);
    try {
      const area = document.createElement('textarea');
      area.value = safeText;
      area.setAttribute('readonly', '');
      area.style.position = 'absolute';
      area.style.left = '-9999px';
      document.body.appendChild(area);
      area.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(area);
      return Promise.resolve(!!ok);
    } catch (error) { return Promise.resolve(false); }
  }

  function refreshBubbleActionLabels() {
    const copyButtons = messagesContainer.querySelectorAll('.ai-assistant-copy-btn');
    copyButtons.forEach((button) => {
      const isCopied = button.dataset.state === 'copied';
      const label = isCopied ? i18n.copied : i18n.copy;
      button.title = label;
      button.setAttribute('aria-label', label);
    });
    const codeCopyButtons = messagesContainer.querySelectorAll('.ai-assistant-code-copy-btn');
    codeCopyButtons.forEach((button) => {
      const isCopied = button.dataset.state === 'copied';
      const label = isCopied ? i18n.copied : i18n.copy;
      button.title = label;
      button.setAttribute('aria-label', label);
    });
  }

  function enhanceCodeBlocks(root) {
    if (!root) return;
    const codeBlocks = root.querySelectorAll('.ai-assistant-code-block');
    codeBlocks.forEach((block) => {
      if (block.querySelector('.ai-assistant-code-copy-btn')) return;
      const caption = block.querySelector('figcaption');
      const code = block.querySelector('pre code');
      if (!caption || !code) return;
      const copyBtn = document.createElement('button');
      copyBtn.type = 'button';
      copyBtn.className = 'ai-assistant-code-copy-btn';
      copyBtn.innerHTML = `<img src="${copyPasteIconUrl}" alt="" aria-hidden="true">`;
      copyBtn.title = i18n.copy;
      copyBtn.setAttribute('aria-label', i18n.copy);
      copyBtn.addEventListener('click', async () => {
        const ok = await copyTextToClipboard(code.innerText || code.textContent || '');
        if (!ok) return;
        copyBtn.dataset.state = 'copied';
        copyBtn.classList.add('is-copied');
        copyBtn.title = i18n.copied;
        copyBtn.setAttribute('aria-label', i18n.copied);
        setTimeout(() => {
          copyBtn.dataset.state = '';
          copyBtn.classList.remove('is-copied');
          copyBtn.title = i18n.copy;
          copyBtn.setAttribute('aria-label', i18n.copy);
        }, 1400);
      });
      caption.appendChild(copyBtn);
    });
  }

  function enhanceBotBubble(bubble) {
    if (!bubble || bubble.querySelector('.ai-assistant-message-actions')) return;
    let content = bubble.querySelector(':scope > .ai-assistant-message-content');
    if (!content) {
      content = document.createElement('div');
      content.className = 'ai-assistant-message-content';
      while (bubble.firstChild) content.appendChild(bubble.firstChild);
      bubble.appendChild(content);
    }
    enhanceCodeBlocks(content);
    const actions = document.createElement('div');
    actions.className = 'ai-assistant-message-actions';
    const copyBtn = document.createElement('button');
    copyBtn.type = 'button';
    copyBtn.className = 'ai-assistant-bubble-btn ai-assistant-copy-btn';
    copyBtn.innerHTML = `<img src="${copyPasteIconUrl}" alt="" aria-hidden="true">`;
    copyBtn.title = i18n.copy;
    copyBtn.setAttribute('aria-label', i18n.copy);
    copyBtn.addEventListener('click', async () => {
      const ok = await copyTextToClipboard(content.innerText);
      if (!ok) return;
      copyBtn.dataset.state = 'copied';
      copyBtn.classList.add('is-copied');
      copyBtn.title = i18n.copied;
      copyBtn.setAttribute('aria-label', i18n.copied);
      setTimeout(() => {
        copyBtn.dataset.state = '';
        copyBtn.classList.remove('is-copied');
        copyBtn.title = i18n.copy;
        copyBtn.setAttribute('aria-label', i18n.copy);
      }, 1400);
    });
    actions.appendChild(copyBtn);
    bubble.appendChild(actions);
  }

  function setMicState(listening) {
    if (!micButton) return;
    micButton.classList.toggle('is-active', listening);
    micButton.title = listening ? i18n.micOff : i18n.micOn;
    micButton.setAttribute('aria-label', listening ? i18n.micOff : i18n.micOn);
  }

  function setTtsState(enabled) {
    if (!ttsButton) return;
    ttsButton.classList.toggle('is-active', enabled);
    ttsButton.title = enabled ? i18n.ttsOn : i18n.ttsOff;
    ttsButton.setAttribute('aria-label', enabled ? i18n.ttsOn : i18n.ttsOff);
  }

  function sanitizeTextForSpeech(rawText) {
    return String(rawText || '')
      .replace(/\r/g, ' ')
      .replace(/(\p{Extended_Pictographic}(?:\uFE0F|\uFE0E)?(?:\u200D\p{Extended_Pictographic}(?:\uFE0F|\uFE0E)?)*)/gu, ' ')
      .replace(/\*\*(.+?)\*\*/g, '$1').replace(/\*(.+?)\*/g, '$1')
      .replace(/__(.+?)__/g, '$1').replace(/_(.+?)_/g, '$1')
      .replace(/`(.+?)`/g, '$1').replace(/\[(.*?)\]\((.*?)\)/g, '$1')
      .replace(/!\[(.*?)\]\((.*?)\)/g, '$1').replace(/#{1,6}\s*/g, '')
      .replace(/^>\s?/gm, '').replace(/[*_~`|]/g, ' ')
      .replace(/[→←↑↓↔↕↗↘↙↖➜➤➝➞➟➠➡]/g, ' ')
      .replace(/[\u2190-\u21ff\u2300-\u23ff\u2460-\u24ff\u25a0-\u27bf\u2900-\u297f]/g, ' ')
      .replace(/[●•◦▪▫]/g, '').replace(/\s+/g, ' ').trim();
  }

  function cleanAssistantReplyText(rawText) {
    return String(rawText || '')
      .replace(/[●•◦▪▫]/g, '').replace(/[ \t]{2,}/g, ' ')
      .replace(/\n{3,}/g, '\n\n').trim();
  }

  function formatAssistantApiError(apiError) {
    const diagnostic = typeof apiError === 'object' && apiError !== null ? apiError.diagnostic : null;
    const statusCode = Number(diagnostic?.status_code || diagnostic?.status || 0);
    const normalized = String(
      typeof apiError === 'object' && apiError !== null
        ? `${apiError.error || ''} ${diagnostic?.upstream_error || ''}`
        : apiError || ''
    ).toLowerCase();
    if (!normalized) return i18n.fallbackConnectionError;
    if (statusCode === 429 || normalized.includes('rate limit') || normalized.includes('provider returned error')) {
      return i18n.rateLimitError;
    }
    return i18n.friendlyApiError;
  }

  function ensureSpeechSegmentSpans(bubble) {
    if (!bubble) return [];
    const content = bubble.querySelector('.ai-assistant-message-content');
    if (!content) return [];
    const existing = Array.from(content.querySelectorAll('.ai-assistant-tts-segment'));
    if (existing.length) return existing;
    const walker = document.createTreeWalker(content, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        if (!node?.nodeValue || !node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    const textNodes = [];
    let current = walker.nextNode();
    while (current) { textNodes.push(current); current = walker.nextNode(); }
    textNodes.forEach((node) => {
      const parts = node.nodeValue.match(/[^.!?…\n]+[.!?…]?[\s\n]*/g) || [node.nodeValue];
      const frag = document.createDocumentFragment();
      parts.forEach((part) => {
        if (!part) return;
        if (!part.trim()) { frag.appendChild(document.createTextNode(part)); return; }
        const segment = document.createElement('span');
        segment.className = 'ai-assistant-tts-segment';
        segment.textContent = part;
        frag.appendChild(segment);
      });
      node.parentNode?.replaceChild(frag, node);
    });
    return Array.from(content.querySelectorAll('.ai-assistant-tts-segment'));
  }

  function clearSpeechTrackingVisual() {
    if (!activeSpeechTracking) return;
    const { bubble, segmentSpans, fallbackTimerId, fallbackStartTimeoutId } = activeSpeechTracking;
    if (fallbackTimerId) clearTimeout(fallbackTimerId);
    if (fallbackStartTimeoutId) clearTimeout(fallbackStartTimeoutId);
    bubble?.classList.remove('is-speaking');
    segmentSpans?.forEach((span) => span.classList.remove('is-speaking'));
    activeSpeechTracking = null;
  }

  function updateSpeechTrackingAtIndex(segmentIndex) {
    if (!activeSpeechTracking || segmentIndex < 0) return;
    const { segmentSpans, bubble, activeSegmentIndex } = activeSpeechTracking;
    if (!segmentSpans.length || segmentIndex === activeSegmentIndex) return;
    if (activeSegmentIndex >= 0 && segmentSpans[activeSegmentIndex]) segmentSpans[activeSegmentIndex].classList.remove('is-speaking');
    const next = segmentSpans[segmentIndex];
    if (!next) return;
    bubble.classList.add('is-speaking');
    next.classList.add('is-speaking');
    activeSpeechTracking.activeSegmentIndex = segmentIndex;
  }

  function buildSpeechSegmentMap(segmentSpans) {
    const segments = [];
    if (!segmentSpans?.length) return segments;
    let cursor = 0;
    segmentSpans.forEach((span, spanIndex) => {
      const normalized = sanitizeTextForSpeech(span.textContent || '');
      if (!normalized) return;
      const start = cursor;
      const end = start + normalized.length;
      segments.push({ spanIndex, start, end });
      cursor = end + 1;
    });
    return segments;
  }

  function buildSpeechTextFromSegments(segmentSpans) {
    if (!segmentSpans?.length) return '';
    return segmentSpans.map((span) => sanitizeTextForSpeech(span.textContent || '')).filter(Boolean).join(' ').trim();
  }

  function getSegmentIndexForChar(segments, charIndex) {
    if (!segments.length) return -1;
    for (let i = segments.length - 1; i >= 0; i -= 1) {
      if (charIndex >= segments[i].start) return segments[i].spanIndex;
    }
    return segments[0].spanIndex;
  }

  function startEstimatedSpeechTracking(utteranceRate = 1) {
    if (!activeSpeechTracking || activeSpeechTracking.fallbackTimerId) return;
    const safeRate = Number.isFinite(utteranceRate) && utteranceRate > 0 ? utteranceRate : 1;
    const baseCharsPerSecond = currentLanguage === 'en' ? 15.5 : 14.5;
    const charsPerSecond = baseCharsPerSecond * safeRate;
    const startedAt = performance.now();
    const tick = () => {
      if (!activeSpeechTracking) return;
      const elapsedMs = performance.now() - startedAt;
      const charIndex = Math.floor((elapsedMs / 1000) * charsPerSecond);
      const segmentIndex = getSegmentIndexForChar(activeSpeechTracking.speechSegments, charIndex);
      if (segmentIndex >= 0) updateSpeechTrackingAtIndex(segmentIndex);
      activeSpeechTracking.fallbackTimerId = window.setTimeout(tick, 33);
    };
    tick();
  }

  function speakText(text, bubble = null) {
    if (!isVoiceOutputEnabled || !window.speechSynthesis || !text) return;
    speechTrackingToken += 1;
    clearSpeechTrackingVisual();
    window.speechSynthesis.cancel();
    const segmentSpans = ensureSpeechSegmentSpans(bubble);
    const speechSegments = buildSpeechSegmentMap(segmentSpans);
    const speechText = buildSpeechTextFromSegments(segmentSpans) || sanitizeTextForSpeech(text);
    if (!speechText) return;
    if (bubble && segmentSpans.length) {
      activeSpeechTracking = { bubble, segmentSpans, speechSegments, activeSegmentIndex: -1, hasRealBoundaryEvent: false, fallbackTimerId: 0, fallbackStartTimeoutId: 0 };
    }
    const activeLang = currentLanguage === 'en' ? 'en' : 'fr';
    const utterance = new SpeechSynthesisUtterance(speechText);
    utterance.lang = activeLang === 'en' ? 'en-US' : 'fr-FR';
    utterance.voice = selectedTtsVoices[activeLang] || null;
    utterance.rate = 1.03;
    utterance.pitch = activeLang === 'en' ? 1.02 : 0.98;
    utterance.onboundary = (event) => {
      if (!activeSpeechTracking || typeof event?.charIndex !== 'number') return;
      activeSpeechTracking.hasRealBoundaryEvent = true;
      if (activeSpeechTracking.fallbackTimerId) { clearTimeout(activeSpeechTracking.fallbackTimerId); activeSpeechTracking.fallbackTimerId = 0; }
      const segmentIndex = getSegmentIndexForChar(activeSpeechTracking.speechSegments, event.charIndex);
      if (segmentIndex >= 0) updateSpeechTrackingAtIndex(segmentIndex);
    };
    utterance.onstart = () => {
      if (!activeSpeechTracking) return;
      activeSpeechTracking.fallbackStartTimeoutId = window.setTimeout(() => {
        if (!activeSpeechTracking || activeSpeechTracking.hasRealBoundaryEvent) return;
        startEstimatedSpeechTracking(utterance.rate || 1);
      }, 420);
    };
    utterance.onend = () => clearSpeechTrackingVisual();
    utterance.onerror = () => clearSpeechTrackingVisual();
    window.speechSynthesis.speak(utterance);
  }

  async function askAI(userText, fileContext = '', attachments = []) {
    const loading = addTypingMessage();
    try {
      const dateContext = getAssistantCurrentDateContext();
      const styleInstruction = currentLanguage === 'en'
        ? [
          `Current date: ${dateContext.isoDate} (${dateContext.timezone}). Treat ${dateContext.isoDate.slice(0, 4)} as the current year.`,
          'Never say we are in 2024 unless the user explicitly asks about 2024.',
          'For latest/current market facts, product launches, prices, rankings, laws, or news: you do not have live web access. Do not invent models, examples, dates, specs, prices, citations, or rankings. If no source is provided, say that live verification is required and offer a safe comparison framework using neutral placeholders only, such as "Brand / Model to verify".',
          'Formatting instructions: answer in clean Markdown, use complete punctuated sentences, avoid standalone "---" separators, and use continuous numbered lists when relevant.'
        ].join('\n')
        : [
          `Date actuelle : ${dateContext.isoDate} (${dateContext.timezone}). Considère ${dateContext.isoDate.slice(0, 4)} comme l'année en cours.`,
          "Ne dis jamais que nous sommes en 2024 sauf si l'utilisateur parle explicitement de 2024.",
          "Pour les faits récents, les dernières sorties produit, les prix, classements, lois ou actualités : tu n'as pas d'accès web temps réel. N'invente jamais de modèles, exemples, dates, fiches techniques, prix, citations ou classements. Si aucune source n'est fournie, explique qu'une vérification web est nécessaire et propose une grille de comparaison fiable avec uniquement des placeholders neutres, par exemple \"Marque / modèle à vérifier\".",
          'Consignes de mise en forme : réponds en Markdown propre, avec des phrases complètes et ponctuées, évite les séparateurs "---" seuls, et utilise des listes numérotées continues quand c’est pertinent.'
        ].join('\n');
      const composedMessage = fileContext
        ? `${styleInstruction}\n\n${userText}\n\n---\nContexte de fichiers locaux (ne pas ignorer):\n${fileContext}`
        : `${styleInstruction}\n\n${userText}`;
      const response = await fetch(API_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: composedMessage,
          history: chatHistory.slice(-4),
          language: currentLanguage === 'en' ? 'en' : 'fr',
          currentDate: dateContext,
          mode: 'chat',
          attachments
        })
      });
      const data = await response.json();
      loading.remove();
      if (data.ok) {
        const cleanedReply = cleanAssistantReplyText(data.reply);
        const botBubble = await addStreamingBotMessage(cleanedReply);
        speakText(cleanedReply, botBubble);
        chatHistory.push({ role: 'assistant', content: cleanedReply });
        persistActiveConversation();
      } else {
        const msg = formatAssistantApiError(data);
        addMessage('bot', msg);
        chatHistory.push({ role: 'assistant', content: msg });
        persistActiveConversation();
      }
    } catch (e) {
      if (loading) loading.remove();
      addMessage('bot', i18n.assistantDown);
      chatHistory.push({ role: 'assistant', content: i18n.assistantDown });
      persistActiveConversation();
    }
  }

  document.getElementById('ai-assistant-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text && !pendingFileContext) return;
    const visibleText = text || i18n.sendWithoutTextWithFiles;
    addMessage('user', visibleText);
    chatHistory.push({ role: 'user', content: visibleText });
    persistActiveConversation();
    input.value = '';
    const fileContext = pendingFileContext;
    const attachments = pendingVisionAttachments.slice(0, 2);
    pendingFileContext = '';
    pendingFileNames = [];
    pendingVisionAttachments = [];
    if (fileInput) fileInput.value = '';
    askAI(visibleText, fileContext, attachments);
  });

  if (input) {
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        const form = document.getElementById('ai-assistant-form');
        if (form?.requestSubmit) form.requestSubmit();
        else form?.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
      }
    });
  }

  if (ttsButton) {
    ttsButton.addEventListener('click', () => {
      isVoiceOutputEnabled = !isVoiceOutputEnabled;
      setTtsState(isVoiceOutputEnabled);
      if (!isVoiceOutputEnabled && window.speechSynthesis) {
        speechTrackingToken += 1;
        window.speechSynthesis.cancel();
        clearSpeechTrackingVisual();
      }
    });
    setTtsState(isVoiceOutputEnabled);
  }

  if (micButton) {
    if (!speechRecognition) {
      micButton.disabled = true;
      micButton.title = i18n.speechUnsupported;
      micButton.setAttribute('aria-label', i18n.speechUnsupported);
    } else {
      micButton.addEventListener('click', () => { if (isListening) speechRecognition.stop(); else speechRecognition.start(); });
      speechRecognition.onstart = () => { isListening = true; setMicState(true); };
      speechRecognition.onend = () => { isListening = false; setMicState(false); };
      speechRecognition.onerror = () => { isListening = false; setMicState(false); };
      speechRecognition.onresult = (event) => {
        const transcript = event.results?.[0]?.[0]?.transcript?.trim();
        if (!transcript) return;
        input.value = transcript;
        input.focus();
      };
    }
  }

  if (launcherButton && panel) {
    launcherButton.addEventListener('click', () => {
      const isOpening = !panel.classList.contains('is-open');
      if (isOpening) placePanelInCurrentViewport();
      setAssistantPanelOpen(isOpening);
      updateScrollBottomButton();
    });
  }

  if (closeButton && panel) {
    closeButton.addEventListener('click', () => { setAssistantExpanded(false); setAssistantPanelOpen(false); updateScrollBottomButton(); });
  }

  if (expandButton && panel) {
    expandButton.addEventListener('click', () => setAssistantExpanded(!panel.classList.contains('is-expanded')));
  }

  document.addEventListener('translationCompleted', (event) => applyAssistantLanguage(event.detail?.language));

  applyAssistantLanguage(currentLanguage);
  setupPanelDrag();
  loadPanelSize();
  loadPanelPosition();
  ensureSessionState();
  renderSessionOptions();
  renderCurrentConversation();
});
