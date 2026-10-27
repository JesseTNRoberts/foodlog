"""Import a Lose It food-logs.csv export into entries/YYYY/YYYY-MM-DD.json.

One entry per day and Lose It meal, with each logged food as a component.
Skips any day that already has a day file, so days logged in Plate Log are never overwritten.
Run: python3 scripts/import-loseit.py reference/loseit-food-logs.csv
"""
import csv, json, os, sys, collections
from datetime import datetime

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MEAL = {"Breakfast": "breakfast", "Lunch": "lunch", "Dinner": "dinner", "Snacks": "snacks",
        "Morning Snacks": "snacks", "Afternoon Snacks": "snacks", "Coffee": "snacks"}
ORDER = ["Breakfast", "Morning Snacks", "Coffee", "Lunch", "Afternoon Snacks", "Dinner", "Snacks"]
COLS = {"protein": "Protein (g)", "carbs": "Carbohydrates (g)", "fat": "Fat (g)", "satfat": "Saturated Fat (g)",
        "fiber": "Fiber (g)", "sugar": "Sugars (g)", "sodium": "Sodium (mg)", "cholesterol": "Cholesterol (mg)"}
FRAC = {0.125: "1/8", 0.25: "1/4", 0.333: "1/3", 0.375: "3/8", 0.5: "1/2", 0.625: "5/8", 0.667: "2/3", 0.75: "3/4", 0.875: "7/8"}

def qty(q):
    q = float(q.replace(",", "")); whole, part = int(q), round(q - int(q), 3)
    f = next((v for k, v in FRAC.items() if abs(k - part) < 0.01), None)
    if part == 0: return str(whole)
    if f: return f"{whole} {f}" if whole else f
    return f"{q:g}"

def val(s):
    try: return round(float(s.replace(",", "")), 1)
    except ValueError: return None

def main(path):
    rows = [r for r in csv.DictReader(open(path, encoding="utf-8-sig")) if r["Deleted"] == "0"]
    days = collections.defaultdict(lambda: collections.defaultdict(list))
    for r in rows:
        d = datetime.strptime(r["Date"], "%m/%d/%Y").strftime("%Y-%m-%d")
        days[d][r["Meal"]].append(r)
    wrote = skipped = 0
    for d in sorted(days):
        f = os.path.join(ROOT, "entries", d[:4], d + ".json")
        if os.path.exists(f): skipped += 1; continue
        entries = []
        for label in sorted(days[d], key=lambda m: ORDER.index(m) if m in ORDER else 99):
            comps = []
            for r in days[d][label]:
                c = {"name": r["Name"].strip(), "portion": f'{qty(r["Quantity"])} {r["Units"].lower()}', "kcal": round(float((r["Calories"] or "0").replace(",", "")))}
                for k, col in COLS.items():
                    v = val(r[col])
                    if v is not None: c[k] = v
                comps.append(c)
            comps.sort(key=lambda c: -c["kcal"])
            names = [c["name"] for c in comps]
            title = " · ".join(names[:3]) + (f" + {len(names) - 3} more" if len(names) > 3 else "")
            e = {"id": f"{d}-{len(entries) + 1}", "name": title,
                 "portion": f"{label} · {len(comps)} food{'s' if len(comps) != 1 else ''} as logged",
                 "meal": MEAL.get(label, "snacks"), "servings": 1, "kcal": sum(c["kcal"] for c in comps)}
            for k in COLS:
                e[k] = round(sum(c.get(k, 0) for c in comps), 1)
            e.update(components=comps, eaten={"pct": 100, "of": "as logged"}, ingredients=names,
                     ingredientsFrom="recipe", confidence="high", source="loseit",
                     notes="Imported from Lose It. No vitamin or mineral data.")
            entries.append(e)
        os.makedirs(os.path.dirname(f), exist_ok=True)
        with open(f, "w") as out:
            json.dump({"date": d, "note": "Imported from Lose It", "entries": entries}, out, indent=1, ensure_ascii=False)
            out.write("\n")
        wrote += 1
    print(f"Wrote {wrote} days from {len(rows)} logged foods; skipped {skipped} days that already had a file.")

if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, "reference", "loseit-food-logs.csv"))
