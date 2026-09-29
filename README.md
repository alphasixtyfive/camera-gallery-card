# Camera Gallery Card

Keep your Home Assistant camera previews as ordinary picture entity cards. This card wraps their grid, stack, or swipe card and opens a large, switchable camera viewer when you tap one. On phones, the viewer uses Home Assistant's adaptive bottom sheet and the camera list opens as a one-column drawer.

## Install

Add this repository to **HACS → Custom repositories** as a Dashboard repository. Or copy `camera-gallery-card.js` to `/config/www/` and register `/local/camera-gallery-card.js` as a JavaScript module in **Settings → Dashboards → Resources**.

## Configure

Put your existing preview card under `card:`. The nested `picture-entity` cards are the actual preview tiles: they define camera membership, order, image, fit, and layout. The wrapper also accepts a custom container such as `custom:swipe-card` around those tiles. Leave camera tap actions at the native default, `more-info`; the gallery catches that event only within its own preview card.

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

The enlarged viewer is a native live `picture-entity` card by default; there is no separate popup card to configure. Set `viewer_view: auto` for a still image on one camera, or pass a full `viewer:` card config for a camera that needs a different viewer. The viewer fills its stage on wider screens and shows the whole frame on phones; `fit_mode: cover`, `contain`, or `fill` overrides that behavior globally or per camera. Previews keep their own `fit_mode` from the native picture entity config.

The popup uses `ha-adaptive-dialog` for its close button, motion, and phone swipe-down dismissal. Use the Cameras button to switch cameras on a phone. The media stage stays fixed while the camera list scrolls.

To open the same popup from Home without changing views, wrap Home's existing native preview card and point it at the Cameras view. Keep the desired camera tiles on `more-info`; other native actions, including intercom navigation, pass through unchanged:

```yaml
type: custom:camera-gallery-card
card:
  type: grid
  columns: 2
  cards:
    - type: picture-entity
      entity: camera.front_gate
      tap_action:
        action: navigate
        navigation_path: /dashboard-intercom/front-gate
    - type: picture-entity
      entity: camera.driveway
popup:
  source:
    dashboard: dashboard-tablet
    view: cameras
```

The source view must contain one gallery card. It owns the popup camera list, order, names, icons, and actions; Home does not copy them. The card reads that dashboard configuration with Home Assistant's `lovelace/config` command. This is used by the HA frontend, though it is not a documented custom-card API. If the read fails, a tap opens HA's normal more-info dialog.
