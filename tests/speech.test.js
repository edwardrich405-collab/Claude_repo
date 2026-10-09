// What Allie says is cleaned up for speaking and split into sentence-sized pieces.
const test = require("node:test"), assert = require("node:assert");
const { clean, sentences, pauseAfter, trim } = require("../src/speech-text");

test("money, percentages and dates read naturally", () => {
  assert.strictEqual(clean("It's $34.99, up 73%."), "It's 34 dollars 99, up 73 percent.");
  assert.strictEqual(clean("$1 or $1,200 or £5.50 or $0.40"), "1 dollar or 1200 dollars or 5 pounds 50 or 40 cents");
  assert.strictEqual(clean("Budget $2.5k"), "Budget 2.5 thousand dollars");
  assert.strictEqual(clean("Due 2026-10-14 at 3:30pm"), "Due October 14th at 3 30 P M");
  assert.strictEqual(clean("Call at 9am"), "Call at 9 A M");
  assert.strictEqual(clean("Pays 40-50 an hour"), "Pays 40 to 50 an hour");
});

test("markdown, emoji and links are stripped", () => {
  assert.strictEqual(clean("**Three** new jobs 🎉 — see [here](https://x.com/a)."), "Three new jobs, see here.");
  assert.strictEqual(clean("- one\n- two"), "one. two");
  assert.strictEqual(clean("Go to https://example.com/jobs now"), "Go to the link now");
});

test("acronyms are spelled out, words stay words", () => {
  assert.strictEqual(clean("AI and UGC on the API, OK?"), "A I and U G C on the A P I, okay?");
  assert.strictEqual(clean("Two 3D jobs and a ComfyUI workflow"), "Two 3 D jobs and a Comfy U I workflow");
  assert.strictEqual(clean("Two PDFs"), "Two P D Fs");
});

test("sentences split at ends, not after Dr. or inside numbers", () => {
  assert.deepStrictEqual(sentences("Hi Jack. Dr. Lee called about the 2.5 hour edit! Want me to reply?"),
    ["Hi Jack. Dr. Lee called about the 2.5 hour edit!", "Want me to reply?"]);
  assert.deepStrictEqual(sentences("No trailing stop"), ["No trailing stop"]);
  assert.ok(pauseAfter("Really?") > pauseAfter("and then,"));
});

test("silence is trimmed from both ends", () => {
  const rate = 1000, s = new Float32Array(1000); s.fill(0.5, 300, 600);
  const out = trim(s, rate);
  assert.ok(out.length >= 300 && out.length <= 340, String(out.length));
  assert.strictEqual(trim(new Float32Array(100), rate).length, 0);
});
