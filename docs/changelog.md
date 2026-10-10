# Allison changelog

Newest first. Plain words, so Allie can read this to explain her own updates.

## 0.11.2 (2026-10-10)
- Fixed for real: patches of the screen going flat and blank wherever the lighthouse beam pointed. The beam's maths ran on a very long, un-shortened ray, which some graphics cards couldn't handle; it now works on a unit-length ray with a capped reach. The water and character passes also refuse any broken value, so a bad pixel can never blank the screen again.

## 0.11.1 (2026-10-10)
- Fixed: big dark circles that wiped out the sea and followed the lighthouse beam on some PCs. The beam's maths could hand the graphics card a "not a number" at its far end, and the glow pass smeared it into circles. The beam is fixed and the glow and final passes now skip any such pixel.

## 0.11.0 (2026-10-10)
- Talk over Allie and she stops and listens, then answers what you said. She ignores her own voice coming back through the speakers (if most of what the mic hears is words she's saying right now). "Stop" on its own still just stops her.
- A stop button sits next to the chat button (beside the chat line at home) while Allie is talking or thinking. Click it to cut her off.
- Allie fits the scene better: she's printed with the same tiny pixel characters as everything else, catches the same moonlit outline as the lighthouse and rocks, and is also drawn into the scene itself, so any glow around her is the scene's own glow rather than a blur.

## 0.10.0 (2026-10-10)
- A new night look, after the reference pictures: tiny glowing cyan pixel characters (now 3 x 4 pixels, finer than before) on a darker sea, a big pixel moon with a narrow path of glitter under it, soft cumulus clouds low on the horizon, stars, and a subtle glow on the bright parts. By day the sun no longer floods the water.
- Things in the world catch a rim of light on their edges (the lighthouse, rocks, boat, bench), so they stand out against the dark like in the references.
- The lighthouse is more detailed, stands on a rocky island and sweeps a beam across the sky. Home is now a little rocky islet with Allie's post on it instead of a long beach.
- Labels and tab buttons are cards: a dark rounded card with an icon, a name and a live status line ("0 kcal", "nothing soon"), joined by a thin line to a glowing dot on the thing itself. Only the current place's buttons show.
- A clock with the date in the top right, all in white. The chat is a pill with a sparkle and a round send button. The top-left buttons are round to match.
- Allie has a soft pink glow so she fits into the scene.
- The journal works: click the bottle (or its label, or say "open my journal") and a page unrolls. Write, press Log it, and it's saved; the arrows flip back through older pages. Allie never replies there. Entries are saved in data.json under journal.
- Fixed: clicking a place's label (My Life, Studio, Journal) didn't take you there, because the swipe handler caught the click.

## 0.9.0 (2026-10-10)
- A little world instead of one screen. Home is a beach at the water's edge: waves roll in with white foam, Allie sits on a weathered post facing you, and the moon (night) or a warm sun (day) hangs over the sea. Out on the water are My Life (the boat), the Studio (a lighthouse on a rocky island), the journal (a bottle drifting by the island) and a workbench by the lighthouse.
- Chat lives on the beach: a single line at the bottom that opens into the full conversation as soon as you start typing (the – button shrinks it again). Everything you and Allie say is kept there, between launches too.
- Say or type "take me to my life / the studio / my journal / the workbench / home" and the camera sails there while Allie flies along. Or click the labels over each place, or the house button next to the moon. Allie can do it too (her new go_to action).
- My Life (the boat): Today, Mail, Calendar, To-do, Calories. Studio (the lighthouse): Video editing and AI influencer (now two separate tabs instead of Businesses), Clock, Money, 3D jobs.
- Tabs open standing above their button on a ring around their place, facing outward. Drag to circle round and see each one face on; a swipe settles on the nearest tab. Left and right arrows step between tabs. Each tab has a little bar underneath: drag it to put the tab somewhere else (it stays there). Tabs show a blank back from behind and fade when edge-on.
- Settings is a gear button next to the moon. It opens as a sheet on the right while the camera backs off so you can see everything behind it, and closing it takes you back.
- The workbench (build mode): click it at the Studio and the camera drops close over the desk. Widgets you make go in renderer/widgets and show up on its mat. Done (or Esc) goes back to the Studio.
- The look is back to the first version's ASCII characters and darker colours, with the 3D boat model sitting low in the water, lit with a rim light. The night is darker, the day brighter and warmer. Reflections and moon/sun glitter are drawn in characters.
- Allie's subtitles are smaller. Opening a tab is quicker: the camera goes straight there and Allie flies on her own.
- Fixed: zooming while reading a tab made it see-through and unclickable; a tab's grab bar covered its button; double-clicking a grab bar sent you home; Allie landed on the boat instead of the tab after "log a banana"; the Settings sheet covered the chat bar; Enter on a button opened the chat instead of pressing it; and more from a full review of the new navigation.

## 0.8.0 (2026-10-10)
- The sea is now a real lit 3D scene with the print look of the reference images on top: a fine grid of dots over a sharp picture, with small patches of ASCII characters drifting through the darker water.
- Water: waves and wind lines, rings rippling out from the boat, the moon (dark mode) or the sun (light mode) glittering in a path across the water, a soft glow from the light at the top of the screen, and reflections of the boat, the tabs, the buttons and Allie herself.
- The boat is the "Wooden Boat" model by lpfeffer (credited in Settings), weathered to pale grey, sitting stern-down and half full of water, rocking on the swell, casting shadows on itself and the water, its sunk end seen through the water. The model was repacked from 37 MB to 2.7 MB so it loads fast.
- Allie is a 3D pink gull lit by the same moon or sun: she stands on the bow in profile, folds her black-tipped wings over her back, beats them to fly, tucks her head into her back to sleep, lifts it when she hears you, tilts it while thinking and opens her beak as she talks.
- When she flies to a tab the camera follows her across the water, so she stays on screen the whole way, then settles on the tab as she lands.
- Tabs open closer to the boat. A tab right in front of the camera fades out so it doesn't cover the one you're looking at.
- The floating buttons are little app icons: the tab's icon in a glass circle with its name underneath. The timer one pulses and shows the time while it runs.

## 0.7.0 (2026-10-10)
- New look: the home screen is an ASCII ocean with slow rippling rings and a wooden rowboat half sunk in the middle, bobbing on the swell. Dark mode is the teal night sea, light mode the green sunlit one.
- Allie is now a pink gull (pink in both modes). She perches on the boat's bow post, flies over to each tab you open and lands on its top edge, and flies home when it closes. Asleep she tucks her head in with little z's floating up, and the sea dims. She perks up when she hears you, tilts her head while thinking and opens her beak as she talks. Tap her to stop her talking.
- Tabs open just above the water at their own spots around the boat, with light glowing on the water under them, and the camera sails over to them. They have the new calorie-card look: dark sea glass, mono headings, dotted rings and bars, outlined buttons.
- Drag the water to sail around, scroll to zoom, drag a tab by its header to move it, double-click the water (or press 0) to go home. "Show everything" backs the camera off until every open tab fits.
- The side rail is gone. Its buttons now float on the water around the boat as little ASCII buttons; the timer one shows the running time.
- The only fixed controls left: the moon (sleep) top left, the chat button at the bottom, and a small "thinking" spinner while she works out a reply. The mic and stop buttons and the voice meter are gone (Esc still stops her talking). Light/dark lives in Settings, Appearance.

## 0.6.0 (2026-10-09)
- Allie can think with a free local model on this PC (Qwen3 30B through Ollama) instead of Claude. Switch in Settings, Brain, Thinks with: Claude or Local. The choice is remembered.
- The local brain uses the same personality and can do everything in the app (to-dos, timers, tabs, notes), but can't search the web.
- If Ollama isn't running she says so instead of going quiet.

## 0.5.0 (2026-10-09)
- Design pass using Apple's fluid-interface rules (the apple-design skill).
- The camera now glides to a tab on a smooth spring with no overshoot. If you were already sliding the canvas, that speed carries into the move, and asking for another tab mid-flight just changes course instead of restarting.
- Tabs grow out of Allie and shrink back into her on the same kind of spring, and a tab that's closing can be turned around mid-way instead of a second copy appearing.
- Buttons react the instant they're pressed, with no bounce.
- Text spacing is tuned by size: big numbers and headings are a touch tighter, small labels a touch looser.
- Fixed: the voice meter next to the mic showed its bars stacked in a column instead of side by side.
- Fixed: in light mode the Gmail, calendar, Stripe and PayPal fields in Settings were invisible, and some dividers too.
- Follows Windows' accessibility settings: Reduce motion (the camera cuts instead of flying, tabs fade), Transparency effects off (solid panels) and Contrast themes (stronger lines and text).
- Added tools/screenshots.js, which takes screenshots of the screen in dark, light and a small window for design checks.

## 0.4.2 (2026-10-09)
- Fixed: Allie's voice was silent after 0.4.0. Inside the app the voice engine can't hand back a finished sentence, so the audio is now copied out while it's being made, like before. If speaking ever fails again it's written to allison.log.

## 0.4.1 (2026-10-09)
- Allie's voice is now Kokoro's "Bella" instead of "Heart", so she doesn't sound like Jack's friend's assistant. Same model, same natural delivery.

## 0.4.0 (2026-10-09)
- New voice: Allie now speaks with Kokoro's "Heart" voice at normal speed, the most natural one it has, with US English pronunciations. The old British blend is still on this PC if Jack wants it back.
- She sounds less robotic: prices, percentages, dates, times and acronyms are read the way a person says them ("34 dollars 99", "73 percent", "October 14th", "A I"), markdown and emoji are stripped, each sentence is made while the last one plays, and the silence the voice model adds around each sentence is trimmed and replaced with a short natural pause.
- Her first words come about half a second after she starts, using more of the processor.
- More chill: she no longer explains what a tab is. Opening a tab gets a quick rundown of what's in it (new jobs, unread mail, what's next today, to-dos, timer, calories, money this month, edits on the go).
- Going to sleep is just "Night." No instructions on how to wake her.
- Fixed: "Update ready, Restart now" no longer pops up every time she starts. Windows was reporting her reading a file as a change.
## 0.3.0 (2026-10-09)
- Allison now runs straight from this project folder instead of an installer. Claude edits the files here and the app picks changes up by itself.
- Screen changes reload in place. App-code changes show "Update ready · Restart now / Later" in the top bar.
- Allie's recorded lines moved into renderer/voices.js so the main page is small enough to edit.
- Added offline tests (npm test).

## 0.2.1 (2026-10-09)
- AI influencer tab: characters with stages, workflows, "Waiting on you" to-dos, numbers and latest updates.
- Inbox: text files dropped in Documents\Allison\Inbox are read and filed by Allie, then moved to Done.

## 0.2.0 (2026-10-09)
- Connections in Settings: Gmail (app password), Google and Apple calendars (.ics links), Stripe (read-only key), PayPal, and 3D job boards.

## 0.1.0 (2026-10-09)
- First Windows app: always-on listening with sleep and "Hey Allie", live British voice, Claude brain with a key you add in Settings, data saved on this PC.
