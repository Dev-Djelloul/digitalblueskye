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
        exportChat: 'Export conversation',
        exportChatEmpty: 'No conversation to export yet.',
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
        docxLoading: 'Reading Word document...',
        docxNoText: 'No readable text found in Word document:',
        docxReadFailed: 'Unable to read Word document:',
        excelLoading: 'Reading Excel file...',
        excelNoText: 'No readable content found in Excel file:',
        excelReadFailed: 'Unable to read Excel file:',
        ocrLoading: 'Reading image text (OCR)...',
        ocrNoText: 'No readable text found in image:',
        ocrUnavailable: 'OCR unavailable in this browser/session.',
        sendWithoutTextWithFiles: 'Please analyze the attached files.',
        copy: 'Copy',
        copied: 'Copied',
        scrollBottom: 'Go to latest message',
        exportDocument: 'Export document',
        downloadMd: 'Download Markdown',
        downloadHtml: 'Download HTML',
        downloadPdf: 'Prepare PDF',
        downloadDocx: 'Download Word document',
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
        greeting: 'Hello! How can I help you?',
        webSearch: 'Search the web',
        webSearching: 'Searching...',
        webNoResults: 'No web results found.'
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
      exportChat: 'Exporter la conversation',
      exportChatEmpty: 'Aucune conversation à exporter pour le moment.',
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
      docxLoading: 'Lecture du document Word...',
      docxNoText: 'Aucun texte lisible trouvé dans le document Word :',
      docxReadFailed: 'Impossible de lire le document Word :',
      excelLoading: 'Lecture du fichier Excel...',
      excelNoText: 'Aucun contenu lisible trouvé dans le fichier Excel :',
      excelReadFailed: 'Impossible de lire le fichier Excel :',
      ocrLoading: 'Lecture du texte de l\u2019image (OCR)...',
      ocrNoText: 'Aucun texte lisible trouvé dans l\u2019image :',
      ocrUnavailable: 'OCR indisponible dans ce navigateur/session.',
      sendWithoutTextWithFiles: 'Merci d\u2019analyser les fichiers joints.',
      copy: 'Copier',
      copied: 'Copié',
      scrollBottom: 'Aller au dernier message',
      exportDocument: 'Exporter le document',
      downloadMd: 'Télécharger Markdown',
      downloadHtml: 'Télécharger HTML',
      downloadPdf: 'Préparer le PDF',
      downloadDocx: 'Télécharger Word',
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
      greeting: 'Bonjour ! Comment puis-je vous aider ?',
      webSearch: 'Rechercher sur le web',
      webSearching: 'Recherche...',
      webNoResults: 'Aucun résultat web trouvé.'
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
  const webIconUrl = resolveUiIconUrl('icons8-web.gif');

  function createWebSearchButtonMarkup() {
    return `
      <button id="ai-assistant-web-search" class="ai-assistant-web-search-btn" type="button" title="${i18n.webSearch}" aria-label="${i18n.webSearch}" aria-pressed="false">
        <img src="${webIconUrl}" alt="" width="18" height="18">
      </button>`;
  }

  function createAttachControlsMarkup() {
    return `
      <div class="ai-assistant-attach" id="ai-assistant-attach">
        <button id="ai-assistant-attach-toggle" class="ai-assistant-attach-toggle" type="button" aria-haspopup="true" aria-expanded="false" title="${i18n.attach}" aria-label="${i18n.attach}">+</button>
        ${createWebSearchButtonMarkup()}
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
        <button id="ai-assistant-session-export" class="ai-assistant-session-export" type="button" title="${i18n.exportChat}" aria-label="${i18n.exportChat}">
          <img src="${filesIconUrl}" alt="" aria-hidden="true">
        </button>
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

    if (!document.getElementById('ai-assistant-web-search')) {
      const attach = document.getElementById('ai-assistant-attach');
      const attachMenu = document.getElementById('ai-assistant-attach-menu');
      const wrapper = document.createElement('div');
      wrapper.innerHTML = createWebSearchButtonMarkup().trim();
      const webButton = wrapper.firstElementChild;
      if (attach && webButton) {
        if (attachMenu) {
          attach.insertBefore(webButton, attachMenu);
        } else {
          attach.appendChild(webButton);
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

  const API_ENDPOINT = 'https://digitalblueskye-ai.digitalblueskye.workers.dev';
  const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.readonly';
  const DRIVE_PICKER_SCRIPT_URL = 'https://apis.google.com/js/api.js';
  const GOOGLE_IDENTITY_SCRIPT_URL = 'https://accounts.google.com/gsi/client';
  const HTML2PDF_SCRIPT_URL = 'https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js';
  const JSPDF_SCRIPT_URL = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
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
  const sessionExportButton = document.getElementById('ai-assistant-session-export');
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
  const webSearchButton = document.getElementById('ai-assistant-web-search');
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
  const conversationCorruptStorageKey = 'ai_assistant_conversations_corrupt_v1';
  const panelPositionStorageKey = 'ai_assistant_panel_position_v1';
  const panelSizeStorageKey = 'ai_assistant_panel_size_v1';
  const assistantDebugStorageKey = 'ai_assistant_debug';
  const maxStoredSessions = 20;
  const maxStoredMessagesPerSession = 40;
  const maxStoredMessageLength = 8000;
  const maxConversationSummaryLength = 1800;
  const apiHistoryWindow = 16;

  function isAssistantDebugEnabled() {
    try { return localStorage.getItem(assistantDebugStorageKey) === 'true'; } catch (error) { return false; }
  }

  function assistantLog(level, eventName, details = {}) {
    if (!isAssistantDebugEnabled() && level !== 'warn' && level !== 'error') return;
    const logger = typeof console?.[level] === 'function' ? console[level] : console.log;
    logger.call(console, '[Digital Blue Skye AI]', eventName, {
      at: new Date().toISOString(),
      ...details
    });
  }

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
        return { role, content: content.trim().slice(0, maxStoredMessageLength) };
      })
      .filter((m) => m.content.length > 0)
      .slice(-maxStoredMessagesPerSession);
  }

  function compactTextForMemory(text, limit = 260) {
    const compact = String(text || '').replace(/\s+/g, ' ').trim();
    if (compact.length <= limit) return compact;
    return `${compact.slice(0, limit - 3).trim()}...`;
  }

  const readableFileExtensions = new Set(['txt','md','markdown','json','csv','log','xml','html','htm','js','ts','css','py','php','java','c','cpp','sql','yaml','yml']);
  const imageFileExtensions = new Set(['png','jpg','jpeg','webp','bmp','gif','tiff']);
  const pdfFileExtensions = new Set(['pdf']);
  const docxFileExtensions = new Set(['docx']);
  const excelFileExtensions = new Set(['xlsx','xls']);
  let tesseractLoaderPromise = null;
  let pdfJsLoaderPromise = null;
  let mammothLoaderPromise = null;
  let sheetJsLoaderPromise = null;
  let html2PdfLoaderPromise = null;
  let jsPdfLoaderPromise = null;
  const maxLocalFilesPerPrompt = 4;
  const maxTextCharsPerFile = 12000;
  const maxDocumentCharsPerFile = 60000;
  const maxExcelContextCharsPerFile = 14000;
  const maxImageOcrCharsPerFile = 8000;

  function getFileExtension(name) {
    const safeName = String(name || '');
    const idx = safeName.lastIndexOf('.');
    return idx >= 0 ? safeName.slice(idx + 1).toLowerCase() : '';
  }

  function isReadableTextFile(file) {
    if (!file) return false;
    if (isDocxFile(file) || isPdfFile(file) || isImageFile(file) || isExcelFile(file)) return false;
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

  function isDocxFile(file) {
    if (!file) return false;
    const mime = String(file.type || '').toLowerCase();
    if (mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') return true;
    return docxFileExtensions.has(getFileExtension(file.name));
  }

  function isExcelFile(file) {
    if (!file) return false;
    const mime = String(file.type || '').toLowerCase();
    if (mime === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') return true;
    if (mime === 'application/vnd.ms-excel') return true;
    if (mime === 'application/x-excel') return true;
    return excelFileExtensions.has(getFileExtension(file.name));
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

  function buildDocumentContextBlock({ label, fileName, text, maxChars, meta = [] }) {
    const cleanText = String(text || '').replace(/\r/g, '').replace(/\n{4,}/g, '\n\n\n').trim();
    const truncated = cleanText.length > maxChars;
    const excerpt = truncated ? cleanText.slice(0, maxChars).trim() : cleanText;
    const chunkSize = 6000;
    const chunks = [];
    for (let start = 0; start < excerpt.length; start += chunkSize) {
      const chunk = excerpt.slice(start, start + chunkSize).trim();
      if (chunk) chunks.push(`--- Chunk ${chunks.length + 1} ---\n${chunk}`);
    }
    const metaLines = [
      `Fichier: ${fileName}`,
      `Type: ${label}`,
      `Caractères extraits: ${cleanText.length}`,
      truncated ? `Statut: contexte tronqué à ${maxChars} caractères` : 'Statut: contexte complet extrait côté navigateur',
      ...meta
    ];
    return `${metaLines.join('\n')}\n\n${chunks.join('\n\n') || '[empty file]'}`;
  }

  async function extractTextFromPdf(file, lang) {
    const pdfjsLib = await loadPdfJsLibrary();
    const data = await file.arrayBuffer();
    const pdfDoc = await pdfjsLib.getDocument({ data }).promise;
    const maxPages = Math.min(pdfDoc.numPages, 40);
    const textChunks = [];
    for (let pageNum = 1; pageNum <= maxPages; pageNum += 1) {
      const page = await pdfDoc.getPage(pageNum);
      const textContent = await page.getTextContent();
      const pageText = textContent.items.map((item) => item.str).join(' ').replace(/\s+/g, ' ').trim();
      if (pageText) textChunks.push(`Page ${pageNum}: ${pageText}`);
    }
    const extractedText = textChunks.join('\n\n').trim();
    if (extractedText) {
      return {
        text: extractedText,
        totalPages: pdfDoc.numPages,
        extractedPages: maxPages,
        ocrUsed: false
      };
    }
    const ocrPages = Math.min(pdfDoc.numPages, 6);
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
    return {
      text: ocrChunks.join('\n\n').trim(),
      totalPages: pdfDoc.numPages,
      extractedPages: ocrPages,
      ocrUsed: true
    };
  }

  function loadMammothLibrary() {
    if (window.mammoth?.extractRawText) return Promise.resolve(window.mammoth);
    if (mammothLoaderPromise) return mammothLoaderPromise;
    mammothLoaderPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/mammoth@1.8.0/mammoth.browser.min.js';
      script.async = true;
      script.onload = () => window.mammoth?.extractRawText ? resolve(window.mammoth) : reject(new Error('mammoth_missing'));
      script.onerror = () => reject(new Error('mammoth_load_failed'));
      document.head.appendChild(script);
    });
    return mammothLoaderPromise;
  }

  function loadSheetJsLibrary() {
    if (window.XLSX?.read) return Promise.resolve(window.XLSX);
    if (sheetJsLoaderPromise) return sheetJsLoaderPromise;
    sheetJsLoaderPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';
      script.async = true;
      script.onload = () => window.XLSX?.read ? resolve(window.XLSX) : reject(new Error('xlsx_missing'));
      script.onerror = () => reject(new Error('xlsx_load_failed'));
      document.head.appendChild(script);
    });
    return sheetJsLoaderPromise;
  }

  async function extractTextFromDocx(file) {
    const mammoth = await loadMammothLibrary();
    const arrayBuffer = await file.arrayBuffer();
    const result = await mammoth.extractRawText({ arrayBuffer });
    return String(result?.value || '').replace(/\r/g, '').replace(/\n{3,}/g, '\n\n').trim();
  }

  async function extractTextFromExcel(file, language) {
    const XLSX = await loadSheetJsLibrary();
    const arrayBuffer = await file.arrayBuffer();
    const workbook = XLSX.read(arrayBuffer, { type: 'array' });

    const sheetNames = workbook.SheetNames || [];
    if (!sheetNames.length) {
      return { text: '', sheetNames: [], sheetCount: 0 };
    }

    const maxSheetsToRead = 5;
    const maxRowsPerSheet = 25;
    const maxColumnsPerSheet = 12;
    const sheetTexts = [];

    for (let i = 0; i < Math.min(sheetNames.length, maxSheetsToRead); i++) {
      const sheetName = sheetNames[i];
      const sheet = workbook.Sheets[sheetName];
      if (!sheet) continue;

      const sheetData = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
      if (!sheetData.length) continue;

      const nonEmptyRows = sheetData.filter((row) => Array.isArray(row) && row.some((cell) => String(cell ?? '').trim()));
      const columnCount = nonEmptyRows.reduce((max, row) => Math.max(max, row.length), 0);
      const firstRow = sheetData[0] || [];
      const columnLabels = firstRow
        .map((col, idx) => String(col ?? '').trim() || `Col${idx + 1}`)
        .slice(0, maxColumnsPerSheet);
      const numericStats = [];

      for (let colIdx = 0; colIdx < Math.min(columnCount, maxColumnsPerSheet); colIdx += 1) {
        const values = sheetData
          .slice(1)
          .map((row) => Number(String(row?.[colIdx] ?? '').replace(',', '.')))
          .filter((value) => Number.isFinite(value));
        if (values.length < 2) continue;
        const sum = values.reduce((total, value) => total + value, 0);
        const min = Math.min(...values);
        const max = Math.max(...values);
        numericStats.push(`${columnLabels[colIdx] || `Col${colIdx + 1}`}: n=${values.length}, min=${min}, max=${max}, moyenne=${Number((sum / values.length).toFixed(2))}`);
      }

      let sheetText = [
        `${language === 'en' ? 'Sheet' : 'Feuille'}: ${sheetName}`,
        `${language === 'en' ? 'Size' : 'Taille'}: ${nonEmptyRows.length} ${language === 'en' ? 'non-empty rows' : 'lignes non vides'}, ${columnCount} ${language === 'en' ? 'columns' : 'colonnes'}`,
        `${language === 'en' ? 'Columns' : 'Colonnes'}: ${columnLabels.join(' | ') || '[non détectées]'}`,
        numericStats.length ? `${language === 'en' ? 'Numeric summary' : 'Synthèse numérique'}: ${numericStats.join(' ; ')}` : '',
        `${language === 'en' ? 'Sample rows' : 'Lignes échantillon'}:`
      ].filter(Boolean).join('\n');

      const rowsToRead = Math.min(sheetData.length, maxRowsPerSheet + 1);
      for (let rowIdx = 1; rowIdx < rowsToRead; rowIdx++) {
        const row = sheetData[rowIdx] || [];
        if (!row.some((cell) => String(cell ?? '').trim())) continue;

        const rowText = row
          .slice(0, maxColumnsPerSheet)
          .map((cell) => String(cell ?? '').trim())
          .join(' | ');
        sheetText += `\n${rowIdx}. ${rowText}`;
      }

      if (sheetData.length > maxRowsPerSheet + 1) {
        sheetText += `\n... [${language === 'en' ? 'sample truncated' : 'échantillon tronqué'}: ${sheetData.length - maxRowsPerSheet - 1} ${language === 'en' ? 'additional rows' : 'lignes supplémentaires'}]`;
      }

      sheetTexts.push(sheetText);
    }

    if (sheetNames.length > maxSheetsToRead) {
      const remaining = sheetNames.length - maxSheetsToRead;
      sheetTexts.push(`... [${language === 'en' ? `${remaining} more sheet(s)` : `${remaining} feuille(s) supplémentaire(s)`}]`);
    }

    const fullText = sheetTexts.join('\n\n');
    return {
      text: fullText,
      sheetNames,
      sheetCount: sheetNames.length,
      extractedText: fullText.length
    };
  }

  async function buildLocalFileContext(files) {
    const selected = Array.from(files || []).slice(0, maxLocalFilesPerPrompt);
    const readableNames = [], unsupportedNames = [], failedNames = [], noTextNames = [], snippets = [];
    for (const file of selected) {
      if (!isReadableTextFile(file)) {
        if (isPdfFile(file)) {
          try {
            const pdfResult = await extractTextFromPdf(file, currentLanguage);
            if (!pdfResult.text) { noTextNames.push(file.name); continue; }
            assistantLog('debug', 'pdf_extract_result', {
              fileName: file.name,
              totalPages: pdfResult.totalPages,
              extractedPages: pdfResult.extractedPages,
              ocrUsed: pdfResult.ocrUsed,
              extractedTextLength: pdfResult.text.length,
              extractedTextPreview: pdfResult.text.slice(0, 300)
            });
            snippets.push(buildDocumentContextBlock({
              label: 'PDF',
              fileName: file.name,
              text: pdfResult.text,
              maxChars: maxDocumentCharsPerFile,
              meta: [
                `Pages du PDF: ${pdfResult.totalPages}`,
                `Pages extraites: ${pdfResult.extractedPages}`,
                `OCR utilisé: ${pdfResult.ocrUsed ? 'oui' : 'non'}`
              ]
            }));
            readableNames.push(file.name);
            continue;
          } catch (error) { failedNames.push(file.name); continue; }
        }
        if (isDocxFile(file)) {
          try {
            const docxText = await extractTextFromDocx(file);
            assistantLog('debug', 'docx_extract_result', {
              fileName: file.name,
              extractedTextLength: docxText.length,
              extractedTextPreview: docxText.slice(0, 300)
            });
            if (!docxText) { noTextNames.push(file.name); continue; }
            snippets.push(buildDocumentContextBlock({
              label: 'Word DOCX',
              fileName: file.name,
              text: docxText,
              maxChars: maxDocumentCharsPerFile
            }));
            readableNames.push(file.name);
            continue;
          } catch (error) { failedNames.push(file.name); continue; }
        }
        if (isExcelFile(file)) {
          try {
            const excelResult = await extractTextFromExcel(file, currentLanguage);
            assistantLog('debug', 'excel_extract_result', {
              fileName: file.name,
              sheetCount: excelResult.sheetCount,
              sheetNames: excelResult.sheetNames,
              extractedTextLength: excelResult.text.length,
              extractedTextPreview: excelResult.text.slice(0, 300)
            });
            if (!excelResult.text) { noTextNames.push(file.name); continue; }
            snippets.push(buildDocumentContextBlock({
              label: `Excel ${getFileExtension(file.name).toUpperCase()}`,
              fileName: file.name,
              text: excelResult.text,
              maxChars: maxExcelContextCharsPerFile,
              meta: [
                `${currentLanguage === 'en' ? 'Sheets' : 'Feuilles'}: ${excelResult.sheetCount}`,
                `${currentLanguage === 'en' ? 'Sheet names' : 'Noms des feuilles'}: ${excelResult.sheetNames.join(', ')}`
              ]
            }));
            readableNames.push(file.name);
            assistantLog('debug', 'excel_context_ready', {
              fileName: file.name,
              pendingFileContextLength: snippets.join('\n\n').length
            });
            continue;
          } catch (error) { failedNames.push(file.name); continue; }
        }
        if (!isImageFile(file)) { unsupportedNames.push(file.name); continue; }
        try {
          const ocrText = await extractTextFromImage(file, currentLanguage);
          if (!ocrText) { noTextNames.push(file.name); continue; }
          const excerpt = ocrText.length > maxImageOcrCharsPerFile ? `${ocrText.slice(0, maxImageOcrCharsPerFile)}\n...[truncated]` : ocrText;
          snippets.push(`Fichier image (OCR): ${file.name}\n${excerpt}`);
          readableNames.push(file.name);
          continue;
        } catch (error) { failedNames.push(file.name); continue; }
      }
      try {
        const raw = await readFileAsText(file);
        const trimmed = raw.replace(/\r/g, '').trim();
        const excerpt = trimmed.length > maxTextCharsPerFile ? `${trimmed.slice(0, maxTextCharsPerFile)}\n...[truncated]` : trimmed;
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
    if (sessionExportButton) { sessionExportButton.title = i18n.exportChat; sessionExportButton.setAttribute('aria-label', i18n.exportChat); }
    if (sessionDeleteButton) { sessionDeleteButton.title = i18n.deleteChat; sessionDeleteButton.setAttribute('aria-label', i18n.deleteChat); }
    const sendButton = document.querySelector('#ai-assistant-form .ai-assistant-send-btn');
    if (sendButton) sendButton.textContent = i18n.send;
    if (voiceSelect) { voiceSelect.title = i18n.voiceSelectLabel; voiceSelect.setAttribute('aria-label', i18n.voiceSelectLabel); }
    refreshBubbleActionLabels();
    if (syncDefaultSessionTitles()) saveSessionsState();
    renderSessionOptions();
    setMicState(isListening);
    setTtsState(isVoiceOutputEnabled);
    if (speechRecognition) speechRecognition.lang = currentLanguage === 'en' ? 'en-US' : 'fr-FR';
    populateVoiceSelect(currentLanguage);
    renderCurrentConversation();
  }

  function buildSessionId() { return `s_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`; }

  function makeDefaultSession() {
    return { id: buildSessionId(), title: i18n.sessionDefault, summary: '', createdAt: Date.now(), updatedAt: Date.now(), history: [] };
  }

  function isDefaultSessionTitle(title) {
    const normalized = typeof title === 'string' ? title.trim() : '';
    if (!normalized) return true;
    return normalized === getI18n('fr').sessionDefault || normalized === getI18n('en').sessionDefault;
  }

  function getSessionDisplayTitle(session) {
    const title = typeof session?.title === 'string' ? session.title.trim() : '';
    return isDefaultSessionTitle(title) ? i18n.sessionDefault : title;
  }

  function syncDefaultSessionTitles() {
    if (!sessionsState?.sessions?.length) return false;
    let hasChanged = false;
    sessionsState.sessions.forEach((session) => {
      if (isDefaultSessionTitle(session.title) && session.title !== i18n.sessionDefault) {
        session.title = i18n.sessionDefault;
        hasChanged = true;
      }
    });
    return hasChanged;
  }

  function normalizeSessionSummary(summary) {
    return typeof summary === 'string' ? summary.replace(/\s+/g, ' ').trim().slice(0, maxConversationSummaryLength) : '';
  }

  function buildConversationSummary(history) {
    const normalized = normalizeHistory(history);
    const userMessages = normalized.filter((entry) => entry.role === 'user');
    if (!userMessages.length) return '';

    const firstUser = userMessages[0]?.content || '';
    const latestUser = userMessages[userMessages.length - 1]?.content || '';
    const recentUserMessages = userMessages.slice(-5).map((entry) => compactTextForMemory(entry.content, 190));
    const assistantMessages = normalized.filter((entry) => entry.role === 'assistant');
    const latestAssistant = assistantMessages[assistantMessages.length - 1]?.content || '';

    const lines = currentLanguage === 'en'
      ? [
        `Initial user goal: ${compactTextForMemory(firstUser, 260)}`,
        `Latest user request: ${compactTextForMemory(latestUser, 260)}`,
        `Recent user topics: ${recentUserMessages.join(' | ')}`,
        latestAssistant ? `Last assistant answer summary: ${compactTextForMemory(latestAssistant, 260)}` : ''
      ]
      : [
        `Objectif initial utilisateur : ${compactTextForMemory(firstUser, 260)}`,
        `Dernière demande utilisateur : ${compactTextForMemory(latestUser, 260)}`,
        `Sujets récents utilisateur : ${recentUserMessages.join(' | ')}`,
        latestAssistant ? `Dernière réponse assistant, en bref : ${compactTextForMemory(latestAssistant, 260)}` : ''
      ];

    return lines.filter(Boolean).join('\n').slice(0, maxConversationSummaryLength);
  }

  function loadSessionsState() {
    let raw = '';
    try {
      raw = localStorage.getItem(conversationStorageKey);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed?.sessions)) return null;
      const sessions = parsed.sessions.map((s) => {
        const title = typeof s?.title === 'string' ? s.title.trim() : '';
        return {
          id: typeof s?.id === 'string' ? s.id : buildSessionId(),
          title: isDefaultSessionTitle(title) ? i18n.sessionDefault : title,
          summary: normalizeSessionSummary(s?.summary),
          createdAt: Number(s?.createdAt) || Date.now(),
          updatedAt: Number(s?.updatedAt) || Date.now(),
          history: normalizeHistory(Array.isArray(s?.history) ? s.history : [])
        };
      }).slice(-maxStoredSessions);
      return { activeSessionId: typeof parsed?.activeSessionId === 'string' ? parsed.activeSessionId : '', sessions };
    } catch (error) {
      assistantLog('warn', 'history_load_failed', { reason: error?.message || 'invalid_local_storage_history' });
      try {
        if (raw) localStorage.setItem(conversationCorruptStorageKey, raw.slice(0, 250000));
        localStorage.removeItem(conversationStorageKey);
      } catch (storageError) {
        assistantLog('warn', 'history_corrupt_backup_failed', { reason: storageError?.message || 'local_storage_unavailable' });
      }
      return null;
    }
  }

  function saveSessionsState() {
    try {
      const compactState = {
        version: 2,
        savedAt: new Date().toISOString(),
        activeSessionId: sessionsState.activeSessionId,
        sessions: sessionsState.sessions.slice(0, maxStoredSessions).map((session) => ({
          ...session,
          title: typeof session.title === 'string' ? session.title.slice(0, 120) : i18n.sessionDefault,
          summary: normalizeSessionSummary(session.summary),
          history: normalizeHistory(session.history)
        }))
      };
      localStorage.setItem(conversationStorageKey, JSON.stringify(compactState));
      sessionsState = compactState;
    } catch (error) {
      assistantLog('warn', 'history_save_failed', { reason: error?.message || 'local_storage_unavailable' });
      try {
        const emergencyState = {
          version: 2,
          savedAt: new Date().toISOString(),
          activeSessionId: sessionsState.activeSessionId,
          sessions: sessionsState.sessions.slice(0, 5).map((session) => ({
            ...session,
            summary: normalizeSessionSummary(session.summary),
            history: normalizeHistory(session.history).slice(-8)
          }))
        };
        localStorage.setItem(conversationStorageKey, JSON.stringify(emergencyState));
        sessionsState = emergencyState;
      } catch (fallbackError) {
        assistantLog('error', 'history_emergency_save_failed', { reason: fallbackError?.message || 'local_storage_unavailable' });
      }
    }
  }

  function getActiveSession() {
    return sessionsState.sessions.find((s) => s.id === sessionsState.activeSessionId) || null;
  }

  function titleFromHistory(history) {
    const firstUser = history.find((h) => h.role === 'user');
    if (!firstUser?.content) return i18n.sessionDefault;
    const compact = firstUser.content
      .replace(/\s+/g, ' ')
      .replace(/^(bonjour|hello|salut|coucou|ok|parfait|merci)[,!\s]*/i, '')
      .trim();
    const fallback = compact || firstUser.content.replace(/\s+/g, ' ').trim();
    return fallback.length > 54 ? `${fallback.slice(0, 54).trim()}...` : fallback;
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
      option.textContent = getSessionDisplayTitle(session);
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
    active.summary = buildConversationSummary(active.history);
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
    sessionsState.sessions = sessionsState.sessions.slice(0, maxStoredSessions);
    sessionsState.activeSessionId = next.id;
    saveSessionsState();
    renderSessionOptions();
    renderCurrentConversation();
  }

  function formatExportDate(value) {
    const date = new Date(value || Date.now());
    if (Number.isNaN(date.getTime())) return new Date().toISOString();
    return date.toISOString();
  }

  function buildConversationMarkdown(session) {
    const title = getSessionDisplayTitle(session);
    const history = normalizeHistory(session?.history || []);
    const exportedAt = formatExportDate(Date.now());
    const languageLabel = currentLanguage === 'en' ? 'English' : 'Français';
    const lines = [
      `# ${title}`,
      '',
      `- Export: ${exportedAt}`,
      `- Language: ${languageLabel}`,
      `- Messages: ${history.length}`,
      ''
    ];

    const summary = normalizeSessionSummary(session?.summary);
    if (summary) {
      lines.push('## Memoire de conversation', '', summary, '');
    }

    lines.push('## Echanges', '');
    history.forEach((entry, index) => {
      const label = entry.role === 'assistant'
        ? (currentLanguage === 'en' ? 'Assistant' : 'Assistant')
        : (currentLanguage === 'en' ? 'User' : 'Utilisateur');
      lines.push(`### ${index + 1}. ${label}`, '', entry.content, '');
    });

    return lines.join('\n').trim() + '\n';
  }

  function exportActiveConversation() {
    const active = getActiveSession();
    const history = normalizeHistory(active?.history || []);
    if (!active || !history.length) {
      addMessage('bot', i18n.exportChatEmpty);
      return;
    }
    active.history = history;
    active.summary = buildConversationSummary(active.history);
    saveSessionsState();
    const baseName = slugifyDocumentTitle(`digital-blue-skye-ai-${getSessionDisplayTitle(active)}`);
    downloadBlob(new Blob([buildConversationMarkdown(active)], { type: 'text/markdown;charset=utf-8' }), `${baseName}.md`);
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
  if (sessionExportButton) sessionExportButton.addEventListener('click', () => exportActiveConversation());
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
      const hasDocx = normalizedFiles.some((file) => isDocxFile(file));
      const hasExcel = normalizedFiles.some((file) => isExcelFile(file));
      let ocrLoadingBubble = null, pdfLoadingBubble = null, docxLoadingBubble = null, excelLoadingBubble = null;
      if (hasImages) ocrLoadingBubble = addMessage('bot', i18n.ocrLoading);
      if (hasPdf) pdfLoadingBubble = addMessage('bot', i18n.pdfLoading);
      if (hasDocx) docxLoadingBubble = addMessage('bot', i18n.docxLoading);
      if (hasExcel) excelLoadingBubble = addMessage('bot', i18n.excelLoading);
      const result = await buildLocalFileContext(normalizedFiles);
      const vision = await buildVisionAttachments(normalizedFiles);
      if (ocrLoadingBubble) ocrLoadingBubble.remove();
      if (pdfLoadingBubble) pdfLoadingBubble.remove();
      if (docxLoadingBubble) docxLoadingBubble.remove();
      if (excelLoadingBubble) excelLoadingBubble.remove();
      pendingFileContext = result.context;
      pendingFileNames = result.readableNames;
      pendingVisionAttachments = vision.attachments;
      if (hasDocx) {
        assistantLog('debug', 'docx_context_ready', {
          docxFileNames: normalizedFiles.filter((file) => isDocxFile(file)).map((file) => file.name),
          pendingFileContextLength: pendingFileContext.length,
          pendingFileContextPreview: pendingFileContext.slice(0, 300),
          visionAttachmentsCount: pendingVisionAttachments.length
        });
      }
      if (hasPdf) {
        assistantLog('debug', 'pdf_context_ready', {
          pdfFileNames: normalizedFiles.filter((file) => isPdfFile(file)).map((file) => file.name),
          pendingFileContextLength: pendingFileContext.length,
          pendingFileContextPreview: pendingFileContext.slice(0, 300),
          visionAttachmentsCount: pendingVisionAttachments.length
        });
      }
      if (result.readableNames.length) addMessage('bot', `${i18n.fileReady} ${result.readableNames.join(', ')}`);
      if (vision.readyNames.length) addMessage('bot', `${i18n.imageReady} ${vision.readyNames.join(', ')}`);
      if (vision.failedNames.length) addMessage('bot', `${i18n.imageReadFailed} ${vision.failedNames.join(', ')}`);
      if (result.unsupportedNames.length) addMessage('bot', `${i18n.fileUnsupported} ${result.unsupportedNames.join(', ')}`);
      if (result.failedNames.length) {
        const failedLabel = hasExcel ? i18n.excelReadFailed : (hasDocx ? i18n.docxReadFailed : (hasPdf ? i18n.pdfReadFailed : (hasImages ? i18n.ocrUnavailable : i18n.fileReadFailed)));
        addMessage('bot', `${failedLabel} ${result.failedNames.join(', ')}`);
      }
      if (result.noTextNames?.length) {
        const noTextLabel = hasExcel ? i18n.excelNoText : (hasDocx ? i18n.docxNoText : (hasPdf ? i18n.pdfNoText : i18n.ocrNoText));
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
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function normalizeAssistantMarkdown(markdown) {
    const lines = String(markdown || '').replace(/\r\n?/g, '\n').split('\n');
    let inCodeBlock = false;
    let topLevelOrderedIndex = 1;
    return lines.map((line) => {
      const trimmed = line.trim();
      if (/^```/.test(trimmed)) {
        inCodeBlock = !inCodeBlock;
        return line;
      }
      if (inCodeBlock || trimmed.startsWith('|')) return line;
      const ordered = line.match(/^(\s*)(\d+)([.)])\s+(.+)$/);
      if (!ordered || ordered[1]) return line;
      const normalized = `${topLevelOrderedIndex}${ordered[3]} ${ordered[4]}`;
      topLevelOrderedIndex += 1;
      return normalized;
    }).join('\n');
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

    const withCodeBlocks = normalizeAssistantMarkdown(rawText).replace(/```([a-zA-Z0-9+#.-]*)\n([\s\S]*?)```/g, stashCodeBlock);
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
        const markerIndex = Number(line.match(/^(\d+)/)?.[1] || orderedListIndex);
        if (!inOrderedList) {
          html += markerIndex > 1 ? `<ol start="${markerIndex}">` : '<ol>';
          inOrderedList = true;
        }
        html += `<li>${linkifyLine(orderedMatch[1])}</li>`;
        orderedListIndex = markerIndex + 1;
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
      const normalizedText = normalizeAssistantMarkdown(text);
      bubble._assistantRawText = normalizedText;
      bubble.innerHTML = formatBotMessageHtml(normalizedText);
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
    const fullText = normalizeAssistantMarkdown(text);
    const bubble = document.createElement('article');
    const content = document.createElement('div');
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    bubble.className = 'ai-assistant-message ai-assistant-message--bot is-streaming';
    bubble.setAttribute('data-role', 'assistant');
    bubble._assistantRawText = fullText;
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

  function slugifyDocumentTitle(text) {
    const source = String(text || '').split('\n').find((line) => line.trim()) || 'digital-blue-skye-document';
    return source
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 58) || 'digital-blue-skye-document';
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1200);
  }

  function buildExportHtml(content, title = 'Digital Blue Skye document') {
    return `<!doctype html>
<html lang="${currentLanguage === 'en' ? 'en' : 'fr'}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <style>
    body { color: #1f2140; font-family: Arial, sans-serif; line-height: 1.6; margin: 42px auto; max-width: 860px; padding: 0 24px; }
    h1, h2, h3 { color: #4c4cff; line-height: 1.25; margin: 1.4em 0 0.55em; }
    p { margin: 0 0 0.9em; }
    table { border-collapse: collapse; margin: 1em 0; width: 100%; }
    th, td { border: 1px solid #d7d8ef; padding: 8px 10px; text-align: left; vertical-align: top; }
    th { background: #f0f1ff; }
    code, pre { background: #f6f7ff; border-radius: 6px; font-family: Consolas, monospace; }
    code { padding: 2px 5px; }
    pre { overflow-x: auto; padding: 14px; }
    blockquote { border-left: 4px solid #5d5dff; color: #555779; margin: 1em 0; padding: 0.2em 0 0.2em 1em; }
    .meta { border-bottom: 1px solid #d7d8ef; color: #6b6d8f; font-size: 0.86rem; margin-bottom: 28px; padding-bottom: 12px; }
    @media print { body { margin: 24px auto; } }
  </style>
</head>
<body>
  <div class="meta">Digital Blue Skye AI - ${new Date().toLocaleDateString(currentLanguage === 'en' ? 'en-US' : 'fr-FR')}</div>
  ${content}
</body>
</html>`;
  }

  function openPrintablePdf(content, title) {
    const html = buildExportHtml(content, title);
    const printWindow = window.open('', '_blank', 'noopener,noreferrer,width=900,height=1100');
    if (!printWindow) {
      downloadBlob(new Blob([html], { type: 'text/html;charset=utf-8' }), `${slugifyDocumentTitle(title)}.html`);
      return;
    }
    printWindow.document.open();
    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.focus();
    window.setTimeout(() => printWindow.print(), 350);
  }

  function createPdfExportElement(content, title = 'Digital Blue Skye document') {
    const wrapper = document.createElement('section');
    wrapper.className = 'ai-assistant-pdf-export';
    wrapper.innerHTML = `
      <style>
        .ai-assistant-pdf-export {
          background: #ffffff !important;
          background-image: none !important;
          box-sizing: border-box !important;
          box-shadow: none !important;
          color: #1f2140 !important;
          font-family: Arial, sans-serif;
          line-height: 1.6;
          max-width: 100%;
          overflow-wrap: break-word;
          padding: 32px 34px;
          width: 720px;
          -webkit-text-fill-color: #1f2140 !important;
        }
        .ai-assistant-pdf-export * {
          box-sizing: border-box !important;
          background-image: none !important;
          box-shadow: none !important;
          color: #1f2140 !important;
          font-family: Arial, sans-serif !important;
          opacity: 1 !important;
          text-shadow: none !important;
          -webkit-background-clip: border-box !important;
          -webkit-text-fill-color: #1f2140 !important;
        }
        .ai-assistant-pdf-export h1,
        .ai-assistant-pdf-export h2,
        .ai-assistant-pdf-export h3 {
          color: #4c4cff !important;
          line-height: 1.25;
          margin: 1.35em 0 0.55em;
          -webkit-text-fill-color: #4c4cff !important;
        }
        .ai-assistant-pdf-export p { margin: 0 0 0.9em; }
        .ai-assistant-pdf-export table {
          border-collapse: collapse;
          margin: 1em 0;
          max-width: 100%;
          table-layout: fixed;
          width: 100%;
        }
        .ai-assistant-pdf-export th,
        .ai-assistant-pdf-export td {
          border: 1px solid #d7d8ef;
          overflow-wrap: anywhere;
          padding: 8px 10px;
          text-align: left;
          vertical-align: top;
          word-break: break-word;
        }
        .ai-assistant-pdf-export th {
          background: #f0f1ff !important;
          color: #1f2140 !important;
          -webkit-text-fill-color: #1f2140 !important;
        }
        .ai-assistant-pdf-export code,
        .ai-assistant-pdf-export pre {
          background: #f6f7ff !important;
          border-radius: 6px;
          color: #1f2140 !important;
          font-family: Consolas, monospace !important;
          -webkit-text-fill-color: #1f2140 !important;
        }
        .ai-assistant-pdf-export code {
          padding: 2px 5px;
          font-family: Consolas, monospace !important;
        }
        .ai-assistant-pdf-export pre { overflow-wrap: anywhere; padding: 14px; white-space: pre-wrap; }
        .ai-assistant-pdf-export blockquote {
          border-left: 4px solid #5d5dff;
          color: #555779 !important;
          margin: 1em 0;
          padding: 0.2em 0 0.2em 1em;
          -webkit-text-fill-color: #555779 !important;
        }
        .ai-assistant-pdf-export .meta {
          border-bottom: 1px solid #d7d8ef;
          color: #6b6d8f !important;
          font-size: 0.82rem;
          margin-bottom: 28px;
          padding-bottom: 12px;
          -webkit-text-fill-color: #6b6d8f !important;
        }
        .ai-assistant-pdf-export .ai-assistant-message-actions,
        .ai-assistant-pdf-export .ai-assistant-export-actions,
        .ai-assistant-pdf-export .ai-assistant-code-copy-btn { display: none !important; }
      </style>
      <div class="meta">Digital Blue Skye AI - ${new Date().toLocaleDateString(currentLanguage === 'en' ? 'en-US' : 'fr-FR')}</div>
      ${content}
    `;
    wrapper.querySelectorAll('[class]').forEach((node) => {
      if (!node.classList.contains('meta') && !node.classList.contains('ai-assistant-pdf-export')) {
        node.removeAttribute('class');
      }
    });
    return wrapper;
  }

  function ensureHtml2PdfReady() {
    if (window.html2pdf) return Promise.resolve(window.html2pdf);
    if (html2PdfLoaderPromise) return html2PdfLoaderPromise;
    html2PdfLoaderPromise = loadExternalScript(HTML2PDF_SCRIPT_URL).then(() => {
      if (!window.html2pdf) throw new Error('html2pdf_missing');
      return window.html2pdf;
    });
    return html2PdfLoaderPromise;
  }

  async function ensureJsPdfReady() {
    let JsPdf = window.jspdf?.jsPDF || window.jsPDF;
    if (!JsPdf) {
      if (!jsPdfLoaderPromise) {
        jsPdfLoaderPromise = loadExternalScript(JSPDF_SCRIPT_URL).then(() => {
          const LoadedJsPdf = window.jspdf?.jsPDF || window.jsPDF;
          if (!LoadedJsPdf) throw new Error('jspdf_missing');
          return LoadedJsPdf;
        });
      }
      JsPdf = await jsPdfLoaderPromise;
    }
    if (!JsPdf) throw new Error('jspdf_missing');
    return JsPdf;
  }

  function cleanPdfText(value) {
    return String(value || '')
      .replace(/\u202f|\u00a0/g, ' ')
      .replace(/[“”]/g, '"')
      .replace(/[‘’]/g, "'")
      .replace(/\s+/g, ' ')
      .trim();
  }

  function stripMarkdownForPdf(value) {
    return cleanPdfText(value)
      .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '$1 ($2)')
      .replace(/\*\*([^*]+)\*\*/g, '$1')
      .replace(/\*([^*]+)\*/g, '$1')
      .replace(/`([^`]+)`/g, '$1');
  }

  function parseMarkdownTableRowForPdf(row) {
    return row.split('|').slice(1, -1).map((cell) => stripMarkdownForPdf(cell));
  }

  function drawPdfWrappedText(doc, text, x, y, maxWidth, options = {}) {
    const fontSize = options.fontSize || 10;
    const lineHeight = options.lineHeight || fontSize * 0.45;
    doc.setFont('helvetica', options.bold ? 'bold' : options.italic ? 'italic' : 'normal');
    doc.setFontSize(fontSize);
    doc.setTextColor(options.color || '#171833');
    const lines = doc.splitTextToSize(stripMarkdownForPdf(text), maxWidth);
    doc.text(lines, x, y);
    return y + (lines.length * lineHeight);
  }

  function drawPdfTable(doc, rows, state) {
    const cleanRows = rows.filter((row) => !/^\|[\s\-:|]+\|$/.test(row)).map(parseMarkdownTableRowForPdf).filter((row) => row.length);
    if (!cleanRows.length) return state.y;
    const pageHeight = doc.internal.pageSize.getHeight();
    const columnCount = Math.max(...cleanRows.map((row) => row.length));
    const weights = Array.from({ length: columnCount }, (_, columnIndex) => {
      const maxLength = Math.max(...cleanRows.map((row) => String(row[columnIndex] || '').length));
      return Math.min(Math.max(maxLength, 8), 36);
    });
    const totalWeight = weights.reduce((sum, weight) => sum + weight, 0) || 1;
    const widths = weights.map((weight) => Math.max(24, (state.contentWidth * weight) / totalWeight));
    const widthTotal = widths.reduce((sum, width) => sum + width, 0);
    widths[widths.length - 1] += state.contentWidth - widthTotal;
    let y = state.y + 3;

    cleanRows.forEach((row, rowIndex) => {
      const filledRow = Array.from({ length: columnCount }, (_, index) => row[index] || '');
      doc.setFontSize(8.4);
      const cellLines = filledRow.map((cell, index) => doc.splitTextToSize(cell, widths[index] - 5));
      const rowHeight = Math.max(11, ...cellLines.map((lines) => lines.length * 4.4 + 6));
      if (y + rowHeight > pageHeight - state.margin) {
        doc.addPage();
        y = state.margin;
      }
      let x = state.margin;
      filledRow.forEach((cell, index) => {
        const width = widths[index];
        doc.setDrawColor('#d7d8ef');
        doc.setLineWidth(0.2);
        doc.setFillColor(rowIndex === 0 ? '#f0f1ff' : '#ffffff');
        doc.rect(x, y, width, rowHeight, 'FD');
        doc.setFont('helvetica', rowIndex === 0 ? 'bold' : 'normal');
        doc.setFontSize(8.4);
        doc.setTextColor('#171833');
        doc.text(cellLines[index], x + 2.5, y + 5.2);
        x += width;
      });
      y += rowHeight;
    });
    return y + 5;
  }

  async function downloadPdfDocument(markdown, title) {
    const filename = `${slugifyDocumentTitle(title)}.pdf`;
    const source = normalizeAssistantMarkdown(markdown).replace(/\r\n?/g, '\n').trim();
    try {
      const JsPdf = await ensureJsPdfReady();
      const doc = new JsPdf({ unit: 'mm', format: 'a4', orientation: 'portrait' });
      const margin = 18;
      const pageHeight = doc.internal.pageSize.getHeight();
      const contentWidth = doc.internal.pageSize.getWidth() - (margin * 2);
      const state = { margin, contentWidth, y: margin };
      let tableRows = [];
      let codeRows = [];
      let inCode = false;

      function addPageIfNeeded(extra = 8) {
        if (state.y + extra > pageHeight - margin) {
          doc.addPage();
          state.y = margin;
        }
      }

      function flushTableRows() {
        if (!tableRows.length) return;
        state.y = drawPdfTable(doc, tableRows, state);
        tableRows = [];
      }

      function flushCodeRows() {
        if (!codeRows.length) return;
        const lines = codeRows.join('\n').split('\n');
        doc.setFillColor('#f6f7ff');
        doc.setDrawColor('#d7d8ef');
        const wrapped = lines.flatMap((line) => doc.splitTextToSize(line || ' ', contentWidth - 8));
        const height = Math.max(12, wrapped.length * 4.2 + 7);
        addPageIfNeeded(height);
        doc.roundedRect(margin, state.y, contentWidth, height, 2, 2, 'FD');
        doc.setFont('courier', 'normal');
        doc.setFontSize(8.5);
        doc.setTextColor('#171833');
        doc.text(wrapped, margin + 4, state.y + 5.5);
        state.y += height + 5;
        codeRows = [];
      }

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.setTextColor('#5b5f84');
      doc.text(`Digital Blue Skye AI - ${new Date().toLocaleDateString(currentLanguage === 'en' ? 'en-US' : 'fr-FR')}`, margin, state.y);
      state.y += 7;
      doc.setDrawColor('#d7d8ef');
      doc.line(margin, state.y, margin + contentWidth, state.y);
      state.y += 10;

      const lines = source ? source.split('\n') : ['Digital Blue Skye document'];
      lines.forEach((rawLine) => {
        const line = rawLine.trimEnd();
        const trimmed = line.trim();
        if (/^```/.test(trimmed)) {
          flushTableRows();
          if (inCode) flushCodeRows();
          inCode = !inCode;
          return;
        }
        if (inCode) {
          codeRows.push(line);
          return;
        }
        if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
          tableRows.push(trimmed);
          return;
        }
        flushTableRows();
        if (!trimmed || /^[-*_]{3,}$/.test(trimmed)) {
          state.y += 2;
          return;
        }
        const heading = trimmed.match(/^(#{1,6})\s+(.+)$/);
        const bullet = trimmed.match(/^[-*]\s+(.+)$/);
        const ordered = trimmed.match(/^(\d+)[.)]\s+(.+)$/);
        addPageIfNeeded(12);
        if (heading) {
          const level = Math.min(heading[1].length, 3);
          state.y = drawPdfWrappedText(doc, heading[2], margin, state.y, contentWidth, {
            bold: true,
            color: '#4c4cff',
            fontSize: level === 1 ? 16 : level === 2 ? 13 : 11,
            lineHeight: level === 1 ? 7 : 6
          }) + 2;
          return;
        }
        if (bullet) {
          state.y = drawPdfWrappedText(doc, `• ${bullet[1]}`, margin + 4, state.y, contentWidth - 4, { fontSize: 10, lineHeight: 5 }) + 1;
          return;
        }
        if (ordered) {
          state.y = drawPdfWrappedText(doc, `${ordered[1]}. ${ordered[2]}`, margin + 4, state.y, contentWidth - 4, { fontSize: 10, lineHeight: 5 }) + 1;
          return;
        }
        if (trimmed.startsWith('> ')) {
          doc.setDrawColor('#5d5dff');
          doc.line(margin, state.y - 3, margin, state.y + 5);
          state.y = drawPdfWrappedText(doc, trimmed.slice(2), margin + 4, state.y, contentWidth - 4, {
            italic: true,
            color: '#555779',
            fontSize: 10,
            lineHeight: 5
          }) + 2;
          return;
        }
        state.y = drawPdfWrappedText(doc, trimmed, margin, state.y, contentWidth, { fontSize: 10, lineHeight: 5 }) + 2;
      });
      flushTableRows();
      flushCodeRows();
      doc.save(filename);
    } catch (error) {
      openPrintablePdf(formatBotMessageHtml(source), title);
    }
  }

  function escapeXml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  function buildDocxTextRun(text, options = {}) {
    const props = [];
    if (options.bold) props.push('<w:b/>');
    if (options.italic) props.push('<w:i/>');
    if (options.code) props.push('<w:rFonts w:ascii="Consolas" w:hAnsi="Consolas"/><w:sz w:val="20"/>');
    if (options.size && !options.code) props.push(`<w:sz w:val="${options.size}"/>`);
    if (options.color) props.push(`<w:color w:val="${options.color}"/>`);
    const properties = props.length ? `<w:rPr>${props.join('')}</w:rPr>` : '';
    return `<w:r>${properties}<w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r>`;
  }

  function buildDocxRuns(text, baseOptions = {}) {
    const source = String(text || '').replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '$1 ($2)');
    const pattern = /(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*)/g;
    const runs = [];
    let cursor = 0;
    source.replace(pattern, (match, token, offset) => {
      if (offset > cursor) runs.push(buildDocxTextRun(source.slice(cursor, offset), baseOptions));
      if (match.startsWith('`')) {
        runs.push(buildDocxTextRun(match.slice(1, -1), { ...baseOptions, code: true }));
      } else if (match.startsWith('**')) {
        runs.push(buildDocxTextRun(match.slice(2, -2), { ...baseOptions, bold: true }));
      } else {
        runs.push(buildDocxTextRun(match.slice(1, -1), { ...baseOptions, italic: true }));
      }
      cursor = offset + match.length;
      return match;
    });
    if (cursor < source.length) runs.push(buildDocxTextRun(source.slice(cursor), baseOptions));
    return runs.length ? runs.join('') : buildDocxTextRun(source, baseOptions);
  }

  function buildDocxParagraph(text, options = {}) {
    const pProps = [];
    const rOptions = { bold: !!options.bold };
    if (options.compact) rOptions.size = 19;
    if (options.heading) {
      const level = Math.min(Math.max(options.heading, 1), 3);
      const sizes = { 1: 34, 2: 28, 3: 24 };
      pProps.push(`<w:spacing w:before="${level === 1 ? 360 : 260}" w:after="140"/>`);
      pProps.push(`<w:outlineLvl w:val="${level - 1}"/>`);
      rOptions.bold = true;
      rOptions.color = level === 1 ? '4C4CFF' : '5D5DFF';
      rOptions.size = sizes[level];
    } else if (options.bullet || options.ordered) {
      pProps.push('<w:spacing w:before="80" w:after="80"/>');
      pProps.push('<w:ind w:left="720" w:hanging="360"/>');
    } else if (options.quote) {
      pProps.push('<w:spacing w:before="120" w:after="120"/>');
      pProps.push('<w:ind w:left="520"/>');
      pProps.push('<w:pBdr><w:left w:val="single" w:sz="12" w:space="8" w:color="5D5DFF"/></w:pBdr>');
      rOptions.italic = true;
      rOptions.color = '555779';
    } else if (options.code) {
      pProps.push('<w:spacing w:before="80" w:after="80"/>');
      pProps.push('<w:shd w:fill="F6F7FF"/>');
      rOptions.code = true;
    } else if (options.compact) {
      pProps.push('<w:spacing w:before="40" w:after="40" w:line="240" w:lineRule="auto"/>');
    } else {
      pProps.push('<w:spacing w:after="140"/>');
    }
    const prefix = options.bullet ? '• ' : options.ordered ? `${options.ordered}. ` : '';
    return `<w:p>${pProps.length ? `<w:pPr>${pProps.join('')}</w:pPr>` : ''}${buildDocxRuns(`${prefix}${text}`, rOptions)}</w:p>`;
  }

  function parseMarkdownTableRow(row) {
    return row.split('|').slice(1, -1).map((cell) => cell.trim());
  }

  function buildDocxTable(rows) {
    const cleanRows = rows.filter((row) => !/^\|[\s\-:|]+\|$/.test(row)).map(parseMarkdownTableRow).filter((row) => row.length);
    if (!cleanRows.length) return '';
    const columnCount = Math.max(...cleanRows.map((row) => row.length));
    const usableWidth = 9000;
    const weights = Array.from({ length: columnCount }, (_, columnIndex) => {
      const maxLength = Math.max(...cleanRows.map((row) => String(row[columnIndex] || '').length));
      return Math.min(Math.max(maxLength, 8), 34);
    });
    const weightTotal = weights.reduce((sum, weight) => sum + weight, 0) || 1;
    const widths = weights.map((weight, index) => {
      const minWidth = columnCount >= 4 ? 1550 : 1900;
      const raw = Math.round((usableWidth * weight) / weightTotal);
      if (index === weights.length - 1) {
        const usedWidth = weights.slice(0, -1).reduce((sum, _, usedIndex) => {
          const usedRaw = Math.round((usableWidth * weights[usedIndex]) / weightTotal);
          return sum + Math.max(minWidth, usedRaw);
        }, 0);
        return Math.max(minWidth, usableWidth - usedWidth);
      }
      return Math.max(minWidth, raw);
    });
    const normalizedTotal = widths.reduce((sum, width) => sum + width, 0);
    if (normalizedTotal > usableWidth) {
      const ratio = usableWidth / normalizedTotal;
      widths.forEach((width, index) => { widths[index] = Math.floor(width * ratio); });
      widths[widths.length - 1] += usableWidth - widths.reduce((sum, width) => sum + width, 0);
    }
    const borders = ['top', 'left', 'bottom', 'right', 'insideH', 'insideV']
      .map((border) => `<w:${border} w:val="single" w:sz="6" w:space="0" w:color="D7D8EF"/>`).join('');
    const grid = widths.map((width) => `<w:gridCol w:w="${width}"/>`).join('');
    const tableRows = cleanRows.map((row, rowIndex) => {
      const filledRow = Array.from({ length: columnCount }, (_, index) => row[index] || '');
      const cells = filledRow.map((cell, columnIndex) => {
        const shade = rowIndex === 0 ? '<w:shd w:fill="F0F1FF"/>' : '';
        const verticalAlign = '<w:vAlign w:val="center"/>';
        return `<w:tc><w:tcPr><w:tcW w:w="${widths[columnIndex]}" w:type="dxa"/>${shade}${verticalAlign}</w:tcPr>${buildDocxParagraph(cell, { bold: rowIndex === 0, compact: true })}</w:tc>`;
      }).join('');
      return `<w:tr>${cells}</w:tr>`;
    }).join('');
    return `<w:tbl><w:tblPr><w:tblW w:w="${usableWidth}" w:type="dxa"/><w:tblLayout w:type="fixed"/><w:tblInd w:w="0" w:type="dxa"/><w:tblBorders>${borders}</w:tblBorders><w:tblCellMar><w:top w:w="120" w:type="dxa"/><w:left w:w="140" w:type="dxa"/><w:bottom w:w="120" w:type="dxa"/><w:right w:w="140" w:type="dxa"/></w:tblCellMar></w:tblPr><w:tblGrid>${grid}</w:tblGrid>${tableRows}</w:tbl>`;
  }

  function buildDocxDocumentXml(markdown) {
    const source = normalizeAssistantMarkdown(markdown).replace(/\r\n?/g, '\n').trim();
    const lines = source ? source.split('\n') : ['Digital Blue Skye document'];
    const blocks = [];
    let tableRows = [];
    let codeRows = [];
    let inCode = false;
    let orderedIndex = 1;

    function flushTableRows() {
      if (tableRows.length) {
        blocks.push(buildDocxTable(tableRows));
        tableRows = [];
      }
    }

    function flushCodeRows() {
      if (codeRows.length) {
        codeRows.join('\n').split('\n').forEach((line) => blocks.push(buildDocxParagraph(line || ' ', { code: true })));
        codeRows = [];
      }
    }

    lines.forEach((rawLine) => {
      const line = rawLine.trimEnd();
      if (/^```/.test(line.trim())) {
        flushTableRows();
        if (inCode) flushCodeRows();
        inCode = !inCode;
        return;
      }
      if (inCode) {
        codeRows.push(line);
        return;
      }
      if (line.trim().startsWith('|') && line.trim().endsWith('|')) {
        tableRows.push(line.trim());
        return;
      }
      flushTableRows();
      const trimmed = line.trim();
      if (!trimmed || /^[-*_]{3,}$/.test(trimmed)) return;
      const heading = trimmed.match(/^(#{1,6})\s+(.+)$/);
      if (heading) {
        orderedIndex = 1;
        blocks.push(buildDocxParagraph(heading[2], { heading: Math.min(heading[1].length, 3) }));
        return;
      }
      const bullet = trimmed.match(/^[-*]\s+(.+)$/);
      if (bullet) {
        orderedIndex = 1;
        blocks.push(buildDocxParagraph(bullet[1], { bullet: true }));
        return;
      }
      const ordered = trimmed.match(/^\d+[.)]\s+(.+)$/);
      if (ordered) {
        blocks.push(buildDocxParagraph(ordered[1], { ordered: orderedIndex }));
        orderedIndex += 1;
        return;
      }
      if (trimmed.startsWith('> ')) {
        orderedIndex = 1;
        blocks.push(buildDocxParagraph(trimmed.slice(2), { quote: true }));
        return;
      }
      orderedIndex = 1;
      blocks.push(buildDocxParagraph(trimmed));
    });
    flushTableRows();
    flushCodeRows();
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    ${blocks.filter(Boolean).join('')}
    <w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134"/></w:sectPr>
  </w:body>
</w:document>`;
  }

  function makeCrcTable() {
    const table = new Uint32Array(256);
    for (let i = 0; i < 256; i += 1) {
      let c = i;
      for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[i] = c >>> 0;
    }
    return table;
  }

  const crcTable = makeCrcTable();

  function crc32(bytes) {
    let crc = 0xffffffff;
    for (let i = 0; i < bytes.length; i += 1) crc = crcTable[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
    return (crc ^ 0xffffffff) >>> 0;
  }

  function writeUint16(bytes, offset, value) {
    bytes[offset] = value & 0xff;
    bytes[offset + 1] = (value >>> 8) & 0xff;
  }

  function writeUint32(bytes, offset, value) {
    bytes[offset] = value & 0xff;
    bytes[offset + 1] = (value >>> 8) & 0xff;
    bytes[offset + 2] = (value >>> 16) & 0xff;
    bytes[offset + 3] = (value >>> 24) & 0xff;
  }

  function createZip(files) {
    const encoder = new TextEncoder();
    const localParts = [], centralParts = [];
    let offset = 0;
    const now = new Date();
    const dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | Math.floor(now.getSeconds() / 2);
    const dosDate = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
    files.forEach((file) => {
      const nameBytes = encoder.encode(file.name);
      const dataBytes = encoder.encode(file.content);
      const crc = crc32(dataBytes);
      const local = new Uint8Array(30 + nameBytes.length + dataBytes.length);
      writeUint32(local, 0, 0x04034b50);
      writeUint16(local, 4, 20);
      writeUint16(local, 10, dosTime);
      writeUint16(local, 12, dosDate);
      writeUint32(local, 14, crc);
      writeUint32(local, 18, dataBytes.length);
      writeUint32(local, 22, dataBytes.length);
      writeUint16(local, 26, nameBytes.length);
      local.set(nameBytes, 30);
      local.set(dataBytes, 30 + nameBytes.length);
      localParts.push(local);

      const central = new Uint8Array(46 + nameBytes.length);
      writeUint32(central, 0, 0x02014b50);
      writeUint16(central, 4, 20);
      writeUint16(central, 6, 20);
      writeUint16(central, 12, dosTime);
      writeUint16(central, 14, dosDate);
      writeUint32(central, 16, crc);
      writeUint32(central, 20, dataBytes.length);
      writeUint32(central, 24, dataBytes.length);
      writeUint16(central, 28, nameBytes.length);
      writeUint32(central, 42, offset);
      central.set(nameBytes, 46);
      centralParts.push(central);
      offset += local.length;
    });
    const centralOffset = offset;
    const centralSize = centralParts.reduce((sum, part) => sum + part.length, 0);
    const end = new Uint8Array(22);
    writeUint32(end, 0, 0x06054b50);
    writeUint16(end, 8, files.length);
    writeUint16(end, 10, files.length);
    writeUint32(end, 12, centralSize);
    writeUint32(end, 16, centralOffset);
    return new Blob([...localParts, ...centralParts, end], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
  }

  function buildDocxBlob(markdown) {
    return createZip([
      { name: '[Content_Types].xml', content: '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>' },
      { name: '_rels/.rels', content: '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>' },
      { name: 'word/document.xml', content: buildDocxDocumentXml(markdown) }
    ]);
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
    const rawText = String(bubble._assistantRawText || content.innerText || '').trim();
    if (rawText.length > 80) {
      const exportActions = document.createElement('div');
      exportActions.className = 'ai-assistant-export-actions';
      exportActions.setAttribute('aria-label', i18n.exportDocument);
      const baseName = slugifyDocumentTitle(rawText);
      const exports = [
        {
          label: 'MD',
          title: i18n.downloadMd,
          action: () => downloadBlob(new Blob([rawText], { type: 'text/markdown;charset=utf-8' }), `${baseName}.md`)
        },
        {
          label: 'HTML',
          title: i18n.downloadHtml,
          action: () => downloadBlob(new Blob([buildExportHtml(content.innerHTML, baseName)], { type: 'text/html;charset=utf-8' }), `${baseName}.html`)
        },
        {
          label: 'PDF',
          title: i18n.downloadPdf,
          action: () => downloadPdfDocument(rawText, baseName)
        },
        {
          label: 'DOCX',
          title: i18n.downloadDocx,
          action: () => downloadBlob(buildDocxBlob(rawText), `${baseName}.docx`)
        }
      ];
      exports.forEach((item) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'ai-assistant-export-btn';
        button.textContent = item.label;
        button.title = item.title;
        button.setAttribute('aria-label', item.title);
        button.addEventListener('click', item.action);
        exportActions.appendChild(button);
      });
      bubble.appendChild(exportActions);
    }
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
      .replace(/<\/?(assistant|user|system)\s*>/gi, '')
      .replace(/[●•◦▪▫]/g, '').replace(/[ \t]{2,}/g, ' ')
      .replace(/\n{3,}/g, '\n\n').trim();
  }

  function stripModelSourcesSection(rawText) {
    const lines = String(rawText || '').replace(/\r/g, '').split('\n');
    const sourceHeadingPattern = /^\s{0,3}(?:#{1,6}\s*)?(?:\*\*)?\s*(sources?|références?|references?)\s*:?\s*(?:\*\*)?\s*$/i;
    const sourceIntroPattern = /^\s{0,3}(?:sources?|références?|references?)\s+(?:trouvées?|found)\s*:?\s*$/i;
    let sourceStartIndex = -1;

    for (let index = lines.length - 1; index >= 0; index -= 1) {
      const line = lines[index].trim();
      if (sourceHeadingPattern.test(line) || sourceIntroPattern.test(line)) {
        sourceStartIndex = index;
        break;
      }
    }

    if (sourceStartIndex < 0) return String(rawText || '').trim();
    return lines.slice(0, sourceStartIndex).join('\n').replace(/\n{3,}/g, '\n\n').trim();
  }

  function escapeMarkdownLinkText(text) {
    return String(text || '')
      .replace(/\\/g, '\\\\')
      .replace(/\[/g, '\\[')
      .replace(/\]/g, '\\]')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function normalizeWebSearchResults(results) {
    if (!Array.isArray(results)) return [];
    const seen = new Set();
    return results
      .map((result, index) => ({
        index: Number(result?.index) > 0 ? Number(result.index) : index + 1,
        title: String(result?.title || result?.link || '').trim(),
        link: String(result?.link || '').trim(),
        snippet: String(result?.snippet || '').replace(/\s+/g, ' ').trim(),
        score: result?.score ?? null
      }))
      .filter((result) => result.title && /^https?:\/\//i.test(result.link))
      .filter((result) => {
        const key = result.link.replace(/\/$/, '').toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
  }

  function getWebSourceDomain(url) {
    try {
      return new URL(url).hostname.replace(/^www\./, '');
    } catch (error) {
      return '';
    }
  }

  function getReadableSourceName(source) {
    const domain = getWebSourceDomain(source.link);
    if (!domain) return source.title;
    return domain
      .split('.')
      .slice(0, -1)
      .join('.')
      .replace(/(^|[-.])\w/g, (match) => match.toUpperCase())
      .replace(/[-.]/g, ' ');
  }

  function truncateSourceText(text, maxLength = 210) {
    const value = String(text || '')
      .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '$1')
      .replace(/https?:\/\/\S+/g, '')
      .replace(/[#*_`|[\]()]/g, ' ')
      .replace(/\s*[-•]\s*/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (value.length <= maxLength) return value;
    return `${value.slice(0, maxLength).trim()}...`;
  }

  function appendWebSearchSources(bubble, results, debugWeb = false) {
    const sources = normalizeWebSearchResults(results);
    const content = bubble?.querySelector('.ai-assistant-message-content');
    if (!content || !sources.length) return;

    bubble.classList.add('has-web-sources');

    const sourceByIndex = new Map(sources.map((source, index) => [index + 1, source]));
    content.querySelectorAll('.ai-assistant-citation').forEach((citation) => {
      const sourceIndex = Number((citation.textContent || '').match(/\d+/)?.[0] || 0);
      const source = sourceByIndex.get(sourceIndex);
      if (!source || citation.querySelector('a')) return;
      const link = document.createElement('a');
      link.href = source.link;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.textContent = `[${sourceIndex}]`;
      link.title = source.title;
      citation.textContent = '';
      citation.appendChild(link);
    });

    const section = document.createElement('section');
    section.className = 'web-sources-section';
    section.setAttribute('aria-label', currentLanguage === 'en' ? 'Verified web sources' : 'Sources web vérifiées');

    const badge = document.createElement('div');
    badge.className = 'web-search-badge';
    badge.textContent = currentLanguage === 'en' ? 'Verified web search' : 'Sources vérifiées';
    section.appendChild(badge);

    const title = document.createElement('h3');
    title.className = 'web-sources-title';
    title.textContent = currentLanguage === 'en' ? 'Sources consulted' : 'Sources consultées';
    section.appendChild(title);

    const cards = document.createElement('div');
    cards.className = 'web-sources-grid';

    sources.forEach((source, index) => {
      const domain = getWebSourceDomain(source.link);
      const card = document.createElement('article');
      card.className = 'web-source-card';

      const sourceTitle = document.createElement('strong');
      sourceTitle.className = 'web-source-title';
      sourceTitle.textContent = `[${index + 1}] ${source.title}`;
      card.appendChild(sourceTitle);

      if (domain) {
        const domainNode = document.createElement('span');
        domainNode.className = 'web-source-domain';
        domainNode.textContent = domain;
        card.appendChild(domainNode);
      }

      if (source.snippet) {
        const snippet = document.createElement('p');
        snippet.className = 'web-source-snippet';
        snippet.textContent = truncateSourceText(source.snippet);
        card.appendChild(snippet);
      }

      const link = document.createElement('a');
      link.className = 'web-source-link';
      link.href = source.link;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.textContent = currentLanguage === 'en' ? 'Read source' : 'Lire la source';
      card.appendChild(link);

      const details = document.createElement('details');
      details.className = 'web-source-details';
      details.open = Boolean(debugWeb);
      const summary = document.createElement('summary');
      summary.textContent = currentLanguage === 'en' ? 'Technical details' : 'Voir les détails techniques';
      details.appendChild(summary);

      const technical = document.createElement('dl');
      [
        [currentLanguage === 'en' ? 'Index' : 'Index', String(index + 1)],
        ['URL', source.link],
        ['Snippet', source.snippet || ''],
        ['Score', source.score == null ? '' : String(source.score)]
      ].forEach(([label, value]) => {
        if (!value) return;
        const dt = document.createElement('dt');
        dt.textContent = label;
        const dd = document.createElement('dd');
        dd.textContent = value;
        technical.append(dt, dd);
      });
      details.appendChild(technical);
      card.appendChild(details);

      cards.appendChild(card);
    });

    section.appendChild(cards);

    const compactSources = document.createElement('p');
    compactSources.className = 'web-sources-compact';
    compactSources.textContent = currentLanguage === 'en' ? 'Sources consulted: ' : 'Sources consultées : ';
    sources.forEach((source, index) => {
      if (index > 0) compactSources.appendChild(document.createTextNode(' · '));
      const link = document.createElement('a');
      link.href = source.link;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.textContent = `[${index + 1}] ${getReadableSourceName(source)} — ${currentLanguage === 'en' ? 'Read article' : 'Lire l’article'}`;
      compactSources.appendChild(link);
    });
    section.appendChild(compactSources);

    content.appendChild(section);
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

  async function sendAssistantRequest(payload) {
    const startedAt = performance.now();
    const response = await fetch(API_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const raw = await response.text();
    let data = null;
    try {
      data = raw ? JSON.parse(raw) : {};
    } catch (error) {
      const invalidResponseError = new Error('invalid_assistant_response');
      invalidResponseError.status = response.status;
      invalidResponseError.rawLength = raw.length;
      throw invalidResponseError;
    }
    assistantLog(response.ok && data?.ok ? 'debug' : 'warn', 'api_response', {
      ok: Boolean(data?.ok),
      httpStatus: response.status,
      model: data?.resolved_model || data?.model || '',
      fallbackModelUsed: Boolean(data?.fallback_model_used),
      durationMs: Math.round(performance.now() - startedAt)
    });
    return {
      ...data,
      httpStatus: response.status
    };
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

  function shouldUseWebSearchForPrompt(text) {
    const value = String(text || '').toLowerCase();
    if (!value.trim()) return false;
    const explicitTriggers = [
      'recherche web',
      'cherche sur le web',
      'rechercher sur le web',
      'recherche internet',
      'cherche sur internet',
      'search the web',
      'web search',
      'browse the web'
    ];
    if (explicitTriggers.some((trigger) => value.includes(trigger))) return true;
    const currentInfoTriggers = [
      'dernières annonces',
      'derniere annonce',
      'dernières actualités',
      'derniere actualite',
      'actualité',
      'actualités',
      'aujourd’hui',
      "aujourd'hui",
      'en temps réel',
      'temps reel',
      'latest news',
      'latest announcement',
      'recent announcement',
      'current news',
      'real time'
    ];
    return currentInfoTriggers.some((trigger) => value.includes(trigger));
  }

  async function askAI(userText, fileContext = '', attachments = []) {
    const loading = addTypingMessage();
    try {
      const dateContext = getAssistantCurrentDateContext();
      const effectiveWebSearch = isWebSearchActive || shouldUseWebSearchForPrompt(userText);

      // Activer le statut "recherche en cours" si recherche web activée
      if (effectiveWebSearch) {
        setWebSearchInProgress(true);
      }

      const webAccessInstruction = effectiveWebSearch
        ? (currentLanguage === 'en'
          ? 'A live web search will be requested through the backend for this message. Use the returned sources when available, cite them with [1], [2], etc., and clearly indicate only if the search fails or returns insufficient results.'
          : 'Une recherche web temps réel va être demandée au backend pour ce message. Utilise les sources retournées quand elles sont disponibles, cite-les avec [1], [2], etc., et indique seulement si la recherche échoue ou si les résultats sont insuffisants.')
        : (currentLanguage === 'en'
          ? 'For latest/current market facts, product launches, prices, rankings, laws, or news: you do not have live web access. Do not invent models, examples, dates, specs, prices, citations, or rankings. If no source is provided, say that live verification is required and offer a safe comparison framework using neutral placeholders only.'
          : "Pour les faits récents, les dernières sorties produit, les prix, classements, lois ou actualités : tu n’as pas d’accès web temps réel. N’invente jamais de modèles, exemples, dates, fiches techniques, prix, citations ou classements. Si aucune source n’est fournie, explique qu’une vérification web est nécessaire et propose une grille de comparaison fiable avec uniquement des placeholders neutres.");

      const styleInstruction = currentLanguage === 'en'
        ? [
          `Current date: ${dateContext.isoDate} (${dateContext.timezone}). Treat ${dateContext.isoDate.slice(0, 4)} as the current year.`,
          'Never say we are in 2024 unless the user explicitly asks about 2024.',
          webAccessInstruction,
          'Formatting instructions: answer in clean Markdown, use complete punctuated sentences, avoid standalone "---" separators, and use continuous numbered lists when relevant.',
          fileContext ? 'When a local file context is provided, analyze only the extracted text. For spreadsheets, summarize workbook structure, key columns, visible trends, anomalies, and concrete next actions. If the sample is truncated, state the limitation clearly.' : ''
        ].filter(Boolean).join('\n')
        : [
          `Date actuelle : ${dateContext.isoDate} (${dateContext.timezone}). Considère ${dateContext.isoDate.slice(0, 4)} comme l’année en cours.`,
          "Ne dis jamais que nous sommes en 2024 sauf si l’utilisateur parle explicitement de 2024.",
          webAccessInstruction,
          'Consignes de mise en forme : réponds en Markdown propre, avec des phrases complètes et ponctuées, évite les séparateurs "---" seuls, et utilise des listes numérotées continues quand c’est pertinent.',
          fileContext ? 'Quand un contexte de fichier local est fourni, analyse uniquement le texte extrait. Pour un tableur, présente la structure du classeur, les colonnes clés, les tendances visibles, les anomalies et les prochaines actions concrètes. Si l’échantillon est tronqué, indique clairement cette limite.' : ''
        ].filter(Boolean).join('\n');
      const composedMessage = fileContext
        ? `${styleInstruction}\n\n${userText}\n\n---\nContexte de fichiers locaux extrait côté navigateur (texte uniquement, aucun binaire brut n’est envoyé au modèle). Le contenu peut être découpé en chunks et contenir des métadonnées de pages : analyse l’ensemble du contexte fourni, cite les limites si le contexte indique une troncature, et ne réponds pas que tu as reçu un fichier binaire :\n${fileContext}`
        : `${styleInstruction}\n\n${userText}`;
      const payload = {
        message: composedMessage,
        history: fileContext ? [] : chatHistory.slice(-apiHistoryWindow),
        conversationSummary: fileContext ? '' : normalizeSessionSummary(getActiveSession()?.summary),
        language: currentLanguage === 'en' ? 'en' : 'fr',
        currentDate: dateContext,
        mode: 'chat',
        attachments,
        searchWeb: effectiveWebSearch,
        webSearchQuery: userText
      };
      assistantLog('debug', 'api_request', {
        historyMessages: payload.history.length,
        hasConversationSummary: Boolean(payload.conversationSummary),
        hasFileContext: Boolean(fileContext),
        fileContextLength: fileContext.length,
        fileContextPreview: fileContext.slice(0, 300),
        attachments: attachments.length,
        webSearchActive: effectiveWebSearch,
        webSearchManualToggle: isWebSearchActive
      });
      const data = await sendAssistantRequest(payload);

      // Désactiver le statut "recherche en cours"
      if (effectiveWebSearch) {
        setWebSearchInProgress(false);
      }

      loading.remove();
      if (data.ok) {
        let cleanedReply = cleanAssistantReplyText(data.reply);
        if (data.web_search_performed && data.web_search_results?.length) {
          cleanedReply = stripModelSourcesSection(cleanedReply);
          assistantLog('debug', 'web_search_results', {
            count: normalizeWebSearchResults(data.web_search_results).length,
            result1Title: data.web_search_results[0]?.title,
            result1Link: data.web_search_results[0]?.link,
            result2Title: data.web_search_results[1]?.title,
            result2Link: data.web_search_results[1]?.link,
            deterministicWebReply: Boolean(data.deterministic_web_reply),
            debugWeb: Boolean(data.debug_web)
          });
        }
        if (data.web_search_requested && !data.web_search_performed && data.web_search_error) {
          const searchErrorNote = currentLanguage === 'en'
            ? `\n\n**Web search status**\nThe live web search could not be completed: ${data.web_search_error}.`
            : `\n\n**Statut recherche web**\nLa recherche web temps réel n’a pas pu aboutir : ${data.web_search_error}.`;
          cleanedReply += searchErrorNote;
        }
        const botBubble = await addStreamingBotMessage(cleanedReply);
        if (data.web_search_performed && data.web_search_results?.length) {
          appendWebSearchSources(botBubble, data.web_search_results, Boolean(data.debug_web));
          scrollConversationToBottom('smooth');
        }
        speakText(cleanedReply, botBubble);
        chatHistory.push({ role: 'assistant', content: cleanedReply });
        persistActiveConversation();
      } else {
        assistantLog('warn', 'api_error', {
          httpStatus: data.httpStatus || 0,
          error: data.error || 'unknown_api_error',
          diagnostic: data.diagnostic || null
        });
        const msg = formatAssistantApiError(data);
        addMessage('bot', msg);
        chatHistory.push({ role: 'assistant', content: msg });
        persistActiveConversation();
      }
    } catch (e) {
      assistantLog('error', 'api_request_failed', {
        reason: e?.message || 'network_error',
        status: e?.status || 0
      });
      if (loading) loading.remove();

      // S’assurer que le statut est désactivé en cas d’erreur
      if (isWebSearchActive || shouldUseWebSearchForPrompt(userText)) {
        setWebSearchInProgress(false);
      }

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

  let isWebSearchActive = false;
  let isWebSearchInProgress = false;

  function setWebSearchState(active) {
    isWebSearchActive = active;
    if (webSearchButton) {
      webSearchButton.classList.toggle('is-active', active);
      webSearchButton.setAttribute('aria-pressed', String(active));
      updateWebSearchButtonLabel();
    }
  }

  function setWebSearchInProgress(inProgress) {
    isWebSearchInProgress = inProgress;
    if (webSearchButton) {
      webSearchButton.classList.toggle('is-loading', inProgress);
      webSearchButton.disabled = inProgress;
      updateWebSearchButtonLabel();
    }
  }

  function updateWebSearchButtonLabel() {
    if (!webSearchButton) return;
    if (isWebSearchInProgress) {
      webSearchButton.title = i18n.webSearching;
      webSearchButton.setAttribute('aria-label', i18n.webSearching);
    } else {
      webSearchButton.title = i18n.webSearch;
      webSearchButton.setAttribute('aria-label', i18n.webSearch);
    }
  }

  if (webSearchButton) {
    webSearchButton.addEventListener('click', () => {
      if (!isWebSearchInProgress) {
        setWebSearchState(!isWebSearchActive);
      }
    });
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
