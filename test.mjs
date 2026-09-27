import assert from "node:assert/strict";
import { Window } from "happy-dom";

const window = new Window({ url: "http://localhost:8123/dashboard-tablet/cameras" });
Object.assign(globalThis, {
  window,
  document: window.document,
  customElements: window.customElements,
  HTMLElement: window.HTMLElement,
  history: window.history,
  Event: window.Event,
});
class FakeAdaptiveDialog extends window.HTMLElement {
  get open() { return this._open || false; }
  set open(value) {
    const wasOpen = this.open;
    this._open = Boolean(value);
    if (wasOpen && !this._open) setTimeout(() => this.dispatchEvent(new window.Event("closed")), 0);
  }
}
window.customElements.define("ha-adaptive-dialog", FakeAdaptiveDialog);

const created = [];
window.loadCardHelpers = async () => ({
  createCardElement(config) {
    const card = document.createElement("div");
    card.config = config;
    card.setConfig = (next) => { card.config = next; };
    created.push(card);
    return card;
  },
});

const { CameraGalleryCard, normalizeConfig, cameraEntries } = await import("./camera-gallery-card.js");
const states = {
  "camera.a": { state: "idle", attributes: { friendly_name: "Zed" } },
  "camera.b": { state: "idle", attributes: { friendly_name: "Alpha" } },
  "camera.c": { state: "idle", attributes: { friendly_name: "Tablet" } },
};

assert.deepEqual(cameraEntries(normalizeConfig({ cameras: ["camera.b", "camera.a", "camera.b"], exclude: ["camera.a"] }), states).map((x) => x.entity), ["camera.b"]);
assert.deepEqual(cameraEntries(normalizeConfig({ cameras: "all", exclude: ["camera.c"] }), states).map((x) => x.entity), ["camera.b", "camera.a"]);
assert.deepEqual(cameraEntries(normalizeConfig({ cameras: [
  { entity: "camera.c", group: "Home" }, "camera.a", { entity: "camera.b", group: "Parents" },
], exclude: ["camera.c"] }), states).map(({ entity, group }) => [entity, group]), [["camera.a", "Home"], ["camera.b", "Parents"]]);
assert.throws(() => normalizeConfig({ cameras: ["switch.bad"] }), /invalid camera/);
assert.throws(() => normalizeConfig({ cameras: [{ entity: "camera.a", group: " " }] }), /group/);
assert.throws(() => normalizeConfig({ cameras: ["camera.a"], show_gallery_groups: "yes" }), /show_gallery_groups/);
assert.throws(() => normalizeConfig({ cameras: ["camera.a"], fit_mode: "crop" }), /fit_mode/);
assert.throws(() => normalizeConfig({ cameras: [{ entity: "camera.a", fit_mode: "crop" }] }), /fit_mode/);
assert.throws(() => normalizeConfig({ cameras: [{ entity: "camera.a", name: " " }] }), /name/);
assert.throws(() => normalizeConfig({ cameras: [{ entity: "camera.a", icon: " " }] }), /icon/);
assert.throws(() => normalizeConfig({ cameras: [{ entity: "camera.a", action: { label: "Open", path: "//example.com" } }] }), /local path/);

const gallery = new CameraGalleryCard();
gallery.setConfig({ cameras: [{ entity: "camera.a", group: "Home", name: "Gate", icon: "mdi:doorbell-video" }, { entity: "camera.b", group: "Parents", fit_mode: "contain" }], columns: 5, show_gallery_groups: true });
document.body.append(gallery);
gallery.hass = { states };
await new Promise((resolve) => setTimeout(resolve, 0));
assert.equal(gallery.shadowRoot.querySelectorAll(".tile").length, 2);
assert.deepEqual([...gallery.shadowRoot.querySelectorAll(".gallery-group")].map((heading) => heading.textContent), ["Home", "Parents"]);
assert.equal(gallery.shadowRoot.querySelector("h2").getAttribute("slot"), "headerTitle");
assert.equal(created.length, 2);
assert(created.every((card) => card.config.camera_view === "auto"));
assert.deepEqual(created.map((card) => card.config.fit_mode), ["cover", "contain"]);

