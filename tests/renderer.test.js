// The window's script and Allie's recorded lines must at least parse.
const test = require("node:test"), assert = require("node:assert"), fs = require("fs"), path = require("path"), vm = require("vm");
const R = path.join(__dirname, "..", "renderer");

test("index.html script parses", () => {
  const h = fs.readFileSync(path.join(R, "index.html"), "utf8");
  const scripts = [...h.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
  assert.ok(scripts.length >= 1);
  for (const s of scripts) new vm.Script(s);
  assert.match(h, /<script src="voices.js"><\/script>/);
});

test("voices.js defines every line", () => {
  const ctx = { window: {} }; vm.runInNewContext(fs.readFileSync(path.join(R, "voices.js"), "utf8"), ctx);
  const v = ctx.window.ALLIE_VOICES.allie;
  for (const k of ["hello", "sleep", "wake", "micOff"]) assert.ok(v[k] && /^data:audio/.test(v[k][1]), k);
});

test("live lines stay short, and sleep doesn't explain how to wake her", () => {
  const h = fs.readFileSync(path.join(R, "index.html"), "utf8");
  const lines = JSON.parse(h.match(/const LINES = (\{.*?\});/)[1]);
  for (const k of ["sleep", "wake", "hello", "added"]) assert.ok(lines[k] && lines[k].split(" ").length <= 6, k);
  assert.doesNotMatch(lines.sleep, /hey allie|tap|moon|wake/i);
  for (const k of ["jobs", "mail", "today", "calendar", "todo", "time", "calories", "finances", "businesses"]) assert.match(h, new RegExp(`if \\(key === "${k}"\\) \\{?[\\s\\S]{0,40}`), k);
});

test("design-pass fixes stay fixed", () => {
  const h = fs.readFileSync(path.join(R, "index.html"), "utf8");
  // voice meter bars side by side, even though the Finances chart also uses .bars
  assert.match(h, /\.vu \.bars\{[^}]*flex-direction:row/);
  // connection fields use theme colours, so they show in light mode
  assert.match(h, /\.connform input\{[^}]*background:var\(--field\)/);
  // in a plain browser window.allie is the canvas, so desktop calls must check allie.desktop
  assert.doesNotMatch(h, /if \(window\.allie\)|window\.allie \?/);
  // panels animate with interruptible springs, not the old keyframes
  assert.doesNotMatch(h, /panel\.entering|@keyframes pop\b/);
});
