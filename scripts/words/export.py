# writes mind/words/levels.js from levels_final.json (+ meanings.json when it exists)
import json, sys, os
src, out = sys.argv[1], sys.argv[2]
L = json.load(open(src))
import itertools, random
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
lines = []
for l in L:
    l["letters"] = order(l)
    ws = ";".join(f"{w},{r},{c},{d}" for w, r, c, d in l["words"])
    lines.append(f'{l["letters"]}|{l["h"]}|{l["w"]}|{ws}')
# «كلمة إضافية»: only hand-checked words (the board words + bonus_extra.json), never block.json
import collections
HERE = os.path.dirname(os.path.abspath(__file__))
pick = lambda f: json.load(open(f if os.path.exists(f) else os.path.join(HERE, f)))
OK = (set(pick("grid_words.json")) | set(pick("bonus_extra.json"))) - set(pick("block.json"))
C = collections.Counter
fits = lambda w, cb: all(cb[k] >= v for k, v in C(w).items())
union = sorted({w for l in L for w in OK if len(w) <= len(l["letters"]) and fits(w, C(l["letters"])) and w not in {x for x, *_ in l["words"]}})
mean = json.load(open("meanings.json")) if os.path.exists("meanings.json") else {}
M = [mean.get(str(i + 1)) for i in range(len(L))]
js = ("/* لوحة الكلمات: 400 levels made by scripts/words/gen.py — letters|rows|cols|word,row,col,h/v;…\n"
      "   WORDS_DICT: real words that count as «كلمة إضافية» when they are not in the board.\n"
      "   WORDS_MEAN: «كلمة ومعناها» after each level: [word with its vowels, meaning, example]. */\n"
      "self.WORDS_LEVELS = " + json.dumps(lines, ensure_ascii=False, indent=0) + ";\n"
      "self.WORDS_DICT = " + json.dumps(" ".join(union), ensure_ascii=False) + ";\n"
      "self.WORDS_MEAN = " + json.dumps(M, ensure_ascii=False, separators=(",", ":")).replace("],[", "],\n[") + ";\n")
open(out, "w", encoding="utf-8").write(js)
print(len(lines), "levels,", len(union), "dict words,", sum(1 for m in M if m), "meanings,", len(js.encode()) // 1024, "KB")
