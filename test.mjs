import assert from "node:assert/strict";
import { Window } from "happy-dom";

const window = new Window({ url: "http://localhost:8123/dashboard-tablet/cameras" });
Object.assign(globalThis, { window, document: window.document, customElements: window.customElements, HTMLElement: window.HTMLElement, history: window.history, Event: window.Event });
window.matchMedia = () => ({ matches: false });
window.requestAnimationFrame = (callback) => setTimeout(callback, 0);

class FakeDialog extends window.HTMLElement {
  get open() { return this._open || false; }
  set open(value) {
    const wasOpen = this.open;
    this._open = Boolean(value);
    if (wasOpen && !this._open && !this._childClosed) setTimeout(() => {
      if (this.isConnected) this.dispatchEvent(new window.Event("closed"));
    }, 0);
    this._childClosed = false;
  }
  simulateNativeClose() {
    this._childClosed = true;
    this.dispatchEvent(new window.Event("closed"));
  }
  simulateSwipeClose() {
    this._childClosed = true;
    this.style.setProperty("--dialog-transform", "translateY(120px)");
    setTimeout(() => this.dispatchEvent(new window.Event("closed")), 25);
  }
}
customElements.define("ha-adaptive-dialog", FakeDialog);

const created = [];
window.loadCardHelpers = async () => ({ createCardElement(config) {
  const card = document.createElement("div");
  card.config = config;
  card.setConfig = (next) => { card.config = next; };
  card.getCardSize = () => 6;
  created.push(card);
  return card;
} });

const { CameraGalleryCard, normalizeConfig } = await import("./camera-gallery-card.js");
const native = { type: "vertical-stack", cards: [
  { type: "custom:mushroom-title-card", subtitle: "Home" },
  { type: "grid", columns: 2, square: false, cards: [
    { type: "picture-entity", entity: "camera.gate", camera_view: "auto", fit_mode: "cover" },
    { type: "picture-entity", entity: "camera.hallway", camera_view: "auto" },
  ] },
] };
const config = { card: native, camera_options: {
  "camera.gate": { group: "Home", name: "Gate", icon: "mdi:doorbell-video", action: { label: "Open intercom", path: "/dashboard-intercom/front-gate" } },
} };
assert.deepEqual(normalizeConfig(config).entries.map(({ entity }) => entity), ["camera.gate", "camera.hallway"]);
assert.equal(normalizeConfig(config).card, native, "native preview config remains untouched");
assert.throws(() => normalizeConfig({}), /card needs/);
assert.throws(() => normalizeConfig({ card: { type: "grid", cards: [] } }), /picture-entity/);
assert.throws(() => normalizeConfig({ ...config, camera_options: { "camera.other": {} } }), /unknown camera/);
assert.throws(() => normalizeConfig({ card: { type: "grid", cards: [native.cards[1].cards[0], native.cards[1].cards[0]] } }), /duplicate camera/);
assert.throws(() => normalizeConfig({ card: { type: "picture-entity", entity: "camera.gate", tap_action: { action: "navigate" } } }), /more-info tap action/);
assert.throws(() => normalizeConfig({ ...config, popup: { card: { type: "picture-entity" } } }), /popup only supports source/);
assert.throws(() => normalizeConfig({ ...config, popup: { source: { view: "cameras" } } }), /popup.source/);

const gallery = new CameraGalleryCard();
gallery.setConfig(config);
document.body.append(gallery);
gallery.hass = { states: {
  "camera.gate": { state: "idle", attributes: { friendly_name: "Front gate" } },
  "camera.hallway": { state: "unavailable", attributes: { friendly_name: "Hallway" } },
} };
await new Promise((resolve) => setTimeout(resolve, 0));
const preview = gallery.shadowRoot.querySelector(".preview").firstElementChild;
assert.equal(preview.config, native);
assert.equal(gallery.getCardSize(), 6);
assert.equal(created.length, 1, "one native preview tree is mounted");

let escaped = 0;
document.body.addEventListener("hass-more-info", () => escaped++);
preview.dispatchEvent(new window.CustomEvent("hass-more-info", { bubbles: true, composed: true, detail: { entityId: "camera.gate" } }));
await new Promise((resolve) => setTimeout(resolve, 30));
assert.equal(escaped, 0, "gallery consumes camera more-info");
assert.equal(gallery.shadowRoot.querySelector("ha-adaptive-dialog").open, true);
assert.equal(gallery.shadowRoot.querySelector(".viewer").firstElementChild.config.entity, "camera.gate");
assert.equal(gallery.shadowRoot.querySelector(".viewer").firstElementChild.config.camera_view, "live");
assert.equal(gallery.shadowRoot.querySelector(".swipe-preview"), null, "no still-image overlay can cover the live viewer");
assert.equal(gallery.shadowRoot.querySelector("h2").textContent, "Gate");
assert.equal(gallery.shadowRoot.querySelector(".side button ha-icon").getAttribute("icon"), "mdi:doorbell-video");

