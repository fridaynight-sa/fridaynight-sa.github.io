"""Faster maker: grow paths by random walks that never touch themselves, until the grid is full."""
import random, gen

def walk_fill(n, k, rng):
    N = n * n; col = [-1] * N; paths = []
    nb = [gen.neighbours(n, i) for i in range(N)]
    target = N / k
    def free_deg(i): return sum(1 for u in nb[i] if col[u] < 0)
    def can(u, pid, head):
        return col[u] < 0 and all(col[w] != pid or w == head for w in nb[u])
    while True:
        empty = [i for i in range(N) if col[i] < 0]
        if not empty: break
        m = min(free_deg(i) for i in empty)
        start = rng.choice([i for i in empty if free_deg(i) == m])
        pid = len(paths); p = [start]; col[start] = pid
        L = max(3, int(rng.gauss(target, target * 0.35)))
        for side in (0, 1):
            while len(p) < L:
                head = p[-1] if side == 0 else p[0]
                cand = [u for u in nb[head] if can(u, pid, head)]
                if not cand: break
                # prefer cells that are getting boxed in (fewer free neighbours) so no holes are left behind
                cand.sort(key=lambda u: free_deg(u) + rng.random() * 1.5)
                u = cand[0]; col[u] = pid
                if side == 0: p.append(u)
                else: p.insert(0, u)
        paths.append(p)
    # short leftovers: try to glue them onto a neighbouring path end
    changed = True
    while changed:
        changed = False
        for pid, p in enumerate(paths):
            if p is None or len(p) >= 3: continue
            for end in (p[0], p[-1]):
                for u in nb[end]:
                    q = col[u]; 
                    if q == pid or q < 0 or paths[q] is None: continue
                    Q = paths[q]
                    if u not in (Q[0], Q[-1]): continue
                    a = p if end == p[-1] else p[::-1]       # a ends at `end`
                    b = Q if u == Q[0] else Q[::-1]          # b starts at `u`
                    merged = a + b
                    for v in a: col[v] = q
                    paths[q] = merged; paths[pid] = None
                    if not gen.induced_ok(n, [merged]) if False else not self_ok(n, merged, col, q, nb):
                        for v in a: col[v] = pid
                        paths[q] = Q; paths[pid] = p
                        continue
                    changed = True; break
                if paths[pid] is None: break
    segs = [p for p in paths if p is not None]
    if any(len(s) < 3 for s in segs): return None
    return segs

def self_ok(n, s, col, pid, nb):
    ends = {s[0], s[-1]}
    for v in s:
        same = sum(1 for u in nb[v] if col[u] == pid)
        if same != (1 if v in ends else 2): return False
    return True

def make(n, k, rng, stats=None):
    while True:
        segs = walk_fill(n, k, rng)
        if stats is not None: stats['tries'] = stats.get('tries', 0) + 1
        if not segs or len(segs) != k or not gen.induced_ok(n, segs): continue
        if stats is not None: stats['valid'] = stats.get('valid', 0) + 1
        if gen.unique(n, segs): return segs
