// The sea renderer's pure parts: reading the boat model, finding its bow, and Allie's body and poses.
const test = require("node:test"), assert = require("node:assert"), fs = require("fs"), path = require("path"), vm = require("vm");
const R = path.join(__dirname, "..", "renderer");
const ctx = { window: {}, TextDecoder, Math, Float32Array, Uint16Array, Uint32Array, Uint8Array, DataView, JSON, Object, Array, String, Number, Error, Promise };
vm.runInNewContext(fs.readFileSync(path.join(R, "sea.js"), "utf8"), ctx);
const S = ctx.window.AllieSea;

test("the packed boat model loads, stays small, and credits its author", () => {
  const bytes = fs.readFileSync(path.join(R, "models", "boat.glb"));
  assert.ok(bytes.length < 6e6, "boat.glb should stay under 6 MB so Allison starts fast");
  const m = S.parseGLB(new Uint8Array(bytes));
  assert.strictEqual(m.pos.length % 3, 0);
  assert.strictEqual(m.pos.length / 3, m.uv.length / 2);
  assert.strictEqual(m.tan.length / 4, m.pos.length / 3);
  assert.ok(m.idx.length > 3000 && m.idx.length % 3 === 0);
  for (const t of [m.base, m.orm, m.normal]) assert.strictEqual(t.mime, "image/jpeg");
  assert.match(m.credit.author || "", /lpfeffer/);
  // the bow points to -x and Allie perches on top of it
  const tip = S.bowTip(m.pos);
  assert.ok(tip[0] < -0.9 && tip[1] > 0.1, String(tip));
});

test("Allie's body: every part is a sound mesh", () => {
  const parts = S.buildGull();
  for (const k of ["body", "head", "jaw", "eye", "arm", "hand", "legs"]) {
    const p = parts[k]; assert.ok(p, k);
    assert.strictEqual(p.pos.length, p.nor.length, k); assert.strictEqual(p.pos.length, p.col.length, k);
    assert.ok(p.pos.every(Number.isFinite) && p.nor.every(Number.isFinite), k);
    assert.ok(Math.max(...p.idx) < p.pos.length / 3, k);
  }
  // she is pink: the body colours lean red-blue, never green
  const c = parts.body.col; let r = 0, g = 0, b = 0; for (let i = 0; i < c.length; i += 3) { r += c[i]; g += c[i + 1]; b += c[i + 2]; }
  assert.ok(r > g * 1.3 && b > g, "body should be pink");
});

test("Allie's poses give finite transforms: perched, flying, asleep, talking", () => {
  const base = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0, scale: 1, wings: 0, flap: 0, amp: 0, legs: 1, sleep: 0, listen: 0, tilt: 0, beak: 0, blink: 0, nod: 0 };
  for (const extra of [{}, { wings: 1, flap: 2, amp: 0.9, legs: 0 }, { sleep: 1 }, { beak: 1, listen: 1, tilt: 0.3 }]) {
    const m = S.gullPose({ ...base, ...extra });
    for (const k in m) assert.ok(Array.from(m[k]).every(Number.isFinite), k);
    // folded wings sit behind the shoulders; spread wings reach out to the sides
    const tip = S.M4.point(m.handR, [0, 0, 27]);
    if (extra.wings) assert.ok(Math.hypot(tip[1] - 26, tip[2]) > 35, "spread"); else if (!extra.sleep) assert.ok(tip[0] < -20 && Math.abs(tip[2]) < 14, "folded");
  }
});
