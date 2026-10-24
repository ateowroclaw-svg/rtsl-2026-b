# Builds site/index.html (Netlify, China-safe) from the Claude page (rtsl.html).
# Usage: python3 tools/port-from-claude.py <rtsl.html> <site/index.html>
# - swaps Google Fonts for the self-hosted fonts in site/fonts
# - adds the favicon
# - makes the data reloadable and appends the loader that reads data.json from the "data" branch deploy
import re, sys, base64, os

src_path, dst_path = sys.argv[1], sys.argv[2]
src = open(src_path, encoding="utf-8").read()
old = open(dst_path, encoding="utf-8").read()

# 1. head: keep the China-safe head (doctype, charset, base styles, self-hosted @font-face block)
i = old.index("<style>\n/* Fonts are served from this site")
head = old[: old.index("</style>", i) + len("</style>\n")]
if 'rel="icon"' not in head:
    head = head.replace("<title>", '<link rel="icon" type="image/png" href="favicon.png">\n<link rel="apple-touch-icon" href="favicon.png">\n<title>', 1)

# 2. body: the Claude page without its title / Google Fonts lines
body = src[src.index("<style>"):]
assert "fonts.googleapis" not in body and "fonts.gstatic" not in body

# 3. data that the loader replaces must be reassignable
body = body.replace("const UPDATED=", "let UPDATED=", 1).replace("const DIVS=[", "let DIVS=[", 1)

# 4. season clock and "updated" stamp become functions so they can be redrawn
clock_start = body.index("// season clock\n(function(){")
clock_end = body.index("})();", clock_start) + len("})();")
clock = body[clock_start:clock_end]
clock = clock.replace("// season clock\n(function(){", "// season clock\nfunction drawClock(){", 1)[: -len("})();")] + "}\ndrawClock();"
body = body[:clock_start] + clock + body[clock_end:]

stamp_start = body.index('(function(){let t;try{t=new Date(UPDATED)')
stamp_end = body.index("})();", stamp_start) + len("})();")
stamp = body[stamp_start:stamp_end]
stamp = "function stamp(){" + stamp[len("(function(){"): -len("})();")] + "}\nstamp();"
body = body[:stamp_start] + stamp + body[stamp_end:]

# 5. loader for the latest data
loader = r'''
// Latest data: an hourly job (GitHub Actions) publishes data.json to the free "data" branch deploy
// of this Netlify site (data--<site>.netlify.app). The page shows its built-in copy first, then swaps in data.json.
const DATA_URL=(()=>{const h=location.hostname;return /\.netlify\.app$/i.test(h)&&!/^data--/i.test(h)?`https://data--${h}/data.json`:"data.json";})();
(function loadLatest(){
  if(!/^https?:$/.test(location.protocol))return;
  const ctl=typeof AbortController==="function"?new AbortController():null;
  const timer=setTimeout(()=>{if(ctl)ctl.abort()},10000);
  fetch(DATA_URL+"?t="+Date.now(),{cache:"no-store",signal:ctl?ctl.signal:undefined})
    .then(r=>{if(!r.ok)throw new Error("HTTP "+r.status);return r.json()})
    .then(d=>{
      if(!d||!Array.isArray(d.divs)||!d.divs.length)return;
      if(d.updated&&UPDATED&&d.updated<=UPDATED)return;
      DIVS=d.divs;if(Array.isArray(d.res))RES=d.res;if(Array.isArray(d.lev))LEV=d.lev;
      if(d.matches&&typeof d.matches==="object")MATCHES=d.matches;
      if(d.updated)UPDATED=d.updated;
      PERF_ROWS=null;
      drawClock();render();stamp();
    })
    .catch(e=>console.warn("Latest data not loaded, showing the built-in copy:",e))
    .finally(()=>clearTimeout(timer));
})();
'''
last = body.rindex("</script>")
body = body[:last] + loader + body[last:]
if "</html>" not in body:
    body = body.rstrip() + "\n</body>\n</html>\n"

out = head + body
open(dst_path, "w", encoding="utf-8").write(out)

# favicon: the RTSL logo embedded in the page
m = re.search(r'<img src="data:image/png;base64,([A-Za-z0-9+/=]+)" alt="RTSL logo"', src)
if m:
    open(os.path.join(os.path.dirname(dst_path), "favicon.png"), "wb").write(base64.b64decode(m.group(1)))
print("written", dst_path, len(out), "bytes")
