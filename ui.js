(() => {
  "use strict";

  // Shared interaction behavior. App-specific handlers still own saved data and
  // explicit Save/Cancel actions; this layer only manages the surrounding UI.
  const drawer = document.getElementById("sidebarDrawer");
  const openMenu = document.getElementById("openSidebarBtn");
  const closeMenu = document.getElementById("closeSidebarBtn");
  const app = document.querySelector(".app-column");
  const toast = document.getElementById("toast");
  const dialogs = [...document.querySelectorAll("dialog")];
  const openOrder = [];
  const closingTimers = new Map();
  const dialogReturnFocus = new Map();
  const knownOpen = new Set();
  let drawerOpen = false;
  let drawerReturnFocus = null;
  let appWasInert = false;
  let scrollLock = null;
  let lastFocus = document.activeElement;

  const focusableSelector = 'button, input, select, textarea, a[href], summary, iframe, [tabindex]';
  const isVisible = element => Boolean(element?.isConnected && !element.closest("[hidden], [inert]") && element.getClientRects().length);
  const focus = element => {
    if (!isVisible(element) || element.disabled || element === document.body) return false;
    element.focus({ preventScroll: true });
    return document.activeElement === element;
  };
  const topDialog = () => openOrder.filter(dialog => dialog.open).at(-1);
  const focusableIn = element => [...element.querySelectorAll(focusableSelector)]
    .filter(item => !item.disabled && item.tabIndex >= 0 && isVisible(item));

  function lockScroll() {
    if (scrollLock) return;
    const properties = ["position", "top", "left", "width", "overflow", "padding-right"];
    scrollLock = {
      x: window.scrollX,
      y: window.scrollY,
      styles: properties.map(name => [name, document.body.style.getPropertyValue(name), document.body.style.getPropertyPriority(name)]),
    };
    const scrollbar = Math.max(0, window.innerWidth - document.documentElement.clientWidth);
    const padding = parseFloat(window.getComputedStyle(document.body).paddingRight) || 0;
    document.body.style.position = "fixed";
    document.body.style.top = `${-scrollLock.y}px`;
    document.body.style.left = `${-scrollLock.x}px`;
    document.body.style.width = "100%";
    document.body.style.overflow = "hidden";
    if (scrollbar) document.body.style.paddingRight = `${padding + scrollbar}px`;
    document.body.classList.add("overlay-open");
  }

  function unlockScroll() {
    if (!scrollLock) return;
    const previous = scrollLock;
    scrollLock = null;
    previous.styles.forEach(([name, value, priority]) => {
      if (value) document.body.style.setProperty(name, value, priority);
      else document.body.style.removeProperty(name);
    });
    document.body.classList.remove("overlay-open");
    // The page normally scrolls smoothly. Restoring its exact position must be
    // immediate, including when a modal was opened well below the first screen.
    const rootStyle = document.documentElement.style;
    const behavior = rootStyle.getPropertyValue("scroll-behavior");
    const priority = rootStyle.getPropertyPriority("scroll-behavior");
    rootStyle.setProperty("scroll-behavior", "auto", "important");
    window.scrollTo(previous.x, previous.y);
    if (behavior) rootStyle.setProperty("scroll-behavior", behavior, priority);
    else rootStyle.removeProperty("scroll-behavior");
  }

  function placeToast() {
    if (!toast) return;
    const destination = topDialog() || document.body;
    if (toast.parentElement !== destination) destination.appendChild(toast);
    toast.classList.toggle("in-dialog", destination !== document.body);
  }

  function synchronizeLayers() {
    dialogs.forEach(dialog => {
      if (dialog.open && !knownOpen.has(dialog)) {
        knownOpen.add(dialog);
        openOrder.push(dialog);
        if (!dialogReturnFocus.has(dialog) && !dialog.contains(lastFocus)) dialogReturnFocus.set(dialog, lastFocus);
      } else if (!dialog.open && knownOpen.has(dialog)) {
        knownOpen.delete(dialog);
        openOrder.splice(openOrder.indexOf(dialog), 1);
        clearTimeout(closingTimers.get(dialog));
        closingTimers.delete(dialog);
        dialog.classList.remove("is-closing");
        const returnTo = dialogReturnFocus.get(dialog);
        dialogReturnFocus.delete(dialog);
        if (!topDialog() && (document.activeElement === document.body || dialog.contains(document.activeElement) || !isVisible(document.activeElement))) {
          // A manager opened from a menu that has just closed no longer has a
          // visible trigger. Return to the menu button instead of losing focus.
          if (!focus(returnTo)) focus(drawerOpen ? closeMenu : openMenu);
        }
      }
    });

    const nowOpen = Boolean(drawer && !drawer.hidden);
    if (nowOpen !== drawerOpen) {
      drawerOpen = nowOpen;
      openMenu?.setAttribute("aria-expanded", String(nowOpen));
      if (nowOpen) {
        drawerReturnFocus = document.activeElement;
        appWasInert = Boolean(app?.inert);
        if (app) app.inert = true;
        if (!topDialog()) focus(closeMenu || drawer);
      } else {
        if (app) app.inert = appWasInert;
        if (!topDialog()) focus(drawerReturnFocus || openMenu);
        drawerReturnFocus = null;
      }
    }
    if (drawerOpen || topDialog()) lockScroll();
    else unlockScroll();
    placeToast();
  }

  function dismissDialog(dialog) {
    if (!dialog.open || closingTimers.has(dialog)) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      dialog.close();
      return;
    }
    dialog.classList.add("is-closing");
    closingTimers.set(dialog, window.setTimeout(() => {
      closingTimers.delete(dialog);
      if (dialog.open) dialog.close();
      dialog.classList.remove("is-closing");
    }, 140));
  }

  function outsideDialog(event, dialog) {
    if (event.target !== dialog) return false;
    const bounds = dialog.getBoundingClientRect();
    return event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom;
  }

  dialogs.forEach((dialog, index) => {
    const heading = dialog.querySelector("h2, h3");
    if (heading && !dialog.hasAttribute("aria-labelledby") && !dialog.hasAttribute("aria-label")) {
      if (!heading.id) heading.id = `dialog-heading-${index}`;
      dialog.setAttribute("aria-labelledby", heading.id);
    }
    let backdropPress = false;
    dialog.addEventListener("pointerdown", event => { backdropPress = outsideDialog(event, dialog); });
    dialog.addEventListener("pointercancel", () => { backdropPress = false; });
    dialog.addEventListener("click", event => {
      if (backdropPress && outsideDialog(event, dialog)) dismissDialog(dialog);
      backdropPress = false;
    });
    dialog.addEventListener("cancel", event => {
      event.preventDefault();
      dismissDialog(dialog);
    });
    dialog.addEventListener("close", synchronizeLayers);
  });

  if (drawer) {
    drawer.setAttribute("role", "dialog");
    drawer.setAttribute("aria-modal", "true");
    drawer.tabIndex = -1;
    openMenu?.setAttribute("aria-controls", drawer.id);
    openMenu?.setAttribute("aria-expanded", String(!drawer.hidden));
  }

  document.addEventListener("focusin", event => {
    const dialog = event.target.closest?.("dialog");
    if (dialog?.open && !knownOpen.has(dialog) && !dialog.contains(lastFocus)) dialogReturnFocus.set(dialog, lastFocus);
    lastFocus = event.target;
    if (drawerOpen && !topDialog() && !dialogs.some(item => item.open) && !drawer.contains(event.target)) focus(closeMenu || drawer);
  });
  document.addEventListener("keydown", event => {
    // Let the native dialog receive Escape without the old document handler
    // also closing the drawer underneath it.
    if (event.key === "Escape" && dialogs.some(dialog => dialog.open)) {
      event.stopPropagation();
      return;
    }
    if (!drawerOpen || topDialog() || event.key !== "Tab") return;
    const items = focusableIn(drawer);
    const first = items[0] || drawer;
    const last = items.at(-1) || drawer;
    if (!items.length || (event.shiftKey && document.activeElement === first) || (!event.shiftKey && document.activeElement === last)) {
      event.preventDefault();
      focus(event.shiftKey ? last : first);
    }
  }, true);
  document.addEventListener("click", event => {
    const button = event.target.closest?.("[data-dialog-dismiss]");
    const dialog = button?.closest("dialog");
    if (!dialog) return;
    event.preventDefault();
    dismissDialog(dialog);
  });

  const layerObserver = new MutationObserver(synchronizeLayers);
  if (drawer) layerObserver.observe(drawer, { attributes: true, attributeFilter: ["hidden"] });
  dialogs.forEach(dialog => layerObserver.observe(dialog, { attributes: true, attributeFilter: ["open"] }));

  const header = document.querySelector(".top-bar");
  function measureHeader() {
    if (!header) return;
    const height = Math.ceil(header.getBoundingClientRect().height);
    if (height > 0) document.documentElement.style.setProperty("--app-header-height", `${height}px`);
  }
  if (header && "ResizeObserver" in window) new ResizeObserver(measureHeader).observe(header);
  window.addEventListener("resize", measureHeader, { passive: true });
  measureHeader();

  // These are filters/toggles rather than tab panels. Reflect their existing
  // active classes so assistive technology gets the same state as the screen.
  document.querySelectorAll(".progress-range-switch, .view-switch, .ex-range-switch, .ex-meal-tags").forEach(group => {
    group.setAttribute("role", "group");
    const update = () => group.querySelectorAll("button").forEach(button => {
      button.setAttribute("aria-pressed", String(button.classList.contains("active")));
    });
    new MutationObserver(update).observe(group, { subtree: true, attributes: true, attributeFilter: ["class"], childList: true });
    update();
  });

  window.AppUI = Object.freeze({
    hideToast() {
      if (!toast) return;
      toast.classList.remove("show");
      toast.textContent = "";
    },
  });
  synchronizeLayers();
})();
