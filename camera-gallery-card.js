const CAMERA_ID = /^camera\.[a-z0-9_]+$/;
const FIT_MODES = new Set(["cover", "contain", "fill"]);

function normalizeConfig(config) {
  if (!config || (config.cameras !== "all" && !Array.isArray(config.cameras))) {
    throw new Error("camera-gallery-card: set cameras to an entity list or 'all'");
  }
  if (Array.isArray(config.cameras) && !config.cameras.length) {
    throw new Error("camera-gallery-card: cameras cannot be empty");
  }
  if (config.exclude !== undefined && !Array.isArray(config.exclude)) {
    throw new Error("camera-gallery-card: exclude must be a list");
  }
  if (config.fit_mode !== undefined && !FIT_MODES.has(config.fit_mode)) {
    throw new Error("camera-gallery-card: fit_mode must be cover, contain, or fill");
  }
  const exclude = new Set(config.exclude || []);
  for (const id of exclude) {
    if (!CAMERA_ID.test(id)) throw new Error(`camera-gallery-card: invalid excluded camera ${id}`);
  }
  const cameras = config.cameras === "all" ? "all" : config.cameras.map((camera) => {
    const entry = typeof camera === "string" ? { entity: camera } : camera;
    if (!entry || !CAMERA_ID.test(entry.entity)) {
      throw new Error(`camera-gallery-card: invalid camera ${String(entry?.entity || camera)}`);
    }
    if (entry.viewer && (typeof entry.viewer !== "object" || !entry.viewer.type)) {
      throw new Error(`camera-gallery-card: viewer for ${entry.entity} needs a card type`);
    }
    if (entry.name !== undefined && (typeof entry.name !== "string" || !entry.name.trim())) {
      throw new Error(`camera-gallery-card: name for ${entry.entity} needs text`);
    }
    if (entry.icon !== undefined && (typeof entry.icon !== "string" || !entry.icon.trim())) {
      throw new Error(`camera-gallery-card: icon for ${entry.entity} needs a name`);
    }
    if (entry.fit_mode !== undefined && !FIT_MODES.has(entry.fit_mode)) {
      throw new Error(`camera-gallery-card: fit_mode for ${entry.entity} must be cover, contain, or fill`);
    }
    if (entry.group !== undefined && (typeof entry.group !== "string" || !entry.group.trim())) {
      throw new Error(`camera-gallery-card: group for ${entry.entity} needs a name`);
    }
    if (entry.action && (!entry.action.label || typeof entry.action.path !== "string" || !/^\/(?!\/)/.test(entry.action.path))) {
      throw new Error(`camera-gallery-card: action for ${entry.entity} needs a local path and label`);
    }
    return { ...entry };
  });
  const columns = Number(config.columns ?? 5);
  if (!Number.isInteger(columns) || columns < 1 || columns > 8) {
    throw new Error("camera-gallery-card: columns must be between 1 and 8");
  }
  if (config.show_gallery_groups !== undefined && typeof config.show_gallery_groups !== "boolean") {
    throw new Error("camera-gallery-card: show_gallery_groups must be true or false");
  }
  return { cameras, exclude, columns, fitMode: config.fit_mode || "cover", showGalleryGroups: config.show_gallery_groups || false };
}

function cameraEntries(config, states) {
  const source = config.cameras === "all"
    ? Object.keys(states || {}).filter((id) => CAMERA_ID.test(id)).sort((a, b) => {
      const nameA = states[a]?.attributes?.friendly_name || a;
      const nameB = states[b]?.attributes?.friendly_name || b;
      return nameA.localeCompare(nameB, undefined, { numeric: true, sensitivity: "base" }) || a.localeCompare(b);
    }).map((entity) => ({ entity }))
    : config.cameras;
  const seen = new Set();
  const entries = [];
  let group;
  for (const entry of source) {
    if (entry.group) group = entry.group;
    if (config.exclude.has(entry.entity) || seen.has(entry.entity)) continue;
    seen.add(entry.entity);
    entries.push(group ? { ...entry, group } : entry);
    group = undefined;
  }
  return entries;
}

function frameRatio(value) {
  const ratio = String(value || "16:9").match(/^(\d+(?:\.\d+)?)(?:[:x](\d+(?:\.\d+)?))?$/);
  if (ratio) return `${ratio[1]} / ${ratio[2] || 1}`;
  const percent = String(value).match(/^(\d+(?:\.\d+)?)%$/);
  return percent ? `100 / ${percent[1]}` : "16 / 9";
}