const dialogBeforeChildClose = gallery.shadowRoot.querySelector("ha-adaptive-dialog");
gallery.shadowRoot.querySelector(".viewer").firstElementChild.dispatchEvent(new window.Event("closed", { bubbles: true, composed: true }));
assert.equal(gallery.shadowRoot.querySelector("ha-adaptive-dialog").open, true, "viewer events cannot close the popup");
assert.equal(gallery.shadowRoot.querySelector("ha-adaptive-dialog"), dialogBeforeChildClose, "viewer events cannot replace the dialog");
const firstViewer = gallery.shadowRoot.querySelector(".viewer").firstElementChild;
gallery.shadowRoot.querySelectorAll(".side button")[1].click();
await new Promise((resolve) => setTimeout(resolve, 10));
assert.equal(gallery.shadowRoot.querySelector(".viewer").firstElementChild.config.entity, "camera.hallway");
assert.equal(firstViewer.isConnected, false, "switching releases the previous live viewer");
assert.equal(gallery.shadowRoot.querySelector(".viewer").childElementCount, 1, "only one viewer is mounted");
gallery._requestClose();
gallery._open("camera.gate", preview);
await new Promise((resolve) => setTimeout(resolve, 50));
assert.equal(gallery.shadowRoot.querySelector(".viewer").firstElementChild.config.entity, "camera.gate", "a tap during close reopens after the close finishes");
assert.equal(gallery.shadowRoot.querySelector(".viewer").firstElementChild.config.camera_view, "live", "reopening starts a live viewer");
gallery._requestClose();
await new Promise((resolve) => setTimeout(resolve, 0));
gallery._open("camera.gate", preview);
gallery.shadowRoot.querySelector("ha-adaptive-dialog").simulateNativeClose();
await new Promise((resolve) => setTimeout(resolve, 0));
assert.equal(gallery.shadowRoot.querySelector("ha-adaptive-dialog").open, false, "the native close button resets the gallery");

preview.dispatchEvent(new window.CustomEvent("hass-more-info", { bubbles: true, composed: true, detail: { entityId: "camera.gate" } }));
await new Promise((resolve) => setTimeout(resolve, 10));
assert.equal(gallery.shadowRoot.querySelector(".viewer").firstElementChild.config.entity, "camera.gate", "camera can reopen after a failed peer");
gallery.setConfig({ ...config, camera_options: { ...config.camera_options, "camera.gate": { ...config.camera_options["camera.gate"], name: "New gate" } } });
await new Promise((resolve) => setTimeout(resolve, 10));
assert.equal(gallery.shadowRoot.querySelector("ha-adaptive-dialog").open, false, "editing the gallery closes a stale viewer");
gallery._previewCard.dispatchEvent(new window.CustomEvent("hass-more-info", { bubbles: true, composed: true, detail: { entityId: "camera.gate" } }));
await new Promise((resolve) => setTimeout(resolve, 10));
assert.equal(gallery.shadowRoot.querySelector("h2").textContent, "New gate");
gallery._requestClose();
await new Promise((resolve) => setTimeout(resolve, 0));
gallery.remove();

const homeCard = { type: "grid", cards: [
  { type: "picture-entity", entity: "camera.gate", tap_action: { action: "navigate", navigation_path: "/intercom" } },
  { type: "picture-entity", entity: "camera.hallway", tap_action: { action: "more-info" } },
] };
const sourceConfig = { type: "custom:camera-gallery-card", ...config };
let resolveSource;
const sourcePromise = new Promise((resolve) => { resolveSource = resolve; });
const home = new CameraGalleryCard();
home.setConfig({ card: homeCard, popup: { source: { dashboard: "dashboard-tablet", view: "cameras" } } });
document.body.append(home);
home.hass = { ...gallery._hass, callWS: () => sourcePromise };
await new Promise((resolve) => setTimeout(resolve, 0));
const homePreview = home.shadowRoot.querySelector(".preview").firstElementChild;
homePreview.dispatchEvent(new window.CustomEvent("hass-more-info", { bubbles: true, composed: true, detail: { entityId: "camera.gate" } }));
assert.equal(escaped, 1, "unwrapped intercom action stays native");
homePreview.dispatchEvent(new window.CustomEvent("hass-more-info", { bubbles: true, composed: true, detail: { entityId: "camera.hallway" } }));
assert.equal(home.shadowRoot.querySelector("ha-adaptive-dialog").open, false, "preview waits for source before opening");
resolveSource({ views: [{ path: "cameras", cards: [sourceConfig] }] });
await new Promise((resolve) => setTimeout(resolve, 20));
assert.equal(home.shadowRoot.querySelector("ha-adaptive-dialog").open, true);
assert.equal(home.shadowRoot.querySelectorAll(".side button").length, 2, "popup uses source camera list");
assert.equal(home.shadowRoot.querySelector(".viewer").firstElementChild.config.camera_view, "live", "popup uses native viewer by default");
home.remove();
assert.equal(home._closeDone, null, "disconnect clears a pending close even without a closed event");

