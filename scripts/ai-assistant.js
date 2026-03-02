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
        expand: 'Expand',
        collapse: 'Collapse',
        micOn: 'Enable microphone',
        micOff: 'Stop microphone',
        ttsOn: 'Voice playback enabled',
        ttsOff: 'Voice playback disabled',
        speechUnsupported: 'Voice dictation is not available on this browser',
        loading: '...',
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
      ocrLoading: 'Lecture du texte de l’image (OCR)...',
      ocrNoText: 'Aucun texte lisible trouvé dans l’image :',
      ocrUnavailable: 'OCR indisponible dans ce navigateur/session.',
      sendWithoutTextWithFiles: 'Merci d’analyser les fichiers joints.',
      copy: 'Copier',
      copied: 'Copié',
      expand: 'Dérouler',
      collapse: 'Réduire',
      micOn: 'Activer le micro',
      micOff: 'Arrêter le micro',
      ttsOn: 'Lecture vocale activée',
      ttsOff: 'Lecture vocale désactivée',
      speechUnsupported: 'Dictée vocale non disponible sur ce navigateur',
      loading: '...',
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

  // Injecte l'interface de chat si elle n'est pas déjà présente dans la page.
  function ensureAssistantMarkup() {
    const launcher = document.getElementById('ai-assistant-launcher');
    const panel = document.getElementById('ai-assistant-panel');
    const micIconUrl = resolveUiIconUrl('icons8-mic-48.png');
    const voiceIconUrl = resolveUiIconUrl('icons8-voice-64.png');
    if (!launcher || !panel) {
      const markup = `
        <button id="ai-assistant-launcher" class="ai-assistant-launcher" type="button">
          <span class="ai-assistant-launcher__dot"></span>
          <span>Digital IA</span>
        </button>
        <aside id="ai-assistant-panel" class="ai-assistant-panel" aria-hidden="true">
          <header class="ai-assistant-header">
            <h2 class="ai-assistant-title">Digital Blue Skye AI</h2>
            <button id="ai-assistant-close" class="ai-assistant-close" type="button">&times;</button>
          </header>
          ${createSessionControlsMarkup()}
          <div id="ai-assistant-messages" class="ai-assistant-messages"></div>
          <div id="ai-assistant-quick-actions" class="ai-assistant-quick-actions"></div>
          <form id="ai-assistant-form" class="ai-assistant-form">
            ${createAttachControlsMarkup()}
            <input id="ai-assistant-input" type="text" autocomplete="off" placeholder="${i18n.inputPlaceholder}">
            ${createVoiceControlsMarkup(micIconUrl, voiceIconUrl)}
            <button type="submit" class="ai-assistant-send-btn">${i18n.send}</button>
          </form>
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

  // Point d'entrée de l'API de l'assistant IA.
  const API_ENDPOINT = 'https://digitalblueskye-ai.djelloulabid75.workers.dev';
  const panel = document.getElementById('ai-assistant-panel');
  const panelHeader = panel ? panel.querySelector('.ai-assistant-header') : null;
  const launcherButton = document.getElementById('ai-assistant-launcher');
  const closeButton = document.getElementById('ai-assistant-close');
  const messagesContainer = document.getElementById('ai-assistant-messages');
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
  // Historique local de conversation envoyé partiellement à l'API.
  let chatHistory = [];
  let sessionsState = { activeSessionId: '', sessions: [] };
  let pendingFileContext = '';
  let pendingFileNames = [];
  let pendingVisionAttachments = [];
  let isVoiceOutputEnabled = true;
  let isListening = false;
  let availableTtsVoices = [];
  const selectedTtsVoices = { fr: null, en: null };
  const voicePreferenceStorageKey = 'ai_assistant_voice_pref_v1';

  const preferredVoiceNames = {
    fr: ['Aurelie', 'Amelie', 'Virginie', 'Marie', 'Thomas'],
    en: ['Samantha', 'Karen', 'Allison', 'Ava', 'Serena', 'Moira', 'Daniel']
  };
  const conversationStorageKey = 'ai_assistant_conversations_v1';
  const panelPositionStorageKey = 'ai_assistant_panel_position_v1';
  const panelSizeStorageKey = 'ai_assistant_panel_size_v1';

  function isDesktopPanelDragEnabled() {
    return window.matchMedia('(min-width: 769px)').matches;
  }

  function clampPanelPosition(left, top) {
    if (!panel) return { left, top };
    const margin = 8;
    const maxLeft = Math.max(margin, window.innerWidth - panel.offsetWidth - margin);
    const maxTop = Math.max(margin, window.innerHeight - panel.offsetHeight - margin);
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
    } catch (_) {
      // ignore storage errors
    }
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
    } catch (_) {
      // ignore parse errors
    }
  }

  function applyPanelPosition(left, top, persist = true) {
    if (!panel) return;
    const next = clampPanelPosition(left, top);
    panel.style.left = `${next.left}px`;
    panel.style.top = `${next.top}px`;
    panel.style.transform = panel.classList.contains('is-open')
      ? 'translate(0, 0) scale(1)'
      : 'translate(0, 0) scale(0.98)';
    panel.classList.add('is-draggable');
    if (!persist) return;
    try {
      localStorage.setItem(panelPositionStorageKey, JSON.stringify(next));
    } catch (_) {
      // ignore storage errors
    }
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
    } catch (_) {
      // ignore parse errors
    }
  }

  function resetPanelPosition(removeSaved = false) {
    if (!panel) return;
    panel.classList.remove('is-draggable');
    panel.style.removeProperty('left');
    panel.style.removeProperty('top');
    panel.style.removeProperty('transform');
    if (!removeSaved) return;
    try {
      localStorage.removeItem(panelPositionStorageKey);
    } catch (_) {
      // ignore storage errors
    }
  }

  function resetPanelSize(removeSaved = false) {
    if (!panel) return;
    panel.style.removeProperty('width');
    panel.style.removeProperty('height');
    panel.style.removeProperty('max-width');
    panel.style.removeProperty('max-height');
    if (!removeSaved) return;
    try {
      localStorage.removeItem(panelSizeStorageKey);
    } catch (_) {
      // ignore storage errors
    }
  }

  function setupPanelDrag() {
    if (!panel) return;

    let dragState = null;

    function isInteractiveDragTarget(target) {
      if (!target || !target.closest) return false;
      return Boolean(
        target.closest(
          'input, textarea, button, select, option, a, label, [contenteditable="true"], ' +
          '.ai-assistant-attach-menu'
        )
      );
    }

    panel.addEventListener('mousedown', (event) => {
      if (!isDesktopPanelDragEnabled()) return;
      if (!panel.classList.contains('is-open')) return;
      if (event.button !== 0) return;
      if (isInteractiveDragTarget(event.target)) return;

      const rect = panel.getBoundingClientRect();
      const offsetX = event.clientX - rect.left;
      const offsetY = event.clientY - rect.top;
      const resizeHandleSize = 26;
      const isOnResizeHandle =
        offsetX >= rect.width - resizeHandleSize &&
        offsetY >= rect.height - resizeHandleSize;

      // Preserve native CSS resize behavior in bottom-right corner.
      if (isOnResizeHandle) return;

      dragState = {
        offsetX,
        offsetY,
      };
      panel.classList.add('is-dragging');
      event.preventDefault();
    });

    window.addEventListener('mousemove', (event) => {
      if (!dragState || !panel) return;
      const left = event.clientX - dragState.offsetX;
      const top = event.clientY - dragState.offsetY;
      applyPanelPosition(left, top, false);
    });

    window.addEventListener('mouseup', () => {
      if (panel && isDesktopPanelDragEnabled()) {
        const rect = panel.getBoundingClientRect();
        if (Number.isFinite(rect.width) && Number.isFinite(rect.height)) {
          applyPanelSize(rect.width, rect.height, true);
        }
      }

      if (!dragState || !panel) return;
      dragState = null;
      panel.classList.remove('is-dragging');
      const left = Number.parseFloat(panel.style.left);
      const top = Number.parseFloat(panel.style.top);
      if (Number.isFinite(left) && Number.isFinite(top)) {
        applyPanelPosition(left, top, true);
      }
    });

    window.addEventListener('resize', () => {
      if (!panel) return;
      if (!isDesktopPanelDragEnabled()) {
        resetPanelPosition(false);
        resetPanelSize(false);
        return;
      }
      const width = Number.parseFloat(panel.style.width);
      const height = Number.parseFloat(panel.style.height);
      if (Number.isFinite(width) && Number.isFinite(height)) {
        applyPanelSize(width, height, false);
      } else {
        loadPanelSize();
      }
      const left = Number.parseFloat(panel.style.left);
      const top = Number.parseFloat(panel.style.top);
      if (Number.isFinite(left) && Number.isFinite(top)) {
        applyPanelPosition(left, top, false);
      } else {
        loadPanelPosition();
      }
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
  const readableFileExtensions = new Set(['txt', 'md', 'markdown', 'json', 'csv', 'log', 'xml', 'html', 'htm', 'js', 'ts', 'css', 'py', 'php', 'java', 'c', 'cpp', 'sql', 'yaml', 'yml']);
  const imageFileExtensions = new Set(['png', 'jpg', 'jpeg', 'webp', 'bmp', 'gif', 'tiff']);
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
    const readyNames = [];
    const failedNames = [];
    const attachments = [];

    for (const file of selected) {
      try {
        const url = await readFileAsDataUrl(file);
        if (!url.startsWith('data:image/')) {
          failedNames.push(file.name);
          continue;
        }
        attachments.push({ type: 'image_url', name: file.name, url });
        readyNames.push(file.name);
      } catch (error) {
        failedNames.push(file.name);
      }
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
      script.onload = () => {
        if (window.Tesseract?.recognize) {
          resolve(window.Tesseract);
        } else {
          reject(new Error('ocr_library_missing'));
        }
      };
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
        if (!window.pdfjsLib?.getDocument) {
          reject(new Error('pdfjs_missing'));
          return;
        }
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
      if (pageText) {
        textChunks.push(`Page ${pageNum}: ${pageText}`);
      }
    }

    const extractedText = textChunks.join('\n\n').trim();
    if (extractedText) return extractedText;

    // Fallback OCR for scanned PDFs: render first pages to canvas, then OCR.
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
      if (ocrText) {
        ocrChunks.push(`Page ${pageNum}: ${ocrText}`);
      }
    }

    return ocrChunks.join('\n\n').trim();
  }

  async function buildLocalFileContext(files) {
    const maxFiles = 4;
    const maxCharsPerFile = 5000;
    const selected = Array.from(files || []).slice(0, maxFiles);
    const readableNames = [];
    const unsupportedNames = [];
    const failedNames = [];
    const noTextNames = [];
    const snippets = [];

    for (const file of selected) {
      if (!isReadableTextFile(file)) {
        if (isPdfFile(file)) {
          try {
            const pdfText = await extractTextFromPdf(file, currentLanguage);
            if (!pdfText) {
              noTextNames.push(file.name);
              continue;
            }
            const excerpt = pdfText.length > maxCharsPerFile ? `${pdfText.slice(0, maxCharsPerFile)}\n...[truncated]` : pdfText;
            snippets.push(`Fichier PDF: ${file.name}\n${excerpt}`);
            readableNames.push(file.name);
            continue;
          } catch (error) {
            failedNames.push(file.name);
            continue;
          }
        }
        if (!isImageFile(file)) {
          unsupportedNames.push(file.name);
          continue;
        }
        try {
          const ocrText = await extractTextFromImage(file, currentLanguage);
          if (!ocrText) {
            noTextNames.push(file.name);
            continue;
          }
          const excerpt = ocrText.length > maxCharsPerFile ? `${ocrText.slice(0, maxCharsPerFile)}\n...[truncated]` : ocrText;
          snippets.push(`Fichier image (OCR): ${file.name}\n${excerpt}`);
          readableNames.push(file.name);
          continue;
        } catch (error) {
          failedNames.push(file.name);
          continue;
        }
      }
      try {
        const raw = await readFileAsText(file);
        const trimmed = raw.replace(/\r/g, '').trim();
        const excerpt = trimmed.length > maxCharsPerFile ? `${trimmed.slice(0, maxCharsPerFile)}\n...[truncated]` : trimmed;
        snippets.push(`Fichier: ${file.name}\n${excerpt || '[empty file]'}`);
        readableNames.push(file.name);
      } catch (error) {
        failedNames.push(file.name);
      }
    }

    return {
      context: snippets.join('\n\n'),
      readableNames,
      unsupportedNames,
      failedNames,
      noTextNames
    };
  }

  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  const speechRecognition = SpeechRecognition ? new SpeechRecognition() : null;

  if (speechRecognition) {
    // Définit automatiquement la langue de dictée selon la langue de la page.
    speechRecognition.lang = currentLanguage === 'en' ? 'en-US' : 'fr-FR';
    speechRecognition.interimResults = false;
    speechRecognition.maxAlternatives = 1;
  }

  function applyAssistantLanguage(lang) {
    currentLanguage = normalizeLanguage(lang) || getPreferredLanguage();
    if (currentLanguage !== 'en' && currentLanguage !== 'fr') {
      currentLanguage = 'fr';
    }
    i18n = getI18n(currentLanguage);
    if (input) input.placeholder = i18n.inputPlaceholder;
    if (attachToggle) {
      attachToggle.title = i18n.attach;
      attachToggle.setAttribute('aria-label', i18n.attach);
    }
    if (attachMenu) {
      attachMenu.setAttribute('aria-label', i18n.attachMenu);
    }
    const attachFileLabel = attachFileButton?.querySelector('span');
    if (attachFileLabel) attachFileLabel.textContent = i18n.attachFiles;
    const attachDriveLabel = attachDriveButton?.querySelector('span');
    if (attachDriveLabel) attachDriveLabel.textContent = i18n.attachDrive;
    if (sessionLabel) sessionLabel.textContent = i18n.historyLabel;
    if (sessionSelect) sessionSelect.setAttribute('aria-label', i18n.historyLabel);
    if (sessionNewButton) {
      sessionNewButton.title = i18n.newChat;
      sessionNewButton.setAttribute('aria-label', i18n.newChat);
    }
    if (sessionDeleteButton) {
      sessionDeleteButton.title = i18n.deleteChat;
      sessionDeleteButton.setAttribute('aria-label', i18n.deleteChat);
    }
    const sendButton = document.querySelector('#ai-assistant-form .ai-assistant-send-btn');
    if (sendButton) sendButton.textContent = i18n.send;
    if (voiceSelect) {
      voiceSelect.title = i18n.voiceSelectLabel;
      voiceSelect.setAttribute('aria-label', i18n.voiceSelectLabel);
    }
    refreshBubbleActionLabels();
    renderSessionOptions();
    setMicState(isListening);
    setTtsState(isVoiceOutputEnabled);
    if (speechRecognition) {
      speechRecognition.lang = currentLanguage === 'en' ? 'en-US' : 'fr-FR';
    }
    populateVoiceSelect(currentLanguage);
    renderCurrentConversation();
  }

  function buildSessionId() {
    return `s_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
  }

  function makeDefaultSession() {
    return {
      id: buildSessionId(),
      title: i18n.sessionDefault,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      history: []
    };
  }

  function loadSessionsState() {
    try {
      const raw = localStorage.getItem(conversationStorageKey);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed?.sessions)) return null;
      const sessions = parsed.sessions
        .map((s) => ({
          id: typeof s?.id === 'string' ? s.id : buildSessionId(),
          title: typeof s?.title === 'string' && s.title.trim() ? s.title : i18n.sessionDefault,
          createdAt: Number(s?.createdAt) || Date.now(),
          updatedAt: Number(s?.updatedAt) || Date.now(),
          history: normalizeHistory(Array.isArray(s?.history) ? s.history : [])
        }))
        .slice(-20);
      return {
        activeSessionId: typeof parsed?.activeSessionId === 'string' ? parsed.activeSessionId : '',
        sessions
      };
    } catch (error) {
      return null;
    }
  }

  function saveSessionsState() {
    try {
      localStorage.setItem(conversationStorageKey, JSON.stringify(sessionsState));
    } catch (error) {
      // Ignore storage failures.
    }
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
    if (sessionsState.activeSessionId) {
      sessionSelect.value = sessionsState.activeSessionId;
    }
  }

  function renderCurrentConversation() {
    if (!messagesContainer) return;
    messagesContainer.innerHTML = '';
    const active = getActiveSession();
    chatHistory = active?.history ? [...active.history] : [];
    if (!chatHistory.length) {
      addMessage('bot', i18n.greeting);
      return;
    }
    for (const msg of chatHistory) {
      addMessage(msg.role === 'assistant' ? 'bot' : 'user', msg.content);
    }
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
      return {
        fr: typeof parsed.fr === 'string' ? parsed.fr : '',
        en: typeof parsed.en === 'string' ? parsed.en : ''
      };
    } catch (error) {
      return { fr: '', en: '' };
    }
  }

  function setStoredVoicePreference(lang, voiceURI) {
    const current = getStoredVoicePreferences();
    current[lang] = typeof voiceURI === 'string' ? voiceURI : '';
    try {
      localStorage.setItem(voicePreferenceStorageKey, JSON.stringify(current));
    } catch (error) {
      // Ignore storage failures.
    }
  }

  function getStoredVoicePreference(lang) {
    const prefs = getStoredVoicePreferences();
    return prefs[lang] || '';
  }

  function chooseBestTtsVoice(lang) {
    const candidates = availableTtsVoices.filter((voice) => {
      const voiceLang = normalizeLanguage(voice.lang);
      return lang === 'en' ? voiceLang === 'en' : voiceLang === 'fr';
    });
    if (!candidates.length) return null;

    const preferredNames = preferredVoiceNames[lang] || [];
    let bestVoice = candidates[0];
    let bestScore = -Infinity;

    for (const voice of candidates) {
      const name = (voice.name || '').toLowerCase();
      let score = 0;

      const preferredIndex = preferredNames.findIndex((needle) => name.includes(needle.toLowerCase()));
      if (preferredIndex >= 0) {
        score += 150 - preferredIndex * 12;
      }

      if (/enhanced|premium|neural|natural/.test(name)) score += 40;
      if (/compact/.test(name)) score -= 25;
      if (voice.default) score += 8;

      if (score > bestScore) {
        bestScore = score;
        bestVoice = voice;
      }
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
      voiceSelect.value = preferredVoiceURI;
      return;
    }
    voiceSelect.value = '';
    if (selectedVoice && selectedVoice.voiceURI !== (bestVoice?.voiceURI || '')) {
      voiceSelect.value = selectedVoice.voiceURI;
    }
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

  if (sessionSelect) {
    sessionSelect.addEventListener('change', () => {
      switchSession(sessionSelect.value);
    });
  }

  if (sessionNewButton) {
    sessionNewButton.addEventListener('click', () => {
      createNewSession();
    });
  }

  if (sessionDeleteButton) {
    sessionDeleteButton.addEventListener('click', () => {
      deleteActiveSession();
    });
  }

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

  if (attachToggle) {
    attachToggle.addEventListener('click', () => {
      toggleAttachMenu();
    });
  }

  if (attachFileButton && fileInput) {
    attachFileButton.addEventListener('click', () => {
      closeAttachMenu();
      fileInput.click();
    });

    fileInput.addEventListener('change', async () => {
      const files = Array.from(fileInput.files || []);
      if (!files.length) return;
      const hasImages = files.some((file) => isImageFile(file));
      const hasPdf = files.some((file) => isPdfFile(file));
      let ocrLoadingBubble = null;
      if (hasImages) {
        ocrLoadingBubble = addMessage('bot', i18n.ocrLoading);
      }
      let pdfLoadingBubble = null;
      if (hasPdf) {
        pdfLoadingBubble = addMessage('bot', i18n.pdfLoading);
      }
      const result = await buildLocalFileContext(files);
      const vision = await buildVisionAttachments(files);
      if (ocrLoadingBubble) {
        ocrLoadingBubble.remove();
      }
      if (pdfLoadingBubble) {
        pdfLoadingBubble.remove();
      }
      pendingFileContext = result.context;
      pendingFileNames = result.readableNames;
      pendingVisionAttachments = vision.attachments;

      if (result.readableNames.length) {
        addMessage('bot', `${i18n.fileReady} ${result.readableNames.join(', ')}`);
      }
      if (vision.readyNames.length) {
        addMessage('bot', `${i18n.imageReady} ${vision.readyNames.join(', ')}`);
      }
      if (vision.failedNames.length) {
        addMessage('bot', `${i18n.imageReadFailed} ${vision.failedNames.join(', ')}`);
      }
      if (result.unsupportedNames.length) {
        addMessage('bot', `${i18n.fileUnsupported} ${result.unsupportedNames.join(', ')}`);
      }
      if (result.failedNames.length) {
        const failedLabel = hasPdf ? i18n.pdfReadFailed : (hasImages ? i18n.ocrUnavailable : i18n.fileReadFailed);
        addMessage('bot', `${failedLabel} ${result.failedNames.join(', ')}`);
      }
      if (result.noTextNames?.length) {
        const noTextLabel = hasPdf ? i18n.pdfNoText : i18n.ocrNoText;
        addMessage('bot', `${noTextLabel} ${result.noTextNames.join(', ')}`);
      }

      input.focus();
    });
  }

  if (attachDriveButton) {
    attachDriveButton.addEventListener('click', () => {
      closeAttachMenu();
      window.open('https://drive.google.com/drive/my-drive', '_blank', 'noopener,noreferrer');
    });
  }

  document.addEventListener('click', (event) => {
    if (!attachRoot || !attachMenu?.classList.contains('is-open')) return;
    if (!attachRoot.contains(event.target)) {
      closeAttachMenu();
    }
  });

  // Échappe les caractères HTML pour éviter l'injection dans le rendu des messages.
  function escapeHtml(value) {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function formatBotMessageHtml(rawText) {
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

      output = output.replace(/__AI_LINK_(\d+)__/g, (_, idx) => preservedAnchors[Number(idx)] || '');
      return output;
    }

    const safe = escapeHtml(String(rawText || ''))
      .replace(/\r/g, '')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/(\p{Extended_Pictographic}(?:\uFE0F|\uFE0E)?(?:\u200D\p{Extended_Pictographic}(?:\uFE0F|\uFE0E)?)*)/gu, '<span class="ai-assistant-emoji">$1</span>');

    // Si le modèle enchaîne des puces sur une même ligne, on les sépare.
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
        html += `<li>${linkifyLine(line.slice(2).trim())}</li>`;
        continue;
      }

      if (inList) {
        html += '</ul>';
        inList = false;
      }
      html += `<p>${linkifyLine(line)}</p>`;
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
      enhanceBotBubble(bubble);
    } else {
      const p = document.createElement('p');
      p.textContent = text;
      bubble.appendChild(p);
    }

    messagesContainer.appendChild(bubble);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
    return bubble;
  }

  function copyTextToClipboard(text) {
    const safeText = String(text || '').trim();
    if (!safeText) return Promise.resolve(false);
    if (navigator.clipboard?.writeText) {
      return navigator.clipboard.writeText(safeText).then(() => true).catch(() => false);
    }
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
    } catch (error) {
      return Promise.resolve(false);
    }
  }

  function refreshBubbleActionLabels() {
    const copyButtons = messagesContainer.querySelectorAll('.ai-assistant-copy-btn');
    copyButtons.forEach((button) => {
      const isCopied = button.dataset.state === 'copied';
      const label = isCopied ? i18n.copied : i18n.copy;
      button.title = label;
      button.setAttribute('aria-label', label);
    });
  }

  function enhanceBotBubble(bubble) {
    if (!bubble || bubble.querySelector('.ai-assistant-message-actions')) return;

    const content = document.createElement('div');
    content.className = 'ai-assistant-message-content';
    while (bubble.firstChild) {
      content.appendChild(bubble.firstChild);
    }
    bubble.appendChild(content);

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
      .replace(/\*\*(.+?)\*\*/g, '$1')
      .replace(/\*(.+?)\*/g, '$1')
      .replace(/__(.+?)__/g, '$1')
      .replace(/_(.+?)_/g, '$1')
      .replace(/`(.+?)`/g, '$1')
      .replace(/\[(.*?)\]\((.*?)\)/g, '$1')
      .replace(/!\[(.*?)\]\((.*?)\)/g, '$1')
      .replace(/#{1,6}\s*/g, '')
      .replace(/^>\s?/gm, '')
      .replace(/[*_~`|]/g, ' ')
      .replace(/[→←↑↓↔↕↗↘↙↖➜➤➝➞➟➠➡]/g, ' ')
      .replace(/[\u2190-\u21ff\u2300-\u23ff\u2460-\u24ff\u25a0-\u27bf\u2900-\u297f]/g, ' ')
      .replace(/[●•◦▪▫]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function cleanAssistantReplyText(rawText) {
    return String(rawText || '')
      .replace(/^\s{0,3}#{1,6}\s+/gm, '')
      .replace(/\s#{3,}\s+/g, ' ')
      .replace(/[●•◦▪▫]/g, '')
      .replace(/[ \t]{2,}/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  function formatAssistantApiError(apiError) {
    const normalized = String(apiError || '').toLowerCase();
    if (!normalized) return i18n.fallbackConnectionError;
    if (normalized.includes('openrouter')) return i18n.friendlyApiError;
    return i18n.friendlyApiError;
  }

  // Lit la réponse de l'assistant via la synthèse vocale si activée.
  function speakText(text) {
    if (!isVoiceOutputEnabled || !window.speechSynthesis || !text) return;

    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(sanitizeTextForSpeech(text));
    const activeLang = currentLanguage === 'en' ? 'en' : 'fr';
    utterance.lang = activeLang === 'en' ? 'en-US' : 'fr-FR';
    utterance.voice = selectedTtsVoices[activeLang] || null;
    utterance.rate = activeLang === 'en' ? 0.95 : 0.92;
    utterance.pitch = activeLang === 'en' ? 1.02 : 0.98;
    window.speechSynthesis.speak(utterance);
  }

  // Envoie le message utilisateur au backend, affiche la réponse et met à jour l'historique.
  async function askAI(userText, fileContext = '', attachments = []) {
    const loading = addMessage('bot', i18n.loading);
    try {
      const composedMessage = fileContext
        ? `${userText}\n\n---\nContexte de fichiers locaux (ne pas ignorer):\n${fileContext}`
        : userText;

      const response = await fetch(API_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: composedMessage,
          history: chatHistory.slice(-4),
          language: currentLanguage === 'en' ? 'en' : 'fr',
          mode: 'chat',
          attachments
        })
      });

      const data = await response.json();
      loading.remove();

      if (data.ok) {
        const cleanedReply = cleanAssistantReplyText(data.reply);
        addMessage('bot', cleanedReply);
        speakText(cleanedReply);
        chatHistory.push({ role: 'assistant', content: cleanedReply });
        persistActiveConversation();
      } else {
        const msg = formatAssistantApiError(data.error);
        addMessage('bot', msg);
        chatHistory.push({ role: 'assistant', content: msg });
        persistActiveConversation();
      }
    } catch (e) {
      if(loading) loading.remove();
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

  if (ttsButton) {
    // Active/désactive la lecture vocale.
    ttsButton.addEventListener('click', () => {
      isVoiceOutputEnabled = !isVoiceOutputEnabled;
      setTtsState(isVoiceOutputEnabled);
      if (!isVoiceOutputEnabled && window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
    });
    setTtsState(isVoiceOutputEnabled);
  }

  if (micButton) {
    if (!speechRecognition) {
      // Navigateur incompatible avec la reconnaissance vocale.
      micButton.disabled = true;
      micButton.title = i18n.speechUnsupported;
      micButton.setAttribute('aria-label', i18n.speechUnsupported);
    } else {
      // Démarre/arrête l'écoute micro.
      micButton.addEventListener('click', () => {
        if (isListening) {
          speechRecognition.stop();
          return;
        }
        speechRecognition.start();
      });

      speechRecognition.onstart = () => {
        isListening = true;
        setMicState(true);
      };

      speechRecognition.onend = () => {
        isListening = false;
        setMicState(false);
      };

      speechRecognition.onerror = () => {
        isListening = false;
        setMicState(false);
      };

      speechRecognition.onresult = (event) => {
        // Place automatiquement le texte dicté dans le champ de saisie.
        const transcript = event.results?.[0]?.[0]?.transcript?.trim();
        if (!transcript) return;
        input.value = transcript;
        input.focus();
      };
    }
  }

  // Ouvre/ferme le panneau de chat.
  if (launcherButton && panel) {
    launcherButton.addEventListener('click', () => {
      panel.classList.toggle('is-open');
    });
  }

  if (closeButton && panel) {
    closeButton.addEventListener('click', () => {
      panel.classList.remove('is-open');
    });
  }

  document.addEventListener('translationCompleted', (event) => {
    applyAssistantLanguage(event.detail?.language);
  });

  applyAssistantLanguage(currentLanguage);
  setupPanelDrag();
  loadPanelSize();
  loadPanelPosition();
  ensureSessionState();
  renderSessionOptions();
  renderCurrentConversation();
});
