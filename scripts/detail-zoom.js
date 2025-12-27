document.addEventListener("DOMContentLoaded", () => {
  const detailImages = document.querySelectorAll(".detail-hero-image");

  detailImages.forEach((img) => {
    let wrapper = img.closest(".detail-hero-media");
    if (!wrapper) {
      wrapper = document.createElement("div");
      wrapper.className = "detail-hero-media";
      img.parentNode.insertBefore(wrapper, img);
      wrapper.appendChild(img);
    }

    if (wrapper.querySelector(".detail-zoom")) {
      return;
    }

    let scale = 1;
    const minScale = 1;
    const maxScale = 6;
    const step = 0.25;
    let offsetX = 0;
    let offsetY = 0;
    let isDragging = false;
    let startX = 0;
    let startY = 0;

    const controls = document.createElement("div");
    controls.className = "detail-zoom";

    const zoomOut = document.createElement("button");
    zoomOut.type = "button";
    zoomOut.className = "detail-zoom-button";
    zoomOut.setAttribute("aria-label", "Réduire l'image");
    zoomOut.textContent = "−";

    const zoomIn = document.createElement("button");
    zoomIn.type = "button";
    zoomIn.className = "detail-zoom-button";
    zoomIn.setAttribute("aria-label", "Agrandir l'image");
    zoomIn.textContent = "+";

    const zoomSlider = document.createElement("input");
    zoomSlider.type = "range";
    zoomSlider.className = "detail-zoom-slider";
    zoomSlider.min = String(minScale * 100);
    zoomSlider.max = String(maxScale * 100);
    zoomSlider.step = "5";
    zoomSlider.value = "100";
    zoomSlider.setAttribute("aria-label", "Niveau de zoom");

    const zoomValue = document.createElement("span");
    zoomValue.className = "detail-zoom-value";
    zoomValue.textContent = "100%";

    controls.appendChild(zoomOut);
    controls.appendChild(zoomIn);
    controls.appendChild(zoomSlider);
    controls.appendChild(zoomValue);
    wrapper.appendChild(controls);

    controls.addEventListener("pointerdown", (event) => {
      event.stopPropagation();
    });

    const applyZoom = () => {
      img.style.setProperty("--zoom", scale.toFixed(2));
      img.style.setProperty("--pan-x", `${offsetX}px`);
      img.style.setProperty("--pan-y", `${offsetY}px`);
      img.classList.toggle("is-zoomed", scale > 1);
      const percent = Math.round(scale * 100);
      zoomSlider.value = String(percent);
      zoomValue.textContent = `${percent}%`;
    };

    zoomIn.addEventListener("click", () => {
      scale = Math.min(maxScale, scale + step);
      applyZoom();
    });

    zoomOut.addEventListener("click", () => {
      scale = Math.max(minScale, scale - step);
      if (scale === minScale) {
        offsetX = 0;
        offsetY = 0;
      }
      applyZoom();
    });

    zoomSlider.addEventListener("input", () => {
      scale = Math.min(maxScale, Math.max(minScale, Number(zoomSlider.value) / 100));
      if (scale === minScale) {
        offsetX = 0;
        offsetY = 0;
      }
      applyZoom();
    });

    wrapper.addEventListener("pointerdown", (event) => {
      if (!event.isPrimary) return;
      if (event.target.closest(".detail-zoom")) return;
      if (scale <= 1) return;
      event.preventDefault();
      isDragging = true;
      startX = event.clientX - offsetX;
      startY = event.clientY - offsetY;
      wrapper.setPointerCapture(event.pointerId);
    });

    wrapper.addEventListener("pointermove", (event) => {
      if (!isDragging) return;
      event.preventDefault();
      offsetX = event.clientX - startX;
      offsetY = event.clientY - startY;
      applyZoom();
    });

    const stopDrag = (event) => {
      if (!isDragging) return;
      isDragging = false;
      wrapper.releasePointerCapture(event.pointerId);
    };

    wrapper.addEventListener("pointerup", stopDrag);
    wrapper.addEventListener("pointercancel", stopDrag);
  });
});
