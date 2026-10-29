"""Put a fresh version stamp on the site's own .js/.css links (…app.js?v=STAMP) so phones never keep
running an old copy. Run before each deploy:  python3 scripts/stamp.py"""
import pathlib, re, time
ROOT = pathlib.Path(__file__).resolve().parent.parent
PAGES = ["index.html", "seenjeem/index.html", "outside/index.html", "sedq/index.html", "mf/index.html", "draw/index.html", "dafour/index.html", "tv/index.html", "pick/index.html", "case/index.html", "mind/index.html", "mind/lamha/index.html", "mind/dots/index.html", "mind/squares/index.html", "mind/words/index.html"]
STAMP = time.strftime("%Y%m%d%H%M")
pat = re.compile(r'((?:src|href)="(?!https?:)[^"?#]+\.(?:js|css))(?:\?v=\w+)?"')
for p in PAGES:
    f = ROOT / p
    s = f.read_text(encoding="utf-8")
    n = pat.sub(lambda m: m.group(1) + "?v=" + STAMP + '"', s)
    if n != s: f.write_text(n, encoding="utf-8"); print("stamped", p)