gallery.shadowRoot.querySelector(".tile button").click();
await new Promise((resolve) => setTimeout(resolve, 0));
assert.equal(gallery.shadowRoot.querySelector("ha-adaptive-dialog").open, true);
assert.equal(gallery.shadowRoot.querySelector(".viewer").children.length, 1);
const first = gallery.shadowRoot.querySelector(".viewer").firstElementChild;
assert.equal(first.config.camera_view, "live");
assert.equal(first.config.entity, "camera.a");
assert.equal(first.config.fit_mode, "cover");
assert.equal(gallery.shadowRoot.querySelector(".viewer").hasAttribute("data-native"), true);
assert.equal(gallery.shadowRoot.querySelector(".viewer-status"), null, "native viewer owns loading feedback");
gallery.setConfig({ cameras: [{ entity: "camera.a", group: "Home", name: "Gate", icon: "mdi:doorbell-video" }, { entity: "camera.b", group: "Parents", fit_mode: "contain" }], columns: 5, show_gallery_groups: true });
assert.equal(gallery.shadowRoot.querySelector("ha-adaptive-dialog").open, true, "dashboard config refresh keeps the popup open");
assert.equal(gallery.shadowRoot.querySelector(".viewer").firstElementChild, first, "dashboard config refresh keeps live media mounted");
gallery._viewer.getBoundingClientRect = () => ({ width: 360, height: 700 });
window.dispatchEvent(new window.Event("resize"));
assert.equal(first.config.aspect_ratio, "360:700");
const firstRow = gallery.shadowRoot.querySelector(".side button");
assert.equal(firstRow.querySelector("ha-icon").getAttribute("icon"), "mdi:doorbell-video");
assert.equal(firstRow.querySelector(".name").textContent, "Gate");
assert.deepEqual([...gallery.shadowRoot.querySelectorAll(".side h4")].map((heading) => heading.textContent), ["Home", "Parents"]);
gallery.shadowRoot.querySelector(".switcher").click();
assert.equal(gallery.shadowRoot.querySelector("ha-adaptive-dialog").hasAttribute("data-drawer-open"), true);
assert.equal(gallery.shadowRoot.querySelector(".switcher").getAttribute("aria-expanded"), "true");
firstRow.click();
assert.equal(gallery.shadowRoot.querySelector("ha-adaptive-dialog").hasAttribute("data-drawer-open"), false);
assert.equal(gallery.shadowRoot.querySelector(".viewer").firstElementChild, first);
gallery.shadowRoot.querySelector(".switcher").click();
gallery.hass = { states: { ...states, "camera.a": { state: "unavailable", attributes: { friendly_name: "Zed" } } } };
assert.equal(gallery.shadowRoot.querySelector(".side button"), firstRow);
assert.equal(firstRow.querySelector(".unavailable").hidden, false);

gallery.shadowRoot.querySelectorAll(".side button")[1].click();
await new Promise((resolve) => setTimeout(resolve, 0));
assert.equal(gallery.shadowRoot.querySelector("ha-adaptive-dialog").hasAttribute("data-drawer-open"), false);
assert.equal(first.isConnected, false);
assert.equal(gallery.shadowRoot.querySelector(".viewer").firstElementChild.config.entity, "camera.b");
assert.equal(gallery.shadowRoot.querySelector(".viewer").firstElementChild.config.fit_mode, "contain");
gallery._requestClose();
await new Promise((resolve) => setTimeout(resolve, 0));
assert.equal(gallery.shadowRoot.querySelector(".viewer").children.length, 0);
assert.equal(gallery.shadowRoot.querySelector("ha-adaptive-dialog").open, false);
gallery.shadowRoot.querySelector(".tile button").click();
await new Promise((resolve) => setTimeout(resolve, 0));
assert.equal(gallery.shadowRoot.querySelector("ha-adaptive-dialog").open, true);
assert.equal(gallery.shadowRoot.querySelector(".viewer").firstElementChild.config.entity, "camera.a");
gallery.shadowRoot.querySelector(".switcher").click();
gallery._requestClose();
await new Promise((resolve) => setTimeout(resolve, 0));
assert.equal(gallery.shadowRoot.querySelector("ha-adaptive-dialog").open, false);
assert.equal(gallery.shadowRoot.querySelector(".viewer").children.length, 0);