const styles = `
  :host { display: block; min-width: 0; font-family: var(--ha-font-family-body, inherit); font-size: var(--ha-font-size-m, 14px); --gallery-dialog-radius: var(--ha-dialog-border-radius, var(--ha-border-radius-3xl, 24px)); --gallery-dialog-inline-inset: 16px; --gallery-dialog-block-inset: 16px; }
  .gallery { display: grid; grid-template-columns: repeat(var(--gallery-columns), minmax(0, 1fr)); gap: var(--ha-space-2, 8px); }
  .gallery-group { grid-column: 1 / -1; margin: var(--ha-space-4, 16px) 0 0; font-size: var(--ha-font-size-l, 18px); font-weight: var(--ha-font-weight-medium, 500); line-height: 32px; }
  .gallery-group:first-child { margin-top: 0; }
  .tile { position: relative; min-width: 0; aspect-ratio: 16 / 9; overflow: hidden; border-radius: var(--ha-border-radius-lg, 16px); background: var(--card-background-color, #fff); }
  .tile > :first-child { display: block; width: 100%; height: 100%; pointer-events: none; }
  .tile button { position: absolute; inset: 0; width: 100%; border: 0; padding: 0; background: transparent; cursor: pointer; border-radius: inherit; }
  .tile button:focus-visible, .side button:focus-visible, .close:focus-visible, .action:focus-visible, .switcher:focus-visible { outline: 3px solid var(--primary-color); outline-offset: -3px; }
  .empty { display: grid; place-items: center; min-height: 120px; color: var(--secondary-text-color); }
  dialog {
    box-sizing: border-box;
    position: fixed;
    inset: auto;
    top: calc(env(safe-area-inset-top, 0px) + var(--gallery-dialog-block-inset));
    left: calc(env(safe-area-inset-left, 0px) + var(--gallery-dialog-inline-inset));
    width: calc(100dvw - env(safe-area-inset-left, 0px) - env(safe-area-inset-right, 0px) - var(--gallery-dialog-inline-inset) - var(--gallery-dialog-inline-inset));
    height: calc(100dvh - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px) - var(--gallery-dialog-block-inset) - var(--gallery-dialog-block-inset));
    max-width: none;
    max-height: none;
    margin: 0;
    padding: 0;
    border: 1px solid var(--divider-color, rgba(127,127,127,.25));
    border-radius: var(--gallery-dialog-radius);
    color: var(--primary-text-color);
    background: var(--ha-dialog-surface-background, var(--card-background-color, var(--ha-color-surface-default, #fff)));
    box-shadow: var(--dialog-box-shadow, var(--ha-box-shadow-l, 0 16px 48px rgba(0,0,0,.3)));
    overflow: hidden;
  }
  dialog::backdrop { background: rgba(0,0,0,.72); }
  .dialog-layout { display: flex; flex-direction: column; height: 100%; min-height: 0; }
  .header { display: flex; align-items: center; gap: var(--ha-space-2, 8px); min-height: 64px; box-sizing: border-box; padding: 8px; border-bottom: 1px solid var(--divider-color, rgba(127,127,127,.25)); }
  h2 { flex: 1; min-width: 0; margin: 0; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; font-size: var(--ha-font-size-xl, 20px); font-weight: var(--ha-font-weight-medium, 500); line-height: 1.3; }
  .close, .action, .switcher { display: inline-flex; align-items: center; justify-content: center; gap: 8px; min-height: 44px; border: 0; border-radius: var(--ha-button-border-radius, var(--ha-border-radius-md, 8px)); font: inherit; color: var(--primary-text-color); background: transparent; cursor: pointer; }
  .action[hidden] { display: none; }
  .close { width: 44px; flex: none; border-radius: var(--ha-border-radius-circle, 50%); }
  .action, .switcher { padding: 0 12px; color: var(--primary-color); }
  .switcher { display: none; }
  .close:hover, .action:hover, .switcher:hover { background: var(--secondary-background-color, rgba(127,127,127,.12)); }
  .content { position: relative; display: grid; grid-template-columns: minmax(0,1fr) clamp(280px, 20vw, 340px); flex: 1; min-height: 0; }
  .stage { position: relative; display: grid; place-items: center; min-width: 0; min-height: 0; overflow: hidden; background: var(--primary-background-color, #fafafa); }
  .viewer { width: min(100%, 160vh); max-height: 100%; }
  .viewer > * { display: block; width: 100%; }
  .viewer[data-native] { width: 100%; height: 100%; max-height: none; }
  .viewer[data-native] > * { height: 100%; }
  .viewer-message { color: var(--secondary-text-color); text-align: center; }
  .swipe-preview { position: absolute; inset: 0; display: grid; place-items: center; visibility: hidden; pointer-events: none; background: var(--primary-background-color, #fafafa); }
  .swipe-preview img { width: 100%; height: 100%; object-fit: cover; visibility: hidden; }
  .swipe-preview[data-fit="contain"] img { object-fit: contain; }
  .swipe-preview[data-fit="fill"] img { object-fit: fill; }
  .swipe-preview[data-image-ready] img { visibility: visible; }
  .swipe-preview .name { position: absolute; padding: 8px 12px; border-radius: var(--ha-card-border-radius, 12px); color: var(--primary-text-color); background: var(--card-background-color, #fff); }
  .swipe-preview[data-image-ready] .name { display: none; }
  .stage[data-swipe-active] .swipe-preview { visibility: visible; }
  .stage[data-swipe-animating] .viewer, .stage[data-swipe-animating] .swipe-preview { transition: transform 220ms cubic-bezier(.2, 0, 0, 1); }
  .drawer-scrim { display: none; }
  .side { min-height: 0; overflow: auto; border-left: 1px solid var(--divider-color, rgba(127,127,127,.25)); padding: 12px 8px; }
  .side h3 { margin: 8px 12px 12px; font-size: var(--ha-font-size-l, 16px); font-weight: var(--ha-font-weight-semibold, 600); line-height: 24px; color: var(--primary-text-color); }
  .side h4 { margin: 16px 12px 4px; font-size: var(--ha-font-size-m, 14px); font-weight: var(--ha-font-weight-semibold, 600); line-height: 20px; color: var(--secondary-text-color); }
  .side h4:first-child { margin-top: 4px; }
  .side button { display: flex; width: 100%; min-height: 48px; align-items: center; gap: 12px; box-sizing: border-box; padding: 8px 12px; border: 0; border-radius: var(--ha-button-border-radius, var(--ha-border-radius-md, 8px)); text-align: left; font: inherit; color: var(--primary-text-color); background: transparent; cursor: pointer; }
  .side button:hover { background: var(--secondary-background-color, rgba(127,127,127,.12)); }
  .side button[aria-current="true"] { color: var(--primary-color); background: color-mix(in srgb, var(--primary-color) 13%, transparent); font-weight: 600; }
  .side button ha-icon { flex: none; --mdc-icon-size: 22px; }
  .side .name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .side .unavailable { color: var(--secondary-text-color); font-size: 12px; }
  @media (min-width: 601px) { .gallery { padding: var(--ha-space-2, 8px) var(--ha-space-4, 16px); } }
  @media (min-width: 901px) { :host { --gallery-dialog-inline-inset: clamp(24px, 2.5vw, 48px); --gallery-dialog-block-inset: clamp(20px, 3vh, 32px); } }
  @media (max-width: 850px) { .gallery { grid-template-columns: repeat(min(3, var(--gallery-columns)), minmax(0, 1fr)); } }
  @media (max-width: 900px) {
    .content { display: block; }
    .stage { height: 100%; }
    .switcher { display: inline-flex; }
    .drawer-scrim { position: absolute; inset: 0; z-index: 1; background: rgba(0,0,0,.48); }
    .side { position: absolute; inset: auto 0 0; z-index: 2; box-sizing: border-box; max-height: min(65%, 600px); border-left: 0; border-top: 1px solid var(--divider-color, rgba(127,127,127,.25)); border-radius: var(--gallery-dialog-radius) var(--gallery-dialog-radius) 0 0; padding-bottom: max(12px, env(safe-area-inset-bottom)); background: var(--ha-dialog-surface-background, var(--card-background-color, var(--ha-color-surface-default, #fff))); box-shadow: var(--dialog-box-shadow, var(--ha-box-shadow-l, 0 -8px 28px rgba(0,0,0,.22))); transform: translateY(100%); visibility: hidden; transition: transform .2s ease, visibility 0s .2s; }
    dialog[data-drawer-open] .drawer-scrim { display: block; }
    dialog[data-drawer-open] .side { transform: translateY(0); visibility: visible; transition: transform .2s ease; }
    .side h3 { margin: 0 12px 6px; }
  }
  @media (max-width: 720px) { .gallery { grid-template-columns: repeat(min(2, var(--gallery-columns)), minmax(0, 1fr)); } }
  @media (max-width: 410px) { .action .label, .switcher .label { display: none; } .action, .switcher { width: 44px; padding: 0; } }
  @media (prefers-reduced-motion: reduce) { .side, dialog[data-drawer-open] .side, .stage[data-swipe-animating] .viewer, .stage[data-swipe-animating] .swipe-preview { transition: none; } }
`;

class CameraGalleryCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this.shadowRoot.innerHTML = `
      <style>${styles}</style>
      <div class="gallery"></div>
      <dialog aria-labelledby="camera-gallery-title">
        <div class="dialog-layout">
          <div class="header">
            <button class="close" type="button" aria-label="Close camera viewer" autofocus>
              <ha-icon icon="mdi:close" aria-hidden="true"></ha-icon>
            </button>
            <h2 id="camera-gallery-title"></h2>
            <button class="action" type="button" hidden>
              <ha-icon icon="mdi:open-in-new" aria-hidden="true"></ha-icon><span class="label"></span>
            </button>
            <button class="switcher" type="button" aria-label="Show cameras" aria-expanded="false" aria-controls="camera-gallery-list">
              <ha-icon icon="mdi:view-list" aria-hidden="true"></ha-icon><span class="label">Cameras</span>
            </button>
          </div>
          <div class="content">
            <div class="stage"><div class="viewer"></div><div class="swipe-preview" aria-hidden="true"><img alt=""><span class="name"></span></div></div>
            <div class="drawer-scrim"></div>
            <aside class="side" id="camera-gallery-list" aria-label="Cameras">
              <h3>Cameras</h3><div class="side-list"></div>
            </aside>
          </div>
        </div>
      </dialog>
    `;
    this._gallery = this.shadowRoot.querySelector(".gallery");
    this._dialog = this.shadowRoot.querySelector("dialog");
    this._title = this.shadowRoot.querySelector("h2");
    this._stage = this.shadowRoot.querySelector(".stage");
    this._viewer = this.shadowRoot.querySelector(".viewer");
    this._swipePreview = this.shadowRoot.querySelector(".swipe-preview");
    this._swipeImage = this._swipePreview.querySelector("img");
    this._side = this.shadowRoot.querySelector(".side");
    this._list = this.shadowRoot.querySelector(".side-list");
    this._action = this.shadowRoot.querySelector(".action");
    this._actionLabel = this.shadowRoot.querySelector(".action .label");
    this._switcher = this.shadowRoot.querySelector(".switcher");
    this._previewCards = new Map();
    this._listButtons = new Map();
    this._entries = [];
    this._galleryRevision = 0;
    this._viewerRevision = 0;
    this._swipeStart = null;
    this._swipeTimer = null;
    this._onResize = () => this._syncViewerSize();
    this._swipeImage.addEventListener("load", () => this._swipePreview.setAttribute("data-image-ready", ""));
    this._swipeImage.addEventListener("error", () => this._swipePreview.removeAttribute("data-image-ready"));
    this.shadowRoot.querySelector(".close").addEventListener("click", () => this._requestClose());
    this._dialog.addEventListener("cancel", (event) => {
      event.preventDefault();
      if (this._dialog.hasAttribute("data-drawer-open")) this._setDrawerOpen(false);
      else this._requestClose();
    });
    this._dialog.addEventListener("click", (event) => {
      if (event.target !== this._dialog) return;
      const box = this._dialog.getBoundingClientRect();
      if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) this._requestClose();
    });
    this._dialog.addEventListener("close", () => {
      if (this._dialog.open) return;
      this._setDrawerOpen(false, false);
      this._teardownViewer();
      if (this.isConnected && this._opener?.isConnected) this._opener.focus({ preventScroll: true });
      this._opener = null;
    });
    this._action.addEventListener("click", () => {
      const entry = this._entries.find((item) => item.entity === this._selected);
      if (!entry?.action) return;
      this._requestClose();
      history.pushState(null, "", entry.action.path);
      window.dispatchEvent(new Event("location-changed"));
    });
    this._switcher.addEventListener("click", () => this._setDrawerOpen(!this._dialog.hasAttribute("data-drawer-open")));
    this.shadowRoot.querySelector(".drawer-scrim").addEventListener("click", () => this._setDrawerOpen(false));
    this._stage.addEventListener("touchstart", (event) => this._startSwipe(event), { passive: true });
    this._stage.addEventListener("touchmove", (event) => this._moveSwipe(event), { passive: true });
    this._stage.addEventListener("touchend", (event) => this._endSwipe(event), { passive: true });
    this._stage.addEventListener("touchcancel", () => { if (!this._stage.hasAttribute("data-swipe-animating")) this._resetSwipe(); }, { passive: true });
    this._dialog.addEventListener("touchstart", (event) => { if (event.touches.length > 1 && !this._stage.hasAttribute("data-swipe-animating")) this._resetSwipe(); }, { passive: true });
  }

  setConfig(config) {
    this._config = normalizeConfig(config);
    this._gallery.style.setProperty("--gallery-columns", this._config.columns);
    this._galleryRevision++;
    if (this._dialog.open) this._requestClose();
    this._sync(true);
  }

  connectedCallback() {
    window.addEventListener("resize", this._onResize);
    this._sync(true);
  }

  disconnectedCallback() {
    window.removeEventListener("resize", this._onResize);
    this._galleryRevision++;
    this._viewerRevision++;
    if (this._dialog.open) this._requestClose();
    this._teardownViewer();
  }

  set hass(hass) {
    this._hass = hass;
    this._sync();
    for (const card of this._previewCards.values()) card.hass = hass;
    if (this._activeCard) this._activeCard.hass = hass;
    if (this._dialog.open) this._updateLabels();
  }

  getCardSize() {
    const columns = this._config?.columns || 5;
    if (!this._config?.showGalleryGroups) return Math.max(1, Math.ceil(this._entries.length / columns) * 2);
    let rows = 0;
    let groupSize = 0;
    let headings = 0;
    for (const entry of this._entries) {
      if (entry.group) {
        rows += Math.ceil(groupSize / columns);
        groupSize = 0;
        headings++;
      }
      groupSize++;
    }
    return Math.max(1, (rows + Math.ceil(groupSize / columns)) * 2 + headings);
  }

  _name(entry) { return entry.name || this._hass?.states?.[entry.entity]?.attributes?.friendly_name || entry.entity; }

  _sync(force = false) {
    if (!this._config || !this.isConnected) return;
    const entries = cameraEntries(this._config, this._hass?.states);
    const signature = entries.map((item) => `${item.entity}:${item.group || ""}`).join("|");
    if (!force && signature === this._signature) return;
    this._entries = entries;
    this._signature = signature;
    if (this._dialog.open && !entries.some((item) => item.entity === this._selected)) this._requestClose();
    this._openRequestedCamera();
    this._buildGallery();
  }

  _openRequestedCamera() {
    const url = new URL(window.location.href);
    const entity = url.searchParams.get("gallery_camera");
    if (!this._entries.some((entry) => entry.entity === entity)) return;
    url.searchParams.delete("gallery_camera");
    history.replaceState(history.state, "", url.pathname + url.search + url.hash);
    this._open(entity);
  }

  async _buildGallery() {
    const revision = ++this._galleryRevision;
    this._previewCards.clear();
    this._gallery.replaceChildren();
    if (!this._entries.length) {
      const empty = document.createElement("div");
      empty.className = "empty";
      empty.textContent = "No cameras selected";
      this._gallery.append(empty);
      return;
    }
    try {
      const helpers = await window.loadCardHelpers();
      if (revision !== this._galleryRevision || !this.isConnected) return;
      const fragment = document.createDocumentFragment();
      for (const entry of this._entries) {
        if (this._config.showGalleryGroups && entry.group) {
          const heading = document.createElement("h3");
          heading.className = "gallery-group";
          heading.textContent = entry.group;
          fragment.append(heading);
        }
        const tile = document.createElement("div");
        tile.className = "tile";
        tile.style.aspectRatio = frameRatio(entry.aspect_ratio);
        const card = helpers.createCardElement({
          type: "picture-entity", entity: entry.entity, show_name: false, show_state: false,
          camera_view: entry.preview_view || "auto", aspect_ratio: entry.aspect_ratio || "16:9",
          fit_mode: entry.fit_mode || this._config.fitMode,
          tap_action: { action: "none" }, hold_action: { action: "none" }, double_tap_action: { action: "none" }
        });
        if (this._hass) card.hass = this._hass;
        this._previewCards.set(entry.entity, card);
        const button = document.createElement("button");
        button.type = "button";
        button.setAttribute("aria-label", `Open ${this._name(entry)} camera`);
        button.addEventListener("click", () => this._open(entry.entity, button));
        if (this._dialog.open && !this._opener?.isConnected && entry.entity === this._selected) this._opener = button;
        tile.append(card, button);
        fragment.append(tile);
      }
      this._gallery.replaceChildren(fragment);
    } catch (error) {
      if (revision !== this._galleryRevision) return;
      this._gallery.textContent = "Cameras unavailable";
      console.error("camera-gallery-card: unable to create camera previews", error);
    }
  }

  _open(entity, opener) {
    if (!this._entries.some((entry) => entry.entity === entity)) return;
    this._opener = opener;
    if (!this._dialog.open) {
      this._teardownViewer();
      this._dialog.showModal();
    }
    this._select(entity);
  }

  _startSwipe(event) {
    if (this._stage.hasAttribute("data-swipe-animating")) return;
    this._resetSwipe();
    if (!this._dialog.open || this._dialog.hasAttribute("data-drawer-open") ||
        !window.matchMedia("(max-width: 900px)").matches || event.touches.length !== 1 || this._entries.length < 2 ||
        this._entries.find((entry) => entry.entity === this._selected)?.viewer) return;
    if (event.composedPath().some((node) =>
      node.matches?.("button, a, input, select, textarea, [role='button'], [role='slider'], [contenteditable='true'], ha-icon-button, mwc-icon-button") ||
      (node.localName === "video" && node.controls))) return;
    const touch = event.touches[0];
    this._swipeStart = { identifier: touch.identifier, x: touch.clientX, y: touch.clientY };
  }

  _moveSwipe(event) {
    const start = this._swipeStart;
    if (!start || event.touches.length !== 1) return;
    const touch = Array.from(event.touches).find((item) => item.identifier === start.identifier);
    if (touch) this._dragSwipe(touch);
  }

  _dragSwipe(touch) {
    const start = this._swipeStart;
    if (!start) return;
    const dx = touch.clientX - start.x;
    const dy = touch.clientY - start.y;
    if (!start.direction) {
      if (Math.abs(dx) < 12 || Math.abs(dx) < Math.abs(dy) * 1.2) return;
      const direction = Math.sign(dx);
      const index = this._entries.findIndex((entry) => entry.entity === this._selected);
      const adjacent = this._entries[index - direction];
      if (!adjacent) return;
      start.direction = direction;
      start.adjacent = adjacent.entity;
      this._swipePreview.dataset.fit = adjacent.fit_mode || this._config.fitMode;
      this._swipePreview.removeAttribute("data-image-ready");
      this._swipePreview.querySelector(".name").textContent = this._name(adjacent);
      const picture = this._hass?.states?.[adjacent.entity]?.attributes?.entity_picture;
      if (picture) this._swipeImage.src = this._hass?.hassUrl?.(picture) || picture;
      else this._swipeImage.removeAttribute("src");
    }
    this._stage.setAttribute("data-swipe-active", "");
    const offset = start.direction < 0 ? Math.min(dx, 0) : Math.max(dx, 0);
    this._viewer.style.transform = `translate3d(${offset}px, 0, 0)`;
    this._swipePreview.style.transform = `translate3d(calc(${offset}px ${start.direction < 0 ? "+" : "-"} 100%), 0, 0)`;
  }

  _endSwipe(event) {
    if (this._stage.hasAttribute("data-swipe-animating")) return;
    const start = this._swipeStart;
    this._swipeStart = null;
    if (!start || !this._dialog.open || this._dialog.hasAttribute("data-drawer-open") || event.touches.length) {
      this._resetSwipe();
      return;
    }
    const touch = Array.from(event.changedTouches).find((item) => item.identifier === start.identifier);
    if (!touch) { this._resetSwipe(); return; }
    this._swipeStart = start;
    this._dragSwipe(touch);
    this._swipeStart = null;
    const dx = touch.clientX - start.x;
    const dy = touch.clientY - start.y;
    const next = Math.sign(dx) === start.direction && Math.abs(dx) >= 72 && Math.abs(dx) >= Math.abs(dy) * 1.5 ? start.adjacent : null;
    if (!this._stage.hasAttribute("data-swipe-active")) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      if (next) this._select(next);
      this._resetSwipe();
      return;
    }
    this._stage.setAttribute("data-swipe-animating", "");
    if (next) {
      this._viewer.style.transform = `translate3d(${start.direction * this._stage.clientWidth}px, 0, 0)`;
      this._swipePreview.style.transform = "translate3d(0, 0, 0)";
    } else {
      this._viewer.style.transform = "translate3d(0, 0, 0)";
      this._swipePreview.style.transform = `translate3d(${start.direction < 0 ? "100%" : "-100%"}, 0, 0)`;
    }
    const finish = () => {
      this._swipePreview.removeEventListener("transitionend", onTransitionEnd);
      this._swipeTransitionEnd = null;
      this._swipeTimer = null;
      if (next) this._select(next, true);
      else this._resetSwipe();
    };
    const onTransitionEnd = (transition) => {
      if (transition.propertyName === "transform") {
        window.clearTimeout(this._swipeTimer);
        finish();
      }
    };
    this._swipePreview.addEventListener("transitionend", onTransitionEnd);
    this._swipeTransitionEnd = onTransitionEnd;
    this._swipeTimer = window.setTimeout(finish, 260);
  }

  _resetSwipe() {
    this._swipeStart = null;
    if (this._swipeTimer) window.clearTimeout(this._swipeTimer);
    if (this._swipeTransitionEnd) this._swipePreview.removeEventListener("transitionend", this._swipeTransitionEnd);
    this._swipeTimer = null;
    this._swipeTransitionEnd = null;
    this._stage.removeAttribute("data-swipe-active");
    this._stage.removeAttribute("data-swipe-animating");
    this._viewer.style.transform = "";
    this._swipePreview.style.transform = "";
  }

  _setDrawerOpen(open, focus = true) {
    this._resetSwipe();
    this._dialog.toggleAttribute("data-drawer-open", open);
    // A tap during the drawer animation can scroll the clipped dialog.
    this._dialog.scrollTop = 0;
    this._switcher.setAttribute("aria-expanded", String(open));
    this._switcher.setAttribute("aria-label", open ? "Hide cameras" : "Show cameras");
    if (!focus || !this._dialog.open) return;
    if (open) {
      this._updateLabels(true);
      this._listButtons.get(this._selected)?.button.focus({ preventScroll: true });
    } else {
      this._switcher.focus({ preventScroll: true });
    }
  }

  _teardownViewer() {
    this._resetSwipe();
    this._viewerRevision++;
    this._viewer.replaceChildren();
    this._viewer.removeAttribute("data-native");
    this._activeCard = null;
    this._activeConfig = null;
  }

  _requestClose() {
    if (!this._dialog.open) return;
    this._setDrawerOpen(false, false);
    this._teardownViewer();
    this._dialog.close();
  }

  _select(entity, fromSwipe = false) {
    if (!this._dialog.open || !this._entries.some((entry) => entry.entity === entity)) return;
    if (!fromSwipe) this._resetSwipe();
    if (this._selected === entity && this._activeCard) {
      if (this._dialog.hasAttribute("data-drawer-open")) this._setDrawerOpen(false);
      return;
    }
    this._selected = entity;
    this._updateLabels(true);
    if (this._dialog.hasAttribute("data-drawer-open")) this._setDrawerOpen(false);
    this._buildViewer(fromSwipe);
  }

  _updateLabels(scroll = false) {
    const entry = this._entries.find((item) => item.entity === this._selected);
    if (!entry) return;
    const title = this._name(entry);
    if (this._title.textContent !== title) this._title.textContent = title;
    this._action.hidden = !entry.action;
    if (entry.action) {
      this._actionLabel.textContent = entry.action.label;
      this._action.setAttribute("aria-label", entry.action.label);
    }
    const signature = this._signature;
    if (signature !== this._listSignature) {
      this._listSignature = signature;
      this._listButtons.clear();
      this._list.replaceChildren();
      for (const item of this._entries) {
        if (item.group) {
          const heading = document.createElement("h4");
          heading.textContent = item.group;
          this._list.append(heading);
        }
        const button = document.createElement("button");
        button.type = "button";
        const icon = document.createElement("ha-icon");
        icon.setAttribute("aria-hidden", "true");
        const name = document.createElement("span");
        name.className = "name";
        const status = document.createElement("span");
        status.className = "unavailable";
        status.textContent = "Unavailable";
        button.append(icon, name, status);
        button.addEventListener("click", () => this._select(item.entity));
        this._listButtons.set(item.entity, { button, icon, name, status });
        this._list.append(button);
      }
    }
    for (const item of this._entries) {
      const row = this._listButtons.get(item.entity);
      const current = item.entity === this._selected ? "true" : "false";
      const name = this._name(item);
      const icon = item.icon || "mdi:cctv";
      const hideStatus = !["unavailable", "unknown"].includes(this._hass?.states?.[item.entity]?.state);
      if (row.button.getAttribute("aria-current") !== current) row.button.setAttribute("aria-current", current);
      if (row.icon.getAttribute("icon") !== icon) row.icon.setAttribute("icon", icon);
      if (row.name.textContent !== name) row.name.textContent = name;
      if (row.status.hidden !== hideStatus) row.status.hidden = hideStatus;
    }
    if (scroll && window.getComputedStyle(this._side).visibility === "visible") {
      const selected = this._listButtons.get(this._selected)?.button;
      const listBox = this._side.getBoundingClientRect();
      const buttonBox = selected?.getBoundingClientRect();
      if (buttonBox?.top < listBox.top) this._side.scrollTop -= listBox.top - buttonBox.top + 8;
      else if (buttonBox?.bottom > listBox.bottom) this._side.scrollTop += buttonBox.bottom - listBox.bottom + 8;
    }
  }

  _viewerRatio() {
    const { width, height } = this._viewer.getBoundingClientRect();
    return width > 0 && height > 0 ? `${Math.round(width)}:${Math.round(height)}` : "16:9";
  }

  _syncViewerSize() {
    if (!this._activeConfig || !this._activeCard?.setConfig) return;
    const aspect_ratio = this._viewerRatio();
    if (aspect_ratio === this._activeConfig.aspect_ratio) return;
    this._activeConfig = { ...this._activeConfig, aspect_ratio };
    this._activeCard.setConfig(this._activeConfig);
  }

  async _buildViewer(fromSwipe = false) {
    const revision = ++this._viewerRevision;
    this._activeCard = null;
    this._activeConfig = null;
    this._viewer.replaceChildren();
    const message = document.createElement("div");
    message.className = "viewer-message";
    message.setAttribute("role", "status");
    message.textContent = "Loading camera…";
    this._viewer.append(message);
    const entry = this._entries.find((item) => item.entity === this._selected);
    if (!entry) return;
    this._viewer.toggleAttribute("data-native", !entry.viewer);
    try {
      const helpers = await window.loadCardHelpers();
      if (revision !== this._viewerRevision || !this._dialog.open || this._selected !== entry.entity) return;
      const cardConfig = entry.viewer || {
        type: "picture-entity", entity: entry.entity, show_name: false, show_state: false,
        camera_view: entry.viewer_view || "live", aspect_ratio: this._viewerRatio(),
        fit_mode: entry.fit_mode || this._config.fitMode, tap_action: { action: "none" }
      };
      const card = helpers.createCardElement(cardConfig);
      if (this._hass) card.hass = this._hass;
      this._activeCard = card;
      this._activeConfig = entry.viewer ? null : cardConfig;
      this._viewer.replaceChildren(card);
      if (fromSwipe) this._resetSwipe();
    } catch (error) {
      if (revision !== this._viewerRevision) return;
      message.textContent = "Camera viewer unavailable";
      message.setAttribute("role", "alert");
      if (fromSwipe) this._resetSwipe();
      console.error("camera-gallery-card: unable to create camera viewer", error);
    }
  }
}

if (!customElements.get("camera-gallery-card")) customElements.define("camera-gallery-card", CameraGalleryCard);
window.customCards = window.customCards || [];
if (!window.customCards.some((card) => card.type === "camera-gallery-card")) {
  window.customCards.push({ type: "camera-gallery-card", name: "Camera Gallery Card", preview: false, description: "A camera wall with a large switchable viewer." });
}

export { CameraGalleryCard, normalizeConfig, cameraEntries };
