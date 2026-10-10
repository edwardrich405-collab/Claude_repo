const { app, BrowserWindow, ipcMain, session, safeStorage, shell } = require("electron");
const fs = require("fs"), path = require("path");
const makeHub = require("./hub"), models = require("./models"), voice = require("./voice"), brain = require("./brain");

app.setAppUserModelId("com.jack.allison");
if (!app.requestSingleInstanceLock()) app.quit();

let win = null;
// A plain log in %APPDATA%\Allison\allison.log, for when something doesn't start.
const logLine = (...a) => { try { fs.appendFileSync(path.join(app.getPath("userData"), "allison.log"), new Date().toISOString() + " " + a.map(String).join(" ") + "\n"); } catch (e) {} };
const _err = console.error; console.error = (...a) => { logLine(...a); _err(...a); };
process.on("uncaughtException", e => console.error("uncaught", e && e.stack || e));
logLine("main loaded", process.versions.electron);
const file = n => path.join(app.getPath("userData"), n);
const send = (ch, v) => { if (win && !win.isDestroyed()) win.webContents.send(ch, v); };

// Jack's data and settings live as plain JSON in %APPDATA%\Allison.
ipcMain.on("data:load", e => { try { e.returnValue = fs.readFileSync(file("data.json"), "utf8"); } catch (err) { e.returnValue = null; } });
ipcMain.on("data:save", (e, json) => {
  const f = file("data.json"), tmp = f + ".tmp";
  try { fs.writeFileSync(tmp, json); fs.renameSync(tmp, f); } catch (err) { console.error(err); }
});

let hub = null;
ipcMain.on("conn:view", e => { e.returnValue = hub ? hub.view() : null; });
ipcMain.handle("conn:set", (e, { name, val, prefs }) => hub.connect(name, val, prefs).catch(err => ({ ok: false, error: String(err.message || err).slice(0, 160) })));
ipcMain.on("conn:refresh", (e, prefs) => hub && hub.refresh(prefs));

// The Claude key is encrypted with Windows' own account protection before it touches disk.
function loadKey() {
  try { const b = fs.readFileSync(file("key.bin")); return safeStorage.isEncryptionAvailable() ? safeStorage.decryptString(b) : b.toString(); } catch (e) { return ""; }
}
ipcMain.handle("key:set", (e, key) => {
  key = (key || "").trim();
  if (!key) { fs.rmSync(file("key.bin"), { force: true }); brain.setKey(""); return false; }
  fs.writeFileSync(file("key.bin"), safeStorage.isEncryptionAvailable() ? safeStorage.encryptString(key) : Buffer.from(key));
  brain.setKey(key); return true;
});
ipcMain.on("key:has", e => { e.returnValue = brain.ready(); });
// Claude or the local model; the choice is kept in brain.json next to Jack's data.
ipcMain.on("brain:mode", e => { e.returnValue = brain.getMode(); });
ipcMain.on("brain:setMode", (e, m) => { brain.setMode(m); try { fs.writeFileSync(file("brain.json"), JSON.stringify({ mode: brain.getMode() })); } catch (err) {} logLine("brain", brain.getMode()); e.returnValue = brain.getMode(); });

// Thinking: actions Claude picks are carried out by the window, which reports back.
let actSeq = 0; const pending = new Map();
ipcMain.on("act:done", (e, { id, result }) => { const r = pending.get(id); if (r) { pending.delete(id); r(result); } });
ipcMain.handle("brain:think", async (e, { text, context }) => {
  try {
    const say = await brain.think(text, context, (name, input) => new Promise(res => {
      const id = ++actSeq; pending.set(id, res); send("act", { id, name, input });
      setTimeout(() => { if (pending.delete(id)) res("done"); }, 4000);
    }));
    return { say };
  } catch (err) {
    const m = String(err && err.message || err);
    return { error: /local model offline/.test(m) ? "local" : /401|authentication|api.key/i.test(m) ? "key" : /ENOTFOUND|ECONN|fetch failed|network/i.test(m) ? "offline" : "other", detail: m.slice(0, 300) };
  }
});