const originalMatchMedia = window.matchMedia;
window.matchMedia = (query) => ({ matches: query.includes("max-width") });
gallery.shadowRoot.querySelector(".tile button").click();
await new Promise((resolve) => setTimeout(resolve, 0));
assert.equal(gallery.shadowRoot.querySelector(".viewer").firstElementChild.config.fit_mode, "contain", "mobile viewer shows the full frame");
assert.equal(gallery._previewCards.get("camera.a").config.fit_mode, "cover", "preview tile keeps its crop");
window.matchMedia = () => ({ matches: false });
window.dispatchEvent(new window.Event("resize"));
assert.equal(gallery.shadowRoot.querySelector(".viewer").firstElementChild.config.fit_mode, "cover", "desktop viewer keeps its crop after resize");
window.matchMedia = (query) => ({ matches: query.includes("max-width") });
window.dispatchEvent(new window.Event("resize"));
assert.equal(gallery.shadowRoot.querySelector(".viewer").firstElementChild.config.fit_mode, "contain", "mobile fit returns after resize");
const swipe = (dx, dy = 0, path = []) => {
  const start = { identifier: 1, clientX: 200, clientY: 200 };
  gallery._startSwipe({ touches: [start], composedPath: () => path });
  gallery._moveSwipe({ touches: [{ identifier: 1, clientX: 200 + dx, clientY: 200 + dy }] });
  gallery._endSwipe({ touches: [], changedTouches: [{ identifier: 1, clientX: 200 + dx, clientY: 200 + dy }] });
};
gallery._startSwipe({ touches: [{ identifier: 1, clientX: 200, clientY: 200 }], composedPath: () => [] });
gallery._moveSwipe({ touches: [{ identifier: 1, clientX: 80, clientY: 200 }] });
assert.equal(gallery.shadowRoot.querySelector(".stage").hasAttribute("data-swipe-active"), true);
assert.match(gallery.shadowRoot.querySelector(".viewer").style.transform, /-120px/);
assert.equal(gallery.shadowRoot.querySelector(".swipe-preview .name"), null, "swipe preview has no centered camera name");
assert.equal(gallery.shadowRoot.querySelector(".swipe-preview").dataset.fit, "contain", "incoming still uses the viewer fit");
gallery._endSwipe({ touches: [], changedTouches: [{ identifier: 1, clientX: 80, clientY: 200 }] });
await new Promise((resolve) => setTimeout(resolve, 280));
assert.equal(gallery.shadowRoot.querySelector(".viewer").firstElementChild.config.entity, "camera.b");
swipe(-120);
await new Promise((resolve) => setTimeout(resolve, 280));
assert.equal(gallery._selected, "camera.b", "the last camera has no next camera");
swipe(120);
await new Promise((resolve) => setTimeout(resolve, 280));
assert.equal(gallery.shadowRoot.querySelector(".viewer").firstElementChild.config.entity, "camera.a");
gallery._startSwipe({ touches: [{ identifier: 1, clientX: 200, clientY: 200 }], composedPath: () => [] });
gallery._moveSwipe({ touches: [{ identifier: 1, clientX: 80, clientY: 200 }] });
gallery._moveSwipe({ touches: [{ identifier: 1, clientX: 200, clientY: 200 }] });
gallery._endSwipe({ touches: [], changedTouches: [{ identifier: 1, clientX: 200, clientY: 200 }] });
assert.match(gallery.shadowRoot.querySelector(".swipe-preview").style.transform, /100%/, "a reversed drag settles back toward its original side");
await new Promise((resolve) => setTimeout(resolve, 280));
assert.equal(gallery._selected, "camera.a");
swipe(-120);
gallery._startSwipe({ touches: [{ identifier: 2, clientX: 200, clientY: 200 }], composedPath: () => [] });
gallery._endSwipe({ touches: [], changedTouches: [{ identifier: 2, clientX: 200, clientY: 200 }] });
await new Promise((resolve) => setTimeout(resolve, 280));
assert.equal(gallery._selected, "camera.b", "a second touch does not cancel a settling swipe");
swipe(120);
await new Promise((resolve) => setTimeout(resolve, 280));
swipe(120);
swipe(-50);
swipe(-120, 120);
swipe(-120, 0, [document.createElement("button")]);
const control = document.createElement("div");
control.setAttribute("role", "button");
swipe(-120, 0, [control]);
assert.equal(gallery._selected, "camera.a", "edge, short, vertical, and control gestures do not switch");
gallery._startSwipe({ touches: [{ identifier: 1, clientX: 200, clientY: 200 }], composedPath: () => [] });
const multitouch = new window.Event("touchstart");
Object.defineProperty(multitouch, "touches", { value: [{ identifier: 1 }, { identifier: 2 }] });
gallery.shadowRoot.querySelector("ha-adaptive-dialog").dispatchEvent(multitouch);
gallery._endSwipe({ touches: [], changedTouches: [{ identifier: 1, clientX: 80, clientY: 200 }] });
assert.equal(gallery._selected, "camera.a", "multitouch does not switch");
await new Promise((resolve) => setTimeout(resolve, 280));
const loadCardHelpers = window.loadCardHelpers;
let finishLoading;
window.loadCardHelpers = () => new Promise((resolve) => { finishLoading = resolve; });
swipe(-120);
await new Promise((resolve) => setTimeout(resolve, 280));
assert.equal(gallery._selected, "camera.b");
assert.equal(gallery.shadowRoot.querySelector(".stage").hasAttribute("data-swipe-active"), true, "incoming still remains during card setup");
finishLoading(await loadCardHelpers());
await new Promise((resolve) => setTimeout(resolve, 0));
assert.equal(gallery.shadowRoot.querySelector(".stage").hasAttribute("data-swipe-active"), false, "incoming still clears when the native card mounts");
window.loadCardHelpers = loadCardHelpers;
gallery._requestClose();
await new Promise((resolve) => setTimeout(resolve, 0));

