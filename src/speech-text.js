// Turning a written reply into something that sounds natural out loud, then into sentence-sized pieces.
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const nth = n => n + (n % 100 >= 11 && n % 100 <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] || "th");
// Short all-caps words she should say as a word, not letter by letter.
const SAY_AS_WORD = new Set(["OK", "NASA", "ASAP", "FAQ", "LOL", "PIN", "GIF", "JPEG", "SIM", "NATO", "UNESCO", "UK", "US", "USA"]);
const SPELLED = { "OK": "okay", "UK": "U K", "US": "U S", "USA": "U S A", "ASAP": "A sap", "FAQ": "F A Q", "GIF": "gif", "JPEG": "jay peg", "LOL": "L O L" };
const CURRENCY = { "$": ["dollar", "dollars", "cent", "cents"], "£": ["pound", "pounds", "p", "p"], "€": ["euro", "euros", "cent", "cents"] };

function money(sym, whole, frac, suffix) {
  const [one, many, c1, cN] = CURRENCY[sym], n = +whole.replace(/,/g, "");
  const big = suffix ? { k: " thousand", m: " million", b: " billion" }[suffix.toLowerCase()] : "";
  if (big) return `${whole.replace(/,/g, "")}${frac ? "." + frac : ""}${big} ${many}`;
  const unit = n === 1 ? one : many;
  if (!frac || /^0+$/.test(frac)) return `${n} ${unit}`;
  if (n === 0) return `${+frac.padEnd(2, "0").slice(0, 2)} ${+frac === 1 ? c1 : cN}`;
  return `${n} ${unit} ${frac.padEnd(2, "0").slice(0, 2)}`;
}

function clean(text) {
  let t = String(text || "");
  t = t.replace(/```[\s\S]*?```/g, " ").replace(/`([^`]*)`/g, "$1")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ").replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/https?:\/\/\S+|www\.\S+/g, "the link")
    .replace(/^\s{0,3}(#{1,6}\s+|>\s?|[-*+]\s+|\d+[.)]\s+)/gm, "")
    .replace(/(\*\*|__|\*|_|~~)(\S(?:[\s\S]*?\S)?)\1/g, "$2")
    .replace(/[\p{Extended_Pictographic}\u{1F1E6}-\u{1F1FF}\u{FE0F}\u{200D}]/gu, "");
  // Dates first, so their dashes aren't read as ranges.
  t = t.replace(/\b(20\d\d)-(\d\d)-(\d\d)\b/g, (m, y, mo, d) => `${MONTHS[+mo - 1] || mo} ${nth(+d)}`);
  // Money, percentages, symbols.
  t = t.replace(/([$£€])\s?(\d[\d,]*)(?:\.(\d+))?(?:\s?([kKmMbB])\b)?/g, (m, s, w, f, k) => money(s, w, f, k));
  t = t.replace(/(\d)\s?%/g, "$1 percent").replace(/\s&\s/g, " and ").replace(/(\d)\s?[-–]\s?(\d)/g, "$1 to $2")
    .replace(/\s[–—]\s|\s-\s/g, ", ").replace(/[–—]/g, ", ").replace(/\s\/\s/g, " or ").replace(/\+(\d)/g, "plus $1");
  // Times.
  t = t.replace(/\b(\d{1,2}):(\d\d)\s?([ap])\.?m\.?\b/gi, (m, h, mi, ap) => `${+h}${mi === "00" ? "" : " " + mi} ${ap.toUpperCase()} M`)
    .replace(/\b(\d{1,2})\s?([ap])\.?m\.?\b/gi, (m, h, ap) => `${+h} ${ap.toUpperCase()} M`);
  t = t.replace(/(\d),(\d{3})\b/g, "$1$2").replace(/(\d),(\d{3})\b/g, "$1$2");
  // Common abbreviations.
  t = t.replace(/\be\.g\.,?/gi, "for example,").replace(/\bi\.e\.,?/gi, "that is,").replace(/\betc\./gi, "and so on.")
    .replace(/\bvs\.?(?=\s)/gi, "versus").replace(/\bapprox\.?(?=\s)/gi, "about").replace(/\bmins?\b/g, "minutes").replace(/\bhrs?\b/g, "hours")
    .replace(/\bkcal\b/gi, "calories").replace(/\bComfyUI\b/g, "Comfy U I").replace(/\b(\d+)[dD]\b/g, "$1 D");
  // Acronyms read letter by letter (AI, UGC, API), unless they're said as a word.
  t = t.replace(/\b[A-Z]{2,5}s?\b/g, w => {
    const plural = /[A-Z]s$/.test(w) && w.length > 2, base = plural ? w.slice(0, -1) : w;
    if (SPELLED[base]) return SPELLED[base] + (plural ? "s" : "");
    if (SAY_AS_WORD.has(base)) return w;
    return base.split("").join(" ") + (plural ? "s" : "");
  });
  return t.replace(/[*_#<>|~^\\{}[\]]/g, " ").replace(/\s*\n+\s*/g, ". ").replace(/\.\s*\./g, ".").replace(/\s{2,}/g, " ").replace(/\s+([,.!?])/g, "$1").trim();
}

// Split at sentence ends (not after Mr., Dr., St., or inside numbers), and fold tiny pieces into their neighbour.
function sentences(text) {
  const parts = [], re = /[\s\S]+?(?:[.!?]+["')\]]*(?=\s|$)|$)/g;
  let buf = "";
  for (const m of String(text).match(re) || []) {
    buf += m;
    if (/\b(Mr|Mrs|Ms|Dr|St|No|vs)\.$/i.test(buf.trim())) continue;
    if (buf.trim()) parts.push(buf.trim());
    buf = "";
  }
  if (buf.trim()) parts.push(buf.trim());
  const out = [];
  for (const p of parts) {
    if (out.length && (out[out.length - 1].length < 12 || p.length < 4)) out[out.length - 1] += " " + p;
    else out.push(p);
  }
  return out;
}

// Pause after a piece, by how it ends: a beat after a question or statement, shorter otherwise.
const pauseAfter = s => /[?!]["')\]]*$/.test(s) ? 0.28 : /\.["')\]]*$/.test(s) ? 0.24 : 0.12;

// Cut the near-silence the model puts at the start and end of each clip, keeping a few ms so words don't clip.
function trim(samples, rate, threshold = 0.006, keepMs = 18) {
  let a = 0, z = samples.length - 1;
  while (a < samples.length && Math.abs(samples[a]) < threshold) a++;
  while (z > a && Math.abs(samples[z]) < threshold) z--;
  if (a >= z) return new Float32Array(0);
  const keep = Math.round(rate * keepMs / 1000);
  const out = samples.slice(Math.max(0, a - keep), Math.min(samples.length, z + keep + 1));
  // Short fades so the cut never clicks.
  const fade = Math.min(Math.round(rate * 0.004), out.length >> 1);
  for (let i = 0; i < fade; i++) { const g = i / fade; out[i] *= g; out[out.length - 1 - i] *= g; }
  return out;
}

module.exports = { clean, sentences, pauseAfter, trim };
