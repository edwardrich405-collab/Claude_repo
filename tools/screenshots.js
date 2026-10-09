// Screenshots of the screen for design checks, in dark and light and in a small window.
// Run: npx electron tools/screenshots.js [outDir]. It loads the page without Jack's data (preview mode) in a hidden window.
const { app, BrowserWindow } = require("electron");
const fs = require("fs"), path = require("path");

const out = path.resolve(process.argv[2] || path.join(__dirname, "..", "shots"));
app.setPath("userData", path.join(app.getPath("temp"), "allison-shots"));
const wait = ms => new Promise(r => setTimeout(r, ms));
const SHOTS = [
  { name: "home", w: 1440, h: 900, run: "" },
  { name: "today", w: 1440, h: 900, run: `document.querySelector('[data-cmd="today"]').click()` },
  { name: "todo", w: 1440, h: 900, run: `document.querySelector('[data-cmd="todo"]').click()` },
  { name: "settings", w: 1440, h: 900, run: `document.querySelector('[data-cmd="settings"]').click()` },
  { name: "overview", w: 1440, h: 900, run: `for (const k of ["calories","businesses","jobs"]) document.querySelector('[data-cmd="'+k+'"]').click()`, after: `document.querySelector('[data-cmd="today"]').click()` },
  { name: "small-todo", w: 900, h: 600, run: `document.querySelector('[data-cmd="todo"]').click()` },
];

app.whenReady().then(async () => {
  fs.mkdirSync(out, { recursive: true });
  const win = new BrowserWindow({ width: 1440, height: 900, show: false, useContentSize: true,
    webPreferences: { offscreen: true, backgroundThrottling: false } });
  win.webContents.setFrameRate(60);
  for (const theme of ["dark", "light"]) for (const s of SHOTS) {
    win.setContentSize(s.w, s.h);
    for (let tries = 0; ; tries++) {
      try { await win.loadFile(path.join(__dirname, "..", "renderer", "index.html")); break; }
      catch (e) { if (tries > 2) throw e; await wait(500); }
    }
    await win.webContents.executeJavaScript(`document.documentElement.dataset.theme = ${JSON.stringify(theme)}; document.querySelector("#theme") && (document.documentElement.dataset.theme === "${theme}"); 0`);
    await wait(800);
    if (s.run) await win.webContents.executeJavaScript(s.run + "; 0");
    await wait(2600);
    if (s.after) { await win.webContents.executeJavaScript(s.after + "; 0"); await wait(2600); }
    const img = await win.webContents.capturePage();
    fs.writeFileSync(path.join(out, `${s.name}-${theme}.png`), img.toPNG());
  }
  console.log("saved to", out);
  app.quit();
});
