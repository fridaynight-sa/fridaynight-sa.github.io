# لوحة الكلمات — how the 400 levels are made

What is here:
- `levels.json` — the 400 levels as they are in the game (letters, board, which words are classical).
- `grid_words.json` — the words allowed in a board (about 7,600). Every one was read and kept by hand: correct spelling
  (hamza, ة/ه, ى/ي), no names, no slang, nothing unsuitable for a family. Sources: the most frequent words of
  FrequencyWords (MIT) that are also in the Ayaspell Arabic spell-checker, plus `fasih.json`.
- `fasih.json` — classical (فصيحة) words written by hand; `jazl.json` — the really classical ones (جزلة) that levels
  101–400 must contain: one per level at first, two or three near the end, never more than about a third of a board.
- `clues.json` — for each classical word: the word with its vowels, its meaning (shown when the player taps it — it
  never contains the word itself), an example.
- `meanings.json` — «كلمة ومعناها» shown after each level (always a word that is in that level's board).
- `bonus_extra.json` — more real words (verb forms, plurals…) that count as «كلمة إضافية». Checked one by one:
  no names, no foreign words, no slang, no word glued to و/ب/ل or to a pronoun.
- `block.json` — words never accepted, even as «كلمة إضافية».
- `mean/` — the same meanings as text, the way they were written (`level|word|meaning|example`).

Steps (Python 3, no extra packages):
```
python3 prep.py work/                       # downloads the two sources into work/
cp grid_words.json fasih.json jazl.json work/
python3 gen.py work/                        # levels 1–100 come from here (and were kept as they are)
python3 gen_fasih.py work/ levels.json out.json   # rebuilds 101–400 with classical words, keeps 1–100
python3 check.py out.json                   # every level: letters suffice, no stray runs, connected, nothing repeated
python3 export.py out.json ../../mind/words/levels.js .
```
If the levels change, `meanings.json` must be redone: its word has to be in that level's board.
The game starts again a level that changed for a player who was in the middle of it (it keeps a fingerprint of the
level in `cur.k`).

No verbs like «يلبس» or «يسأل» on a board (the owner's choice, Oct 2026): `fix_verbs.py <data dir>` rebuilt the 107 levels
that had one (same letters where it could, otherwise a new base), writing `levels_noverbs.json`; the 40 levels whose
«كلمة ومعناها» word left the board got a new one (in `meanings.json`, also listed at the end of `mean/extra_mean.txt`).
Those verbs still count as «كلمة إضافية».

No verbs at all, and no foreign or non-standard words, on a board (the owner's choice, Nov 2026): `board_block.txt` lists them
(«قال، نام، أصبح، اجتمع…»، «تلفزيون، بلاستيك، أكتوبر…»، «ضغوطات، تواجد»). Words that are also nouns stay («علم، عمل، تعاون»).
`fix_words.py <data dir>` (with the list as `bad.txt`) rebuilt the 192 levels that had one, with classical words in their place; the
107 «كلمة ومعناها» that left the board were rewritten (end of `mean/extra_mean.txt`). They were also taken out of `grid_words.json`.

More classical words and fewer repeats (the owner's request, Nov 2026): `gen_fasih2.py <data dir> levels.json out.json` rebuilds
101–400 like `gen_fasih.py`, but: every verb in the list is kept off the boards (`board_block.txt`, about 1,150 words), a word
already on a board is not put on another when the letters allow, and a classical word comes back at most once, 60 levels later
(a few of the last 7-letter boards take one a third time). `clues.json` now has the meaning of 479 classical words, and each
level's «كلمة ومعناها» is one of its classical words.
