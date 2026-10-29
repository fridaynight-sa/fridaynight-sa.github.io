# لوحة الكلمات: builds the levels (letters, crossword layout, bonus words)
import json, random, collections, sys, math

D = sys.argv[1] if len(sys.argv) > 1 else "."
G = json.load(open(f"{D}/grid_words.json"))
B = set(json.load(open(f"{D}/bonus_dict.json")))
freq = {}
GS = set(G)
for line in open(f"{D}/ar_full.txt", encoding="utf-8"):
    w, c = line.rsplit(" ", 1)
    if w in GS and w not in freq: freq[w] = int(c)
F = {w: freq.get(w, 1) for w in G}
SEC = json.load(open(f"{D}/hun_words.json"))
# nouns read nicer in a word game than little words like هنا / لكن
KIND = {w: (0.8 if SEC.get(w) == "nouns" else -1.0 if SEC.get(w) in ("stop", "tools") else 0) for w in G}
C = {w: collections.Counter(w) for w in G}
def sub(a, b): return all(b[k] >= v for k, v in a.items())

# tiers: (letters, first level, last level, words min..max)
TIERS = [(3, 1, 12, 2, 4), (4, 13, 60, 3, 6), (5, 61, 170, 4, 8), (6, 171, 330, 5, 10), (7, 331, 400, 6, 12)]
CAP = {3: 5, 4: 7, 5: 8, 6: 10, 7: 10}
COMMON = 3000

AB = sorted({ch for w in G for ch in w})
BIT = {ch: 1 << i for i, ch in enumerate(AB)}
M = {w: sum(BIT[ch] for ch in set(w)) for w in G}
_FC = {}
def formable(base):
    if base in _FC: return _FC[base]
    cb, mb, n = C[base], M[base], len(base)
    r = [w for w in G if w != base and len(w) <= n and not (M[w] & ~mb) and sub(C[w], cb)]
    _FC[base] = r
    return r

# ---- crossword layout ----
def fits(grid, word, r, c, d):
    dr, dc = (0, 1) if d == "h" else (1, 0)
    n = len(word); cross = 0
    br, bc = r - dr, c - dc
    if (br, bc) in grid: return -1
    ar, ac = r + dr * n, c + dc * n
    if (ar, ac) in grid: return -1
    for i, ch in enumerate(word):
        rr, cc = r + dr * i, c + dc * i
        g = grid.get((rr, cc))
        if g:
            if g[0] != ch or d in g[1]: return -1
            cross += 1
        else:
            # side neighbours must be empty
            for s in (-1, 1):
                if (rr + dc * s, cc + dr * s) in grid: return -1
    return cross

def place(grid, word, r, c, d):
    dr, dc = (0, 1) if d == "h" else (1, 0)
    for i, ch in enumerate(word):
        k = (r + dr * i, c + dc * i)
        if k in grid: grid[k] = (ch, grid[k][1] + d)
        else: grid[k] = (ch, d)

def bbox(grid):
    rs = [k[0] for k in grid]; cs = [k[1] for k in grid]
    return min(rs), max(rs), min(cs), max(cs)

def layout(words, want, cap, rnd):
    """words[0] is the base word; the rest in priority order"""
    grid = {}; placed = [(words[0], 0, 0, "h")]; place(grid, words[0], 0, 0, "h")
    rest = words[1:]
    for w in rest:
        if len(placed) >= want: break
        best = None
        for (gr, gc), (ch, ds) in list(grid.items()):
            if len(ds) == 2: continue
            for i, x in enumerate(w):
                if x != ch: continue
                for d in "hv":
                    if d in ds: continue
                    r, c = (gr, gc - i) if d == "h" else (gr - i, gc)
                    k = fits(grid, w, r, c, d)
                    if k <= 0: continue
                    g2 = dict(grid); place(g2, w, r, c, d)
                    r0, r1, c0, c1 = bbox(g2)
                    h, wd = r1 - r0 + 1, c1 - c0 + 1
                    if h > cap or wd > cap: continue
                    score = k * 3 - (h * wd) / 12 - abs(h - wd) * .4 + rnd.random()
                    if not best or score > best[0]: best = (score, r, c, d)
        if best:
            _, r, c, d = best; place(grid, w, r, c, d); placed.append((w, r, c, d))
    r0, r1, c0, c1 = bbox(grid)
    return placed, grid, (r1 - r0 + 1, c1 - c0 + 1), (r0, c0)

