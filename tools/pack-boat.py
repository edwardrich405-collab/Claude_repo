# Packs the boat model for the app: bakes its orientation in, centres it, and shrinks the 4K textures
# so it loads fast and keeps the installer small. Only needed again if the source model changes.
# Run: python3 tools/pack-boat.py [assets/boat-source.glb] [renderer/models/boat.glb]
# Needs Python 3 with numpy and Pillow.
import io, json, struct, sys
import numpy as np
from PIL import Image

src = sys.argv[1] if len(sys.argv) > 1 else "assets/boat-source.glb"
dst = sys.argv[2] if len(sys.argv) > 2 else "renderer/models/boat.glb"

raw = open(src, "rb").read()
jl, _ = struct.unpack("<II", raw[12:20]); j = json.loads(raw[20:20 + jl])
bl, _ = struct.unpack("<II", raw[20 + jl:28 + jl]); B = raw[28 + jl:28 + jl + bl]

def accessor(i):
    a = j["accessors"][i]; bv = j["bufferViews"][a["bufferView"]]
    n = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4}[a["type"]]
    dt = {5126: np.float32, 5123: np.uint16, 5125: np.uint32}[a["componentType"]]
    stride = bv.get("byteStride", 0)
    assert not stride or stride == n * np.dtype(dt).itemsize, "interleaved buffers aren't supported"
    arr = np.frombuffer(B, dt, a["count"] * n, bv.get("byteOffset", 0) + a.get("byteOffset", 0))
    return arr.reshape(a["count"], n) if n > 1 else arr

# The node chain (Sketchfab's root and the Collada group) turns the model so its length runs along x and y is up.
def node_matrix(n):
    if "matrix" in n: return np.array(n["matrix"], dtype=np.float64).reshape(4, 4).T
    return np.eye(4)
M = np.eye(4)
for i in (0, 1): M = M @ node_matrix(j["nodes"][i])
prim = j["meshes"][0]["primitives"][0]; at = prim["attributes"]
P = accessor(at["POSITION"]).astype(np.float64); Nn = accessor(at["NORMAL"]).astype(np.float64)
Tg = accessor(at["TANGENT"]).astype(np.float64); UV = accessor(at["TEXCOORD_0"]).astype(np.float32)
I = accessor(prim["indices"]).astype(np.uint32)
R = M[:3, :3]
P = P @ R.T + M[:3, 3]; Nn = Nn @ R.T; Tg[:, :3] = Tg[:, :3] @ R.T
P[:, 0] -= (P[:, 0].min() + P[:, 0].max()) / 2; P[:, 2] -= (P[:, 2].min() + P[:, 2].max()) / 2
Nn /= np.linalg.norm(Nn, axis=1, keepdims=True); Tg[:, :3] /= np.linalg.norm(Tg[:, :3], axis=1, keepdims=True)

def image(i):
    bv = j["bufferViews"][j["images"][i]["bufferView"]]
    return Image.open(io.BytesIO(B[bv.get("byteOffset", 0):bv.get("byteOffset", 0) + bv["byteLength"]])).convert("RGB")
def jpeg(img, size, q):
    out = io.BytesIO(); img.resize((size, size), Image.LANCZOS).save(out, "JPEG", quality=q, optimize=True); return out.getvalue()
mat = j["materials"][0]
imgs = [jpeg(image(j["textures"][mat["pbrMetallicRoughness"]["baseColorTexture"]["index"]]["source"]), 2048, 90),
        jpeg(image(j["textures"][mat["occlusionTexture"]["index"]]["source"]), 1024, 90),
        jpeg(image(j["textures"][mat["normalTexture"]["index"]]["source"]), 2048, 94)]

blobs, views, accs = [], [], []
def add(data, target=None):
    off = sum(len(b) for b in blobs); pad = (-len(data)) % 4
    blobs.append(data + b"\0" * pad); v = {"buffer": 0, "byteOffset": off, "byteLength": len(data)}
    if target: v["target"] = target
    views.append(v); return len(views) - 1
def add_acc(arr, typ, comp, target):
    v = add(arr.tobytes(), target); a = {"bufferView": v, "componentType": comp, "count": int(arr.shape[0]), "type": typ}
    if typ == "VEC3" and comp == 5126: a["min"] = arr.min(0).tolist(); a["max"] = arr.max(0).tolist()
    accs.append(a); return len(accs) - 1
attrs = {"POSITION": add_acc(P.astype(np.float32), "VEC3", 5126, 34962), "NORMAL": add_acc(Nn.astype(np.float32), "VEC3", 5126, 34962),
         "TANGENT": add_acc(Tg.astype(np.float32), "VEC4", 5126, 34962), "TEXCOORD_0": add_acc(UV, "VEC2", 5126, 34962)}
idx = add_acc(I.astype(np.uint16 if len(P) < 65536 else np.uint32), "SCALAR", 5123 if len(P) < 65536 else 5125, 34963)
img_views = [add(b) for b in imgs]
out = {
    "asset": {"version": "2.0", "generator": "Allison tools/pack-boat.py", "extras": j["asset"].get("extras", {})},
    "scene": 0, "scenes": [{"nodes": [0]}], "nodes": [{"mesh": 0, "name": "boat"}],
    "meshes": [{"name": "boat", "primitives": [{"attributes": attrs, "indices": idx, "material": 0}]}],
    "materials": [{"name": "wood", "doubleSided": True, "pbrMetallicRoughness": {"baseColorTexture": {"index": 0}, "metallicRoughnessTexture": {"index": 1}},
                   "occlusionTexture": {"index": 1}, "normalTexture": {"index": 2}}],
    "textures": [{"source": i, "sampler": 0} for i in range(3)],
    "samplers": [{"magFilter": 9729, "minFilter": 9987, "wrapS": 10497, "wrapT": 10497}],
    "images": [{"bufferView": v, "mimeType": "image/jpeg"} for v in img_views],
    "accessors": accs, "bufferViews": views, "buffers": [{"byteLength": sum(len(b) for b in blobs)}],
}
js = json.dumps(out, separators=(",", ":")).encode(); js += b" " * ((-len(js)) % 4)
bin_ = b"".join(blobs)
glb = struct.pack("<III", 0x46546C67, 2, 12 + 8 + len(js) + 8 + len(bin_)) + struct.pack("<II", len(js), 0x4E4F534A) + js + struct.pack("<II", len(bin_), 0x004E4942) + bin_
open(dst, "wb").write(glb)
print(f"{dst}: {len(glb) / 1e6:.1f} MB, {len(P)} vertices, {len(I) // 3} triangles, bounds {P.min(0).round(3)} {P.max(0).round(3)}")
