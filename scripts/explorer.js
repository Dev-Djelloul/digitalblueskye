document.addEventListener("DOMContentLoaded", () => {
  const projectListItems = document.querySelectorAll("#explorerProjectList li");
  const displayContents = document.querySelectorAll(".project-display-content");
  const projectCards = document.querySelectorAll(".project-card-style"); // Sélectionner les cartes elles-mêmes
  const placeholder = document.getElementById("project-display-placeholder");


  let currentActiveListIndex = -1;
  let autoScrollListIntervalId = null;
  const autoScrollListDelay = 2500;
  let isPausedByInteraction = false; // Indique si une interaction utilisateur a mis en pause

  if (projectListItems.length === 0) {
    if (placeholder) placeholder.classList.add("active");
    console.log("Explorer: No project list items found for carousel.");
    return;
  }
  console.log(`Explorer: Found ${projectListItems.length} project list items for carousel.`);

  function showProjectCard(listItemToShow) {
    displayContents.forEach((content) => content.classList.remove("active"));
    if (!listItemToShow) {
      if (placeholder) placeholder.classList.add("active");
      return;
    }
    const targetId = listItemToShow.getAttribute("data-project-target");
    const targetContent = document.getElementById(targetId);
    if (targetContent) {
      if (placeholder) placeholder.classList.remove("active");
      targetContent.classList.add("active");
    } else {
      if (placeholder) placeholder.classList.add("active");
    }
  }

  function highlightListItemAndShowCard(index, isManualInteraction = false) {
    projectListItems.forEach((li) => {
      li.classList.remove("manual-active-project");
      li.classList.remove("auto-active-project");
    });
    if (index < 0 || index >= projectListItems.length) {
      showProjectCard(null);
      return;
    }
    const activeListItem = projectListItems[index];
    activeListItem.classList.add(isManualInteraction ? "manual-active-project" : "auto-active-project");
    activeListItem.scrollIntoView({ behavior: "smooth", block: "nearest" });
    showProjectCard(activeListItem);
  }

  function autoCycleActiveListItem() {
    if (isPausedByInteraction) { // Ne cycle pas si une interaction a mis en pause
      // console.log("Explorer: Auto-cycle skipped due to isPausedByInteraction.");
      return;
    }
    currentActiveListIndex = (currentActiveListIndex + 1) % projectListItems.length;
    highlightListItemAndShowCard(currentActiveListIndex, false);
  }

  let resumeTimeoutId = null; // Pour gérer le délai de reprise

  function startListCarousel() {
    clearTimeout(resumeTimeoutId); // Annule toute reprise en attente
    resumeTimeoutId = setTimeout(() => {
      isPausedByInteraction = false; // Permet à autoCycleActiveListItem de fonctionner à nouveau
      if (autoScrollListIntervalId) clearInterval(autoScrollListIntervalId); // S'assure qu'il n'y a pas d'intervalles multiples
      autoScrollListIntervalId = setInterval(autoCycleActiveListItem, autoScrollListDelay);
      // console.log("Explorer: Carousel (re)started.");
    }, 100); // Petit délai pour permettre à un mouseenter sur un autre élément de prendre le dessus
  }

  function pauseListCarousel() {
    clearTimeout(resumeTimeoutId); // Annule toute reprise en attente si on repause rapidement
    isPausedByInteraction = true; // Marque qu'une interaction a causé la pause
    clearInterval(autoScrollListIntervalId);
    // console.log("Explorer: Carousel paused.");
  }

  // 1. Interaction avec la liste de gauche (pour sélectionner et pauser)
  projectListItems.forEach((item, index) => {
    item.addEventListener("mouseenter", () => {
      pauseListCarousel();
      currentActiveListIndex = index; // Mettre à jour l'index pour la reprise éventuelle
      highlightListItemAndShowCard(index, true);
    });
    item.addEventListener("mouseleave", () => {
      // Lorsque la souris quitte un élément de la liste, on tente de redémarrer le carrousel.
      // Si la souris va sur une carte projet, son propre 'mouseenter' appellera 'pauseListCarousel'.
      startListCarousel();
    });
  });

  // 3. NOUVEAU : Gestion du survol des cartes de projet individuelles dans le panneau de droite
  projectCards.forEach(card => {
    card.addEventListener("mouseenter", () => {
      pauseListCarousel();
    });
    card.addEventListener("mouseleave", () => {
      // Lorsque la souris quitte une carte, on tente de redémarrer.
      // Si la souris va sur un item de la liste de gauche, son 'mouseenter' appellera 'pauseListCarousel'.
      // console.log("Explorer: Mouse left a project card, attempting to resume.");
      startListCarousel();
    });
  });
  
  // Initialisation du carrousel
  if (projectListItems.length > 0) {
    showProjectCard(null); // Afficher le placeholder au début
    // Le premier cycle se fera après autoScrollListDelay grâce à startListCarousel
    startListCarousel(); 
  } else {
    showProjectCard(null); 
  }

  // Gestion des traductions (inchangée)
  if (
    typeof loadTranslations === "function" &&
    typeof currentLanguage !== "undefined"
  ) {
    loadTranslations(currentLanguage);
  } else if (typeof applyTranslations === "function") {
    applyTranslations();
  }
});