// The local brain talks to Ollama, carries out tool calls, and reports when Ollama isn't running.
const test = require("node:test"), assert = require("node:assert");
const brain = require("../src/brain");

test("local brain runs a tool, then answers", async () => {
  const sent = [], replies = [
    { message: { content: "", tool_calls: [{ function: { name: "add_task", arguments: { title: "Call Sam" } } }] } },
    { message: { content: "<think></think>Added it." } },
  ];
  const fakeFetch = async (url, o) => { sent.push(JSON.parse(o.body)); return { ok: true, json: async () => replies.shift() }; };
  const acts = [];
  const say = await brain._thinkLocal("remind me to call Sam", "state", async (n, i) => { acts.push([n, i.title]); return "added #1"; }, fakeFetch);
  assert.strictEqual(say, "Added it.");
  assert.deepStrictEqual(acts, [["add_task", "Call Sam"]]);
  assert.strictEqual(sent[0].think, false);
  assert.ok(sent[0].tools.some(t => t.function.name === "open_panel"));
  assert.strictEqual(sent[1].messages.at(-1).role, "tool");
});

test("local brain says when Ollama is off", async () => {
  await assert.rejects(brain._thinkLocal("hi", "", async () => {}, async () => { throw new Error("ECONNREFUSED"); }), /local model offline/);
});

test("mode switch", () => {
  brain.setMode("local"); assert.strictEqual(brain.getMode(), "local"); assert.ok(brain.ready());
  brain.setMode("nonsense"); assert.strictEqual(brain.getMode(), "claude");
});