const customViewer = new CameraGalleryCard();
customViewer.setConfig({ cameras: [{ entity: "camera.a", viewer: { type: "custom:intercom-camera-card" } }, "camera.b"] });
document.body.append(customViewer);
customViewer.hass = { states };
await new Promise((resolve) => setTimeout(resolve, 0));
customViewer.shadowRoot.querySelector(".tile button").click();
await new Promise((resolve) => setTimeout(resolve, 0));
customViewer._startSwipe({ touches: [{ identifier: 1, clientX: 200, clientY: 200 }], composedPath: () => [] });
customViewer._endSwipe({ touches: [], changedTouches: [{ identifier: 1, clientX: 80, clientY: 200 }] });
assert.equal(customViewer._selected, "camera.a", "custom viewers keep their own touch gestures");
customViewer._requestClose();
await new Promise((resolve) => setTimeout(resolve, 0));
const stillViewer = new CameraGalleryCard();
stillViewer.setConfig({ cameras: [{ entity: "camera.a", viewer_view: "auto" }] });
document.body.append(stillViewer);
stillViewer.hass = { states };
await new Promise((resolve) => setTimeout(resolve, 0));
stillViewer.shadowRoot.querySelector(".tile button").click();
await new Promise((resolve) => setTimeout(resolve, 0));
assert.equal(stillViewer.shadowRoot.querySelector(".viewer").firstElementChild.config.camera_view, "auto", "explicit still mode is passed to HA");
stillViewer._requestClose();
await new Promise((resolve) => setTimeout(resolve, 0));
stillViewer.remove();
window.matchMedia = originalMatchMedia;

