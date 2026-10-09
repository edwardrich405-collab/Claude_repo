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
