# downloads the two word sources and makes the files gen.py needs, in the folder given (default: here)
#   ar_full.txt      word frequencies from subtitles — FrequencyWords, MIT licence (hermitdave/FrequencyWords)
#   hun_words.json   every bare word of the Arabic spell-checker (Ayaspell, LibreOffice dictionaries) with its section
#   bonus_dict.json  words that count as «كلمة إضافية»: the spell-checker's words (no names) minus block.json
import json, os, sys, urllib.request
D = sys.argv[1] if len(sys.argv) > 1 else os.path.dirname(os.path.abspath(__file__))
HERE = os.path.dirname(os.path.abspath(__file__))
get = lambda url, f: os.path.exists(f) or urllib.request.urlretrieve(url, f)
get("https://raw.githubusercontent.com/hermitdave/FrequencyWords/master/content/2018/ar/ar_full.txt", f"{D}/ar_full.txt")
get("https://raw.githubusercontent.com/LibreOffice/dictionaries/master/ar/ar.dic", f"{D}/ar.dic")
L = set("ابتثجحخدذرزسشصضطظعغفقكلمنهوي" + "أإآءؤئةى")
sec, words = "?", {}
for i, line in enumerate(open(f"{D}/ar.dic", encoding="utf-8")):
    line = line.rstrip("\n")
    if i == 0: continue
    if line.startswith("#"):
        if "stopwords.dic" in line: sec = "stop"
        elif "tools.dic" in line: sec = "tools"
        elif "names.dic" in line: sec = "names"
        elif line.strip("#") == "الأسماء": sec = "nouns"
        elif "verb.huns.dic" in line: sec = "verbs"
        continue
    w = line.split("/")[0].split("\t")[0].strip()
    if w and all(c in L for c in w) and w not in words: words[w] = sec
json.dump(words, open(f"{D}/hun_words.json", "w"), ensure_ascii=False)
G = set(json.load(open(f"{HERE}/grid_words.json")))
block = set(json.load(open(f"{HERE}/block.json")))
B = {w for w, s in words.items() if s != "names" and 3 <= len(w) <= 7 and w not in block} | G
json.dump(sorted(B), open(f"{D}/bonus_dict.json", "w"), ensure_ascii=False)
print(len(words), "spell-checker words,", len(B), "bonus words")
