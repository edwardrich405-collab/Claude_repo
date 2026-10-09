// Allie's ears and voice are too big for the installer, so they download once on first run.
const fs = require("fs"), path = require("path"), { spawn } = require("child_process");
const { Readable, Transform } = require("stream"), { pipeline } = require("stream/promises");

const REL = "https://github.com/k2-fsa/sherpa-onnx/releases/download/";
const ASR_DIR = "sherpa-onnx-streaming-zipformer-en-2023-06-26", TAG = "-epoch-99-avg-1-chunk-16-left-128";
const PACKS = {
  asr: { url: REL + "asr-models/" + ASR_DIR + ".tar.bz2", size: 310414022, dir: ASR_DIR,
    files: ["encoder" + TAG + ".int8.onnx", "decoder" + TAG + ".onnx", "joiner" + TAG + ".int8.onnx", "tokens.txt"] },
  kokoro: { url: REL + "tts-models/kokoro-multi-lang-v1_0.tar.bz2", size: 349906910, dir: "kokoro-multi-lang-v1_0",
    files: ["model.onnx", "voices.bin", "tokens.txt", "lexicon-gb-en.txt", "espeak-ng-data"] },
};

function paths(app) {
  const dl = path.join(app.getPath("userData"), "models");
  return { bundled: dl, dl, kokoro: path.join(dl, "kokoro", "model.onnx") };
}
const done = (app, k) => fs.existsSync(path.join(paths(app).dl, k, ".ok"));

async function fetchPack(app, k, onProgress) {
  const P = PACKS[k], dl = paths(app).dl, out = path.join(dl, k);
  if (done(app, k)) return;
  fs.mkdirSync(dl, { recursive: true });
  const tarFile = path.join(dl, k + ".tar.bz2"), part = tarFile + ".part";
  if (!fs.existsSync(tarFile)) {
    const res = await fetch(P.url, { redirect: "follow" });
    if (!res.ok) throw new Error("Download failed (" + res.status + ")");
    const total = +res.headers.get("content-length") || P.size; let got = 0, last = 0;
    const counter = new Transform({ transform(chunk, enc, cb) {
      got += chunk.length; const now = Date.now();
      if (now - last > 250) { last = now; onProgress({ stage: "download", what: k, progress: got / total }); }
      cb(null, chunk);
    } });
    await pipeline(Readable.fromWeb(res.body), counter, fs.createWriteStream(part));
    fs.renameSync(part, tarFile);
  }
  onProgress({ stage: "unpack", what: k, progress: 1 });
  // Windows 10 and 11 ship bsdtar as tar.exe, which reads .tar.bz2; only the files Allie uses are kept.
  await new Promise((resolve, reject) => {
    const t = spawn("tar", ["-xf", tarFile, "-C", dl, ...P.files.map(f => P.dir + "/" + f)], { windowsHide: true });
    t.on("error", reject); t.on("close", c => (c === 0 ? resolve() : reject(new Error("Unpacking failed (" + c + ")"))));
  });
  fs.rmSync(out, { recursive: true, force: true });
  fs.renameSync(path.join(dl, P.dir), out);
  if (k === "kokoro") makeAllie(out);
  fs.writeFileSync(path.join(out, ".ok"), "1");
  fs.rmSync(tarFile, { force: true });
}

// Allie's voice is her own blend, 60% Emma and 40% Heart, written into slot 52 of the voice table.
function makeAllie(dir) {
  const buf = fs.readFileSync(path.join(dir, "voices.bin")), f = new Float32Array(buf.buffer, buf.byteOffset, buf.length / 4);
  const per = 510 * 256, EMMA = 21, HEART = 3, SLOT = 52;
  for (let i = 0; i < per; i++) f[SLOT * per + i] = 0.6 * f[EMMA * per + i] + 0.4 * f[HEART * per + i];
  fs.writeFileSync(path.join(dir, "voices-allie.bin"), buf);
  fs.rmSync(path.join(dir, "voices.bin"), { force: true });
}

module.exports = { paths, done, fetchPack, makeAllie };