USES = collections.Counter()   # how many levels already have each word
def build_level(base, n, want, used, rnd, tries=60):
    f = formable(base)
    # most common words first; words used lately go to the back
    def pri(w): return math.log(F[w] + 1) + KIND[w] - (1.0 if w in used else 0) - .45 * USES[w] + rnd.random() * .6
    best = None
    for t in range(tries):
        order = sorted(f, key=pri, reverse=True)
        top = order[: want + 6]
        rnd.shuffle(top)
        top.sort(key=lambda w: -len(w) - rnd.random() * 1.5)
        placed, grid, (h, wd), off = layout([base] + top, want, CAP[n], rnd)
        cnt = len(placed)
        common = sum(math.log(F[w] + 1) for w, *_ in placed)
        reuse = sum((1 if w in used else 0) + .4 * USES[w] for w, *_ in placed[1:])
        crosses = sum(1 for v in grid.values() if len(v[1]) == 2)
        score = min(cnt, want) * 100 + common * 2 - reuse * 15 - h * wd * .8 + crosses * 2
        if not best or score > best[0]: best = (score, placed, h, wd, off)
    _, placed, h, wd, (r0, c0) = best
    words = [[w, r - r0, c - c0, d] for w, r, c, d in placed]
    gw = {w for w, *_ in words}
    cb = C[base]
    bonus = sorted(w for w in B if w not in gw and 3 <= len(w) <= n and sub(collections.Counter(w), cb))
    return {"base": base, "words": words, "h": h, "w": wd, "bonus": bonus, "missed": [w for w in f if w not in gw]}

def shuffled(base, rnd):
    l = list(base)
    for _ in range(50):
        rnd.shuffle(l)
        s = "".join(l)
        rot = {s[i:] + s[:i] for i in range(len(s))}       # the wheel is a circle: no word read around it
        if base not in rot and base[::-1] not in rot: return s
    return "".join(l)

def main(seed=7, only=None):
    rnd = random.Random(seed)
    levels = []; used_sets = set(); recent = collections.deque(maxlen=80)
    for n, a, b, wmin, wmax in TIERS:
        count = b - a + 1
        info = []
        for w in (x for x in G if len(x) == n):
            f = formable(w)
            if len(f) < wmin - 1: continue
            fr = sorted((F[x] for x in f), reverse=True)
            top = fr[: wmax - 1]
            over = sum(1 for x in fr[wmax - 1:] if x >= COMMON)
            ease = math.log(F[w] + 1) * 1.5 + KIND[w] * 2 + sum(math.log(x + 1) for x in top) / max(1, len(top))
            info.append((ease - over * 1.2, ease, w))
        info.sort(reverse=True)
        pool = []
        for pre, ease, w in info:
            key = "".join(sorted(w))
            if key in used_sets: continue
            used_sets.add(key); pool.append((ease, w))
            if len(pool) >= int(count * 1.6): break
        # build every candidate, keep the ones whose common words all fit
        built = []
        for ease, base in pool:
            L = build_level(base, n, wmax, set(), rnd, tries=25)
            miss = sum(1 for x in L["missed"] if F[x] >= COMMON)
            built.append((miss * 2 - len(L["words"]) * .3 - ease * .15, ease, base))
        built.sort()
        chosen = sorted(built[:count], key=lambda x: -x[1])
        print(n, "tier:", len(chosen), "of", count, "pool", len(pool), file=sys.stderr)
        for i, (_, ease, base) in enumerate(chosen):
            lv = a + i
            want = round(wmin + (wmax - wmin) * (i / max(1, count - 1)) ** .8)
            if only and lv not in only:
                levels.append(None); continue
            L = build_level(base, n, want, set(list(recent)[-60:]), rnd)
            L["n"] = lv; L["letters"] = shuffled(base, rnd)
            for w, *_ in L["words"]: recent.append(w); USES[w] += 1
            levels.append(L)
    return levels

if __name__ == "__main__":
    only = set(map(int, sys.argv[2].split(","))) if len(sys.argv) > 2 else None
    lv = main(only=only)
    json.dump(lv, open(f"{D}/levels_out.json", "w"), ensure_ascii=False)
