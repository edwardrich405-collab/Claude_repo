// Allie's thinking: Claude decides what to say and which app actions to take.
const Anthropic = require("@anthropic-ai/sdk");

const tool = (name, description, props = {}, required = []) => ({ name, description, input_schema: { type: "object", properties: props, required } });
const str = d => ({ type: "string", description: d }), num = d => ({ type: "number", description: d });
const TOOLS = [
  tool("open_panel", "Open one of the app's panels so Jack can see it. Returns a short rundown of what's in it. time is the work clock; editing is video editing; influencer is the AI influencer business.", { panel: { type: "string", enum: ["today", "mail", "calendar", "todo", "time", "calories", "editing", "influencer", "finances", "jobs", "settings", "overview", "clear"] } }, ["panel"]),
  tool("go_to", "Take Jack to a place in the app: home (the beach, where you two chat), life (the boat, My Life: today, calendar, to-do, calories, mail), studio (the lighthouse: video editing, AI influencer, clock, money, 3D jobs) journal (the bottle by the island) or craft (the workbench by the lighthouse, build mode, where his widgets live).", { place: { type: "string", enum: ["home", "life", "studio", "journal", "craft"] } }, ["place"]),
  tool("add_task", "Add a to-do. due is YYYY-MM-DD or empty. business: ugc for the AI influencer business, edit for video editing, jobs for the job search, me for personal.", { title: str("Task text"), due: str("Due date YYYY-MM-DD, or empty"), important: { type: "boolean" }, business: { type: "string", enum: ["ugc", "edit", "jobs", "me"] } }, ["title"]),
  tool("complete_task", "Mark a to-do as done by its id.", { id: num("Task id") }, ["id"]),
  tool("add_event", "Add a calendar event.", { what: str("Event title"), date: str("YYYY-MM-DD"), time: str("HH:MM, 24h") }, ["what", "date"]),
  tool("start_timer", "Start the work timer on a project (created if new).", { project: str("Project name") }, ["project"]),
  tool("stop_timer", "Stop the running work timer."),
  tool("log_food", "Log food eaten today.", { what: str("Food"), kcal: num("Calories"), protein: num("grams"), carbs: num("grams"), fat: num("grams") }, ["what", "kcal"]),
  tool("log_weight", "Log Jack's body weight in his chosen unit.", { weight: num("Weight") }, ["weight"]),
  tool("add_video", "Add a video editing job.", { title: str("Video title"), client: str("Client"), due: str("YYYY-MM-DD or empty") }, ["title"]),
  tool("set_video_stage", "Move a video to a stage: 0 Brief, 1 Editing, 2 Review, 3 Delivered.", { id: num("Video id"), stage: num("0-3") }, ["id", "stage"]),
  tool("add_money", "Record money in or out.", { what: str("Description"), amount: num("Positive for income, negative for spending") }, ["what", "amount"]),
  tool("update_milestone", "Set the current value of an AI influencer milestone.", { id: num("Milestone id"), current: num("New value") }, ["id", "current"]),
  tool("upsert_character", "Create or update an AI influencer character in the Businesses tab. stage: 0 Concept, 1 Dataset, 2 LoRA, 3 Producing.", { name: str("Character name"), role: str("Short tagline, like The Sideline Critic"), stage: num("0-3"), detail: str("One line of current status, e.g. 9 of 15 studio pictures") }, ["name"]),
  tool("upsert_workflow", "Create or update a ComfyUI workflow or tool in the Businesses tab.", { name: str("Workflow name"), status: { type: "string", enum: ["working", "built", "retired"], description: "working = proven, built = made but untested, retired = no longer used" }, detail: str("One short line") }, ["name", "status"]),
  tool("add_milestone", "Add an AI influencer milestone to track.", { name: str("Milestone, like Followers"), current: num("Value now"), target: num("Goal") }, ["name", "target"]),
  tool("log_progress", "Save a one-line progress note on the AI influencer business, shown in its Businesses tab.", { text: str("The note") }, ["text"]),
  tool("remove_food", "Remove food Jack logged. Give what to remove one item (matched by name), or leave it out to clear the whole day. date is YYYY-MM-DD; leave it out for today.", { what: str("Food name to remove, or empty to clear the day"), date: str("YYYY-MM-DD, or empty for today") }),
  tool("sleep", "Stop listening until Jack says 'Hey Allie'."),
];

