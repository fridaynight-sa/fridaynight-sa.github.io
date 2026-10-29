# writes mind/words/levels.js
#   python3 export.py <levels json> <out js> [folder with grid_words.json bonus_extra.json block.json clues.json meanings.json]
import json, sys, os, itertools, random, collections
src, out = sys.argv[1], sys.argv[2]
D = sys.argv[3] if len(sys.argv) > 3 else os.path.dirname(os.path.abspath(__file__))
pick = lambda f, empty=None: json.load(open(os.path.join(D, f))) if os.path.exists(os.path.join(D, f)) else empty
L = json.load(open(src))
CLUE = pick("clues.json", {})          # classical word → [with vowels, meaning, example]
MEAN = pick("meanings.json", {})       # level → [with vowels, meaning, example]

rnd = random.Random(11)
def order(l):
    # the circle should not spell a board word, read either way
    bad = {w for w, *_ in l["words"]}
    ok = lambda s: s not in bad and s[::-1] not in bad
    if ok(l["letters"]): return l["letters"]
    ps = ["".join(p) for p in itertools.permutations(l["letters"])] if len(l["letters"]) <= 6 else None
    for _ in range(500):
        s = rnd.choice(ps) if ps else "".join(rnd.sample(l["letters"], len(l["letters"])))
        if ok(s): return s
    return l["letters"]

lines, used = [], {}
for l in L:
    l["letters"] = order(l)
    cl = set(l.get("classical", []))
    ws = ";".join(f"{w},{r},{c},{d}" + (",j" if w in cl else "") for w, r, c, d in l["words"])
    for w in cl: used[w] = CLUE[w][1]
    lines.append(f'{l["letters"]}|{l["h"]}|{l["w"]}|{ws}')

# «كلمة إضافية»: only hand-checked words (board words, bonus_extra.json, classical words), never block.json
OK = (set(pick("grid_words.json", [])) | set(pick("bonus_extra.json", [])) | set(CLUE)) - set(pick("block.json", []))
C = collections.Counter
fits = lambda w, cb: all(cb[k] >= v for k, v in C(w).items())
union = sorted({w for l in L for w in OK if len(w) <= len(l["letters"]) and fits(w, C(l["letters"])) and w not in {x for x, *_ in l["words"]}})
M = [MEAN.get(str(i + 1)) for i in range(len(L))]
js = ("/* لوحة الكلمات: 400 levels made by scripts/words — letters|rows|cols|word,row,col,h/v[,j];…  (j = a classical word)\n"
      "   WORDS_DICT: real words that count as «كلمة إضافية» when they are not in the board.\n"
      "   WORDS_CLUE: the meaning of each classical word, shown when you tap it.\n"
      "   WORDS_MEAN: «كلمة ومعناها» after each level: [word with its vowels, meaning, example]. */\n"
      "self.WORDS_LEVELS = " + json.dumps(lines, ensure_ascii=False, indent=0) + ";\n"
      "self.WORDS_DICT = " + json.dumps(" ".join(union), ensure_ascii=False) + ";\n"
      "self.WORDS_CLUE = " + json.dumps(used, ensure_ascii=False, separators=(",", ":")).replace('","', '",\n"') + ";\n"
      "self.WORDS_MEAN = " + json.dumps(M, ensure_ascii=False, separators=(",", ":")).replace("],[", "],\n[") + ";\n")
open(out, "w", encoding="utf-8").write(js)
print(len(lines), "levels,", len(union), "bonus words,", len(used), "classical words,", sum(1 for m in M if m), "meanings,", len(js.encode()) // 1024, "KB")
