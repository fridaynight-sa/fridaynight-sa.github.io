"""دوّر الكلمة: makes the 400 levels and the daily newspaper issues.
   python3 gen.py            → levels.json, issues.json (checked: every word is there once, nothing else)
Directions (row step, column step): 0 → right-to-left (how Arabic is read), 1 down, 2 down-left, 3 down-right,
4 left-to-right (backwards), 5 up, 6 up-right, 7 up-left."""
import json, random, re, collections, os
D = [(0, -1), (1, 0), (1, -1), (1, 1), (0, 1), (-1, 0), (-1, 1), (-1, -1)]
HERE = os.path.dirname(os.path.abspath(__file__))

def themes():
    T = []
    for ln in open(os.path.join(HERE, "themes.txt"), encoding="utf-8"):
        ln = ln.strip()
        if not ln or ln.startswith("#"): continue
        name, clue, ws = [x.strip() for x in ln.split("|")]
        ws = list(dict.fromkeys(w for w in ws.split() if re.fullmatch(r"[ء-ي]{3,9}", w)))
        T.append({"name": name, "clue": clue, "words": ws})
    return T

TH = themes()
FREQ = collections.Counter(ch for t in TH for w in t["words"] for ch in w)
LET, WT = zip(*FREQ.items())

def place(R, C, words, dirs, rnd, tries=250):
    g = [[None] * C for _ in range(R)]; out = []
    for w in words:
        for _ in range(tries):
            d = rnd.choice(dirs); dr, dc = D[d]; r = rnd.randrange(R); c = rnd.randrange(C)
            cells = [(r + dr * i, c + dc * i) for i in range(len(w))]
            if not all(0 <= a < R and 0 <= b < C for a, b in cells): continue
            if not all(g[a][b] in (None, ch) for (a, b), ch in zip(cells, w)): continue
            for (a, b), ch in zip(cells, w): g[a][b] = ch
            out.append([w, r, c, d]); break
        else:
            return None
    return g, out

def lines(g):
    R, C = len(g), len(g[0])
    for r in range(R):
        for c in range(C):
            for d, (dr, dc) in enumerate(D):
                yield r, c, d, dr, dc

def count(g, w):
    """how many different places hold this word (a word and its reverse on the same cells count once)"""
    R, C = len(g), len(g[0]); seen = set()
    for r in range(R):
        for c in range(C):
            for dr, dc in D:
                cells = [(r + dr * i, c + dc * i) for i in range(len(w))]
                if all(0 <= a < R and 0 <= b < C for a, b in cells) and all(g[a][b] == ch for (a, b), ch in zip(cells, w)):
                    seen.add(frozenset(cells))
    return len(seen)

def ok(g, ws):
    return all(count(g, w) == 1 for w in ws)

def no_inside(ws):
    """no chosen word inside another (قمر in قمري): finding one would look like the other"""
    return all(not (a != b and (a in b or a[::-1] in b)) for a in ws for b in ws)

def level_shape(n):
    if n <= 20: return 6, 6, (4, 5), [0, 1]
    if n <= 60: return 7, 7, (5, 6), [0, 1, 2, 3]
    if n <= 120: return 8, 8, (6, 7), [0, 1, 2, 3]
    if n <= 200: return 8, 8, (7, 8), [0, 1, 2, 3, 4, 5]
    if n <= 300: return 9, 9, (8, 10), list(range(8))
    return 10, 10, (10, 12), list(range(8))