document.body.append(home);
await new Promise((resolve) => setTimeout(resolve, 0));
home._open("camera.gate", homePreview);
await new Promise((resolve) => setTimeout(resolve, 10));
assert.equal(home.shadowRoot.querySelector("ha-adaptive-dialog").open, true, "a disconnected gallery can reopen after reconnecting");
home.remove();

let rejectSource;
const failingSource = new Promise((_, reject) => { rejectSource = reject; });
let sourceReply = failingSource;
const originalConsoleError = console.error;
console.error = () => {};
const failed = new CameraGalleryCard();
failed.setConfig({ card: homeCard, popup: { source: { dashboard: "dashboard-tablet", view: "cameras" } } });
document.body.append(failed);
failed.hass = { ...gallery._hass, callWS: () => sourceReply };
await new Promise((resolve) => setTimeout(resolve, 0));
failed.shadowRoot.querySelector(".preview").firstElementChild.dispatchEvent(new window.CustomEvent("hass-more-info", { bubbles: true, composed: true, detail: { entityId: "camera.hallway" } }));
rejectSource(new Error("offline"));
await new Promise((resolve) => setTimeout(resolve, 0));
assert.equal(escaped, 2, "a failed source falls back to native more-info");
sourceReply = Promise.resolve({ views: [{ path: "cameras", cards: [sourceConfig] }] });
failed.shadowRoot.querySelector(".preview").firstElementChild.dispatchEvent(new window.CustomEvent("hass-more-info", { bubbles: true, composed: true, detail: { entityId: "camera.hallway" } }));
await new Promise((resolve) => setTimeout(resolve, 20));
assert.equal(failed.shadowRoot.querySelector("ha-adaptive-dialog").open, true, "next tap retries a temporary source failure");
failed.remove();
console.error = originalConsoleError;

window.matchMedia = () => ({ matches: true });
const phone = new CameraGalleryCard();
phone.setConfig(config);
document.body.append(phone);
phone.hass = gallery._hass;
await new Promise((resolve) => setTimeout(resolve, 0));
phone._open("camera.gate");
await new Promise((resolve) => setTimeout(resolve, 10));
assert.equal(phone.shadowRoot.querySelector(".viewer").firstElementChild.config.fit_mode, "contain");
phone.shadowRoot.querySelector(".switcher").click();
assert.equal(phone.shadowRoot.querySelector(".switcher").getAttribute("aria-expanded"), "true");
phone.shadowRoot.querySelectorAll(".side button")[1].click();
await new Promise((resolve) => setTimeout(resolve, 10));
assert.equal(phone.shadowRoot.querySelector(".viewer").firstElementChild.config.camera_view, "live");
assert.equal(phone.shadowRoot.querySelector(".viewer").firstElementChild.config.entity, "camera.hallway");
assert.equal(phone.shadowRoot.querySelector(".switcher").getAttribute("aria-expanded"), "false");
const draggedDialog = phone.shadowRoot.querySelector("ha-adaptive-dialog");
draggedDialog.simulateSwipeClose();
phone._previewCard.dispatchEvent(new window.CustomEvent("hass-more-info", {
  bubbles: true, composed: true, detail: { entityId: "camera.gate" },
}));
await new Promise((resolve) => setTimeout(resolve, 40));
const freshDialog = phone.shadowRoot.querySelector("ha-adaptive-dialog");
assert.notEqual(freshDialog, draggedDialog, "swipe close replaces the dragged sheet");
assert.equal(freshDialog.style.getPropertyValue("--dialog-transform"), "", "drag offset is not reused");
assert.equal(freshDialog.open, true, "tap during swipe close reopens after hide");
assert.equal(phone.shadowRoot.querySelector(".viewer").firstElementChild.config.camera_view, "live", "mobile viewer reopens live");
draggedDialog.dispatchEvent(new window.Event("closed"));
assert.equal(freshDialog.open, true, "a stale close cannot dismiss the reopened viewer");
freshDialog.querySelector(".switcher").click();
freshDialog.querySelectorAll(".side button")[1].click();
await new Promise((resolve) => setTimeout(resolve, 10));
assert.equal(phone.shadowRoot.querySelector(".viewer").firstElementChild.config.entity, "camera.hallway", "camera controls still work in a fresh dialog");
freshDialog.simulateSwipeClose();
await new Promise((resolve) => setTimeout(resolve, 35));
assert.notEqual(phone.shadowRoot.querySelector("ha-adaptive-dialog"), freshDialog, "each swipe close gets a fresh sheet");
assert.equal(phone.shadowRoot.querySelector(".viewer").childElementCount, 0, "closing releases mobile media");
phone._open("camera.gate");
phone._open("camera.hallway");
await new Promise((resolve) => setTimeout(resolve, 10));
assert.equal(phone.shadowRoot.querySelector(".viewer").firstElementChild.config.entity, "camera.hallway", "latest rapid open wins");
assert.equal(phone.shadowRoot.querySelector(".viewer").firstElementChild.config.camera_view, "live", "live viewer survives repeated reopen cycles");
phone.remove();

console.log("native previews, mobile switching, source lookup, fallback, and close recovery: ok");
