# Allison changelog

Newest first. Plain words, so Allie can read this to explain her own updates.

## 0.4.0 (2026-10-09)
- New voice: Allie now speaks with Kokoro's "Heart" voice at normal speed, the most natural one it has, with US English pronunciations. The old British blend is still on this PC if Jack wants it back.
- She sounds less robotic: prices, percentages, dates, times and acronyms are read the way a person says them ("34 dollars 99", "73 percent", "October 14th", "A I"), markdown and emoji are stripped, each sentence is made while the last one plays, and the silence the voice model adds around each sentence is trimmed and replaced with a short natural pause.
- Her first words come about half a second after she starts, using more of the processor.
- More chill: she no longer explains what a tab is. Opening a tab gets a quick rundown of what's in it (new jobs, unread mail, what's next today, to-dos, timer, calories, money this month, edits on the go).
- Going to sleep is just "Night." No instructions on how to wake her.
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
