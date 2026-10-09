# Allison: plan and rules

Jack's personal assistant. Allie is a pink particle cloud on an infinite canvas, talks with Kokoro's natural "Bella" voice (not Heart, which Jack's friend uses), laid-back and brief (never explains tabs or features, sums up what's in them instead), and calls him Jack.

## How Claude works on this project
- Claude edits the real files in this folder. Every update is one git commit with a clear message, so any update can be undone (`git revert <id>`).
- Before writing anything: check `git status` and `git log`. If files changed since the last release, adopt those changes first. Never overwrite a file without reading it.
- Problems are diagnosed from evidence first: %APPDATA%\Allison\allison.log and data.json, with timestamps.
- Run `npm test` before and after every change and add a test for each new behaviour or bug fix. UI changes get screenshots in light and dark and in a small window.
- Bump the version in package.json and add a changelog entry (docs/changelog.md) every release, then tell Jack in a few lines what changed and whether to restart.

## Rules
- Never read, print or ask for keys. Jack types keys into Settings himself; they're stored encrypted by Windows.
- Never delete or rewrite Jack's data (%APPDATA%\Allison).
- Don't commit files Jack is in the middle of editing.
- Ask once before anything that spends money, deletes, posts or sends something as Jack.

## Layout
- src/main.js: window, voice, inbox, file watching. src/brain.js: Claude and the actions it can take. src/connectors.js + hub.js: Gmail, calendars, Stripe, PayPal, job boards. src/voice.js + models.js: offline speech (sherpa-onnx), models download on first run.
- renderer/index.html: the whole screen (canvas, Allie, panels). renderer/voices.js: her recorded lines.
- tests/: offline tests. Run `npm test` (it lists the test files explicitly).

## Later
- Let Allie code on herself through the Claude Agent SDK, limited to this folder, with a git checkpoint per change, tests after each one, automatic undo when tests fail, and a guard file she can't edit.
