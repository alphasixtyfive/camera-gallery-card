# Camera Gallery Card

A Home Assistant camera wall with a large viewer. Previews use Home Assistant's picture entity card; opening a camera creates one active viewer. The viewer fills the available space, with a camera list on the right on wider screens and a one-column drawer on phones.

## Install

Add this repository to **HACS → Custom repositories** as a Dashboard repository and install it. Alternatively, copy `camera-gallery-card.js` to `/config/www/` and add `/local/camera-gallery-card.js` as a JavaScript module under **Settings → Dashboards → Resources**. Refresh the dashboard after installation.

## Configure

List cameras in the order you want them. `group` starts a new section in the switcher and, when `show_gallery_groups` is true, in the preview wall.

```yaml
type: custom:camera-gallery-card
show_gallery_groups: true
cameras:
  - entity: camera.front_gate
    group: Home
    name: Front gate
    icon: mdi:doorbell-video
    action:
      label: Open intercom
      path: /dashboard-intercom/front-gate
  - camera.driveway
  - entity: camera.parents_front_door
    group: Parents
    name: Front door
```

For every available camera, set `cameras: all`. To omit some, add `exclude`:

```yaml
type: custom:camera-gallery-card
cameras: all
exclude:
  - camera.test_stream
  - camera.private_room
```

An explicit list gives predictable order and supports per-camera settings. `all` follows camera friendly names alphabetically. The gallery uses existing camera entities and does not create helpers or configure streams.

| Option | Purpose |
| --- | --- |
| `cameras` | Required ordered camera list or `all`. Each list item can be an entity ID or an object with `entity`. |
| `exclude` | Optional camera entity IDs to omit from either selection mode. |
| `columns` | Preview wall columns when the card has room, from 1 to 8; default 5. Narrow card spaces use up to 3 columns below 850 px and 2 below 720 px, including the Mobile dashboard viewed on a desktop. |
| `show_gallery_groups` | Show group headings in the preview wall; default false. Group headings always appear in the camera switcher when supplied. |
| `fit_mode` | Override how picture entity previews and the built-in viewer fit their area: `cover` (crop without distortion), `contain` (show the whole frame), or `fill` (stretch to fill). Set it here for all cameras or on one camera object. Custom viewers control their own fit. |

Camera objects can set `name`, `icon`, `group`, `aspect_ratio`, `preview_view`, `viewer_view`, and `fit_mode`. `name` changes the preview's accessible label, popup title, and switcher label. `icon` changes the switcher icon; its default is `mdi:cctv`. `aspect_ratio` sizes the preview tile. Previews crop by default. The enlarged native viewer uses the popup's available area, showing the whole frame in the mobile drawer layout and cropping on wider screens. An explicit `fit_mode` overrides these defaults. Previews use Home Assistant picture entity cards with `camera_view: auto`; the enlarged viewer requests live video by default. An explicit `viewer_view` overrides that choice. `action` adds a button to the viewer header; give it a `label` and a local dashboard `path`. An optional `viewer` object replaces the enlarged picture entity card with another card configuration, such as an intercom card. The card leaves stream format and playback to Home Assistant or that viewer.

The viewer uses Home Assistant's adaptive dialog: a wide popup on desktop and a full-width bottom sheet on phones. Home Assistant supplies the close button, sheet animation, and swipe-down dismissal. The enlarged camera image has square corners inside the popup, and the native picture entity card owns loading and playback.

Swipe the standard enlarged viewer horizontally to change cameras. It follows the finger and shows the next camera's `entity_picture` during the gesture, without a centered name label. Custom viewers retain their own touch controls; use the Cameras drawer to switch from one. The media area stays fixed while the camera list scrolls. Motion follows the device's reduced-motion setting.

To open a specific camera from another dashboard tile, set its tap action to `navigate` and use `/dashboard-tablet/cameras?gallery_camera=camera.front_gate` as the navigation path. The gallery opens that camera only if it is in its configured list. It removes the one-time parameter when the popup closes so a dashboard refresh cannot interrupt the video.
