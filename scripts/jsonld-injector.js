// scripts/jsonld-injector.js
// Injecte dynamiquement les données structurées Article schema.org JSON-LD depuis les données de page et traductions.
// S'exécute après DOMContentLoaded et récupère les attributs data-i18n et les sources d'images.

(function () {
  function getTextFromElement(key) {
    // Essaie de récupérer le texte d'un élément avec l'attribut data-i18n correspondant
    var el = document.querySelector('[data-i18n="' + key + '"]');
    if (el && el.textContent && el.textContent.trim().length > 0) {
      return el.textContent.trim();
    }
    return '';
  }

  function buildArticleJsonLd() {
    // Trouve la clé d'article en cherchant les éléments avec data-i18n="news.articleN.title" ou similaire
    var titleElements = document.querySelectorAll('[data-i18n^="news.article"][data-i18n$=".title"]');
    var articleKey = null;
    
    if (titleElements.length > 0) {
      var key = titleElements[0].getAttribute('data-i18n');
      articleKey = key.replace('.title', '');
    }

    if (!articleKey) {
      return null;
    }

    var title = getTextFromElement(articleKey + '.title') || document.title || '';
    var description = getTextFromElement(articleKey + '.metaDescription') || 
                      getTextFromElement(articleKey + '.summary') || 
                      document.querySelector('meta[name="description"]')?.getAttribute('content') || '';
    
    // Essaie d'extraire la date depuis datelineFull ou publishDate
    var datelineText = getTextFromElement(articleKey + '.datelineFull') || 
                       getTextFromElement(articleKey + '.publishDate') || '';
    var datePublished = extractDate(datelineText);

    // Récupère l'image de la bannière
    var imageEl = document.querySelector('.article-banner-image');
    var image = imageEl ? makeAbsoluteUrl(imageEl.getAttribute('src')) : '';

    var url = window.location.href;

    var jsonLd = {
      "@context": "https://schema.org",
      "@type": "Article",
      "mainEntityOfPage": {
        "@type": "WebPage",
        "@id": url
      },
      "headline": title,
      "description": description,
      "author": {
        "@type": "Person",
        "name": "Djelloul (YellowBlueSkye)",
        "url": window.location.origin
      },
      "publisher": {
        "@type": "Organization",
        "name": "Digitalblueskye",
        "logo": {
          "@type": "ImageObject",
          "url": makeAbsoluteUrl("/assets/images/logo/Logo-Globe.png")
        }
      }
    };

    // Ajoute l'image si disponible
    if (image) {
      jsonLd.image = [image];
    }

    // Ajoute datePublished si on peut extraire une date valide
    if (datePublished) {
      jsonLd.datePublished = datePublished;
    }

    return jsonLd;
  }

  function extractDate(datelineText) {
    // Essaie d'extraire une date depuis un texte comme "Publié le 28 Mai 2025" ou "Published on November 15, 2025"
    // Formats attendus : "28 Mai 2025", "15 Novembre 2025", "May 28, 2025", "November 15, 2025"
    if (!datelineText) return null;

    // Mois français
    var frMonths = {
      'janvier': '01', 'février': '02', 'mars': '03', 'avril': '04', 'mai': '05', 'juin': '06',
      'juillet': '07', 'août': '08', 'septembre': '09', 'octobre': '10', 'novembre': '11', 'décembre': '12'
    };
    
    // Mois anglais
    var enMonths = {
      'january': '01', 'february': '02', 'march': '03', 'april': '04', 'may': '05', 'june': '06',
      'july': '07', 'august': '08', 'september': '09', 'october': '10', 'november': '11', 'december': '12'
    };

    // Essaie format français : "28 Mai 2025"
    var frMatch = datelineText.match(/(\d{1,2})\s+(\w+)\s+(\d{4})/i);
    if (frMatch) {
      var day = frMatch[1].padStart(2, '0');
      var monthName = frMatch[2].toLowerCase();
      var year = frMatch[3];
      var monthNum = frMonths[monthName];
      if (monthNum) {
        return year + '-' + monthNum + '-' + day + 'T00:00:00Z';
      }
    }

    // Essaie format anglais : "May 28, 2025"
    var enMatch = datelineText.match(/(\w+)\s+(\d{1,2}),\s+(\d{4})/i);
    if (enMatch) {
      var monthName = enMatch[1].toLowerCase();
      var day = enMatch[2].padStart(2, '0');
      var year = enMatch[3];
      var monthNum = enMonths[monthName];
      if (monthNum) {
        return year + '-' + monthNum + '-' + day + 'T00:00:00Z';
      }
    }

    return null;
  }

  function makeAbsoluteUrl(url) {
    if (!url) return '';
    if (url.startsWith('http')) return url;
    return window.location.origin + url;
  }

  function injectJsonLd() {
    try {
      var jsonLd = buildArticleJsonLd();
      if (!jsonLd) return;

      // Vérifie si le JSON-LD existe déjà pour éviter les doublons
      var existing = document.querySelector('script[type="application/ld+json"]');
      if (existing) {
        console.log('JSON-LD déjà présent, injection annulée');
        return;
      }

      var script = document.createElement('script');
      script.type = 'application/ld+json';
      script.text = JSON.stringify(jsonLd, null, 2);
      document.head.appendChild(script);
      
      console.log('JSON-LD Article injecté avec succès');
    } catch (e) {
      // Échoue silencieusement ; JSON-LD est optionnel
      console.warn('Erreur d\'injection JSON-LD :', e);
    }
  }

  // S'exécute après DOMContentLoaded et attend un petit délai pour permettre à translator de remplir le contenu
  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    setTimeout(injectJsonLd, 300);
  } else {
    document.addEventListener('DOMContentLoaded', function() {
      setTimeout(injectJsonLd, 300);
    });
  }
})();
