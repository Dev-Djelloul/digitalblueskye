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
        historyToggle: 'Conversation history',
        searchConversations: 'Search',
        newChat: 'New conversation',
        library: 'Library',
        libraryLocal: 'Local library',
        libraryImporting: 'Indexing document library...',
        libraryReady: 'Document(s) indexed in the local library:',
        libraryEmpty: '',
        libraryClear: 'Clear',
        libraryClearTitle: 'Clear local library',
        libraryImportFailed: 'Unable to index document:',
        libraryContextUsed: 'Local library context used',
        libraryMediaTitle: 'Media contents',
        libraryImportAction: 'Import media',
        libraryEmptyView: 'Choose a local file to add it to the library.',
        libraryImportSuccessView: 'Content imported into the library.',
        libraryImportErrorView: 'Import failed. Try another file or check the console diagnostics.',
        libraryLayoutGrid: 'Grid',
        libraryLayoutList: 'List',
        libraryStoredLocally: 'Stored locally',
        libraryShowInChat: 'Show in chat',
        libraryShownInChat: 'Displayed from the library',
        libraryShare: 'Share',
        libraryDownload: 'Download',
        libraryCopy: 'Copy',
        libraryCopied: 'Copied.',
        libraryCopyFailed: 'Unable to copy this media.',
        libraryDelete: 'Remove from library',
        libraryDeleted: 'Content removed from the library.',
        libraryPreviewClose: 'Close preview',
        discussions: 'Discussions',
        noMatchingDiscussions: 'No conversation found.',
        resizeSidebar: 'Resize sidebar',
        renameDiscussion: 'Rename conversation',
        renameDiscussionPrompt: 'Conversation name',
        exportDiscussion: 'Export conversation',
        deleteDiscussion: 'Delete conversation',
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
        stop: 'Stop',
        stopRequest: 'Stop current request',
        requestStopped: 'Request stopped.',
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
      historyToggle: 'Historique des conversations',
      searchConversations: 'Rechercher',
      newChat: 'Nouvelle discussion',
      library: 'Bibliothèque',
      libraryLocal: 'Bibliothèque locale',
      libraryImporting: 'Indexation de la bibliothèque documentaire...',
      libraryReady: 'Document(s) indexé(s) dans la bibliothèque locale :',
      libraryEmpty: '',
      libraryClear: 'Vider',
      libraryClearTitle: 'Vider la bibliothèque locale',
      libraryImportFailed: "Impossible d'indexer le document :",
      libraryContextUsed: 'Contexte bibliothèque locale utilisé',
      libraryMediaTitle: 'Contenus multimédias',
      libraryImportAction: 'Importer des contenus',
      libraryEmptyView: 'Choisissez un fichier local pour l’ajouter à la bibliothèque.',
      libraryImportSuccessView: 'Contenu importé dans la bibliothèque.',
      libraryImportErrorView: "L'import a échoué. Essayez un autre fichier ou consultez les diagnostics console.",
      libraryLayoutGrid: 'Grille',
      libraryLayoutList: 'Liste',
      libraryStoredLocally: 'Stocké localement',
      libraryShowInChat: 'Afficher dans le chat',
      libraryShownInChat: 'Affiché depuis la bibliothèque',
      libraryShare: 'Partager',
      libraryDownload: 'Télécharger',
      libraryCopy: 'Copier',
      libraryCopied: 'Copié.',
      libraryCopyFailed: 'Impossible de copier ce média.',
      libraryDelete: 'Supprimer de la bibliothèque',
      libraryDeleted: 'Contenu supprimé de la bibliothèque.',
      libraryPreviewClose: "Fermer l'aperçu",
      discussions: 'Discussions',
      noMatchingDiscussions: 'Aucune discussion trouvée.',
      resizeSidebar: 'Redimensionner le volet',
      renameDiscussion: 'Renommer la discussion',
      renameDiscussionPrompt: 'Nom de la discussion',
      exportDiscussion: 'Exporter la discussion',
      deleteDiscussion: 'Supprimer la discussion',
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
      stop: 'Stop',
      stopRequest: 'Stopper la demande en cours',
      requestStopped: 'Demande stoppée.',
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
  const sidebarIconUrl = resolveUiIconUrl('icons8-sidebar-50.png');
  const createNewIconUrl = resolveUiIconUrl('icons8-create-new-64.png');
  const newFolderIconUrl = resolveUiIconUrl('icons8-new-folder-64.png');
  const libraryIconUrl = resolveUiIconUrl('icons8-library-64.png');

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
      <div id="ai-assistant-history-panel" class="ai-assistant-session-bar" aria-label="${i18n.historyLabel}">
        <div class="ai-assistant-sidebar-nav">
          <label class="ai-assistant-session-search-wrap" for="ai-assistant-session-search">
            <span class="ai-assistant-session-search-icon" aria-hidden="true"></span>
            <input id="ai-assistant-session-search" class="ai-assistant-session-search" type="search" autocomplete="off" placeholder="${i18n.searchConversations}" aria-label="${i18n.searchConversations}">
          </label>
          <button id="ai-assistant-session-new" class="ai-assistant-session-new ai-assistant-sidebar-action" type="button" title="${i18n.newChat}" aria-label="${i18n.newChat}">
            <img src="${createNewIconUrl}" alt="" aria-hidden="true">
            <span>${i18n.newChat}</span>
          </button>
        </div>
        <div id="ai-assistant-projects-section" class="ai-assistant-sidebar-section ai-assistant-projects-block">
          <div class="ai-assistant-section-header ai-assistant-projects-head">
            <button id="ai-assistant-projects-toggle" class="ai-assistant-section-toggle" type="button" aria-expanded="true" aria-controls="ai-assistant-project-list">
              <span class="ai-assistant-section-chevron" aria-hidden="true">›</span>
              <span class="ai-assistant-section-title">Projets</span>
              <span id="ai-assistant-project-count" class="ai-assistant-section-count">(0)</span>
            </button>
            <button id="ai-assistant-project-create" type="button" title="Creer un projet" aria-label="Creer un projet">+</button>
          </div>
          <div id="ai-assistant-project-list" class="ai-assistant-project-list" role="list"></div>
        </div>
        <button id="ai-assistant-session-library" class="ai-assistant-session-library ai-assistant-sidebar-action" type="button" title="${i18n.library}" aria-label="${i18n.library}">
          <img src="${libraryIconUrl}" alt="" aria-hidden="true">
          <span>${i18n.library}</span>
        </button>
        <div id="ai-assistant-recent-section" class="ai-assistant-sidebar-section ai-assistant-recent-block">
          <div class="ai-assistant-section-header ai-assistant-session-heading">
            <button id="ai-assistant-recent-toggle" class="ai-assistant-section-toggle" type="button" aria-expanded="true" aria-controls="ai-assistant-session-list">
              <span class="ai-assistant-section-chevron" aria-hidden="true">›</span>
              <span class="ai-assistant-session-label ai-assistant-section-title">Discussions recentes</span>
              <span id="ai-assistant-recent-count" class="ai-assistant-section-count">(0)</span>
            </button>
          </div>
        </div>
        <select id="ai-assistant-session-select" class="ai-assistant-session-select" aria-label="${i18n.historyLabel}" hidden></select>
        <div id="ai-assistant-session-list" class="ai-assistant-session-list" role="listbox" aria-label="${i18n.historyLabel}"></div>
        <button id="ai-assistant-settings-open" class="ai-assistant-settings-open ai-assistant-sidebar-action" type="button" title="Parametres" aria-label="Parametres">
          <span aria-hidden="true">*</span>
          <span>Parametres</span>
        </button>
        <div class="ai-assistant-session-tools">
          <button id="ai-assistant-session-export" class="ai-assistant-session-export" type="button" title="${i18n.exportChat}" aria-label="${i18n.exportChat}">
            <img src="${filesIconUrl}" alt="" aria-hidden="true">
          </button>
          <button id="ai-assistant-session-delete" class="ai-assistant-session-delete" type="button" title="${i18n.deleteChat}" aria-label="${i18n.deleteChat}">
            <img src="${deleteIconUrl}" alt="" aria-hidden="true">
          </button>
        </div>
        <span id="ai-assistant-sidebar-resize" class="ai-assistant-sidebar-resize" role="separator" aria-orientation="vertical" tabindex="0" title="${i18n.resizeSidebar}" aria-label="${i18n.resizeSidebar}"></span>
        <div id="ai-assistant-session-menu" class="ai-assistant-session-context-menu" role="menu" aria-hidden="true">
          <button id="ai-assistant-session-menu-rename" type="button" role="menuitem">
            <img src="${createNewIconUrl}" alt="" aria-hidden="true">
            <span>${i18n.renameDiscussion}</span>
          </button>
          <button id="ai-assistant-session-menu-export" type="button" role="menuitem">
            <img src="${filesIconUrl}" alt="" aria-hidden="true">
            <span>${i18n.exportDiscussion}</span>
          </button>
          <button id="ai-assistant-session-menu-delete" type="button" role="menuitem">
            <img src="${deleteIconUrl}" alt="" aria-hidden="true">
            <span>${i18n.deleteDiscussion}</span>
          </button>
        </div>
        <div id="ai-assistant-project-menu" class="ai-assistant-project-context-menu" role="menu" aria-hidden="true">
          <button type="button" role="menuitem" data-project-action="open">Ouvrir le projet</button>
          <button type="button" role="menuitem" data-project-action="rename">Renommer</button>
          <button type="button" role="menuitem" data-project-action="duplicate">Dupliquer</button>
          <div class="ai-assistant-project-export-menu" role="none">
            <button type="button" role="menuitem" class="ai-assistant-project-export-trigger" data-project-action="export-menu" aria-haspopup="true">
              <span>Exporter le projet</span>
              <span class="ai-assistant-project-menu-chevron" aria-hidden="true">›</span>
            </button>
            <div class="ai-assistant-project-export-submenu" role="menu" aria-label="Exporter le projet">
              <button type="button" role="menuitem" data-project-export="json">JSON technique</button>
              <button type="button" role="menuitem" data-project-export="html">Rapport HTML</button>
              <button type="button" role="menuitem" data-project-export="pdf">PDF imprimable</button>
              <button type="button" role="menuitem" data-project-export="zip">ZIP complet</button>
            </div>
          </div>
          <button type="button" role="menuitem" data-project-action="share">Partager le projet</button>
          <button type="button" role="menuitem" data-project-action="appearance">Changer la couleur ou l'icone</button>
          <button type="button" role="menuitem" data-project-action="delete" class="ai-assistant-project-menu-delete">Supprimer</button>
        </div>
      </div>`;
  }

  function createLibraryViewMarkup() {
    return `
      <section id="ai-assistant-library-view" class="ai-assistant-library-view" aria-label="${i18n.library}" hidden>
        <div class="ai-assistant-library-view-inner">
          <div class="ai-assistant-library-view-head">
            <h3 id="ai-assistant-library-view-title">${i18n.libraryMediaTitle}</h3>
            <div class="ai-assistant-library-view-tools">
              <span id="ai-assistant-library-count" class="ai-assistant-library-count">${i18n.libraryEmpty}</span>
              <div class="ai-assistant-library-layout-toggle" role="group" aria-label="${i18n.library}">
                <button id="ai-assistant-library-layout-grid" class="is-active" type="button">${i18n.libraryLayoutGrid}</button>
                <button id="ai-assistant-library-layout-list" type="button">${i18n.libraryLayoutList}</button>
              </div>
              <button id="ai-assistant-library-import" class="ai-assistant-library-import" type="button">
                <img src="${newFolderIconUrl}" alt="" aria-hidden="true">
                <span>${i18n.libraryImportAction}</span>
              </button>
              <button id="ai-assistant-library-clear" class="ai-assistant-library-clear" type="button" title="${i18n.libraryClearTitle}" aria-label="${i18n.libraryClearTitle}" hidden>${i18n.libraryClear}</button>
            </div>
          </div>
          <div id="ai-assistant-library-grid" class="ai-assistant-library-grid"></div>
          <p id="ai-assistant-library-empty" class="ai-assistant-library-empty">${i18n.libraryEmptyView}</p>
        </div>
        <div id="ai-assistant-library-card-menu" class="ai-assistant-library-card-menu" role="menu" aria-hidden="true">
          <button id="ai-assistant-library-menu-share" type="button" role="menuitem">
            <span aria-hidden="true">↥</span>
            <span>${i18n.libraryShare}</span>
          </button>
          <button id="ai-assistant-library-menu-chat" type="button" role="menuitem">
            <span aria-hidden="true">▱</span>
            <span>${i18n.libraryShowInChat}</span>
          </button>
          <button id="ai-assistant-library-menu-delete" type="button" role="menuitem" class="ai-assistant-library-menu-delete">
            <span aria-hidden="true">×</span>
            <span>${i18n.libraryDelete}</span>
          </button>
        </div>
      </section>`;
  }

  function createProjectViewMarkup() {
    return `
      <section id="ai-assistant-project-view" class="ai-assistant-project-view" aria-label="Projet" hidden>
        <div class="ai-assistant-project-view-inner">
          <div class="ai-assistant-project-hero">
            <span id="ai-assistant-project-icon" class="ai-assistant-project-icon" aria-hidden="true">*</span>
            <div>
              <h3 id="ai-assistant-project-title">Projet</h3>
              <p id="ai-assistant-project-description"></p>
            </div>
          </div>
          <div id="ai-assistant-project-stats" class="ai-assistant-project-stats"></div>
          <div id="ai-assistant-project-tabs" class="ai-assistant-project-tabs" role="tablist" aria-label="Sections projet">
            <button type="button" data-project-tab="conversations">Conversations</button>
            <button type="button" data-project-tab="documents">Documents</button>
            <button type="button" data-project-tab="memory">Memoire</button>
            <button type="button" data-project-tab="rag">RAG</button>
            <button type="button" data-project-tab="stats">Statistiques</button>
            <button type="button" data-project-tab="settings">Parametres</button>
          </div>
          <div id="ai-assistant-project-content" class="ai-assistant-project-content"></div>
        </div>
      </section>`;
  }

  function createSettingsViewMarkup() {
    return `
      <section id="ai-assistant-settings-view" class="ai-assistant-settings-view" aria-label="Parametres Digital Blue Skye AI" hidden>
        <div class="ai-assistant-settings-view-inner">
          <div class="ai-assistant-settings-head">
            <h3>Parametres</h3>
            <p>Profil, IA, recherche web, documents, apparence et donnees.</p>
          </div>
          <div id="ai-assistant-settings-sections" class="ai-assistant-settings-sections"></div>
        </div>
      </section>`;
  }

  function createProjectDeleteDialogMarkup() {
    return `
      <div id="ai-assistant-project-delete-dialog" class="ai-assistant-project-delete-dialog" aria-hidden="true" hidden>
        <div class="ai-assistant-project-delete-panel" role="dialog" aria-modal="true" aria-labelledby="ai-assistant-project-delete-title">
          <h3 id="ai-assistant-project-delete-title">Supprimer definitivement ce projet ?</h3>
          <p id="ai-assistant-project-delete-summary"></p>
          <p class="ai-assistant-project-delete-note">Les documents physiques restent dans la bibliotheque globale.</p>
          <div class="ai-assistant-project-delete-actions">
            <button id="ai-assistant-project-delete-cancel" type="button">Annuler</button>
            <button id="ai-assistant-project-delete-confirm" type="button">Supprimer</button>
          </div>
        </div>
      </div>`;
  }

  function createMediaPreviewMarkup() {
    return `
      <div id="ai-assistant-media-preview" class="ai-assistant-media-preview" aria-hidden="true" hidden>
        <div class="ai-assistant-media-preview-panel" role="dialog" aria-modal="true" aria-label="${i18n.libraryMediaTitle}">
          <div class="ai-assistant-media-preview-toolbar">
            <span id="ai-assistant-media-preview-title" class="ai-assistant-media-preview-title"></span>
            <button id="ai-assistant-media-preview-copy" type="button">${i18n.libraryCopy}</button>
            <button id="ai-assistant-media-preview-share" type="button">${i18n.libraryShare}</button>
            <button id="ai-assistant-media-preview-download" type="button">${i18n.libraryDownload}</button>
            <button id="ai-assistant-media-preview-close" type="button" aria-label="${i18n.libraryPreviewClose}">×</button>
          </div>
          <div id="ai-assistant-media-preview-body" class="ai-assistant-media-preview-body"></div>
        </div>
      </div>`;
  }

  function createHistoryToggleMarkup() {
    return `
      <button id="ai-assistant-history-toggle" class="ai-assistant-history-toggle" type="button" title="${i18n.historyToggle}" aria-label="${i18n.historyToggle}" aria-expanded="true" aria-controls="ai-assistant-history-panel">
        <img src="${sidebarIconUrl}" alt="" aria-hidden="true">
      </button>`;
  }

  function createStopButtonMarkup() {
    return `<button id="ai-assistant-stop" class="ai-assistant-stop-btn" type="button" title="${i18n.stopRequest}" aria-label="${i18n.stopRequest}" hidden><span aria-hidden="true"></span>${i18n.stop}</button>`;
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
            ${createHistoryToggleMarkup()}
            <img class="ai-assistant-header-logo" src="/assets/images/logo/AI.png" alt="" width="42" height="46" loading="lazy" aria-hidden="true">
            <button id="ai-assistant-expand" class="ai-assistant-expand" type="button" title="${i18n.maximizeTitle}" aria-label="${i18n.maximizeTitle}" aria-pressed="false"><span aria-hidden="true"></span></button>
            <button id="ai-assistant-close" class="ai-assistant-close" type="button">&times;</button>
          </header>
          ${createSessionControlsMarkup()}
          <div id="ai-assistant-messages" class="ai-assistant-messages"></div>
          ${createLibraryViewMarkup()}
          ${createProjectViewMarkup()}
          ${createSettingsViewMarkup()}
          ${createProjectDeleteDialogMarkup()}
          <button id="ai-assistant-scroll-bottom" class="ai-assistant-scroll-bottom" type="button" title="${i18n.scrollBottom}" aria-label="${i18n.scrollBottom}" aria-hidden="true">
            <span aria-hidden="true"></span>
          </button>
          <div id="ai-assistant-quick-actions" class="ai-assistant-quick-actions"></div>
          <form id="ai-assistant-form" class="ai-assistant-form">
            ${createAttachControlsMarkup()}
            <textarea id="ai-assistant-input" autocomplete="off" placeholder="${i18n.inputPlaceholder}" rows="1"></textarea>
            ${createVoiceControlsMarkup(micIconUrl, voiceIconUrl)}
            ${createStopButtonMarkup()}
            <button type="submit" class="ai-assistant-send-btn">${i18n.send}</button>
          </form>
          <span class="ai-assistant-resize-handle ai-assistant-resize-handle--nw" data-resize-corner="nw" aria-hidden="true"></span>
          <span class="ai-assistant-resize-handle ai-assistant-resize-handle--ne" data-resize-corner="ne" aria-hidden="true"></span>
          <span class="ai-assistant-resize-handle ai-assistant-resize-handle--sw" data-resize-corner="sw" aria-hidden="true"></span>
          <span class="ai-assistant-resize-handle ai-assistant-resize-handle--se" data-resize-corner="se" aria-hidden="true"></span>
          ${createMediaPreviewMarkup()}
        </aside>`;
      document.body.insertAdjacentHTML('beforeend', markup);
      return;
    }

    const form = document.getElementById('ai-assistant-form');
    const closeBtn = document.getElementById('ai-assistant-close');
    const header = document.querySelector('#ai-assistant-panel .ai-assistant-header');
    if (closeBtn) closeBtn.classList.add('ai-assistant-close');
    if (!form) return;

    if (header) {
      const oldTitleWrap = header.querySelector('.ai-assistant-title-wrap');
      if (oldTitleWrap) oldTitleWrap.remove();
      const oldHeaderIcon = header.querySelector('.ai-assistant-header-icon');
      if (oldHeaderIcon) oldHeaderIcon.className = 'ai-assistant-header-logo';
      if (!header.querySelector('.ai-assistant-header-logo')) {
        const logo = document.createElement('img');
        logo.className = 'ai-assistant-header-logo';
        logo.src = '/assets/images/logo/AI.png';
        logo.alt = '';
        logo.width = 42;
        logo.height = 46;
        logo.loading = 'lazy';
        logo.setAttribute('aria-hidden', 'true');
        header.appendChild(logo);
      }
    }

    if (!document.getElementById('ai-assistant-session-select')) {
      const wrapper = document.createElement('div');
      wrapper.innerHTML = createSessionControlsMarkup().trim();
      if (header && header.parentNode) {
        header.insertAdjacentElement('afterend', wrapper.firstElementChild);
      }
    }
    const sessionBar = document.querySelector('#ai-assistant-panel .ai-assistant-session-bar');
    if (sessionBar) {
      if (!sessionBar.id) sessionBar.id = 'ai-assistant-history-panel';
      sessionBar.setAttribute('aria-label', i18n.historyLabel);
      if (!document.getElementById('ai-assistant-session-list')) {
        const wrapper = document.createElement('div');
        wrapper.innerHTML = createSessionControlsMarkup().trim();
        sessionBar.replaceWith(wrapper.firstElementChild);
      }
    }

    if (!document.getElementById('ai-assistant-history-toggle') && header) {
      header.insertAdjacentHTML('beforeend', createHistoryToggleMarkup().trim());
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

    if (!document.getElementById('ai-assistant-library-view')) {
      const messages = document.getElementById('ai-assistant-messages');
      if (messages) messages.insertAdjacentHTML('afterend', createLibraryViewMarkup().trim());
    }

    if (!document.getElementById('ai-assistant-project-view')) {
      const library = document.getElementById('ai-assistant-library-view');
      const messages = document.getElementById('ai-assistant-messages');
      if (library) library.insertAdjacentHTML('afterend', createProjectViewMarkup().trim());
      else if (messages) messages.insertAdjacentHTML('afterend', createProjectViewMarkup().trim());
    }

    if (!document.getElementById('ai-assistant-settings-view')) {
      const projectView = document.getElementById('ai-assistant-project-view');
      const library = document.getElementById('ai-assistant-library-view');
      if (projectView) projectView.insertAdjacentHTML('afterend', createSettingsViewMarkup().trim());
      else if (library) library.insertAdjacentHTML('afterend', createSettingsViewMarkup().trim());
    }

    if (!document.getElementById('ai-assistant-project-delete-dialog')) {
      panel.insertAdjacentHTML('beforeend', createProjectDeleteDialogMarkup().trim());
    }

    if (!document.getElementById('ai-assistant-media-preview')) {
      panel.insertAdjacentHTML('beforeend', createMediaPreviewMarkup().trim());
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

    if (!document.getElementById('ai-assistant-stop')) {
      const submitButton = form.querySelector('.ai-assistant-send-btn') || form.querySelector('button[type="submit"]');
      const wrapper = document.createElement('div');
      wrapper.innerHTML = createStopButtonMarkup().trim();
      const stopButton = wrapper.firstElementChild;
      if (stopButton) {
        if (submitButton) form.insertBefore(stopButton, submitButton);
        else form.appendChild(stopButton);
      }
    }
  }

  ensureAssistantMarkup();

  const API_ENDPOINT = 'https://digitalblueskye-ai.djelloulabid75.workers.dev';
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
  const sessionSearchInput = document.getElementById('ai-assistant-session-search');
  const sessionList = document.getElementById('ai-assistant-session-list');
  const sessionLibraryButton = document.getElementById('ai-assistant-session-library');
  const projectsSection = document.getElementById('ai-assistant-projects-section');
  const projectsToggleButton = document.getElementById('ai-assistant-projects-toggle');
  const projectCount = document.getElementById('ai-assistant-project-count');
  const projectCreateButton = document.getElementById('ai-assistant-project-create');
  const projectList = document.getElementById('ai-assistant-project-list');
  const recentSection = document.getElementById('ai-assistant-recent-section');
  const recentToggleButton = document.getElementById('ai-assistant-recent-toggle');
  const recentCount = document.getElementById('ai-assistant-recent-count');
  const settingsOpenButton = document.getElementById('ai-assistant-settings-open');
  const libraryPanel = document.getElementById('ai-assistant-library-panel');
  const libraryCount = document.getElementById('ai-assistant-library-count');
  const libraryList = document.getElementById('ai-assistant-library-list');
  const libraryClearButton = document.getElementById('ai-assistant-library-clear');
  const libraryView = document.getElementById('ai-assistant-library-view');
  const libraryViewTitle = document.getElementById('ai-assistant-library-view-title');
  const libraryImportButton = document.getElementById('ai-assistant-library-import');
  const libraryGrid = document.getElementById('ai-assistant-library-grid');
  const libraryEmpty = document.getElementById('ai-assistant-library-empty');
  const libraryLayoutGridButton = document.getElementById('ai-assistant-library-layout-grid');
  const libraryLayoutListButton = document.getElementById('ai-assistant-library-layout-list');
  const libraryCardMenu = document.getElementById('ai-assistant-library-card-menu');
  const libraryMenuShareButton = document.getElementById('ai-assistant-library-menu-share');
  const libraryMenuChatButton = document.getElementById('ai-assistant-library-menu-chat');
  const libraryMenuDeleteButton = document.getElementById('ai-assistant-library-menu-delete');
  const mediaPreview = document.getElementById('ai-assistant-media-preview');
  const mediaPreviewTitle = document.getElementById('ai-assistant-media-preview-title');
  const mediaPreviewBody = document.getElementById('ai-assistant-media-preview-body');
  const mediaPreviewCopyButton = document.getElementById('ai-assistant-media-preview-copy');
  const mediaPreviewShareButton = document.getElementById('ai-assistant-media-preview-share');
  const mediaPreviewDownloadButton = document.getElementById('ai-assistant-media-preview-download');
  const mediaPreviewCloseButton = document.getElementById('ai-assistant-media-preview-close');
  const projectView = document.getElementById('ai-assistant-project-view');
  const projectIcon = document.getElementById('ai-assistant-project-icon');
  const projectTitle = document.getElementById('ai-assistant-project-title');
  const projectDescription = document.getElementById('ai-assistant-project-description');
  const projectStats = document.getElementById('ai-assistant-project-stats');
  const projectTabs = document.getElementById('ai-assistant-project-tabs');
  const projectContent = document.getElementById('ai-assistant-project-content');
  const settingsView = document.getElementById('ai-assistant-settings-view');
  const settingsSections = document.getElementById('ai-assistant-settings-sections');
  const projectDeleteDialog = document.getElementById('ai-assistant-project-delete-dialog');
  const projectDeleteSummary = document.getElementById('ai-assistant-project-delete-summary');
  const projectDeleteCancelButton = document.getElementById('ai-assistant-project-delete-cancel');
  const projectDeleteConfirmButton = document.getElementById('ai-assistant-project-delete-confirm');
  const sidebarResizeHandle = document.getElementById('ai-assistant-sidebar-resize');
  const sessionContextMenu = document.getElementById('ai-assistant-session-menu');
  const projectContextMenu = document.getElementById('ai-assistant-project-menu');
  const sessionMenuRenameButton = document.getElementById('ai-assistant-session-menu-rename');
  const sessionMenuExportButton = document.getElementById('ai-assistant-session-menu-export');
  const sessionMenuDeleteButton = document.getElementById('ai-assistant-session-menu-delete');
  const historyPanel = document.getElementById('ai-assistant-history-panel');
  const historyToggleButton = document.getElementById('ai-assistant-history-toggle');
  const attachRoot = document.getElementById('ai-assistant-attach');
  const attachToggle = document.getElementById('ai-assistant-attach-toggle');
  const attachMenu = document.getElementById('ai-assistant-attach-menu');
  const attachFileButton = document.getElementById('ai-assistant-attach-file');
  const attachDriveButton = document.getElementById('ai-assistant-attach-drive');
  const voiceSelect = document.getElementById('ai-assistant-voice-select');
  const micButton = document.getElementById('ai-assistant-mic');
  const ttsButton = document.getElementById('ai-assistant-tts');
  const webSearchButton = document.getElementById('ai-assistant-web-search');
  const stopButton = document.getElementById('ai-assistant-stop');
  const assistantSendButton = document.querySelector('#ai-assistant-form .ai-assistant-send-btn');
  let fileInput = document.getElementById('ai-assistant-file-input');
  let chatHistory = [];
  let sessionsState = { activeSessionId: '', sessions: [] };
  let projectsState = { activeProjectId: 'safe', projects: [] };
  let assistantSettingsState = {};
  let activeProjectTab = 'conversations';
  let areProjectsCollapsed = false;
  let areRecentChatsCollapsed = false;
  let pendingFileContext = '';
  let pendingFileNames = [];
  let pendingUploadMetadata = [];
  let pendingLibraryDocumentNames = [];
  let pendingVisionAttachments = [];
  let driveAccessToken = '';
  let pickerReadyPromise = null;
  let identityReadyPromise = null;
  let driveTokenClient = null;
  let isVoiceOutputEnabled = true;
  let isListening = false;
  let activeAssistantRequestController = null;
  let activeContextSessionId = '';
  let activeContextProjectId = '';
  let pendingDeleteProjectId = '';
  let isSidebarResizing = false;
  let isLibraryImportMode = false;
  let isLibraryViewOpen = false;
  let activeLibraryMenuDocId = '';
  let activePreviewDocId = '';
  let activeLibraryStatus = '';
  let knowledgeLibraryDbPromise = null;
  const knowledgeOriginalFileMemoryStore = new Map();
  let libraryLayoutMode = 'grid';
  let sidebarResizeStartX = 0;
  let sidebarResizeStartWidth = 0;
  let knowledgeLibrary = { version: 1, documents: [] };
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
  const historyPanelStorageKey = 'ai_assistant_history_panel_open_v1';
  const historyPanelWidthStorageKey = 'ai_assistant_history_panel_width_v1';
  const knowledgeLibraryStorageKey = 'ai_assistant_knowledge_library_v1';
  const knowledgeLibraryLayoutStorageKey = 'ai_assistant_library_layout_v1';
  const projectsStorageKey = 'ai_assistant_projects_v1';
  const settingsStorageKey = 'ai_assistant_settings_v3';
  const sidebarProjectsCollapsedStorageKey = 'dbs_sidebar_projects_collapsed';
  const sidebarRecentChatsCollapsedStorageKey = 'dbs_sidebar_recent_chats_collapsed';
  const knowledgeLibraryDbName = 'digital_blue_skye_ai_library_v1';
  const knowledgeLibraryFileStoreName = 'original_files';
  const assistantDebugStorageKey = 'ai_assistant_debug';
  const maxStoredSessions = 20;
  const maxStoredMessagesPerSession = 40;
  const maxStoredMessageLength = 8000;
  const maxConversationSummaryLength = 1800;
  const apiHistoryWindow = 16;
  const maxKnowledgeDocuments = 10;
  const maxKnowledgeCharsPerDocument = 250000;
  const maxKnowledgeChunksPerDocument = 140;
  const knowledgeChunkSize = 2200;
  const knowledgeChunkOverlap = 180;
  const maxRetrievedKnowledgeChunks = 8;
  const maxStoredMediaDataUrlLength = 1500000;
  const libraryImagePreviewSize = 720;
  const libraryDocumentPreviewSize = 760;
  const simplifiedPreviewVersion = 2;
  const defaultProjectId = 'safe';
  const defaultProjects = [
    { id: 'safe', name: 'SAFE', description: 'Espace de travail principal.', icon: 'S', color: '#79e6ff' },
    { id: 'digital-blue-skye', name: 'Digital Blue Skye', description: 'Strategie, operations et livrables Digital Blue Skye.', icon: 'D', color: '#8f7cff' },
    { id: 'openclassrooms', name: 'OpenClassrooms', description: 'Cours, projets pedagogiques et ressources de formation.', icon: 'O', color: '#35d69b' },
    { id: 'personnel', name: 'Personnel', description: 'Notes, recherches et idees personnelles.', icon: 'P', color: '#ffb45f' }
  ];

  function isAssistantDebugEnabled() {
    try { return localStorage.getItem(assistantDebugStorageKey) === 'true'; } catch (error) { return false; }
  }

  try {
    const storedLibraryLayout = localStorage.getItem(knowledgeLibraryLayoutStorageKey);
    if (storedLibraryLayout === 'list') libraryLayoutMode = 'list';
  } catch (error) {}

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

  function getDefaultHistoryPanelOpen() {
    try {
      const saved = localStorage.getItem(historyPanelStorageKey);
      if (saved === 'true') return true;
      if (saved === 'false') return false;
    } catch (error) {
      // Ignore storage restrictions and fall back to viewport defaults.
    }
    return window.matchMedia('(min-width: 769px)').matches;
  }

  function setHistoryPanelOpen(open, persist = true) {
    if (!panel || !historyToggleButton) return;
    panel.classList.toggle('has-history-open', open);
    historyToggleButton.classList.toggle('is-active', open);
    historyToggleButton.setAttribute('aria-expanded', String(open));
    historyToggleButton.title = i18n.historyToggle;
    historyToggleButton.setAttribute('aria-label', i18n.historyToggle);
    if (historyPanel) historyPanel.setAttribute('aria-hidden', String(!open));
    if (persist) {
      try { localStorage.setItem(historyPanelStorageKey, String(open)); } catch (error) { /* noop */ }
    }
    window.setTimeout(updateScrollBottomButton, 220);
  }

  function clampHistoryPanelWidth(width) {
    const panelWidth = panel?.getBoundingClientRect().width || window.innerWidth || 940;
    const isNarrow = panelWidth < 760;
    const min = isNarrow ? 228 : 252;
    const max = isNarrow
      ? Math.min(340, Math.max(min, panelWidth * 0.9))
      : Math.min(440, Math.max(min, panelWidth - 420));
    const parsed = Number(width);
    if (!Number.isFinite(parsed)) return Math.min(Math.max(isNarrow ? 292 : 318, min), max);
    return Math.min(Math.max(parsed, min), max);
  }

  function getStoredHistoryPanelWidth() {
    try {
      const saved = Number(localStorage.getItem(historyPanelWidthStorageKey));
      return Number.isFinite(saved) ? saved : null;
    } catch (error) {
      return null;
    }
  }

  function setHistoryPanelWidth(width, persist = true) {
    if (!panel) return;
    const next = clampHistoryPanelWidth(width);
    panel.style.setProperty('--ai-history-width', `${Math.round(next)}px`);
    if (persist) {
      try { localStorage.setItem(historyPanelWidthStorageKey, String(Math.round(next))); } catch (error) { /* noop */ }
    }
    window.setTimeout(updateScrollBottomButton, 0);
  }

  function readBooleanStorage(key, fallback = false) {
    try {
      const saved = localStorage.getItem(key);
      if (saved === 'true') return true;
      if (saved === 'false') return false;
    } catch (error) {
      // Ignore storage restrictions.
    }
    return fallback;
  }

  function persistBooleanStorage(key, value) {
    try { localStorage.setItem(key, String(Boolean(value))); } catch (error) { /* noop */ }
  }

  function applySidebarSectionState() {
    if (projectsSection) projectsSection.classList.toggle('is-collapsed', areProjectsCollapsed);
    if (projectList) projectList.setAttribute('aria-hidden', String(areProjectsCollapsed));
    if (projectsToggleButton) projectsToggleButton.setAttribute('aria-expanded', String(!areProjectsCollapsed));
    if (recentSection) recentSection.classList.toggle('is-collapsed', areRecentChatsCollapsed);
    if (sessionList) sessionList.setAttribute('aria-hidden', String(areRecentChatsCollapsed));
    if (recentToggleButton) recentToggleButton.setAttribute('aria-expanded', String(!areRecentChatsCollapsed));
  }

  function setSidebarSectionCollapsed(section, collapsed, persist = true) {
    if (section === 'projects') {
      areProjectsCollapsed = Boolean(collapsed);
      if (persist) persistBooleanStorage(sidebarProjectsCollapsedStorageKey, areProjectsCollapsed);
    } else if (section === 'recent') {
      areRecentChatsCollapsed = Boolean(collapsed);
      if (persist) persistBooleanStorage(sidebarRecentChatsCollapsedStorageKey, areRecentChatsCollapsed);
    }
    applySidebarSectionState();
  }

  function loadSidebarSectionState() {
    areProjectsCollapsed = readBooleanStorage(sidebarProjectsCollapsedStorageKey, false);
    areRecentChatsCollapsed = readBooleanStorage(sidebarRecentChatsCollapsedStorageKey, false);
    applySidebarSectionState();
  }

  function normalizeProject(project, fallback = {}) {
    const base = { ...fallback, ...(project || {}) };
    const now = Date.now();
    return {
      id: String(base.id || buildProjectId(base.name || 'project')).slice(0, 80),
      name: String(base.name || 'Projet').replace(/\s+/g, ' ').trim().slice(0, 80) || 'Projet',
      description: String(base.description || '').replace(/\s+/g, ' ').trim().slice(0, 220),
      icon: String(base.icon || String(base.name || 'P').charAt(0) || 'P').slice(0, 2).toUpperCase(),
      color: /^#[0-9a-f]{6}$/i.test(String(base.color || '')) ? String(base.color) : '#79e6ff',
      createdAt: Number(base.createdAt) || now,
      updatedAt: Number(base.updatedAt) || Number(base.createdAt) || now,
      memory: String(base.memory || '').slice(0, 2500),
      ragScope: ['project', 'multi_project', 'library'].includes(base.ragScope) ? base.ragScope : 'project',
      ragProjectIds: Array.isArray(base.ragProjectIds) ? base.ragProjectIds.map(String).slice(0, 12) : []
    };
  }

  function buildProjectId(name) {
    const slug = String(name || 'project')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 42) || 'project';
    return `p_${slug}_${Date.now().toString(36).slice(-5)}`;
  }

  function loadProjectsState() {
    let storedProjects = [];
    let activeProjectId = defaultProjectId;
    try {
      const raw = localStorage.getItem(projectsStorageKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        storedProjects = Array.isArray(parsed?.projects) ? parsed.projects : [];
        if (typeof parsed?.activeProjectId === 'string') activeProjectId = parsed.activeProjectId;
      }
    } catch (error) {
      assistantLog('warn', 'projects_load_failed', { reason: error?.message || 'invalid_project_storage' });
    }
    const byId = new Map();
    defaultProjects.forEach((project) => byId.set(project.id, normalizeProject(project)));
    storedProjects.forEach((project) => {
      const normalized = normalizeProject(project);
      byId.set(normalized.id, normalized);
    });
    const projects = Array.from(byId.values());
    if (!projects.some((project) => project.id === activeProjectId)) activeProjectId = defaultProjectId;
    projectsState = { activeProjectId, projects };
  }

  function saveProjectsState() {
    try {
      projectsState = {
        activeProjectId: projectsState.activeProjectId || defaultProjectId,
        projects: (projectsState.projects || []).map((project) => normalizeProject(project))
      };
      localStorage.setItem(projectsStorageKey, JSON.stringify({ version: 1, savedAt: new Date().toISOString(), ...projectsState }));
    } catch (error) {
      assistantLog('warn', 'projects_save_failed', { reason: error?.message || 'local_storage_unavailable' });
    }
  }

  function loadAssistantSettingsState() {
    const defaults = {
      profile: { name: '', email: '', avatar: '', language: currentLanguage, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Paris' },
      ai: { defaultModel: 'auto', preferredProvider: 'OpenRouter', automaticFallback: true },
      web: { tavilyEnabled: true, economyMode: true, expertMode: false, maxResults: 3 },
      documents: { maxSizeMb: 20, chunking: 'auto', automaticIndexing: true, automaticRag: true },
      appearance: { theme: document.documentElement.dataset.theme || 'digital-blue-skye' },
      data: { lastExportAt: '', lastBackupAt: '' }
    };
    try {
      const raw = localStorage.getItem(settingsStorageKey);
      const parsed = raw ? JSON.parse(raw) : {};
      assistantSettingsState = {
        profile: { ...defaults.profile, ...(parsed.profile || {}) },
        ai: { ...defaults.ai, ...(parsed.ai || {}) },
        web: { ...defaults.web, ...(parsed.web || {}) },
        documents: { ...defaults.documents, ...(parsed.documents || {}) },
        appearance: { ...defaults.appearance, ...(parsed.appearance || {}) },
        data: { ...defaults.data, ...(parsed.data || {}) }
      };
    } catch (error) {
      assistantLog('warn', 'settings_load_failed', { reason: error?.message || 'invalid_settings_storage' });
      assistantSettingsState = defaults;
    }
  }

  function saveAssistantSettingsState() {
    try {
      localStorage.setItem(settingsStorageKey, JSON.stringify({ version: 3, savedAt: new Date().toISOString(), ...assistantSettingsState }));
    } catch (error) {
      assistantLog('warn', 'settings_save_failed', { reason: error?.message || 'local_storage_unavailable' });
    }
  }

  function getProjectById(projectId) {
    return (projectsState.projects || []).find((project) => project.id === projectId) || null;
  }

  function getActiveProject() {
    return getProjectById(projectsState.activeProjectId) || getProjectById(defaultProjectId) || projectsState.projects[0] || null;
  }

  function getProjectName(projectId) {
    return getProjectById(projectId)?.name || getProjectById(defaultProjectId)?.name || 'SAFE';
  }

  function getSessionProjectId(session) {
    return getProjectById(session?.projectId)?.id || defaultProjectId;
  }

  function getDocumentProjectId(doc) {
    return getProjectById(doc?.projectId)?.id || defaultProjectId;
  }

  function ensureProjectLinks() {
    let sessionsChanged = false;
    (sessionsState.sessions || []).forEach((session) => {
      if (!getProjectById(session.projectId)) {
        session.projectId = projectsState.activeProjectId || defaultProjectId;
        sessionsChanged = true;
      }
    });
    let libraryChanged = false;
    (knowledgeLibrary.documents || []).forEach((doc) => {
      if (!getProjectById(doc.projectId)) {
        doc.projectId = projectsState.activeProjectId || defaultProjectId;
        libraryChanged = true;
      }
    });
    if (sessionsChanged) saveSessionsState();
    if (libraryChanged) saveKnowledgeLibrary();
  }

  function formatProjectDate(value) {
    const date = new Date(value || Date.now());
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleDateString(currentLanguage === 'en' ? 'en-US' : 'fr-FR', { day: '2-digit', month: 'short' });
  }

  function getProjectStats(projectId) {
    const sessions = (sessionsState.sessions || []).filter((session) => getSessionProjectId(session) === projectId);
    const docs = (knowledgeLibrary.documents || []).filter((doc) => getDocumentProjectId(doc) === projectId);
    const chunkCount = docs.reduce((sum, doc) => sum + getKnowledgeDocChunks(doc).length, 0);
    const indexedSize = docs.reduce((sum, doc) => sum + (Number(doc.textLength) || 0), 0);
    const latestSession = sessions.reduce((latest, session) => Math.max(latest, Number(session.updatedAt) || 0), 0);
    const latestDoc = docs.reduce((latest, doc) => Math.max(latest, Number(doc.importedAt) || 0), 0);
    return {
      conversations: sessions.length,
      documents: docs.length,
      chunks: chunkCount,
      indexedSize,
      lastActivity: Math.max(latestSession, latestDoc)
    };
  }

  function countProjectMemories(project) {
    return normalizeSessionSummary(project?.memory).length ? 1 : 0;
  }

  function openProject(projectId) {
    if (!getProjectById(projectId)) return;
    projectsState.activeProjectId = projectId;
    saveProjectsState();
    setHistoryPanelOpen(true);
    setWorkspaceView('project');
  }

  function renameProject(projectId) {
    const project = getProjectById(projectId);
    if (!project) return;
    const nextName = window.prompt('Nouveau nom du projet', project.name);
    if (nextName === null) return;
    const cleanName = nextName.replace(/\s+/g, ' ').trim().slice(0, 80);
    if (!cleanName) return;
    project.name = cleanName;
    project.icon = project.icon || cleanName.charAt(0).toUpperCase();
    project.updatedAt = Date.now();
    saveProjectsState();
    renderProjectList();
    if (project.id === projectsState.activeProjectId) renderProjectWorkspace();
  }

  function duplicateProject(projectId) {
    const project = getProjectById(projectId);
    if (!project) return;
    const duplicate = normalizeProject({
      ...project,
      id: buildProjectId(`${project.name}-copy`),
      name: `${project.name} copie`,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      memory: project.memory || '',
      ragProjectIds: [...(project.ragProjectIds || [])]
    });
    projectsState.projects.unshift(duplicate);
    projectsState.activeProjectId = duplicate.id;
    saveProjectsState();
    setWorkspaceView('project');
    renderProjectList();
  }

  function getProjectExportDateStamp() {
    return new Date().toISOString().slice(0, 10);
  }

  function downloadTextFile(filename, content, mimeType = 'text/plain;charset=utf-8') {
    downloadBlob(new Blob([String(content || '')], { type: mimeType }), filename);
  }

  function buildProjectExportPayload(projectId) {
    const project = getProjectById(projectId);
    if (!project) return null;
    const stats = getProjectStats(projectId);
    return {
      exportVersion: 1,
      exportedAt: new Date().toISOString(),
      project,
      stats: { ...stats, memories: countProjectMemories(project) },
      conversations: (sessionsState.sessions || []).filter((session) => getSessionProjectId(session) === projectId),
      documents: (knowledgeLibrary.documents || []).filter((doc) => getDocumentProjectId(doc) === projectId).map((doc) => ({
        id: doc.id,
        name: doc.name,
        type: doc.type,
        kind: doc.kind,
        size: doc.size,
        textLength: doc.textLength,
        chunks: getKnowledgeDocChunks(doc).length,
        importedAt: doc.importedAt
      })),
      rag: {
        scope: project.ragScope || 'project',
        projectIds: [project.id, ...(project.ragProjectIds || [])]
      }
    };
  }

  function downloadProjectJson(projectId) {
    const payload = buildProjectExportPayload(projectId);
    if (!payload) return;
    downloadTextFile(
      `digital-blue-skye-project-export-${getProjectExportDateStamp()}.json`,
      JSON.stringify(payload, null, 2),
      'application/json;charset=utf-8'
    );
  }

  function getProjectRagScopeLabel(scope) {
    if (scope === 'library') return 'Toute la bibliotheque';
    if (scope === 'multi_project') return 'Plusieurs projets';
    return 'Projet courant';
  }

  function buildProjectHtmlReport(projectId) {
    const payload = buildProjectExportPayload(projectId);
    if (!payload) return;
    const { project, stats, conversations, documents, rag, exportedAt } = payload;
    const conversationRows = conversations.length
      ? conversations.map((session) => `<tr><td>${escapeHtml(getSessionDisplayTitle(session))}</td><td>${normalizeHistory(session.history).length}</td><td>${escapeHtml(formatProjectDate(session.updatedAt))}</td></tr>`).join('')
      : '<tr><td colspan="3">Aucune conversation associee.</td></tr>';
    const documentRows = documents.length
      ? documents.map((doc) => `<tr><td>${escapeHtml(doc.name)}</td><td>${escapeHtml(doc.type)}</td><td>${doc.chunks}</td><td>${escapeHtml(fileSizeLabel(doc.size))}</td></tr>`).join('')
      : '<tr><td colspan="4">Aucun document associe.</td></tr>';
    const nextSteps = [
      'Verifier que la memoire projet resume les objectifs et contraintes actuels.',
      'Importer ou rattacher les documents sources manquants.',
      'Utiliser le perimetre RAG adapte avant les prochaines analyses.',
      'Exporter regulierement le projet pour archivage ou partage.'
    ];
    return `<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(project.name)} - Rapport Digital Blue Skye AI</title>
  <style>
    :root { color-scheme: dark; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    body { background: radial-gradient(circle at 18% 0%, rgb(121 230 255 / 18%), transparent 30%), radial-gradient(circle at 82% 8%, rgb(160 110 255 / 20%), transparent 34%), #080a18; color: #f6f7ff; margin: 0; padding: 32px; }
    main { margin: 0 auto; max-width: 1040px; }
    header { border: 1px solid rgb(255 255 255 / 14%); border-radius: 18px; background: linear-gradient(180deg, rgb(255 255 255 / 10%), rgb(255 255 255 / 5%)); box-shadow: 0 22px 70px rgb(0 0 0 / 35%); padding: 28px; }
    h1 { font-size: clamp(2rem, 5vw, 4rem); line-height: 1; margin: 0 0 12px; }
    h2 { color: #9ee8ff; font-size: 1.1rem; margin: 0 0 14px; }
    p { color: rgb(235 240 255 / 76%); line-height: 1.6; }
    .grid { display: grid; gap: 14px; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); margin: 22px 0; }
    .card, section { border: 1px solid rgb(255 255 255 / 12%); border-radius: 14px; background: rgb(255 255 255 / 7%); padding: 18px; }
    .card span { color: rgb(235 240 255 / 58%); display: block; font-size: .78rem; }
    .card strong { display: block; font-size: 1.5rem; margin-top: 6px; }
    section { margin-top: 16px; }
    table { border-collapse: collapse; width: 100%; }
    th, td { border-bottom: 1px solid rgb(255 255 255 / 10%); padding: 10px 8px; text-align: left; vertical-align: top; }
    th { color: #9ee8ff; font-size: .78rem; text-transform: uppercase; }
    ul { color: rgb(235 240 255 / 78%); line-height: 1.65; margin: 0; padding-left: 20px; }
    .meta { color: rgb(235 240 255 / 56%); font-size: .86rem; }
    @media print { body { background: #fff; color: #111827; padding: 0; } header, section, .card { box-shadow: none; border-color: #d5d7e2; } p, ul, .meta { color: #334155; } h2, th { color: #2251c8; } }
    @media (max-width: 680px) { body { padding: 16px; } header, section { padding: 16px; } }
  </style>
</head>
<body>
  <main>
    <header>
      <p class="meta">Digital Blue Skye AI - Export du ${escapeHtml(new Date(exportedAt).toLocaleDateString('fr-FR'))}</p>
      <h1>${escapeHtml(project.name)}</h1>
      <p>${escapeHtml(project.description || 'Aucune description renseignee.')}</p>
      <div class="grid">
        <div class="card"><span>Conversations</span><strong>${stats.conversations}</strong></div>
        <div class="card"><span>Documents</span><strong>${stats.documents}</strong></div>
        <div class="card"><span>Chunks documentaires</span><strong>${stats.chunks}</strong></div>
        <div class="card"><span>Perimetre RAG</span><strong>${escapeHtml(getProjectRagScopeLabel(rag.scope))}</strong></div>
      </div>
    </header>
    <section><h2>Memoire projet</h2><p>${escapeHtml(project.memory || 'Aucune memoire projet renseignee.')}</p></section>
    <section><h2>Conversations associees</h2><table><thead><tr><th>Conversation</th><th>Messages</th><th>Activite</th></tr></thead><tbody>${conversationRows}</tbody></table></section>
    <section><h2>Documents associes</h2><table><thead><tr><th>Document</th><th>Type</th><th>Chunks</th><th>Taille</th></tr></thead><tbody>${documentRows}</tbody></table></section>
    <section><h2>Prochaines etapes recommandees</h2><ul>${nextSteps.map((step) => `<li>${escapeHtml(step)}</li>`).join('')}</ul></section>
  </main>
</body>
</html>`;
  }

  function downloadProjectHtml(projectId) {
    const html = buildProjectHtmlReport(projectId);
    if (!html) return;
    downloadTextFile(
      `digital-blue-skye-project-report-${getProjectExportDateStamp()}.html`,
      html,
      'text/html;charset=utf-8'
    );
  }

  function openProjectPrintableHtml(html) {
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      addMessage('bot', "PDF imprimable : autorisez les popups puis relancez l'export.");
      return;
    }
    printWindow.document.open();
    printWindow.document.write(html.replace('</main>', '<section><h2>PDF imprimable</h2><p>Utilisez Imprimer > Enregistrer en PDF.</p></section></main>'));
    printWindow.document.close();
    printWindow.focus?.();
    window.setTimeout(() => printWindow.print?.(), 500);
  }

  async function exportProjectPdf(projectId) {
    const html = buildProjectHtmlReport(projectId);
    if (!html) return;
    let frame = null;
    try {
      const html2pdf = await ensureHtml2PdfReady();
      frame = document.createElement('iframe');
      frame.style.position = 'fixed';
      frame.style.left = '-9999px';
      frame.style.top = '-9999px';
      frame.style.width = '1024px';
      frame.style.height = '1400px';
      document.body.appendChild(frame);
      frame.contentDocument.open();
      frame.contentDocument.write(html);
      frame.contentDocument.close();
      await new Promise((resolve) => window.setTimeout(resolve, 120));
      await html2pdf()
        .set({
          filename: `digital-blue-skye-project-report-${getProjectExportDateStamp()}.pdf`,
          margin: 8,
          html2canvas: { scale: 2, useCORS: true },
          jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
        })
        .from(frame.contentDocument.body)
        .save();
    } catch (error) {
      assistantLog('warn', 'project_pdf_export_fallback', { reason: error?.message || 'html2pdf_unavailable' });
      openProjectPrintableHtml(html);
    } finally {
      frame?.remove?.();
    }
  }

  async function exportProjectZip(projectId) {
    const payload = buildProjectExportPayload(projectId);
    if (!payload) return;
    if (!window.JSZip) {
      addMessage('bot', 'Export ZIP non encore disponible. Utilisez JSON ou HTML pour le moment.');
      return;
    }
    const zip = new window.JSZip();
    const date = getProjectExportDateStamp();
    zip.file(`digital-blue-skye-project-export-${date}.json`, JSON.stringify(payload, null, 2));
    zip.file(`digital-blue-skye-project-report-${date}.html`, buildProjectHtmlReport(projectId));
    zip.file('README.txt', [
      `Export Digital Blue Skye AI - ${payload.project.name}`,
      `Date: ${payload.exportedAt}`,
      '',
      'Contenu:',
      '- JSON technique',
      '- Rapport HTML lisible',
      '- Metadonnees des documents lies',
      '',
      'Les fichiers physiques de la bibliotheque globale ne sont pas inclus.'
    ].join('\n'));
    zip.file('documents-metadata.json', JSON.stringify(payload.documents, null, 2));
    const blob = await zip.generateAsync({ type: 'blob' });
    downloadBlob(blob, `digital-blue-skye-project-complete-${date}.zip`);
  }

  function buildProjectShareText(project) {
    const stats = getProjectStats(project.id);
    return [
      'Bonjour,',
      '',
      `Je vous partage le projet "${project.name}" depuis Digital Blue Skye AI.`,
      '',
      'Resume du projet :',
      '',
      `* Description : ${project.description || 'Non renseignee'}`,
      `* Conversations associees : ${stats.conversations}`,
      `* Documents associes : ${stats.documents}`,
      `* Chunks documentaires : ${stats.chunks}`,
      `* Perimetre RAG : ${getProjectRagScopeLabel(project.ragScope || 'project')}`,
      '',
      'Ce projet regroupe les elements de travail, documents et conversations utiles a son suivi.',
      '',
      'Cordialement,'
    ].join('\n');
  }

  async function shareProject(projectId) {
    const project = getProjectById(projectId);
    if (!project) return;
    const text = buildProjectShareText(project);
    if (navigator.share) {
      try {
        await navigator.share({
          title: `Projet Digital Blue Skye AI - ${project.name}`,
          text,
          url: window.location.href
        });
        return;
      } catch (error) {
        assistantLog('warn', 'project_share_failed', { reason: error?.message || 'share_failed' });
      }
    }
    const mailto = `mailto:?subject=${encodeURIComponent(`Projet Digital Blue Skye AI - ${project.name}`)}&body=${encodeURIComponent(text)}`;
    window.location.href = mailto;
  }

  function handleProjectExportAction(format, projectId) {
    if (!projectId) return;
    if (format === 'json') downloadProjectJson(projectId);
    else if (format === 'html') downloadProjectHtml(projectId);
    else if (format === 'pdf') exportProjectPdf(projectId);
    else if (format === 'zip') exportProjectZip(projectId);
  }

  function changeProjectAppearance(projectId) {
    const project = getProjectById(projectId);
    if (!project) return;
    const nextIcon = window.prompt('Icone du projet', project.icon || project.name.charAt(0).toUpperCase());
    if (nextIcon !== null) project.icon = String(nextIcon || project.icon || 'P').slice(0, 2).toUpperCase();
    const nextColor = window.prompt('Couleur hexadecimale du projet', project.color || '#79e6ff');
    if (nextColor !== null && /^#[0-9a-f]{6}$/i.test(nextColor.trim())) project.color = nextColor.trim();
    project.updatedAt = Date.now();
    saveProjectsState();
    renderProjectList();
    if (project.id === projectsState.activeProjectId) renderProjectWorkspace();
  }

  function closeProjectDeleteDialog() {
    if (!projectDeleteDialog) return;
    projectDeleteDialog.hidden = true;
    projectDeleteDialog.setAttribute('aria-hidden', 'true');
    pendingDeleteProjectId = '';
  }

  function requestProjectDeletion(projectId) {
    const project = getProjectById(projectId);
    if (!project || project.id === defaultProjectId || !projectDeleteDialog) return;
    const stats = getProjectStats(projectId);
    pendingDeleteProjectId = projectId;
    if (projectDeleteSummary) {
      projectDeleteSummary.textContent = [
        `${stats.conversations} conversation${stats.conversations > 1 ? 's' : ''}`,
        `${stats.documents} document${stats.documents > 1 ? 's' : ''}`,
        `${countProjectMemories(project)} memoire${countProjectMemories(project) > 1 ? 's' : ''} associee${countProjectMemories(project) > 1 ? 's' : ''}`
      ].join(' • ');
    }
    projectDeleteDialog.hidden = false;
    projectDeleteDialog.setAttribute('aria-hidden', 'false');
    projectDeleteCancelButton?.focus?.();
  }

  function deleteProjectConfirmed(projectId) {
    const project = getProjectById(projectId);
    if (!project || project.id === defaultProjectId) return;
    (sessionsState.sessions || []).forEach((session) => {
      if (getSessionProjectId(session) === projectId) {
        session.projectId = defaultProjectId;
        session.updatedAt = Date.now();
      }
    });
    (knowledgeLibrary.documents || []).forEach((doc) => {
      if (getDocumentProjectId(doc) === projectId) doc.projectId = defaultProjectId;
    });
    projectsState.projects = (projectsState.projects || []).filter((item) => item.id !== projectId);
    projectsState.projects.forEach((item) => {
      item.ragProjectIds = (item.ragProjectIds || []).filter((id) => id !== projectId);
    });
    if (projectsState.activeProjectId === projectId) projectsState.activeProjectId = defaultProjectId;
    saveSessionsState();
    saveKnowledgeLibrary();
    saveProjectsState();
    setWorkspaceView('project');
    renderSessionOptions();
    renderProjectList();
    closeProjectDeleteDialog();
  }

  function handleProjectMenuAction(action, projectId) {
    if (!projectId) return;
    if (action === 'open') openProject(projectId);
    else if (action === 'rename') renameProject(projectId);
    else if (action === 'duplicate') duplicateProject(projectId);
    else if (action === 'export-menu') return;
    else if (action === 'share') shareProject(projectId);
    else if (action === 'appearance') changeProjectAppearance(projectId);
    else if (action === 'delete') requestProjectDeletion(projectId);
  }

  function fileSizeFromChars(chars) {
    const bytes = Math.max(0, Number(chars) || 0);
    if (!bytes) return '0 o';
    if (bytes < 1024) return `${bytes} o`;
    if (bytes < 1024 * 1024) return `${Math.round(bytes / 102.4) / 10} Ko`;
    return `${Math.round(bytes / (1024 * 102.4)) / 10} Mo`;
  }

  function setWorkspaceView(view) {
    const isLibrary = view === 'library';
    const isProject = view === 'project';
    const isSettings = view === 'settings';
    isLibraryViewOpen = isLibrary;
    if (panel) {
      panel.classList.toggle('is-library-view', isLibrary);
      panel.classList.toggle('is-project-view', isProject);
      panel.classList.toggle('is-settings-view', isSettings);
    }
    if (libraryView) {
      libraryView.hidden = !isLibrary;
      libraryView.setAttribute('aria-hidden', String(!isLibrary));
    }
    if (projectView) {
      projectView.hidden = !isProject;
      projectView.setAttribute('aria-hidden', String(!isProject));
    }
    if (settingsView) {
      settingsView.hidden = !isSettings;
      settingsView.setAttribute('aria-hidden', String(!isSettings));
    }
    if (sessionLibraryButton) sessionLibraryButton.classList.toggle('is-active', isLibrary);
    if (settingsOpenButton) settingsOpenButton.classList.toggle('is-active', isSettings);
    if (isLibrary) renderKnowledgeLibraryView();
    if (isProject) renderProjectWorkspace();
    if (isSettings) renderSettingsView();
    if (!isLibrary) closeLibraryCardMenu();
    if (!isLibrary) closeMediaPreview();
    updateScrollBottomButton();
  }

  function getSessionById(sessionId) {
    return sessionsState.sessions.find((session) => session.id === sessionId) || null;
  }

  function closeSessionContextMenu() {
    if (!sessionContextMenu) return;
    sessionContextMenu.classList.remove('is-open');
    sessionContextMenu.setAttribute('aria-hidden', 'true');
    activeContextSessionId = '';
  }

  function closeProjectContextMenu() {
    if (!projectContextMenu) return;
    projectContextMenu.classList.remove('is-open');
    projectContextMenu.setAttribute('aria-hidden', 'true');
    activeContextProjectId = '';
  }

  function openSessionContextMenu(event, sessionId) {
    if (!sessionContextMenu || !historyPanel || !getSessionById(sessionId)) return;
    event.preventDefault();
    closeProjectContextMenu();
    activeContextSessionId = sessionId;
    sessionContextMenu.classList.add('is-open');
    sessionContextMenu.setAttribute('aria-hidden', 'false');
    const panelRect = historyPanel.getBoundingClientRect();
    const ownerRect = panel?.getBoundingClientRect() || panelRect;
    const menuRect = sessionContextMenu.getBoundingClientRect();
    const maxLeft = Math.max(10, ownerRect.right - panelRect.left - menuRect.width - 12);
    const left = Math.min(
      Math.max(event.clientX - panelRect.left, 10),
      maxLeft
    );
    const top = Math.min(
      Math.max(event.clientY - panelRect.top, 10),
      Math.max(10, panelRect.height - menuRect.height - 10)
    );
    sessionContextMenu.style.left = `${left}px`;
    sessionContextMenu.style.top = `${top}px`;
  }

  function openProjectContextMenu(event, projectId) {
    if (!projectContextMenu || !historyPanel || !getProjectById(projectId)) return;
    event.preventDefault();
    closeSessionContextMenu();
    activeContextProjectId = projectId;
    projectContextMenu.classList.add('is-open');
    projectContextMenu.setAttribute('aria-hidden', 'false');
    const panelRect = historyPanel.getBoundingClientRect();
    const ownerRect = panel?.getBoundingClientRect() || panelRect;
    const menuRect = projectContextMenu.getBoundingClientRect();
    const maxLeft = Math.max(10, ownerRect.right - panelRect.left - menuRect.width - 12);
    const left = Math.min(Math.max(event.clientX - panelRect.left, 10), maxLeft);
    const top = Math.min(
      Math.max(event.clientY - panelRect.top, 10),
      Math.max(10, panelRect.height - menuRect.height - 10)
    );
    projectContextMenu.style.left = `${left}px`;
    projectContextMenu.style.top = `${top}px`;
    projectContextMenu.classList.toggle('is-export-left', event.clientX > window.innerWidth - 460);
  }

  function setAssistantRequestRunning(active) {
    if (panel) panel.classList.toggle('is-requesting', active);
    if (stopButton) {
      stopButton.hidden = !active;
      stopButton.disabled = !active;
      stopButton.classList.toggle('is-visible', active);
    }
    if (assistantSendButton) {
      assistantSendButton.disabled = active;
      assistantSendButton.setAttribute('aria-disabled', String(active));
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

  function truncateText(text, limit = 220) {
    const compact = String(text || '').replace(/\s+/g, ' ').trim();
    const max = Math.max(12, Number(limit) || 220);
    if (compact.length <= max) return compact;
    return `${compact.slice(0, max - 3).trim()}...`;
  }

  const readableFileExtensions = new Set(['txt','md','markdown','json','csv','log','xml','html','htm','js','ts','css','py','php','java','c','cpp','sql','yaml','yml']);
  const imageFileExtensions = new Set(['png','jpg','jpeg','webp','bmp','gif','tiff']);
  const pdfFileExtensions = new Set(['pdf']);
  const docxFileExtensions = new Set(['docx']);
  const excelFileExtensions = new Set(['xlsx','xls']);
  const powerPointFileExtensions = new Set(['pptx','ppt']);
  let tesseractLoaderPromise = null;
  let pdfJsLoaderPromise = null;
  let mammothLoaderPromise = null;
  let sheetJsLoaderPromise = null;
  let jsZipLoaderPromise = null;
  let html2PdfLoaderPromise = null;
  let jsPdfLoaderPromise = null;
  const maxLocalFilesPerPrompt = 4;
  const maxTextCharsPerFile = 12000;
  const maxDocumentCharsPerFile = 60000;
  const maxExcelContextCharsPerFile = 120000;
  const maxImageOcrCharsPerFile = 8000;

  function getFileExtension(name) {
    const safeName = String(name || '');
    const idx = safeName.lastIndexOf('.');
    return idx >= 0 ? safeName.slice(idx + 1).toLowerCase() : '';
  }

  function getTelemetryFileKind(file) {
    const extension = getFileExtension(file?.name);
    if (isPdfFile(file)) return 'pdf';
    if (isDocxFile(file)) return 'docx';
    if (isExcelFile(file)) return extension === 'csv' ? 'csv' : 'xlsx';
    if (isPowerPointFile(file)) return 'pptx';
    if (extension === 'csv') return 'csv';
    return '';
  }

  function buildAttachmentTelemetry(file, extractedTextLength = 0) {
    const kind = getTelemetryFileKind(file);
    if (!kind) return null;
    const extension = getFileExtension(file?.name) || kind;
    return {
      name: extension ? `.${extension}` : '',
      type: String(file?.type || '').slice(0, 120),
      size: Number(file?.size || 0) || 0,
      extractedTextLength: Number(extractedTextLength || 0) || 0,
      kind
    };
  }

  function isReadableTextFile(file) {
    if (!file) return false;
    if (isDocxFile(file) || isPdfFile(file) || isImageFile(file) || isExcelFile(file) || isPowerPointFile(file)) return false;
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

  function isPowerPointFile(file) {
    if (!file) return false;
    const mime = String(file.type || '').toLowerCase();
    if (mime === 'application/vnd.openxmlformats-officedocument.presentationml.presentation') return true;
    if (mime === 'application/vnd.ms-powerpoint') return true;
    if (mime.includes('presentationml') || mime.includes('powerpoint')) return true;
    return powerPointFileExtensions.has(getFileExtension(file.name));
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

  function fileSizeLabel(bytes) {
    const size = Number(bytes) || 0;
    if (!size) return '';
    if (size < 1024) return `${size} o`;
    if (size < 1024 * 1024) return `${Math.round(size / 102.4) / 10} Ko`;
    return `${Math.round(size / (1024 * 102.4)) / 10} Mo`;
  }

  function createImageThumbnailDataUrl(dataUrl, maxSide = libraryImagePreviewSize) {
    return new Promise((resolve) => {
      if (!String(dataUrl || '').startsWith('data:image/')) { resolve(''); return; }
      const image = new Image();
      image.onload = () => {
        const scale = Math.min(1, maxSide / Math.max(image.naturalWidth || image.width, image.naturalHeight || image.height));
        const width = Math.max(1, Math.round((image.naturalWidth || image.width) * scale));
        const height = Math.max(1, Math.round((image.naturalHeight || image.height) * scale));
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) { resolve(''); return; }
        ctx.drawImage(image, 0, 0, width, height);
        try {
          resolve(canvas.toDataURL('image/jpeg', 0.82));
        } catch (error) {
          resolve('');
        }
      };
      image.onerror = () => resolve('');
      image.src = dataUrl;
    });
  }

  function dataUrlToBlob(dataUrl) {
    const match = String(dataUrl || '').match(/^data:([^;,]+)?(;base64)?,(.*)$/);
    if (!match) return null;
    const mimeType = match[1] || 'application/octet-stream';
    const isBase64 = Boolean(match[2]);
    const payload = match[3] || '';
    try {
      const binary = isBase64 ? atob(payload) : decodeURIComponent(payload);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
      return new Blob([bytes], { type: mimeType });
    } catch (error) {
      return null;
    }
  }

  function openKnowledgeLibraryDb() {
    if (!window.indexedDB) return Promise.resolve(null);
    if (knowledgeLibraryDbPromise) return knowledgeLibraryDbPromise;
    knowledgeLibraryDbPromise = new Promise((resolve) => {
      const request = indexedDB.open(knowledgeLibraryDbName, 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(knowledgeLibraryFileStoreName)) {
          db.createObjectStore(knowledgeLibraryFileStoreName, { keyPath: 'id' });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => {
        assistantLog('warn', 'library_indexeddb_open_failed', { reason: request.error?.message || 'indexeddb_open_failed' });
        resolve(null);
      };
    });
    return knowledgeLibraryDbPromise;
  }

  async function putKnowledgeOriginalFile(docId, file) {
    if (!docId || !file) return false;
    const storedFile = {
      id: docId,
      name: file.name || 'document',
      mimeType: file.type || 'application/octet-stream',
      size: file.size || 0,
      savedAt: new Date().toISOString(),
      blob: file.slice(0, file.size, file.type || 'application/octet-stream')
    };
    knowledgeOriginalFileMemoryStore.set(docId, storedFile);
    const db = await openKnowledgeLibraryDb();
    if (!db) return true;
    return new Promise((resolve) => {
      const tx = db.transaction(knowledgeLibraryFileStoreName, 'readwrite');
      tx.objectStore(knowledgeLibraryFileStoreName).put(storedFile);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => {
        assistantLog('warn', 'library_original_file_save_failed', {
          fileName: file?.name || 'document',
          reason: tx.error?.message || 'indexeddb_put_failed'
        });
        resolve(false);
      };
    });
  }

  async function getKnowledgeOriginalFile(doc) {
    if (doc?.id && knowledgeOriginalFileMemoryStore.has(doc.id)) {
      return knowledgeOriginalFileMemoryStore.get(doc.id);
    }
    const db = await openKnowledgeLibraryDb();
    if (!db || !doc?.id) return null;
    return new Promise((resolve) => {
      const tx = db.transaction(knowledgeLibraryFileStoreName, 'readonly');
      const request = tx.objectStore(knowledgeLibraryFileStoreName).get(doc.id);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => resolve(null);
    });
  }

  async function clearKnowledgeOriginalFiles() {
    knowledgeOriginalFileMemoryStore.clear();
    const db = await openKnowledgeLibraryDb();
    if (!db) return;
    await new Promise((resolve) => {
      const tx = db.transaction(knowledgeLibraryFileStoreName, 'readwrite');
      tx.objectStore(knowledgeLibraryFileStoreName).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  }

  async function deleteKnowledgeOriginalFile(docId) {
    if (!docId) return;
    knowledgeOriginalFileMemoryStore.delete(docId);
    const db = await openKnowledgeLibraryDb();
    if (!db) return;
    await new Promise((resolve) => {
      const tx = db.transaction(knowledgeLibraryFileStoreName, 'readwrite');
      tx.objectStore(knowledgeLibraryFileStoreName).delete(docId);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  }

  function wrapCanvasText(ctx, text, x, y, maxWidth, lineHeight, maxLines) {
    const words = String(text || '').replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
    const lines = [];
    let line = '';
    words.forEach((word) => {
      const testLine = line ? `${line} ${word}` : word;
      if (ctx.measureText(testLine).width > maxWidth && line) {
        lines.push(line);
        line = word;
      } else {
        line = testLine;
      }
    });
    if (line) lines.push(line);
    lines.slice(0, maxLines).forEach((item, index) => {
      const suffix = index === maxLines - 1 && lines.length > maxLines ? '...' : '';
      ctx.fillText(`${item}${suffix}`, x, y + index * lineHeight);
    });
    return Math.min(lines.length, maxLines) * lineHeight;
  }

  function createDocumentCanvasPreview({ title, type, kind, text }) {
    const canvas = document.createElement('canvas');
    canvas.width = libraryDocumentPreviewSize;
    canvas.height = libraryDocumentPreviewSize;
    const ctx = canvas.getContext('2d');
    if (!ctx) return '';

    const gradients = {
      pdf: ['#ff776b', '#6d2cff'],
      excel: ['#1fb779', '#4f7cff'],
      powerpoint: ['#f06b31', '#a837ff'],
      docx: ['#3f8cff', '#763cff'],
      html: ['#ff9b45', '#5f7dff'],
      text: ['#65d6ff', '#7a4dff'],
      document: ['#65d6ff', '#c35cff']
    };
    const kindLabels = {
      excel: 'EXCEL',
      powerpoint: 'PRESENTATION',
      docx: 'DOCUMENT',
      html: 'PAGE WEB',
      text: 'TEXTE',
      pdf: 'PDF',
      document: 'DOCUMENT'
    };
    const formatDescriptions = {
      excel: 'TABLEUR EXCEL',
      powerpoint: 'PRESENTATION POWERPOINT',
      html: 'PAGE WEB HTML'
    };
    const isSimplifiedPreview = shouldUseSimplifiedDocumentPreview(kind, type);
    const [start, end] = gradients[kind] || gradients.document;
    const bg = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
    bg.addColorStop(0, '#202840');
    bg.addColorStop(0.45, '#2d2559');
    bg.addColorStop(1, '#161029');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const accent = ctx.createLinearGradient(120, 100, 640, 640);
    accent.addColorStop(0, start);
    accent.addColorStop(1, end);
    ctx.fillStyle = accent;
    ctx.globalAlpha = 0.26;
    ctx.beginPath();
    ctx.roundRect?.(64, 64, 632, 632, 46);
    if (!ctx.roundRect) ctx.rect(64, 64, 632, 632);
    ctx.fill();
    ctx.globalAlpha = 1;

    ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    ctx.lineWidth = 3;
    ctx.strokeRect(72, 72, 616, 616);

    ctx.fillStyle = '#f7f7ff';
    ctx.font = isSimplifiedPreview
      ? '800 86px system-ui, -apple-system, BlinkMacSystemFont, sans-serif'
      : '700 64px system-ui, -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(String(type || 'DOC').toUpperCase().slice(0, 5), 380, isSimplifiedPreview ? 300 : 185);

    ctx.fillStyle = '#79e6ff';
    ctx.font = isSimplifiedPreview
      ? '800 34px system-ui, -apple-system, BlinkMacSystemFont, sans-serif'
      : '700 24px system-ui, -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.fillText(kindLabels[kind] || String(kind || 'DOCUMENT').toUpperCase(), 380, isSimplifiedPreview ? 352 : 228);

    if (isSimplifiedPreview) {
      ctx.fillStyle = 'rgba(247,247,255,0.76)';
      ctx.font = '650 28px system-ui, -apple-system, BlinkMacSystemFont, sans-serif';
      ctx.fillText(formatDescriptions[kind] || String(type || 'DOCUMENT').toUpperCase(), 380, 430);
    } else {
      ctx.textAlign = 'left';
      ctx.fillStyle = '#ffffff';
      ctx.font = '700 34px system-ui, -apple-system, BlinkMacSystemFont, sans-serif';
      wrapCanvasText(ctx, title, 120, 330, 520, 42, 3);

      ctx.fillStyle = 'rgba(235,240,255,0.78)';
      ctx.font = '500 24px system-ui, -apple-system, BlinkMacSystemFont, sans-serif';
      wrapCanvasText(ctx, text, 120, 480, 520, 34, 5);
    }

    try {
      return canvas.toDataURL('image/jpeg', 0.84);
    } catch (error) {
      return '';
    }
  }

  function createHtmlCanvasPreview({ title, text }) {
    const cleaned = String(text || '')
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/\s+/g, ' ')
      .trim();
    return createDocumentCanvasPreview({
      title,
      type: 'HTML',
      kind: 'html',
      text: cleaned || 'Page HTML conservée dans la bibliothèque locale.'
    });
  }

  async function createPdfPreviewDataUrl(file) {
    try {
      const pdfjsLib = await loadPdfJsLibrary();
      const data = await file.arrayBuffer();
      const pdfDoc = await pdfjsLib.getDocument({ data }).promise;
      const page = await pdfDoc.getPage(1);
      const viewport = page.getViewport({ scale: 1 });
      const targetWidth = libraryDocumentPreviewSize;
      const scale = targetWidth / viewport.width;
      const scaledViewport = page.getViewport({ scale });
      const canvas = document.createElement('canvas');
      canvas.width = Math.ceil(scaledViewport.width);
      canvas.height = Math.ceil(scaledViewport.height);
      const ctx = canvas.getContext('2d');
      if (!ctx) return '';
      await page.render({ canvasContext: ctx, viewport: scaledViewport }).promise;
      return canvas.toDataURL('image/jpeg', 0.82);
    } catch (error) {
      assistantLog('warn', 'library_pdf_preview_failed', { fileName: file?.name || 'pdf', reason: error?.message || 'pdf_preview_failed' });
      return '';
    }
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

  function loadJsZipLibrary() {
    if (window.JSZip?.loadAsync) return Promise.resolve(window.JSZip);
    if (jsZipLoaderPromise) return jsZipLoaderPromise;
    jsZipLoaderPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js';
      script.async = true;
      script.onload = () => window.JSZip?.loadAsync ? resolve(window.JSZip) : reject(new Error('jszip_missing'));
      script.onerror = () => reject(new Error('jszip_load_failed'));
      document.head.appendChild(script);
    });
    return jsZipLoaderPromise;
  }

  async function extractTextFromDocx(file) {
    const mammoth = await loadMammothLibrary();
    const arrayBuffer = await file.arrayBuffer();
    const result = await mammoth.extractRawText({ arrayBuffer });
    return String(result?.value || '').replace(/\r/g, '').replace(/\n{3,}/g, '\n\n').trim();
  }

  async function extractTextFromPowerPoint(file, language) {
    const JSZip = await loadJsZipLibrary();
    const zip = await JSZip.loadAsync(await file.arrayBuffer());
    const slideFiles = Object.keys(zip.files || {})
      .filter((name) => /^ppt\/slides\/slide\d+\.xml$/i.test(name))
      .sort((a, b) => Number(a.match(/slide(\d+)\.xml/i)?.[1] || 0) - Number(b.match(/slide(\d+)\.xml/i)?.[1] || 0));
    const parser = new DOMParser();
    const slideTexts = [];
    for (const slideName of slideFiles.slice(0, 20)) {
      const xml = await zip.file(slideName)?.async('text');
      if (!xml) continue;
      const doc = parser.parseFromString(xml, 'application/xml');
      const texts = Array.from(doc.getElementsByTagName('a:t'))
        .map((node) => node.textContent || '')
        .map((value) => value.replace(/\s+/g, ' ').trim())
        .filter(Boolean);
      if (texts.length) {
        const slideNumber = Number(slideName.match(/slide(\d+)\.xml/i)?.[1] || slideTexts.length + 1);
        slideTexts.push(`${language === 'en' ? 'Slide' : 'Diapositive'} ${slideNumber}: ${texts.join(' | ')}`);
      }
    }
    return {
      text: slideTexts.join('\n\n').trim(),
      slideCount: slideFiles.length,
      extractedSlides: slideTexts.length
    };
  }

  function excelCellToText(value) {
    if (value === null || value === undefined) return '';
    if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
    if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '';
    if (typeof value === 'boolean') return value ? 'true' : 'false';
    return String(value).replace(/\r/g, ' ').replace(/\s+/g, ' ').trim();
  }

  function isExcelRowEmpty(row) {
    return !Array.isArray(row) || !row.some((cell) => excelCellToText(cell));
  }

  function excelNumberFromCell(value) {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    const text = excelCellToText(value)
      .replace(/\s/g, '')
      .replace(/[€$£%]/g, '')
      .replace(/,/g, '.');
    if (!text || !/^-?\d+(\.\d+)?$/.test(text)) return null;
    const number = Number(text);
    return Number.isFinite(number) ? number : null;
  }

  function formatExcelNumber(value) {
    if (!Number.isFinite(value)) return '';
    return String(Number(value.toFixed(4))).replace(/\.0+$/, '');
  }

  function makeExcelColumnLabels(headerRow, columnCount) {
    const seen = new Map();
    const labels = [];
    for (let index = 0; index < columnCount; index += 1) {
      const raw = excelCellToText(headerRow?.[index]) || `Col${index + 1}`;
      const base = raw.slice(0, 80);
      const count = seen.get(base) || 0;
      seen.set(base, count + 1);
      labels.push(count ? `${base}_${count + 1}` : base);
    }
    return labels;
  }

  function buildExcelRowText(rowNumber, row, columnLabels, maxColumns = 24) {
    const values = [];
    for (let index = 0; index < Math.min(columnLabels.length, maxColumns); index += 1) {
      const value = excelCellToText(row?.[index]);
      if (value) values.push(`${columnLabels[index]}=${value.slice(0, 140)}`);
    }
    const overflow = columnLabels.length > maxColumns ? ` | ... ${columnLabels.length - maxColumns} colonne(s) non affichée(s)` : '';
    return `L${rowNumber}: ${values.join(' | ') || '[ligne vide]'}${overflow}`;
  }

  function pickExcelWindowIndexes(dataRows, maxRows = 32) {
    const total = dataRows.length;
    if (total <= maxRows) return dataRows.map((entry) => entry.index);
    const selected = new Set();
    const first = Math.min(12, total);
    const last = Math.min(12, total - first);
    for (let i = 0; i < first; i += 1) selected.add(dataRows[i].index);
    const middleStart = Math.max(first, Math.floor(total / 2) - 4);
    for (let i = middleStart; i < Math.min(total - last, middleStart + 8); i += 1) selected.add(dataRows[i].index);
    for (let i = Math.max(first, total - last); i < total; i += 1) selected.add(dataRows[i].index);
    return Array.from(selected).sort((a, b) => a - b);
  }

  function appendExcelSection(lines, section, budget) {
    const currentLength = lines.reduce((sum, line) => sum + line.length + 1, 0);
    if (currentLength + section.length + 1 > budget) return false;
    lines.push(section);
    return true;
  }

  async function extractTextFromExcel(file, language) {
    const XLSX = await loadSheetJsLibrary();
    const arrayBuffer = await file.arrayBuffer();
    const workbook = XLSX.read(arrayBuffer, { type: 'array', cellDates: true });

    const sheetNames = workbook.SheetNames || [];
    if (!sheetNames.length) {
      return { text: '', sheetNames: [], sheetCount: 0, totalRows: 0 };
    }

    const isEnglish = language === 'en';
    const maxDetailedColumns = 80;
    const maxColumnsInRows = 24;
    const maxDetailedRowsCharsPerSheet = 65000;
    const sheetTexts = [];
    let totalRows = 0;
    let totalNonEmptyRows = 0;
    let detailedRowsWereLimited = false;

    for (let i = 0; i < sheetNames.length; i += 1) {
      const sheetName = sheetNames[i];
      const sheet = workbook.Sheets[sheetName];
      if (!sheet) continue;

      const sheetData = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
      if (!sheetData.length) continue;

      const nonEmptyEntries = sheetData
        .map((row, index) => ({ row, index }))
        .filter((entry) => !isExcelRowEmpty(entry.row));
      if (!nonEmptyEntries.length) continue;

      totalRows += sheetData.length;
      totalNonEmptyRows += nonEmptyEntries.length;
      const headerEntry = nonEmptyEntries.find((entry) => entry.index < 20) || nonEmptyEntries[0];
      const dataEntries = nonEmptyEntries.filter((entry) => entry.index > headerEntry.index);
      const columnCount = nonEmptyEntries.reduce((max, entry) => Math.max(max, Array.isArray(entry.row) ? entry.row.length : 0), 0);
      const columnLabels = makeExcelColumnLabels(headerEntry.row || [], columnCount);
      const analyzedColumnCount = Math.min(columnCount, maxDetailedColumns);
      const numericStats = [];
      const textStats = [];
      const emptyStats = [];
      const seenRows = new Set();
      let duplicateRows = 0;

      for (const entry of dataEntries) {
        const normalized = (entry.row || []).slice(0, columnCount).map(excelCellToText).join('\u001f');
        if (!normalized.trim()) continue;
        if (seenRows.has(normalized)) duplicateRows += 1;
        else seenRows.add(normalized);
      }

      for (let colIdx = 0; colIdx < analyzedColumnCount; colIdx += 1) {
        const label = columnLabels[colIdx] || `Col${colIdx + 1}`;
        const values = dataEntries.map((entry) => entry.row?.[colIdx]);
        const nonEmptyValues = values.map(excelCellToText).filter(Boolean);
        const emptyCount = Math.max(0, dataEntries.length - nonEmptyValues.length);
        if (emptyCount) emptyStats.push(`${label}: ${emptyCount}`);
        const numericValues = values.map(excelNumberFromCell).filter((value) => value !== null);
        if (numericValues.length >= 2 && numericValues.length >= Math.max(2, Math.floor(nonEmptyValues.length * 0.55))) {
          const sorted = [...numericValues].sort((a, b) => a - b);
          const sum = numericValues.reduce((total, value) => total + value, 0);
          const average = sum / numericValues.length;
          const median = sorted[Math.floor(sorted.length / 2)];
          numericStats.push(`${label}: n=${numericValues.length}, min=${formatExcelNumber(sorted[0])}, max=${formatExcelNumber(sorted[sorted.length - 1])}, moyenne=${formatExcelNumber(average)}, médiane=${formatExcelNumber(median)}`);
          continue;
        }
        if (nonEmptyValues.length >= 2) {
          const counts = new Map();
          for (const value of nonEmptyValues) {
            const key = value.slice(0, 90);
            counts.set(key, (counts.get(key) || 0) + 1);
            if (counts.size > 500) break;
          }
          const topValues = Array.from(counts.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 4)
            .map(([value, count]) => `${value} (${count})`)
            .join(', ');
          const distinctCount = new Set(nonEmptyValues.map((value) => value.slice(0, 90))).size;
          textStats.push(`${label}: ${distinctCount} valeur(s) distincte(s)${topValues ? `, fréquentes: ${topValues}` : ''}`);
        }
      }

      const rowWindowIndexes = new Set(pickExcelWindowIndexes(dataEntries, 32));
      const previewRows = dataEntries
        .filter((entry) => rowWindowIndexes.has(entry.index))
        .map((entry) => buildExcelRowText(entry.index + 1, entry.row, columnLabels, maxColumnsInRows));

      const detailLines = [];
      let detailedRowsIncluded = 0;
      for (const entry of dataEntries) {
        const rowText = buildExcelRowText(entry.index + 1, entry.row, columnLabels, maxColumnsInRows);
        if (!appendExcelSection(detailLines, rowText, maxDetailedRowsCharsPerSheet)) {
          detailedRowsWereLimited = true;
          break;
        }
        detailedRowsIncluded += 1;
      }

      const sheetLines = [
        `${isEnglish ? 'Sheet' : 'Feuille'}: ${sheetName}`,
        `${isEnglish ? 'Analysis status' : 'Statut analyse'}: ${isEnglish ? 'all rows in this sheet were read in the browser before summarization' : 'toutes les lignes de cette feuille ont été parcourues côté navigateur avant synthèse'}`,
        `${isEnglish ? 'Size' : 'Taille'}: ${nonEmptyEntries.length} ${isEnglish ? 'non-empty rows' : 'lignes non vides'} (${dataEntries.length} ${isEnglish ? 'data rows after header' : 'lignes de données après en-tête'}), ${columnCount} ${isEnglish ? 'columns' : 'colonnes'}`,
        `${isEnglish ? 'Header row' : 'Ligne d’en-tête'}: L${headerEntry.index + 1}`,
        `${isEnglish ? 'Columns' : 'Colonnes'}: ${columnLabels.slice(0, maxDetailedColumns).join(' | ') || '[non détectées]'}${columnCount > maxDetailedColumns ? ` | ... ${columnCount - maxDetailedColumns} colonne(s) supplémentaire(s)` : ''}`,
        duplicateRows ? `${isEnglish ? 'Duplicate data rows' : 'Lignes de données doublonnées'}: ${duplicateRows}` : `${isEnglish ? 'Duplicate data rows' : 'Lignes de données doublonnées'}: 0`,
        numericStats.length ? `${isEnglish ? 'Numeric columns, calculated on all data rows' : 'Colonnes numériques, calculées sur toutes les lignes'}:\n- ${numericStats.join('\n- ')}` : '',
        textStats.length ? `${isEnglish ? 'Text/categorical columns, calculated on all data rows' : 'Colonnes texte/catégorielles, calculées sur toutes les lignes'}:\n- ${textStats.slice(0, 40).join('\n- ')}` : '',
        emptyStats.length ? `${isEnglish ? 'Empty cells by column' : 'Cellules vides par colonne'}:\n- ${emptyStats.slice(0, 40).join('\n- ')}` : '',
        previewRows.length ? `${isEnglish ? 'Representative rows (beginning, middle, end)' : 'Lignes représentatives (début, milieu, fin)'}:\n${previewRows.join('\n')}` : '',
        detailLines.length ? `${isEnglish ? 'Indexed detailed rows for retrieval' : 'Lignes détaillées indexées pour recherche'} (${detailedRowsIncluded}/${dataEntries.length}):\n${detailLines.join('\n')}` : ''
      ].filter(Boolean);

      sheetTexts.push(sheetLines.join('\n'));
    }

    const fullText = [
      `${isEnglish ? 'Workbook analysis' : 'Analyse du classeur'}: ${file.name}`,
      `${isEnglish ? 'Sheets read' : 'Feuilles lues'}: ${sheetNames.length}`,
      `${isEnglish ? 'Rows read before summarization' : 'Lignes parcourues avant synthèse'}: ${totalRows} (${totalNonEmptyRows} ${isEnglish ? 'non-empty' : 'non vides'})`,
      detailedRowsWereLimited
        ? (isEnglish
          ? 'Note: detailed row listing was reduced to stay within the prompt/storage budget; all row counts and column summaries above were still calculated from the full workbook.'
          : 'Note : la liste détaillée des lignes a été réduite pour rester dans le budget de contexte/stockage ; les comptages et synthèses de colonnes ci-dessus restent calculés sur le classeur complet.')
        : (isEnglish
          ? 'Note: detailed rows fit within the extraction budget.'
          : 'Note : les lignes détaillées tiennent dans le budget d’extraction.'),
      '',
      sheetTexts.join('\n\n')
    ].filter(Boolean).join('\n');

    return {
      text: fullText,
      sheetNames,
      sheetCount: sheetNames.length,
      totalRows,
      totalNonEmptyRows,
      detailedRowsWereLimited,
      extractedText: fullText.length
    };
  }

  async function buildLocalFileContext(files) {
    const selected = Array.from(files || []).slice(0, maxLocalFilesPerPrompt);
    const readableNames = [], unsupportedNames = [], failedNames = [], noTextNames = [], snippets = [], attachments = [];
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
            attachments.push(buildAttachmentTelemetry(file, pdfResult.text.length));
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
            attachments.push(buildAttachmentTelemetry(file, docxText.length));
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
                `${currentLanguage === 'en' ? 'Sheet names' : 'Noms des feuilles'}: ${excelResult.sheetNames.join(', ')}`,
                `${currentLanguage === 'en' ? 'Rows read before summarization' : 'Lignes parcourues avant synthèse'}: ${excelResult.totalRows || 0}`,
                `${currentLanguage === 'en' ? 'Non-empty rows' : 'Lignes non vides'}: ${excelResult.totalNonEmptyRows || 0}`,
                `${currentLanguage === 'en' ? 'Detailed row listing limited' : 'Liste détaillée des lignes limitée'}: ${excelResult.detailedRowsWereLimited ? 'oui' : 'non'}`
              ]
            }));
            readableNames.push(file.name);
            attachments.push(buildAttachmentTelemetry(file, excelResult.text.length));
            assistantLog('debug', 'excel_context_ready', {
              fileName: file.name,
              pendingFileContextLength: snippets.join('\n\n').length
            });
            continue;
          } catch (error) { failedNames.push(file.name); continue; }
        }
        if (isPowerPointFile(file)) {
          try {
            const pptResult = await extractTextFromPowerPoint(file, currentLanguage);
            assistantLog('debug', 'pptx_extract_result', {
              fileName: file.name,
              slideCount: pptResult.slideCount,
              extractedSlides: pptResult.extractedSlides,
              extractedTextLength: pptResult.text.length,
              extractedTextPreview: pptResult.text.slice(0, 300)
            });
            if (!pptResult.text) { noTextNames.push(file.name); continue; }
            snippets.push(buildDocumentContextBlock({
              label: `PowerPoint ${getFileExtension(file.name).toUpperCase()}`,
              fileName: file.name,
              text: pptResult.text,
              maxChars: maxDocumentCharsPerFile,
              meta: [
                `${currentLanguage === 'en' ? 'Slides' : 'Diapositives'}: ${pptResult.slideCount}`,
                `${currentLanguage === 'en' ? 'Slides extracted' : 'Diapositives extraites'}: ${pptResult.extractedSlides}`
              ]
            }));
            readableNames.push(file.name);
            attachments.push(buildAttachmentTelemetry(file, pptResult.text.length));
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
        const telemetry = buildAttachmentTelemetry(file, trimmed.length);
        if (telemetry) attachments.push(telemetry);
      } catch (error) { failedNames.push(file.name); }
    }
    return { context: snippets.join('\n\n'), readableNames, unsupportedNames, failedNames, noTextNames, attachments: attachments.filter(Boolean) };
  }

  function normalizeKnowledgeText(text) {
    return String(text || '')
      .replace(/\r/g, '')
      .replace(/\t/g, ' ')
      .replace(/[ \u00a0]{2,}/g, ' ')
      .replace(/\n{4,}/g, '\n\n\n')
      .trim();
  }

  function buildKnowledgeDocumentId(fileName) {
    return `k_${Date.now().toString(36)}_${String(fileName || 'doc').replace(/[^a-z0-9]+/gi, '-').slice(0, 24).toLowerCase()}_${Math.random().toString(36).slice(2, 6)}`;
  }

  function chunkKnowledgeText(text) {
    const source = normalizeKnowledgeText(text).slice(0, maxKnowledgeCharsPerDocument);
    const chunks = [];
    let start = 0;
    while (start < source.length && chunks.length < maxKnowledgeChunksPerDocument) {
      const hardEnd = Math.min(start + knowledgeChunkSize, source.length);
      let end = hardEnd;
      const nextBreak = source.slice(start, hardEnd).lastIndexOf('\n\n');
      if (nextBreak > 520) end = start + nextBreak;
      const chunk = source.slice(start, end).trim();
      if (chunk) chunks.push(chunk);
      if (end >= source.length) break;
      start = Math.max(end - knowledgeChunkOverlap, start + 1);
    }
    return chunks;
  }

  function stripKnowledgeDiacritics(value) {
    return String(value || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
  }

  function getKnowledgeStopWords() {
    return new Set([
      'afin','ainsi','alors','apres','avec','avoir','cela','celle','celui','ces','cette','chez','comme','dans','des','donc','dont','elle','elles','entre','est','etre','eux','faire','fait','faut','ici','ils','les','leur','leurs','mais','mes','mon','nos','notre','nous','par','pas','peut','plus','pour','que','quel','quelle','quels','qui','quoi','sans','ses','son','sont','sur','tes','toi','ton','tous','tout','une','vos','votre','vous',
      'about','after','also','and','are','because','been','before','being','between','both','can','could','did','does','doing','each','for','from','had','has','have','how','into','its','more','most','not','our','out','should','such','than','that','the','their','them','then','there','these','they','this','those','through','was','were','what','when','where','which','who','will','with','would','you','your'
    ]);
  }

  function tokenizeKnowledgeText(text, limit = 1200) {
    const stopWords = getKnowledgeStopWords();
    const terms = stripKnowledgeDiacritics(text)
      .replace(/['’]/g, ' ')
      .match(/[a-z0-9]{3,}/g) || [];
    const filtered = [];
    for (const term of terms) {
      if (stopWords.has(term)) continue;
      filtered.push(term);
      if (filtered.length >= limit) break;
    }
    return filtered;
  }

  function getKnowledgeDocChunks(doc) {
    if (!Array.isArray(doc?.chunks)) return [];
    return doc.chunks.map((chunk) => String(chunk || '')).filter(Boolean);
  }

  function extractKnowledgeChunkLocator(chunk, kind, chunkIndex) {
    const text = String(chunk || '');
    const lowerKind = String(kind || '').toLowerCase();
    const pageMatch = text.match(/\bPage\s+(\d{1,5})\b/i);
    if (pageMatch) return `page ${pageMatch[1]}`;
    const slideMatch = text.match(/\b(?:Diapositive|Slide)\s+(\d{1,5})\b/i);
    if (slideMatch) return currentLanguage === 'en' ? `slide ${slideMatch[1]}` : `diapositive ${slideMatch[1]}`;
    const sheetMatch = text.match(/\b(?:Feuille|Sheet)\s*:\s*([^\n\r]{1,90})/i);
    if (sheetMatch) {
      const rowMatches = [...text.matchAll(/\bL(\d{1,7})\b/g)].map((match) => Number(match[1])).filter(Number.isFinite);
      const rowLabel = rowMatches.length
        ? `, L${Math.min(...rowMatches)}-${Math.max(...rowMatches)}`
        : '';
      return `${currentLanguage === 'en' ? 'sheet' : 'feuille'} ${sheetMatch[1].trim()}${rowLabel}`;
    }
    if (lowerKind === 'pdf') return `${currentLanguage === 'en' ? 'PDF chunk' : 'extrait PDF'} ${chunkIndex + 1}`;
    if (lowerKind === 'powerpoint') return `${currentLanguage === 'en' ? 'slide chunk' : 'extrait diaporama'} ${chunkIndex + 1}`;
    if (lowerKind === 'excel') return `${currentLanguage === 'en' ? 'workbook chunk' : 'extrait classeur'} ${chunkIndex + 1}`;
    return `${currentLanguage === 'en' ? 'chunk' : 'extrait'} ${chunkIndex + 1}`;
  }

  function buildKnowledgeRagIndex(chunks, doc = {}) {
    return (chunks || []).map((chunk, chunkIndex) => {
      const terms = tokenizeKnowledgeText(chunk, 900);
      const frequencies = new Map();
      terms.forEach((term) => frequencies.set(term, (frequencies.get(term) || 0) + 1));
      const topTerms = [...frequencies.entries()]
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .slice(0, 36)
        .map(([term, count]) => ({ term, count }));
      return {
        chunkIndex,
        locator: extractKnowledgeChunkLocator(chunk, doc.kind || doc.type, chunkIndex),
        termCount: terms.length,
        topTerms
      };
    });
  }

  function normalizeKnowledgeRagIndex(index, chunks, doc) {
    const normalized = Array.isArray(index)
      ? index.slice(0, maxKnowledgeChunksPerDocument).map((item, fallbackIndex) => ({
        chunkIndex: Number.isFinite(Number(item?.chunkIndex)) ? Number(item.chunkIndex) : fallbackIndex,
        locator: String(item?.locator || '').slice(0, 120),
        termCount: Number(item?.termCount) || 0,
        topTerms: Array.isArray(item?.topTerms)
          ? item.topTerms.slice(0, 36).map((termItem) => ({
            term: String(termItem?.term || '').slice(0, 48),
            count: Math.max(1, Math.min(999, Number(termItem?.count) || 1))
          })).filter((termItem) => termItem.term)
          : []
      }))
      : [];
    if (normalized.length !== chunks.length || normalized.some((item, indexPosition) => item.chunkIndex !== indexPosition || !item.topTerms.length)) {
      return buildKnowledgeRagIndex(chunks, doc);
    }
    return normalized;
  }

  function normalizeKnowledgeLibraryShape(value) {
    const documents = Array.isArray(value?.documents) ? value.documents : [];
    return {
      version: 1,
      savedAt: value?.savedAt || '',
      documents: documents
        .map((doc) => {
          const normalizedDoc = {
            id: typeof doc?.id === 'string' ? doc.id : buildKnowledgeDocumentId(doc?.name),
            projectId: getProjectById(doc?.projectId)?.id || defaultProjectId,
            name: String(doc?.name || 'document').slice(0, 160),
            type: String(doc?.type || 'Document').slice(0, 48),
            kind: String(doc?.kind || 'document').slice(0, 32),
            mimeType: String(doc?.mimeType || '').slice(0, 96),
            size: Number(doc?.size) || 0,
            importedAt: Number(doc?.importedAt) || Date.now(),
            textLength: Number(doc?.textLength) || 0,
            hasOriginalFile: Boolean(doc?.hasOriginalFile),
            previewVersion: Number(doc?.previewVersion) || 1,
            previewText: String(doc?.previewText || '').slice(0, 360),
            previewDataUrl: String(doc?.previewDataUrl || '').startsWith('data:image/') && String(doc?.previewDataUrl || '').length <= maxStoredMediaDataUrlLength
              ? String(doc.previewDataUrl)
              : '',
            downloadDataUrl: String(doc?.downloadDataUrl || '').startsWith('data:image/') && String(doc?.downloadDataUrl || '').length <= maxStoredMediaDataUrlLength
              ? String(doc.downloadDataUrl)
              : '',
            chunks: Array.isArray(doc?.chunks)
              ? doc.chunks.map((chunk) => String(chunk || '').slice(0, knowledgeChunkSize + 200)).filter(Boolean).slice(0, maxKnowledgeChunksPerDocument)
              : []
          };
          if (shouldUseSimplifiedDocumentPreview(normalizedDoc.kind, normalizedDoc.type) && normalizedDoc.previewVersion < simplifiedPreviewVersion) {
            normalizedDoc.previewDataUrl = '';
          }
          normalizedDoc.ragIndex = normalizeKnowledgeRagIndex(doc?.ragIndex, normalizedDoc.chunks, normalizedDoc);
          return normalizedDoc;
        })
        .filter((doc) => doc.name && (doc.chunks.length || doc.previewDataUrl || doc.downloadDataUrl))
        .slice(0, maxKnowledgeDocuments)
    };
  }

  function loadKnowledgeLibrary() {
    try {
      const raw = localStorage.getItem(knowledgeLibraryStorageKey);
      knowledgeLibrary = raw ? normalizeKnowledgeLibraryShape(JSON.parse(raw)) : { version: 1, documents: [] };
    } catch (error) {
      assistantLog('warn', 'knowledge_library_load_failed', { reason: error?.message || 'invalid_local_storage_library' });
      knowledgeLibrary = { version: 1, documents: [] };
    }
    renderKnowledgeLibrary();
  }

  function saveKnowledgeLibrary() {
    try {
      knowledgeLibrary = normalizeKnowledgeLibraryShape({
        ...knowledgeLibrary,
        savedAt: new Date().toISOString()
      });
      localStorage.setItem(knowledgeLibraryStorageKey, JSON.stringify(knowledgeLibrary));
    } catch (error) {
      assistantLog('warn', 'knowledge_library_save_failed', { reason: error?.message || 'local_storage_unavailable' });
    }
    renderKnowledgeLibrary();
  }

  function getKnowledgeDocumentById(docId) {
    return (knowledgeLibrary.documents || []).find((doc) => doc.id === docId) || null;
  }

  function shouldUseSimplifiedDocumentPreview(kind, type) {
    const normalizedKind = String(kind || '').toLowerCase();
    const normalizedType = String(type || '').toLowerCase();
    return normalizedKind === 'excel'
      || normalizedKind === 'powerpoint'
      || normalizedKind === 'html'
      || normalizedType === 'html';
  }

  function getLibraryDocumentMeta(doc) {
    return [doc.type, fileSizeLabel(doc.size), i18n.libraryStoredLocally].filter(Boolean).join(' · ');
  }

  function getLibraryDocumentPreviewText(doc) {
    return doc.previewText || truncateText(doc.chunks?.[0] || '', 150);
  }

  function ensureKnowledgeDocumentPreview(doc) {
    if (!doc || doc.previewDataUrl) return;
    if (doc.kind === 'image') return;
    const type = doc.type || 'Document';
    const kind = doc.kind || 'document';
    const previewText = getLibraryDocumentPreviewText(doc);
    doc.previewDataUrl = kind === 'html' || String(type).toLowerCase() === 'html'
      ? createHtmlCanvasPreview({ title: doc.name, text: (doc.chunks || []).join('\n\n') || previewText })
      : createDocumentCanvasPreview({ title: doc.name, type, kind, text: previewText });
    if (shouldUseSimplifiedDocumentPreview(kind, type)) doc.previewVersion = simplifiedPreviewVersion;
  }

  function renderLibraryDocumentThumb(doc, container) {
    container.innerHTML = '';
    ensureKnowledgeDocumentPreview(doc);
    container.classList.toggle('has-preview', Boolean(doc.previewDataUrl));
    if (doc.previewDataUrl) {
      const image = document.createElement('img');
      image.src = doc.previewDataUrl;
      image.alt = doc.name;
      image.loading = 'lazy';
      container.appendChild(image);
      return;
    }
    const icon = document.createElement('img');
    icon.src = doc.kind === 'image' ? filesIconUrl : libraryIconUrl;
    icon.alt = '';
    icon.setAttribute('aria-hidden', 'true');
    const type = document.createElement('span');
    type.textContent = doc.type || 'Document';
    container.append(icon, type);
  }

  function createLibraryDocumentCard(doc) {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'ai-assistant-media-card';
    card.dataset.docId = doc.id;
    card.title = doc.name;

    const thumb = document.createElement('span');
    thumb.className = `ai-assistant-media-card-thumb ai-assistant-media-card-thumb--${doc.kind || 'document'}`;
    renderLibraryDocumentThumb(doc, thumb);

    const body = document.createElement('span');
    body.className = 'ai-assistant-media-card-body';

    const title = document.createElement('strong');
    title.textContent = doc.name;

    const meta = document.createElement('span');
    meta.textContent = getLibraryDocumentMeta(doc);

    body.append(title, meta);
    card.append(thumb, body);
    return card;
  }

  function renderKnowledgeLibraryView() {
    if (!libraryGrid || !libraryEmpty) return;
    const docs = (knowledgeLibrary.documents || []).slice().sort((a, b) => b.importedAt - a.importedAt);
    libraryGrid.innerHTML = '';
    libraryGrid.classList.toggle('is-list', libraryLayoutMode === 'list');
    if (libraryLayoutGridButton) libraryLayoutGridButton.classList.toggle('is-active', libraryLayoutMode === 'grid');
    if (libraryLayoutListButton) libraryLayoutListButton.classList.toggle('is-active', libraryLayoutMode === 'list');
    libraryEmpty.textContent = activeLibraryStatus || i18n.libraryEmptyView;
    libraryEmpty.hidden = Boolean(docs.length) && !activeLibraryStatus;
    docs.forEach((doc) => libraryGrid.appendChild(createLibraryDocumentCard(doc)));
  }

  function setKnowledgeLibraryLayout(mode) {
    libraryLayoutMode = mode === 'list' ? 'list' : 'grid';
    try { localStorage.setItem(knowledgeLibraryLayoutStorageKey, libraryLayoutMode); } catch (error) {}
    renderKnowledgeLibraryView();
  }

  function renderKnowledgeLibrary() {
    const docs = knowledgeLibrary.documents || [];
    if (!docs.length) {
      if (libraryCount) libraryCount.textContent = i18n.libraryEmpty;
      if (libraryPanel) libraryPanel.hidden = true;
      if (libraryClearButton) libraryClearButton.hidden = true;
      renderKnowledgeLibraryView();
      return;
    }
    if (libraryPanel) libraryPanel.hidden = false;
    const chunkCount = docs.reduce((sum, doc) => sum + doc.chunks.length, 0);
    if (libraryCount) libraryCount.textContent = `${docs.length} doc${docs.length > 1 ? 's' : ''} · ${chunkCount} chunks`;
    if (libraryClearButton) libraryClearButton.hidden = false;
    renderKnowledgeLibraryView();
  }

  async function deleteKnowledgeDocument(docId) {
    if (!docId) return;
    knowledgeLibrary.documents = (knowledgeLibrary.documents || []).filter((doc) => doc.id !== docId);
    if (activePreviewDocId === docId) closeMediaPreview();
    if (activeLibraryMenuDocId === docId) closeLibraryCardMenu();
    activeLibraryStatus = i18n.libraryDeleted;
    await deleteKnowledgeOriginalFile(docId);
    saveKnowledgeLibrary();
  }

  function getKnowledgeFileTypeLabel(file) {
    const extension = getFileExtension(file?.name).toUpperCase();
    if (isPdfFile(file)) return 'PDF';
    if (isDocxFile(file)) return 'DOCX';
    if (isExcelFile(file)) return extension || 'Excel';
    if (isPowerPointFile(file)) return extension || 'PowerPoint';
    if (isImageFile(file)) return 'Image';
    if (isReadableTextFile(file)) return extension || 'Texte';
    return extension || 'Document';
  }

  function getKnowledgeFileKind(file) {
    if (isPdfFile(file)) return 'pdf';
    if (isDocxFile(file)) return 'docx';
    if (isExcelFile(file)) return 'excel';
    if (isPowerPointFile(file)) return 'powerpoint';
    if (isImageFile(file)) return 'image';
    if (isReadableTextFile(file)) {
      const extension = getFileExtension(file?.name);
      if (extension === 'html' || extension === 'htm') return 'html';
      return 'text';
    }
    return 'document';
  }

  function buildFallbackKnowledgeExtraction(file, error) {
    const name = file?.name || 'document';
    const reason = String(error?.message || error || '').slice(0, 160);
    const kind = getKnowledgeFileKind(file);
    const type = getKnowledgeFileTypeLabel(file);
    return {
      name,
      mimeType: String(file?.type || ''),
      size: Number(file?.size) || 0,
      type,
      kind,
      text: '',
      previewDataUrl: createDocumentCanvasPreview({
        title: name,
        type,
        kind,
        text: reason || 'Fichier conservé dans la bibliothèque locale.'
      }),
      downloadDataUrl: '',
      importWarning: reason
    };
  }

  function createStoredKnowledgeDocument(file, extracted) {
    const text = normalizeKnowledgeText(extracted?.text);
    const fallbackText = [
      `Document importé dans la bibliothèque locale: ${extracted?.name || file?.name || 'document'}`,
      `Type: ${extracted?.type || getKnowledgeFileTypeLabel(file)}`,
      extracted?.size ? `Taille: ${fileSizeLabel(extracted.size)}` : '',
      extracted?.importWarning ? `Note technique: ${extracted.importWarning}` : '',
      !text ? 'Aucun texte exploitable n’a été extrait, mais le contenu reste disponible dans la galerie.' : ''
    ].filter(Boolean).join('\n');
    const chunks = chunkKnowledgeText(text || fallbackText);
    const doc = {
      id: buildKnowledgeDocumentId(file?.name),
      projectId: projectsState.activeProjectId || defaultProjectId,
      name: extracted?.name || file?.name || 'document',
      type: extracted?.type || getKnowledgeFileTypeLabel(file),
      importedAt: Date.now(),
      textLength: text.length,
      kind: extracted?.kind || getKnowledgeFileKind(file),
      mimeType: extracted?.mimeType || String(file?.type || ''),
      size: Number(extracted?.size) || Number(file?.size) || 0,
      hasOriginalFile: Boolean(extracted?.hasOriginalFile),
      previewVersion: shouldUseSimplifiedDocumentPreview(extracted?.kind || getKnowledgeFileKind(file), extracted?.type || getKnowledgeFileTypeLabel(file))
        ? simplifiedPreviewVersion
        : 1,
      previewText: truncateText(text || fallbackText, 220),
      previewDataUrl: extracted?.previewDataUrl || '',
      downloadDataUrl: extracted?.downloadDataUrl || '',
      chunks
    };
    doc.ragIndex = buildKnowledgeRagIndex(chunks, doc);
    return doc;
  }

  async function extractKnowledgeDocumentFromFile(file) {
    const name = file?.name || 'document';
    const base = {
      name,
      mimeType: String(file?.type || ''),
      size: Number(file?.size) || 0
    };
    if (isPdfFile(file)) {
      const previewDataUrl = await createPdfPreviewDataUrl(file);
      try {
        const result = await extractTextFromPdf(file, currentLanguage);
        return { ...base, type: 'PDF', kind: 'pdf', text: result.text, previewDataUrl };
      } catch (error) {
        assistantLog('warn', 'library_pdf_extract_failed', { fileName: name, reason: error?.message || 'pdf_extract_failed' });
        return {
          ...base,
          type: 'PDF',
          kind: 'pdf',
          text: '',
          previewDataUrl: previewDataUrl || createDocumentCanvasPreview({ title: name, type: 'PDF', kind: 'pdf', text: 'PDF conservé dans la bibliothèque locale.' })
        };
      }
    }
    if (isDocxFile(file)) {
      try {
        const text = await extractTextFromDocx(file);
        return {
          ...base,
          type: 'DOCX',
          kind: 'docx',
          text,
          previewDataUrl: createDocumentCanvasPreview({ title: name, type: 'DOCX', kind: 'docx', text })
        };
      } catch (error) {
        assistantLog('warn', 'library_docx_extract_failed', { fileName: name, reason: error?.message || 'docx_extract_failed' });
        return { ...base, type: 'DOCX', kind: 'docx', text: '', previewDataUrl: createDocumentCanvasPreview({ title: name, type: 'DOCX', kind: 'docx', text: 'Document Word conservé dans la bibliothèque locale.' }) };
      }
    }
    if (isExcelFile(file)) {
      try {
        const result = await extractTextFromExcel(file, currentLanguage);
        const type = getFileExtension(name).toUpperCase() || 'Excel';
        return {
          ...base,
          type,
          kind: 'excel',
          text: result.text,
          previewDataUrl: createDocumentCanvasPreview({ title: name, type, kind: 'excel', text: result.text })
        };
      } catch (error) {
        assistantLog('warn', 'library_excel_extract_failed', { fileName: name, reason: error?.message || 'excel_extract_failed' });
        const type = getFileExtension(name).toUpperCase() || 'Excel';
        return { ...base, type, kind: 'excel', text: '', previewDataUrl: createDocumentCanvasPreview({ title: name, type, kind: 'excel', text: 'Classeur conservé dans la bibliothèque locale.' }) };
      }
    }
    if (isPowerPointFile(file)) {
      const type = getFileExtension(name).toUpperCase() || 'PPTX';
      try {
        const result = await extractTextFromPowerPoint(file, currentLanguage);
        return {
          ...base,
          type,
          kind: 'powerpoint',
          text: result.text,
          previewDataUrl: createDocumentCanvasPreview({ title: name, type, kind: 'powerpoint', text: result.text || `${result.slideCount || 0} diapositives` })
        };
      } catch (error) {
        assistantLog('warn', 'library_pptx_extract_failed', { fileName: name, reason: error?.message || 'pptx_extract_failed' });
        return { ...base, type, kind: 'powerpoint', text: '', previewDataUrl: createDocumentCanvasPreview({ title: name, type, kind: 'powerpoint', text: 'Présentation conservée dans la bibliothèque locale.' }) };
      }
    }
    if (isImageFile(file)) {
      const dataUrl = await readFileAsDataUrl(file);
      const previewDataUrl = await createImageThumbnailDataUrl(dataUrl);
      let ocrText = '';
      try {
        ocrText = await extractTextFromImage(file, currentLanguage);
      } catch (error) {
        assistantLog('warn', 'library_image_ocr_failed', { fileName: name, reason: error?.message || 'ocr_failed' });
      }
      return {
        ...base,
        type: 'Image OCR',
        kind: 'image',
        text: ocrText,
        previewDataUrl: previewDataUrl || dataUrl,
        downloadDataUrl: dataUrl.length <= maxStoredMediaDataUrlLength ? dataUrl : ''
      };
    }
    if (isReadableTextFile(file)) {
      const text = await readFileAsText(file);
      const kind = getKnowledgeFileKind(file);
      const type = getFileExtension(name).toUpperCase() || 'Texte';
      return {
        ...base,
        type,
        kind,
        text,
        previewDataUrl: kind === 'html'
          ? createHtmlCanvasPreview({ title: name, text })
          : createDocumentCanvasPreview({ title: name, type, kind, text })
      };
    }
    return buildFallbackKnowledgeExtraction(file, new Error('unsupported_library_file'));
  }

  async function importFilesToKnowledgeLibrary(files) {
    const selected = Array.from(files || []).slice(0, maxLocalFilesPerPrompt);
    if (!selected.length) return;
    activeLibraryStatus = i18n.libraryImporting;
    renderKnowledgeLibraryView();
    assistantLog('debug', 'library_import_start', {
      fileCount: selected.length,
      fileNames: selected.map((file) => file.name)
    });
    const loadingBubble = addMessage('bot', i18n.libraryImporting);
    const importedNames = [];
    const failedNames = [];
    try {
      for (const file of selected) {
        try {
          let extracted;
          try {
            extracted = await extractKnowledgeDocumentFromFile(file);
          } catch (error) {
            assistantLog('warn', 'library_extract_total_failed', {
              fileName: file?.name || 'document',
              reason: error?.message || 'extract_failed'
            });
            extracted = buildFallbackKnowledgeExtraction(file, error);
          }
          const doc = createStoredKnowledgeDocument(file, extracted);
          doc.hasOriginalFile = await putKnowledgeOriginalFile(doc.id, file);
          knowledgeLibrary.documents = [
            doc,
            ...(knowledgeLibrary.documents || []).filter((existing) => existing.name !== doc.name)
          ].slice(0, maxKnowledgeDocuments);
          importedNames.push(file.name);
        } catch (error) {
          assistantLog('error', 'library_import_document_failed', {
            fileName: file?.name || 'document',
            reason: error?.message || 'import_failed'
          });
          failedNames.push(file?.name || 'document');
        }
      }
      saveKnowledgeLibrary();
    } finally {
      loadingBubble?.remove?.();
    }
    assistantLog('debug', 'library_import_done', {
      importedCount: importedNames.length,
      failedCount: failedNames.length,
      storedDocuments: knowledgeLibrary.documents?.length || 0
    });
    activeLibraryStatus = importedNames.length
      ? `${i18n.libraryImportSuccessView} ${importedNames.join(', ')}`
      : i18n.libraryImportErrorView;
    renderKnowledgeLibrary();
    if (!isLibraryViewOpen && importedNames.length) addMessage('bot', `${i18n.libraryReady} ${importedNames.join(', ')}`);
    if (!isLibraryViewOpen && failedNames.length) addMessage('bot', `${i18n.libraryImportFailed} ${failedNames.join(', ')}`);
  }

  function normalizeKnowledgeTerms(text) {
    return tokenizeKnowledgeText(text, 48);
  }

  function extractKnowledgePhrases(text) {
    const normalized = stripKnowledgeDiacritics(text)
      .replace(/['’]/g, ' ')
      .replace(/[^a-z0-9\s-]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (!normalized) return [];
    const words = normalized.split(' ').filter(Boolean);
    const phrases = [];
    for (let size = 4; size >= 2; size -= 1) {
      for (let index = 0; index <= words.length - size; index += 1) {
        const phrase = words.slice(index, index + size).join(' ');
        const meaningfulTerms = tokenizeKnowledgeText(phrase, 8);
        if (meaningfulTerms.length >= Math.min(2, size)) phrases.push(phrase);
        if (phrases.length >= 12) return [...new Set(phrases)];
      }
    }
    return [...new Set(phrases)];
  }

  function countKnowledgeOccurrences(haystack, needle) {
    if (!haystack || !needle) return 0;
    let count = 0;
    let position = haystack.indexOf(needle);
    while (position !== -1 && count < 12) {
      count += 1;
      position = haystack.indexOf(needle, position + needle.length);
    }
    return count;
  }

  function scoreKnowledgeChunk(query, chunk, doc, ragMeta) {
    if (!query.terms.length) return null;
    const normalizedChunk = stripKnowledgeDiacritics(chunk).replace(/['’]/g, ' ');
    const normalizedDocName = stripKnowledgeDiacritics(doc?.name || '').replace(/['’]/g, ' ');
    const normalizedLocator = stripKnowledgeDiacritics(ragMeta?.locator || '');
    const topTermCounts = new Map((ragMeta?.topTerms || []).map((item) => [item.term, Number(item.count) || 1]));
    const matchedTerms = [];
    let score = 0;

    query.uniqueTerms.forEach((term) => {
      const indexedCount = topTermCounts.get(term) || 0;
      const chunkOccurrences = indexedCount || countKnowledgeOccurrences(normalizedChunk, term);
      const nameOccurrences = countKnowledgeOccurrences(normalizedDocName, term);
      const locatorOccurrences = countKnowledgeOccurrences(normalizedLocator, term);
      if (chunkOccurrences || nameOccurrences || locatorOccurrences) {
        matchedTerms.push(term);
        score += Math.min(chunkOccurrences, 8) * 2.2;
        score += Math.min(nameOccurrences, 3) * 3.5;
        score += Math.min(locatorOccurrences, 2) * 2.5;
      }
    });

    query.phrases.forEach((phrase) => {
      const phraseHits = countKnowledgeOccurrences(`${normalizedDocName}\n${normalizedLocator}\n${normalizedChunk}`, phrase);
      if (phraseHits) score += Math.min(phraseHits, 3) * (phrase.split(' ').length + 2);
    });

    if (!matchedTerms.length && score <= 0) return null;
    const coverage = matchedTerms.length / Math.max(1, query.uniqueTerms.length);
    const density = score / Math.max(1, Math.log((ragMeta?.termCount || 1) + 8));
    return {
      score: Number((density + coverage * 10).toFixed(3)),
      matchedTerms
    };
  }

  function retrieveKnowledgeContext(userText) {
    const activeProject = getActiveProject();
    const scope = activeProject?.ragScope || 'project';
    const scopedProjectIds = new Set([activeProject?.id || defaultProjectId, ...(activeProject?.ragProjectIds || [])]);
    const docs = (knowledgeLibrary.documents || []).filter((doc) => {
      if (scope === 'library') return true;
      if (scope === 'multi_project') return scopedProjectIds.has(getDocumentProjectId(doc));
      return getDocumentProjectId(doc) === (activeProject?.id || defaultProjectId);
    });
    const terms = normalizeKnowledgeTerms(userText);
    if (!docs.length || !terms.length) return { selected: [], query: { terms: [], uniqueTerms: [], phrases: [] } };
    const query = {
      terms,
      uniqueTerms: [...new Set(terms)].slice(0, 36),
      phrases: extractKnowledgePhrases(userText)
    };
    const candidates = [];
    docs.forEach((doc) => {
      const chunks = getKnowledgeDocChunks(doc);
      const ragIndex = normalizeKnowledgeRagIndex(doc.ragIndex, chunks, doc);
      if (!Array.isArray(doc.ragIndex) || doc.ragIndex.length !== ragIndex.length) doc.ragIndex = ragIndex;
      chunks.forEach((chunk, chunkIndex) => {
        const ragMeta = ragIndex[chunkIndex] || {};
        const result = scoreKnowledgeChunk(query, chunk, doc, ragMeta);
        if (!result) return;
        candidates.push({
          doc,
          chunk,
          chunkIndex,
          locator: ragMeta.locator || extractKnowledgeChunkLocator(chunk, doc.kind || doc.type, chunkIndex),
          score: result.score,
          matchedTerms: result.matchedTerms
        });
      });
    });
    const selected = candidates
      .sort((a, b) => b.score - a.score || a.doc.name.localeCompare(b.doc.name) || a.chunkIndex - b.chunkIndex)
      .slice(0, maxRetrievedKnowledgeChunks);
    return { selected, query };
  }

  function buildKnowledgeContextForPrompt(userText) {
    const { selected, query } = retrieveKnowledgeContext(userText);
    if (!selected.length) return '';
    const activeProject = getActiveProject();
    const scopeLabel = activeProject?.ragScope === 'library'
      ? 'library'
      : activeProject?.ragScope === 'multi_project'
        ? 'multi_project'
        : 'current_project';
    const intro = currentLanguage === 'en'
      ? [
        'Local document context available from the browser library.',
        `RAG scope: ${scopeLabel}. Active project: ${activeProject?.name || 'SAFE'}.`,
        `Query terms: ${query.uniqueTerms.slice(0, 18).join(', ')}`
      ].join('\n')
      : [
        'Contexte documentaire disponible depuis la bibliothèque locale du navigateur.',
        `Scope RAG : ${scopeLabel}. Projet actif : ${activeProject?.name || 'SAFE'}.`,
        `Termes de requête : ${query.uniqueTerms.slice(0, 18).join(', ')}`
      ].join('\n');
    return [
      intro,
      ...selected.map((item, index) => [
        `\n[D${index + 1}]`,
        `Document: ${item.doc.name}`,
        `Type: ${item.doc.type}`,
        `Localisation: ${item.locator}`,
        currentLanguage === 'en' ? 'Excerpt:' : 'Extrait :',
        item.chunk
      ].join('\n'))
    ].join('\n\n');
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
    if (sessionLabel) sessionLabel.textContent = currentLanguage === 'en' ? 'Recent discussions' : 'Discussions recentes';
    if (sessionSearchInput) {
      sessionSearchInput.placeholder = i18n.searchConversations;
      sessionSearchInput.setAttribute('aria-label', i18n.searchConversations);
    }
    if (sessionSelect) sessionSelect.setAttribute('aria-label', i18n.historyLabel);
    if (sessionList) sessionList.setAttribute('aria-label', i18n.historyLabel);
    if (historyPanel) historyPanel.setAttribute('aria-label', i18n.historyLabel);
    if (historyToggleButton) {
      historyToggleButton.title = i18n.historyToggle;
      historyToggleButton.setAttribute('aria-label', i18n.historyToggle);
    }
    if (sessionNewButton) {
      sessionNewButton.title = i18n.newChat;
      sessionNewButton.setAttribute('aria-label', i18n.newChat);
      const label = sessionNewButton.querySelector('span');
      if (label) label.textContent = i18n.newChat;
    }
    if (sessionLibraryButton) {
      sessionLibraryButton.title = i18n.library;
      sessionLibraryButton.setAttribute('aria-label', i18n.library);
      const label = sessionLibraryButton.querySelector('span');
      if (label) label.textContent = i18n.library;
    }
    if (libraryView) libraryView.setAttribute('aria-label', i18n.library);
    if (libraryViewTitle) libraryViewTitle.textContent = i18n.libraryMediaTitle;
    if (libraryImportButton) {
      const label = libraryImportButton.querySelector('span');
      if (label) label.textContent = i18n.libraryImportAction;
    }
    if (libraryLayoutGridButton) libraryLayoutGridButton.textContent = i18n.libraryLayoutGrid;
    if (libraryLayoutListButton) libraryLayoutListButton.textContent = i18n.libraryLayoutList;
    if (libraryEmpty) libraryEmpty.textContent = i18n.libraryEmptyView;
    if (libraryClearButton) {
      libraryClearButton.title = i18n.libraryClearTitle;
      libraryClearButton.setAttribute('aria-label', i18n.libraryClearTitle);
      libraryClearButton.textContent = i18n.libraryClear;
    }
    if (libraryMenuShareButton) {
      const label = libraryMenuShareButton.querySelector('span:last-child');
      if (label) label.textContent = i18n.libraryShare;
    }
    if (libraryMenuChatButton) {
      const label = libraryMenuChatButton.querySelector('span:last-child');
      if (label) label.textContent = i18n.libraryShowInChat;
    }
    if (libraryMenuDeleteButton) {
      const label = libraryMenuDeleteButton.querySelector('span:last-child');
      if (label) label.textContent = i18n.libraryDelete;
    }
    if (mediaPreviewCopyButton) mediaPreviewCopyButton.textContent = i18n.libraryCopy;
    if (mediaPreviewShareButton) mediaPreviewShareButton.textContent = i18n.libraryShare;
    if (mediaPreviewDownloadButton) mediaPreviewDownloadButton.textContent = i18n.libraryDownload;
    if (mediaPreviewCloseButton) mediaPreviewCloseButton.setAttribute('aria-label', i18n.libraryPreviewClose);
    if (sidebarResizeHandle) {
      sidebarResizeHandle.title = i18n.resizeSidebar;
      sidebarResizeHandle.setAttribute('aria-label', i18n.resizeSidebar);
    }
    if (sessionMenuRenameButton) {
      const label = sessionMenuRenameButton.querySelector('span');
      if (label) label.textContent = i18n.renameDiscussion;
    }
    if (sessionMenuExportButton) {
      const label = sessionMenuExportButton.querySelector('span');
      if (label) label.textContent = i18n.exportDiscussion;
    }
    if (sessionMenuDeleteButton) {
      const label = sessionMenuDeleteButton.querySelector('span');
      if (label) label.textContent = i18n.deleteDiscussion;
    }
    if (sessionExportButton) { sessionExportButton.title = i18n.exportChat; sessionExportButton.setAttribute('aria-label', i18n.exportChat); }
    if (sessionDeleteButton) { sessionDeleteButton.title = i18n.deleteChat; sessionDeleteButton.setAttribute('aria-label', i18n.deleteChat); }
    if (stopButton) { stopButton.title = i18n.stopRequest; stopButton.setAttribute('aria-label', i18n.stopRequest); stopButton.lastChild.textContent = i18n.stop; }
    if (assistantSendButton) assistantSendButton.textContent = i18n.send;
    if (voiceSelect) { voiceSelect.title = i18n.voiceSelectLabel; voiceSelect.setAttribute('aria-label', i18n.voiceSelectLabel); }
    refreshBubbleActionLabels();
    if (syncDefaultSessionTitles()) saveSessionsState();
    renderSessionOptions();
    renderKnowledgeLibrary();
    setMicState(isListening);
    setTtsState(isVoiceOutputEnabled);
    if (speechRecognition) speechRecognition.lang = currentLanguage === 'en' ? 'en-US' : 'fr-FR';
    populateVoiceSelect(currentLanguage);
    renderCurrentConversation();
  }

  function buildSessionId() { return `s_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`; }

  function makeDefaultSession() {
    return { id: buildSessionId(), projectId: projectsState.activeProjectId || defaultProjectId, title: i18n.sessionDefault, customTitle: false, summary: '', createdAt: Date.now(), updatedAt: Date.now(), history: [] };
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
          projectId: getProjectById(s?.projectId)?.id || defaultProjectId,
          title: isDefaultSessionTitle(title) ? i18n.sessionDefault : title,
          customTitle: Boolean(s?.customTitle && !isDefaultSessionTitle(title)),
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
          projectId: getProjectById(session.projectId)?.id || defaultProjectId,
          title: typeof session.title === 'string' ? session.title.slice(0, 120) : i18n.sessionDefault,
          customTitle: Boolean(session.customTitle && !isDefaultSessionTitle(session.title)),
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
            projectId: getProjectById(session.projectId)?.id || defaultProjectId,
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
    if (sessionSelect) sessionSelect.innerHTML = '';
    if (sessionList) sessionList.innerHTML = '';
    const sorted = [...sessionsState.sessions].sort((a, b) => b.updatedAt - a.updatedAt);
    if (recentCount) recentCount.textContent = `(${sorted.length})`;
    const searchTerm = sessionSearchInput?.value?.trim().toLowerCase() || '';
    const filtered = sorted.filter((session) => {
      if (!searchTerm) return true;
      const title = getSessionDisplayTitle(session).toLowerCase();
      const summary = normalizeSessionSummary(session.summary).toLowerCase();
      return title.includes(searchTerm) || summary.includes(searchTerm);
    });
    for (const session of sorted) {
      if (sessionSelect) {
        const option = document.createElement('option');
        option.value = session.id;
        option.textContent = getSessionDisplayTitle(session);
        sessionSelect.appendChild(option);
      }
    }
    if (sessionSelect && sessionsState.activeSessionId) sessionSelect.value = sessionsState.activeSessionId;
    if (!sessionList) return;
    if (!filtered.length) {
      const empty = document.createElement('p');
      empty.className = 'ai-assistant-session-empty';
      empty.textContent = i18n.noMatchingDiscussions;
      sessionList.appendChild(empty);
      return;
    }
    for (const session of filtered) {
      const button = document.createElement('button');
      const title = getSessionDisplayTitle(session);
      button.type = 'button';
      button.className = 'ai-assistant-session-item';
      button.dataset.sessionId = session.id;
      button.setAttribute('role', 'option');
      button.setAttribute('aria-selected', String(session.id === sessionsState.activeSessionId));
      button.title = title;
      if (session.id === sessionsState.activeSessionId) button.classList.add('is-active');

      const titleNode = document.createElement('span');
      titleNode.className = 'ai-assistant-session-item-title';
      titleNode.textContent = title;
      button.appendChild(titleNode);

      const metaNode = document.createElement('span');
      metaNode.className = 'ai-assistant-session-item-meta';
      const messageCount = normalizeHistory(session.history).length;
      const date = new Date(session.updatedAt || Date.now());
      const dateLabel = Number.isNaN(date.getTime())
        ? ''
        : date.toLocaleDateString(currentLanguage === 'en' ? 'en-US' : 'fr-FR', { month: 'short', day: 'numeric' });
      metaNode.textContent = [dateLabel, messageCount ? `${messageCount} msg` : ''].filter(Boolean).join(' · ');
      button.appendChild(metaNode);

      sessionList.appendChild(button);
    }
    renderProjectList();
    applySidebarSectionState();
  }

  function renderProjectList() {
    if (!projectList) return;
    projectList.innerHTML = '';
    if (projectCount) projectCount.textContent = `(${(projectsState.projects || []).length})`;
    (projectsState.projects || []).forEach((project) => {
      const stats = getProjectStats(project.id);
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'ai-assistant-project-item';
      button.dataset.projectId = project.id;
      button.classList.toggle('is-active', project.id === projectsState.activeProjectId && panel?.classList.contains('is-project-view'));
      button.style.setProperty('--project-color', project.color);
      button.title = project.name;

      const icon = document.createElement('span');
      icon.className = 'ai-assistant-project-item-icon';
      icon.textContent = project.icon || project.name.charAt(0);

      const body = document.createElement('span');
      body.className = 'ai-assistant-project-item-body';
      const name = document.createElement('strong');
      name.textContent = project.name;
      const meta = document.createElement('span');
      meta.textContent = `${stats.conversations} conversation${stats.conversations > 1 ? 's' : ''} • ${stats.documents} document${stats.documents > 1 ? 's' : ''}`;
      body.append(name, meta);
      button.append(icon, body);
      projectList.appendChild(button);
    });
    applySidebarSectionState();
  }

  function renderProjectWorkspace() {
    const project = getActiveProject();
    if (!project || !projectContent) return;
    const stats = getProjectStats(project.id);
    if (projectIcon) {
      projectIcon.textContent = project.icon || project.name.charAt(0);
      projectIcon.style.setProperty('--project-color', project.color);
    }
    if (projectTitle) projectTitle.textContent = project.name;
    if (projectDescription) projectDescription.textContent = project.description || 'Projet Digital Blue Skye AI.';
    if (projectStats) {
      projectStats.innerHTML = '';
      [
        ['Conversations', stats.conversations],
        ['Documents', stats.documents],
        ['Chunks', stats.chunks],
        ['Taille indexee', fileSizeFromChars(stats.indexedSize)],
        ['Derniere activite', stats.lastActivity ? formatProjectDate(stats.lastActivity) : '-']
      ].forEach(([label, value]) => {
        const item = document.createElement('div');
        item.className = 'ai-assistant-project-stat';
        item.innerHTML = `<span>${escapeHtml(label)}</span><strong>${escapeHtml(String(value))}</strong>`;
        projectStats.appendChild(item);
      });
    }
    if (projectTabs) {
      projectTabs.querySelectorAll('button').forEach((button) => {
        button.classList.toggle('is-active', button.dataset.projectTab === activeProjectTab);
      });
    }
    projectContent.innerHTML = '';
    if (activeProjectTab === 'conversations') renderProjectConversations(project, projectContent);
    else if (activeProjectTab === 'documents') renderProjectDocuments(project, projectContent);
    else if (activeProjectTab === 'memory') renderProjectMemory(project, projectContent);
    else if (activeProjectTab === 'rag') renderProjectRag(project, projectContent);
    else if (activeProjectTab === 'stats') renderProjectStatsDetail(project, stats, projectContent);
    else renderProjectSettings(project, projectContent);
    renderProjectList();
  }

  function appendEmptyProjectState(container, text) {
    const empty = document.createElement('p');
    empty.className = 'ai-assistant-project-empty';
    empty.textContent = text;
    container.appendChild(empty);
  }

  function renderProjectConversations(project, container) {
    const sessions = (sessionsState.sessions || [])
      .filter((session) => getSessionProjectId(session) === project.id)
      .sort((a, b) => b.updatedAt - a.updatedAt);
    if (!sessions.length) { appendEmptyProjectState(container, 'Aucune conversation rattachee a ce projet.'); return; }
    const list = document.createElement('div');
    list.className = 'ai-assistant-project-list';
    sessions.forEach((session) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'ai-assistant-project-row';
      button.dataset.sessionId = session.id;
      button.innerHTML = `<strong>${escapeHtml(getSessionDisplayTitle(session))}</strong><span>${normalizeHistory(session.history).length} messages · ${escapeHtml(formatProjectDate(session.updatedAt))}</span>`;
      list.appendChild(button);
    });
    container.appendChild(list);
  }

  function renderProjectDocuments(project, container) {
    const docs = (knowledgeLibrary.documents || [])
      .filter((doc) => getDocumentProjectId(doc) === project.id)
      .sort((a, b) => b.importedAt - a.importedAt);
    if (!docs.length) { appendEmptyProjectState(container, 'Aucun document indexe dans ce projet.'); return; }
    const list = document.createElement('div');
    list.className = 'ai-assistant-project-list';
    docs.forEach((doc) => {
      const row = document.createElement('div');
      row.className = 'ai-assistant-project-row';
      row.innerHTML = `<strong>${escapeHtml(doc.name)}</strong><span>${escapeHtml(doc.type)} · ${getKnowledgeDocChunks(doc).length} chunks · ${escapeHtml(fileSizeLabel(doc.size))}</span>`;
      list.appendChild(row);
    });
    container.appendChild(list);
  }

  function renderProjectMemory(project, container) {
    const textarea = document.createElement('textarea');
    textarea.className = 'ai-assistant-project-memory';
    textarea.value = project.memory || '';
    textarea.placeholder = 'Memoire persistante du projet : objectifs, preferences, contexte durable.';
    textarea.rows = 7;
    textarea.addEventListener('change', () => {
      project.memory = textarea.value.slice(0, 2500);
      project.updatedAt = Date.now();
      saveProjectsState();
      renderProjectWorkspace();
    });
    container.appendChild(textarea);
  }

  function renderProjectRag(project, container) {
    const stats = getProjectStats(project.id);
    const block = document.createElement('div');
    block.className = 'ai-assistant-project-rag';
    block.innerHTML = `
      <div><span>Scope actif</span><strong>${project.ragScope === 'library' ? 'Toute la bibliotheque' : project.ragScope === 'multi_project' ? 'Plusieurs projets' : 'Projet courant'}</strong></div>
      <div><span>Index vectoriel</span><strong>Prepare</strong></div>
      <div><span>Embeddings</span><strong>Prepare</strong></div>
      <div><span>Citations</span><strong>${stats.chunks} chunks citables</strong></div>`;
    container.appendChild(block);
  }

  function renderProjectStatsDetail(project, stats, container) {
    const block = document.createElement('div');
    block.className = 'ai-assistant-project-rag';
    block.innerHTML = `
      <div><span>Conversations</span><strong>${stats.conversations}</strong></div>
      <div><span>Documents</span><strong>${stats.documents}</strong></div>
      <div><span>Chunks indexes</span><strong>${stats.chunks}</strong></div>
      <div><span>Taille indexee</span><strong>${fileSizeFromChars(stats.indexedSize)}</strong></div>`;
    container.appendChild(block);
  }

  function renderProjectSettings(project, container) {
    const form = document.createElement('div');
    form.className = 'ai-assistant-project-settings';
    form.innerHTML = `
      <label>Nom<input data-field="name" value="${escapeHtml(project.name)}"></label>
      <label>Description<textarea data-field="description" rows="3">${escapeHtml(project.description || '')}</textarea></label>
      <label>Icone<input data-field="icon" value="${escapeHtml(project.icon || '')}" maxlength="2"></label>
      <label>Couleur<input data-field="color" value="${escapeHtml(project.color)}" type="color"></label>
      <label>Scope RAG<select data-field="ragScope">
        <option value="project">Projet courant</option>
        <option value="multi_project">Plusieurs projets</option>
        <option value="library">Toute la bibliotheque</option>
      </select></label>`;
    const scope = form.querySelector('[data-field="ragScope"]');
    if (scope) scope.value = project.ragScope || 'project';
    form.addEventListener('change', (event) => {
      const field = event.target?.dataset?.field;
      if (!field) return;
      project[field] = field === 'icon'
        ? String(event.target.value || '').slice(0, 2).toUpperCase()
        : String(event.target.value || '').slice(0, field === 'description' ? 220 : 120);
      project.updatedAt = Date.now();
      saveProjectsState();
      renderProjectWorkspace();
    });
    container.appendChild(form);
    const multi = document.createElement('div');
    multi.className = 'ai-assistant-project-settings';
    const title = document.createElement('strong');
    title.textContent = 'Projets inclus en RAG multi-projets';
    multi.appendChild(title);
    (projectsState.projects || []).filter((item) => item.id !== project.id).forEach((item) => {
      const label = document.createElement('label');
      label.className = 'ai-assistant-project-check';
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.dataset.ragProjectId = item.id;
      checkbox.checked = (project.ragProjectIds || []).includes(item.id);
      const span = document.createElement('span');
      span.textContent = item.name;
      label.append(checkbox, span);
      multi.appendChild(label);
    });
    multi.addEventListener('change', (event) => {
      const projectId = event.target?.dataset?.ragProjectId;
      if (!projectId) return;
      const selected = new Set(project.ragProjectIds || []);
      if (event.target.checked) selected.add(projectId);
      else selected.delete(projectId);
      project.ragProjectIds = Array.from(selected);
      project.updatedAt = Date.now();
      saveProjectsState();
    });
    container.appendChild(multi);
  }

  function renderSettingsView() {
    if (!settingsSections) return;
    const sections = [
      ['Profil', [['Nom', 'profile.name'], ['Email', 'profile.email'], ['Avatar', 'profile.avatar'], ['Langue', 'profile.language'], ['Fuseau horaire', 'profile.timezone']]],
      ['IA', [['Modele par defaut', 'ai.defaultModel'], ['Fournisseur prefere', 'ai.preferredProvider'], ['Fallback automatique', 'ai.automaticFallback']]],
      ['Recherche Web', [['Tavily active', 'web.tavilyEnabled'], ['Mode economique', 'web.economyMode'], ['Mode expert', 'web.expertMode'], ['Limite de resultats', 'web.maxResults']]],
      ['Documents', [['Taille maximale (Mo)', 'documents.maxSizeMb'], ['Chunking', 'documents.chunking'], ['Indexation automatique', 'documents.automaticIndexing'], ['RAG automatique', 'documents.automaticRag']]],
      ['Apparence', [['Theme', 'appearance.theme']]],
      ['Donnees', [['Export conversations', 'data.lastExportAt'], ['Export projets', 'data.lastProjectExportAt'], ['Sauvegarde', 'data.lastBackupAt'], ['Restauration', 'data.lastRestoreAt']]]
    ];
    settingsSections.innerHTML = '';
    sections.forEach(([title, fields]) => {
      const section = document.createElement('section');
      section.className = 'ai-assistant-settings-section';
      const heading = document.createElement('h4');
      heading.textContent = title;
      section.appendChild(heading);
      fields.forEach(([label, path]) => {
        const [group, key] = path.split('.');
        const value = assistantSettingsState[group]?.[key];
        const field = document.createElement('label');
        const isBoolean = typeof value === 'boolean';
        field.innerHTML = `<span>${escapeHtml(label)}</span><input data-settings-path="${escapeHtml(path)}" ${isBoolean ? 'type="checkbox"' : 'type="text"'}>`;
        const inputNode = field.querySelector('input');
        if (isBoolean) inputNode.checked = Boolean(value);
        else inputNode.value = value || '';
        section.appendChild(field);
      });
      settingsSections.appendChild(section);
    });
  }

  function renderCurrentConversation() {
    if (!messagesContainer) return;
    messagesContainer.innerHTML = '';
    const active = getActiveSession();
    chatHistory = active?.history ? [...active.history] : [];
    if (!chatHistory.length) { addMessage('bot', i18n.greeting); return; }
    for (const msg of chatHistory) addMessage(msg.role === 'assistant' ? 'bot' : 'user', msg.content);
  }

  function closeLibraryCardMenu() {
    if (!libraryCardMenu) return;
    libraryCardMenu.classList.remove('is-open');
    libraryCardMenu.setAttribute('aria-hidden', 'true');
    activeLibraryMenuDocId = '';
  }

  function openLibraryCardMenu(event, docId) {
    if (!libraryCardMenu || !docId) return;
    event.preventDefault();
    activeLibraryMenuDocId = docId;
    libraryCardMenu.classList.add('is-open');
    libraryCardMenu.setAttribute('aria-hidden', 'false');
    const rect = libraryView?.getBoundingClientRect();
    const left = rect ? event.clientX - rect.left : event.clientX;
    const top = rect ? event.clientY - rect.top : event.clientY;
    libraryCardMenu.style.left = `${Math.max(14, Math.min(left, (rect?.width || 360) - 190))}px`;
    libraryCardMenu.style.top = `${Math.max(14, top)}px`;
  }

  function closeMediaPreview() {
    if (!mediaPreview) return;
    mediaPreview.hidden = true;
    mediaPreview.setAttribute('aria-hidden', 'true');
    activePreviewDocId = '';
    if (mediaPreviewBody) mediaPreviewBody.innerHTML = '';
  }

  function setLibraryViewOpen(open) {
    setWorkspaceView(open ? 'library' : 'chat');
    if (open) {
      closeAttachMenu();
      closeSessionContextMenu();
    }
  }

  function persistActiveConversation() {
    const active = getActiveSession();
    if (!active) return;
    active.history = normalizeHistory(chatHistory);
    active.updatedAt = Date.now();
    if (!active.customTitle) active.title = titleFromHistory(active.history);
    active.summary = buildConversationSummary(active.history);
    saveSessionsState();
    renderSessionOptions();
  }

  function renameSessionById(sessionId) {
    const session = getSessionById(sessionId);
    if (!session) return;
    const currentTitle = getSessionDisplayTitle(session);
    const nextTitle = window.prompt(i18n.renameDiscussionPrompt, currentTitle);
    if (nextTitle === null) return;
    const cleanTitle = nextTitle.replace(/\s+/g, ' ').trim().slice(0, 120);
    if (!cleanTitle) return;
    session.title = cleanTitle;
    session.customTitle = true;
    session.updatedAt = Date.now();
    saveSessionsState();
    renderSessionOptions();
  }

  function switchSession(sessionId) {
    if (!sessionsState.sessions.some((s) => s.id === sessionId)) return;
    setLibraryViewOpen(false);
    sessionsState.activeSessionId = sessionId;
    const session = getSessionById(sessionId);
    if (session?.projectId && getProjectById(session.projectId)) {
      projectsState.activeProjectId = session.projectId;
      saveProjectsState();
    }
    saveSessionsState();
    renderSessionOptions();
    renderCurrentConversation();
  }

  function createNewSession() {
    setLibraryViewOpen(false);
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

  function exportConversationById(sessionId = sessionsState.activeSessionId) {
    const session = getSessionById(sessionId);
    const history = normalizeHistory(session?.history || []);
    if (!session || !history.length) {
      addMessage('bot', i18n.exportChatEmpty);
      return;
    }
    session.history = history;
    session.summary = buildConversationSummary(session.history);
    saveSessionsState();
    const baseName = slugifyDocumentTitle(`digital-blue-skye-ai-${getSessionDisplayTitle(session)}`);
    downloadBlob(new Blob([buildConversationMarkdown(session)], { type: 'text/markdown;charset=utf-8' }), `${baseName}.md`);
  }

  function exportActiveConversation() {
    exportConversationById(sessionsState.activeSessionId);
  }

  function deleteSessionById(sessionId = sessionsState.activeSessionId) {
    if (!sessionsState.sessions.length) return;
    const wasActive = sessionId === sessionsState.activeSessionId;
    sessionsState.sessions = sessionsState.sessions.filter((s) => s.id !== sessionId);
    if (!sessionsState.sessions.length) {
      const fallback = makeDefaultSession();
      sessionsState.sessions = [fallback];
      sessionsState.activeSessionId = fallback.id;
    } else if (wasActive || !getSessionById(sessionsState.activeSessionId)) {
      sessionsState.activeSessionId = sessionsState.sessions[0].id;
    }
    saveSessionsState();
    renderSessionOptions();
    if (wasActive) renderCurrentConversation();
  }

  function deleteActiveSession() {
    deleteSessionById(sessionsState.activeSessionId);
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

  function ensureAssistantFileInput() {
    if (fileInput && document.contains(fileInput)) {
      const target = panel || document.body;
      if (target && fileInput.parentElement !== target) target.appendChild(fileInput);
      return fileInput;
    }
    fileInput = document.getElementById('ai-assistant-file-input');
    if (fileInput) {
      const target = panel || document.body;
      if (target && fileInput.parentElement !== target) target.appendChild(fileInput);
      return fileInput;
    }
    fileInput = document.createElement('input');
    fileInput.id = 'ai-assistant-file-input';
    fileInput.type = 'file';
    fileInput.multiple = true;
    fileInput.className = 'ai-assistant-file-input';
    (panel || document.body).appendChild(fileInput);
    return fileInput;
  }

  function openAssistantFilePicker(libraryMode = false) {
    const inputEl = ensureAssistantFileInput();
    if (!inputEl) return;
    isLibraryImportMode = Boolean(libraryMode);
    inputEl.value = '';
    assistantLog('debug', 'file_picker_open', { libraryMode: isLibraryImportMode });
    inputEl.click();
  }

  function openLibraryFilePicker() {
    const inputEl = document.createElement('input');
    inputEl.type = 'file';
    inputEl.multiple = true;
    inputEl.className = 'ai-assistant-file-input';
    inputEl.setAttribute('aria-hidden', 'true');
    inputEl.addEventListener('change', async () => {
      const files = Array.from(inputEl.files || []);
      assistantLog('debug', 'library_transient_file_picker_change', {
        fileCount: files.length,
        fileNames: files.map((file) => file.name)
      });
      try {
        if (files.length) {
          await importFilesToKnowledgeLibrary(files);
          setLibraryViewOpen(true);
        }
      } finally {
        inputEl.remove();
      }
    }, { once: true });
    (panel || document.body).appendChild(inputEl);
    assistantLog('debug', 'library_transient_file_picker_open', {});
    inputEl.click();
    window.setTimeout(() => {
      if (document.contains(inputEl) && !(inputEl.files || []).length) inputEl.remove();
    }, 60000);
  }

  if (sessionSelect) sessionSelect.addEventListener('change', () => switchSession(sessionSelect.value));
  if (sessionNewButton) sessionNewButton.addEventListener('click', () => createNewSession());
  if (sessionExportButton) sessionExportButton.addEventListener('click', () => exportActiveConversation());
  if (sessionDeleteButton) sessionDeleteButton.addEventListener('click', () => deleteActiveSession());
  if (sessionSearchInput) sessionSearchInput.addEventListener('input', () => renderSessionOptions());
  if (projectsToggleButton) {
    projectsToggleButton.addEventListener('click', () => {
      setSidebarSectionCollapsed('projects', !areProjectsCollapsed);
    });
  }
  if (recentToggleButton) {
    recentToggleButton.addEventListener('click', () => {
      setSidebarSectionCollapsed('recent', !areRecentChatsCollapsed);
    });
  }
  if (sessionList) {
    sessionList.addEventListener('click', (event) => {
      closeSessionContextMenu();
      const item = event.target?.closest?.('.ai-assistant-session-item');
      if (!item?.dataset?.sessionId) return;
      switchSession(item.dataset.sessionId);
    });
    sessionList.addEventListener('contextmenu', (event) => {
      const item = event.target?.closest?.('.ai-assistant-session-item');
      if (!item?.dataset?.sessionId) return;
      openSessionContextMenu(event, item.dataset.sessionId);
    });
    sessionList.addEventListener('dblclick', (event) => {
      const item = event.target?.closest?.('.ai-assistant-session-item');
      if (!item?.dataset?.sessionId) return;
      renameSessionById(item.dataset.sessionId);
    });
  }
  if (sessionLibraryButton) {
    sessionLibraryButton.addEventListener('click', () => {
      activeLibraryStatus = '';
      setHistoryPanelOpen(true);
      setLibraryViewOpen(true);
    });
  }
  if (projectCreateButton) {
    projectCreateButton.addEventListener('click', () => {
      const name = window.prompt('Nom du projet');
      if (name === null) return;
      const cleanName = name.replace(/\s+/g, ' ').trim().slice(0, 80);
      if (!cleanName) return;
      const project = normalizeProject({
        id: buildProjectId(cleanName),
        name: cleanName,
        description: '',
        icon: cleanName.charAt(0).toUpperCase(),
        color: '#79e6ff',
        createdAt: Date.now(),
        updatedAt: Date.now()
      });
      projectsState.projects.unshift(project);
      projectsState.activeProjectId = project.id;
      saveProjectsState();
      setHistoryPanelOpen(true);
      setWorkspaceView('project');
      renderProjectList();
    });
  }
  if (projectList) {
    projectList.addEventListener('click', (event) => {
      const item = event.target?.closest?.('.ai-assistant-project-item');
      if (!item?.dataset?.projectId || !getProjectById(item.dataset.projectId)) return;
      openProject(item.dataset.projectId);
    });
    projectList.addEventListener('contextmenu', (event) => {
      const item = event.target?.closest?.('.ai-assistant-project-item');
      if (!item?.dataset?.projectId) return;
      openProjectContextMenu(event, item.dataset.projectId);
    });
  }
  if (projectTabs) {
    projectTabs.addEventListener('click', (event) => {
      const tab = event.target?.closest?.('[data-project-tab]')?.dataset?.projectTab;
      if (!tab) return;
      activeProjectTab = tab;
      renderProjectWorkspace();
    });
  }
  if (projectContent) {
    projectContent.addEventListener('click', (event) => {
      const row = event.target?.closest?.('[data-session-id]');
      if (!row?.dataset?.sessionId) return;
      switchSession(row.dataset.sessionId);
    });
  }
  if (settingsOpenButton) {
    settingsOpenButton.addEventListener('click', () => {
      setHistoryPanelOpen(true);
      setWorkspaceView('settings');
    });
  }
  if (settingsSections) {
    settingsSections.addEventListener('change', (event) => {
      const path = event.target?.dataset?.settingsPath;
      if (!path) return;
      const [group, key] = path.split('.');
      if (!assistantSettingsState[group]) assistantSettingsState[group] = {};
      assistantSettingsState[group][key] = event.target.type === 'checkbox' ? Boolean(event.target.checked) : event.target.value;
      saveAssistantSettingsState();
    });
  }
  if (projectContextMenu) {
    projectContextMenu.addEventListener('click', (event) => {
      const exportFormat = event.target?.closest?.('[data-project-export]')?.dataset?.projectExport;
      if (exportFormat) {
        const projectId = activeContextProjectId;
        closeProjectContextMenu();
        handleProjectExportAction(exportFormat, projectId);
        return;
      }
      const action = event.target?.closest?.('[data-project-action]')?.dataset?.projectAction;
      const projectId = activeContextProjectId;
      if (action === 'export-menu') return;
      closeProjectContextMenu();
      handleProjectMenuAction(action, projectId);
    });
  }
  if (projectDeleteCancelButton) projectDeleteCancelButton.addEventListener('click', () => closeProjectDeleteDialog());
  if (projectDeleteConfirmButton) {
    projectDeleteConfirmButton.addEventListener('click', () => {
      if (pendingDeleteProjectId) deleteProjectConfirmed(pendingDeleteProjectId);
    });
  }
  if (projectDeleteDialog) {
    projectDeleteDialog.addEventListener('click', (event) => {
      if (event.target === projectDeleteDialog) closeProjectDeleteDialog();
    });
  }
  if (libraryImportButton) {
    libraryImportButton.addEventListener('click', () => {
      activeLibraryStatus = '';
      openLibraryFilePicker();
    });
  }
  if (libraryLayoutGridButton) libraryLayoutGridButton.addEventListener('click', () => setKnowledgeLibraryLayout('grid'));
  if (libraryLayoutListButton) libraryLayoutListButton.addEventListener('click', () => setKnowledgeLibraryLayout('list'));
  if (libraryClearButton) {
    libraryClearButton.addEventListener('click', async () => {
      knowledgeLibrary = { version: 1, documents: [] };
      activeLibraryStatus = '';
      await clearKnowledgeOriginalFiles();
      saveKnowledgeLibrary();
    });
  }
  if (libraryGrid) {
    libraryGrid.addEventListener('click', (event) => {
      const card = event.target?.closest?.('.ai-assistant-media-card');
      if (!card?.dataset?.docId) return;
      const doc = getKnowledgeDocumentById(card.dataset.docId);
      if (doc) openKnowledgeDocumentPreview(doc);
    });
    libraryGrid.addEventListener('contextmenu', (event) => {
      const card = event.target?.closest?.('.ai-assistant-media-card');
      if (!card?.dataset?.docId) return;
      openLibraryCardMenu(event, card.dataset.docId);
    });
  }
  if (libraryMenuShareButton) {
    libraryMenuShareButton.addEventListener('click', () => {
      const doc = getKnowledgeDocumentById(activeLibraryMenuDocId);
      closeLibraryCardMenu();
      if (doc) shareKnowledgeDocument(doc);
    });
  }
  if (libraryMenuChatButton) {
    libraryMenuChatButton.addEventListener('click', () => {
      const doc = getKnowledgeDocumentById(activeLibraryMenuDocId);
      closeLibraryCardMenu();
      if (doc) showKnowledgeDocumentInChat(doc);
    });
  }
  if (libraryMenuDeleteButton) {
    libraryMenuDeleteButton.addEventListener('click', async () => {
      const docId = activeLibraryMenuDocId;
      closeLibraryCardMenu();
      await deleteKnowledgeDocument(docId);
    });
  }
  if (libraryView) {
    libraryView.addEventListener('click', (event) => {
      if (!libraryCardMenu?.classList.contains('is-open')) return;
      if (libraryCardMenu.contains(event.target)) return;
      closeLibraryCardMenu();
    });
  }
  if (mediaPreviewCloseButton) mediaPreviewCloseButton.addEventListener('click', () => closeMediaPreview());
  if (mediaPreview) {
    mediaPreview.addEventListener('click', (event) => {
      if (event.target === mediaPreview) closeMediaPreview();
    });
  }
  if (mediaPreviewDownloadButton) {
    mediaPreviewDownloadButton.addEventListener('click', () => {
      const doc = getKnowledgeDocumentById(activePreviewDocId);
      if (doc) downloadKnowledgeDocument(doc);
    });
  }
  if (mediaPreviewShareButton) {
    mediaPreviewShareButton.addEventListener('click', () => {
      const doc = getKnowledgeDocumentById(activePreviewDocId);
      if (doc) shareKnowledgeDocument(doc);
    });
  }
  if (mediaPreviewCopyButton) {
    mediaPreviewCopyButton.addEventListener('click', async () => {
      const doc = getKnowledgeDocumentById(activePreviewDocId);
      if (!doc) return;
      const ok = await copyKnowledgeDocument(doc);
      mediaPreviewCopyButton.textContent = ok ? i18n.libraryCopied : i18n.libraryCopyFailed;
      window.setTimeout(() => { mediaPreviewCopyButton.textContent = i18n.libraryCopy; }, 1200);
    });
  }
  if (sessionMenuRenameButton) {
    sessionMenuRenameButton.addEventListener('click', () => {
      const sessionId = activeContextSessionId;
      closeSessionContextMenu();
      if (sessionId) renameSessionById(sessionId);
    });
  }
  if (sessionMenuExportButton) {
    sessionMenuExportButton.addEventListener('click', () => {
      if (activeContextSessionId) exportConversationById(activeContextSessionId);
      closeSessionContextMenu();
    });
  }
  if (sessionMenuDeleteButton) {
    sessionMenuDeleteButton.addEventListener('click', () => {
      if (activeContextSessionId) deleteSessionById(activeContextSessionId);
      closeSessionContextMenu();
    });
  }
  if (sessionContextMenu) {
    document.addEventListener('click', (event) => {
      if (sessionContextMenu.classList.contains('is-open') && !sessionContextMenu.contains(event.target)) closeSessionContextMenu();
      if (projectContextMenu?.classList.contains('is-open') && !projectContextMenu.contains(event.target)) closeProjectContextMenu();
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') closeSessionContextMenu();
      if (event.key === 'Escape') closeProjectContextMenu();
      if (event.key === 'Escape') {
        closeLibraryCardMenu();
        closeMediaPreview();
        closeProjectDeleteDialog();
      }
    });
  }
  if (sidebarResizeHandle && historyPanel) {
    setHistoryPanelWidth(getStoredHistoryPanelWidth(), false);
    sidebarResizeHandle.addEventListener('pointerdown', (event) => {
      if (event.button !== 0) return;
      event.preventDefault();
      isSidebarResizing = true;
      sidebarResizeStartX = event.clientX;
      sidebarResizeStartWidth = historyPanel.getBoundingClientRect().width;
      panel?.classList.add('is-sidebar-resizing');
      document.body.classList.add('ai-assistant-sidebar-is-resizing');
      sidebarResizeHandle.setPointerCapture?.(event.pointerId);
    });
    window.addEventListener('pointermove', (event) => {
      if (!isSidebarResizing) return;
      setHistoryPanelWidth(sidebarResizeStartWidth + (event.clientX - sidebarResizeStartX), false);
    });
    window.addEventListener('pointerup', () => {
      if (!isSidebarResizing) return;
      isSidebarResizing = false;
      panel?.classList.remove('is-sidebar-resizing');
      document.body.classList.remove('ai-assistant-sidebar-is-resizing');
      setHistoryPanelWidth(historyPanel.getBoundingClientRect().width, true);
    });
    sidebarResizeHandle.addEventListener('keydown', (event) => {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      event.preventDefault();
      const delta = event.key === 'ArrowRight' ? 16 : -16;
      setHistoryPanelWidth(historyPanel.getBoundingClientRect().width + delta, true);
    });
  }
  if (historyToggleButton) {
    historyToggleButton.addEventListener('click', () => {
      setHistoryPanelOpen(!panel?.classList.contains('has-history-open'));
    });
    setHistoryPanelOpen(getDefaultHistoryPanelOpen(), false);
  }
  if (stopButton) {
    stopButton.addEventListener('click', () => {
      if (activeAssistantRequestController) activeAssistantRequestController.abort();
    });
    setAssistantRequestRunning(false);
  }
  if (messagesContainer) messagesContainer.addEventListener('scroll', updateScrollBottomButton, { passive: true });
  if (scrollBottomButton) scrollBottomButton.addEventListener('click', () => scrollConversationToBottom('smooth'));

  ensureAssistantFileInput();

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

  if (fileInput) {
    if (attachFileButton) {
      attachFileButton.addEventListener('click', () => {
        closeAttachMenu();
        openAssistantFilePicker(false);
      });
    }

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
      pendingUploadMetadata = result.attachments || [];
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
      assistantLog('debug', 'file_picker_change', {
        fileCount: files.length,
        libraryMode: isLibraryImportMode,
        fileNames: files.map((file) => file.name)
      });
      if (!files.length) return;
      if (isLibraryImportMode) {
        isLibraryImportMode = false;
        await importFilesToKnowledgeLibrary(files);
        setLibraryViewOpen(true);
        fileInput.value = '';
        return;
      }
      await processSelectedFiles(files);
      fileInput.value = '';
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


  function isMarkdownTableLine(line) {
    const trimmed = String(line || '').trim();
    return trimmed.startsWith('|') && (trimmed.match(/\|/g) || []).length >= 2;
  }

  function ensureMarkdownTableBoundary(row) {
    let value = String(row || '').trim();
    if (!value.startsWith('|')) value = `| ${value}`;
    if (!value.endsWith('|')) value = `${value} |`;
    return value;
  }

  function isMarkdownTableSeparator(line) {
    const trimmed = ensureMarkdownTableBoundary(line);
    if (!isMarkdownTableLine(trimmed)) return false;
    const cells = parseMarkdownTableCells(trimmed);
    return cells.length > 0 && cells.every((cell) => /^:?-{3,}:?$/.test(cell));
  }

  function parseMarkdownTableCells(row) {
    const normalized = ensureMarkdownTableBoundary(row);
    return normalized
      .split('|')
      .slice(1, -1)
      .map((cell) => cell.trim());
  }

  function normalizeMarkdownTableBlock(rows) {
    const sourceRows = Array.isArray(rows)
      ? rows.map((row) => ensureMarkdownTableBoundary(row)).filter(isMarkdownTableLine)
      : [];
    if (sourceRows.length < 2) return null;

    const hasSeparator = isMarkdownTableSeparator(sourceRows[1]);
    const dataRows = sourceRows.filter((row, index) => !(index === 1 && hasSeparator));
    if (dataRows.length < 2) return null;

    const parsedRows = dataRows.map(parseMarkdownTableCells);
    const columnCount = parsedRows[0]?.length || 0;
    if (columnCount < 2) return null;

    const trailingParagraphs = [];
    const repairedRows = parsedRows
      .filter((row, index) => index === 0 || row.some((cell) => cell && !/^[-–—]+$/.test(cell)))
      .map((row, index) => {
        if (row.length === columnCount) return row;
        if (row.length > columnCount) {
          const tableCells = row.slice(0, columnCount);
          const overflow = row.slice(columnCount).join(' | ').trim();
          if (index > 0 && overflow && !/^[-–—]+$/.test(overflow)) {
            trailingParagraphs.push(overflow.replace(/^[-–—|\s]+/, '').trim());
          }
          return tableCells;
        }
        return [...row, ...Array(columnCount - row.length).fill('')];
      });

    const validRows = repairedRows.filter((row) => row.length === columnCount);
    return validRows.length >= 2 ? { rows: validRows, trailingParagraphs: trailingParagraphs.filter(Boolean) } : null;
  }

  function normalizeMarkdownTableRows(rows) {
    const block = normalizeMarkdownTableBlock(rows);
    return block ? block.rows : null;
  }

  function repairMarkdownTablesInText(markdown) {
    const lines = String(markdown || '').replace(/\r\n?/g, '\n').split('\n');
    const output = [];
    let tableBuffer = [];
    let inCodeBlock = false;

    function flushTableBuffer() {
      if (!tableBuffer.length) return;
      const block = normalizeMarkdownTableBlock(tableBuffer);
      if (!block) {
        output.push(...tableBuffer);
        tableBuffer = [];
        return;
      }
      const tableLines = block.rows.map((cells, index) => {
        if (index === 1 && cells.every((cell) => /^:?-{3,}:?$/.test(cell))) return null;
        return `| ${cells.join(' | ')} |`;
      }).filter(Boolean);
      if (tableLines.length >= 1) {
        const columnCount = block.rows[0].length;
        output.push(tableLines[0]);
        output.push(`| ${Array(columnCount).fill('---').join(' | ')} |`);
        output.push(...tableLines.slice(1));
      }
      if (block.trailingParagraphs.length) {
        output.push('');
        output.push(...block.trailingParagraphs);
      }
      tableBuffer = [];
    }

    lines.forEach((line) => {
      const trimmed = String(line || '').trim();
      if (/^```/.test(trimmed)) {
        flushTableBuffer();
        inCodeBlock = !inCodeBlock;
        output.push(line);
        return;
      }
      if (!inCodeBlock && isMarkdownTableLine(trimmed)) {
        tableBuffer.push(trimmed);
        return;
      }
      flushTableBuffer();
      output.push(line);
    });
    flushTableBuffer();
    return output.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  }

  function renderInvalidMarkdownTableRowsAsParagraphs(rows, renderCell = (value) => value) {
    return (Array.isArray(rows) ? rows : [])
      .map((row) => parseMarkdownTableCells(row).filter(Boolean).join(' — '))
      .filter(Boolean)
      .map((line) => `<p>${renderCell(line)}</p>`)
      .join('');
  }

  function splitInlineMarkdownTableLines(markdown) {
    return String(markdown || '').replace(/\r\n?/g, '\n').split('\n').flatMap((line) => {
      const raw = String(line || '');
      const trimmed = raw.trim();
      if (!trimmed || isMarkdownTableLine(trimmed)) return [raw];

      const firstPipe = raw.indexOf('|');
      const lastPipe = raw.lastIndexOf('|');
      if (firstPipe <= 0 || lastPipe <= firstPipe) return [raw];

      const possibleTable = raw.slice(firstPipe).trim();
      if (!isMarkdownTableLine(possibleTable)) return [raw];
      if (parseMarkdownTableCells(possibleTable).length < 2) return [raw];

      const prefix = raw.slice(0, firstPipe).trim();
      return prefix ? [prefix, possibleTable] : [possibleTable];
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
        .ai-assistant-message-content .ai-assistant-table-wrap {
          width: 100%;
          max-width: 100%;
          overflow-x: auto;
          overflow-y: visible;
          margin: 14px 0 18px;
          border: 1px solid rgba(158,232,255,0.16);
          border-radius: 14px;
          box-shadow: 0 18px 40px rgba(0,0,0,0.14);
          -webkit-overflow-scrolling: touch;
          overscroll-behavior-x: contain;
          scrollbar-gutter: stable;
          contain: inline-size paint;
          position: relative;
        }
        .ai-assistant-message-content .ai-assistant-table {
          border-collapse: collapse;
          width: 100%;
          min-width: 100%;
          table-layout: fixed;
          font-size: 0.9em;
        }
        .ai-assistant-message-content .ai-assistant-table.ai-assistant-table--cols-5 { min-width: 920px; }
        .ai-assistant-message-content .ai-assistant-table.ai-assistant-table--cols-6 { min-width: 1040px; }
        .ai-assistant-message-content .ai-assistant-table.ai-assistant-table--cols-7 { min-width: 1160px; }
        .ai-assistant-message-content .ai-assistant-table.ai-assistant-table--cols-8,
        .ai-assistant-message-content .ai-assistant-table.ai-assistant-table--cols-9,
        .ai-assistant-message-content .ai-assistant-table.ai-assistant-table--cols-10 { min-width: 1280px; }
        .ai-assistant-message-content .ai-assistant-table th,
        .ai-assistant-message-content .ai-assistant-table td {
          border: 1px solid rgba(255,255,255,0.13);
          padding: 10px 14px;
          text-align: left;
          vertical-align: top;
          line-height: 1.5;
          word-break: normal;
          overflow-wrap: break-word;
          hyphens: manual;
          white-space: normal;
        }
        .ai-assistant-message-content .ai-assistant-table th:first-child,
        .ai-assistant-message-content .ai-assistant-table td:first-child {
          width: clamp(118px, 14vw, 160px);
          min-width: 118px;
          max-width: 180px;
          white-space: normal;
          overflow-wrap: break-word;
          word-break: normal;
          font-weight: 650;
        }
        .ai-assistant-message-content .ai-assistant-table.ai-assistant-table--cols-6 th,
        .ai-assistant-message-content .ai-assistant-table.ai-assistant-table--cols-6 td,
        .ai-assistant-message-content .ai-assistant-table.ai-assistant-table--cols-7 th,
        .ai-assistant-message-content .ai-assistant-table.ai-assistant-table--cols-7 td,
        .ai-assistant-message-content .ai-assistant-table.ai-assistant-table--cols-8 th,
        .ai-assistant-message-content .ai-assistant-table.ai-assistant-table--cols-8 td {
          padding: 9px 12px;
          font-size: 0.88em;
        }
        .ai-assistant-message-content .ai-assistant-table th {
          background: linear-gradient(180deg, rgba(158,232,255,0.15), rgba(185,140,255,0.11));
          color: rgba(247,251,255,0.96);
          font-weight: 700;
          letter-spacing: 0.015em;
        }
        .ai-assistant-message-content .ai-assistant-table td { background: rgba(255,255,255,0.035); }
        .ai-assistant-message-content .ai-assistant-table tr:nth-child(even) td { background: rgba(255,255,255,0.055); }
        .ai-assistant-message-content .ai-assistant-table tr:hover td { background: rgba(158,232,255,0.07); }
        .ai-assistant-message-content .ai-assistant-table-wrap::-webkit-scrollbar { height: 9px; }
        .ai-assistant-message-content .ai-assistant-table-wrap::-webkit-scrollbar-thumb {
          background: rgba(158,232,255,0.35);
          border-radius: 999px;
        }
        @media (max-width: 780px) {
          .ai-assistant-message-content .ai-assistant-table {
            min-width: 760px;
            table-layout: auto;
          }
          .ai-assistant-message-content .ai-assistant-table th:first-child,
          .ai-assistant-message-content .ai-assistant-table td:first-child {
            min-width: 120px;
          }
        }
      `;
      document.head.appendChild(style);
    }

    injectTableStyles();

    const preparedText = splitInlineMarkdownTableLines(normalizeAssistantMarkdown(rawText));
    const withCodeBlocks = preparedText.replace(/```([a-zA-Z0-9+#.-]*)\n([\s\S]*?)```/g, stashCodeBlock);
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
      const block = normalizeMarkdownTableBlock(tableBuffer);
      if (!block) {
        html += renderInvalidMarkdownTableRowsAsParagraphs(tableBuffer, linkifyLine);
        tableBuffer = [];
        return;
      }
      const columnCount = block.rows[0]?.length || 0;
      const columnClass = `ai-assistant-table--cols-${Math.min(Math.max(columnCount, 1), 10)}`;
      const wideClass = columnCount >= 5 ? ' ai-assistant-table--wide' : '';
      html += `<div class="ai-assistant-table-wrap${wideClass}" data-columns="${columnCount}"><table class="ai-assistant-table ${columnClass}">`;
      block.rows.forEach((cells, idx) => {
        const tag = idx === 0 ? 'th' : 'td';
        html += '<tr>' + cells.map((cell) => `<${tag}>${linkifyLine(cell)}</${tag}>`).join('') + '</tr>';
      });
      html += '</table></div>';
      if (block.trailingParagraphs.length) {
        html += block.trailingParagraphs.map((line) => `<p>${linkifyLine(line)}</p>`).join('');
      }
      tableBuffer = [];
    }

    for (const line of lines) {
      // Tableau Markdown
      if (isMarkdownTableLine(line)) {
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
      const headerMatch = line.match(/^(#{1,6})\s*(.+)$/);
      if (headerMatch) {
        flushLists();
        orderedListIndex = 1;
        pendingBlankLine = false;
        const level = Math.min(Math.max(headerMatch[1].length, 1), 6);
        const headingText = headerMatch[2].replace(/^#+\s*/, '').trim();
        html += `<h${level} class="ai-assistant-heading ai-assistant-heading--h${level}">${linkifyLine(headingText)}</h${level}>`;
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

  function stabilizeTableLayouts(root = document) {
    const scope = root && root.querySelectorAll ? root : document;
    const wraps = scope.querySelectorAll('.ai-assistant-table-wrap');
    wraps.forEach((wrap) => {
      const table = wrap.querySelector('.ai-assistant-table');
      if (!table) return;
      const columns = Number(wrap.dataset.columns || table.rows?.[0]?.cells?.length || 0);
      wrap.classList.toggle('is-scrollable', table.scrollWidth > wrap.clientWidth + 2);
      wrap.classList.toggle('is-wide-table', columns >= 5);
      if (wrap.scrollLeft < 0 || wrap.scrollLeft > table.scrollWidth) wrap.scrollLeft = 0;
    });
  }

  function stabilizeTableLayoutsSoon(root = document) {
    stabilizeTableLayouts(root);
    if (window.requestAnimationFrame) {
      window.requestAnimationFrame(() => stabilizeTableLayouts(root));
      window.requestAnimationFrame(() => {
        const scope = root && root.querySelectorAll ? root : document;
        scope.querySelectorAll('.ai-assistant-table-wrap').forEach((wrap) => { wrap.scrollLeft = 0; });
        stabilizeTableLayouts(root);
      });
    }
    window.setTimeout(() => stabilizeTableLayouts(root), 120);
    window.setTimeout(() => stabilizeTableLayouts(root), 360);
  }

  if (!window.__aiAssistantTableResizeListener) {
    window.__aiAssistantTableResizeListener = true;
    let tableResizeTimer = null;
    window.addEventListener('resize', () => {
      window.clearTimeout(tableResizeTimer);
      tableResizeTimer = window.setTimeout(() => stabilizeTableLayoutsSoon(document), 120);
    });
  }

  function addMessage(kind, text) {
    const bubble = document.createElement('article');
    bubble.className = `ai-assistant-message ai-assistant-message--${kind}`;
    bubble.setAttribute('data-role', kind === 'bot' ? 'assistant' : 'user');
    if (kind === 'bot') {
      const normalizedText = normalizeAssistantMarkdown(text);
      bubble._assistantRawText = normalizedText;
      bubble.innerHTML = formatBotMessageHtml(normalizedText);
      enhanceBotBubble(bubble);
      stabilizeTableLayoutsSoon(bubble);
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
      stabilizeTableLayoutsSoon(bubble);
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
          stabilizeTableLayoutsSoon(bubble);
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

  function getKnowledgeDownloadDataUrl(doc) {
    return doc?.downloadDataUrl || '';
  }

  function getKnowledgeDownloadFilename(doc) {
    const extension = getFileExtension(doc?.name) || (doc?.kind === 'image' ? 'jpg' : 'txt');
    const baseName = sanitizeFilename(String(doc?.name || 'bibliotheque').replace(/\.[^.]+$/, ''), 'bibliotheque');
    return `${baseName}.${extension}`;
  }

  function getKnowledgeFallbackText(doc) {
    return [
      `${i18n.libraryShownInChat}: ${doc?.name || 'document'}`,
      getLibraryDocumentMeta(doc || {}),
      '',
      (doc?.chunks || []).join('\n\n')
    ].filter(Boolean).join('\n');
  }

  function buildKnowledgeDocumentContextBlock(doc) {
    if (!doc) return '';
    const chunks = Array.isArray(doc.chunks) ? doc.chunks.filter(Boolean) : [];
    const content = chunks.length ? chunks.join('\n\n---\n\n') : getKnowledgeFallbackText(doc);
    return [
      `Document affiché dans le chat depuis la bibliothèque locale.`,
      `Fichier: ${doc.name || 'document'}`,
      `Type: ${doc.type || 'Document'}`,
      `Taille: ${fileSizeLabel(doc.size) || 'non précisée'}`,
      `Caractères indexés: ${doc.textLength || content.length || 0}`,
      '',
      content || '[Aucun texte exploitable extrait. Utilise les métadonnées et signale cette limite.]'
    ].join('\n');
  }

  function addKnowledgeDocumentToPendingContext(doc) {
    if (!doc) return;
    const contextBlock = buildKnowledgeDocumentContextBlock(doc);
    if (!contextBlock) return;
    const alreadySelected = pendingLibraryDocumentNames.includes(doc.name);
    if (!alreadySelected) pendingLibraryDocumentNames.push(doc.name);
    pendingFileNames = Array.from(new Set([...pendingFileNames, doc.name].filter(Boolean)));
    pendingFileContext = [
      pendingFileContext,
      alreadySelected ? '' : contextBlock
    ].filter(Boolean).join('\n\n');
  }

  async function getKnowledgeDownloadBlob(doc) {
    if (!doc) return;
    const original = await getKnowledgeOriginalFile(doc);
    if (original?.blob) {
      return {
        blob: original.blob,
        filename: original.name || getKnowledgeDownloadFilename(doc)
      };
    }
    const dataUrl = getKnowledgeDownloadDataUrl(doc);
    const blob = dataUrl ? dataUrlToBlob(dataUrl) : null;
    if (blob) {
      return { blob, filename: getKnowledgeDownloadFilename(doc) };
    }
    return {
      blob: new Blob([getKnowledgeFallbackText(doc)], { type: 'text/plain;charset=utf-8' }),
      filename: `${sanitizeFilename(doc.name, 'document')}.txt`
    };
  }

  async function downloadKnowledgeDocument(doc) {
    const file = await getKnowledgeDownloadBlob(doc);
    if (file?.blob) downloadBlob(file.blob, file.filename);
  }

  async function copyKnowledgeDocument(doc) {
    if (!doc) return false;
    const file = await getKnowledgeDownloadBlob(doc);
    const blob = file?.blob || null;
    if (blob && doc.kind === 'image' && window.ClipboardItem && navigator.clipboard?.write) {
      try {
        await navigator.clipboard.write([new ClipboardItem({ [blob.type || 'image/png']: blob })]);
        return true;
      } catch (error) {
        assistantLog('warn', 'library_image_copy_failed', { reason: error?.message || 'clipboard_image_unavailable' });
      }
    }
    return copyTextToClipboard(getKnowledgeFallbackText(doc));
  }

  async function shareKnowledgeDocument(doc) {
    if (!doc) return false;
    const fileData = await getKnowledgeDownloadBlob(doc);
    const blob = fileData?.blob || null;
    if (blob && navigator.canShare && navigator.share) {
      try {
        const file = new File([blob], fileData.filename || getKnowledgeDownloadFilename(doc), { type: blob.type || doc.mimeType || 'application/octet-stream' });
        if (navigator.canShare({ files: [file] })) {
          await navigator.share({ title: doc.name, files: [file] });
          return true;
        }
      } catch (error) {
        assistantLog('warn', 'library_file_share_failed', { reason: error?.message || 'share_file_unavailable' });
      }
    }
    if (navigator.share) {
      try {
        await navigator.share({ title: doc.name, text: getKnowledgeFallbackText(doc) });
        return true;
      } catch (error) {
        assistantLog('warn', 'library_text_share_failed', { reason: error?.message || 'share_text_unavailable' });
      }
    }
    return copyKnowledgeDocument(doc);
  }

  function addLibraryDocumentMessage(doc) {
    if (!doc || !messagesContainer) return null;
    const bubble = document.createElement('article');
    bubble.className = 'ai-assistant-message ai-assistant-message--bot ai-assistant-message--library-media';
    bubble.setAttribute('data-role', 'assistant');

    const card = document.createElement('div');
    card.className = 'ai-assistant-chat-media-card';

    const thumb = document.createElement('button');
    thumb.type = 'button';
    thumb.className = `ai-assistant-chat-media-thumb ai-assistant-chat-media-thumb--${doc.kind || 'document'}`;
    thumb.title = doc.name;
    renderLibraryDocumentThumb(doc, thumb);
    thumb.addEventListener('click', () => openKnowledgeDocumentPreview(doc));

    const body = document.createElement('div');
    body.className = 'ai-assistant-chat-media-body';
    const title = document.createElement('strong');
    title.textContent = doc.name;
    const meta = document.createElement('span');
    meta.textContent = getLibraryDocumentMeta(doc);
    const text = document.createElement('p');
    text.textContent = getLibraryDocumentPreviewText(doc);
    body.append(title, meta, text);

    const actions = document.createElement('div');
    actions.className = 'ai-assistant-chat-media-actions';
    [
      [i18n.libraryDownload, () => downloadKnowledgeDocument(doc)],
      [i18n.libraryCopy, async () => { if (await copyKnowledgeDocument(doc)) addMessage('bot', i18n.libraryCopied); }],
      [i18n.libraryShare, () => shareKnowledgeDocument(doc)]
    ].forEach(([label, handler]) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = label;
      button.addEventListener('click', handler);
      actions.appendChild(button);
    });

    card.append(thumb, body, actions);
    bubble.appendChild(card);
    messagesContainer.appendChild(bubble);
    scrollConversationToBottom('smooth');
    return bubble;
  }

  function showKnowledgeDocumentInChat(doc) {
    if (!doc) return;
    setLibraryViewOpen(false);
    addLibraryDocumentMessage(doc);
    addKnowledgeDocumentToPendingContext(doc);
    const historyText = `${i18n.libraryShownInChat}: ${doc.name}\n${getLibraryDocumentMeta(doc)}`;
    chatHistory.push({ role: 'assistant', content: historyText });
    persistActiveConversation();
  }

  function openKnowledgeDocumentPreview(doc) {
    if (!doc || !mediaPreview || !mediaPreviewBody) return;
    activePreviewDocId = doc.id;
    if (mediaPreviewTitle) mediaPreviewTitle.textContent = doc.name;
    mediaPreviewBody.innerHTML = '';
    if (doc.previewDataUrl) {
      const image = document.createElement('img');
      image.src = doc.previewDataUrl;
      image.alt = doc.name;
      mediaPreviewBody.appendChild(image);
    } else {
      const pre = document.createElement('pre');
      pre.textContent = getKnowledgeFallbackText(doc);
      mediaPreviewBody.appendChild(pre);
    }
    mediaPreview.hidden = false;
    mediaPreview.setAttribute('aria-hidden', 'false');
  }

  function cleanExportHtmlContent(content) {
    return String(content || '')
      .replace(/<span\s+class=["']ai-assistant-tts-segment["']>/g, '')
      .replace(/<\/span>/g, '');
  }

  function buildExportHtml(content, title = 'Digital Blue Skye document') {
    const exportContent = cleanExportHtmlContent(content);
    return `<!doctype html>
<html lang="${currentLanguage === 'en' ? 'en' : 'fr'}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <style>
    :root {
      color-scheme: dark;
      --bg: #090719;
      --bg-soft: #130d2c;
      --panel: rgb(255 255 255 / 8%);
      --panel-strong: rgb(255 255 255 / 12%);
      --border: rgb(185 158 255 / 24%);
      --border-soft: rgb(255 255 255 / 12%);
      --text: #f6f3ff;
      --muted: rgb(234 226 255 / 72%);
      --muted-2: rgb(234 226 255 / 54%);
      --accent: #9ee8ff;
      --accent-2: #b98cff;
      --accent-3: #7c5cff;
      --shadow: 0 26px 80px rgb(0 0 0 / 38%);
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    * { box-sizing: border-box; }
    body {
      background:
        radial-gradient(circle at 12% 0%, rgb(121 230 255 / 18%), transparent 34%),
        radial-gradient(circle at 88% 8%, rgb(188 92 255 / 24%), transparent 38%),
        linear-gradient(135deg, #070713 0%, #120827 48%, #211044 100%);
      color: var(--text);
      line-height: 1.66;
      margin: 0;
      min-height: 100vh;
      padding: clamp(18px, 4vw, 48px);
    }
    main {
      backdrop-filter: blur(18px);
      -webkit-backdrop-filter: blur(18px);
      background: linear-gradient(180deg, rgb(255 255 255 / 10%), rgb(255 255 255 / 6%));
      border: 1px solid var(--border);
      border-radius: 28px;
      box-shadow: var(--shadow), inset 0 1px 0 rgb(255 255 255 / 10%);
      margin: 0 auto;
      max-width: 1180px;
      overflow: hidden;
      padding: clamp(24px, 4vw, 54px);
      position: relative;
    }
    main::before {
      background: linear-gradient(90deg, var(--accent), var(--accent-2), transparent 75%);
      content: "";
      display: block;
      height: 3px;
      left: 0;
      opacity: .9;
      position: absolute;
      top: 0;
      width: 100%;
    }
    .meta {
      border: 1px solid var(--border-soft);
      border-radius: 999px;
      color: var(--muted-2);
      display: inline-flex;
      font-size: .86rem;
      gap: .45rem;
      letter-spacing: .01em;
      margin: 0 0 28px;
      padding: 8px 13px;
    }
    h1, h2, h3 { color: var(--text); letter-spacing: -.02em; line-height: 1.15; }
    h1 {
      font-size: clamp(2rem, 4.6vw, 4rem);
      margin: 0 0 1rem;
    }
    h2 {
      border-left: 4px solid var(--accent);
      color: var(--accent);
      font-size: clamp(1.22rem, 2.2vw, 1.72rem);
      margin: 2rem 0 1rem;
      padding-left: .75rem;
    }
    h3 { color: #d7c7ff; font-size: 1.08rem; margin: 1.45rem 0 .65rem; }
    p, li { color: var(--muted); font-size: 1rem; }
    p { margin: 0 0 1rem; }
    ul, ol { margin: .5rem 0 1.1rem 1.25rem; padding: 0; }
    li { margin: .3rem 0; }
    a { color: var(--accent); }
    .ai-assistant-table-wrap, table {
      width: 100%;
    }
    .ai-assistant-table-wrap {
      border: 1px solid var(--border-soft);
      border-radius: 18px;
      box-shadow: 0 18px 44px rgb(0 0 0 / 18%);
      margin: 1.35rem 0 1.65rem;
      overflow-x: auto;
    }
    table {
      border-collapse: collapse;
      min-width: 980px;
      table-layout: fixed;
    }
    th, td {
      border-bottom: 1px solid var(--border-soft);
      border-right: 1px solid rgb(255 255 255 / 8%);
      padding: 14px 16px;
      text-align: left;
      vertical-align: top;
      word-break: normal;
      overflow-wrap: anywhere;
    }
    th:last-child, td:last-child { border-right: 0; }
    tr:last-child td { border-bottom: 0; }
    th {
      background: linear-gradient(180deg, rgb(158 232 255 / 18%), rgb(185 140 255 / 12%));
      color: #f7fbff;
      font-size: .82rem;
      font-weight: 750;
      letter-spacing: .035em;
      text-transform: uppercase;
    }
    td {
      background: rgb(255 255 255 / 5%);
      color: rgb(246 243 255 / 84%);
      font-size: .95rem;
    }
    tr:nth-child(even) td { background: rgb(255 255 255 / 7%); }
    code, pre {
      background: rgb(0 0 0 / 24%);
      border: 1px solid var(--border-soft);
      border-radius: 10px;
      color: #ecf8ff;
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    }
    code { padding: 2px 6px; }
    pre { overflow-x: auto; padding: 16px; }
    blockquote {
      background: rgb(255 255 255 / 5%);
      border-left: 4px solid var(--accent-2);
      border-radius: 0 14px 14px 0;
      color: var(--muted);
      margin: 1rem 0;
      padding: .75rem 1rem;
    }
    @media (max-width: 760px) {
      body { padding: 14px; }
      main { border-radius: 20px; padding: 22px 16px; }
      table { min-width: 760px; }
      th, td { padding: 11px 12px; }
    }
    @page { size: A4 landscape; margin: 12mm; }
    @media print {
      :root { color-scheme: light; }
      body { background: #ffffff; color: #111827; padding: 0; }
      main { background: #ffffff; border: 0; border-radius: 0; box-shadow: none; max-width: none; padding: 0; }
      main::before { display: none; }
      .meta { border-color: #d7d8ef; color: #5b5f84; }
      h1, h2, h3 { color: #171833; }
      h2 { border-left-color: #5d5dff; color: #2929d8; }
      p, li, td { color: #1f2140; }
      .ai-assistant-table-wrap { border: 1px solid #d7d8ef; box-shadow: none; overflow: visible; }
      table { min-width: 0; page-break-inside: auto; }
      tr { page-break-inside: avoid; page-break-after: auto; }
      th { background: #f0f1ff !important; color: #25275a; }
      td { background: #ffffff !important; color: #1f2140; }
      th, td { border-color: #d7d8ef; font-size: 8.5pt; padding: 7px 8px; }
      code, pre { background: #f6f7ff; border-color: #d7d8ef; color: #171833; }
    }
  </style>
</head>
<body>
  <main>
    <div class="meta">Digital Blue Skye AI - ${new Date().toLocaleDateString(currentLanguage === 'en' ? 'en-US' : 'fr-FR')}</div>
    ${exportContent}
  </main>
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

  function normalizeLetterSpacedLineForExport(line) {
    const source = String(line || '');
    const compactSingleCharacterRuns = (value) => String(value || '').replace(
      /(^|[^\p{L}\p{N}])((?:[\p{L}\p{N}]\s+){1,}[\p{L}\p{N}])(?=$|[^\p{L}\p{N}])/gu,
      (match, prefix, sequence) => {
        const tokens = sequence.trim().split(/\s+/).filter(Boolean);
        if (tokens.length < 2 || !tokens.every((token) => /^[\p{L}\p{N}]$/u.test(token))) return match;
        return `${prefix}${tokens.join('')}`;
      }
    );
    const compactPart = (part) => {
      const tokens = part.trim().split(/\s+/).filter(Boolean);
      const meaningfulTokens = tokens.filter((token) => /[\p{L}\p{N}]/u.test(token));
      if (meaningfulTokens.length < 2) return part;
      const compactableTokens = meaningfulTokens.filter((token) => /^[([{']?[\p{L}\p{N}][\])}',.;:!?]?$/u.test(token)).length;
      if (compactableTokens !== meaningfulTokens.length) return part;
      return part
        .replace(/([([{])\s+(?=[\p{L}\p{N}])/gu, '$1')
        .replace(/\s*'\s*/g, "'")
        .replace(/(?<=[\p{L}\p{N}])\s+(?=[\p{L}\p{N}])/gu, '')
        .replace(/(?<=[\p{L}\p{N}])\s+(?=[,.;:!?])/gu, '')
        .replace(/\s+([)\]}])/g, '$1')
        .trim();
    };

    return compactSingleCharacterRuns(source
      .split(/(\s{2,})/)
      .map((part) => /\s{2,}/.test(part) ? ' ' : compactPart(part))
      .join('')
      .replace(/\s+([)\]}])/g, '$1')
      .replace(/\s+([,.;:!?])/g, '$1')
      .replace(/\s{2,}/g, ' ')
      .trim())
      .replace(/\b(20\d{2})\s+(\d{2})\s+(\d{2})\b/g, '$1-$2-$3')
      .replace(/\b(20\d{2})(\d{2})(\d{2})\b/g, '$1-$2-$3');
  }

  function normalizeDocumentExportSource(markdown) {
    return repairMarkdownTablesInText(splitInlineMarkdownTableLines(normalizeAssistantMarkdown(markdown)))
      .replace(/\r\n?/g, '\n')
      .split('\n')
      .map((line) => line.replace(/^(#{1,6})(\S)/, '$1 $2'))
      .join('\n')
      .trim();
  }

  function stripMarkdownForPdf(value) {
    const markdownFree = String(value || '')
      .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '$1 ($2)')
      .replace(/\*\*([^*]+)\*\*/g, '$1')
      .replace(/\*([^*]+)\*/g, '$1')
      .replace(/`([^`]+)`/g, '$1');
    return cleanPdfText(normalizeLetterSpacedLineForExport(markdownFree));
  }

  function parseMarkdownTableRowForPdf(row) {
    return parseMarkdownTableCells(row).map((cell) => stripMarkdownForPdf(cell));
  }

  function drawPdfWrappedText(doc, text, x, y, maxWidth, options = {}) {
    const fontSize = options.fontSize || 10;
    const lineHeight = options.lineHeight || fontSize * 0.48;
    doc.setFont('helvetica', options.bold ? 'bold' : options.italic ? 'italic' : 'normal');
    doc.setFontSize(fontSize);
    doc.setTextColor(options.color || '#171833');
    const cleanedText = stripMarkdownForPdf(text);
    if (!/[\p{L}\p{N}]/u.test(cleanedText)) return y;
    const lines = doc.splitTextToSize(cleanedText, maxWidth);
    doc.text(lines, x, y);
    return y + (lines.length * lineHeight);
  }

  function drawPdfTable(doc, rows, state) {
    const normalizedRows = normalizeMarkdownTableRows(rows);
    const cleanRows = normalizedRows ? normalizedRows.map((row) => row.map((cell) => stripMarkdownForPdf(cell))) : [];
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
        doc.setFontSize(8.2);
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
    const source = normalizeDocumentExportSource(markdown);
    try {
      const JsPdf = await ensureJsPdfReady();
      const hasWideTableForPdf = source
        .split('\n')
        .some((line) => isMarkdownTableLine(line.trim()) && parseMarkdownTableCells(line.trim()).length >= 4);
      const doc = new JsPdf({ unit: 'mm', format: 'a4', orientation: hasWideTableForPdf ? 'landscape' : 'portrait' });
      const margin = hasWideTableForPdf ? 12 : 17;
      const pageHeight = doc.internal.pageSize.getHeight();
      const contentWidth = doc.internal.pageSize.getWidth() - (margin * 2);
      const state = { margin, contentWidth, y: margin };
      let tableRows = [];
      let codeRows = [];
      let inCode = false;

      function addPageIfNeeded(extra = 8) {
        if (state.y + extra > pageHeight - margin) {
          doc.addPage();
          state.y = margin + 4;
        }
      }

      function flushTableRows() {
        if (!tableRows.length) return;
        const block = normalizeMarkdownTableBlock(tableRows);
        state.y = drawPdfTable(doc, tableRows, state);
        if (block?.trailingParagraphs?.length) {
          block.trailingParagraphs.forEach((paragraph) => {
            addPageIfNeeded(10);
            state.y = drawPdfWrappedText(doc, paragraph, margin, state.y + 5, contentWidth, { fontSize: 10, lineHeight: 4.9, color: '#171833' }) + 2;
          });
        }
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
      state.y += 12;

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
        if (isMarkdownTableLine(trimmed)) {
          tableRows.push(trimmed);
          return;
        }
        flushTableRows();
        if (!trimmed || /^[-*_]{3,}$/.test(trimmed)) {
          state.y += 2;
          return;
        }
        const heading = trimmed.match(/^(#{1,6})\s*(.+)$/);
        const bullet = trimmed.match(/^[-*]\s+(.+)$/);
        const ordered = trimmed.match(/^(\d+)[.)]\s+(.+)$/);
        addPageIfNeeded(12);
        if (heading) {
          const level = Math.min(heading[1].length, 3);
          const headingText = heading[2].replace(/^#+\s*/, '').trim();
          if (level > 1) {
            doc.setDrawColor('#5d5dff');
            doc.setLineWidth(0.8);
            doc.line(margin, state.y - 2.4, margin, state.y + 4.8);
          }
          state.y = drawPdfWrappedText(doc, headingText, margin, state.y, contentWidth, {
            bold: true,
            color: level === 1 ? '#2929d8' : '#4c4cff',
            fontSize: level === 1 ? 15.4 : level === 2 ? 12.4 : 10.8,
            lineHeight: level === 1 ? 7.2 : 6
          }) + (level === 1 ? 3 : 2);
          return;
        }
        if (bullet) {
          state.y = drawPdfWrappedText(doc, `• ${bullet[1]}`, margin + 4, state.y, contentWidth - 4, { fontSize: 9.6, lineHeight: 4.9 }) + 1.2;
          return;
        }
        if (ordered) {
          state.y = drawPdfWrappedText(doc, `${ordered[1]}. ${ordered[2]}`, margin + 4, state.y, contentWidth - 4, { fontSize: 9.6, lineHeight: 4.9 }) + 1.2;
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
        state.y = drawPdfWrappedText(doc, trimmed, margin, state.y, contentWidth, { fontSize: 9.6, lineHeight: 4.9 }) + 2.2;
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
    return parseMarkdownTableCells(row);
  }

  function buildDocxTable(rows) {
    const cleanRows = normalizeMarkdownTableRows(rows) || [];
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
    const source = normalizeDocumentExportSource(markdown);
    const lines = source ? source.split('\n') : ['Digital Blue Skye document'];
    const blocks = [];
    let tableRows = [];
    let codeRows = [];
    let inCode = false;
    let orderedIndex = 1;

    function flushTableRows() {
      if (tableRows.length) {
        const block = normalizeMarkdownTableBlock(tableRows);
        blocks.push(buildDocxTable(tableRows));
        if (block?.trailingParagraphs?.length) {
          block.trailingParagraphs.forEach((paragraph) => blocks.push(buildDocxParagraph(paragraph)));
        }
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
      if (isMarkdownTableLine(line.trim())) {
        tableRows.push(line.trim());
        return;
      }
      flushTableRows();
      const trimmed = line.trim();
      if (!trimmed || /^[-*_]{3,}$/.test(trimmed)) return;
      const heading = trimmed.match(/^(#{1,6})\s*(.+)$/);
      if (heading) {
        orderedIndex = 1;
        blocks.push(buildDocxParagraph(heading[2].replace(/^#+\s*/, '').trim(), { heading: Math.min(heading[1].length, 3) }));
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
    const getLiveExportText = () => String(bubble._assistantRawText || rawText || content.innerText || '').trim();
    if (rawText.length > 80) {
      const exportActions = document.createElement('div');
      exportActions.className = 'ai-assistant-export-actions';
      exportActions.setAttribute('aria-label', i18n.exportDocument);
      const baseName = slugifyDocumentTitle(rawText);
      const exports = [
        {
          label: 'MD',
          title: i18n.downloadMd,
          action: () => downloadBlob(new Blob([getLiveExportText()], { type: 'text/markdown;charset=utf-8' }), `${baseName}.md`)
        },
        {
          label: 'HTML',
          title: i18n.downloadHtml,
          action: () => downloadBlob(new Blob([buildExportHtml(content.innerHTML, baseName)], { type: 'text/html;charset=utf-8' }), `${baseName}.html`)
        },
        {
          label: 'PDF',
          title: i18n.downloadPdf,
          action: () => downloadPdfDocument(getLiveExportText(), baseName)
        },
        {
          label: 'DOCX',
          title: i18n.downloadDocx,
          action: () => downloadBlob(buildDocxBlob(getLiveExportText()), `${baseName}.docx`)
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

  function stripModelScratchPreamble(rawText) {
    let text = String(rawText || '')
      .replace(/<h([1-6])[^>]*>\s*([^<\n]+?)\s*<\/h\1>/gi, (_, level, content) => `${'#'.repeat(Number(level))} ${content.trim()}`)
      .replace(/<h([1-6])[^>]*>[^#\n\r]*(?=#{1,6}\s)/gi, '')
      .replace(/<\/?h[1-6][^>]*>/gi, '');
    const lines = text.replace(/\r/g, '').split('\n');
    const firstHeadingIndex = lines.findIndex((line) => /^\s{0,3}#{1,6}\s+\S/.test(line));
    if (firstHeadingIndex <= 0) return text;
    const preamble = lines.slice(0, firstHeadingIndex).join('\n').trim();
    const scratchPattern = /\b(we need|we must|now produce|we'll produce|ensure punctuation|must state|none provided|not allowed|produce\.?)\b/i;
    const hasRawTag = /<\/?[a-z][\s\S]*?>/i.test(preamble);
    const mostlyShortScratchLines = lines.slice(0, firstHeadingIndex)
      .filter((line) => line.trim())
      .every((line) => line.trim().length < 140 && !/[.!?]\s+[A-ZÀ-ÖØ-Þ]/.test(line.trim()));
    if (!scratchPattern.test(preamble) && !hasRawTag && !mostlyShortScratchLines) return text;
    text = lines.slice(firstHeadingIndex).join('\n');
    assistantLog('debug', 'assistant_scratch_preamble_removed', { removedChars: preamble.length });
    return text;
  }

  function cleanAssistantReplyText(rawText) {
    return stripModelScratchPreamble(rawText)
      .replace(/<\/?(assistant|user|system)\s*>/gi, '')
      .split('\n')
      .map((line) => normalizeLetterSpacedLineForExport(line))
      .join('\n')
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

  function stripUnsupportedCitationMarkers(rawText, maxSourceIndex = 0) {
    const maxIndex = Math.max(0, Number(maxSourceIndex) || 0);
    return String(rawText || '')
      .replace(/\s*\[(\d{1,3})\]/g, (match, rawIndex) => {
        const index = Number(rawIndex);
        return index >= 1 && index <= maxIndex ? match : '';
      })
      .replace(/\s{2,}/g, ' ')
      .replace(/\n[ \t]+/g, '\n')
      .trim();
  }

  function buildWebSourcesMarkdown(results) {
    const sources = normalizeWebSearchResults(results);
    if (!sources.length) return '';
    const heading = currentLanguage === 'en' ? '### Web references' : '### Références web';
    const lines = sources.map((source, index) => {
      const title = escapeMarkdownLinkText(source.title || getReadableSourceName(source));
      return `${index + 1}. [${title}](${source.link})`;
    });
    return [heading, ...lines].join('\n');
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

  function appendWebSearchSources(bubble, results, debugWeb = false) {
    const sources = normalizeWebSearchResults(results);
    const content = bubble?.querySelector('.ai-assistant-message-content');
    if (!content || !sources.length) return;

    bubble.classList.add('has-web-sources');

    const sourceByIndex = new Map(sources.map((source, index) => [index + 1, source]));
    content.querySelectorAll('.ai-assistant-citation').forEach((citation) => {
      const sourceIndex = Number((citation.textContent || '').match(/\d+/)?.[0] || 0);
      const source = sourceByIndex.get(sourceIndex);
      if (!source) {
        citation.remove();
        return;
      }
      if (citation.querySelector('a')) return;
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
    title.textContent = currentLanguage === 'en' ? 'Web references' : 'Références web';
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
    compactSources.textContent = currentLanguage === 'en' ? 'Web references: ' : 'Références web : ';
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

    const sourceMarkdown = buildWebSourcesMarkdown(sources);
    if (sourceMarkdown) {
      const existingRawText = String(bubble._assistantRawText || '').trim();
      if (existingRawText && !/(^|\n)#{1,6}\s*(Références web|Web references)/i.test(existingRawText)) {
        bubble._assistantRawText = `${existingRawText}\n\n${sourceMarkdown}`;
      }
    }
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

  async function sendAssistantRequest(payload, signal) {
    const startedAt = performance.now();
    const response = await fetch(API_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal,
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
      'benchmark concurrentiel',
      'benchmark concurrentielle',
      'benchmark marché',
      'benchmark marche',
      'analyse concurrentielle',
      'concurrentiel',
      'concurrents',
      'applications concurrentes',
      'part de marché',
      'parts de marché',
      'part de marche',
      'classement',
      'classements',
      'prix abonnement',
      'tarifs',
      'comparatif marché',
      'comparatif marche',
      'latest news',
      'latest announcement',
      'recent announcement',
      'current news',
      'competitive benchmark',
      'competitive analysis',
      'market benchmark',
      'market share',
      'market ranking',
      'pricing comparison',
      'real time'
    ];
    return currentInfoTriggers.some((trigger) => value.includes(trigger));
  }

  async function askAI(userText, fileContext = '', attachments = [], uploadMetadata = []) {
    const loading = addTypingMessage();
    const requestController = new AbortController();
    let effectiveWebSearch = false;
    activeAssistantRequestController = requestController;
    setAssistantRequestRunning(true);
    try {
      const dateContext = getAssistantCurrentDateContext();
      const webSettings = assistantSettingsState.web || {};
      effectiveWebSearch = webSettings.tavilyEnabled !== false && (isWebSearchActive || shouldUseWebSearchForPrompt(userText));
      const knowledgeContext = fileContext ? '' : buildKnowledgeContextForPrompt(userText);

      // Activer le statut "recherche en cours" si recherche web activée
      if (effectiveWebSearch) {
        setWebSearchInProgress(true);
      }

      const contextSections = [];
      if (fileContext) {
        const fileContextLabel = currentLanguage === 'en'
          ? 'Data extracted from local files:'
          : 'Donnees extraites de fichiers locaux :';
        contextSections.push(`${fileContextLabel}\n${fileContext}`);
      }
      if (knowledgeContext) {
        const knowledgeContextLabel = currentLanguage === 'en'
          ? 'Available document context:'
          : 'Contexte documentaire disponible :';
        contextSections.push(`${knowledgeContextLabel}\n${knowledgeContext}`);
      }
      const userRequest = currentLanguage === 'en'
        ? `User request:\n${userText}`
        : `Demande utilisateur :\n${userText}`;
      const composedMessage = [
        ...contextSections,
        userRequest
      ].filter(Boolean).join('\n\n');
      const hasFileContext = Boolean(fileContext);
      const payloadAttachments = [
        ...uploadMetadata,
        ...attachments
      ];
      const payload = {
        message: composedMessage,
        messagePreview: userText,
        history: hasFileContext ? [] : chatHistory.slice(-apiHistoryWindow),
        conversationSummary: hasFileContext ? '' : normalizeSessionSummary(getActiveSession()?.summary),
        language: currentLanguage === 'en' ? 'en' : 'fr',
        currentDate: dateContext,
        mode: 'chat',
        sessionId: getActiveSession()?.id || '',
        projectId: getActiveProject()?.id || defaultProjectId,
        projectName: getActiveProject()?.name || 'SAFE',
        ragScope: getActiveProject()?.ragScope || 'project',
        pageUrl: window.location.href,
        hasFileContext,
        fileContextLength: fileContext.length,
        attachments: payloadAttachments,
        webSearchSettings: {
          tavilyEnabled: webSettings.tavilyEnabled !== false,
          economyMode: webSettings.economyMode !== false,
          expertMode: Boolean(webSettings.expertMode),
          maxResults: Math.max(1, Math.min(10, Number(webSettings.maxResults) || 3))
        },
        documentSettings: assistantSettingsState.documents || {},
        searchWeb: effectiveWebSearch,
        webSearchQuery: userText
      };
      assistantLog('debug', 'api_request', {
        historyMessages: payload.history.length,
        hasConversationSummary: Boolean(payload.conversationSummary),
        hasFileContext,
        fileContextLength: fileContext.length,
        fileContextPreview: fileContext.slice(0, 300),
        hasKnowledgeContext: Boolean(knowledgeContext),
        knowledgeContextLength: knowledgeContext.length,
        attachments: payloadAttachments.length,
        webSearchActive: effectiveWebSearch,
        webSearchManualToggle: isWebSearchActive
      });
      const data = await sendAssistantRequest(payload, requestController.signal);

      // Désactiver le statut "recherche en cours"
      if (effectiveWebSearch) {
        setWebSearchInProgress(false);
      }

      loading.remove();
      if (data.ok) {
        let cleanedReply = cleanAssistantReplyText(data.reply);
        const normalizedWebSources = data.web_search_performed && data.web_search_results?.length
          ? normalizeWebSearchResults(data.web_search_results)
          : [];
        if (normalizedWebSources.length) {
          cleanedReply = stripModelSourcesSection(cleanedReply);
          cleanedReply = stripUnsupportedCitationMarkers(cleanedReply, normalizedWebSources.length);
          assistantLog('debug', 'web_search_results', {
            count: normalizedWebSources.length,
            result1Title: data.web_search_results[0]?.title,
            result1Link: data.web_search_results[0]?.link,
            result2Title: data.web_search_results[1]?.title,
            result2Link: data.web_search_results[1]?.link,
            deterministicWebReply: Boolean(data.deterministic_web_reply),
            debugWeb: Boolean(data.debug_web)
          });
        } else {
          cleanedReply = stripUnsupportedCitationMarkers(cleanedReply, 0);
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
      const wasAborted = e?.name === 'AbortError';
      assistantLog('error', 'api_request_failed', {
        reason: wasAborted ? 'request_aborted' : (e?.message || 'network_error'),
        status: e?.status || 0
      });
      if (loading) loading.remove();

      // S’assurer que le statut est désactivé en cas d’erreur ou d'annulation.
      if (effectiveWebSearch) {
        setWebSearchInProgress(false);
      }

      const message = wasAborted ? i18n.requestStopped : i18n.assistantDown;
      addMessage('bot', message);
      chatHistory.push({ role: 'assistant', content: message });
      persistActiveConversation();
    } finally {
      if (activeAssistantRequestController === requestController) {
        activeAssistantRequestController = null;
      }
      setAssistantRequestRunning(false);
    }
  }

  document.getElementById('ai-assistant-form').addEventListener('submit', (e) => {
    e.preventDefault();
    if (activeAssistantRequestController) return;
    const text = input.value.trim();
    if (!text && !pendingFileContext) return;
    setLibraryViewOpen(false);
    const visibleText = text || i18n.sendWithoutTextWithFiles;
    addMessage('user', visibleText);
    chatHistory.push({ role: 'user', content: visibleText });
    persistActiveConversation();
    input.value = '';
    const fileContext = pendingFileContext;
    const attachments = pendingVisionAttachments.slice(0, 2);
    const uploadMetadata = pendingUploadMetadata.slice(0, maxLocalFilesPerPrompt);
    pendingFileContext = '';
    pendingFileNames = [];
    pendingUploadMetadata = [];
    pendingLibraryDocumentNames = [];
    pendingVisionAttachments = [];
    if (fileInput) fileInput.value = '';
    askAI(visibleText, fileContext, attachments, uploadMetadata);
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

  loadProjectsState();
  loadAssistantSettingsState();
  applyAssistantLanguage(currentLanguage);
  loadKnowledgeLibrary();
  setupPanelDrag();
  loadPanelSize();
  loadPanelPosition();
  loadSidebarSectionState();
  ensureSessionState();
  ensureProjectLinks();
  renderSessionOptions();
  renderProjectList();
  renderCurrentConversation();
});