const SYSTEM = `You are Allison ("Allie"), Jack's personal assistant, living in a desktop app on his Windows PC. Jack runs a video editing business and an AI influencer business, and he's looking for 3D animation work.
The app is a little world at sea: home is a beach, where Jack chats with you; My Life is a boat; his Studio is a lighthouse on an island; his journal is a bottle floating near it; a workbench by the lighthouse is build mode, where widgets he makes with Claude live. When he says "take me to" a place, use go_to.
You speak out loud, so talk like a chill, laid-back friend who happens to be on top of everything: relaxed, warm, a bit dry, never formal or salesy. Usually one or two short sentences, casual words and contractions ("yeah", "got it", "nice"), no lists, no markdown, no emoji, no URLs. Call him Jack only now and then.
Jack built this app and knows every tab and feature. Never explain what a tab is, what it's for, or how a feature works, and don't offer tips or list what you can do, unless he asks.
When you open a tab, the tool result tells you what's in it. Just give him the gist of what's there, the actual stuff (like "Two new ones, best is a Blender animator gig at Framestore"), or say it's quiet if there's nothing new. Don't announce that you opened it.
Use the tools to act on the app whenever he asks for something the app can do, then confirm in a few words ("Done." "Added it."). Never say something is done unless a tool did it and its result says so; if no tool can do it, say you can't do that yet. Use web search for news, facts or anything current. When Jack drops in a text note (usually a summary of his ComfyUI work on the AI influencer business), read it and file it in the Businesses tab: upsert each character and workflow it mentions, add milestones for numbers worth tracking (like credits left), log one or two progress lines, and add a to-do (business ugc) for each thing it says is waiting on Jack. Don't repeat items that already exist. Then recap in one or two sentences without reading out details.
If something isn't connected yet (Gmail, Google or Apple Calendar, Stripe, PayPal, job boards), just say it's not hooked up yet, without walking him through it.
When he says goodnight or tells you to sleep, use the sleep tool and say nothing more than "Night."`;

let client = null;
function setKey(key) { client = key ? new Anthropic({ apiKey: key }) : null; }

// Which brain answers: "claude" (needs the key) or "local": Bonsai 2 27B, a free model on this PC served by PrismML's
// llama.cpp build (Desktop\Allison-Setup\Bonsai-demo), OpenAI-style API with native tool calls, no web search.
const LOCAL = { url: "http://127.0.0.1:8080", model: "bonsai-2-27b", name: "Bonsai 2 27B",
  start: "C:\\Users\\jacks\\Desktop\\Allison-Setup\\Bonsai-demo\\scripts\\start_llama_server.ps1" };
let mode = "claude";
const setMode = m => { mode = m === "local" ? "local" : "claude"; };
const getMode = () => mode;
const ready = () => mode === "local" || !!client;

