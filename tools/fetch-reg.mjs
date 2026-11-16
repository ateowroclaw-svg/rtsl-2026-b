// Reads the registered players of the next RTSL edition from its tournament page on twilight-struggle.com.
// The page is rendered in the browser, so it is opened in headless Chromium (Playwright) and only read.
// Usage: node tools/fetch-reg.mjs <out reg.json> [tournament url]
import fs from "fs";
import { chromium } from "playwright";
const [out, url = "https://twilight-struggle.com/tournaments/368"] = process.argv.slice(2);
const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  await page.goto(url, { waitUntil: "networkidle", timeout: 60000 });
  await page.waitForSelector('main a[href^="/userprofile/"]', { timeout: 30000 });
  await page.waitForTimeout(2000);
  const r = await page.evaluate(() => {
    const seen = new Set(), players = [];
    document.querySelectorAll('main a[href^="/userprofile/"]').forEach(a => {
      const id = a.getAttribute("href").split("/").pop(), n = a.innerText.trim();
      if (n && !seen.has(id)) { seen.add(id); players.push([n, id]); }
    });
    const m = (document.querySelector("main")?.innerText || "").match(/(\d+)\s+total/);
    return { total: m ? +m[1] : null, players };
  });
  if (!r.players.length || (r.total != null && Math.abs(r.players.length - r.total) > 1))
    throw new Error(`list looks wrong: ${r.players.length} players, page says ${r.total}`);
  fs.writeFileSync(out, JSON.stringify(r.players));
  console.log(`registered: ${r.players.length}`);
} finally { await browser.close(); }
