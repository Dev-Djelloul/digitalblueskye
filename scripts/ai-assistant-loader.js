(function () {
  'use strict';

  var DEFAULT_SRC = '/scripts/ai-assistant.js?v=20260623-sources-panel';
  var SELECTORS = [
    '#ai-assistant-launcher',
    '#ai-assistant-panel',
    '#ai-assistant-form',
    '[data-ai-assistant]',
    '[data-ai-assistant-trigger]'
  ];
  var loadingPromise = null;

  function findCurrentScript() {
    return document.currentScript || document.querySelector('script[src*="ai-assistant-loader.js"]');
  }

  function getAssistantSrc() {
    var currentScript = findCurrentScript();
    return currentScript && currentScript.dataset.aiAssistantSrc
      ? currentScript.dataset.aiAssistantSrc
      : DEFAULT_SRC;
  }

  function hasAssistantInterface() {
    return SELECTORS.some(function (selector) {
      return Boolean(document.querySelector(selector));
    });
  }

  function isAssistantLoaded(src) {
    return Boolean(window.DBS_AI_ASSISTANT_LOADED)
      || Boolean(document.querySelector('script[src*="ai-assistant.js"]'))
      || Boolean(document.querySelector('script[src="' + src + '"]'));
  }

  function loadAssistant() {
    var src = getAssistantSrc();

    if (isAssistantLoaded(src)) {
      return loadingPromise || Promise.resolve();
    }

    if (loadingPromise) {
      return loadingPromise;
    }

    loadingPromise = new Promise(function (resolve, reject) {
      var script = document.createElement('script');
      script.src = src;
      script.async = true;
      script.onload = function () {
        window.DBS_AI_ASSISTANT_LOADED = true;
        resolve();
      };
      script.onerror = function () {
        loadingPromise = null;
        console.error('[ai-assistant-loader] Unable to load AI assistant:', src);
        reject(new Error('Unable to load AI assistant'));
      };
      document.head.appendChild(script);
    });

    return loadingPromise;
  }

  function bindTriggers() {
    document.querySelectorAll('[data-ai-assistant-trigger]').forEach(function (trigger) {
      trigger.addEventListener('click', loadAssistant, { once: true });
      trigger.addEventListener('focus', loadAssistant, { once: true });
    });
  }

  function init() {
    if (hasAssistantInterface()) {
      loadAssistant();
      return;
    }

    bindTriggers();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
