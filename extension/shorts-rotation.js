(() => {
  "use strict";

  const attributes = {
    slide: "data-shorts-rotation-slide",
    reel: "data-shorts-rotation-reel",
    video: "data-shorts-rotation-video",
  };
  const sizes = {
    width: "--shorts-rotation-width",
    height: "--shorts-rotation-height",
    top: "--shorts-rotation-top",
    sourceWidth: "--shorts-rotation-source-width",
    sourceHeight: "--shorts-rotation-source-height",
    centerY: "--shorts-rotation-center-y",
    angle: "--shorts-rotation-angle",
  };

  let currentId = null;
  let active = null;
  let angle = 0;
  let frame = 0;
  let geometry = "";
  let floatingPosition = null;
  let drag = null;
  let preferences = null;

  const changes = new MutationObserver(scheduleRefresh);
  const playerChanges = new MutationObserver(scheduleRefresh);
  const resizes = new ResizeObserver(scheduleRefresh);

  const toolbar = document.createElement("div");
  toolbar.className = "shorts-rotation-toolbar";
  toolbar.setAttribute("role", "group");
  toolbar.setAttribute("aria-label", "쇼츠 영상 회전");

  const controls = document.createElement("div");
  controls.className = "shorts-rotation-controls";
  toolbar.append(controls);

  const grip = document.createElement("span");
  grip.className = "shorts-rotation-grip";
  grip.tabIndex = 0;
  grip.title = "드래그해서 회전 창 이동";
  grip.setAttribute("role", "group");
  grip.setAttribute("aria-label", "회전 창 이동");
  grip.setAttribute("aria-description", "방향키로 이동하고 Home 키로 원래 위치에 놓습니다.");
  controls.append(grip);

  const left = addButton("왼쪽으로 90° 회전", -90);
  const reset = addButton("원래 방향으로", 0);
  const right = addButton("오른쪽으로 90° 회전", 90);

  grip.addEventListener("pointerdown", (event) => {
    if (event.button !== 0 || drag) return;

    event.preventDefault();
    event.stopPropagation();
    const { left, top } = toolbar.getBoundingClientRect();
    drag = { id: event.pointerId, x: event.clientX - left, y: event.clientY - top };
    moveToolbar(left, top);
    grip.setPointerCapture(event.pointerId);
    toolbar.classList.add("is-dragging");
  });

  grip.addEventListener("pointermove", (event) => {
    if (event.pointerId !== drag?.id) return;

    moveToolbar(event.clientX - drag.x, event.clientY - drag.y);
  });
  grip.addEventListener("lostpointercapture", stopDragging);

  const arrowOffsets = {
    ArrowLeft: [-16, 0], ArrowRight: [16, 0], ArrowUp: [0, -16], ArrowDown: [0, 16],
  };
  grip.addEventListener("keydown", (event) => {
    const offset = arrowOffsets[event.key];
    if (!offset && event.key !== "Home") return;

    event.preventDefault();
    event.stopPropagation();
    if (offset) {
      const { left, top } = toolbar.getBoundingClientRect();
      moveToolbar(left + offset[0], top + offset[1]);
    } else {
      floatingPosition = null;
      positionToolbar();
    }
  });

  toolbar.addEventListener("keydown", (event) => {
    if (event.key === " " || event.key === "Enter") event.stopPropagation();
  });

  function addButton(label, step) {
    const button = document.createElement("button");
    button.type = "button";
    button.title = label;
    button.setAttribute("aria-label", label);
    if (step) {
      const icon = document.createElement("span");
      icon.className = step < 0 ? "shorts-rotation-arrow" : "shorts-rotation-arrow is-clockwise";
      icon.setAttribute("aria-hidden", "true");
      button.append(icon);
    } else {
      button.className = "shorts-rotation-angle";
      button.textContent = "0°";
      button.setAttribute("aria-live", "polite");
    }
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      refresh();
      if (!active || isAd(active.player)) return;

      angle = step === 0 ? 0 : (angle + step + 360) % 360;
      updatePlayerLayout();
    });
    controls.append(button);
    return button;
  }

  function stopDragging() {
    drag = null;
    toolbar.classList.remove("is-dragging");
  }

  function moveToolbar(x, y) {
    floatingPosition = { x, y };
    positionToolbar();
  }

  function positionToolbar() {
    const parent = floatingPosition ? document.fullscreenElement || document.body : active.host;
    if (toolbar.parentElement !== parent) {
      const gripFocused = document.activeElement === grip;
      parent.append(toolbar);
      if (gripFocused) grip.focus({ preventScroll: true });
    }

    toolbar.classList.toggle("is-floating", Boolean(floatingPosition));
    if (!floatingPosition) return;

    const inset = 6;
    const x = Math.max(inset, Math.min(floatingPosition.x, document.documentElement.clientWidth - toolbar.offsetWidth - inset));
    const y = Math.max(inset, Math.min(floatingPosition.y, document.documentElement.clientHeight - toolbar.offsetHeight - inset));
    toolbar.style.setProperty("--shorts-toolbar-x", `${x}px`);
    toolbar.style.setProperty("--shorts-toolbar-y", `${y}px`);
  }

  function isAd(player) {
    return player.matches(".ad-showing, .ad-interrupting");
  }

  function findActivePlayer() {
    let best = null;
    let bestScore = 0;

    for (const player of document.querySelectorAll("ytd-shorts #shorts-player")) {
      const reel = player.closest("ytd-reel-video-renderer, ytd-reel-video-renderer-cow");
      const video = player.querySelector("video.html5-main-video, video");
      const container = player.closest("#shorts-container");
      if (!video || !reel || !container) continue;

      const slide = reel.closest(".reel-video-in-sequence-new, .ytdShortsCarouselSlide") || reel.parentElement;
      const viewport = container.getBoundingClientRect();
      const position = slide.getBoundingClientRect();
      const visibleHeight = Math.min(viewport.bottom, position.bottom) - Math.max(viewport.top, position.top);
      if (visibleHeight <= 0 || !position.width) continue;

      // YouTube can retain off-screen reels or reuse the same player in a different slide.
      const score = visibleHeight / Math.max(position.height, 1) + Number(reel.hasAttribute("is-active"));
      if (score <= bestScore) continue;

      bestScore = score;
      best = {
        player, reel, video, slide, container,
        shorts: reel.closest("ytd-shorts"),
        host: player.closest("#short-video-container") || player.closest("#player-container") || reel,
      };
    }

    return best;
  }

  function scheduleRefresh() {
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      refresh();
    });
  }

  function onNavigate() {
    const id = /^\/shorts\/([^/]+)\/?$/.exec(location.pathname)?.[1] ?? null;
    if (id !== currentId) {
      if (!id || !currentId || !preferences.keepRotation) angle = 0;
      currentId = id;
      setActive(null);
      changes.disconnect();
      if (id) {
        changes.observe(document.body, {
          childList: true,
          subtree: true,
          attributes: true,
          attributeFilter: [
            "hidden", "is-active", "is-fullscreen", "is-watch-while-mode",
            "small-screen-persistent-panel", "small-screen-squeezeback",
          ],
        });
      }
    }
    return id;
  }

  function refresh() {
    if (!preferences?.enabled || !onNavigate()) return;

    const next = findActivePlayer();
    if (next?.player !== active?.player || next?.video !== active?.video ||
        next?.slide !== active?.slide || next?.host !== active?.host) {
      if (!preferences.keepRotation && next && active && next.slide !== active.slide) angle = 0;
      setActive(next);
    }
    updatePlayerLayout();
    if (active) positionToolbar();
  }

  function setActive(next) {
    clearPlayerLayout();
    if (active) {
      active.container.removeEventListener("scroll", scheduleRefresh);
      active.video.removeEventListener("loadedmetadata", scheduleRefresh);
      active.video.removeEventListener("resize", scheduleRefresh);
    }
    resizes.disconnect();
    playerChanges.disconnect();

    active = next;
    if (!active) {
      stopDragging();
      toolbar.remove();
      return;
    }

    active.container.addEventListener("scroll", scheduleRefresh, { passive: true });
    active.video.addEventListener("loadedmetadata", scheduleRefresh);
    active.video.addEventListener("resize", scheduleRefresh);
    resizes.observe(active.container);
    const panel = active.shorts.querySelector("#anchored-panel");
    if (panel) resizes.observe(panel);
    playerChanges.observe(active.player, { attributes: true, attributeFilter: ["class"] });
  }

  function clearPlayerLayout() {
    if (!geometry || !active) return;

    const { slide, reel, video, player } = active;
    slide.removeAttribute(attributes.slide);
    slide.style.removeProperty(sizes.width);
    reel.removeAttribute(attributes.reel);
    video.removeAttribute(attributes.video);
    for (const property of Object.values(sizes)) reel.style.removeProperty(property);
    geometry = "";

    // A Short loaded in landscape can have video offsets cached for that player size.
    queueMicrotask(() => {
      if (player.isConnected && !player.closest(`[${attributes.reel}]`)) {
        window.dispatchEvent(new Event("resize"));
      }
    });
  }

  function updatePlayerLayout() {
    if (!active) return;

    const { slide, reel, video, container, shorts, player } = active;
    const adPlaying = isAd(player);
    const angleLabel = angle === 270 ? "−90°" : `${angle}°`;
    if (reset.textContent !== angleLabel) reset.textContent = angleLabel;
    reset.setAttribute("aria-label", `현재 각도 ${angleLabel}. 원래 방향으로`);
    left.disabled = adPlaying;
    right.disabled = adPlaying;
    reset.disabled = adPlaying || angle === 0;
    const scale = preferences.videoSize / 100;
    if ((!angle && scale === 1) || adPlaying) {
      clearPlayerLayout();
      return;
    }

    const slotHeight = slide.clientHeight || container.clientHeight;
    const panelOpen = shorts.hasAttribute("is-watch-while-mode") &&
      !shorts.hasAttribute("small-screen-persistent-panel") &&
      !reel.hasAttribute("small-screen-squeezeback");
    const panelWidth = panelOpen ? shorts.querySelector("#anchored-panel")?.offsetWidth ?? 0 : 0;
    // The native action rail sits to the right of the centered player.
    const availableWidth = Math.max(1, container.clientWidth - panelWidth - (panelWidth ? 112 : 160));
    const sourceRatio = video.videoWidth && video.videoHeight ? video.videoWidth / video.videoHeight : 9 / 16;
    const quarterTurn = angle % 180 !== 0;
    const outputRatio = quarterTurn ? 1 / sourceRatio : sourceRatio;
    const pictureWidth = Math.min(availableWidth, slotHeight * outputRatio) * scale;
    const pictureHeight = pictureWidth / outputRatio;
    // Zoom the picture while keeping the player inside its Shorts slot.
    const frameWidth = Math.min(pictureWidth, availableWidth);
    const frameHeight = Math.min(pictureHeight, slotHeight);
    const top = (slotHeight - frameHeight) / 2;
    const nextGeometry = [angle, frameWidth, frameHeight, top, pictureWidth, pictureHeight]
      .map((value) => value.toFixed(2)).join(":");
    if (nextGeometry === geometry) return;

    slide.style.setProperty(sizes.width, `${frameWidth}px`);
    reel.style.setProperty(sizes.width, `${frameWidth}px`);
    reel.style.setProperty(sizes.height, `${frameHeight}px`);
    reel.style.setProperty(sizes.top, `${top}px`);
    reel.style.setProperty(sizes.sourceWidth, `${quarterTurn ? pictureHeight : pictureWidth}px`);
    reel.style.setProperty(sizes.sourceHeight, `${quarterTurn ? pictureWidth : pictureHeight}px`);
    reel.style.setProperty(sizes.centerY, `${frameHeight / 2}px`);
    reel.style.setProperty(sizes.angle, `${angle}deg`);
    slide.setAttribute(attributes.slide, "");
    reel.setAttribute(attributes.reel, "");
    video.setAttribute(attributes.video, "");
    geometry = nextGeometry;
  }

  // The Shorts feed is often reached through YouTube's same-document navigation.
  window.navigation.addEventListener("currententrychange", scheduleRefresh);
  document.addEventListener("yt-navigate-finish", scheduleRefresh);
  document.addEventListener("fullscreenchange", scheduleRefresh);
  window.addEventListener("resize", scheduleRefresh);
  watchRotationPreferences((updated) => {
    const previous = preferences;
    preferences = updated;
    const toolbarSizeChanged = previous?.toolbarSize !== updated.toolbarSize;
    if (toolbarSizeChanged) {
      toolbar.style.setProperty("--shorts-toolbar-scale", updated.toolbarSize / 100);
    }
    if (updated.enabled && (!previous?.enabled || toolbarSizeChanged || previous?.videoSize !== updated.videoSize)) {
      refresh();
    } else if (!updated.enabled && previous?.enabled !== false) {
      angle = 0;
      currentId = null;
      changes.disconnect();
      setActive(null);
    }
  }).catch((error) => console.warn("쇼츠 회전 설정을 불러오지 못했습니다.", error));
})();
