// Allie's connections to Jack's own accounts. Each one is read-only and uses a key or link he creates himself.
const { ImapFlow } = require("imapflow");
const ical = require("node-ical");

const day = d => { const x = new Date(d); return x.getFullYear() + "-" + String(x.getMonth() + 1).padStart(2, "0") + "-" + String(x.getDate()).padStart(2, "0"); };
const hm = d => { const x = new Date(d); return String(x.getHours()).padStart(2, "0") + ":" + String(x.getMinutes()).padStart(2, "0"); };
const j = async (url, opt) => { const r = await fetch(url, opt); if (!r.ok) throw new Error(url.split("/")[2] + " said " + r.status); return r.json(); };

// Gmail through IMAP with an app password (Google Account > Security > App passwords).
async function gmail({ a: user, b: pass }) {
  const c = new ImapFlow({ host: "imap.gmail.com", port: 993, secure: true, auth: { user, pass: pass.replace(/\s+/g, "") }, logger: false });
  c.on("error", () => {});
  await c.connect();
  try {
    const lock = await c.getMailboxLock("INBOX"), out = [];
    try {
      const n = c.mailbox.exists;
      if (n) for await (const m of c.fetch(`${Math.max(1, n - 24)}:*`, { envelope: true, flags: true, internalDate: true })) {
        const f = (m.envelope.from || [])[0] || {};
        out.push({ id: "m" + m.uid, from: f.name || f.address || "Unknown", addr: f.address || "", subject: m.envelope.subject || "(no subject)", at: +new Date(m.internalDate), unread: !m.flags.has("\\Seen") });
      }
    } finally { lock.release(); }
    return out.sort((x, y) => y.at - x.at);
  } finally { await c.logout().catch(() => {}); }
}

// Google Calendar ("Secret address in iCal format") and Apple Calendar (a public calendar link) both come as .ics feeds.
async function calendar(url, src) {
  const r = await fetch(url.trim().replace(/^webcal:/i, "https:")); if (!r.ok) throw new Error("Calendar link said " + r.status);
  const data = await ical.async.parseICS(await r.text()), from = Date.now() - 864e5, to = Date.now() + 75 * 864e5, out = [];
  for (const k in data) {
    const e = data[k]; if (e.type !== "VEVENT" || !e.start) continue;
    const starts = e.rrule ? e.rrule.between(new Date(from), new Date(to), true) : [new Date(e.start)];
    for (const s of starts) {
      if (+s < from || +s > to) continue;
      const allDay = e.datetype === "date" || (e.start.dateOnly);
      out.push({ id: src + k + (+s), d: day(s), t: allDay ? "00:00" : hm(s), what: String(e.summary && e.summary.val || e.summary || "Event"), src, allDay: !!allDay });
    }
  }
  return out;
}

// Stripe with a restricted key that can only read charges.
async function stripe(key) {
  const d = await j("https://api.stripe.com/v1/charges?limit=100", { headers: { Authorization: "Bearer " + key.trim() } });
  return d.data.filter(c => c.paid && !c.refunded).map(c => ({ id: "st" + c.id, what: c.description || (c.billing_details && c.billing_details.name) || "Stripe payment", amt: (c.amount - c.amount_refunded) / 100, d: day(c.created * 1000), src: "Stripe" }));
}

// PayPal with a Live REST app (client id and secret from developer.paypal.com).
async function paypal({ a: id, b: secret }) {
  const tk = await j("https://api-m.paypal.com/v1/oauth2/token", { method: "POST", headers: { Authorization: "Basic " + Buffer.from(id.trim() + ":" + secret.trim()).toString("base64"), "Content-Type": "application/x-www-form-urlencoded" }, body: "grant_type=client_credentials" });
  const end = new Date(), start = new Date(Date.now() - 30 * 864e5);
  const d = await j(`https://api-m.paypal.com/v1/reporting/transactions?start_date=${start.toISOString().split(".")[0]}-0000&end_date=${end.toISOString().split(".")[0]}-0000&fields=all&page_size=100`, { headers: { Authorization: "Bearer " + tk.access_token } });
  return (d.transaction_details || []).map(t => { const i = t.transaction_info, p = t.payer_info || {};
    return { id: "pp" + i.transaction_id, what: i.transaction_subject || i.transaction_note || (p.payer_name && p.payer_name.alternate_full_name) || "PayPal", amt: +i.transaction_amount.value, d: day(i.transaction_initiation_date), src: "PayPal" }; }).filter(x => x.amt);
}

// Fresh 3D animation postings from the boards that publish open feeds. LinkedIn blocks automated reading, so it isn't included.
async function jobs(what) {
  const words = what.toLowerCase().split(/[,;\n]+/).map(s => s.trim()).filter(Boolean);
  const hit = t => !words.length || words.some(w => t.toLowerCase().includes(w.split(" ")[0])) ;
  const UA = { "User-Agent": "Allison/0.1 (personal job alerts)" }, all = [];
  const tries = [
    j("https://remotive.com/api/remote-jobs?search=animator", { headers: UA }).then(d => d.jobs.forEach(x => all.push({ id: "rm" + x.id, title: x.title, company: x.company_name, loc: x.candidate_required_location, url: x.url, at: +new Date(x.publication_date), src: "Remotive" }))),
    j("https://remoteok.com/api", { headers: UA }).then(d => d.filter(x => x.id).forEach(x => all.push({ id: "ro" + x.id, title: x.position, company: x.company, loc: x.location || "Remote", url: x.url, at: +new Date(x.date), src: "RemoteOK", tags: (x.tags || []).join(" ") }))),
    j("https://jobicy.com/api/v2/remote-jobs?count=50&tag=animation", { headers: UA }).then(d => (d.jobs || []).forEach(x => all.push({ id: "jb" + x.id, title: x.jobTitle, company: x.companyName, loc: x.jobGeo, url: x.url, at: +new Date(x.pubDate), src: "Jobicy" }))),
  ];
  const r = await Promise.allSettled(tries);
  if (r.every(x => x.status === "rejected")) throw new Error("Couldn't reach the job boards");
  const must = /anim|3d|blender|maya|motion|rigg|vfx|character|cgi|unreal|houdini/i;
  return all.filter(x => must.test(x.title + " " + (x.tags || "")) && hit(x.title + " " + (x.tags || ""))).sort((a, b) => b.at - a.at).slice(0, 60);
}

module.exports = { gmail, calendar, stripe, paypal, jobs };
