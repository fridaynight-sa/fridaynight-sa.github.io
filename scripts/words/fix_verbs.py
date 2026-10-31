# rebuild the levels whose board has a present-tense verb (يلبس، يسأل…), same letters, verbs left out of the board
import sys, json, random, collections, re
W = '/home/user/fridaynight/scripts/words'; D = sys.argv[1]
sys.path.insert(0, W); sys.argv = [sys.argv[0], D]
import gen
SEC = json.load(open(D + '/hun_words.json'))
L = json.load(open(W + '/levels.json'))
board = {w[0] for l in L for w in l['words']}
BAD = {w for w in gen.G if w[0] == 'ي' and SEC.get(w) == 'verbs'} | {'يزن', 'يود', 'يمكن', 'تنال', 'يسلم'}
gen.G[:] = [w for w in gen.G if w not in BAD]; gen._FC.clear()
src = open(W + '/gen_fasih.py').read(); src = src[:src.index('def main')]
sys.argv = ['x', D, W + '/levels.json', '/dev/null']
g = {'__name__': 'fx'}; exec(src, g)
build, need, J = g['build'], g['need'], g['J']
MEAN = json.load(open(W + '/meanings.json')); TASH = re.compile('[ً-ْٰ]')
CLUE = json.load(open(W + '/clues.json')); J.intersection_update(CLUE)
hit = [l for l in L if any(w[0] in BAD for w in l['words'])]
print('levels to redo:', len(hit), 'bases that are verbs:', [l['n'] for l in hit if l['base'] in BAD], file=sys.stderr)
def counts(skip):
    U, JU = collections.Counter(), collections.Counter()
    for l in L:
        if l['n'] == skip: continue
        for w, *_ in l['words']:
            U[w] += 1
            if w in J: JU[w] += 1
    return U, JU
bad = []
used_sets = {"".join(sorted(l["letters"])) for l in L}
import math
def newbase(n, size):
    out = []
    for w in (x for x in gen.G if len(x) == size):
        if "".join(sorted(w)) in used_sets: continue
        f = gen.formable(w)
        if len(f) < 4: continue
        if n > 100 and not any(x in J for x in f): continue
        out.append((math.log(gen.F[w] + 1) * 1.5 + gen.KIND[w] * 2 + sum(sorted((math.log(gen.F[x] + 1) for x in f), reverse=True)[:6]) / 6, w))
    return [w for _, w in sorted(out, reverse=True)[:40]]
def make(base, n, want, near, kold, s):
    rnd = random.Random(n * 100 + s)
    if n <= 100: new = gen.build_level(base, len(base), want, near, rnd); new['classical'] = []
    else: new = build(base, len(base), want, near, rnd, max(kold, need(n)))
    return new
for l in hit:
    n = l['n']; U, JU = counts(n); gen.USES.clear(); gen.USES.update(U); g['USES'] = gen.USES; g['JUSE'].clear(); g['JUSE'].update(JU)
    near = {w for x in L if abs(x['n'] - n) <= 30 and x['n'] != n for w, *_ in x['words']}
    want = len(l['words']); kold = len(l.get('classical', []))
    def good(new): return len(new['words']) >= want - 1 and len(new['classical']) >= min(kold, 1 if n > 100 else 0) and all(c in CLUE for c in new['classical'])
    best = None
    bases = ([] if l['base'] in BAD else [l['base']])
    for base in bases + newbase(n, len(l['base'])):
        for s in range(15):
            new = make(base, n, want, near, kold, s)
            sc = (good(new), len(new['words']), len(new['classical']))
            if not best or sc > best[0]: best = (sc, new, base)
            if sc[0] and sc[1] >= want: break
        if best[0][0]: break
    sc, new, base = best
    if not sc[0]: bad.append(n)
    if base != l['base']:
        used_sets.add("".join(sorted(base))); new['letters'] = gen.shuffled(base, random.Random(n))
    else: new['letters'] = l['letters']
    new['n'] = n
    L[n - 1] = new
print('not perfect:', bad, file=sys.stderr)
json.dump(L, open('levels_noverbs.json', 'w'), ensure_ascii=False)
need_mean = [(l['n'], TASH.sub('', MEAN[str(l['n'])][0]), [w for w, *_ in l['words']]) for l in L if TASH.sub('', MEAN[str(l['n'])][0]) not in {w for w, *_ in l['words']}]
print('meanings to redo:', len(need_mean), file=sys.stderr)
json.dump(need_mean, open('./need_mean.json','w'), ensure_ascii=False, indent=0)
print('left:', sorted({w[0] for l in L for w in l['words'] if w[0] in BAD}), file=sys.stderr)
