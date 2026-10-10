// The sea: Allie's world, drawn with WebGL2.
// A lit 3D scene (water with waves and ripple rings, the wooden boat with its textures and shadows, reflections of the
// boat, the tabs, the buttons and Allie in the water) is rendered in full colour, then turned into ASCII: every small
// cell becomes a character picked by its brightness, tinted with the scene's own colour. Allie herself, a pink gull,
// is a 3D model built here from simple shapes and drawn on her own layer above the tabs, lit by the same moon or sun.
(() => {
  "use strict";

  /* ---------------- Small maths ---------------- */
  const M4 = {
    id: () => new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]),
    mul(a, b) { const o = new Float32Array(16); for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3]; return o; },
    T: (x, y, z) => new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1]),
    S: (x, y, z) => new Float32Array([x, 0, 0, 0, 0, y, 0, 0, 0, 0, z, 0, 0, 0, 0, 1]),
    X(a) { const c = Math.cos(a), s = Math.sin(a); return new Float32Array([1, 0, 0, 0, 0, c, s, 0, 0, -s, c, 0, 0, 0, 0, 1]); },
    Y(a) { const c = Math.cos(a), s = Math.sin(a); return new Float32Array([c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, 0, 0, 0, 1]); },
    Z(a) { const c = Math.cos(a), s = Math.sin(a); return new Float32Array([c, s, 0, 0, -s, c, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]); },
    chain(...ms) { return ms.reduce((a, b) => M4.mul(a, b)); },
    point(m, p) { return [m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12], m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13], m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14]]; },
    // a 3x3 rotation (rows) + position + uniform scale, as a column-major 4x4
    fromRS(R, pos, s) { return new Float32Array([R[0][0] * s, R[1][0] * s, R[2][0] * s, 0, R[0][1] * s, R[1][1] * s, R[2][1] * s, 0, R[0][2] * s, R[1][2] * s, R[2][2] * s, 0, pos[0], pos[1], pos[2], 1]); },
    ortho(l, r, b, t, n, f) { return new Float32Array([2 / (r - l), 0, 0, 0, 0, 2 / (t - b), 0, 0, 0, 0, -2 / (f - n), 0, -(r + l) / (r - l), -(t + b) / (t - b), -(f + n) / (f - n), 1]); },
    lookAt(e, c, up) {
      const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], nrm = v => { const l = Math.hypot(...v); return v.map(x => x / l); };
      const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]], dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
      const z = nrm(sub(e, c)), x = nrm(cross(up, z)), y = cross(z, x);
      return new Float32Array([x[0], y[0], z[0], 0, x[1], y[1], z[1], 0, x[2], y[2], z[2], 0, -dot(x, e), -dot(y, e), -dot(z, e), 1]);
    }
  };
  const NEAR = 5, FAR = 60000;
  // The app's camera (looks down the water at pitch p, positioned by basis b) as view and projection matrices.
  function cameraMats(b, FOC, W, H) {
    const { sp, cp, cx, cy, cz } = b;
    const V = new Float32Array([1, 0, 0, 0, 0, cp, sp, 0, 0, -sp, cp, 0, -cx, -(cp * cy - sp * cz), -(sp * cy + cp * cz), 1]);
    const A = -(FAR + NEAR) / (FAR - NEAR), B = -2 * FAR * NEAR / (FAR - NEAR);
    const P = new Float32Array([2 * FOC / W, 0, 0, 0, 0, 2 * FOC / H, 0, 0, 0, 0, A, -1, 0, 0, B, 0]);
    return M4.mul(P, V);
  }

  /* ---------------- Reading the boat model (.glb) ---------------- */
  // Reads the packed model tools/pack-boat.py writes: one mesh with positions, normals, tangents, UVs and indices,
  // and three JPEG textures (colour, occlusion/roughness, normal).
  function parseGLB(buf) {
    const u8 = buf instanceof Uint8Array ? buf : new Uint8Array(buf), dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
    if (dv.getUint32(0, true) !== 0x46546C67) throw new Error("not a .glb file");
    const jl = dv.getUint32(12, true), json = JSON.parse(new TextDecoder().decode(u8.subarray(20, 20 + jl)));
    const bin = u8.subarray(28 + jl, 28 + jl + dv.getUint32(20 + jl, true));
    const view = i => { const v = json.bufferViews[i], o = v.byteOffset || 0; return bin.slice(o, o + v.byteLength); };
    const acc = i => { const a = json.accessors[i], n = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }[a.type], Ty = { 5126: Float32Array, 5123: Uint16Array, 5125: Uint32Array }[a.componentType];
      return new Ty(view(a.bufferView).buffer, a.byteOffset || 0, a.count * n); };
    const p = json.meshes[0].primitives[0], at = p.attributes, m = (json.materials || [])[p.material] || {}, pbr = m.pbrMetallicRoughness || {};
    const img = t => { if (!t) return null; const im = json.images[json.textures[t.index].source]; return { mime: im.mimeType, bytes: view(im.bufferView) }; };
    return { pos: acc(at.POSITION), nor: acc(at.NORMAL), tan: at.TANGENT != null ? acc(at.TANGENT) : null, uv: acc(at.TEXCOORD_0), idx: acc(p.indices),
      base: img(pbr.baseColorTexture), orm: img(m.occlusionTexture || pbr.metallicRoughnessTexture), normal: img(m.normalTexture), credit: (json.asset && json.asset.extras) || {} };
  }
  // The top of the bow: the highest point in the front tenth of the boat (the model's bow points to -x).
  function bowTip(pos) {
    let minX = Infinity, maxX = -Infinity; for (let i = 0; i < pos.length; i += 3) { minX = Math.min(minX, pos[i]); maxX = Math.max(maxX, pos[i]); }
    let best = null; for (let i = 0; i < pos.length; i += 3) if (pos[i] < minX + (maxX - minX) * 0.06 && (!best || pos[i + 1] > best[1])) best = [pos[i], pos[i + 1], pos[i + 2]];
    return best;
  }

  /* ---------------- Allie's body: a gull built from lofted shapes ---------------- */
  // Each part is a mesh in its own space with a pivot, so it can be posed: body, head (with neck), lower beak, eyes,
  // the two halves of a wing (arm and hand, shared by both sides through a mirror), and legs.
  // Units: world units; she's about 75 long from tail to beak tip. Forward is +x, up is +y, her right is +z.
  const PINK = {
    back: [0.80, 0.33, 0.50], side: [0.93, 0.47, 0.62], belly: [0.98, 0.74, 0.82], head: [0.96, 0.58, 0.71], face: [0.99, 0.70, 0.80],
    mantle: [0.78, 0.36, 0.53], mantleEdge: [0.93, 0.60, 0.72], tip: [0.07, 0.04, 0.06], spot: [0.97, 0.93, 0.95],
    beak: [0.97, 0.78, 0.30], gonys: [0.86, 0.22, 0.25], leg: [0.94, 0.55, 0.58], eye: [0.05, 0.03, 0.04], ring: [0.95, 0.45, 0.35]
  };
  function meshBuilder() {
    const P = [], C = [], A = [], I = [];
    return {
      P, C, A, I,
      v(p, c, a) { P.push(p[0], p[1], p[2]); C.push(c[0], c[1], c[2]); A.push(a[0], a[1]); return P.length / 3 - 1; },
      tri(a, b, c) { I.push(a, b, c); },
      // smooth normals from the faces around each vertex
      done() {
        const N = new Float32Array(P.length);
        for (let i = 0; i < I.length; i += 3) {
          const [a, b, c] = [I[i] * 3, I[i + 1] * 3, I[i + 2] * 3];
          const e1 = [P[b] - P[a], P[b + 1] - P[a + 1], P[b + 2] - P[a + 2]], e2 = [P[c] - P[a], P[c + 1] - P[a + 1], P[c + 2] - P[a + 2]];
          const n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
          for (const k of [a, b, c]) { N[k] += n[0]; N[k + 1] += n[1]; N[k + 2] += n[2]; }
        }
        for (let i = 0; i < N.length; i += 3) { const l = Math.hypot(N[i], N[i + 1], N[i + 2]) || 1; N[i] /= l; N[i + 1] /= l; N[i + 2] /= l; }
        return { pos: new Float32Array(P), nor: N, col: new Float32Array(C), aux: new Float32Array(A), idx: new Uint16Array(I) };
      }
    };
  }
  // A tube along a path of rings: each ring is [x, y, z, halfWidth, halfHeight]; colour(t, angle) picks the colour.
  function loft(mb, rings, sides, colour, aux) {
    const base = mb.P.length / 3, smooth = [];
    // a little Catmull-Rom between rings so the silhouette is round, not faceted
    const n = rings.length, steps = 4;
    for (let i = 0; i < n - 1; i++) for (let s = 0; s < steps; s++) {
      const t = s / steps, p0 = rings[Math.max(0, i - 1)], p1 = rings[i], p2 = rings[i + 1], p3 = rings[Math.min(n - 1, i + 2)];
      smooth.push(p1.map((_, k) => 0.5 * ((2 * p1[k]) + (-p0[k] + p2[k]) * t + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t * t + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * t * t * t)));
    }
    smooth.push(rings[n - 1]);
    smooth.forEach((r, i) => {
      const a = smooth[Math.max(0, i - 1)], b = smooth[Math.min(smooth.length - 1, i + 1)];
      let tx = b[0] - a[0], ty = b[1] - a[1]; const tl = Math.hypot(tx, ty) || 1; tx /= tl; ty /= tl;
      const nx = -ty, ny = tx; // the "up" of this ring, at right angles to the path in the side view
      for (let j = 0; j < sides; j++) {
        const ang = j / sides * Math.PI * 2, cz = Math.cos(ang), sy = Math.sin(ang);
        mb.v([r[0] + nx * r[4] * sy, r[1] + ny * r[4] * sy, r[2] + r[3] * cz], colour(i / (smooth.length - 1), sy, cz), aux);
      }
    });
    for (let i = 0; i < smooth.length - 1; i++) for (let j = 0; j < sides; j++) {
      const a = base + i * sides + j, b = base + i * sides + (j + 1) % sides, c = a + sides, d = b + sides;
      mb.tri(a, c, b); mb.tri(b, c, d);
    }
  }
  function ellipsoid(mb, c, r, colour, aux, seg = 14) {
    const base = mb.P.length / 3;
    for (let i = 0; i <= seg; i++) for (let j = 0; j <= seg * 2; j++) {
      const th = i / seg * Math.PI, ph = j / (seg * 2) * Math.PI * 2, x = Math.sin(th) * Math.cos(ph), y = Math.cos(th), z = Math.sin(th) * Math.sin(ph);
      mb.v([c[0] + r[0] * x, c[1] + r[1] * y, c[2] + r[2] * z], colour(x, y, z), aux);
    }
    for (let i = 0; i < seg; i++) for (let j = 0; j < seg * 2; j++) {
      const a = base + i * (seg * 2 + 1) + j, b = a + 1, c2 = a + seg * 2 + 1, d = c2 + 1; mb.tri(a, c2, b); mb.tri(b, c2, d);
    }
  }
  const mix3 = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t), sm = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  function buildGull() {
    const parts = {};
    // body: wide flat tail, deep chest, rising into the neck
    let mb = meshBuilder();
    loft(mb, [[-37, 1.5, 0, 6.5, 0.6], [-31, 1.4, 0, 6.4, 1.4], [-23, 0.8, 0, 6.8, 3.8], [-13, 0, 0, 9.4, 8.2], [-3, -0.4, 0, 10.6, 10], [7, 0.4, 0, 10, 9.6], [13, 2.6, 0, 8, 8], [17, 4.6, 0, 4.5, 4.5], [18.6, 5.6, 0, 0.6, 0.6]], 22,
      (t, up, side) => { const c = up < 0 ? mix3(PINK.side, PINK.belly, sm(0, 0.8, -up)) : mix3(PINK.side, PINK.back, sm(0.2, 1, up)); return t < 0.12 ? mix3(c, PINK.mantle, 0.5) : c; }, [0, 0]);
    parts.body = mb.done();
    // head and neck; the neck's base sits inside the body so turning the head never opens a gap
    mb = meshBuilder();
    loft(mb, [[-3, -3, 0, 8, 8], [1, 1.5, 0, 7.2, 7.4], [4.5, 5.5, 0, 6.6, 6.8], [7.5, 8.5, 0, 6.6, 6.9]], 18, () => PINK.head, [1, 0]);
    ellipsoid(mb, [9.6, 10, 0], [8.6, 7.6, 7], (x, y) => mix3(PINK.head, PINK.face, sm(0.1, 0.9, x) * 0.6 + sm(0.3, 1, y) * 0.3), [1, 0]);
    // upper beak, with the hooked tip
    loft(mb, [[15, 9.2, 0, 2.3, 2.1], [19, 8.9, 0, 1.6, 1.5], [23, 8.4, 0, 1.0, 1.1], [25.4, 7.4, 0, 0.5, 0.8], [26, 6.4, 0, 0.15, 0.2]], 10, () => PINK.beak, [2, 0]);
    parts.head = mb.done();
    // lower beak, hinged at the gape; the red spot near the tip
    mb = meshBuilder();
    loft(mb, [[0, 0, 0, 2.1, 1.2], [4, -0.5, 0, 1.6, 1.1], [7.5, -0.9, 0, 1.1, 1.0], [9.2, -0.7, 0, 0.5, 0.7], [10, -0.2, 0, 0.1, 0.1]], 10, t => t > 0.62 && t < 0.86 ? PINK.gonys : PINK.beak, [2, 0]);
    parts.jaw = mb.done();
    mb = meshBuilder(); ellipsoid(mb, [0, 0, 0], [1.45, 1.45, 1.0], () => PINK.eye, [3, 0], 10); parts.eye = mb.done();
    // the wing, in two parts. Span runs along +z, the leading edge faces +x, it's thin and slightly cambered.
    // arm: 20 long, mantle pink with a pale trailing edge. hand: 27 long, swept and pointed, black tip with white mirror spots.
    const wingPart = (len, lead, trail, colour, spanTag) => {
      const m = meshBuilder(), S = 12, Cn = 7, top = [], bot = [];
      for (let i = 0; i <= S; i++) {
        const s = i / S, z = s * len, le = lead(s), te = trail(s), th = (1 - s * 0.7) * 1.4;
        top.push([]); bot.push([]);
        for (let j = 0; j <= Cn; j++) {
          const c = j / Cn, x = le + (te - le) * c, camber = Math.sin(Math.PI * Math.pow(c, 0.7)) * th;
          top[i].push(m.v([x, camber * 1.1, z], colour(s, c), [4, spanTag + s]));
          bot[i].push(m.v([x, camber * 0.15 - th * 0.15, z], colour(s, c), [4, spanTag + s]));
        }
      }
      for (let i = 0; i < S; i++) for (let j = 0; j < Cn; j++) {
        m.tri(top[i][j], top[i][j + 1], top[i + 1][j]); m.tri(top[i][j + 1], top[i + 1][j + 1], top[i + 1][j]);
        m.tri(bot[i][j], bot[i + 1][j], bot[i][j + 1]); m.tri(bot[i][j + 1], bot[i + 1][j], bot[i + 1][j + 1]);
      }
      return m.done();
    };
    parts.arm = wingPart(20, s => 4 + Math.sin(s * Math.PI) * 1.2 - s * 0.6, s => -11 + s * 2.4, (s, c) => mix3(mix3(PINK.mantleEdge, PINK.mantle, sm(0, 0.18, c)), PINK.belly, sm(0.86, 1, c) * 0.35), 0);
    parts.hand = wingPart(27, s => 4.5 - s * s * 9, s => -9.4 + s * 4.2 - s * s * 2.2, (s, c) => {
      const black = sm(0.32, 0.5, s), spot = Math.max(sm(0.12, 0, Math.hypot(s - 0.86, (c - 0.45) * 0.6)), sm(0.1, 0, Math.hypot(s - 0.66, (c - 0.6) * 0.6)) * 0.8);
      return mix3(mix3(PINK.mantle, PINK.tip, black), PINK.spot, spot * black);
    }, 1);
    // legs and webbed feet, standing at the origin
    mb = meshBuilder();
    for (const z of [-3.4, 3.4]) {
      loft(mb, [[1, 20, z, 1.6, 1.6], [0.6, 12, z * 1.05, 1.1, 1.1], [1.6, 2.4, z * 1.1, 0.9, 0.9], [2, 0.6, z * 1.1, 0.8, 0.8]], 8, () => PINK.leg, [5, 0]);
      const k = mb.v([2, 0.4, z * 1.1], PINK.leg, [5, 0]);
      const toes = [[9, 0.3, z * 1.1 + 1.8], [9.6, 0.3, z * 1.1], [9, 0.3, z * 1.1 - 1.8]].map(p => mb.v(p, mix3(PINK.leg, PINK.ring, 0.3), [5, 0]));
      mb.tri(k, toes[0], toes[1]); mb.tri(k, toes[1], toes[2]); mb.tri(k, toes[1], toes[0]); mb.tri(k, toes[2], toes[1]);
    }
    parts.legs = mb.done();
    return parts;
  }
  // Pose → a transform for every part. p: { x, y, z, yaw, pitch, roll, scale, wings (0 folded … 1 spread), flap (phase), amp,
  // sleep, listen, tilt, beak (0…1 open), blink (0 open … 1 shut), legs (1 standing … 0 tucked), crouch }
  const R = Math.PI / 180;
  function gullPose(p) {
    const root = M4.chain(M4.T(p.x, p.y, p.z), M4.Y(p.yaw), M4.Z(p.pitch || 0), M4.X(p.roll || 0), M4.S(p.scale, p.scale, p.scale));
    const bodyY = 26 - p.sleep * 6 - (p.crouch || 0) * 4, bodyTilt = (-6 + p.sleep * 4) * R + (p.wings > 0.5 ? 6 * R : 0) * (p.legs < 0.5 ? 1 : 0);
    const body = M4.chain(root, M4.T(0, bodyY, 0), M4.Z(bodyTilt));
    // head: up when listening, tilting while thinking, tucked back onto the shoulders when asleep
    const s = p.sleep, head = M4.chain(body, M4.T(12.5 - s * 9, 4 + s * 3.5, s * 3), M4.Y(s * 150 * R), M4.Z((p.listen * 12 - s * 18 + (p.nod || 0)) * R), M4.X((p.tilt || 0) + s * 10 * R), M4.S(1 - s * 0.06, 1 - s * 0.06, 1 - s * 0.06));
    const jaw = M4.chain(head, M4.T(15.2, 7.6, 0), M4.Z(-(p.beak || 0) * 24 * R));
    const shut = Math.max(0, Math.min(1, Math.max(p.blink || 0, s > 0.5 ? 1 : 0)));
    const eye = side => M4.chain(head, M4.T(13.2, 11.2, side * 5.4), M4.Y(side * -18 * R), M4.S(1, 1 - shut * 0.88, 1));
    // wings: folded along the sides (tips crossing over the tail) or spread and beating
    const w = p.wings, up = Math.sin(p.flap) * p.amp, upHand = Math.sin(p.flap - 0.7) * p.amp;
    const f = 1 - w, sweep = (-97 + 89 * w) * R, twist = (142 * f) * R, lift = (w * (8 + up * 55)) * R, droop = 6 * f * R;
    const handSweep = (4 * f + w * 12) * R, handLift = w * upHand * 30 * R, handTwist = (-8 * f) * R;
    const wing = side => {
      const mirror = side < 0 ? M4.S(1, 1, -1) : M4.id();
      const shoulder = M4.chain(body, mirror, M4.T(7 - f * 1.5, 6.5 + f * 2.6, 6.5 + f * 0.6), M4.Z(-droop), M4.X(-lift), M4.Y(sweep), M4.Z(twist), M4.S(1 - 0.32 * f, 1, 1));
      return { arm: shoulder, hand: M4.chain(shoulder, M4.T(0, 0, 19.5), M4.X(-handLift), M4.Y(handSweep), M4.Z(handTwist)) };
    };
    const L = wing(-1), Rr = wing(1);
    const legs = M4.chain(root, M4.T(-(1 - p.legs) * 6, (1 - p.legs) * 18 - s * 4, 0), M4.Z((1 - p.legs) * 70 * R), M4.S(1, Math.max(0.05, p.legs * (1 - s * 0.35)), 1));
    return { body, head, jaw, eyeL: eye(-1), eyeR: eye(1), armL: L.arm, handL: L.hand, armR: Rr.arm, handR: Rr.hand, legs };
  }
  const GULL_DRAW = [["body", "body"], ["head", "head"], ["jaw", "jaw"], ["eye", "eyeL"], ["eye", "eyeR"], ["arm", "armL"], ["hand", "handL"], ["arm", "armR"], ["hand", "handR"], ["legs", "legs"]];

  /* ---------------- Looks: dark is the moonlit teal sea, light the sunlit green one ---------------- */
  const LOOKS = {
    dark: {
      L: [-0.62, 0.66, 0.42], Lg: [-0.15, 0.4, -1], LCol: [0.66, 0.88, 0.92], LInt: 1.8, sky: [0.04, 0.11, 0.12], ground: [0.01, 0.04, 0.045],
      deep: [0.002, 0.016, 0.02], shallow: [0.012, 0.075, 0.08], zen: [0.006, 0.022, 0.028], hor: [0.035, 0.11, 0.12], ring: [0.3, 0.95, 0.8], fog: [0.008, 0.03, 0.035],
      disc: 0.5, sheen: 0.8, exposure: 1.3, birdExp: 1.05, g0: [0.0, 0.03, 0.035], g1: [0.08, 0.3, 0.31], g2: [0.78, 1.0, 0.93], grade: 0.5, gap: 0.2, dot: 1.5,
      glow: [0.5, 1.12], glowCol: [0.2, 0.5, 0.5], glowAmt: 0.25, wood: [0.78, 0.9, 0.9], panel: [0.05, 0.13, 0.14], rim: [0.25, 0.6, 0.55]
    },
    light: {
      L: [-0.72, 0.6, 0.34], Lg: [-0.62, 0.38, -0.8], LCol: [1.0, 0.93, 0.78], LInt: 2.7, sky: [0.3, 0.42, 0.34], ground: [0.05, 0.18, 0.11],
      deep: [0.012, 0.075, 0.045], shallow: [0.05, 0.22, 0.14], zen: [0.25, 0.42, 0.33], hor: [0.8, 0.82, 0.62], ring: [1.0, 0.97, 0.78], fog: [0.3, 0.42, 0.3],
      disc: 1.0, sheen: 0.9, exposure: 1.0, birdExp: 1.0, g0: [0.02, 0.12, 0.07], g1: [0.18, 0.45, 0.31], g2: [0.99, 0.97, 0.82], grade: 0.5, gap: 0.42, dot: 1.3,
      glow: [0.04, 1.06], glowCol: [1.0, 0.95, 0.7], glowAmt: 0.75, wood: [0.97, 0.95, 0.9], panel: [0.75, 0.78, 0.68], rim: [1, 1, 0.92]
    }
  };
  const nrm = v => { const l = Math.hypot(...v); return v.map(x => x / l); };

  /* ---------------- Shaders ---------------- */
  const V3 = "#version 300 es\n", F3 = "#version 300 es\nprecision highp float;precision highp sampler2DShadow;\n";
  const COMMON = `
float h21(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}
float vn(vec2 p){vec2 i=floor(p),f=fract(p);vec2 u=f*f*(3.-2.*f);return mix(mix(h21(i),h21(i+vec2(1,0)),u.x),mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),u.x),u.y);}
vec3 aces(vec3 x){return clamp((x*(2.51*x+.03))/(x*(2.43*x+.59)+.14),0.,1.);}
float shadowAt(sampler2DShadow sm, mat4 vp, vec3 p){ vec4 q=vp*vec4(p,1.); q.xyz=q.xyz/q.w*.5+.5;
  if(q.x<0.||q.x>1.||q.y<0.||q.y>1.||q.z>1.) return 1.;
  float s=0.; vec2 t=vec2(1./2048.); for(int i=-1;i<=1;i++) for(int j=-1;j<=1;j++) s+=texture(sm,vec3(q.xy+vec2(i,j)*t*1.5,q.z-.0015)); return s/9.; }
`;
  // the boat: textured wood graded toward pale weathered grey, lit by the moon or sun, with shadows
  const BOAT_VS = V3 + `in vec3 aP,aN;in vec4 aT;in vec2 aU;uniform mat4 uVP,uM;uniform float uMirror;out vec3 vW,vN;out vec4 vT;out vec2 vU;
void main(){vec4 w=uM*vec4(aP,1.);vW=w.xyz;vN=mat3(uM)*aN;vT=vec4(mat3(uM)*aT.xyz,aT.w);vU=aU;w.y*=uMirror;gl_Position=uVP*w;}`;
  const BOAT_FS = F3 + COMMON + `in vec3 vW,vN;in vec4 vT;in vec2 vU;uniform sampler2D uBase,uOrm,uNorm;uniform sampler2DShadow uSh;uniform mat4 uSVP;
uniform vec3 uL,uLC,uSky,uGround,uC,uWood;uniform float uMirror,uFade;out vec4 o;
void main(){ if(uMirror<0.&&vW.y<0.) discard;
  vec3 n=normalize(vN); if(!gl_FrontFacing) n=-n; n*=uMirror; vec3 t=normalize(vT.xyz-n*dot(vT.xyz,n)); vec3 b=cross(n,t)*vT.w;
  vec3 tn=texture(uNorm,vU).xyz*2.-1.; vec3 N=normalize(t*tn.x+b*tn.y+n*tn.z);
  vec3 alb=texture(uBase,vU).rgb; float g=dot(alb,vec3(.3,.59,.11)); alb=clamp(.32+g*3.,0.,.97)*mix(vec3(1.),alb/max(g,.002),.14)*uWood;
  vec3 orm=texture(uOrm,vU).rgb; float ao=mix(1.,orm.r,.85), rough=clamp(orm.g,.35,1.);
  float wet=1.-smoothstep(-2.,14.,vW.y); alb*=1.-.45*wet;
  vec3 V=normalize(uC-vW), H=normalize(uL+V); float sh=shadowAt(uSh,uSVP,vW);
  float dif=max(dot(N,uL),0.), spec=pow(max(dot(N,H),0.),mix(80.,6.,rough))*(1.-rough)*.5;
  vec3 amb=mix(uGround,uSky,N.y*.5+.5)*ao;
  vec3 col=alb*(amb+uLC*dif*sh)+uLC*spec*sh+uSky*pow(1.-max(dot(N,V),0.),4.)*.25;
  o=vec4(col*uFade,1.);}`;
  // flat glowing cards standing in for the tabs and buttons, only drawn in the water's reflection
  const CARD_VS = V3 + `in vec3 aP;in vec2 aU,aS;in vec3 aC;uniform mat4 uVP;out vec2 vU,vS;out vec3 vC;
void main(){vU=aU;vS=aS;vC=aC;vec3 p=aP;p.y=-p.y;gl_Position=uVP*vec4(p,1.);}`;
  const CARD_FS = F3 + `in vec2 vU,vS;in vec3 vC;uniform vec3 uRim;out vec4 o;
void main(){ vec2 h=vS*.5; float rad=vS.x<70.?h.x:16.; vec2 q=abs((vU-.5)*vS)-h+rad; float d=length(max(q,0.))+min(max(q.x,q.y),0.)-rad;
  if(d>1.) discard; float rim=smoothstep(-6.,0.,d); o=vec4((vC+uRim*rim*.5)*.7,1.);}`;
  // Allie
  const GULL_VS = V3 + `in vec3 aP,aN,aC;in vec2 aA;uniform mat4 uVP,uM;uniform float uMirror;out vec3 vW,vN,vC;out vec2 vA;
void main(){vec4 w=uM*vec4(aP,1.);vW=w.xyz;vN=normalize(transpose(inverse(mat3(uM)))*aN);vC=aC;vA=aA;w.y*=uMirror;gl_Position=uVP*w;}`;
  const GULL_FS = F3 + COMMON + `in vec3 vW,vN,vC;in vec2 vA;uniform vec3 uL,uLC,uSky,uGround,uC;uniform float uExp,uMirror,uDither,uFlip;out vec4 o;
void main(){ if(uMirror<0.&&vW.y<0.) discard;
  vec3 n=normalize(vN); if(!gl_FrontFacing) n=-n; n*=uFlip; vec3 V=normalize(uC-vW), H=normalize(uL+V);
  float part=vA.x, wrap=(dot(n,uL)+.4)/1.4, dif=max(wrap,0.);
  vec3 alb=vC;
  // feather detail: primaries separate on the hand, soft barbs on the body
  if(part>3.5&&part<4.5){ float s=vA.y; alb*=.9+.1*smoothstep(.0,.08,abs(fract(s*7.)-.5)); }
  else if(part<1.5) alb*=.94+.06*vn(vW.xz*.9+vW.y*.6);
  float gloss=part>1.5&&part<3.5?60.:14.;
  vec3 lc=mix(vec3(dot(uLC,vec3(.333))),uLC,.3), amb=mix(vec3(.12,.08,.1),mix(uGround,uSky,n.y*.5+.5),.4);
  vec3 col=alb*(amb*1.6+lc*dif*.8)+uLC*pow(max(dot(n,H),0.),gloss)*(part>2.5&&part<3.5?1.2:.12);
  col+=alb*lc*pow(1.-max(dot(n,V),0.),3.)*.35; // rim light through the feathers
  col+=alb*vec3(.25,.05,.1)*max(dot(-n,uL),0.)*.4; // a touch of light through the thin wings
  col=aces(col*uExp);
  if(uDither>0.){ vec2 fc=floor(gl_FragCoord.xy/uDither); float d=fract(sin(dot(fc,vec2(12.9898,78.233)))*43758.5453);
    col=floor(col*14.+d)/14.; col*=.93+.07*step(.5,fract((fc.x+fc.y)*.5)); }
  o=vec4(uMirror<0.?pow(col,vec3(2.2)):col,1.);}`;
  // the water, composited with the boat. Every pixel finds where its ray meets the sea and shades it there.
  const QUAD_VS = V3 + `in vec2 aP;void main(){gl_Position=vec4(aP,0.,1.);}`;
  const WATER_FS = F3 + COMMON + `
uniform sampler2D uScene,uDepth,uRefl;uniform sampler2DShadow uSh;uniform mat4 uSVP;
uniform vec2 uRes,uScr,uSC,uBoat,uBoatAx,uBoatSz;uniform vec3 uC,uL,uLC,uDeep,uShallow,uZen,uHor,uRing,uFog,uSky;
uniform float uF,uT,uDisc,uSheen,uPanN,uNear,uFar;uniform vec4 uPan[16];uniform vec3 uPanCol,uLg;out vec4 o;
vec3 skyCol(vec3 R){ float e=max(R.y,0.); vec3 c=mix(uHor,uZen,pow(e,.45)); float m=max(dot(R,uLg),0.);
  return c+uLC*(pow(m,10.)*.35+pow(m,60.)*.6)*uDisc+uLC*pow(m,1800.)*40.*uDisc; }
// waves: long wind lines running across the view, plus the rings the boat sends out as it rocks
vec3 waves(vec2 p,float t,out float crest,out float ringC){
  vec2 g=vec2(0.);
  vec4 W[6]; W[0]=vec4(.06,.997,.012,.9); W[1]=vec4(-.12,.993,.019,.7); W[2]=vec4(.25,.968,.031,.55); W[3]=vec4(-.3,.954,.047,.4); W[4]=vec4(.5,.866,.08,.25); W[5]=vec4(-.62,.78,.13,.16);
  for(int i=0;i<6;i++){ vec2 d=W[i].xy; float k=W[i].z, a=W[i].w/k*.06, ph=dot(d,p)*k-t*sqrt(9.8*k*60.)*.6+float(i)*1.7; g+=d*k*a*cos(ph); }
  // fine streaky ripples, stretched sideways like wind on the surface
  vec2 q=p*vec2(.006,.045)+vec2(t*.05,-t*.3); float e=.01;
  float n0=vn(q)+.5*vn(q*2.3+3.1), nx=vn(q+vec2(e,0.))+.5*vn((q+vec2(e,0.))*2.3+3.1), nz=vn(q+vec2(0.,e))+.5*vn((q+vec2(0.,e))*2.3+3.1);
  g+=vec2((nx-n0)/e*.006,(nz-n0)/e*.045)*.25;
  // rings
  vec2 rp=(p-uBoat); float r=length(rp*vec2(1.,1.12)); vec2 rd=rp/max(r,1.);
  float warp=(vn(p*.0025+t*.02)-.5)*110.+(vn(p*.008-t*.03)-.5)*30.;
  float rr=r+warp, env=smoothstep(170.,320.,r)*exp(-r/850.);
  float ph=rr*.034-t*1.1, ph2=rr*.071-t*1.7+1.3;
  float dh=env*(cos(ph)*.034*1.4+cos(ph2)*.071*.45);
  g+=rd*dh*2.2;
  // bright, broken bands on the crests, speckled like light catching ripples
  ringC=env*(pow(.5+.5*sin(ph),8.)+.4*pow(.5+.5*sin(ph2),16.))*(.1+1.2*smoothstep(.3,.72,vn(p*vec2(.0032,.0045)+7.)))*(.45+1.1*vn(p*.05+vec2(t*.3,0.)))*1.7;
  crest=n0;
  return normalize(vec3(-g.x,1.,-g.y));
}
void main(){
  vec2 px=gl_FragCoord.xy/uRes, sp=px*uScr-uScr*.5;
  vec3 dir=vec3(sp.x,-uSC.x*uF+uSC.y*sp.y,-uSC.y*uF-uSC.x*sp.y);
  vec4 sc=texture(uScene,px); float dz=texture(uDepth,px).r;
  float zb=dz<1.?2.*uNear*uFar/(uFar+uNear-(dz*2.-1.)*(uFar-uNear)):1e9;
  if(dir.y>-1e-4){ vec3 c=skyCol(normalize(dir)); o=zb<1e8?vec4(sc.rgb,0.):vec4(c,1.); return; }
  float tw=-uC.y/dir.y, zw=tw*uF; vec3 P=uC+dir*tw;
  if(zb<zw){ o=vec4(sc.rgb,0.); return; }
  float crest,ring; vec3 N=waves(P.xz,uT,crest,ring);
  // near the hull the water is sheltered: calmer, darker, the sky blocked by the boat
  vec2 bq=P.xz-uBoat; vec2 bl=vec2(dot(bq,uBoatAx),dot(bq,vec2(-uBoatAx.y,uBoatAx.x)))/uBoatSz; float hull=exp(-pow(max(length(bl)-.75,0.),2.)*3.);
  N=normalize(mix(N,vec3(0,1,0),hull*.5));
  vec3 V=-normalize(dir); float dist=length(P-uC);
  float fres=.02+.98*pow(1.-max(dot(N,V),0.),5.);
  vec3 Rv=reflect(-V,N); Rv.y=abs(Rv.y);
  // reflection: the boat, tabs, buttons and Allie from the reflection pass, over the sky
  vec2 ruv=px+N.xz*vec2(.035,.05)*(600./max(zw,600.));
  vec4 rf=texture(uRefl,ruv); vec3 refl=mix(skyCol(Rv),rf.rgb,clamp(rf.a,0.,1.));
  float sh=shadowAt(uSh,uSVP,P);
  // glitter: the moon or sun on tiny facets, a bright path toward the light
  vec3 mN=normalize(N+vec3(vn(P.xz*.09+uT*.7)-.5,0.,vn(P.xz*.11-uT*.6+9.)-.5)*.35);
  float gl=pow(max(dot(reflect(-V,mN),uLg),0.),160.)*4.+pow(max(dot(Rv,uLg),0.),18.)*.3;
  vec3 body=mix(uDeep,uShallow,.35+.65*max(dot(N,uL),0.)*.6+crest*.15);
  body*=mix(1.,.55,1.-sh)*(1.-.5*hull);
  // the sunk part of the boat, seen through the water and fading with depth
  if(zb<1e8){ float under=(zb-zw)/uF*length(dir); body=mix(body,sc.rgb*vec3(.55,.85,.8),exp(-under/45.)*.85); }
  vec3 col=mix(body,refl,fres*(1.-.6*hull))+uLC*gl*sh*uDisc;
  col+=uRing*ring*uSheen*(.35+.65*sh)*(1.-hull);
  // soft light the tabs spill onto the water below them
  for(int i=0;i<16;i++){ if(float(i)>=uPanN) break; vec4 Pn=uPan[i]; float dx=abs(P.x-Pn.x)/Pn.z, d2=P.z-Pn.y;
    col+=uPanCol*exp(-(dx*dx*.9+d2*d2/(Pn.w*Pn.w*1.6)))*.35; }
  col=mix(col,uFog,smoothstep(2500.,14000.,dist));
  o=vec4(col,1.);
}`;
  // Turns the lit image into the printed look of the references: the picture stays sharp underneath, a fine grid of
  // dots sits over it (bigger and brighter where it's light, rows offset so bright water forms a diagonal weave),
  // and in the darker water small patches of ASCII characters drift by. The boat keeps more of its own detail.
  const ASCII_FS = F3 + COMMON + `
uniform sampler2D uImg,uAtlas;uniform vec2 uRes,uGc;uniform float uCs,uN,uExp,uGrade,uDim,uT,uGlowAmt,uGap,uDot;uniform vec3 g0,g1,g2,uGlowCol;uniform vec2 uGlow;out vec4 o;
float luma(vec3 c){return dot(c,vec3(.2126,.7152,.0722));}
vec3 tone(vec3 c,vec2 uv){ float asp=uRes.x/uRes.y; vec2 d=(uv-uGlow)*vec2(asp,1.);
  c+=uGlowCol*uGlowAmt*exp(-dot(d,d)/.3);
  c=aces(c*uExp*uDim); float l=luma(c);
  vec3 gm=l<.5?mix(g0,g1,l*2.):mix(g1,g2,(l-.5)*2.); c=mix(c,gm,uGrade);
  return c*mix(.42,1.,smoothstep(1.35,.3,length((uv-.5)*vec2(asp*.62,1.)))); }
void main(){
  vec2 fc=gl_FragCoord.xy, uv=fc/uRes;
  vec4 px=texture(uImg,uv); vec3 pix=tone(px.rgb,uv); float water=px.a;
  vec2 g=fc/uCs; float odd=mod(floor(g.y),2.); g.x+=odd*.5; vec2 cell=floor(g), inC=fract(g);
  vec2 cc=(vec2(cell.x-odd*.5,cell.y)+.5)*uCs; float l=luma(tone(texture(uImg,cc/uRes).rgb,cc/uRes));
  float r=.1+.52*sqrt(clamp(l*1.25,0.,1.)), aa=1.2/uCs;
  float dotm=1.-smoothstep(r-aa,r+aa,length(inC-.5));
  vec2 gg=fc/uGc, gcell=floor(gg), gin=fract(gg), gcc=(gcell+.5)*uGc/uRes;
  float gl=luma(tone(texture(uImg,gcc).rgb,gcc)), h=fract(sin(dot(gcell,vec2(12.9898,78.233)))*43758.5453);
  float spot=smoothstep(.6,.74,vn(gcell*vec2(.05,.12)+vec2(uT*.04,0.)))*smoothstep(.5,.12,gl)*smoothstep(.02,.06,gl)*water;
  float idx=clamp(floor(gl*2.2*uN+h*1.5),1.,uN-1.);
  float cov=texture(uAtlas,vec2((idx+gin.x)/uN,1.-gin.y)).a;
  float shape=mix(dotm,cov,spot);
  vec3 c=mix(pix*mix(uGap,.62,spot),pix*uDot+.01,shape);
  c=mix(pix,c,mix(.38,1.,water));
  o=vec4(pow(max(c,0.),vec3(1./2.2)),1.);
}`;

  /* ---------------- GL plumbing ---------------- */
  function programs(gl, defs) {
    const sh = (t, s) => { const o = gl.createShader(t); gl.shaderSource(o, s); gl.compileShader(o); if (!gl.getShaderParameter(o, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(o)); return o; };
    const out = {};
    for (const k in defs) {
      const p = gl.createProgram(); gl.attachShader(p, sh(gl.VERTEX_SHADER, defs[k][0])); gl.attachShader(p, sh(gl.FRAGMENT_SHADER, defs[k][1])); gl.linkProgram(p);
      if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(k + ": " + gl.getProgramInfoLog(p));
      const u = {}, a = {}; for (let i = 0; i < gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS); i++) { const x = gl.getActiveUniform(p, i); u[x.name.replace(/\[0\]$/, "")] = gl.getUniformLocation(p, x.name); }
      for (let i = 0; i < gl.getProgramParameter(p, gl.ACTIVE_ATTRIBUTES); i++) { const x = gl.getActiveAttrib(p, i); a[x.name] = gl.getAttribLocation(p, x.name); }
      out[k] = { p, u, a };
    }
    return out;
  }
  function vao(gl, prog, attrs, idx) {
    const v = gl.createVertexArray(); gl.bindVertexArray(v);
    for (const [name, data, size] of attrs) { const l = prog.a[name]; if (l === undefined || !data) continue; const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW); gl.enableVertexAttribArray(l); gl.vertexAttribPointer(l, size, gl.FLOAT, false, 0, 0); }
    if (idx) { const b = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, b); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idx, gl.STATIC_DRAW); }
    gl.bindVertexArray(null); return { v, n: idx ? idx.length : 0, type: idx instanceof Uint32Array ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT };
  }
  function texture(gl, w, h, internal, format, type, filter) {
    const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, internal, w, h, 0, format, type, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  }
  const GULL = buildGull();
  function gullVAOs(gl, prog) { const o = {}; for (const k in GULL) { const g = GULL[k]; o[k] = vao(gl, prog, [["aP", g.pos, 3], ["aN", g.nor, 3], ["aC", g.col, 3], ["aA", g.aux, 2]], g.idx); } return o; }
  function drawGull(gl, prog, vaos, mats, mirror) {
    gl.uniform1f(prog.u.uMirror, mirror);
    for (const [mesh, part] of GULL_DRAW) {
      const m = mats[part], det = m[0] * (m[5] * m[10] - m[9] * m[6]) - m[4] * (m[1] * m[10] - m[9] * m[2]) + m[8] * (m[1] * m[6] - m[5] * m[2]);
      gl.uniform1f(prog.u.uFlip, (det < 0 ? -1 : 1) * mirror); gl.uniformMatrix4fv(prog.u.uM, false, m); const o = vaos[mesh]; gl.bindVertexArray(o.v); gl.drawElements(gl.TRIANGLES, o.n, o.type, 0); }
    gl.bindVertexArray(null);
  }
  function lightUniforms(gl, u, look, C) {
    const L = nrm(look.L);
    gl.uniform3fv(u.uL, L); gl.uniform3fv(u.uLC, look.LCol.map(x => x * look.LInt));
    if (u.uSky) gl.uniform3fv(u.uSky, look.sky); if (u.uGround) gl.uniform3fv(u.uGround, look.ground); if (u.uC) gl.uniform3fv(u.uC, C);
  }

  /* ---------------- The world ---------------- */
  function create(seaCanvas, birdCanvas, opts = {}) {
    const gl = seaCanvas.getContext("webgl2", { antialias: false, alpha: false, depth: true, powerPreference: "high-performance" });
    const bgl = birdCanvas.getContext("webgl2", { antialias: true, alpha: true, premultipliedAlpha: false, depth: true });
    if (!gl || !bgl) return null;
    const hdr = !!gl.getExtension("EXT_color_buffer_float");
    const CF = hdr ? [gl.RGBA16F, gl.RGBA, gl.HALF_FLOAT] : [gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE];
    const P = programs(gl, { depth: [BOAT_VS, F3 + "out vec4 o;void main(){o=vec4(1.);}"], boat: [BOAT_VS, BOAT_FS], card: [CARD_VS, CARD_FS], gull: [GULL_VS, GULL_FS], water: [QUAD_VS, WATER_FS], ascii: [QUAD_VS, ASCII_FS] });
    const BP = programs(bgl, { gull: [GULL_VS, GULL_FS] });
    const quadBuf = new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]);
    const quad = { water: vao(gl, P.water, [["aP", quadBuf, 2]]), ascii: vao(gl, P.ascii, [["aP", quadBuf, 2]]) };
    const gullMain = gullVAOs(gl, P.gull), gullTop = gullVAOs(bgl, BP.gull);
    // cards for the reflection: rebuilt every frame
    const cardVAO = gl.createVertexArray(), cardBuf = gl.createBuffer(); gl.bindVertexArray(cardVAO); gl.bindBuffer(gl.ARRAY_BUFFER, cardBuf);
    for (const [n, s, off] of [["aP", 3, 0], ["aU", 2, 12], ["aS", 2, 20], ["aC", 3, 28]]) { const l = P.card.a[n]; gl.enableVertexAttribArray(l); gl.vertexAttribPointer(l, s, gl.FLOAT, false, 40, off); }
    gl.bindVertexArray(null);
    const cardData = new Float32Array(40 * 6 * 10);

    // shadow map
    const SM = 2048, shadowTex = texture(gl, SM, SM, gl.DEPTH_COMPONENT24, gl.DEPTH_COMPONENT, gl.UNSIGNED_INT, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_MODE, gl.COMPARE_REF_TO_TEXTURE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_FUNC, gl.LEQUAL);
    const shadowFB = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, shadowFB); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, shadowTex, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    let RT = null, cellPx = [5, 8], dotPx = 4, atlas = null, glyphs = " .:-=+*#%@";
    function targets(w, h) {
      if (RT) { for (const t of [RT.scene, RT.depth, RT.refl, RT.comp]) gl.deleteTexture(t); gl.deleteRenderbuffer(RT.reflDepth); for (const f of [RT.sceneFB, RT.reflFB, RT.compFB]) gl.deleteFramebuffer(f); }
      const r = { w, h, rw: Math.ceil(w / 2), rh: Math.ceil(h / 2) };
      r.scene = texture(gl, w, h, ...CF, gl.LINEAR); r.depth = texture(gl, w, h, gl.DEPTH_COMPONENT24, gl.DEPTH_COMPONENT, gl.UNSIGNED_INT, gl.NEAREST);
      r.sceneFB = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, r.sceneFB);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, r.scene, 0); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, r.depth, 0);
      r.refl = texture(gl, r.rw, r.rh, ...CF, gl.LINEAR); r.reflDepth = gl.createRenderbuffer(); gl.bindRenderbuffer(gl.RENDERBUFFER, r.reflDepth); gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, r.rw, r.rh);
      r.reflFB = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, r.reflFB);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, r.refl, 0); gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, r.reflDepth);
      r.comp = texture(gl, w, h, ...CF, gl.LINEAR); r.compFB = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, r.compFB);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, r.comp, 0);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null); RT = r;
    }
    function makeAtlas(cw, ch, font) {
      const c = document.createElement("canvas"), g = c.getContext("2d"); c.width = cw * glyphs.length; c.height = ch;
      g.fillStyle = "#fff"; g.textAlign = "center"; g.textBaseline = "middle"; g.font = `700 ${Math.max(5, Math.round(ch * 1.02))}px ${font}`;
      [...glyphs].forEach((s, i) => g.fillText(s, i * cw + cw / 2, ch / 2 + ch * 0.06));
      if (atlas) gl.deleteTexture(atlas);
      atlas = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, atlas); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, c);
      for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.NEAREST], [gl.TEXTURE_MAG_FILTER, gl.NEAREST], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, k, v);
    }

    // the boat model, loaded in the background; the sea draws without it until it's ready
    const boat = { ready: false, fade: 0, vao: null, tex: {}, tip: [-1, 0.15, 0] };
    async function loadBoat(bytes) {
      const m = parseGLB(bytes);
      boat.vao = vao(gl, P.boat, [["aP", m.pos, 3], ["aN", m.nor, 3], ["aT", m.tan, 4], ["aU", m.uv, 2]], m.idx);
      const img = async (im, srgb) => {
        const bmp = await createImageBitmap(new Blob([im.bytes], { type: im.mime }));
        const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
        gl.texImage2D(gl.TEXTURE_2D, 0, srgb ? gl.SRGB8_ALPHA8 : gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, bmp); gl.generateMipmap(gl.TEXTURE_2D);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        const an = gl.getExtension("EXT_texture_filter_anisotropic"); if (an) gl.texParameterf(gl.TEXTURE_2D, an.TEXTURE_MAX_ANISOTROPY_EXT, 8);
        if (bmp.close) bmp.close(); return t;
      };
      [boat.tex.base, boat.tex.orm, boat.tex.normal] = await Promise.all([img(m.base, true), img(m.orm, false), img(m.normal, false)]);
      boat.tip = bowTip(m.pos); boat.credit = m.credit; boat.ready = true;
    }

    let W = 0, H = 0, dpr = 1;
    // cell: { dot: dot grid spacing, glyph: [w, h] of an ASCII character }, in screen pixels
    function resize(w, h, d, cell, font) {
      W = w; H = h; dpr = d;
      seaCanvas.width = birdCanvas.width = Math.round(w * d); seaCanvas.height = birdCanvas.height = Math.round(h * d);
      targets(seaCanvas.width, seaCanvas.height);
      dotPx = Math.max(3, Math.round(cell.dot * d)); cellPx = [Math.max(4, Math.round(cell.glyph[0] * d)), Math.max(6, Math.round(cell.glyph[1] * d))];
      makeAtlas(cellPx[0], cellPx[1], font);
    }

    function drawBoat(prog, VP, F, mirror) {
      if (!boat.ready) return;
      const u = prog.u; gl.useProgram(prog.p);
      gl.uniformMatrix4fv(u.uVP, false, VP); gl.uniformMatrix4fv(u.uM, false, F.boatM); gl.uniform1f(u.uMirror, mirror);
      if (u.uBase) {
        lightUniforms(gl, u, F.look, F.C); gl.uniform3fv(u.uWood, F.look.wood); gl.uniform1f(u.uFade, boat.fade);
        gl.uniformMatrix4fv(u.uSVP, false, F.shadowVP);
        [[u.uBase, boat.tex.base], [u.uOrm, boat.tex.orm], [u.uNorm, boat.tex.normal], [u.uSh, shadowTex]].forEach(([loc, t], i) => { gl.activeTexture(gl.TEXTURE0 + i); gl.bindTexture(gl.TEXTURE_2D, t); gl.uniform1i(loc, i); });
      }
      gl.bindVertexArray(boat.vao.v); gl.drawElements(gl.TRIANGLES, boat.vao.n, boat.vao.type, 0); gl.bindVertexArray(null);
    }
    function gullUniforms(g, prog, VP, F, dither) {
      const u = prog.u; g.useProgram(prog.p); g.uniformMatrix4fv(u.uVP, false, VP); lightUniforms(g, u, F.look, F.C);
      g.uniform1f(u.uExp, F.look.birdExp * F.dim); g.uniform1f(u.uDither, dither);
    }

    // F: { T, b (camera basis), FOC, W, H, theme, dim, boat: { R, pos, scale }, panels: [{x,z,w,h}], floats: [{x,y,z,r,c}], gull: pose|null }
    function render(F) {
      const look = F.look = LOOKS[F.theme] || LOOKS.dark, C = F.C = [F.b.cx, F.b.cy, F.b.cz];
      const VP = cameraMats(F.b, F.FOC, W, H);
      F.boatM = M4.fromRS(F.boat.R, F.boat.pos, F.boat.scale);
      if (boat.ready) boat.fade = Math.min(1, boat.fade + 0.06);
      // the moon or sun's view of the boat, for shadows on it and on the water
      const L = nrm(look.L), bc = F.boat.pos, ext = F.boat.scale * 1.6;
      F.shadowVP = M4.mul(M4.ortho(-ext, ext, -ext, ext, 10, 4000), M4.lookAt([bc[0] + L[0] * 1500, bc[1] + L[1] * 1500, bc[2] + L[2] * 1500], bc, [0, 1, 0]));
      const mats = F.gull && gullPose(F.gull);
      gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL); gl.disable(gl.BLEND); gl.disable(gl.CULL_FACE);

      // 1. shadows
      gl.bindFramebuffer(gl.FRAMEBUFFER, shadowFB); gl.viewport(0, 0, SM, SM); gl.clear(gl.DEPTH_BUFFER_BIT);
      gl.colorMask(false, false, false, false); drawBoat(P.depth, F.shadowVP, F, 1); gl.colorMask(true, true, true, true);
      // 2. reflection: everything above the water, mirrored underneath it
      gl.bindFramebuffer(gl.FRAMEBUFFER, RT.reflFB); gl.viewport(0, 0, RT.rw, RT.rh); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      drawBoat(P.boat, VP, F, -1);
      let n = 0; const up = [0, F.b.cp, -F.b.sp];
      const card = (x, y, z, w, h, col) => {
        const q = [[-0.5, 0], [0.5, 0], [0.5, 1], [-0.5, 0], [0.5, 1], [-0.5, 1]];
        for (const [a, b2] of q) { const o = n * 10; cardData.set([x + a * w, y + up[1] * h * b2, z + up[2] * h * b2, a + 0.5, b2, w, h, ...col], o); n++; }
      };
      for (const p of F.panels) card(p.x, p.y, p.z, p.w, p.h, look.panel.map(c => c * 1.6));
      for (const f of F.floats) if (n < 230) card(f.x, f.y, f.z, f.r * 2, f.r * 2, f.c);
      if (n) {
        gl.useProgram(P.card.p); gl.uniformMatrix4fv(P.card.u.uVP, false, VP); gl.uniform3fv(P.card.u.uRim, look.rim);
        gl.bindBuffer(gl.ARRAY_BUFFER, cardBuf); gl.bufferData(gl.ARRAY_BUFFER, cardData.subarray(0, n * 10), gl.DYNAMIC_DRAW);
        gl.bindVertexArray(cardVAO); gl.drawArrays(gl.TRIANGLES, 0, n); gl.bindVertexArray(null);
      }
      if (mats) { gullUniforms(gl, P.gull, VP, F, 0); drawGull(gl, P.gull, gullMain, mats, -1); }
      // 3. the boat
      gl.bindFramebuffer(gl.FRAMEBUFFER, RT.sceneFB); gl.viewport(0, 0, RT.w, RT.h); gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      drawBoat(P.boat, VP, F, 1);
      // 4. the water around and through it
      gl.disable(gl.DEPTH_TEST);
      gl.bindFramebuffer(gl.FRAMEBUFFER, RT.compFB); gl.viewport(0, 0, RT.w, RT.h);
      let u = P.water.u; gl.useProgram(P.water.p);
      [[u.uScene, RT.scene], [u.uDepth, RT.depth], [u.uRefl, RT.refl], [u.uSh, shadowTex]].forEach(([loc, t], i) => { gl.activeTexture(gl.TEXTURE0 + i); gl.bindTexture(gl.TEXTURE_2D, t); gl.uniform1i(loc, i); });
      gl.uniformMatrix4fv(u.uSVP, false, F.shadowVP);
      gl.uniform2f(u.uRes, RT.w, RT.h); gl.uniform2f(u.uScr, W, H); gl.uniform2f(u.uSC, F.b.sp, F.b.cp); gl.uniform1f(u.uF, F.FOC);
      gl.uniform3fv(u.uC, C); gl.uniform1f(u.uT, F.T); gl.uniform1f(u.uNear, NEAR); gl.uniform1f(u.uFar, FAR);
      gl.uniform3fv(u.uL, L); gl.uniform3fv(u.uLg, nrm(look.Lg)); gl.uniform3fv(u.uLC, look.LCol.map(x => x * look.LInt));
      for (const k of ["deep", "shallow", "ring", "fog", "sky"]) gl.uniform3fv(u["u" + k[0].toUpperCase() + k.slice(1)], look[k]);
      gl.uniform3fv(u.uZen, look.zen); gl.uniform3fv(u.uHor, look.hor); gl.uniform1f(u.uDisc, look.disc); gl.uniform1f(u.uSheen, look.sheen);
      const yaw = Math.atan2(-F.boat.R[2][0], F.boat.R[0][0]);
      gl.uniform2f(u.uBoat, bc[0], bc[2]); gl.uniform2f(u.uBoatAx, Math.cos(yaw), -Math.sin(yaw)); gl.uniform2f(u.uBoatSz, F.boat.scale * 1.05, F.boat.scale * 0.36);
      const pans = new Float32Array(64); let pn = 0;
      for (const p of F.panels) if (pn < 16) { pans.set([p.x, p.z, p.w / 2, 160], pn * 4); pn++; }
      gl.uniform4fv(u.uPan, pans); gl.uniform1f(u.uPanN, pn); gl.uniform3fv(u.uPanCol, look.rim.map(x => x * (F.theme === "light" ? 0.25 : 0.12)));
      gl.bindVertexArray(quad.water.v); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      // 5. ASCII
      gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, seaCanvas.width, seaCanvas.height);
      u = P.ascii.u; gl.useProgram(P.ascii.p);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, RT.comp); gl.uniform1i(u.uImg, 0);
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, atlas); gl.uniform1i(u.uAtlas, 1);
      gl.uniform2f(u.uRes, seaCanvas.width, seaCanvas.height); gl.uniform1f(u.uCs, dotPx); gl.uniform2fv(u.uGc, cellPx); gl.uniform1f(u.uN, glyphs.length);
      gl.uniform1f(u.uGap, look.gap); gl.uniform1f(u.uDot, look.dot);
      gl.uniform1f(u.uExp, look.exposure); gl.uniform1f(u.uGrade, look.grade); gl.uniform1f(u.uDim, F.dim); gl.uniform1f(u.uT, F.T);
      for (const k of ["g0", "g1", "g2"]) gl.uniform3fv(u[k], look[k].map(x => Math.pow(x, 2.2)));
      gl.uniform2fv(u.uGlow, look.glow); gl.uniform3fv(u.uGlowCol, look.glowCol); gl.uniform1f(u.uGlowAmt, look.glowAmt);
      gl.bindVertexArray(quad.ascii.v); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4); gl.bindVertexArray(null);

      // Allie, on her own layer above the tabs
      bgl.viewport(0, 0, birdCanvas.width, birdCanvas.height); bgl.clearColor(0, 0, 0, 0); bgl.clear(bgl.COLOR_BUFFER_BIT | bgl.DEPTH_BUFFER_BIT);
      if (mats) {
        bgl.enable(bgl.DEPTH_TEST); bgl.disable(bgl.CULL_FACE);
        gullUniforms(bgl, BP.gull, VP, F, Math.max(1, Math.round(dpr * 1.5))); drawGull(bgl, BP.gull, gullTop, mats, 1);
      }
    }
    return {
      resize, render, loadBoat, gl, hdr,
      get boatReady() { return boat.ready; }, get bowTip() { return boat.tip; }, get credit() { return boat.credit; }
    };
  }

  window.AllieSea = { create, parseGLB, bowTip, buildGull, gullPose, M4 };
})();
