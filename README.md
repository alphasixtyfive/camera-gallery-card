# Camera Gallery Card

A Home Assistant camera wall with a large viewer. Previews use Home Assistant's picture entity card; opening a camera creates one active live viewer. The viewer fills the available space, with a camera list on the right on wider screens and a one-column drawer on phones.

## Install

Add this repository to **HACS → Custom repositories** as a Dashboard repository and install it. Alternatively, copy `camera-gallery-card.js` to `/config/www/` and add `/local/camera-gallery-card.js` as a JavaScript module under **Settings → Dashboards → Resources**. Refresh the dashboard after installation.

## Configure

List cameras in the order you want them. `group` starts a new section in the switcher and, when `show_gallery_groups` is true, in the preview wall.

```yaml
type: custom:camera-gallery-card
columns: 5
show_gallery_groups: true
cameras:
  - entity: camera.front_gate
    group: Home
    action:
      label: Open intercom
      path: /dashboard-intercom/front-gate
  - camera.driveway
  - entity: camera.parents_front_door
    group: Parents
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
| `columns` | Preview wall columns on wide screens, from 1 to 8; default 5. Responsive layouts use up to 3 columns on tablets and 2 on phones. |
| `show_gallery_groups` | Show group headings in the preview wall; default false. Group headings always appear in the camera switcher when supplied. |

Camera objects can set `name`, `group`, `aspect_ratio`, `preview_view`, `viewer_view`, and `fit_mode`. The defaults are Home Assistant picture entity previews with `camera_view: auto` and a live enlarged viewer. `action` adds a button to the viewer header; give it a `label` and a local dashboard `path`. An optional `viewer` object replaces the enlarged picture entity card with another card configuration, such as an intercom card. The card leaves stream format and playback to Home Assistant or that viewer.

On a phone, swipe the standard enlarged viewer horizontally to move to the adjacent camera. The viewer follows the finger and uses that camera's `entity_picture` as the incoming still image while it switches. Custom viewers retain their own touch controls; use the Cameras drawer to switch from one. The media area stays fixed while the camera list scrolls. Motion follows the device's reduced-motion setting.
