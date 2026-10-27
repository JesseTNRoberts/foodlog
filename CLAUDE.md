# Plate Log: instructions for Claude

This repo is Jesse's food log and recipe box. Pushing to `main` rebuilds the public site (GitHub Pages) in about a minute. Jesse logs food by telling Claude what he ate, often with a photo. Claude estimates the nutrition, writes the entry here, and pushes.

## Logging an entry
1. Read `reference/nutrition-estimates.md` (how Jesse cooks, hand-size scale, per-unit numbers) and the matching recipe in `recipes/` before estimating.
2. Size portions from the photo or description, not from logged norms. Give an honest range.
3. Append the entry to `entries/YYYY/YYYY-MM-DD.json` (create the file if needed). Use Jesse's local date (US Eastern unless he says otherwise).
4. Run `node scripts/build.mjs`. It validates every file and fails with a clear message on a bad entry.
5. Commit with a message like `Log 2026-10-25: chicken étouffée, hush puppies` and push.
6. Reply with the entry's calories and macros in one or two lines and a link to the day: `https://jessetnroberts.github.io/foodlog/#/day/YYYY-MM-DD`.

Ask at most one short question, and only when the answer would swing the estimate a lot. Otherwise state the assumption in `notes`.

## Day file format
```json
{
  "date": "2026-10-25",
  "note": "optional one-line note about the day",
  "entries": [
    {
      "id": "2026-10-25-1",
      "name": "Fried egg sandwich",
      "portion": "2 eggs, thin sourdough",
      "meal": "breakfast",
      "servings": 1,
      "kcal": 355, "lo": 345, "hi": 365,
      "protein": 18, "carbs": 30, "fat": 17, "satfat": 4.5,
      "fiber": 2, "sugar": 3, "addedSugar": 0,
      "sodium": 620, "cholesterol": 375,
      "micros": {"vitA": 200, "vitC": 8, "vitD": 2.2, "vitE": 1.5, "vitK": 60, "b6": 0.3, "b12": 0.9,
                 "folate": 110, "calcium": 90, "iron": 3, "magnesium": 35, "potassium": 330, "zinc": 1.6},
      "components": [
        {"name": "Thin sourdough", "portion": "2 slices", "kcal": 140, "protein": 5, "carbs": 27, "fat": 1}
      ],
      "confidence": "high",
      "notes": "Key assumption and biggest uncertainty, one line."
    }
  ]
}
```
- `meal`: `breakfast`, `lunch`, `dinner` or `snacks`.
- All nutrient values are for ONE serving; the site multiplies by `servings`.
- `kcal` is the best estimate; `lo` / `hi` bound the plausible range.
- Units: grams for macros, fiber and sugars; mg for sodium, cholesterol, vitC, vitE, b6, calcium, iron, magnesium, potassium and zinc; mcg for vitA (RAE), vitD, vitK, b12 and folate (DFE).
- `components` list every visible ingredient and should sum to the entry totals. The site shows them as a composition bar and table, so make them specific ("Olive oil on sweet potato, ~1 tbsp", not "oil").
- `confidence`: `high` (his own recipe, known amounts), `medium` (photo with hand scale), `low` (restaurant/bakery item, size guessed).
- `photos` (optional): paths to the meal photos, e.g. `["photos/2026/2026-10-26/dinner-quinoa-bowl.jpg"]`. Save every photo Jesse sends with a meal: rotate upright, resize to 1280 px on the long side, JPEG quality 80, and strip all metadata (EXIF holds GPS location and the site is public). One photo can be listed on several entries.
- `id`: `YYYY-MM-DD-N`, unique in the file. Keep ids stable when editing.

## Edits
The site's "Ask Claude to edit" button copies a line like `Plate Log edit, 2026-10-25, lunch, "Hush puppies" (240 kcal): `, followed by Jesse's change. Find that entry by date and name, change it, rebuild, commit (`Edit 2026-10-25: hush puppies, 3 not 5`) and push. When a portion changes, scale the components and all totals together, micronutrients included.

## Recipes
Recipes live in `recipes/*.md`, one file per collection, one `## Recipe name` heading per recipe. The site lists every `##` heading as a recipe and has search. Add new recipes to the fitting collection, keep "Gap:" notes for missing parts, and add a nutrition line once one has been worked out.

## Settings
`settings.json` holds the daily calorie budget, protein and fiber goals, the sodium limit, and the repo name used for "Edit file" links.
