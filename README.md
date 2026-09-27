# Camera Gallery Card

Keep your Home Assistant camera previews as ordinary picture entity cards. This card wraps their native grid or stack and opens a large, switchable camera viewer when you tap one. On phones, the viewer uses Home Assistant's adaptive bottom sheet and the camera list opens as a one-column drawer.

## Install

Add this repository to **HACS → Custom repositories** as a Dashboard repository. Or copy `camera-gallery-card.js` to `/config/www/` and register `/local/camera-gallery-card.js` as a JavaScript module in **Settings → Dashboards → Resources**.

## Configure

Put your existing native preview card under `card:`. Its picture entity cards define camera membership, order, preview image, fit, and grid layout. Leave their tap action at the default `more-info`. The gallery catches that action only for cameras inside its own card.

```yaml
type: custom:camera-gallery-card
card:
  type: grid
  columns: 2
  square: false
  cards:
    - type: picture-entity
      entity: camera.front_gate
      camera_view: auto
      show_name: false
      show_state: false
      aspect_ratio: 16:9
    - type: picture-entity
      entity: camera.driveway
      camera_view: auto
      show_name: false
      show_state: false
      aspect_ratio: 16:9
camera_options:
  camera.front_gate:
    group: Home
    name: Front gate
    icon: mdi:doorbell-video
    action:
      label: Open intercom
      path: /dashboard-intercom/front-gate
```

For a phone dashboard with headings, put native heading and grid cards in a native `vertical-stack` under `card:`. Keep preview settings on each picture entity. `camera_options` is optional and contains only popup settings: `name`, `icon`, `group`, `action`, `viewer_view`, `fit_mode`, or `viewer`. A `group` starts a heading in the popup switcher. The default icon is `mdi:cctv`.

The enlarged viewer uses a native picture entity card with live video by default. Set `viewer_view: auto` for a still image, or pass a full `viewer:` card config for a different viewer. The viewer fills its stage on wider screens and shows the whole frame on phones; `fit_mode: cover`, `contain`, or `fill` overrides that behavior globally or per camera. Previews keep their own `fit_mode` from the native picture entity config.

The popup uses `ha-adaptive-dialog` for its close button, motion, and phone swipe-down dismissal. You can swipe horizontally across the standard viewer to change cameras, or use the camera list. The media stage stays fixed while that list scrolls.

For a tile on another dashboard, use a native `navigate` action to `/dashboard-tablet/cameras?gallery_camera=camera.front_gate`. The camera must exist in the wrapped preview card. The one-time selection is removed when the popup closes.
