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
    if (wasOpen && !this._open) setTimeout(() => this.dispatchEvent(new window.Event("closed")), 0);
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
assert.equal(gallery.shadowRoot.querySelector("h2").textContent, "Gate");
assert.equal(gallery.shadowRoot.querySelector(".side button ha-icon").getAttribute("icon"), "mdi:doorbell-video");

gallery.shadowRoot.querySelector(".viewer").firstElementChild.dispatchEvent(new window.Event("closed", { bubbles: true, composed: true }));
assert.equal(gallery.shadowRoot.querySelector("ha-adaptive-dialog").open, true, "viewer events cannot close the popup");
gallery.shadowRoot.querySelectorAll(".side button")[1].click();
await new Promise((resolve) => setTimeout(resolve, 10));
assert.equal(gallery.shadowRoot.querySelector(".viewer").firstElementChild.config.entity, "camera.hallway");
gallery._requestClose();
gallery._open("camera.gate", preview);
await new Promise((resolve) => setTimeout(resolve, 50));
assert.equal(gallery.shadowRoot.querySelector(".viewer").firstElementChild.config.entity, "camera.gate", "a tap during close reopens after the close finishes");
gallery._requestClose();
await new Promise((resolve) => setTimeout(resolve, 0));

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

console.log("native previews, scoped opening, source lookup, fallback, and close recovery: ok");
