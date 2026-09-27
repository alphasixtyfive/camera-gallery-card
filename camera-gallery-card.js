const CAMERA_ID = /^camera\.[a-z0-9_]+$/;
const FIT_MODES = new Set(["cover", "contain", "fill"]);

function normalizeConfig(config) {
  if (!config?.card?.type) throw new Error("camera-gallery-card: card needs a card type");
  if (config.fit_mode !== undefined && !FIT_MODES.has(config.fit_mode)) {
    throw new Error("camera-gallery-card: fit_mode must be cover, contain, or fill");
  }
  const options = config.camera_options || {};
  if (typeof options !== "object" || Array.isArray(options)) {
    throw new Error("camera-gallery-card: camera_options must be a map");
  }
  const entities = [];
  const seen = new Set();
  function collect(card) {
    if (card?.type === "picture-entity" && CAMERA_ID.test(card.entity || "")) {
      if (seen.has(card.entity)) throw new Error(`camera-gallery-card: duplicate camera ${card.entity}`);
      seen.add(card.entity);
      if (!card.tap_action || card.tap_action.action === "more-info") entities.push(card.entity);
    }
    for (const child of card?.cards || []) collect(child);
  }
  collect(config.card);
  if (!entities.length) throw new Error("camera-gallery-card: card needs a picture-entity camera with a more-info tap action");
  for (const [entity, entry] of Object.entries(options)) {
    if (!entities.includes(entity)) throw new Error(`camera-gallery-card: camera_options has unknown camera ${entity}`);
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      throw new Error(`camera-gallery-card: options for ${entity} need a map`);
    }
    if (entry.viewer && (typeof entry.viewer !== "object" || !entry.viewer.type)) {
      throw new Error(`camera-gallery-card: viewer for ${entity} needs a card type`);
    }
    if (entry.name !== undefined && (typeof entry.name !== "string" || !entry.name.trim())) {
      throw new Error(`camera-gallery-card: name for ${entity} needs text`);
    }
    if (entry.icon !== undefined && (typeof entry.icon !== "string" || !entry.icon.trim())) {
      throw new Error(`camera-gallery-card: icon for ${entity} needs a name`);
    }
    if (entry.fit_mode !== undefined && !FIT_MODES.has(entry.fit_mode)) {
      throw new Error(`camera-gallery-card: fit_mode for ${entity} must be cover, contain, or fill`);
    }
    if (entry.group !== undefined && (typeof entry.group !== "string" || !entry.group.trim())) {
      throw new Error(`camera-gallery-card: group for ${entity} needs a name`);
    }
    if (entry.action && (!entry.action.label || typeof entry.action.path !== "string" || !/^\/(?!\/)/.test(entry.action.path))) {
      throw new Error(`camera-gallery-card: action for ${entity} needs a local path and label`);
    }
  }
  const popup = config.popup || {};
  if (!popup || typeof popup !== "object" || Array.isArray(popup)) throw new Error("camera-gallery-card: popup must be a map");
  if (Object.keys(popup).some((key) => key !== "source")) {
    throw new Error("camera-gallery-card: popup only supports source");
  }
  if (popup.source && (typeof popup.source !== "object" || Array.isArray(popup.source) ||
      typeof popup.source.dashboard !== "string" || !popup.source.dashboard ||
      typeof popup.source.view !== "string" || !popup.source.view)) {
    throw new Error("camera-gallery-card: popup.source needs dashboard and view");
  }
  return {
    card: config.card,
    openers: entities,
    entries: entities.map((entity) => ({ entity, ...options[entity] })),
    source: popup.source,
    fitMode: config.fit_mode,
  };
}

function findGallery(config, viewPath) {
  const view = config.views?.find((item) => item.path === viewPath);
  if (!view) throw new Error(`camera-gallery-card: source view ${viewPath} not found`);
  const found = [];
  function visit(node) {
    if (!node || typeof node !== "object") return;
    if (node.type === "custom:camera-gallery-card") found.push(node);
    for (const item of node.cards || []) visit(item);
    for (const section of node.sections || []) visit(section);
  }
  visit(view);
  if (found.length !== 1 || found[0].popup?.source) {
    throw new Error("camera-gallery-card: source view needs one gallery with its own camera list");
  }
  return normalizeConfig(found[0]);
}

