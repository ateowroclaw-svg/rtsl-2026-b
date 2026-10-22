// Usage: node tools/build-data.mjs <siteDir> <outDir> <standings.csv> <results.csv|-> <levels.csv|-> <previous data.json|->
// Builds the "data" branch: a copy of the site whose index.html has the latest data built in, plus data.json.
// The "updated" time only moves when the league data really changed. Prints "changed ..." or "unchanged".
import fs from "node:fs";
import path from "node:path";

// ==== SHARED-PARSERS-START (same parsers as the Claude page's update script) ====
function parseCSV(t) {
  const rows = []; let row = [], f = "", q = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (q) { if (c === '"') { if (t[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
    else if (c === '"') q = true;
    else if (c === ",") { row.push(f); f = ""; }
    else if (c === "\n") { row.push(f); rows.push(row); row = []; f = ""; }
    else if (c !== "\r") f += c;
  }
  if (f || row.length) { row.push(f); rows.push(row); }
  return rows;
}

function parseStandings(csv) {
  const SIDE = { Stalin: "ussr", Khrushchev: "ussr", Brezhnev: "ussr", Andropov: "ussr", Gorbachev: "ussr",
    Truman: "usa", Eisenhower: "usa", JFK: "usa", JFKennedy: "usa", Kennedy: "usa", Nixon: "usa", Carter: "usa", Reagan: "usa" };
  const SHORT = { JFKennedy: "JFK", Kennedy: "JFK" };
  const DIV_RE = /Div\s*(\d)\s+([A-Za-zÀ-ž]+)/;
  const num = v => { const n = parseInt(String(v).trim(), 10); return Number.isFinite(n) ? n : null; };
  const rows = parseCSV(csv);
  const divs = [];
  let pending = null;
  for (let r = 0; r < rows.length; r++) {
    const row = rows[r];
    if ((row[1] || "").trim() !== "Flag") {
      const m = (row[2] || "").match(DIV_RE);
      if (m && num(row[3]) === null) pending = m;
      continue;
    }
    const m = row.join(" ").match(DIV_RE) || pending;
    if (!m) throw new Error("Division title not found for header at row " + r);
    pending = null;
    const name = SHORT[m[2]] || m[2];
    const idxEnd = row.findIndex((x, i) => i > 10 && /Name$/.test(x.trim()));
    const header = row.slice(11, idxEnd > 0 ? idxEnd : 22).map(x => x.trim());
    if (header.some(x => !x)) throw new Error("Blank name in header of " + name);
    const n = header.length;
    const s = [], mx = new Array(n).fill(null);
    for (let k = r + 1; k < rows.length; k++) {
      const d = rows[k];
      if ((d[1] || "").trim() === "Flag" || num(d[3]) === null || !(d[2] || "").trim()) break;
      s.push([d[2].trim(), num(d[3]), num(d[4]), num(d[5]) ?? 0, num(d[7]) ?? 0, (d[8] || "").trim()]);
      const rp = (d[10] || "").trim(), hi = header.indexOf(rp);
      if (hi >= 0) mx[hi] = header.map((op, j) => {
        const c = (d[11 + j] || "").trim();
        if (!c || j === hi) return ".";
        if (/^tie$/i.test(c)) return "T";
        return c === rp ? "W" : "L";
      }).join("");
    }
    if (s.length !== n) throw new Error(`${name}: ${s.length} standings rows for ${n} players`);
    mx.forEach((x, i) => { if (!x) mx[i] = ".".repeat(n); });
    divs.push({ tier: +m[1], name, side: SIDE[name] || SIDE[m[2]] || "usa", h: header, m: mx, s });
  }
  if (divs.length < 5) throw new Error("Only " + divs.length + " divisions parsed");
  return divs;
}

// Results rows: [isoDate, id, usaPlayer, ussrPlayer, winner ("USA"|"USSR"|"TIE"), turn, type, videoUrl]
function parseResults(csv) {
  const rows = parseCSV(csv);
  const hi = rows.findIndex(r => r.some(c => c.trim().toUpperCase() === "USSR") && r.some(c => c.trim().toUpperCase() === "USA"));
  if (hi < 0) throw new Error("Results header (USA/USSR columns) not found");
  const H = rows[hi].map(c => c.trim().toUpperCase());
  const col = (...names) => { for (const n of names) { const i = H.indexOf(n); if (i >= 0) return i; } return -1; };
  const cDate = col("TIME STAMP", "TIMESTAMP", "DATE"), cId = col("ID"), cUsa = col("USA"), cUssr = col("USSR"),
    cWin = col("WINNER"), cTurn = col("TURN"), cType = col("TYPE"), cVid = col("VIDEO"), cTie = col("TIE GAMES", "TIE");
  if ([cUsa, cUssr, cWin].some(i => i < 0)) throw new Error("Results columns USA/USSR/WINNER missing");
  const iso = v => { const m = String(v).match(/(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{4})/); return m ? `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}` : String(v).trim(); };
  const out = [], seen = new Set();
  for (const r of rows.slice(hi + 1)) {
    const usa = (r[cUsa] || "").trim(), ussr = (r[cUssr] || "").trim();
    if (!usa || !ussr) continue;
    let w = (r[cWin] || "").trim().toUpperCase();
    const tie = cTie >= 0 && (r[cTie] || "").trim() !== "";
    w = tie || /TIE|DRAW/.test(w) ? "TIE" : w === "USSR" ? "USSR" : w === "USA" ? "USA" : "";
    if (!w) continue;
    const vid = cVid >= 0 ? (r[cVid] || "").trim() : "";
    const key = [r[cDate], r[cId], usa, ussr, w].join("|");
    if (seen.has(key)) continue;
    seen.add(key);
    out.push([cDate >= 0 ? iso(r[cDate]) : "", cId >= 0 ? (r[cId] || "").trim() : "", usa, ussr, w,
      cTurn >= 0 ? (r[cTurn] || "").trim() : "", cType >= 0 ? (r[cType] || "").trim() : "", /^https?:\/\//.test(vid) ? vid : ""]);
  }
  return out;
}
// Level rows: [level, rank, statusLabel, name, W, L, T, gamesLeft, note]
function parseLevels(csv) {
  const rows = parseCSV(csv);
  const num = v => { const n = parseInt(String(v).trim(), 10); return Number.isFinite(n) ? n : null; };
  const out = []; let level = null;
  for (const r of rows) {
    const c = (r[2] || "").trim(), name = (r[4] || "").trim();
    const m = c.match(/Div\s*(\d)/);
    if (m) { level = +m[1]; continue; }
    if (!level || !name || name === "Player" || num(r[5]) === null) continue;
    out.push([level, num(r[1]), c, name, num(r[5]), num(r[6]) ?? 0, num(r[7]) ?? 0, num(r[9]) ?? 0, (r[10] || "").trim()]);
  }
  if (out.length < 20) throw new Error("Only " + out.length + " level rows parsed");
  return out;
}
// ==== SHARED-PARSERS-END ====

const [siteDir, outDir, stPath, resPath, levPath, prevPath] = process.argv.slice(2);
if (!siteDir || !outDir || !stPath) { console.error("usage: build-data.mjs <siteDir> <outDir> <standings.csv> <results.csv|-> <levels.csv|-> <prev.json|->"); process.exit(2); }
const readIf = p => (p && p !== "-" && fs.existsSync(p) && fs.statSync(p).size > 0) ? fs.readFileSync(p, "utf8") : null;

let prev = null;
try { const t = readIf(prevPath); if (t) prev = JSON.parse(t); } catch { prev = null; }

const divs = parseStandings(fs.readFileSync(stPath, "utf8"));
let res = null, lev = null;
try { const t = readIf(resPath); if (t) res = parseResults(t); } catch (e) { console.error("Results tab skipped: " + e.message); }
try { const t = readIf(levPath); if (t) lev = parseLevels(t); } catch (e) { console.error("Level Standings tab skipped: " + e.message); }
if (!res && prev && Array.isArray(prev.res)) res = prev.res;
if (!lev && prev && Array.isArray(prev.lev)) lev = prev.lev;

const data = { divs, res, lev };
const same = !!prev && JSON.stringify({ divs: prev.divs, res: prev.res ?? null, lev: prev.lev ?? null }) === JSON.stringify(data);
const updated = same && prev.updated ? prev.updated : new Date().toISOString();

fs.rmSync(outDir, { recursive: true, force: true });
fs.cpSync(siteDir, outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, "data.json"), JSON.stringify({ updated, ...data }));

const fmt = d => `{tier:${d.tier},name:${JSON.stringify(d.name)},side:"${d.side}",\n h:${JSON.stringify(d.h)},\n m:${JSON.stringify(d.m)},\n s:${JSON.stringify(d.s)}}`;
const rows = a => a ? "[\n" + a.map(r => JSON.stringify(r)).join(",\n") + "\n]" : "null";
const block = `/*DATA-START*/\nlet UPDATED="${updated}";\nlet DIVS=[\n${divs.map(fmt).join(",\n")}\n];\nlet RES=${rows(res)};\nlet LEV=${rows(lev)};\n`;
const idx = path.join(outDir, "index.html");
const html = fs.readFileSync(idx, "utf8");
const a = html.indexOf("/*DATA-START*/"), b = html.indexOf("/*DATA-END*/");
if (a < 0 || b < 0) throw new Error("DATA markers missing in " + idx);
fs.writeFileSync(idx, html.slice(0, a) + block + html.slice(b));

// The data branch is published from its root, and data.json may be read by the main site.
fs.writeFileSync(path.join(outDir, "netlify.toml"), '[build]\n  publish = "."\n  command = ""\n');
fs.appendFileSync(path.join(outDir, "_headers"), "\n/data.json\n  Access-Control-Allow-Origin: *\n  Cache-Control: no-cache\n");

const players = divs.reduce((x, d) => x + d.s.length, 0);
console.log(same ? "unchanged" : `changed: ${divs.length} divisions, ${players} players, ${res ? res.length : 0} results, ${lev ? lev.length : 0} level rows`);