def make_levels():
    rnd0 = random.Random(2026); order = list(range(len(TH))); rnd0.shuffle(order)
    out, used = [], set()
    for n in range(1, 401):
        R, C, (k0, k1), dirs = level_shape(n)
        rnd = random.Random(1000 + n); ti = order[(n - 1) % len(order)]
        pool = [w for w in TH[ti]["words"] if len(w) <= min(R, C)]
        for attempt in range(4000):
            k = min(rnd.randint(k0, k1), len(pool))
            ws = sorted(rnd.sample(pool, k), key=len, reverse=True)
            if not no_inside(ws) or tuple(sorted(ws)) in used: continue
            res = place(R, C, ws, dirs, rnd)
            if not res: continue
            g, pl = res
            for fill in range(30):
                h = [[x if x else rnd.choices(LET, WT)[0] for x in row] for row in g]
                if ok(h, ws): break
            else: continue
            used.add(tuple(sorted(ws)))
            out.append({"n": n, "t": ti, "R": R, "C": C, "g": "".join("".join(r) for r in h), "w": pl}); break
        else:
            raise SystemExit(f"level {n}: no grid")
    return out

def sayings():
    out = []
    for ln in open(os.path.join(HERE, "sayings.txt"), encoding="utf-8"):
        ln = ln.strip()
        if not ln or ln.startswith("#"): continue
        k, t = [x.strip() for x in ln.split("|")]
        out.append({"k": k, "t": t, "L": re.sub(r"[^\u0621-\u064A]", "", t)})
    return out

SAY = sayings()

def make_issues(N=730):
    """the newspaper: all directions; the letters left over, read like Arabic (row by row, right to left), spell a
       proverb (or a saying, a hadith, a line of poetry). Each issue its own topic; a proverb doesn't come back soon."""
    rnd0 = random.Random(1448); order = list(range(len(TH))); rnd0.shuffle(order)
    out, last = [], []
    for n in range(1, N + 1):
        rnd = random.Random(50000 + n); ti = order[(n - 1) % len(order)]
        pool0 = [w for w in TH[ti]["words"] if len(w) <= 9]
        for attempt in range(5000):
            R, C = (10, 9) if attempt % 3 else (9, 9)
            pool = pool0[:]; rnd.shuffle(pool)
            g = [[None] * C for _ in range(R)]; pl = []; ws = []
            for w in sorted(pool, key=len, reverse=True):
                if len(ws) >= 16: break
                if not no_inside(ws + [w]): continue
                for _ in range(150):
                    d = rnd.randrange(8); dr, dc = D[d]; r = rnd.randrange(R); c = rnd.randrange(C)
                    cells = [(r + dr * i, c + dc * i) for i in range(len(w))]
                    if not all(0 <= a < R and 0 <= b < C for a, b in cells): continue
                    if not all(g[a][b] in (None, ch) for (a, b), ch in zip(cells, w)): continue
                    for (a, b), ch in zip(cells, w): g[a][b] = ch
                    pl.append([w, r, c, d]); ws.append(w); break
            if len(ws) < 8: continue
            empty = [(r, c) for r in range(R) for c in range(C - 1, -1, -1) if g[r][c] is None]
            gap = 40 if attempt < 2500 else 15
            fits = [i for i, x in enumerate(SAY) if len(x["L"]) == len(empty) and i not in last[-gap:]]
            if not fits: continue
            si = rnd.choice(fits)
            for (r, c), ch in zip(empty, SAY[si]["L"]): g[r][c] = ch
            if not ok(g, ws): continue
            last.append(si)
            out.append({"n": n, "t": ti, "R": R, "C": C, "g": "".join("".join(r) for r in g), "w": pl, "s": si}); break
        else:
            raise SystemExit(f"issue {n}: no grid")
    return out

if __name__ == "__main__":
    L = make_levels(); print(len(L), "levels")
    I = make_issues(); print(len(I), "issues")
    json.dump(L, open(os.path.join(HERE, "levels.json"), "w"), ensure_ascii=False)
    json.dump(I, open(os.path.join(HERE, "issues.json"), "w"), ensure_ascii=False)
    json.dump(TH, open(os.path.join(HERE, "themes.json"), "w"), ensure_ascii=False, indent=0)
    json.dump(SAY, open(os.path.join(HERE, "sayings.json"), "w"), ensure_ascii=False, indent=0)
