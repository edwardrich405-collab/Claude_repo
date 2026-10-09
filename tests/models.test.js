// Allie's voice blend: slot 52 = 60% Emma (21) + 40% Heart (3), everything else untouched.
const test = require("node:test"), assert = require("node:assert"), fs = require("fs"), os = require("os"), path = require("path");
const { makeAllie } = require("../src/models");

test("voice blend is written into slot 52", () => {
  const per = 510 * 256, f = new Float32Array(54 * per);
  f.fill(1, 21 * per, 22 * per); f.fill(2, 3 * per, 4 * per); f.fill(9, 52 * per, 53 * per);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "allie-"));
  fs.writeFileSync(path.join(dir, "voices.bin"), Buffer.from(f.buffer));
  makeAllie(dir);
  const out = new Float32Array(fs.readFileSync(path.join(dir, "voices-allie.bin")).buffer.slice(0));
  assert.ok(Math.abs(out[52 * per] - 1.4) < 1e-6);
  assert.strictEqual(out[21 * per], 1);
  assert.ok(!fs.existsSync(path.join(dir, "voices.bin")));
});
