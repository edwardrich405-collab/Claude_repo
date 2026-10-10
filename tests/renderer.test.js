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
  // connection fields use theme colours, so they show in light mode
  assert.match(h, /\.connform input\{[^}]*background:var\(--field\)/);
  // in a plain browser window.allie is the canvas, so desktop calls must check allie.desktop
  assert.doesNotMatch(h, /if \(window\.allie\)|window\.allie \?/);
  // panels animate with interruptible springs, not the old keyframes
  assert.doesNotMatch(h, /panel\.entering|@keyframes pop\b/);
});

test("the world: only sleep, settings, home, chat, stop and thinking stay fixed; every tab has a place", () => {
  const h = fs.readFileSync(path.join(R, "index.html"), "utf8");
  const chrome = h.slice(h.indexOf('<div class="dragbar">'), h.indexOf('<script src="voices.js">'));
  const ids = [...chrome.matchAll(/<button[^>]*id="([^"]+)"/g)].map(m => m[1]).sort();
  assert.deepStrictEqual(ids, ["chat", "cl-min", "home", "send", "settings", "sleep", "stop"]); // cl-min shrinks the beach chat back to one line
  assert.match(chrome, /id="think"/);
  assert.doesNotMatch(h, /id="mic"|class="rail"/);
  // Allie stops when Jack talks over her (not on her own echo), and a stop button shows while she talks
  assert.match(h, /if \(w\.length < 2 \|\| own \/ w\.length >= 0\.5\) return;\r?\n\s*stopTalking\(\);/);
  assert.match(h, /sb\.hidden = !b/);
  // the sea, the boat and Allie's body live in sea.js, loaded before the page script
  assert.match(h, /<script src="sea.js"><\/script>/);
  // every tab has a floating button on the ring (tools/screenshots.js clicks them by data-cmd); settings is a fixed
  // button next to the moon and opens as a sheet on the right
  const floats = h.match(/const FLOATS = (\[.*?\]);/)[1];
  for (const k of ["today", "mail", "calendar", "todo", "time", "calories", "editing", "influencer", "finances", "jobs"]) assert.match(floats, new RegExp(`\\["${k}"`), k);
  // My Life is the boat, the Studio the lighthouse; home is the beach, with the chat
  assert.match(h, /life: +\{ label: "my life"[^}]*keys: \["today", "mail", "calendar", "todo", "calories"\]/);
  assert.match(h, /studio: +\{ label: "studio"[^}]*keys: \["editing", "influencer", "time", "finances", "jobs"\]/);
  assert.match(chrome, /id="chatlog"/);
  assert.doesNotMatch(floats, /"settings"/);
  assert.match(h, /if \(key === "settings"\) return openSheet\(\);/);
  // tabs carry a grab bar for moving them around the water
  assert.match(h, /class="grab" data-grab/);
  // floating buttons and place labels are tags: a dot, a leader line and a card with an icon, a name and a status line
  assert.match(h, /const tagHTML = [^\n]*class="tag-dot"[^\n]*class="tag-lead"[^\n]*class="tag-card">\$\{icon\(ic\)\}/);
  assert.match(h, /floats\.innerHTML = FLOATS\.map\(\(\[k, n\]\) => tagHTML\("float"/);
  // the clock in the top right
  assert.match(chrome, /class="clock" id="clock"/);
  // the sea is WebGL2 with a plain fallback
  const sea = fs.readFileSync(path.join(R, "sea.js"), "utf8");
  new vm.Script(sea);
  assert.match(sea, /getContext\("webgl2"/);
  assert.match(h, /\.nogl #viewport/);
});

test("the workbench: a place to travel to, its mat, and a widget registry that loads before the page", () => {
  const h = fs.readFileSync(path.join(R, "index.html"), "utf8");
  assert.match(h, /craft: +\{ label: "workbench"/);
  assert.match(h, /id="bench" class="bench-mat"/);
  const order = ["voices.js", "sea.js", "widgets/index.js"].map(f => h.indexOf(`<script src="${f}"></script>`));
  assert.ok(order.every(i => i > 0) && order[0] < order[1] && order[1] < order[2], "scripts load in order");
  const ctx = { window: {} }; vm.runInNewContext(fs.readFileSync(path.join(R, "widgets", "index.js"), "utf8"), ctx);
  const W = ctx.window.AllieWidgets; W.register({ id: "a", title: "A" }); W.register({ id: "a", title: "dupe" }); W.register({ title: "no id" });
  assert.strictEqual(W.list.length, 1);
  // the beach chat starts as one line and opens when you start chatting
  assert.match(h, /\.chatlog:not\(\.open\)/);
  assert.match(h, /if \(e\.target\.value\.trim\(\)\) chatOpen\(true\)/);
});
