# checks every level: words fit the letters, the grid has no stray runs, everything connected, nothing repeated
import json, collections, sys
L = [l for l in json.load(open(sys.argv[1] if len(sys.argv) > 1 else "levels_out.json")) if l]
bad = 0
bases = collections.Counter(l["base"] for l in L)
sets = collections.Counter("".join(sorted(l["letters"])) for l in L)
for l in L:
    err = []
    cl = collections.Counter(l["letters"])
    if sorted(l["letters"]) != sorted(l["base"]): err.append("letters != base")
    cell = {}
    for w, r, c, d in l["words"]:
        if not all(cl[k] >= v for k, v in collections.Counter(w).items()): err.append("not formable " + w)
        for i, ch in enumerate(w):
            k = (r, c + i) if d == "h" else (r + i, c)
            if k in cell and cell[k] != ch: err.append("clash " + w)
            cell[k] = ch
            if not (0 <= k[0] < l["h"] and 0 <= k[1] < l["w"]): err.append("outside " + w)
    words = {(w, r, c, d) for w, r, c, d in l["words"]}
    # every maximal run of 2+ letters must be one of the words
    runs = set()
    for (r, c) in cell:
        if (r, c - 1) not in cell and (r, c + 1) in cell:
            s = ""; x = c
            while (r, x) in cell: s += cell[(r, x)]; x += 1
            runs.add((s, r, c, "h"))
        if (r - 1, c) not in cell and (r + 1, c) in cell:
            s = ""; y = r
            while (y, c) in cell: s += cell[(y, c)]; y += 1
            runs.add((s, r, c, "v"))
    if runs != words: err.append("runs differ: extra %s missing %s" % (runs - words, words - runs))
    # connected
    seen = set(); st = [next(iter(cell))]
    while st:
        k = st.pop()
        if k in seen: continue
        seen.add(k)
        for dr, dc in ((0, 1), (0, -1), (1, 0), (-1, 0)):
            n = (k[0] + dr, k[1] + dc)
            if n in cell: st.append(n)
    if len(seen) != len(cell): err.append("not connected")
    ws = [w for w, *_ in l["words"]]
    if len(set(ws)) != len(ws): err.append("word twice")
    if bases[l["base"]] > 1: err.append("base repeated")
    if sets["".join(sorted(l["letters"]))] > 1: err.append("letter set repeated")
    if set(ws) & set(l.get("bonus", [])): err.append("bonus overlaps grid")
    if err: bad += 1; print(l["n"], l["base"], err)
print(len(L), "levels checked,", bad, "with problems")
