// Under Electron the voice engine fails to hand back its finished result, so speech must come from the progress callback.
const test = require("node:test"), assert = require("node:assert");
const voice = require("../src/voice");

test("speaks every sentence even when the result can't be handed back", async () => {
  voice._useTts({
    sampleRate: 1000,
    generateAsync: async ({ onProgress }) => {
      const s = new Float32Array(400); s.fill(0.5, 100, 300);
      onProgress({ samples: s, progress: 1 });
      throw new Error("TTS settlement failed");
    },
  });
  const chunks = [];
  const ok = await voice.speak("First one here. Second one there!", c => chunks.push(c));
  assert.strictEqual(ok, true);
  assert.strictEqual(chunks.length, 2);
  assert.ok(chunks.every(c => c.length > 200), chunks.map(c => c.length).join(","));
});

test("a real failure with no audio is still reported", async () => {
  voice._useTts({ sampleRate: 1000, generateAsync: async () => { throw new Error("broken"); } });
  await assert.rejects(voice.speak("Hello there Jack.", () => {}), /broken/);
});
