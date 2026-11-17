"""Builds hroof/questions.json from scripts/hroof/q*.txt (letter|level|question|answer|source).
The answer is not written plainly in the JSON (so nobody reads it there mid-game): x = base64(answer bytes XOR key(id)).
Sources stay here only (hidden reference for us)."""
import base64, glob, hashlib, json, pathlib
ROOT = pathlib.Path(__file__).resolve().parent.parent.parent
def key(i): return [(sum(ord(c) for c in i) * (k + 7) + 31 * k) % 251 for k in range(64)]
def hide(i, a):
    b = a.encode("utf-8"); k = key(i)
    return base64.b64encode(bytes(x ^ k[n % 64] for n, x in enumerate(b))).decode()
rows = []
for f in sorted(glob.glob(str(ROOT / "scripts/hroof/p*.txt"))):
    for l in open(f, encoding="utf-8"):
        l = l.strip()
        if not l or l.startswith("#"): continue
        L, d, q, a, src = l.split("|")
        rows.append((L, int(d), q, a))
hid = lambda q: "h" + hashlib.md5(q.encode("utf-8")).hexdigest()[:7]   # stable: the same question keeps its id
ids = [hid(q) for L, d, q, a in rows]
assert len(set(ids)) == len(ids), "two questions with the same text"
out = [{"id": i, "l": L, "d": d, "q": q, "x": hide(i, a)} for i, (L, d, q, a) in zip(ids, rows)]
(ROOT / "hroof/questions.json").write_text(json.dumps({"v": 1, "questions": out}, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
print(len(out), "questions")
