# Allison changelog

Newest first. Plain words, so Allie can read this to explain her own updates.

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
