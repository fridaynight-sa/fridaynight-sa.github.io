# لوحة الكلمات — how the 400 levels are made

Files here:
- `grid_words.json` — the words allowed in a board (about 7,000). Every one was read and kept by hand: correct spelling
  (hamza, ة/ه, ى/ي), no names, no slang, nothing unsuitable for a family. Sources: the most frequent words of
  FrequencyWords (MIT) that are also in the Ayaspell Arabic spell-checker.
- `block.json` — words never accepted, even as «كلمة إضافية».
- `mean/m*.txt` — «كلمة ومعناها» for each level: `level|word with vowels|meaning|example`.

Steps (Python 3, no extra packages):
```
python3 prep.py work/          # downloads the two sources into work/ and builds hun_words.json + bonus_dict.json
cp grid_words.json work/
python3 gen.py work/           # ~7 minutes → work/levels_out.json
python3 check.py work/levels_out.json      # every level: letters suffice, no stray runs, connected, nothing repeated
cd work && cp levels_out.json levels_final.json && mkdir -p mean && cp ../mean/*.txt mean/
python3 ../mcheck.py           # meanings: the word must be in that level's board → meanings.json
python3 ../export.py levels_final.json ../../../mind/words/levels.js
```
Changing the levels changes their words, so the meanings in `mean/` must be checked again (`mcheck.py` lists any
meaning whose word is no longer in its level).
