"""Uniqueness under the real rules: a path may run right next to itself. Variables: colour of each cell
and which links between neighbouring cells are used; dots have one link, other cells two."""
import itertools, pycosat, gen

def edges_of(n):
    E = []
    for i in range(n * n):
        r, c = divmod(i, n)
        if c < n - 1: E.append((i, i + 1))
        if r < n - 1: E.append((i, i + n))
    return E

def build(n, ends):
    k = len(ends); N = n * n; E = edges_of(n)
    X = lambda cell, c: cell * k + c + 1
    base = N * k
    Ev = {e: base + j + 1 for j, e in enumerate(E)}
    inc = {i: [] for i in range(N)}
    for e in E: inc[e[0]].append(e); inc[e[1]].append(e)
    endcol = {}
    for c, (a, b) in enumerate(ends): endcol[a] = c; endcol[b] = c
    cl = []
    for x in range(N):
        cl.append([X(x, c) for c in range(k)])
        for c1, c2 in itertools.combinations(range(k), 2): cl.append([-X(x, c1), -X(x, c2)])
        L = [Ev[e] for e in inc[x]]
        need = 1 if x in endcol else 2
        if x in endcol: cl.append([X(x, endcol[x])])
        # at most `need` used links, at least `need`
        for t in itertools.combinations(L, need + 1): cl.append([-v for v in t])
        for t in itertools.combinations(L, len(L) - need + 1): cl.append(list(t))
    for (a, b), v in Ev.items():
        for c in range(k):
            cl.append([-v, -X(a, c), X(b, c)]); cl.append([-v, X(a, c), -X(b, c)])
    return cl, Ev

def unique_real(n, segs, max_iter=80):
    ends = [(s[0], s[-1]) for s in segs]
    cl, Ev = build(n, ends)
    mine = set()
    for s in segs:
        for a, b in zip(s, s[1:]): mine.add((min(a, b), max(a, b)))
    for _ in range(max_iter):
        sol = pycosat.solve(cl)
        if sol == "UNSAT": return True
        on = {e for e, v in Ev.items() if sol[v - 1] > 0}
        if on != mine and not loops(n, on, ends): return False
        cl.append([-Ev[e] for e in on])
    return False

def loops(n, on, ends):
    # a solution with a closed loop somewhere is not a real one
    adj = {}
    for a, b in on: adj.setdefault(a, []).append(b); adj.setdefault(b, []).append(a)
    seen = set()
    for a, b in ends:
        stack = [a]; seen.add(a)
        while stack:
            v = stack.pop()
            for u in adj.get(v, []):
                if u not in seen: seen.add(u); stack.append(u)
    return len(seen) != n * n
