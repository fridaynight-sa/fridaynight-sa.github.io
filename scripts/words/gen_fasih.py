# levels 1–100 stay as they are; 101–400 are rebuilt so each one has a few classical (جزلة) words,
# more and more towards the end, but always a minority of the board so a level never gets stuck.
#   python3 gen_fasih.py <data dir> <levels to keep (json)> <out json>
import sys, json, random, collections, math
D, KEEP, OUT = sys.argv[1], sys.argv[2], sys.argv[3]
sys.argv = [sys.argv[0], D]
import gen
from gen import G, F, C, formable, layout, shuffled, sub, B, CAP, TIERS, KIND, COMMON

FAS = set(json.load(open(f"{D}/fasih.json")))
J = {w for w in json.load(open(f"{D}/jazl.json")) if w in C}   # the really classical ones, picked by hand
keep = json.load(open(KEEP))[:100]
USES = gen.USES
for l in keep:
    for w, *_ in l["words"]: USES[w] += 1

def need(lv):   # how many classical words a level has
    if lv <= 200: return 1
    if lv <= 300: return 2 if lv % 2 == 0 else 1
    if lv <= 360: return 2
    return 3 if lv % 3 == 0 else 2

JUSE = collections.Counter()
def build(base, n, want, used, rnd, k, tries=60, cap=True):
    f = formable(base)
    js = [w for w in f if w in J and JUSE[w] < ({5: 3, 6: 4, 7: 5}[n] if cap else 99)]   # a classical word: in 3 levels at most (6 letters: 4, 7 letters: 5)
    if base in J: k = max(0, k - 1)
    k = min(k, len(js))
    def pri(w): return math.log(F[w] + 1) + KIND[w] - (1.0 if w in used else 0) - .45 * USES[w] + rnd.random() * .6
    best = None
    for t in range(tries):
        # short classical words first (easier to guess), ones not seen much before
        jj = sorted(js, key=lambda w: JUSE[w] * 10 + len(w) * .5 + rnd.random() * 2)[: k + 2]
        pick = jj[:k]
        others = [w for w in sorted(f, key=pri, reverse=True) if w not in J][: want + 6]   # classical words only when picked
        rnd.shuffle(others); others.sort(key=lambda w: -len(w) - rnd.random() * 1.5)
        order = [base] + pick + others
        placed, grid, (h, wd), off = layout(order, want, CAP[n], rnd)
        got = [w for w, *_ in placed if w in J]
        cnt = len(placed)
        common = sum(math.log(F[w] + 1) for w, *_ in placed if w not in J)
        reuse = sum((1 if w in used else 0) + .4 * USES[w] for w, *_ in placed[1:])
        crosses = sum(1 for v in grid.values() if len(v[1]) == 2)
        # classical words: as many as asked, never more than about a third of the board
        jok = min(len(got), k) * 300 - max(0, len(got) - max(k, round(cnt * .34))) * 300
        score = jok + min(cnt, want) * 100 + common * 2 - reuse * 15 - h * wd * .8 + crosses * 2
        if not best or score > best[0]: best = (score, placed, h, wd, off, len(got))
    _, placed, h, wd, (r0, c0), nj = best
    words = [[w, r - r0, c - c0, d] for w, r, c, d in placed]
    return {"base": base, "words": words, "h": h, "w": wd, "classical": [w for w, *_ in words if w in J], "missed": [w for w in f if w not in {x for x, *_ in words}]}

def main(seed=7):
    rnd = random.Random(seed)
    levels = list(keep)
    used_sets = {"".join(sorted(l["letters"])) for l in keep}
    recent = collections.deque((w for l in keep[-20:] for w, *_ in l["words"]), maxlen=80)
    for n, a, b, wmin, wmax in TIERS:
        if b <= 100: continue
        start = max(a, 101); count = b - start + 1
        cands = []
        for w in (x for x in G if len(x) == n):
            if "".join(sorted(w)) in used_sets: continue
            f = formable(w)
            if len(f) < wmin - 1: continue
            js = {x for x in f if x in J} | ({w} if w in J else set())
            if not js: continue
            fr = sorted((F[x] for x in f if x not in J), reverse=True)
            top = fr[: wmax - 1]
            over = sum(1 for x in fr[wmax - 1:] if x >= COMMON)
            ease = math.log(F[w] + 1) * 1.5 + KIND[w] * 2 + sum(math.log(x + 1) for x in top) / max(1, len(top))
            cands.append([ease - over * 1.2, ease, w, js])
        cands.sort(key=lambda x: -x[0])
        print(n, "tier:", count, "levels,", len(cands), "bases with classical words", file=sys.stderr)
        for i in range(count):
            lv = start + i
            k = need(lv)
            def value(c):   # easy first; a base that brings classical words nobody has seen yet wins
                new = sum(1 for x in c[3] if JUSE[x] == 0); ok = sum(1 for x in c[3] if JUSE[x] < 3)
                return c[0] + min(new, k) * 1.6 + min(ok, k) * .6
            pool = sorted((c for c in cands[:400] if "".join(sorted(c[2])) not in used_sets), key=value, reverse=True)
            want = round(wmin + (wmax - wmin) * ((lv - a) / max(1, b - a)) ** .8)
            # the best few bases; keep the first whose board really gets its classical words
            best = None
            for c in pool[:6]:
                L = build(c[2], n, want, set(list(recent)[-60:]), rnd, k)
                got = min(len(L["classical"]), k)
                if not best or got > best[0]: best = (got, c, L)
                if got >= k: break
            if best[0] == 0:   # still none: any base, even with a classical word seen a few times already
                for c in pool[:30]:
                    L = build(c[2], n, want, set(list(recent)[-60:]), rnd, max(1, k - 1), cap=False)
                    if L["classical"]: best = (1, c, L); break
            _, c, L = best
            used_sets.add("".join(sorted(c[2]))); cands.remove(c)
            base = c[2]
            L["n"] = lv; L["letters"] = shuffled(base, rnd)
            for w, *_ in L["words"]:
                recent.append(w); USES[w] += 1
                if w in J: JUSE[w] += 1
            levels.append(L)
    return levels

lv = main()
json.dump(lv, open(OUT, "w"), ensure_ascii=False)
short = [(l["n"], len(l["classical"]), need(l["n"])) for l in lv[100:] if len(l["classical"]) < need(l["n"])]
print("levels with fewer classical words than planned:", len(short), short[:20], file=sys.stderr)
