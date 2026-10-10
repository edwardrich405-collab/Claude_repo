// Allie's voice (Kokoro) and ears (streaming Zipformer), both running offline through sherpa-onnx.
const path = require("path"), fs = require("fs"), os = require("os");
const sherpa = require("sherpa-onnx-node");
const { clean, sentences, pauseAfter, trim } = require("./speech-text");

let tts = null, rec = null, stream = null, heard = "";

// Her voice is Kokoro's "Bella" (af_bella, slot 2), its most natural voice after Heart (Jack's friend uses Heart), at normal speed with US English pronunciations.
// The old British blend is still in the voice table at slot 52 (lexicon gb, speed 0.95) if she ever wants it back.
const VOICE = { sid: 2, speed: 1.0, lexicon: "lexicon-us-en.txt", lang: "en-us" };
const threads = () => Math.max(2, Math.min(6, Math.floor(os.cpus().length / 2)));

function loadTts(p) {
  const K = path.join(p.dl, "kokoro"), us = path.join(K, VOICE.lexicon), haveUs = fs.existsSync(us);
  tts = new sherpa.OfflineTts({
    model: { kokoro: { model: p.kokoro, voices: path.join(K, "voices-allie.bin"), tokens: path.join(K, "tokens.txt"),
      dataDir: path.join(K, "espeak-ng-data"), lexicon: haveUs ? us : path.join(K, "lexicon-gb-en.txt"), lang: haveUs ? VOICE.lang : "en" }, numThreads: threads() },
    maxNumSentences: 1,
  });
  return (haveUs ? "us" : "gb") + " lexicon, " + threads() + " threads";
}

function loadAsr(p) {
  const A = path.join(p.dl, "asr"), f = n => path.join(A, n + "-epoch-99-avg-1-chunk-16-left-128" + (n === "decoder" ? "" : ".int8") + ".onnx");
  rec = new sherpa.OnlineRecognizer({
    featConfig: { sampleRate: 16000, featureDim: 80 },
    modelConfig: { transducer: { encoder: f("encoder"), decoder: f("decoder"), joiner: f("joiner") }, tokens: path.join(A, "tokens.txt"), numThreads: 2, provider: "cpu", debug: 0 },
    decodingMethod: "greedy_search", enableEndpoint: true,
    rule1MinTrailingSilence: 2.0, rule2MinTrailingSilence: 0.8, rule3MinUtteranceLength: 20,
  });
  stream = rec.createStream();
}

// One sentence at a time: clean the text, generate, trim the silence the model adds, then a short natural pause.
// The window plays each piece as soon as it arrives, so the next one is being made while this one plays.
let ttsSeq = 0;
async function speak(text, onChunk) {
  if (!tts) throw new Error("voice not loaded");
  const id = ++ttsSeq, rate = tts.sampleRate;
  for (const s of sentences(clean(text))) {
    if (id !== ttsSeq) return false;
    // Under Electron the finished result can't be handed back ("TTS settlement failed"), so the audio is copied out as it's made.
    const got = [];
    try {
      await tts.generateAsync({ text: s, sid: VOICE.sid, speed: VOICE.speed, onProgress: ({ samples }) => {
        if (id !== ttsSeq) return 0;
        got.push(Float32Array.from(samples)); return 1;
      } });
    } catch (err) { if (!got.length) throw err; }
    if (id !== ttsSeq) return false;
    const all = new Float32Array(got.reduce((n, g) => n + g.length, 0)); let at = 0;
    for (const g of got) { all.set(g, at); at += g.length; }
    const voiced = trim(all, rate);
    if (!voiced.length) continue;
    const out = new Float32Array(voiced.length + Math.round(rate * pauseAfter(s))); out.set(voiced);
    onChunk(out);
  }
  return id === ttsSeq;
}
const cancel = () => { ttsSeq++; };

// Feed 16 kHz microphone samples; calls back with what's been heard so far and when a sentence ends.
function hear(samples, onText) {
  if (!rec) return;
  stream.acceptWaveform({ samples, sampleRate: 16000 });
  while (rec.isReady(stream)) rec.decode(stream);
  const t = rec.getResult(stream).text.trim();
  if (t !== heard) { heard = t; onText({ text: t, final: false }); }
  if (rec.isEndpoint(stream)) { if (t) onText({ text: t, final: true }); heard = ""; rec.reset(stream); }
}
function resetEars() { if (rec) { rec.reset(stream); heard = ""; } }

module.exports = { loadTts, loadAsr, speak, cancel, hear, resetEars, sampleRate: () => (tts ? tts.sampleRate : 24000), hasTts: () => !!tts, hasAsr: () => !!rec, VOICE, _useTts: t => { tts = t; } };
