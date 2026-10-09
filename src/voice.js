// Allie's voice (Kokoro) and ears (streaming Zipformer), both running offline through sherpa-onnx.
const path = require("path");
const sherpa = require("sherpa-onnx-node");

let tts = null, rec = null, stream = null, heard = "";

function loadTts(p) {
  const K = path.join(p.dl, "kokoro");
  tts = new sherpa.OfflineTts({
    model: { kokoro: { model: p.kokoro, voices: path.join(K, "voices-allie.bin"), tokens: path.join(K, "tokens.txt"),
      dataDir: path.join(K, "espeak-ng-data"), lexicon: path.join(K, "lexicon-gb-en.txt"), lang: "en" }, numThreads: 2 },
    maxNumSentences: 1,
  });
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

// Slot 52 of the voice table holds Allie's own blend (60% Emma, 40% Heart).
let ttsSeq = 0;
async function speak(text, onChunk) {
  if (!tts) throw new Error("voice not loaded");
  const id = ++ttsSeq;
  await tts.generateAsync({ text, sid: 52, speed: 0.95, onProgress: ({ samples }) => {
    if (id !== ttsSeq) return 0;
    onChunk(Float32Array.from(samples));
    return 1;
  } });
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

module.exports = { loadTts, loadAsr, speak, cancel, hear, resetEars, sampleRate: () => (tts ? tts.sampleRate : 24000), hasTts: () => !!tts };