// Voice: live speech streams to the window sentence by sentence; the microphone streams back.
ipcMain.handle("tts:speak", async (e, { id, text }) => {
  try { const done = await voice.speak(text, samples => send("tts:chunk", { id, samples, rate: voice.sampleRate() })); return { ok: done }; }
  catch (err) { logLine("speak failed", err.message || err); return { ok: false, error: String(err.message || err) }; }
});
ipcMain.on("tts:cancel", () => voice.cancel());
ipcMain.on("tts:has", e => { e.returnValue = voice.hasTts(); });
ipcMain.on("asr:has", e => { e.returnValue = voice.hasAsr(); });
ipcMain.on("mic:pcm", (e, buf) => voice.hear(new Float32Array(buf), r => send("mic:heard", r)));
ipcMain.on("mic:reset", () => voice.resetEars());
// Models the screen needs (the boat), read from renderer/models. Only plain file names, nothing outside that folder.
ipcMain.handle("asset:read", (e, name) => {
  if (!/^[a-z0-9_-]+\.glb$/i.test(String(name))) throw new Error("bad asset name");
  return fs.readFileSync(path.join(__dirname, "..", "renderer", "models", name));
});
ipcMain.on("open:url", (e, url) => { if (/^https:\/\//.test(url)) shell.openExternal(url); });
ipcMain.on("theme", (e, t) => { if (win && process.platform === "win32") win.setTitleBarOverlay({ color: "#00000000", symbolColor: t === "light" ? "#1d1d1f" : "#f5f5f7", height: 40 }); });

// Text notes dropped in Documents\Allison\Inbox are read once, then moved into a Done folder.
const inboxDir = () => path.join(app.getPath("documents"), "Allison", "Inbox");
ipcMain.on("inbox:open", () => { fs.mkdirSync(inboxDir(), { recursive: true }); shell.openPath(inboxDir()); });
ipcMain.on("inbox:path", e => { e.returnValue = inboxDir(); });
function watchInbox() {
  const dir = inboxDir(), done = path.join(dir, "Done"); fs.mkdirSync(done, { recursive: true });
  const scan = () => {
    try {
      for (const n of fs.readdirSync(dir)) {
        if (!/\.(txt|md|json|log)$/i.test(n)) continue;
        const f = path.join(dir, n), st = fs.statSync(f); if (!st.isFile() || Date.now() - st.mtimeMs < 1500) continue;
        const text = fs.readFileSync(f, "utf8").slice(0, 20000); fs.renameSync(f, path.join(done, Date.now() + "-" + n));
        if (text.trim()) send("inbox", { name: n, text });
      }
    } catch (e) { logLine("inbox", e.message); }
  };
  scan(); setInterval(scan, 5000);
}

async function startVoice() {
  const p = models.paths(app), prog = s => send("setup", s);
  logLine("starting voice", p.dl);
  try { await models.fetchPack(app, "asr", prog); voice.loadAsr(p); logLine("ears ready"); send("setup", { stage: "ears" }); }
  catch (err) { console.error("asr", err); send("setup", { stage: "error", what: "ears", detail: String(err.message) }); }
  try {
    await models.fetchPack(app, "kokoro", prog);
    try { if (await models.fetchUsLexicon(app)) logLine("downloaded US pronunciations"); } catch (err) { logLine("US pronunciations not downloaded, using British", err.message); }
    logLine("voice ready", voice.loadTts(p)); send("setup", { stage: "voice" });
  }
  catch (err) { console.error("tts", err); send("setup", { stage: "error", what: "voice", detail: String(err.message) }); }
}

// Running from the project folder: screen changes reload in place, main-process changes offer a restart.
function watchOwnFiles() {
  const root = path.join(__dirname, ".."); let tR = 0, tS = 0;
  const watch = (dir, fn) => { try { fs.watch(dir, { recursive: true }, (ev, f) => { if (f && !/\.(tmp|swp)$|~$/.test(f)) fn(f); }); } catch (e) { logLine("watch", dir, e.message); } };
  watch(path.join(root, "renderer"), () => { clearTimeout(tR); tR = setTimeout(() => { logLine("screen changed, reloading"); win && win.webContents.reloadIgnoringCache(); }, 400); });
  // Windows also reports a file being read (its last-access time), so only a real change in modified time counts.
  const src = path.join(root, "src"), stamp = f => { try { return fs.statSync(path.join(src, f)).mtimeMs; } catch (e) { return -1; } }, seen = {};
  try { for (const f of fs.readdirSync(src)) seen[f] = stamp(f); } catch (e) {}
  watch(src, f => { const m = stamp(f); if (seen[f] === m) return; seen[f] = m;
    clearTimeout(tS); tS = setTimeout(() => { logLine("app code changed", f); send("setup", { stage: "restart", file: f }); }, 600); });
}
ipcMain.on("app:restart", () => { app.relaunch(); app.exit(0); });

function createWindow() {
  win = new BrowserWindow({
    width: 1440, height: 900, minWidth: 900, minHeight: 600, backgroundColor: "#07070a", show: false,
    title: "Allison", icon: path.join(__dirname, "..", "build", "icon.png"),
    titleBarStyle: "hidden", titleBarOverlay: { color: "#00000000", symbolColor: "#f5f5f7", height: 40 },
    webPreferences: { preload: path.join(__dirname, "preload.js"), contextIsolation: true, sandbox: false, backgroundThrottling: false },
  });
  win.once("ready-to-show", () => { win.maximize(); win.show(); });
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https:\/\//.test(url)) shell.openExternal(url); return { action: "deny" }; });
  win.loadFile(path.join(__dirname, "..", "renderer", "index.html"));
  win.webContents.once("did-finish-load", () => { startVoice(); setTimeout(watchInbox, 3000); });
  if (!app.isPackaged) watchOwnFiles();
  win.webContents.on("render-process-gone", (e, d) => logLine("renderer gone", d.reason));
}

app.on("second-instance", () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
app.whenReady().then(() => {
  session.defaultSession.setPermissionRequestHandler((wc, perm, cb) => cb(perm === "media"));
  session.defaultSession.setPermissionCheckHandler((wc, perm) => perm === "media");
  brain.setKey(loadKey());
  try { brain.setMode(JSON.parse(fs.readFileSync(file("brain.json"), "utf8")).mode); } catch (e) {}
  hub = makeHub(app, safeStorage, send, logLine);
  createWindow();
});
app.on("window-all-closed", () => app.quit());
