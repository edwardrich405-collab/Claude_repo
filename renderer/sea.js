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
  // The app's camera as view and projection matrices. b: its position (cx, cy, cz) and its right, up and back
  // directions (R, U, B) in world space.
  function cameraMats(b, FOC, W, H) {
    const { R, U, B } = b, C = [b.cx, b.cy, b.cz], d = v => -(v[0] * C[0] + v[1] * C[1] + v[2] * C[2]);
    const V = new Float32Array([R[0], U[0], B[0], 0, R[1], U[1], B[1], 0, R[2], U[2], B[2], 0, d(R), d(U), d(B), 1]);
    const pa = -(FAR + NEAR) / (FAR - NEAR), pb = -2 * FAR * NEAR / (FAR - NEAR);
    const P = new Float32Array([2 * FOC / W, 0, 0, 0, 0, 2 * FOC / H, 0, 0, 0, 0, pa, -1, 0, 0, pb, 0]);
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
        return { pos: new Float32Array(P), nor: N, col: new Float32Array(C), aux: new Float32Array(A), idx: P.length / 3 > 65535 ? new Uint32Array(I) : new Uint16Array(I) };
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
  /* ---------------- Props: the lighthouse island, the workbench, the bottle, the post on the beach ---------------- */
  // Simple meshes with vertex colours, lit like the boat. Each is built around its own origin, y up, in world units.
  // aux.x marks material: 0 matte, 1 glowing (the lighthouse lamp), 2 glass, 3 paper; aux.y is spare.
  const COL = {
    sand: [0.86, 0.8, 0.64], wetSand: [0.55, 0.5, 0.4], rock: [0.42, 0.44, 0.43], rockLight: [0.6, 0.6, 0.57], rockDark: [0.2, 0.22, 0.22], lichen: [0.62, 0.6, 0.4], grass: [0.34, 0.48, 0.34],
    white: [0.93, 0.93, 0.89], band: [0.6, 0.17, 0.15], iron: [0.16, 0.18, 0.19], lamp: [1.0, 0.9, 0.62], roof: [0.2, 0.22, 0.23], stone: [0.55, 0.54, 0.5], window: [0.1, 0.12, 0.13], door: [0.3, 0.2, 0.14],
    glass: [0.42, 0.66, 0.56], cork: [0.62, 0.48, 0.32], paper: [0.95, 0.9, 0.76], wood: [0.5, 0.44, 0.36], woodDark: [0.32, 0.28, 0.24],
    bench: [0.56, 0.42, 0.28], benchTop: [0.66, 0.52, 0.36], benchDark: [0.36, 0.26, 0.18], steel: [0.5, 0.52, 0.54], jar: [0.5, 0.62, 0.6]
  };
  // Turn a profile [[radius, y], ...] around the y axis.
  function lathe(mb, prof, seg, colour, aux) {
    const base = mb.P.length / 3;
    prof.forEach(([r, y], i) => { for (let j = 0; j <= seg; j++) { const a = j / seg * Math.PI * 2; mb.v([Math.cos(a) * r, y, Math.sin(a) * r], colour(y, a, i), aux); } });
    for (let i = 0; i < prof.length - 1; i++) for (let j = 0; j < seg; j++) {
      const a = base + i * (seg + 1) + j, b = a + 1, c = a + seg + 1, d = c + 1; mb.tri(a, b, c); mb.tri(b, d, c);
    }
  }
  // move the vertices added since `from` by (x, y, z)
  const shift = (mb, from, x, y, z) => { for (let v = from; v < mb.P.length / 3; v++) { mb.P[v * 3] += x; mb.P[v * 3 + 1] += y; mb.P[v * 3 + 2] += z; } };
  const hash = (x, y) => { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s); };
  const vnoise = (x, y) => { const i = Math.floor(x), j = Math.floor(y), f = x - i, g = y - j, u = f * f * (3 - 2 * f), v = g * g * (3 - 2 * g);
    return (hash(i, j) * (1 - u) + hash(i + 1, j) * u) * (1 - v) + (hash(i, j + 1) * (1 - u) + hash(i + 1, j + 1) * u) * v; };
  const fbm = (x, y, o = 4) => { let a = 0, s = 0.5, f = 1; for (let i = 0; i < o; i++) { a += (vnoise(x * f, y * f) - 0.5) * s; f *= 2.03; s *= 0.5; } return a; };
  // A lumpy rock: a sphere pushed in and out by noise, flat underneath, darker in its cracks, lichen on top.
  function rock(mb, c, r, seed, seg = 12) {
    const base = mb.P.length / 3, cols = seg * 2;
    for (let i = 0; i <= seg; i++) for (let j = 0; j <= cols; j++) {
      const th = i / seg * Math.PI, ph = j / cols * Math.PI * 2, x = Math.sin(th) * Math.cos(ph), y = Math.cos(th), z = Math.sin(th) * Math.sin(ph);
      const n = fbm(x * 1.6 + seed, y * 1.6 + z * 1.3 + seed * 0.7, 4), crack = fbm(x * 5 + seed * 3, z * 5 + y * 4, 2);
      const d = 1 + n * 0.55 + crack * 0.16, yy = Math.max(-0.35, y);
      const col = mix3(mix3(COL.rock, COL.rockLight, sm(0.1, 0.9, yy) * 0.6 + n), COL.rockDark, sm(0.0, -0.12, crack) * 0.8);
      mb.v([c[0] + r[0] * x * d, c[1] + r[1] * yy * d, c[2] + r[2] * z * d], y > 0.45 && vnoise(x * 6 + seed, z * 6) > 0.62 ? mix3(col, COL.lichen, 0.55) : col, [0, 0]);
    }
    for (let i = 0; i < seg; i++) for (let j = 0; j < cols; j++) {
      const a = base + i * (cols + 1) + j, b = a + 1, c2 = a + cols + 1, d = c2 + 1; mb.tri(a, c2, b); mb.tri(b, c2, d);
    }
  }
  // A box from (x0, y0, z0) to (x1, y1, z1).
  function box(mb, p0, p1, colour, aux = [0, 0]) {
    const [x0, y0, z0] = p0, [x1, y1, z1] = p1, v = [[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0], [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]];
    for (const f of [[0, 3, 2, 1], [4, 5, 6, 7], [0, 4, 7, 3], [1, 2, 6, 5], [3, 7, 6, 2], [0, 1, 5, 4]]) {
      // each face gets its own vertices so it shades flat, like cut wood
      const ids = f.map(k => mb.v(v[k], typeof colour === "function" ? colour(v[k]) : colour, aux)); mb.tri(ids[0], ids[1], ids[2]); mb.tri(ids[0], ids[2], ids[3]);
    }
  }
  // Where the workbench stands on the island (island-local x, z): a flat terrace cut into the slope.
  const TERRACE = { x: 120, z: 165, h: 92, r: 95 };
  function islandHeight(x, z) {
    const R = 470, r = Math.hypot(x, z), a = Math.atan2(z, x), t = r / R;
    const n = fbm(Math.cos(a) * 2.2 + 9, Math.sin(a) * 2.2 + r * 0.008, 5), crag = fbm(x * 0.02, z * 0.02, 4), ridge = Math.abs(fbm(x * 0.012 + 3, z * 0.012, 3));
    let h = (t < 0.62 ? 150 * Math.pow(1 - t / 0.62, 0.65) + 14 : 14 - (t - 0.62) / 0.38 * 44) + n * 60 * (1 - t) + crag * 40 * (t < 0.62 ? 1 : 0.25) - ridge * 30 * (t < 0.5 ? 1 : 0);
    // the terrace for the workbench
    const dt = Math.hypot(x - TERRACE.x, z - TERRACE.z); h += (TERRACE.h - h) * sm(TERRACE.r, TERRACE.r * 0.6, dt);
    return h;
  }
  function buildIsland() {
    const mb = meshBuilder(), R = 470, NR = 56, NA = 140;
    const rows = [];
    for (let i = 0; i <= NR; i++) {
      const r = i / NR * R, row = [];
      for (let j = 0; j < NA; j++) {
        const a = j / NA * Math.PI * 2, wob = 1 + fbm(Math.cos(a) * 1.4 + 4, Math.sin(a) * 1.4, 3) * 0.5, rr = r * wob, x = Math.cos(a) * rr, z = Math.sin(a) * rr, h = islandHeight(x, z), t = rr / R;
        const slope = Math.abs(islandHeight(x + 6, z) - h) + Math.abs(islandHeight(x, z + 6) - h), terr = sm(TERRACE.r, TERRACE.r * 0.6, Math.hypot(x - TERRACE.x, z - TERRACE.z));
        let c = mix3(COL.rock, COL.rockDark, sm(2, 9, slope) * 0.7 + fbm(x * 0.05, z * 0.05, 2));
        c = mix3(c, COL.rockLight, sm(0.1, 0.3, fbm(x * 0.03 + 7, z * 0.03, 3)) * 0.5);
        if (t > 0.6) c = mix3(c, h < 2 ? COL.wetSand : COL.sand, sm(0.6, 0.7, t));
        else if (slope < 3.5 && h > 40 && fbm(x * 0.04, z * 0.04, 3) > -0.02) c = mix3(c, COL.grass, 0.75);
        if (terr > 0.5) c = mix3(c, COL.grass, 0.55);
        row.push(mb.v([x, h, z], c, [0, 0]));
      }
      rows.push(row);
    }
    for (let i = 0; i < NR; i++) for (let j = 0; j < NA; j++) {
      const a = rows[i][j], b = rows[i][(j + 1) % NA], c = rows[i + 1][j], d = rows[i + 1][(j + 1) % NA]; mb.tri(a, c, b); mb.tri(b, c, d);
    }
    // boulders round the shore and on the slopes, pebbles at the waterline
    for (let k = 0; k < 16; k++) {
      const a = k * 2.39 + 0.4, r = R * (0.5 + hash(k, 3) * 0.24), s = 18 + hash(k, 7) * 34, x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (Math.hypot(x - TERRACE.x, z - TERRACE.z) < TERRACE.r + s) continue;
      rock(mb, [x, islandHeight(x, z) - s * 0.15, z], [s * (1 + hash(k, 1) * 0.5), s * (0.55 + hash(k, 2) * 0.3), s], k * 1.7, 11);
    }
    for (let k = 0; k < 26; k++) {
      const a = k * 1.13 + hash(k, 9), r = R * (0.68 + hash(k, 5) * 0.12), s = 5 + hash(k, 4) * 9, x = Math.cos(a) * r, z = Math.sin(a) * r;
      rock(mb, [x, Math.max(-4, islandHeight(x, z)) - s * 0.2, z], [s * 1.2, s * 0.6, s], 40 + k, 7);
    }
    return { mesh: mb.done(), top: islandHeight(0, 0) };
  }
  // The lighthouse: a stone plinth, a tapering white tower with two red bands, a door and little windows, a corbelled
  // iron gallery with a double railing, a glowing lamp room between iron bars, and a dome with a vent and finial.
  function buildLighthouse() {
    const mb = meshBuilder(), seg = 48, H = 430;
    const rAt = y => 78 - 22 * Math.pow(Math.max(0, y) / H, 0.9);
    const towerCol = y => (y > 120 && y < 175) || (y > 285 && y < 340) ? COL.band : COL.white;
    // stone plinth
    lathe(mb, [[0, -14], [104, -14], [104, 6], [98, 10], [98, 22], [90, 26], [0, 26]], seg, (y, a) => mix3(COL.stone, COL.rockDark, 0.12 + (vnoise(a * 10, y * 0.3) - 0.5) * 0.35), [0, 0]);
    // tower, with faint horizontal courses of masonry
    const prof = []; for (let i = 0; i <= 60; i++) { const y = 20 + i / 60 * (H - 20); prof.push([rAt(y), y]); }
    lathe(mb, prof, seg, (y, a) => mix3(towerCol(y), [0.7, 0.7, 0.67], (vnoise(a * 5, y * 0.06) - 0.5) * 0.28 + (Math.abs(((y - 20) % 22) - 11) < 0.8 ? 0.14 : 0.03)), [0, 0]);
    for (const y of [120, 175, 285, 340]) lathe(mb, [[rAt(y) + 0.6, y - 1.5], [rAt(y) + 0.6, y + 1.5]], seg, () => COL.band, [0, 0]);
    // door, facing the island's front (+z), with a step and a frame
    const dr = rAt(40);
    box(mb, [-16, 20, dr - 4], [16, 70, dr + 3], COL.door); box(mb, [-20, 18, dr - 2], [20, 74, dr + 1.5], COL.stone); box(mb, [-22, 4, dr - 6], [22, 20, dr + 16], COL.stone);
    // small windows up the tower, turning as they climb
    for (let i = 0; i < 5; i++) {
      const y = 95 + i * 70, a = Math.PI / 2 + (i % 2 ? 0.9 : -0.6) + i * 0.4, r = rAt(y), cx = Math.cos(a) * r, cz = Math.sin(a) * r, from = mb.P.length / 3;
      box(mb, [-6, -11, -4], [6, 11, 4], COL.window); box(mb, [-8, -13, -2.5], [8, -10, 5], COL.stone);
      // turn the window to face out from the tower
      const ang = Math.atan2(cx, cz);
      for (let v = from; v < mb.P.length / 3; v++) { const x = mb.P[v * 3], z = mb.P[v * 3 + 2]; mb.P[v * 3] = x * Math.cos(ang) + z * Math.sin(ang) + cx; mb.P[v * 3 + 1] += y; mb.P[v * 3 + 2] = -x * Math.sin(ang) + z * Math.cos(ang) + cz; }
    }
    // corbels under the gallery
    for (let j = 0; j < 24; j++) { const a = j / 24 * Math.PI * 2, from = mb.P.length / 3; box(mb, [-3, -18, 0], [3, 0, 26], COL.white);
      for (let v = from; v < mb.P.length / 3; v++) { const x = mb.P[v * 3], z = mb.P[v * 3 + 2] + rAt(H) - 6; mb.P[v * 3] = x * Math.cos(a) + z * Math.sin(a); mb.P[v * 3 + 1] += H; mb.P[v * 3 + 2] = -x * Math.sin(a) + z * Math.cos(a); } }
    // gallery deck and double railing
    lathe(mb, [[0, H], [76, H], [82, H + 3], [82, H + 9], [0, H + 9]], seg, () => COL.iron, [0, 0]);
    for (let j = 0; j < 32; j++) { const a = j / 32 * Math.PI * 2, from = mb.P.length / 3; lathe(mb, [[1.4, 0], [1.4, 32]], 6, () => COL.iron, [0, 0]); shift(mb, from, Math.cos(a) * 78, H + 9, Math.sin(a) * 78); }
    for (const y of [H + 24, H + 41]) lathe(mb, [[76, y], [80, y], [80, y + 2.5], [76, y + 2.5]], seg, () => COL.iron, [0, 0]);
    // lamp room: glowing glass between iron bars, a sill below, then the dome, a vent ball and a finial
    lathe(mb, [[52, H + 9], [52, H + 16], [48, H + 16]], seg, () => COL.iron, [0, 0]);
    lathe(mb, [[48, H + 16], [48, H + 70]], seg, () => COL.lamp, [1, 0]);
    for (let j = 0; j < 12; j++) { const a = j / 12 * Math.PI * 2, from = mb.P.length / 3; lathe(mb, [[2, 0], [2, 56]], 6, () => COL.iron, [0, 0]); shift(mb, from, Math.cos(a) * 49, H + 15, Math.sin(a) * 49); }
    lathe(mb, [[49.5, H + 42], [49.5, H + 44]], seg, () => COL.iron, [0, 0]);
    lathe(mb, [[58, H + 70], [58, H + 76], [46, H + 92], [28, H + 106], [10, H + 113], [7, H + 116], [9, H + 122], [7, H + 128], [2, H + 130], [1.2, H + 150], [0, H + 152]], seg, () => COL.roof, [0, 0]);
    return { mesh: mb.done(), lamp: H + 40, height: H + 152 };
  }
  // The workbench by the lighthouse: a thick wooden top on four legs with a lower shelf, a vise at one end, a mallet,
  // a jar of brushes and a couple of offcuts. Its top surface is at y = 72, centred on the origin, 150 wide and 80 deep.
  const BENCH = { w: 150, d: 80, top: 72 };
  function buildBench() {
    const mb = meshBuilder(), w = BENCH.w / 2, d = BENCH.d / 2, t = BENCH.top;
    const grain = p => mix3(COL.benchTop, COL.bench, 0.3 + (vnoise(p[0] * 0.08, p[2] * 0.6) - 0.5) * 0.6);
    box(mb, [-w, t - 8, -d], [w, t, d], grain);
    for (const [x, z] of [[-w + 6, -d + 6], [w - 6, -d + 6], [-w + 6, d - 6], [w - 6, d - 6]]) box(mb, [x - 4, 0, z - 4], [x + 4, t - 8, z + 4], COL.bench);
    box(mb, [-w + 4, 16, -d + 4], [w - 4, 21, d - 4], COL.benchDark);
    box(mb, [-w + 6, t - 16, -d + 3], [w - 6, t - 9, -d + 7], COL.benchDark); box(mb, [-w + 6, t - 16, d - 7], [w - 6, t - 9, d - 3], COL.benchDark);
    // vise
    box(mb, [w - 22, t - 14, d - 2], [w - 2, t + 6, d + 6], COL.steel); box(mb, [w - 15, t - 6, d + 6], [w - 9, t, d + 16], COL.steel);
    // mallet
    box(mb, [-w + 18, t, -d + 14], [-w + 30, t + 12, -d + 30], COL.benchDark); box(mb, [-w + 22, t + 3, -d + 30], [-w + 26, t + 7, -d + 58], COL.bench);
    // jar of brushes
    const jf = mb.P.length / 3; lathe(mb, [[0, 0], [7, 0], [7.5, 2], [7.5, 18], [6.5, 20], [0, 20]], 14, () => COL.jar, [2, 0]); shift(mb, jf, w - 28, t, -d + 18);
    for (let k = 0; k < 3; k++) box(mb, [w - 31 + k * 3, t + 14, -d + 16 + k * 1.5], [w - 29.5 + k * 3, t + 32 + k * 3, -d + 17.5 + k * 1.5], k === 1 ? COL.band : COL.bench);
    // offcuts
    box(mb, [-12, t, -d + 10], [30, t + 4, -d + 22], COL.benchTop); box(mb, [8, t + 4, -d + 12], [24, t + 8, -d + 20], COL.bench);
    return { mesh: mb.done() };
  }
  // Home: a little sandy islet with the post on it, a dome of sand ringed by wet sand, boulders round one side and a few
  // rocks breaking the water nearby. ISLET.r is its radius; isletHeight(x, z) is the sand's height (island-local).
  const ISLET = { r: 125 };
  function isletHeight(x, z) {
    const r = Math.hypot(x, z), a = Math.atan2(z, x), R = ISLET.r * (1 + 0.09 * Math.sin(a * 3 + 1) + 0.05 * Math.sin(a * 7 + 2));
    const t = r / R; return t >= 1.25 ? -12 : 20 * Math.pow(Math.max(0, 1 - t * t), 1.15) + fbm(x * 0.02, z * 0.02, 3) * 6 * Math.max(0, 1 - t) - 12 * sm(0.9, 1.25, t);
  }
  function buildIslet() {
    const mb = meshBuilder(), NR = 34, NA = 110, rows = [];
    for (let i = 0; i <= NR; i++) {
      const row = [];
      for (let j = 0; j < NA; j++) {
        const a = j / NA * Math.PI * 2, r = i / NR * ISLET.r * 1.3, x = Math.cos(a) * r, z = Math.sin(a) * r, h = isletHeight(x, z);
        const c = mix3(mix3(COL.sand, COL.rock, 0.7), COL.wetSand, sm(10, 0, h)), n = fbm(x * 0.05, z * 0.05, 2);
        row.push(mb.v([x, h, z], mix3(c, COL.rockDark, Math.max(0, n) * 0.5 + 0.3), [0, 0]));
      }
      rows.push(row);
    }
    for (let i = 0; i < NR; i++) for (let j = 0; j < NA; j++) {
      const a = rows[i][j], b = rows[i][(j + 1) % NA], c = rows[i + 1][j], d = rows[i + 1][(j + 1) % NA]; mb.tri(a, c, b); mb.tri(b, c, d);
    }
    // boulders round the back and left, a cluster at the post's foot, rocks out in the water
    for (let k = 0; k < 18; k++) {
      const a = k * 0.36 + hash(k, 1) * 0.3, r = ISLET.r * (0.55 + hash(k, 2) * 0.55), s = 14 + hash(k, 3) * 26, x = Math.cos(a) * r, z = Math.sin(a) * r;
      rock(mb, [x, isletHeight(x, z) - s * 0.2, z], [s * (1 + hash(k, 4) * 0.5), s * (0.6 + hash(k, 5) * 0.4), s], 70 + k * 2.3, 10);
    }
    for (const [x, z, s, k] of [[-48, 4, 13, 1], [-22, 30, 9, 2], [-60, -20, 10, 3], [-34, -28, 7, 4], [-14, 6, 6, 5]]) rock(mb, [x, isletHeight(x, z) - 2, z], [s * 1.2, s * 0.7, s], 90 + k, 10);
    for (const [x, z, s, k] of [[190, -50, 15, 1], [215, -15, 9, 2], [-200, 90, 12, 3], [140, 170, 8, 4]]) rock(mb, [x, -8, z], [s * 1.3, s * 0.8, s], 110 + k, 9);
    return { mesh: mb.done() };
  }
  // A green glass bottle with a cork and a rolled letter inside, lying in the water.
  function buildBottle() {
    const mb = meshBuilder(), seg = 24;
    // along +y, then laid on its side by its transform
    lathe(mb, [[0, 0], [16, 1.5], [19, 6], [19, 62], [17, 72], [8, 84], [6, 92], [6.6, 100], [6.6, 104]], seg, (y, a) => {
      // where the rolled paper shows through the glass
      const paper = y > 12 && y < 58 && Math.abs(Math.sin(a)) < 0.82 ? 1 : 0;
      return paper ? mix3(COL.glass, COL.paper, 0.62) : COL.glass;
    }, [2, 0]);
    lathe(mb, [[0, 100], [5.4, 100], [5.4, 116], [4.6, 120], [0, 120]], 12, () => COL.cork, [0, 0]);
    return { mesh: mb.done(), length: 120, radius: 19 };
  }
  // A weathered wooden post on the sand for Allie to sit on, with a few rocks around it.
  function buildPost() {
    const mb = meshBuilder();
    lathe(mb, [[7, -20], [7, 58], [6.4, 66], [5, 69], [0, 70]], 12, (y, a) => mix3(COL.wood, COL.woodDark, vnoise(a * 3, y * 0.08) * 0.8 + (Math.abs(Math.sin(a * 7)) > 0.92 ? 0.25 : 0)), [0, 0]);
    for (const [x, z, s, k] of [[20, 12, 12, 1], [-16, 18, 8, 2], [26, -14, 7, 3], [-22, -10, 10, 4], [4, 26, 5, 5]]) rock(mb, [x, s * 0.15, z], [s * 1.1, s * 0.6, s * 0.85], k * 3.1, 9);
    return { mesh: mb.done(), top: 70 };
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

  /* ---------------- Looks: dark is the moonlit night sea, light the warm sunlit one ---------------- */
  // L: the moon/sun, behind the boat and to the left, so it rims the boat's edges. Lf: a soft fill from your side.
  // Lg: where the glitter path on the water points. The sea's colours (cDeep … cHi) are the first version's palette.
  const LOOKS = {
    dark: {
      L: [-0.72, 0.62, 0.3], LCol: [0.6, 0.88, 0.95], LInt: 0.55, Lf: [0.4, 0.35, 1], fill: [0.07, 0.15, 0.17], rimCol: [0.45, 0.95, 0.95], rimInt: 2.4, alb: 0.5,
      sky: [0.02, 0.05, 0.06], ground: [0.004, 0.02, 0.025], Lg: [0.0, 0.215, -1], glit: 1.1, refl: 0.8, base: -0.11, exposure: 1.1, birdExp: 0.95, Lbird: [-0.35, 0.55, 0.75],
      cDeep: [0.0015, 0.006, 0.008], cBg: [0.004, 0.02, 0.024], cLo: [0.012, 0.1, 0.115], cHi: [0.55, 1.0, 0.95],
      kDeep: [0.0008, 0.003, 0.005], kBg: [0.002, 0.01, 0.013], kLo: [0.025, 0.12, 0.14], kHi: [0.7, 1.0, 0.97],
      discCol: [0.75, 0.98, 0.95], discBg: 0.3, foamCol: [0.7, 1.0, 0.96], foamBg: 0.08, boost: 0.7,
      skyTop: 0.0, skyHor: 0.03, stars: 0.6, disc: 0.8, wave: 0.6, cloud: 0.85, beam: 0.55, lamp: 3.2, boatTint: [0.82, 1.0, 1.0], boatAscii: 0.8,
      bloom: 0.32, bloomThr: 0.5, glow: [0.5, 1.15], glowCol: [0.3, 0.8, 0.8], glowAmt: 0.0, wood: [1.1, 1.35, 1.4], panel: [0.03, 0.08, 0.09], rim: [0.2, 0.5, 0.5]
    },
    light: {
      L: [-0.74, 0.6, 0.28], LCol: [1.0, 0.88, 0.68], LInt: 2.6, Lf: [0.5, 0.3, 1], fill: [0.34, 0.4, 0.34], rimCol: [1.0, 0.92, 0.72], rimInt: 2.0, alb: 1.0,
      sky: [0.34, 0.44, 0.38], ground: [0.08, 0.2, 0.13], Lg: [-0.42, 0.2, -1], glit: 0.55, refl: 1.0, base: 0.12, exposure: 1.05, birdExp: 1.0, Lbird: [-0.45, 0.6, 0.65],
      cDeep: [0.1, 0.3, 0.2], cBg: [0.2, 0.45, 0.31], cLo: [0.1, 0.28, 0.18], cHi: [1.0, 0.96, 0.76],
      kDeep: [0.42, 0.56, 0.48], kBg: [0.66, 0.76, 0.63], kLo: [0.55, 0.7, 0.58], kHi: [1.0, 0.98, 0.86],
      discCol: [1.0, 1.0, 0.95], discBg: 1.0, foamCol: [1.0, 1.0, 0.97], foamBg: 0.75, boost: 0.25,
      skyTop: 0.42, skyHor: 0.72, stars: 0, disc: 1.3, wave: 0.35, cloud: 0.7, beam: 0, lamp: 1.2, boatTint: [1.0, 0.98, 0.9], boatAscii: 0.55,
      bloom: 0.18, bloomThr: 0.85, glow: [0.02, 1.08], glowCol: [1.0, 0.84, 0.5], glowAmt: 0.7, wood: [1.0, 0.98, 0.93], panel: [0.7, 0.74, 0.62], rim: [1, 0.98, 0.88]
    }
  };
  const nrm = v => { const l = Math.hypot(...v); return v.map(x => x / l); };
  for (const k in LOOKS) { const o = LOOKS[k], h = Math.hypot(o.L[0], o.L[2]), g = Math.hypot(o.Lg[0], o.Lg[2]); o.L = [o.Lg[0] / g * h, o.L[1], o.Lg[2] / g * h]; }

  /* ---------------- Shaders ---------------- */
  const V3 = "#version 300 es\n", F3 = "#version 300 es\nprecision highp float;precision highp sampler2DShadow;\n";
  const COMMON = `
float h21(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}
float vn(vec2 p){vec2 i=floor(p),f=fract(p);vec2 u=f*f*(3.-2.*f);return mix(mix(h21(i),h21(i+vec2(1,0)),u.x),mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),u.x),u.y);}
vec3 aces(vec3 x){return clamp((x*(2.51*x+.03))/(x*(2.43*x+.59)+.14),0.,1.);}
float shadowAt(sampler2DShadow sm, mat4 vp, vec3 p){ vec4 q=vp*vec4(p,1.); q.xyz=q.xyz/q.w*.5+.5;
  if(q.x<0.||q.x>1.||q.y<0.||q.y>1.||q.z>1.) return 1.;
  float s=0.; vec2 t=vec2(1./2048.); for(int i=-2;i<=2;i++) for(int j=-2;j<=2;j++) s+=texture(sm,vec3(q.xy+vec2(i,j)*t*2.2,q.z-.0015)); return s/25.; }
`;
  // the boat: textured wood graded toward pale weathered grey, lit by the moon or sun, with shadows
  const BOAT_VS = V3 + `in vec3 aP,aN;in vec4 aT;in vec2 aU;uniform mat4 uVP,uM;uniform float uMirror;out vec3 vW,vN;out vec4 vT;out vec2 vU;
void main(){vec4 w=uM*vec4(aP,1.);vW=w.xyz;vN=mat3(uM)*aN;vT=vec4(mat3(uM)*aT.xyz,aT.w);vU=aU;w.y*=uMirror;gl_Position=uVP*w;}`;
  const BOAT_FS = F3 + COMMON + `in vec3 vW,vN;in vec4 vT;in vec2 vU;uniform sampler2D uBase,uOrm,uNorm;uniform sampler2DShadow uSh;uniform mat4 uSVP;
uniform vec3 uL,uLC,uSky,uGround,uC,uWood,uLf,uFill,uRim;uniform float uMirror,uFade;out vec4 o;
void main(){ if(uMirror<0.&&vW.y<0.) discard;
  vec3 n=normalize(vN); if(!gl_FrontFacing) n=-n; n*=uMirror; vec3 t=normalize(vT.xyz-n*dot(vT.xyz,n)); vec3 b=cross(n,t)*vT.w;
  vec3 tn=texture(uNorm,vU).xyz*2.-1.; vec3 N=normalize(t*tn.x+b*tn.y+n*tn.z);
  vec3 alb=texture(uBase,vU).rgb; float g=dot(alb,vec3(.3,.59,.11)); alb=clamp(.3+g*3.,0.,.97)*mix(vec3(1.),alb/max(g,.002),.12)*uWood;
  vec3 orm=texture(uOrm,vU).rgb; float ao=mix(1.,orm.r,.9), rough=clamp(orm.g,.3,1.);
  float wet=1.-smoothstep(-2.,16.,vW.y); alb*=1.-.5*wet;
  vec3 V=normalize(uC-vW), H=normalize(uL+V); float sh=shadowAt(uSh,uSVP,vW);
  float key=max(dot(N,uL),0.), fil=max(dot(N,normalize(uLf)),0.)*.8+.2;
  float spec=pow(max(dot(N,H),0.),mix(110.,10.,rough))*(1.-rough*.6);
  // rim: edges turned toward the light catch it, like the sun on the gunwale and the bow in the reference
  vec3 Ls=normalize(uL-V*dot(uL,V)+vec3(0,.35,0));
  float rim=pow(1.-max(dot(n,V),0.),2.2)*(.15+.85*smoothstep(-.1,.6,dot(n,Ls)))*1.5+pow(max(dot(N,H),0.),40.)*smoothstep(.6,.95,n.y)*.6;
  vec3 amb=mix(uGround,uSky,N.y*.5+.5)*ao;
  vec3 col=alb*(amb+uLC*key*sh+uFill*fil*ao)+uLC*spec*sh*.8+uRim*rim*(.3+.7*sh)*ao;
  o=vec4(col*uFade,1.);}`;
  // flat glowing cards standing in for the tabs and buttons, only drawn in the water's reflection
  const CARD_VS = V3 + `in vec3 aP;in vec2 aU,aS;in vec3 aC;uniform mat4 uVP;out vec2 vU,vS;out vec3 vC;
void main(){vU=aU;vS=aS;vC=aC;vec3 p=aP;p.y=-p.y;gl_Position=uVP*vec4(p,1.);}`;
  const CARD_FS = F3 + `in vec2 vU,vS;in vec3 vC;uniform vec3 uRim;out vec4 o;
void main(){ vec2 h=vS*.5; float rad=vS.x<70.?h.x:16.; vec2 q=abs((vU-.5)*vS)-h+rad; float d=length(max(q,0.))+min(max(q.x,q.y),0.)-rad;
  if(d>1.) discard; float rim=smoothstep(-6.,0.,d); o=vec4((vC+uRim*rim*.5)*.7,pow(1.-vU.y,1.6)*.7);}`;
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
  // the island, lighthouse, bottle and post: vertex colours lit like the boat; the lamp glows, glass shines
  const PROP_FS = F3 + COMMON + `in vec3 vW,vN,vC;in vec2 vA;uniform vec3 uL,uLC,uSky,uGround,uC,uLf,uFill,uRim;uniform sampler2DShadow uSh;uniform mat4 uSVP;
uniform float uMirror,uFlip,uLamp,uAlb;out vec4 o;
void main(){ if(uMirror<0.&&vW.y<0.) discard;
  vec3 n=normalize(vN); if(!gl_FrontFacing) n=-n; n*=uFlip; float m=vA.x;
  if(m>.5&&m<1.5){ o=vec4(vC*uLamp,1.); return; }
  vec3 V=normalize(uC-vW), H=normalize(uL+V); float sh=shadowAt(uSh,uSVP,vW), glass=step(1.5,m)*step(m,2.5);
  float key=max(dot(n,uL),0.), fil=max(dot(n,normalize(uLf)),0.)*.8+.2;
  vec3 Ls=normalize(uL-V*dot(uL,V)+vec3(0,.35,0));
  float rim=pow(1.-max(dot(n,V),0.),2.2)*(.15+.85*smoothstep(-.1,.6,dot(n,Ls)))*1.5*(1.-.75*smoothstep(.55,.95,n.y)); // flat tops seen low don't glow, only the outlines
  float spec=pow(max(dot(n,H),0.),mix(22.,140.,glass))*mix(.1,1.6,glass);
  vec3 alb=vC*uAlb*(1.-.4*(1.-smoothstep(-2.,10.,vW.y)));
  vec3 col=alb*(mix(uGround,uSky,n.y*.5+.5)+uLC*key*sh+uFill*fil)+uLC*spec*sh+uRim*rim*(.3+.7*sh)*(1.+glass);
  o=vec4(col,1.);}`;
  // The water. Every pixel finds where its ray meets the sea and works out how bright the sea is there: the first
  // version's rings, swell lines and grain, plus the moon or sun glittering on the waves, the boat's shadow, and the
  // reflections of the boat, tabs, buttons and Allie. The ASCII pass turns that brightness into characters.
  // The boat's own pixels pass straight through (alpha 0) so it can keep its lit look.
  const QUAD_VS = V3 + `in vec2 aP;void main(){gl_Position=vec4(aP,0.,1.);}`;
  const WATER_FS = F3 + COMMON + `
uniform sampler2D uScene,uDepth,uRefl;uniform sampler2DShadow uSh;uniform mat4 uSVP;
uniform vec2 uRes,uScr,uBoat,uBoatAx,uBoatSz,uToCam;uniform vec3 uC,uLg,uR,uU,uB,uBeamP;uniform vec4 uIsle;
uniform float uF,uT,uNear,uFar,uGlit,uReflAmt,uBase,uPanN,uRipN,uSkyTop,uSkyHor,uStars,uDisc,uWave,uCloud,uBeamA,uBeam;uniform vec4 uPan[16],uRip[4];out vec4 o;
float fbm2(vec2 p){ return vn(p)*.5+vn(p*2.03+1.7)*.25+vn(p*4.1-3.1)*.125+vn(p*8.3+5.)*.0625; }
// rings rippling out from something rocking in the water: R = (x, z, size, strength)
float rings(vec2 P,vec4 R){
  vec2 q=P-R.xy; float r=length(q*vec2(1.,1.2)), s0=R.z/170.;
  float warp=(vn(P*.0021+uT*.02)-.5)*95.+(vn(P*.0065-uT*.03)-.5)*35.;
  float ph=pow(max(r/s0+warp,0.),.78)*.085-uT*.32;
  float c=.5+.5*cos(ph), ring=(pow(c,16.)+.35*pow(.5+.5*cos(ph*2.+1.3),26.))*smoothstep(R.z*.9,R.z*1.95,r)*(.35+.65*exp(-r/(2600.*s0)));
  return ring*(.25+1.1*smoothstep(.2,.65,vn(P*vec2(.0035,.005)+7.)))*R.w;
}
// The swell: long wave fronts rolling in, drawn as thin bright lines along their crests that stay about one character
// wide at any distance, wiggling and breaking up like the reference.
float crestLine(float ph,float k,float lw){ float d=1.-sin(ph), w=.5*k*k*lw*lw; return 1.-smoothstep(w*.3,w*1.6,d); }
float crests(vec2 P,float dist){
  vec2 w=P+vec2(vn(P*.004+uT*.03)-.5,vn(P*.003-uT*.02)-.5)*160.;
  float lw=2.+dist*.0062;
  float c=crestLine(dot(w,vec2(.05,.998))*.045-uT*1.05,.045,lw)*.75+crestLine(dot(w,vec2(-.22,.975))*.071-uT*1.32+1.3,.071,lw)*.55+crestLine(dot(w,vec2(.3,.954))*.11-uT*1.7+2.1,.11,lw)*.4;
  float broken=smoothstep(.25,.6,vn(P*vec2(.011,.028)+vec2(uT*.08,0.)));
  return min(c,1.2)*(.25+.75*broken)*smoothstep(12000.,900.,dist)*(.35+.65*smoothstep(5000.,800.,dist));
}
float sea(vec2 P,float dist){
  vec2 q=P-uBoat;
  float streak=smoothstep(.62,.94,vn(vec2(P.x*.0008+uT*.01,P.y*.015-uT*.1)))*.2;
  float fine=vn(P*vec2(.018,.05)+vec2(uT*.35,0.))*.7, ring=0.;
  for(int i=0;i<4;i++){ if(float(i)>=uRipN) break; ring+=rings(P,uRip[i]); }
  float l=uBase+.08+.08*fine+streak*.6+ring*.34+crests(P,dist)*uWave*(.55+.45*smoothstep(900.,3500.,dist));
  vec2 bl=vec2(dot(q,uBoatAx),dot(q,vec2(-uBoatAx.y,uBoatAx.x)))/uBoatSz; l*=1.-.6*exp(-pow(max(length(bl)-.6,0.),2.)*2.5);
  for(int i=0;i<16;i++){ if(float(i)>=uPanN) break; vec4 R=uPan[i];
    vec2 q2=P-R.xy, tc=uC.xz-R.xy; tc=dot(tc,tc)>1.?normalize(tc):uToCam;
    float dx=abs(dot(q2,vec2(tc.y,-tc.x)))/R.z, dz=dot(q2,tc);
    float colm=1.-smoothstep(.7,1.05,dx), down=smoothstep(-12.,20.,dz)*exp(-max(dz,0.)/R.w);
    l+=colm*down*(.2+.8*(.5+.5*sin(dz*.1-uT*2.2+vn(P*.02)*4.)))*.3; }
  return l*mix(1.,.3,smoothstep(3000.,14000.,dist));
}
// wave slopes for the glitter and the wobble in the reflections
vec3 waves(vec2 p,float t){
  vec2 g=vec2(0.);
  vec4 W[5]; W[0]=vec4(.06,.997,.012,.9); W[1]=vec4(-.14,.99,.02,.7); W[2]=vec4(.28,.96,.034,.5); W[3]=vec4(-.35,.937,.05,.35); W[4]=vec4(.55,.835,.09,.22);
  for(int i=0;i<5;i++){ vec2 d=W[i].xy; float k=W[i].z, a=W[i].w/k*.06, ph=dot(d,p)*k-t*sqrt(9.8*k*60.)*.6+float(i)*1.7; g+=d*k*a*cos(ph); }
  vec2 rp=p-uBoat; float r=length(rp); g+=rp/max(r,1.)*smoothstep(150.,330.,r)*exp(-r/1400.)*cos(r*.034-t*1.1)*.09;
  return normalize(vec3(-g.x,1.,-g.y));
}
// The sky: dark overhead, a little lighter at the horizon, stars, banks of cloud low on either side lit at their
// edges, and the moon (or sun): a big disc with faint markings and a soft halo.
float sky(vec3 R,out float cloud){
  float e=max(R.y,0.), m=max(dot(R,uLg),0.), az=atan(R.x,-R.z), maz=atan(uLg.x,-uLg.z);
  float l=mix(uSkyHor,uSkyTop,pow(e,.4))+pow(m,18.)*.14*uDisc+pow(m,260.)*.35*uDisc;
  float disc=smoothstep(.9976,.99785,m);
  if(disc>0.){ vec3 t=normalize(cross(uLg,vec3(0,1,0))), b=cross(t,uLg); vec2 q=vec2(dot(R,t),dot(R,b))*90.;
    l+=disc*(1.15-.4*smoothstep(.45,.7,fbm2(q*.9+3.))-.25*smoothstep(.55,.8,fbm2(q*2.3))); }
  vec2 c=floor(vec2(az,asin(clamp(R.y,-1.,1.)))*300.);
  float star=step(.9972,h21(c))*uStars*(.4+.6*h21(c+7.))*(.5+.5*sin(uT*1.7+h21(c+3.)*30.))*smoothstep(.03,.14,e);
  // clouds: soft heaps of cumulus low over the horizon on either side, dotted and faint, lit at their edges by the moon
  float side=smoothstep(.2,.45,abs(az-maz)), a2=az+uT*.003, eh=e/(.06+.22*fbm2(vec2(a2*2.2,3.1)));
  float dn=fbm2(vec2(a2*7.,e*17.))+.45*fbm2(vec2(a2*19.,e*44.)+2.)-.55-eh*.42+.15;
  cloud=smoothstep(0.,.16,dn)*side*uCloud*smoothstep(-.005,.015,e);
  float edge=smoothstep(0.,.05,dn)*(1.-smoothstep(.05,.22,dn)), facing=.5+.5*cos(az-maz);
  l=mix(l+star,uSkyHor*.4+fbm2(vec2(a2*30.,e*70.))*.12+edge*(.14+.22*facing),cloud);
  return l;
}
// The lighthouse beam: two shafts of light turning slowly from the lamp. How close does this pixel's ray pass to them?
float beam(vec3 C,vec3 d,float tMax){
  if(uBeam<=0.) return 0.;
  float b=0.;
  for(int k=0;k<2;k++){
    float a=uBeamA+float(k)*3.14159; vec3 bd=normalize(vec3(sin(a),-.02,cos(a)));
    vec3 w0=C-uBeamP; float A=dot(d,d),Bq=dot(d,bd),D=dot(d,w0),E=dot(bd,w0),den=A-Bq*Bq;
    if(abs(den)<1e-6) continue;
    float t=clamp((Bq*E-D)/den,0.,tMax), s=clamp((A*E-Bq*D)/den,0.,2600.);
    float dist=length(w0+t*d-s*bd), r=7.+s*.09;
    b+=exp(-dist*dist/(r*r))*pow(1.-s/2600.,1.6)*(.4+.6*exp(-s/500.));
  }
  return b*uBeam;
}
void main(){
  vec2 px=gl_FragCoord.xy/uRes, sp=px*uScr-uScr*.5;
  vec3 dir=uR*sp.x+uU*sp.y-uB*uF;
  vec4 sc=texture(uScene,px); float dz=texture(uDepth,px).r;
  float zb=dz<1.?2.*uNear*uFar/(uFar+uNear-(dz*2.-1.)*(uFar-uNear)):1e9, dl=length(dir);
  float tSurf=dir.y<-1e-4?-uC.y/dir.y:1e9, tGeo=zb<1e8?zb/uF:1e9;
  float bm=beam(uC,dir,min(tSurf,tGeo));
  if(dir.y>-1e-4){ float cl; if(zb<1e8){ o=vec4(sc.rgb+vec3(.6,.95,.95)*bm,0.); return; } o=vec4(sky(normalize(dir),cl)+bm,0.,1.,1.); return; }
  float tw=tSurf, zw=tw*uF; vec3 P=uC+dir*tw;
  if(zb<zw){ o=vec4(sc.rgb+vec3(.6,.95,.95)*bm,0.); return; }
  float dist=length(P-uC);
  vec3 V=-normalize(dir); float sh=shadowAt(uSh,uSVP,P);
  float l=sea(P.xz,dist), foam=0.;
  // white water around the little island at home: a lacy ring where the waves lap at the sand
  if(uIsle.w>0.){
    vec2 q=P.xz-uIsle.xy; float r=length(q), an=atan(q.y,q.x);
    float edge=uIsle.z*(1.+.09*sin(an*3.+1.)+.05*sin(an*7.+2.))+7.*sin(uT*.8+an*2.)+5.*sin(uT*1.9+an*5.);
    float to=r-edge;
    if(to>-20.&&to<360.){
      float lace=vn(q*vec2(.05,.07)+uT*.3)*.6+vn(q*.15-uT*.8)*.4;
      float lap=smoothstep(30.,0.,to)*smoothstep(.2,.6,lace+.15*sin(uT*.8+an*2.));
      float roll=pow(.5+.5*sin(to*.06-uT*1.6),6.)*smoothstep(320.,30.,to)*smoothstep(.35,.7,lace)*.6;
      foam=clamp(lap+roll,0.,1.); l+=foam*.7;
    }
  }
  vec3 N=waves(P.xz,uT), Rv=reflect(-V,N);
  vec3 mN=normalize(N+vec3(vn(P.xz*.09+uT*.7)-.5,0.,vn(P.xz*.11-uT*.6+9.)-.5)*.18);
  // the moon's path: bright glints on the tiny facets that tip toward the moon, densest straight below it
  float gl=pow(max(dot(reflect(-V,mN),uLg),0.),140.)*1.5+pow(max(dot(Rv,uLg),0.),30.)*.08;
  // kept to a narrow column under the moon, like the reference, so the sea around it stays dark
  float path=smoothstep(.86,.995,dot(normalize(dir.xz),normalize(uLg.xz)));
  l+=gl*uGlit*sh*smoothstep(16000.,2500.,dist)*(.6+.8*crests(P.xz,dist))*(.12+.88*path)*(.45+.55*smoothstep(600.,4000.,dist));
  vec4 rf=texture(uRefl,px+(N.xz*vec2(.03,.05)+vec2(vn(P.xz*vec2(.01,.06)+uT*.4)-.5,0.)*.02)*(700./max(zw,700.)));
  float rl=dot(rf.rgb,vec3(.3,.59,.11))*uReflAmt; l=mix(l,rl*1.1+l*.35,clamp(rf.a,0.,1.)*.85);
  l*=mix(1.,.72,1.-sh);
  if(zb<1e8){ float under=(zb-zw)/uF*dl; l=mix(l,dot(sc.rgb,vec3(.3,.59,.11))*.55,exp(-under/38.)*.75); }
  l+=bm*.8;
  // far out, the sea melts into the haze at the horizon
  l=mix(l,uSkyHor*.9,smoothstep(6000.,34000.,dist));
  o=vec4(l,foam*.45*mix(1.,.65,1.-sh),0.,1.);
}`;
  // Turns the scene into ASCII: each small cell becomes a pixel-font character picked by how bright it is, coloured from
  // the sea's or the sky's palette. The boat, lighthouse, island and the rest keep their own lit colours with the same
  // characters printed over them, so they read as solid 3D things in an ASCII world. The result is linear and can go
  // above 1; the glow pass picks up the bright parts.
  const ASCII_FS = F3 + COMMON + `
uniform sampler2D uImg,uAtlas;uniform vec2 uRes,uCell,uGlow;uniform float uN,uExp,uDim,uGlowAmt,uBoatAscii,uBoost;uniform vec3 uDiscCol,uFoamCol;uniform float uDiscBg,uFoamBg;
uniform vec3 cDeep,cBg,cLo,cHi,kDeep,kBg,kLo,kHi,uGlowCol,uBoatTint;out vec4 o;
float luma(vec3 c){return dot(c,vec3(.2126,.7152,.0722));}
vec3 lit(vec3 c){return aces(c*uExp)*uBoatTint;}
void main(){
  vec2 fc=gl_FragCoord.xy, cell=floor(fc/uCell), inC=fract(fc/uCell), cuv=(cell+.5)*uCell/uRes, uv=fc/uRes;
  vec4 s=texture(uImg,cuv), px=texture(uImg,uv);
  float asp=uRes.x/uRes.y, vig=mix(.55,1.,smoothstep(1.35,.35,length((cuv-.5)*vec2(1.25,1.))));
  vec2 gd=(cuv-uGlow)*vec2(asp,1.); float glow=uGlowAmt*exp(-dot(gd,gd)/.3);
  float l=(s.a>.5?s.r:luma(lit(s.rgb))*1.1)*vig*uDim+glow;
  float h=fract(sin(dot(cell,vec2(12.9898,78.233)))*43758.5453);
  float lv=clamp(l,0.,1.), idx=clamp(floor(pow(lv,1.1)*uN*1.08+(h-.5)*.8),0.,uN-1.);
  float cov=texture(uAtlas,vec2((idx+inC.x)/uN,1.-inC.y)).a;
  float kw=s.a>.5?s.b:0., fo=s.a>.5?clamp(s.g/.45,0.,1.):0.;
  vec3 pDeep=mix(cDeep,kDeep,kw), pBg=mix(cBg,kBg,kw), pLo=mix(cLo,kLo,kw), pHi=mix(cHi,kHi,kw);
  vec3 bg=mix(pDeep,pBg,smoothstep(0.,.6,lv))+uGlowCol*glow*.25, fg=mix(pLo,pHi,smoothstep(.1,.9,lv))*(1.+uBoost*smoothstep(.55,1.,l));
  fg=mix(fg,uFoamCol*(1.+uBoost*.5),fo); bg=mix(bg,uFoamCol*uFoamBg,fo*.6);
  float disc=s.a>.5&&s.b>.5?smoothstep(1.2,1.6,s.r):0.;
  bg=mix(bg,uDiscCol*uDiscBg,disc); fg=mix(fg,uDiscCol*(1.+uBoost),disc);
  vec3 sea=mix(bg,fg,cov);
  vec3 pb=lit(px.rgb)*vig*uDim, solid=mix(pb,mix(pb*.22,pb*1.3,cov),uBoatAscii);
  o=vec4(mix(solid,sea,px.a),1.);
}`;
  // The glow: the bright parts of the ASCII picture, blurred at quarter size and laid back over it.
  const BLUR_FS = F3 + `uniform sampler2D uImg;uniform vec2 uDst,uStep;uniform float uThr;out vec4 o;
vec3 tap(vec2 uv){ vec3 c=texture(uImg,uv).rgb; return max(c-uThr,0.); }
void main(){ vec2 uv=gl_FragCoord.xy/uDst, d=uStep/uDst;
  vec3 c=tap(uv)*.2270;
  c+=(tap(uv+d*1.3846)+tap(uv-d*1.3846))*.3162; c+=(tap(uv+d*3.2308)+tap(uv-d*3.2308))*.0703;
  o=vec4(c,1.); }`;
  // the last step: the ASCII picture plus its glow, to the screen
  const FINAL_FS = F3 + `uniform sampler2D uImg,uBloom,uBloom2;uniform vec2 uRes;uniform float uBloomAmt;out vec4 o;
void main(){ vec2 uv=gl_FragCoord.xy/uRes; vec3 c=texture(uImg,uv).rgb+texture(uBloom,uv).rgb*uBloomAmt+texture(uBloom2,uv).rgb*uBloomAmt*.6;
  c=c/(1.+max(c-1.,0.)*.5); o=vec4(pow(clamp(c,0.,1.),vec3(1./2.2)),1.); }`;

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
    const P = programs(gl, { depth: [BOAT_VS, F3 + "out vec4 o;void main(){o=vec4(1.);}"], pdepth: [GULL_VS, F3 + "out vec4 o;void main(){o=vec4(1.);}"], boat: [BOAT_VS, BOAT_FS], prop: [GULL_VS, PROP_FS], card: [CARD_VS, CARD_FS], gull: [GULL_VS, GULL_FS], water: [QUAD_VS, WATER_FS], ascii: [QUAD_VS, ASCII_FS], blur: [QUAD_VS, BLUR_FS], final: [QUAD_VS, FINAL_FS] });
    const BP = programs(bgl, { gull: [GULL_VS, GULL_FS] });
    const quadBuf = new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]);
    const quad = {}; for (const k of ["water", "ascii", "blur", "final"]) quad[k] = vao(gl, P[k], [["aP", quadBuf, 2]]);
    const gullMain = gullVAOs(gl, P.gull), gullTop = gullVAOs(bgl, BP.gull);
    // the props, each with a VAO for lighting and one for the shadow pass
    const PROPS = { island: buildIsland(), lighthouse: buildLighthouse(), bench: buildBench(), bottle: buildBottle(), post: buildPost(), islet: buildIslet() }, propVAO = {};
    for (const k in PROPS) { const g = PROPS[k].mesh, at = p => [["aP", g.pos, 3], ["aN", g.nor, 3], ["aC", g.col, 3], ["aA", g.aux, 2]]; propVAO[k] = { lit: vao(gl, P.prop, at(), g.idx), depth: vao(gl, P.pdepth, at(), g.idx) }; }
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

    let RT = null, cellPx = [3, 4], atlas = null;
    // A tiny pixel font, 4 x 6 with the right column and bottom rows left blank so characters stay apart, from empty to full.
    // 3 x 4 pixel glyphs (the last column and row are the gap between characters), darkest to brightest
    const GLYPHS = [
      ["...", "...", "...", "..."], ["...", "...", "#..", "..."], ["...", "##.", "...", "..."], ["#..", "...", "#..", "..."], ["##.", "...", "##.", "..."],
      ["...", "##.", "##.", "..."], ["#..", "##.", "#..", "..."], ["##.", "#..", "##.", "..."], ["##.", "##.", "##.", "..."], ["###", "###", "###", "###"]];
    function targets(w, h) {
      if (RT) { for (const t of [RT.scene, RT.depth, RT.refl, RT.comp, RT.ascii, RT.b1, RT.b2, RT.b3, RT.b4]) gl.deleteTexture(t); gl.deleteRenderbuffer(RT.reflDepth); for (const f of [RT.sceneFB, RT.reflFB, RT.compFB, RT.asciiFB, RT.b1FB, RT.b2FB, RT.b3FB, RT.b4FB]) gl.deleteFramebuffer(f); }
      const r = { w, h, rw: Math.ceil(w / 2), rh: Math.ceil(h / 2) };
      r.scene = texture(gl, w, h, ...CF, gl.LINEAR); r.depth = texture(gl, w, h, gl.DEPTH_COMPONENT24, gl.DEPTH_COMPONENT, gl.UNSIGNED_INT, gl.NEAREST);
      r.sceneFB = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, r.sceneFB);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, r.scene, 0); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, r.depth, 0);
      r.refl = texture(gl, r.rw, r.rh, ...CF, gl.LINEAR); r.reflDepth = gl.createRenderbuffer(); gl.bindRenderbuffer(gl.RENDERBUFFER, r.reflDepth); gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, r.rw, r.rh);
      r.reflFB = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, r.reflFB);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, r.refl, 0); gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, r.reflDepth);
      r.comp = texture(gl, w, h, ...CF, gl.LINEAR); r.compFB = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, r.compFB);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, r.comp, 0);
      // the ASCII picture, and the glow at a quarter and an eighth of the size
      const fb = (k, tw, th) => { r[k] = texture(gl, tw, th, ...CF, gl.LINEAR); r[k + "FB"] = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, r[k + "FB"]); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, r[k], 0); };
      fb("ascii", w, h); r.qw = Math.ceil(w / 4); r.qh = Math.ceil(h / 4); r.ew = Math.ceil(w / 8); r.eh = Math.ceil(h / 8);
      fb("b1", r.qw, r.qh); fb("b2", r.qw, r.qh); fb("b3", r.ew, r.eh); fb("b4", r.ew, r.eh);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null); RT = r;
    }
    function makeAtlas(cw, ch) {
      const c = document.createElement("canvas"), g = c.getContext("2d"); c.width = cw * GLYPHS.length; c.height = ch;
      g.fillStyle = "#fff"; const px = cw / 3, py = ch / 4;
      GLYPHS.forEach((rows, i) => rows.forEach((row, y) => [...row].forEach((ch_, x) => { if (ch_ === "#") g.fillRect(Math.round(i * cw + x * px), Math.round(y * py), Math.max(1, Math.round(px)), Math.max(1, Math.round(py))); })));
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
    // cell: [w, h] of one ASCII character, in screen pixels
    function resize(w, h, d, cell, font) {
      W = w; H = h; dpr = d;
      seaCanvas.width = birdCanvas.width = Math.round(w * d); seaCanvas.height = birdCanvas.height = Math.round(h * d);
      targets(seaCanvas.width, seaCanvas.height);
      const k = Math.max(1, Math.round(d)); cellPx = [cell[0] * k, cell[1] * k]; // whole pixels per glyph pixel, so they stay crisp
      makeAtlas(cellPx[0], cellPx[1]);
    }

    function drawBoat(prog, VP, F, mirror) {
      if (!boat.ready) return;
      const u = prog.u; gl.useProgram(prog.p);
      gl.uniformMatrix4fv(u.uVP, false, VP); gl.uniformMatrix4fv(u.uM, false, F.boatM); gl.uniform1f(u.uMirror, mirror);
      if (u.uBase) {
        lightUniforms(gl, u, F.look, F.C); gl.uniform3fv(u.uWood, F.look.wood); gl.uniform1f(u.uFade, boat.fade);
        gl.uniform3fv(u.uLf, F.look.Lf); gl.uniform3fv(u.uFill, F.look.fill); gl.uniform3fv(u.uRim, F.look.rimCol.map(x => x * F.look.rimInt));
        gl.uniformMatrix4fv(u.uSVP, false, F.shadowVP);
        [[u.uBase, boat.tex.base], [u.uOrm, boat.tex.orm], [u.uNorm, boat.tex.normal], [u.uSh, shadowTex]].forEach(([loc, t], i) => { gl.activeTexture(gl.TEXTURE0 + i); gl.bindTexture(gl.TEXTURE_2D, t); gl.uniform1i(loc, i); });
      }
      gl.bindVertexArray(boat.vao.v); gl.drawElements(gl.TRIANGLES, boat.vao.n, boat.vao.type, 0); gl.bindVertexArray(null);
    }
    // F.props: [{ mesh: "island" | "lighthouse" | "bottle" | "post", M: model matrix }]
    function drawProps(prog, VP, F, mirror, depthOnly) {
      if (!F.props || !F.props.length) return;
      const u = prog.u; gl.useProgram(prog.p); gl.uniformMatrix4fv(u.uVP, false, VP); gl.uniform1f(u.uMirror, mirror);
      if (!depthOnly) {
        lightUniforms(gl, u, F.look, F.C); gl.uniform3fv(u.uLf, F.look.Lf); gl.uniform3fv(u.uFill, F.look.fill); gl.uniform3fv(u.uRim, F.look.rimCol.map(x => x * F.look.rimInt * 0.8));
        gl.uniformMatrix4fv(u.uSVP, false, F.shadowVP); gl.uniform1f(u.uLamp, F.look.lamp); gl.uniform1f(u.uFlip, mirror); gl.uniform1f(u.uAlb, F.look.alb);
        gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, shadowTex); gl.uniform1i(u.uSh, 0);
      }
      for (const p of F.props) { const o = propVAO[p.mesh][depthOnly ? "depth" : "lit"]; gl.uniformMatrix4fv(u.uM, false, p.M); gl.bindVertexArray(o.v); gl.drawElements(gl.TRIANGLES, o.n, o.type, 0); }
      gl.bindVertexArray(null);
    }
    function gullUniforms(g, prog, VP, F, dither) {
      const u = prog.u; g.useProgram(prog.p); g.uniformMatrix4fv(u.uVP, false, VP); lightUniforms(g, u, { ...F.look, L: F.look.Lbird }, F.C);
      g.uniform1f(u.uExp, F.look.birdExp * F.dim); g.uniform1f(u.uDither, dither);
    }

    // F: { T, b (camera basis), FOC, W, H, theme, dim, boat: { R, pos, scale }, panels: [{x,z,w,h}], floats: [{x,y,z,r,c}], gull: pose|null }
    function render(F) {
      const look = F.look = LOOKS[F.theme] || LOOKS.dark, C = F.C = [F.b.cx, F.b.cy, F.b.cz];
      const VP = cameraMats(F.b, F.FOC, W, H);
      F.boatM = M4.fromRS(F.boat.R, F.boat.pos, F.boat.scale);
      if (boat.ready) boat.fade = Math.min(1, boat.fade + 0.06);
      // the moon or sun's view of the boat, for shadows on it and on the water
      const L = nrm(look.L), bc = F.boat.pos, sc0 = F.shadowAt || { x: bc[0], y: 0, z: bc[2], r: F.boat.scale * 1.6 }, sc = [sc0.x, sc0.y, sc0.z], ext = sc0.r;
      F.shadowVP = M4.mul(M4.ortho(-ext, ext, -ext, ext, 10, 6000), M4.lookAt([sc[0] + L[0] * 2500, sc[1] + L[1] * 2500, sc[2] + L[2] * 2500], sc, [0, 1, 0]));
      const mats = F.gull && gullPose(F.gull);
      gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL); gl.disable(gl.BLEND); gl.disable(gl.CULL_FACE);

      // 1. shadows
      gl.bindFramebuffer(gl.FRAMEBUFFER, shadowFB); gl.viewport(0, 0, SM, SM); gl.clear(gl.DEPTH_BUFFER_BIT);
      gl.colorMask(false, false, false, false); drawBoat(P.depth, F.shadowVP, F, 1); drawProps(P.pdepth, F.shadowVP, F, 1, true); gl.colorMask(true, true, true, true);
      // 2. reflection: everything above the water, mirrored underneath it
      gl.bindFramebuffer(gl.FRAMEBUFFER, RT.reflFB); gl.viewport(0, 0, RT.rw, RT.rh); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      drawBoat(P.boat, VP, F, -1);
      // tabs and buttons as glowing cards standing on (x, y, z), spanning w along r and h along u
      let n = 0;
      const card = (x, y, z, w, h, r, up, col) => {
        const q = [[-0.5, 0], [0.5, 0], [0.5, 1], [-0.5, 0], [0.5, 1], [-0.5, 1]];
        for (const [a, b2] of q) { const o = n * 10; cardData.set([x + r[0] * a * w + up[0] * h * b2, y + r[1] * a * w + up[1] * h * b2, z + r[2] * a * w + up[2] * h * b2, a + 0.5, b2, w, h, ...col], o); n++; }
      };
      for (const p of F.panels) card(p.x, p.y, p.z, p.w, p.h, p.r, p.u, look.panel.map(c => c * (p.back ? 0.8 : 1.6)));
      for (const f of F.floats) if (n < 230) card(f.x, f.y, f.z, f.r * 2, f.r * 2, f.r3, f.u3, f.c);
      if (n) {
        gl.useProgram(P.card.p); gl.uniformMatrix4fv(P.card.u.uVP, false, VP); gl.uniform3fv(P.card.u.uRim, look.rim);
        gl.bindBuffer(gl.ARRAY_BUFFER, cardBuf); gl.bufferData(gl.ARRAY_BUFFER, cardData.subarray(0, n * 10), gl.DYNAMIC_DRAW);
        gl.bindVertexArray(cardVAO); gl.drawArrays(gl.TRIANGLES, 0, n); gl.bindVertexArray(null);
      }
      drawProps(P.prop, VP, F, -1);
      if (mats) { gullUniforms(gl, P.gull, VP, F, 0); drawGull(gl, P.gull, gullMain, mats, -1); }
      // 3. the boat
      gl.bindFramebuffer(gl.FRAMEBUFFER, RT.sceneFB); gl.viewport(0, 0, RT.w, RT.h); gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      drawBoat(P.boat, VP, F, 1); drawProps(P.prop, VP, F, 1);
      // 4. the water around and through it
      gl.disable(gl.DEPTH_TEST);
      gl.bindFramebuffer(gl.FRAMEBUFFER, RT.compFB); gl.viewport(0, 0, RT.w, RT.h);
      let u = P.water.u; gl.useProgram(P.water.p);
      [[u.uScene, RT.scene], [u.uDepth, RT.depth], [u.uRefl, RT.refl], [u.uSh, shadowTex]].forEach(([loc, t], i) => { gl.activeTexture(gl.TEXTURE0 + i); gl.bindTexture(gl.TEXTURE_2D, t); gl.uniform1i(loc, i); });
      gl.uniformMatrix4fv(u.uSVP, false, F.shadowVP);
      gl.uniform2f(u.uRes, RT.w, RT.h); gl.uniform2f(u.uScr, W, H); gl.uniform3fv(u.uR, F.b.R); gl.uniform3fv(u.uU, F.b.U); gl.uniform3fv(u.uB, F.b.B); gl.uniform1f(u.uF, F.FOC);
      { const l = Math.hypot(F.b.B[0], F.b.B[2]) || 1; gl.uniform2f(u.uToCam, F.b.B[0] / l, F.b.B[2] / l); }
      gl.uniform3fv(u.uC, C); gl.uniform1f(u.uT, F.T); gl.uniform1f(u.uNear, NEAR); gl.uniform1f(u.uFar, FAR);
      gl.uniform3fv(u.uLg, nrm(look.Lg)); gl.uniform1f(u.uGlit, look.glit); gl.uniform1f(u.uReflAmt, look.refl); gl.uniform1f(u.uBase, look.base);
      // ripples around the boat, the island and the bottle; the beach; the sky
      const rips = new Float32Array(16); (F.ripples || [[bc[0], bc[2], 170, 1]]).slice(0, 4).forEach((r, i) => rips.set(r, i * 4));
      gl.uniform4fv(u.uRip, rips); gl.uniform1f(u.uRipN, Math.min(4, (F.ripples || [0]).length));
      gl.uniform4fv(u.uIsle, F.isle ? [F.isle[0], F.isle[1], F.isle[2], 1] : [0, 0, 0, 0]);
      gl.uniform1f(u.uWave, look.wave); gl.uniform1f(u.uCloud, look.cloud);
      gl.uniform3fv(u.uBeamP, F.beam ? F.beam.p : [0, -1e4, 0]); gl.uniform1f(u.uBeamA, F.beam ? F.beam.a : 0); gl.uniform1f(u.uBeam, F.beam ? look.beam : 0);
      gl.uniform1f(u.uSkyTop, look.skyTop); gl.uniform1f(u.uSkyHor, look.skyHor); gl.uniform1f(u.uStars, look.stars); gl.uniform1f(u.uDisc, look.disc);
      const yaw = Math.atan2(-F.boat.R[2][0], F.boat.R[0][0]);
      gl.uniform2f(u.uBoat, bc[0], bc[2]); gl.uniform2f(u.uBoatAx, Math.cos(yaw), -Math.sin(yaw)); gl.uniform2f(u.uBoatSz, F.boat.scale * 1.05, F.boat.scale * 0.36);
      const pans = new Float32Array(64); let pn = 0;
      for (const p of F.panels) if (pn < 16) { pans.set([p.x, p.z, p.w / 2, 160], pn * 4); pn++; }
      gl.uniform4fv(u.uPan, pans); gl.uniform1f(u.uPanN, pn);
      gl.bindVertexArray(quad.water.v); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      // 5. ASCII
      gl.bindFramebuffer(gl.FRAMEBUFFER, RT.asciiFB); gl.viewport(0, 0, RT.w, RT.h);
      u = P.ascii.u; gl.useProgram(P.ascii.p);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, RT.comp); gl.uniform1i(u.uImg, 0);
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, atlas); gl.uniform1i(u.uAtlas, 1);
      gl.uniform2f(u.uRes, seaCanvas.width, seaCanvas.height); gl.uniform2fv(u.uCell, cellPx); gl.uniform1f(u.uN, GLYPHS.length);
      gl.uniform1f(u.uExp, look.exposure); gl.uniform1f(u.uDim, F.dim); gl.uniform1f(u.uBoatAscii, look.boatAscii);
      for (const k of ["cDeep", "cBg", "cLo", "cHi", "kDeep", "kBg", "kLo", "kHi"]) gl.uniform3fv(u[k], look[k]); gl.uniform1f(u.uBoost, look.boost); gl.uniform3fv(u.uDiscCol, look.discCol); gl.uniform1f(u.uDiscBg, look.discBg); gl.uniform3fv(u.uFoamCol, look.foamCol); gl.uniform1f(u.uFoamBg, look.foamBg); gl.uniform3fv(u.uBoatTint, look.boatTint);
      {
        const Lg = nrm(look.Lg), z = Lg[0] * F.b.B[0] + Lg[1] * F.b.B[1] + Lg[2] * F.b.B[2], x = Lg[0] * F.b.R[0] + Lg[2] * F.b.R[2], y = Lg[0] * F.b.U[0] + Lg[1] * F.b.U[1] + Lg[2] * F.b.U[2];
        // screen position of the light's direction (in view-space, -z is forward); behind you it fades out
        const fwd = -z, sx = fwd > 0.05 ? 0.5 + F.FOC * x / fwd / W : (x > 0 ? 2 : -1), sy = fwd > 0.05 ? 0.5 + F.FOC * y / fwd / H : 1.2;
        const gx = Math.max(-0.04, Math.min(1.04, sx)), gy = Math.max(0.35, Math.min(1.1, sy)), fade = Math.max(0, Math.min(1, (fwd + 0.25) / 0.5));
        gl.uniform2f(u.uGlow, gx, gy); gl.uniform3fv(u.uGlowCol, look.glowCol); gl.uniform1f(u.uGlowAmt, look.glowAmt * fade);
      }
      gl.bindVertexArray(quad.ascii.v); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4); gl.bindVertexArray(null);
      // 6. the glow: bright parts blurred at a quarter and an eighth of the size
      const blur = (src, dst, w2, h2, dx, dy, thr) => {
        gl.bindFramebuffer(gl.FRAMEBUFFER, RT[dst + "FB"]); gl.viewport(0, 0, w2, h2); const bu = P.blur.u; gl.useProgram(P.blur.p);
        gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, RT[src]); gl.uniform1i(bu.uImg, 0);
        gl.uniform2f(bu.uDst, w2, h2); gl.uniform2f(bu.uStep, dx, dy); gl.uniform1f(bu.uThr, thr);
        gl.bindVertexArray(quad.blur.v); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      };
      blur("ascii", "b1", RT.qw, RT.qh, 1, 0, look.bloomThr); blur("b1", "b2", RT.qw, RT.qh, 0, 1, 0);
      blur("b2", "b3", RT.ew, RT.eh, 1.4, 0, 0); blur("b3", "b4", RT.ew, RT.eh, 0, 1.4, 0);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, seaCanvas.width, seaCanvas.height);
      u = P.final.u; gl.useProgram(P.final.p);
      [[u.uImg, RT.ascii], [u.uBloom, RT.b2], [u.uBloom2, RT.b4]].forEach(([loc, t], i) => { gl.activeTexture(gl.TEXTURE0 + i); gl.bindTexture(gl.TEXTURE_2D, t); gl.uniform1i(loc, i); });
      gl.uniform2f(u.uRes, seaCanvas.width, seaCanvas.height); gl.uniform1f(u.uBloomAmt, look.bloom * F.dim);
      gl.bindVertexArray(quad.final.v); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4); gl.bindVertexArray(null);

      // Allie, on her own layer above the tabs
      bgl.viewport(0, 0, birdCanvas.width, birdCanvas.height); bgl.clearColor(0, 0, 0, 0); bgl.clear(bgl.COLOR_BUFFER_BIT | bgl.DEPTH_BUFFER_BIT);
      if (mats) {
        bgl.enable(bgl.DEPTH_TEST); bgl.disable(bgl.CULL_FACE);
        gullUniforms(bgl, BP.gull, VP, F, Math.max(1, Math.round(dpr * 1.5))); drawGull(bgl, BP.gull, gullTop, mats, 1);
      }
    }
    return {
      resize, render, loadBoat, gl, hdr, props: { terrace: TERRACE, bench: BENCH, islandTop: PROPS.island.top, lamp: PROPS.lighthouse.lamp, lighthouse: PROPS.lighthouse.height, postTop: PROPS.post.top, bottle: PROPS.bottle.length },
      get boatReady() { return boat.ready; }, get bowTip() { return boat.tip; }, get credit() { return boat.credit; }
    };
  }

  window.AllieSea = { create, parseGLB, bowTip, buildGull, gullPose, M4, TERRACE, BENCH, ISLET, isletHeight };
})();