const history = [];
async function think(text, context, onAction) {
  if (mode === "local") return thinkLocal(text, context, onAction);
  if (!client) throw new Error("no key");
  history.push({ role: "user", content: text });
  while (history.length > 16) history.shift();
  while (history.length && history[0].role !== "user") history.shift();
  // Only the newest message carries the app's current state.
  const msgs = history.slice(0, -1).concat({ role: "user", content: `${text}\n\n<app_state>\n${context}\n</app_state>` });
  for (let turn = 0; turn < 6; turn++) {
    const r = await client.beta.messages.create({
      model: "claude-opus-5-5", max_tokens: 1024, system: SYSTEM, messages: msgs,
      tools: [...TOOLS, { type: "web_search_20260209", name: "web_search", max_uses: 3 }],
      output_config: { effort: "low" }, fallbacks: "default", betas: ["server-side-fallback-2026-07-01"],
    });
    if (r.stop_reason === "refusal") return finish("Sorry Jack, I can't help with that one.");
    msgs.push({ role: "assistant", content: r.content });
    const uses = r.content.filter(b => b.type === "tool_use");
    if (r.stop_reason === "pause_turn") continue;
    if (!uses.length) return finish(r.content.filter(b => b.type === "text").map(b => b.text).join(" ").trim());
    const results = [];
    for (const u of uses) {
      let out = "done";
      try { out = (await onAction(u.name, u.input)) || "done"; } catch (e) { out = "failed: " + e.message; }
      results.push({ type: "tool_result", tool_use_id: u.id, content: String(out) });
    }
    msgs.push({ role: "user", content: results });
  }
  return finish("Done.");

  function finish(say) {
    // Keep the conversation short: just what was asked and what she said.
    history.push({ role: "assistant", content: say || "Done." });
    return say || "Done.";
  }
}

// The same tools and personality, run by the local model through its OpenAI-style chat API.
const LOCAL_TOOLS = TOOLS.map(t => ({ type: "function", function: { name: t.name, description: t.description, parameters: t.input_schema } }));
async function thinkLocal(text, context, onAction, fetchFn = fetch) {
  history.push({ role: "user", content: text });
  while (history.length > 16) history.shift();
  while (history.length && history[0].role !== "user") history.shift();
  const msgs = [{ role: "system", content: SYSTEM + "\nAnswer general questions from what you know. You can't search the web right now, so only for live things (news, prices, weather, today's scores) say you can't check." }]
    .concat(history.slice(0, -1), { role: "user", content: `${text}\n\n<app_state>\n${context}\n</app_state>` });
  // Small models sometimes say "Done." without having done anything; with no tool used, that would be a lie.
  let acted = false;
  const say = s => { s = String(s || "").replace(/^[\s\S]*<\/think>/, "").replace(/<think>[\s\S]*$/, "").trim() || "Done.";
    if (!acted && /^(all )?(done|added|cleared|wiped|moved|updated|sorted|removed|deleted|changed|fixed)\b/i.test(s)) s = "I can't do that one yet, Jack.";
    history.push({ role: "assistant", content: s }); return s; };
  for (let turn = 0; turn < 6; turn++) {
    let res;
    try { res = await fetchFn(LOCAL.url + "/v1/chat/completions", { method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ model: LOCAL.model, messages: msgs, tools: LOCAL_TOOLS, stream: false, temperature: 0.7, max_tokens: 600 }) }); }
    catch (e) { throw new Error("local model offline: " + e.message); }
    if (!res.ok) throw new Error("local model offline: " + res.status + " " + (await res.text()).slice(0, 200));
    const j = await res.json(), m = (j.choices && j.choices[0] && j.choices[0].message) || j.message || {}, calls = m.tool_calls || [];
    msgs.push({ role: "assistant", content: m.content || "", tool_calls: calls.length ? calls : undefined });
    if (!calls.length) return say(m.content);
    for (const [i, c] of calls.entries()) {
      const f = c.function || {}; let args = f.arguments || {}, out = "done";
      if (typeof args === "string") { try { args = JSON.parse(args); } catch (e) { args = {}; } }
      try { out = (await onAction(f.name, args)) || "done"; acted = true; } catch (e) { out = "failed: " + e.message; }
      msgs.push({ role: "tool", tool_call_id: c.id || "call_" + turn + "_" + i, name: f.name, content: String(out) });
    }
  }
  return say("Done.");
}

module.exports = { setKey, ready, think, setMode, getMode, LOCAL, _thinkLocal: thinkLocal };