history.pushState(null, "", "/dashboard-tablet/cameras?gallery_camera=camera.b");
const linkedGallery = new CameraGalleryCard();
linkedGallery.setConfig({ cameras: ["camera.a", "camera.b"] });
document.body.append(linkedGallery);
linkedGallery.hass = { states };
await new Promise((resolve) => setTimeout(resolve, 0));
assert.equal(linkedGallery.shadowRoot.querySelector("ha-adaptive-dialog").open, true);
assert.equal(linkedGallery.shadowRoot.querySelector(".viewer").firstElementChild.config.entity, "camera.b");
assert.equal(window.location.search, "?gallery_camera=camera.b", "the link stays until the popup finishes closing");
linkedGallery._requestClose();
await new Promise((resolve) => setTimeout(resolve, 0));
assert.equal(window.location.search, "", "the one-time camera link is consumed on close");
linkedGallery.hass = { states };
assert.equal(linkedGallery.shadowRoot.querySelector("ha-adaptive-dialog").open, false, "the link does not reopen after closing");
await new Promise((resolve) => setTimeout(resolve, 0));
linkedGallery.remove();
history.pushState(null, "", "/dashboard-tablet/cameras?view=kept&gallery_camera=camera.a#position");
document.body.append(linkedGallery);
await new Promise((resolve) => setTimeout(resolve, 0));
assert.equal(linkedGallery.shadowRoot.querySelector("ha-adaptive-dialog").open, true, "a cached gallery handles the next link");
assert.equal(linkedGallery.shadowRoot.querySelector(".viewer").firstElementChild.config.entity, "camera.a");
assert.equal(window.location.search, "?view=kept&gallery_camera=camera.a", "the link stays while the popup is open");
assert.equal(window.location.hash, "#position", "the URL fragment remains");
linkedGallery._requestClose();
await new Promise((resolve) => setTimeout(resolve, 0));
assert.equal(window.location.search, "?view=kept", "other query parameters remain after close");
await new Promise((resolve) => setTimeout(resolve, 0));
linkedGallery.remove();
history.pushState(null, "", "/dashboard-tablet/cameras?gallery_camera=camera.not_listed");
document.body.append(linkedGallery);
await new Promise((resolve) => setTimeout(resolve, 0));
assert.equal(linkedGallery.shadowRoot.querySelector("ha-adaptive-dialog").open, false, "an unlisted camera is ignored");
assert.equal(window.location.search, "?gallery_camera=camera.not_listed");
linkedGallery.remove();

history.pushState(null, "", "/dashboard-mobile/cameras?gallery_camera=camera.a");
const reconnectGallery = new CameraGalleryCard();
reconnectGallery.setConfig({ cameras: ["camera.a"] });
document.body.append(reconnectGallery);
reconnectGallery.hass = { states };
await new Promise((resolve) => setTimeout(resolve, 0));
assert.equal(reconnectGallery.shadowRoot.querySelector("ha-adaptive-dialog").open, true);
reconnectGallery.remove();
document.body.append(reconnectGallery);
await new Promise((resolve) => setTimeout(resolve, 20));
assert.equal(reconnectGallery.shadowRoot.querySelector("ha-adaptive-dialog").open, true, "a dashboard reconnect waits for the previous close");
assert.equal(window.location.search, "?gallery_camera=camera.a", "a reconnect keeps the camera link until the viewer closes");
reconnectGallery._requestClose();
await new Promise((resolve) => setTimeout(resolve, 0));
assert.equal(window.location.search, "");
reconnectGallery.remove();

console.log("camera gallery selection, native popup, deep links, swipe navigation, viewer lifecycle, and close: ok");
