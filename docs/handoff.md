# Handoff: the sea world redesign (0.7.0 to 0.11.0)

For Claude working on Allison locally. These versions were built in a cloud session on the branch
`claude/gifted-ride-ptgarb`. Read docs/plan.md first (rules and how to work), then this file.

The design was settled through several rounds of screenshots with Jack. "What Jack decided" lists the choices he made
and the things he rejected, so they don't come back by accident.

## What Jack decided

**Look**
- ASCII, video-game, dreamy. Not realism. The water and sky are drawn as tiny pixel-font characters in a 3 x 4 px
  cell (`CELL` in index.html, `GLYPHS` in sea.js: 10 glyphs on a 3 x 4 grid, darkest to brightest). Jack rejected a halftone-dot look and a realistic, bright version, and asked for the first version's
  characters and darker palette back.
- The boat is the only semi-real thing: a real 3D model with a rim light and a light character overlay, so it reads
  as solid 3D inside the ASCII world.
- Dark mode: dark teal night, a moon, stars. Jack wants it dark, so don't brighten it.
- Light mode: a brighter, warm green day with a sun.

**The 0.10.0 look (from Jack's two reference pictures)**
- Night: glowing cyan characters on near-black, a big pixel moon with a narrow glitter path under it (kept to a column
  by the `path` mask in `WATER_FS`), stars, soft fbm cumulus clouds at the horizon sides, a dark sea.
- Glow is subtle: a bloom pass on the bright parts only. Jack said it was too much at first, so keep `bloom` /
  `bloomThr` in `LOOKS` modest.
- Rim light is faked in `PROP_FS` and `BOAT_FS`: edges turned toward the moon/sun get a bright outline; flat tops seen
  low don't (otherwise the islet looked like snow). Jack likes this.
- The sun must not flood the water by day (`glit`, `base` in `LOOKS.light`).
- Labels and tab buttons are "tags": a dot on the object, a thin leader line, and a dark rounded card with an outline
  icon, a mono name and a live status line (`tagHTML`, `floatStatus`). Only the current place's buttons show.
- A clock with the date, top right, all white (`#clock`, `tickClock`). The chat is a pill with a sparkle and a round
  cyan send button. Top-left buttons are round.
- Allie fits in without a CSS blur (Jack rejected that: "looks like a gaussian blur"). `GULL_FS` prints a light 3 x 4
  character grid on her (`uAsc`, aligned to the scene's cells), adds the same faked moonlit rim as the props, and she is
  also drawn into the main scene (`uLin` = linear output) so the ASCII pass and bloom treat her like everything else.

**Allie**
- A pink gull, pink in both modes. On the beach she faces the camera.
- She flies to wherever Jack goes. The camera does NOT follow her mid-flight: Jack found that too slow. The camera
  goes straight to the destination and she flies on her own.

**Navigation**
- Each place has a ring of floating app-icon buttons, and tabs open standing above their button, facing outward.
- You swipe to circle around the place. Tabs are seen face on as you go round.
- A grab bar under each tab moves it, like the bar under a Vision Pro window.
- **Fixed controls only:** sleep, settings and home (top left), plus the chat, the thinking indicator and (since 0.11.0)
  a stop button at the bottom. No mic button. The stop button (`#stop`) shows only while Allie is busy (`setBusy`); at
  home it sits beside the chat line.
- **Settings** is a gear button. It opens as a sheet on the right while the camera backs off, so you can see the world
  behind it.

**Home chat**
- A single line at the bottom. It opens into the full chat panel when Jack starts typing.
- Allie answers there.
- "Take me to X" travels.

**Allie's subtitles** are small (15.5 px).

## The world

All positions are in world units. The water is y = 0, x runs right, z runs toward the beach.

| Place | Name in code | Where | What's there |
| --- | --- | --- | --- |
| Islet (home) | `home` | islet at `ISLE` (-760, 2100), view from (-600, 1280) | Allie on a post (POST), the chat |
| The boat, "My Life" | `life` | (0, 0) | ring of 450: Today, Mail, Calendar, To-do, Calories |
| Lighthouse island, "Studio" | `studio` | (-1750, -1050) | ring of 760: Video editing, AI influencer, Clock, Money, 3D jobs |
| Workbench, build mode | `craft` | on a terrace on the island (sea.js `TERRACE`) | the widget mat |
| Bottle, the journal | `journal` | (-720, -480) | the journal page (see "The journal") |

- **Defined in:** `PLACES`, `POST` and `SHORE` in renderer/index.html.
- **Travelling:** `travel(name)` sets `HERE` (and the orbit pivot `PIV`), sends Allie with `birdTo(name, view)`, and
  flies the camera to `placeView(name)`.
- **What triggers it:** the labels over each place (`#places`), the house button, `placeFrom()` in the text and voice
  interpreter ("take me to …"), and the brain's `go_to` tool.

## Files and what changed

### renderer/index.html: the screen

**Places and rings.** `PLACES`, `TABPLACE` (which place a tab belongs to), `ringAngle`, `homeSpot`, `tabFrame`.
- A tab's world position is `el._wx` / `el._wz`. Its place's centre is `el._px` / `el._pz`.
- Tabs that Jack moves are saved in localStorage `allie.tabs`.

**Camera** (`CAM {x, y, z, d, a, p}`). It looks at a target from distance `d`, yaw `a` around it, and pitch `p`.
- `basis()` gives the camera position and its right/up/back vectors (R, U, B).
- Turning around the current place: `orbit()`. On the beach it's clamped to a small look-around, and at the workbench
  it's clamped too.
- Moving: `flyCam()` springs to a target. Its response time scales with distance, so long trips across the water take
  longer.
- Choosing a view: `placeView()`, `focusView(el)` (face a tab at pixel-sharp size), `overview()`, `sheetView()`.
- Snapping: `release()` settles on the nearest tab after a swipe. `stepTab()` handles the arrow keys.

**Tabs are 3D cards.** `put(el, b)` projects each tab's corners and draws it with a CSS `matrix3d`. When it's face on at
full size it uses a plain `translate`, so text stays sharp.
- Fading: backs and edge-on tabs fade out. A tab right in front of the camera fades. A tab between you and the boat
  goes see-through at home but stays clickable.
- The wrapper `.tabw` holds the panel and its grab bar (`[data-grab]`).

**Settings sheet.** `openSheet` / `closeSheet` / `dropSheet` (close without restoring the camera), with host `#sheet`.
The click, change and submit handlers are now named functions (`panelClick`, `panelChange`, `panelSubmit`) attached to
both `#world` and `#sheet`.

**Beach chat** (`#chatlog`). `logMsg()` adds a message. `reveal()` logs everything Allie says, and `ask()` logs what
Jack says.
- History is saved in localStorage `allie.chat` (last 40). The startup greeting isn't saved.
- `.open` expands the chat: typing opens it, and the `–` button shrinks it.

**Workbench.** `showBench()` mounts widgets from `window.AllieWidgets.list` onto the mat (`#bench`). `placeBench()` lays
the mat flat on the desk top with a `matrix3d`. Esc or Done goes back to the Studio.

**Allie.**
- `perchPoint()` / `perchYaw()` cover every place: the beach post, the boat's bow, the lighthouse railing, riding the
  bottle, and the corner of the workbench.
- `birdTo(perch, cam)` starts her flight and the camera move together.
- The 3D body is posed by `gullPose()`.

**Studio tabs.** `editing` and `influencer` are the two halves of the old `businesses` panel; `body()` renders them
without its switch. `businesses` still exists for compatibility, and `openPanel("businesses")` redirects to the right
half. The Clock is the old work timer (`time`).

### renderer/sea.js: the 3D scene (WebGL2), loaded before the page script

**Meshes**
- `buildIsland`: a noise terrain with a terrace for the bench, boulders and pebbles.
- `buildLighthouse`: plinth, banded tower, door, windows, corbels, gallery, double railing, lamp room, dome.
- `buildBench`, `buildBottle` and `buildPost`: the other props.
- `rock()`: a noisy lumpy rock.
- The gull is built from lofted parts (`buildGull`) and posed by `gullPose`.

**`LOOKS.dark` / `LOOKS.light`.** Every colour lives here, including the moon/sun direction:
- `L` is the key light and `Lg` the glitter path. One is derived from the other so they agree.
- The ASCII palettes are `c*` for sea, `s*` for sand and `k*` for sky, plus the foam and disc colours.

**The render pass order:**
1. shadow map
2. reflection pass (boat, props, tab/button cards, Allie, mirrored)
3. boat and props
4. water shader (sea, sky, moon, clouds, lighthouse beam, islet foam)
5. ASCII pass into an HDR target (`RT.ascii`)
6. bloom: blurred at quarter and eighth size (`BLUR_FS`), then combined on screen (`FINAL_FS`)
7. Allie, drawn on her own canvas above the tabs

**The water shader** (`WATER_FS`) does three things:
- It ray-casts every pixel to the water plane, then shades the water with ripple rings around each place, the beach
  with its waves, foam lines and wash, the sky with its moon/sun disc and stars, the reflections, and the glitter.
- It writes brightness in red, a sand-or-foam flag in green and a sky flag in blue.
- Alpha 0 means "boat or prop pixel, keep its lit colour".

**The ASCII pass** (`ASCII_FS`) picks one character per cell from the glyph atlas and colours it with the matching
palette.

**`render(F)`** takes `{ T, b, FOC, theme, dim, boat, panels, floats, gull, props, shore, ripples, shadowAt }`.

### Other files
- **renderer/models/boat.glb:** "Wooden Boat" by lpfeffer, CC BY 4.0, credited in Settings and docs/credits.md.
  - It's repacked by `tools/pack-boat.py` from 37 MB to 2.7 MB. The original is `assets/boat-source.glb`, which is
    kept outside the installer.
  - Electron reads it through `allie.readAsset()` (preload) → `asset:read` (main.js, `.glb` names only, from
    renderer/models).
  - A browser fetches it, and a `file://` page (the screenshot tool) uses XHR.
- **renderer/widgets/index.js:** the widget registry (`AllieWidgets.register`). See "Widgets" below.
- **src/brain.js:**
  - The new `go_to` tool (home, life, studio, journal, craft).
  - `open_panel` now lists `editing`, `influencer` and `time`.
  - The system prompt describes the world.
- **src/main.js and src/preload.js:** `asset:read` / `readAsset`.
- **tools/screenshots.js:** shots of every place (home, chat, life, today, studio, editing, workbench, journal,
  settings, asleep, small window). Run `npx electron tools/screenshots.js`.
- **tests:**
  - tests/sea.test.js: the model loads and stays small, the gull meshes and poses are sound, the bench is on the
    island.
  - tests/renderer.test.js: fixed controls, every tab has a place and a button, the chat collapses, the widget
    registry, script order.
  - tests/brain.test.js: `go_to` covers every place.

## The journal (built in 0.10.0, stage 1)

- Clicking the bottle (the 3D bottle itself, its label, or "open my journal") travels there and unrolls a paper page
  (`#paper`, `openPaper` / `closePaper` in index.html).
- Jack writes; "Log it" saves `{ id, d, text }` to `S.journal` (data.json). The unlogged draft is kept in localStorage
  `allie.jdraft`. The arrows flip through logged pages (read-only). Done or Esc closes it. Allie never replies there.
- Still to do: brain tools `journal_add` and `journal_search` so Allie can write in it or recall from it when asked.

## A GPU gotcha (fixed in 0.11.1)
On Jack's Windows GPU, `pow()` of a tiny negative number returns NaN, and the bloom blur spreads one NaN pixel into big
dark circles. Always clamp `pow` bases (`pow(max(x,0.),k)`). `BLUR_FS` and `FINAL_FS` also drop NaN pixels as a backstop.
That wasn't the whole story (0.11.2): `beam()` worked on the raw, unnormalized view ray (length ~ focal length), so its
closest-approach maths cancelled out badly. It now normalizes the ray and caps its reach, returns 0 for any NaN/inf,
and `WATER_FS` and `ASCII_FS` sanitize their inputs/outputs: a NaN brightness makes the ASCII pass print blank cells,
which is what Jack saw. Keep ray maths on unit vectors.
In 0.12.0 Jack had the beam removed altogether: index.html no longer passes `beam` to `render()` and `LOOKS.*.beam` is 0.
The `beam()` code is still in `WATER_FS` (it returns 0) if he ever wants it back. Wave lines were turned down (`wave`).
SwiftShader (the screenshot tool) doesn't show this, so check on the real PC.

## A bug fixed in 0.10.0
Clicking a place label did nothing: the swipe handler on the viewport (`vp` pointerdown) captured the pointer, so the
click never reached the label. Labels (`.place`), floats and the journal page are now skipped by that handler. Any new
clickable thing in the world needs the same.

## Widgets (Jack's next step)

The workbench is where Jack will build new widgets with you. Here's how to add one:

1. Create `renderer/widgets/<name>.js` and call:

```js
AllieWidgets.register({
  id: "water", title: "Water today", uses: [],
  mount(el, api) {
    // el is the card body to draw into. api.data is Jack's data object (saved to data.json). api.save() saves it
    // (and refreshes the panels listed in `uses`, see DEPS in index.html). api.say(text) makes Allie speak.
    const d = (api.data.widgets = api.data.widgets || {}).water = api.data.widgets.water || { glasses: 0 };
    el.innerHTML = `<b>${d.glasses}</b> glasses <button class="btn">+1</button>`;
    el.querySelector("button").onclick = () => { d.glasses++; api.save(); el.querySelector("b").textContent = d.glasses; };
  }
});
```

2. Load it in renderer/index.html, after `<script src="widgets/index.js"></script>`:
   `<script src="widgets/<name>.js"></script>`.
3. Keep each widget's data under `data.widgets.<id>`. Never rename or remove Jack's existing data keys.
4. Add a test, and take a screenshot of the workbench in both themes.

Ideas for later:
- A widget could also get a floating button, or become a full tab. For that, add it to `PANELS`, `body()`, a place's
  `keys` and `FLOATS`.
- Allie could open widgets through a brain tool.

## What's next (agreed, not built)

**Stage 2: the journal.** The page itself is built (see above). Still to do:
- She can append when asked ("write in my journal that …") and find old entries ("what did I write about …").
- This needs brain tools: `journal_add`, `journal_search`.
- Store entries in data.json under `journal: [{ id, d, text }]`.
- Store entries the same way the page does (`S.journal`).

**Technical list from Jack (after the visuals):**
- **Faster launch.**
- **Interrupting her:** done in 0.11.0. In `onHeard`, while she's speaking, anything heard that is at least two words and
  mostly *not* words from her current line (`said`) stops her, and the rest of the sentence is taken as Jack's. If
  echo still gets through on Jack's speakers, raise the 0.5 threshold or require more words.
- **Transcription:** it's poor. For example, "today" comes out as "to day". The speech code is in src/voice.js and
  src/speech-text.js.

## How to check your work
- Run `npm test`. 24 tests, all offline.
- Run `npx electron tools/screenshots.js shots`, then look at the shots in both themes before calling a UI change done.
- Jack approves visual changes from screenshots before they're committed. Send screenshots, iterate, then commit.
