"""جماد حيوان إنسان: builds jhi/words.json from the lists here (one .txt per category).
In a list: words are separated by spaces, «_» joins two words into one answer (أم_علي = «أم علي»).
The older lists wrote some two-word answers with a space: PHRASES puts them back together.
   python3 scripts/jhi/build.py"""
import json, pathlib, re
HERE = pathlib.Path(__file__).resolve().parent
OUT = HERE.parent.parent / "jhi" / "words.json"
CATS = ["insan", "hayawan", "nabat", "jamad", "bilad", "akla", "mihna", "sayyara", "musalsal", "laeb", "marka"]
PHRASES = {
 "hayawan": ["أبو بريص", "أم أربعة وأربعين", "أبو فصادة", "جراد البحر", "حوت ازرق", "ديك رومي", "دب قطبي", "سيد قشطة", "مالك الحزين", "وحيد القرن", "قنديل البحر", "خنزير بري"],
 "nabat": ["أرضي شوكي", "ارضي شوكي", "جوز الهند", "توت شامي", "حبة البركة", "حبة سوداء", "تمر هندي", "ورد جوري", "شقائق النعمان", "عباد الشمس", "عيش الغراب", "فول سوداني", "فلفل حار", "فلفل رومي", "قصب السكر", "ورق عنب", "يوسف افندي", "ذرة صفراء", "ذيل القط", "بخور مريم"],
 "jamad": ["آلة حاسبة", "الة حاسبة", "تي شيرت", "دراجة نارية", "ربطة عنق", "شجرة صناعية", "لاب توب"],
 "bilad": ["المدينة المنورة", "مكة المكرمة", "أم القيوين", "رأس الخيمة", "خميس مشيط", "حفر الباطن", "حوطة سدير", "وادي الدواسر", "وادي فاطمة", "وادي حضرموت", "رأس تنورة", "رجال ألمع", "مهد الذهب", "دومة الجندل", "سراة عبيدة", "ظهران الجنوب", "جنوب أفريقيا", "جزر القمر", "كوت ديفوار", "الولايات المتحدة", "بيت لحم", "تل أبيب", "جبل طارق", "دار السلام", "دير الزور", "ريو دي جانيرو", "رام الله", "سان فرانسيسكو", "ساو باولو", "شرم الشيخ", "عين شمس", "غيل باوزير", "كيب تاون", "لوس أنجلوس", "هونغ كونغ", "بور سعيد", "خان يونس", "نيو يورك"],
}
REMOVE = {"insan": "عتيبة طفلة جازع حجاب حمير",
 "hayawan": "ذرة اسم سيبيريا فسيفساء تاتو تمير جرير شعري بلم حنيني زغبي هيلمان هرير عكاوي قاووق دامور ضاري ضبي بربور سرب برمائي لافقاريات",
 "nabat": "روبيان شعلة ترتر جادي ودع حمر", "jamad": "شنب بلك جك", "akla": "أقراص", "mihna": "بلدوزر ذهبي هندسي ظابط يد_عاملة تقنية جيولوجية",
 "sayyara": "ربع نيسا", "laeb": "ريال ريكي روبن", "marka": "لاعب_سوني أبو_ظبي"}
out = {}
for c in CATS:
    t = "\n".join(l for l in (HERE / (c + ".txt")).read_text(encoding="utf-8").splitlines() if not l.startswith("#"))
    for p in PHRASES.get(c, []): t = t.replace(p, p.replace(" ", "_"))
    rm = set(REMOVE.get(c, "").split())
    seen, ws = set(), []
    for w in t.split():
        if w in rm or w in seen: continue
        seen.add(w); ws.append(w.replace("_", " "))
    out[c] = ws
OUT.write_text(json.dumps({"v": 1, "cats": out}, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
print({c: len(v) for c, v in out.items()}, sum(map(len, out.values())), "words,", OUT.stat().st_size // 1024, "KB")