const styles = `
  :host { display: block; min-width: 0; font-family: var(--ha-font-family-body, inherit); font-size: var(--ha-font-size-m, 14px); }
  .preview > * { display: block; }
  .side button:focus-visible, .action:focus-visible, .switcher:focus-visible { outline: 3px solid var(--primary-color); outline-offset: -3px; }
  ha-adaptive-dialog { --dialog-content-padding: 0; --ha-bottom-sheet-height: calc(100dvh - max(var(--safe-area-inset-top, 0px), 48px)); --ha-bottom-sheet-max-height: var(--ha-bottom-sheet-height); }
  h2 { min-width: 0; margin: 0; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; font: inherit; }
  .action, .switcher { display: inline-flex; align-items: center; justify-content: center; gap: 8px; min-height: 44px; border: 0; border-radius: var(--ha-button-border-radius, var(--ha-border-radius-md, 8px)); font: inherit; color: var(--primary-color); background: transparent; cursor: pointer; }
  .action[hidden] { display: none; }
  .action, .switcher { padding: 0 12px; }
  .switcher { display: none; }
  .action:hover, .switcher:hover { background: var(--secondary-background-color, rgba(127,127,127,.12)); }
  .content { position: relative; display: grid; grid-template-columns: minmax(0,1fr) clamp(280px, 20vw, 340px); height: calc(100dvh - 140px); min-height: 0; overflow: clip; }
  .stage { position: relative; display: grid; place-items: center; min-width: 0; min-height: 0; overflow: hidden; background: var(--primary-background-color, #fafafa); }
  .viewer { width: min(100%, 160vh); max-height: 100%; }
  .viewer > * { display: block; width: 100%; }
  .viewer[data-native] { width: 100%; height: 100%; max-height: none; }
  .viewer[data-native] > * { height: 100%; --ha-card-border-radius: 0px; }
  .viewer[role="alert"] { padding: 24px; box-sizing: border-box; text-align: center; }
  .swipe-preview { position: absolute; inset: 0; display: grid; place-items: center; visibility: hidden; pointer-events: none; background: var(--primary-background-color, #fafafa); }
  .swipe-preview img { width: 100%; height: 100%; object-fit: cover; visibility: hidden; }
  .swipe-preview[data-fit="contain"] img { object-fit: contain; }
  .swipe-preview[data-fit="fill"] img { object-fit: fill; }
  .swipe-preview[data-image-ready] img { visibility: visible; }
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
  @media (max-width: 870px), (max-height: 500px) {
    .content { height: calc(100dvh - max(var(--safe-area-inset-top, 0px), 48px) - 68px); }
    .content { display: block; }
    .stage { height: 100%; }
    .switcher { display: inline-flex; }
    .drawer-scrim { position: absolute; inset: 0; z-index: 1; background: rgba(0,0,0,.48); }
    .side { position: absolute; inset: auto 0 0; z-index: 2; box-sizing: border-box; max-height: min(65%, 600px); border-left: 0; border-top: 1px solid var(--divider-color, rgba(127,127,127,.25)); border-radius: var(--ha-border-radius-2xl, 24px) var(--ha-border-radius-2xl, 24px) 0 0; padding-bottom: max(12px, env(safe-area-inset-bottom)); background: var(--ha-dialog-surface-background, var(--card-background-color, var(--ha-color-surface-default, #fff))); box-shadow: var(--dialog-box-shadow, var(--ha-box-shadow-l, 0 -8px 28px rgba(0,0,0,.22))); transform: translateY(100%); visibility: hidden; transition: transform .2s ease, visibility 0s .2s; }
    ha-adaptive-dialog[data-drawer-open] .drawer-scrim { display: block; }
    ha-adaptive-dialog[data-drawer-open] .side { transform: translateY(0); visibility: visible; transition: transform .2s ease; }
    .side h3 { margin: 0 12px 6px; }
  }
  @media (max-width: 410px) { .action .label, .switcher .label { display: none; } .action, .switcher { width: 44px; padding: 0; } }
  @media (prefers-reduced-motion: reduce) { .side, ha-adaptive-dialog[data-drawer-open] .side, .stage[data-swipe-animating] .viewer, .stage[data-swipe-animating] .swipe-preview { transition: none; } }
`;

class CameraGalleryCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this.shadowRoot.innerHTML = `
      <style>${styles}</style>
      <div class="preview"></div>
      <ha-adaptive-dialog width="full" flexcontent aria-labelledby="camera-gallery-title">
        <h2 slot="headerTitle" id="camera-gallery-title"></h2>
        <button class="action" slot="headerActionItems" type="button" hidden>
          <ha-icon icon="mdi:open-in-new" aria-hidden="true"></ha-icon><span class="label"></span>
        </button>
        <button class="switcher" slot="headerActionItems" type="button" aria-label="Show cameras" aria-expanded="false" aria-controls="camera-gallery-list">
          <ha-icon icon="mdi:view-list" aria-hidden="true"></ha-icon><span class="label">Cameras</span>
        </button>
        <div class="content">
          <div class="stage"><div class="viewer"></div><div class="swipe-preview" aria-hidden="true"><img alt=""></div></div>
          <div class="drawer-scrim"></div>
          <aside class="side" id="camera-gallery-list" aria-label="Cameras">
            <h3>Cameras</h3><div class="side-list"></div>
          </aside>
        </div>
      </ha-adaptive-dialog>
    `;
    this._preview = this.shadowRoot.querySelector(".preview");
    this._dialog = this.shadowRoot.querySelector("ha-adaptive-dialog");
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
    this._previewCard = null;
    this._listButtons = new Map();
    this._entries = [];
    this._previewRevision = 0;
    this._viewerRevision = 0;
    this._swipeStart = null;
    this._swipeTimer = null;
    this._onResize = () => this._syncViewerSize();
    this._swipeImage.addEventListener("load", () => this._swipePreview.setAttribute("data-image-ready", ""));
    this._swipeImage.addEventListener("error", () => this._swipePreview.removeAttribute("data-image-ready"));
    this._dialog.addEventListener("closed", async (event) => {
      const source = event.composedPath()[0];
      // A camera viewer may emit its own closed event inside the popup.
      if (source !== this._dialog && source?.parentNode !== this._dialog.shadowRoot) return;
      await this._dialog.updateComplete;
      this._resolveClose?.();
      this._resolveClose = null;
      this._closeDone = null;
      this._dialog.open = false;
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
    this.addEventListener("hass-more-info", (event) => {
      const entity = event.detail?.entityId;
      if (!event.composedPath().includes(this._previewCard) || !this._config?.openers.includes(entity)) return;
      event.stopPropagation();
      const opener = event.composedPath().find((node) => node instanceof HTMLElement && node.tabIndex >= 0);
      this._openFromPreview(entity, opener);
    });
  }

  setConfig(config) {
    const signature = JSON.stringify(config);
    if (signature === this._configSignature) return;
    this._config = normalizeConfig(config);
    this._configSignature = signature;
    this._entries = this._config.entries;
    this._fitMode = this._config.fitMode;
    this._sourcePromise = null;
    this._sourceError = null;
    this._sourceRevision = (this._sourceRevision || 0) + 1;
    this._listSignature = null;
    if (this._dialog.open) this._requestClose();
    this._buildPreview();
    this._loadSource();
  }

  connectedCallback() {
    window.addEventListener("resize", this._onResize);
    this._buildPreview();
    this._loadSource();
  }

  disconnectedCallback() {
    this._sourceRevision++;
    this._sourcePromise = null;
    this._queuedOpen = null;
    window.removeEventListener("resize", this._onResize);
    this._previewRevision++;
    this._viewerRevision++;
    if (this._dialog.open) this._requestClose();
    this._teardownViewer();
  }

  set hass(hass) {
    this._hass = hass;
    if (this._previewCard) this._previewCard.hass = hass;
    if (this._activeCard) this._activeCard.hass = hass;
    if (this._dialog.open) this._updateLabels();
    this._loadSource();
  }

  getCardSize() {
    return this._previewCard?.getCardSize?.() || 3;
  }

  _name(entry) { return entry.name || this._hass?.states?.[entry.entity]?.attributes?.friendly_name || entry.entity; }

  _loadSource() {
    const source = this._config?.source;
    if (!source || !this.isConnected || !this._hass || this._sourcePromise) return this._sourcePromise;
    const revision = this._sourceRevision;
    this._sourceError = null;
    this._sourcePromise = Promise.resolve()
      .then(() => this._hass.callWS({ type: "lovelace/config", url_path: source.dashboard }))
      .then((dashboard) => {
        const gallery = findGallery(dashboard, source.view);
        if (revision !== this._sourceRevision || !this.isConnected) return;
        this._entries = gallery.entries;
        this._fitMode = this._config.fitMode || gallery.fitMode;
        this._listSignature = null;
        if (this._dialog.open) this._updateLabels();
      })
      .catch((error) => {
        if (revision === this._sourceRevision) this._sourceError = error;
      });
    return this._sourcePromise;
  }

  async _openFromPreview(entity, opener) {
    const revision = this._sourceRevision;
    try {
      if (this._sourceError) this._sourcePromise = null;
      await this._loadSource();
      if (this._sourceError) throw this._sourceError;
      if (!this._entries.some((entry) => entry.entity === entity)) {
        throw new Error(`camera-gallery-card: ${entity} is missing from the popup source`);
      }
      if (revision === this._sourceRevision && this.isConnected) this._open(entity, opener);
    } catch (error) {
      console.error("camera-gallery-card: unable to load popup cameras", error);
      if (revision === this._sourceRevision && this.isConnected) {
        this.dispatchEvent(new window.CustomEvent("hass-more-info", { bubbles: true, composed: true, detail: { entityId: entity } }));
      }
    }
  }

  async _buildPreview() {
    const revision = ++this._previewRevision;
    if (!this._config || !this.isConnected) return;
    try {
      const helpers = await window.loadCardHelpers();
      if (revision !== this._previewRevision || !this.isConnected) return;
      const card = helpers.createCardElement(this._config.card);
      if (this._hass) card.hass = this._hass;
      this._previewCard = card;
      this._preview.replaceChildren(card);
    } catch (error) {
      if (revision !== this._previewRevision) return;
      this._previewCard = null;
      this._preview.textContent = "Cameras unavailable";
      console.error("camera-gallery-card: unable to create camera card", error);
    }
  }

  _open(entity, opener) {
    if (!this._entries.some((entry) => entry.entity === entity)) return;
    if (this._closeDone) {
      this._queuedOpen = { entity, opener };
      if (!this._reopenQueued) {
        this._reopenQueued = true;
        this._closeDone.then(() => {
          this._reopenQueued = false;
          const next = this._queuedOpen;
          this._queuedOpen = null;
          if (this.isConnected && next) this._open(next.entity, next.opener);
        });
      }
      return;
    }
    this._opener = opener;
    if (!this._dialog.open) {
      this._teardownViewer();
      this._dialog.open = true;
    }
    this._select(entity);
  }

  _startSwipe(event) {
    if (this._stage.hasAttribute("data-swipe-animating")) return;
    this._resetSwipe();
    if (!this._dialog.open || this._dialog.hasAttribute("data-drawer-open") ||
        !window.matchMedia("(max-width: 870px), (max-height: 500px)").matches || event.touches.length !== 1 || this._entries.length < 2 ||
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
      this._swipePreview.dataset.fit = this._viewerFitMode(adjacent);
      this._swipePreview.removeAttribute("data-image-ready");
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
    this._viewer.removeAttribute("role");
    this._viewer.removeAttribute("data-native");
    this._activeCard = null;
    this._activeConfig = null;
  }

  _requestClose() {
    if (!this._dialog.open || this._closeDone) return;
    this._setDrawerOpen(false, false);
    this._closeDone = new Promise((resolve) => { this._resolveClose = resolve; });
    this._dialog.open = false;
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
    const signature = this._configSignature;
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

  _viewerFitMode(entry) {
    return entry.fit_mode || this._fitMode ||
      (window.matchMedia("(max-width: 870px), (max-height: 500px)").matches ? "contain" : "cover");
  }

  _syncViewerSize() {
    if (!this._activeConfig || !this._activeCard?.setConfig) return;
    const aspect_ratio = this._viewerRatio();
    const entry = this._entries.find((item) => item.entity === this._selected);
    if (!entry) return;
    const fit_mode = this._viewerFitMode(entry);
    if (aspect_ratio === this._activeConfig.aspect_ratio && fit_mode === this._activeConfig.fit_mode) return;
    this._activeConfig = { ...this._activeConfig, aspect_ratio, fit_mode };
    this._activeCard.setConfig(this._activeConfig);
  }

  async _buildViewer(fromSwipe = false) {
    const revision = ++this._viewerRevision;
    this._activeCard = null;
    this._activeConfig = null;
    this._viewer.replaceChildren();
    this._viewer.removeAttribute("role");
    const entry = this._entries.find((item) => item.entity === this._selected);
    if (!entry) return;
    this._viewer.toggleAttribute("data-native", !entry.viewer);
    try {
      const helpers = await window.loadCardHelpers();
      await new Promise((resolve) => window.requestAnimationFrame(resolve));
      if (revision !== this._viewerRevision || !this._dialog.open || this._selected !== entry.entity) return;
      const cardConfig = entry.viewer || {
        type: "picture-entity", entity: entry.entity, show_name: false, show_state: false,
        camera_view: entry.viewer_view || "live", aspect_ratio: this._viewerRatio(),
        fit_mode: this._viewerFitMode(entry), tap_action: { action: "none" },
      };
      const card = helpers.createCardElement(cardConfig);
      if (this._hass) card.hass = this._hass;
      this._activeCard = card;
      this._activeConfig = entry.viewer ? null : cardConfig;
      this._viewer.replaceChildren(card);
      if (fromSwipe) this._resetSwipe();
    } catch (error) {
      if (revision !== this._viewerRevision) return;
      this._viewer.textContent = "Camera viewer unavailable";
      this._viewer.setAttribute("role", "alert");
      if (fromSwipe) this._resetSwipe();
      console.error("camera-gallery-card: unable to create camera viewer", error);
    }
  }
}

if (!customElements.get("camera-gallery-card")) customElements.define("camera-gallery-card", CameraGalleryCard);
window.customCards = window.customCards || [];
if (!window.customCards.some((card) => card.type === "camera-gallery-card")) {
  window.customCards.push({ type: "camera-gallery-card", name: "Camera Gallery Card", preview: false, description: "Native camera previews with a switchable large viewer." });
}

export { CameraGalleryCard, normalizeConfig };
