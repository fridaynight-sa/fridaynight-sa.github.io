import json,glob,re
L=json.load(open('levels_final.json'))
TASH=re.compile('[ً-ْٰ]')
out={}; bad=[]
for f in sorted(glob.glob('mean/m*.txt')):
    for line in open(f,encoding='utf-8'):
        line=line.strip()
        if not line: continue
        n,w,m,e=line.split('|'); n=int(n)
        g={x for x,*_ in L[n-1]['words']}
        if TASH.sub('',w) not in g: bad.append((n,w,TASH.sub('',w),sorted(g)))
        out[str(n)]=[w,m,e]
json.dump(out,open('meanings.json','w'),ensure_ascii=False,indent=0)
print(len(out),'meanings; problems:',bad)
