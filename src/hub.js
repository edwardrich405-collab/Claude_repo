// Keeps Jack's connection secrets (encrypted) and the latest data pulled from each, and refreshes them on a timer.
const fs = require("fs"), path = require("path");
const C = require("./connectors");

module.exports = function hub(app, safeStorage, send, log) {
  const f = n => path.join(app.getPath("userData"), n);
  const enc = o => { const s = JSON.stringify(o); return safeStorage.isEncryptionAvailable() ? safeStorage.encryptString(s) : Buffer.from(s); };
  const dec = b => JSON.parse(safeStorage.isEncryptionAvailable() ? safeStorage.decryptString(b) : b.toString());
  let secrets = {}, ext = { mail: [], cal: [], money: [], jobs: [], seen: [], status: {}, scanned: "" };
  try { secrets = dec(fs.readFileSync(f("connections.bin"))); } catch (e) {}
  try { ext = { ...ext, ...JSON.parse(fs.readFileSync(f("external.json"), "utf8")) }; } catch (e) {}
  const persist = () => { try { fs.writeFileSync(f("external.json"), JSON.stringify(ext)); } catch (e) {} };
  const saveSecrets = () => { try { fs.writeFileSync(f("connections.bin"), enc(secrets)); } catch (e) {} };

  const view = () => ({ mail: ext.mail, cal: ext.cal, money: ext.money, jobs: ext.jobs, status: ext.status,
    on: { gmail: secrets.gmail ? secrets.gmail.a : "", gcal: !!secrets.gcal, ical: !!secrets.ical, stripe: !!secrets.stripe, paypal: !!secrets.paypal } });

  async function pull(name, prefs) {
    const s = secrets[name]; if (!s && name !== "jobs") return;
    try {
      if (name === "gmail") ext.mail = await C.gmail(s);
      else if (name === "gcal" || name === "ical") { const ev = await C.calendar(s, name); ext.cal = ext.cal.filter(e => e.src !== name).concat(ev); }
      else if (name === "stripe") ext.money = ext.money.filter(m => m.src !== "Stripe").concat(await C.stripe(s));
      else if (name === "paypal") ext.money = ext.money.filter(m => m.src !== "PayPal").concat(await C.paypal(s));
      else if (name === "jobs") {
        const list = await C.jobs((prefs && prefs.what) || ""), seen = new Set(ext.seen), first = !ext.scanned;
        const fresh = list.filter(x => !seen.has(x.id)).length;
        ext.jobs = list.map(x => ({ ...x, isNew: !seen.has(x.id) && !first })); list.forEach(x => seen.add(x.id)); ext.seen = [...seen].slice(-800);
        ext.scanned = new Date().toISOString();
        if (!first && fresh) send("ext:new-jobs", fresh);
      }
      ext.status[name] = "";
    } catch (err) { ext.status[name] = String(err.message || err).slice(0, 160); log("connect", name, err.message); }
  }

  let prefs = null, busy = false;
  async function refresh(p) {
    if (p) prefs = p; if (busy) return; busy = true;
    try { for (const n of ["gmail", "gcal", "ical", "stripe", "paypal"]) await pull(n); if (!prefs || prefs.scan !== false) await pull("jobs", prefs); }
    finally { busy = false; persist(); send("ext", view()); }
  }
  async function connect(name, val, p) {
    if (!val) { delete secrets[name]; saveSecrets(); if (name === "gmail") ext.mail = []; if (name === "gcal" || name === "ical") ext.cal = ext.cal.filter(e => e.src !== name); if (name === "stripe") ext.money = ext.money.filter(m => m.src !== "Stripe"); if (name === "paypal") ext.money = ext.money.filter(m => m.src !== "PayPal"); persist(); send("ext", view()); return { ok: true }; }
    const old = secrets[name]; secrets[name] = val; await pull(name, p);
    if (ext.status[name]) { const error = ext.status[name]; if (old) secrets[name] = old; else delete secrets[name]; ext.status[name] = ""; return { ok: false, error }; }
    saveSecrets(); persist(); send("ext", view()); return { ok: true };
  }
  setInterval(() => refresh(), 20 * 60 * 1000);
  return { view, refresh, connect };
};
