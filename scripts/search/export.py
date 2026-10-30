"""writes mind/search/levels.js (400 levels) and mind/search/paper.js (the newspaper: one issue a day)
   python3 export.py        (after gen.py)
A word is kept as four digits: its first cell (row, column), its direction (see gen.py) and its length;
the word itself is read from the grid."""
import json, os
HERE = os.path.dirname(os.path.abspath(__file__)); OUT = os.path.join(HERE, "..", "..", "mind", "search")
TH = json.load(open(os.path.join(HERE, "themes.json"))); SAY = json.load(open(os.path.join(HERE, "sayings.json")))
L = json.load(open(os.path.join(HERE, "levels.json"))); I = json.load(open(os.path.join(HERE, "issues.json")))
ADS = [x.strip() for x in open(os.path.join(HERE, "ads.txt"), encoding="utf-8") if x.strip() and not x.startswith("#")]
D = [(0, -1), (1, 0), (1, -1), (1, 1), (0, 1), (-1, 0), (-1, 1), (-1, -1)]

def pack(x, extra=""):
    R, C, g = x["R"], x["C"], x["g"]
    ws = []
    for w, r, c, d in x["w"]:
        assert "".join(g[(r + D[d][0] * i) * C + c + D[d][1] * i] for i in range(len(w))) == w
        ws.append(f"{r}{c}{d}{len(w)}")
    return f"{R} {C} {x['t']}{extra}|{g}|{' '.join(ws)}"

os.makedirs(OUT, exist_ok=True)
js = ("/* دوّر الكلمة: 400 levels made by scripts/search. \"rows cols topic|letters, row by row|word word …\",\n"
      "   a word = row, column, direction (0 right-to-left, 1 down, 2 down-left, 3 down-right, 4 left-to-right, 5 up, 6 up-right, 7 up-left), length */\n"
      "self.WS_THEMES = " + json.dumps([[t["name"], t["clue"]] for t in TH], ensure_ascii=False, separators=(",", ":")) + ";\n"
      "self.WS_LEVELS = " + json.dumps([pack(x) for x in L], ensure_ascii=False, indent=0) + ";\n")
open(os.path.join(OUT, "levels.js"), "w", encoding="utf-8").write(js)
pj = ("/* دوّر الكلمة · 📰 الجريدة: one issue a day from WS_START (Saudi time). \"rows cols topic saying|letters|words\";\n"
      "   the letters no word uses, read like Arabic (row by row, right to left), spell the saying. */\n"
      "self.WS_START = \"2026-10-29\";\n"
      "self.WS_ISSUES = " + json.dumps([pack(x, " " + str(x["s"])) for x in I], ensure_ascii=False, indent=0) + ";\n"
      "self.WS_SAYINGS = " + json.dumps([[s["k"], s["t"]] for s in SAY], ensure_ascii=False, separators=(",", ":")) + ";\n"
      "self.WS_ADS = " + json.dumps(ADS, ensure_ascii=False, indent=0) + ";\n")
open(os.path.join(OUT, "paper.js"), "w", encoding="utf-8").write(pj)
print(len(L), "levels", len(js.encode()) // 1024, "KB ·", len(I), "issues", len(pj.encode()) // 1024, "KB")
