"""Make the 400 levels of «توصيل النقاط» (Numberlink / Flow style).
Every level fills the whole grid and each pair is joined by one path. gen2.py grows the paths, and
uniq.py proves with a SAT solver that the solution is the only one, even when a line may run right next to itself.
Run:  pip install pycosat && python3 gen.py levels.json
Output: one string per level: "<n>:<n*n letters>" — uppercase = a dot, lowercase = the path, same letter = same colour.
Then put the list into mind/dots/levels.js as  self.DOTS_LEVELS = [...]"""
import random, sys, json, itertools, time
import pycosat

def neighbours(n, i):
    r, c = divmod(i, n)
    out = []
    if r > 0: out.append(i - n)
    if r < n - 1: out.append(i + n)
    if c > 0: out.append(i - 1)
    if c < n - 1: out.append(i + 1)
    return out

def ham_path(n, rng, moves):
    path = []
    for r in range(n):
        row = list(range(r * n, r * n + n))
        path += row if r % 2 == 0 else row[::-1]
    pos = {v: i for i, v in enumerate(path)}
    for _ in range(moves):                      # backbite moves keep it one path through every cell
        if rng.random() < 0.5:
            path.reverse(); pos = {v: i for i, v in enumerate(path)}
        end = path[-1]
        nb = rng.choice(neighbours(n, end))
        i = pos[nb]
        if i == len(path) - 2: continue
        tail = path[i + 1:][::-1]
        path[i + 1:] = tail
        for j in range(i + 1, len(path)): pos[path[j]] = j
    return path

def cut(path, k, rng, minlen=3):
    L = len(path)
    for _ in range(200):
        cuts = sorted(rng.sample(range(minlen, L - minlen + 1), k - 1))
        segs, st, ok = [], 0, True
        for x in cuts + [L]:
            if x - st < minlen: ok = False; break
            segs.append(path[st:x]); st = x
        if ok: return segs
    return None

def induced_ok(n, segs):
    col = {}
    for ci, s in enumerate(segs):
        for v in s: col[v] = ci
    for ci, s in enumerate(segs):
        ends = {s[0], s[-1]}
        for v in s:
            same = sum(1 for u in neighbours(n, v) if col[u] == ci)
            if same != (1 if v in ends else 2): return False
    return True

def clauses(n, k, ends):
    V = lambda cell, c: cell * k + c + 1
    cl = []
    endcol = {}
    for c, (a, b) in enumerate(ends): endcol[a] = c; endcol[b] = c
    for x in range(n * n):
        cl.append([V(x, c) for c in range(k)])
        for c1 in range(k):
            for c2 in range(c1 + 1, k): cl.append([-V(x, c1), -V(x, c2)])
        N = neighbours(n, x)
        if x in endcol:
            c = endcol[x]; cl.append([V(x, c)])
            cl.append([V(u, c) for u in N])
            for a, b in itertools.combinations(N, 2): cl.append([-V(a, c), -V(b, c)])
        else:
            for c in range(k):
                for t in itertools.combinations(N, 3): cl.append([-V(x, c)] + [-V(u, c) for u in t])
                for a in N: cl.append([-V(x, c)] + [V(u, c) for u in N if u != a])
    return cl, V

def colours_of(sol, n, k):
    s = set(v for v in sol if v > 0)
    return [next(c for c in range(k) if (x * k + c + 1) in s) for x in range(n * n)]

def has_cycle(n, cols, ends):
    # each colour's cells must be one path from dot to dot; anything left over is a loop
    for c, (a, b) in enumerate(ends):
        cells = {i for i, v in enumerate(cols) if v == c}
        seen, stack = {a}, [a]
        while stack:
            v = stack.pop()
            for u in neighbours(n, v):
                if u in cells and u not in seen: seen.add(u); stack.append(u)
        if seen != cells or b not in seen: return True
    return False

def unique(n, segs):
    k = len(segs); ends = [(s[0], s[-1]) for s in segs]
    cl, V = clauses(n, k, ends)
    mine = [None] * (n * n)
    for c, s in enumerate(segs):
        for v in s: mine[v] = c
    endset = {e for p in ends for e in p}
    for _ in range(40):
        sol = pycosat.solve(cl)
        if sol == "UNSAT": return True
        cols = colours_of(sol, n, k)
        if cols != mine and not has_cycle(n, cols, ends): return False
        cl.append([-V(x, cols[x]) for x in range(n * n) if x not in endset])
    return False

def bends(n, segs):
    b = 0
    for s in segs:
        for i in range(1, len(s) - 1):
            if (s[i] - s[i - 1]) != (s[i + 1] - s[i]): b += 1
    return b

def make(n, k, rng):
    while True:
        path = ham_path(n, rng, 60 * n * n)
        segs = cut(path, k, rng)
        if not segs or not induced_ok(n, segs): continue
        if unique(n, segs): return segs

def encode(n, segs, rng):
    letters = list(range(len(segs))); rng.shuffle(letters)   # colours land on different pairs each level
    g = [""] * (n * n)
    for ci, s in enumerate(segs):
        ch = "abcdefghij"[letters[ci]]
        for j, v in enumerate(s): g[v] = ch.upper() if j in (0, len(s) - 1) else ch
    return f"{n}:{''.join(g)}"

PLAN = [(5, 30, (6, 5, 4)), (6, 60, (7, 6, 5)), (7, 80, (8, 7, 6)), (8, 110, (9, 8, 7)), (9, 120, (10, 9, 8))]

if __name__ == "__main__":
    import gen2, uniq
    rng = random.Random(20261027)
    out, seen = [], set()
    t0 = time.time()
    for n, count, ks in PLAN:
        block = []
        per = [count // 3 + (1 if i < count % 3 else 0) for i in range(3)]
        for k, m in zip(ks, per):
            got = []
            while len(got) < m:
                segs = gen2.make(n, k, rng)
                if not uniq.unique_real(n, segs): continue     # one solution only, even if a path runs next to itself
                key = tuple(sorted((min(s[0], s[-1]), max(s[0], s[-1])) for s in segs))
                if key in seen: continue
                seen.add(key); got.append(segs)
            got.sort(key=lambda s: bends(n, s))          # inside each group: fewer turns first
            block += got
            print(f"{n}x{n} k={k}: {m} done  ({time.time() - t0:.0f}s)", file=sys.stderr, flush=True)
        out += [encode(n, s, rng) for s in block]
    json.dump(out, open(sys.argv[1], "w"), separators=(",", ":"))
    print(len(out), "levels", file=sys.stderr)
