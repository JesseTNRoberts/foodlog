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
        {"name": "Sourdough, thin slices", "portion": "2 slices (~52 g)", "grams": 52,
         "kcal": 141, "protein": 5.7, "carbs": 27, "fat": 0.9, "satfat": 0.2, "fiber": 1.1, "sugar": 1, "addedSugar": 0.5,
         "sodium": 312, "cholesterol": 0,
         "micros": {"vitA": 0, "vitC": 0, "vitD": 0, "vitE": 0.1, "vitK": 0.4, "b6": 0.03, "b12": 0, "folate": 83,
                    "calcium": 26, "iron": 1.8, "magnesium": 14, "potassium": 60, "zinc": 0.5}}
      ],
      "confidence": "high",
      "notes": "Key assumption and biggest uncertainty, one line."
    }
  ]
}
```
- `portion`: say the percent eaten in words too ("~33% of the sandwich").
- `meal`: `breakfast`, `lunch`, `dinner` or `snacks`.
- All nutrient values are for ONE serving; the site multiplies by `servings`.
- `kcal` is the best estimate; `lo` / `hi` bound the plausible range.
- Units: grams for macros, fiber and sugars; mg for sodium, cholesterol, vitC, vitE, b6, calcium, iron, magnesium, potassium and zinc; mcg for vitA (RAE), vitD, vitK, b12 and folate (DFE).
- `components` are the ingredients, and every nutrient is estimated **per ingredient**: give each one `grams` plus the same fields as the entry (kcal, protein, carbs, fat, satfat, fiber, sugar, addedSugar, sodium, cholesterol and the 13 `micros`). The entry totals are the sums of its components (the build checks kcal, protein, fat and sodium). Break dishes into real ingredients, including hidden ones ("Butter in the roux, ~1 tbsp", "Frying oil absorbed, ~2 tsp"), so the site's "which foods did this come from" pie charts show actual sources (spinach for vitamin K, buffalo sauce for sodium). For a home recipe, scale the batch's ingredients to the portion and label them "(in the Gruyère quinoa)".
- `confidence`: `high` (his own recipe, known amounts), `medium` (photo with hand scale), `low` (restaurant/bakery item, size guessed).
- `eaten` (required): `{"pct": 33, "of": "whole sandwich"}`. Always estimate the percent of the item he ate, never "some" or "finished it". `of` names what 100% is (the whole dish as served), so if he eats more later he can say "the other 50%" and the later entry uses the same base, e.g. `{"pct": 67, "of": "whole sandwich (the rest)"}`.
- `ingredients` (required): a best-guess list of everything likely in the dish, including hidden items (cooking fat, butter in sauces, breading, dressing parts), even when not visible. Keep it plain strings. Look it up first when possible: for restaurant food, search for the restaurant's menu description; for his own cooking, use the recipe in `recipes/`. Fill hidden items in from there.
- `ingredientsFrom`: `menu` (restaurant's published description), `recipe` (his recipe or his own words) or `guess`. Say in `notes` when a menu lookup found nothing.
- `photos` (optional): paths to the meal photos, e.g. `["photos/2026/2026-10-26/dinner-quinoa-bowl.jpg"]`. Save every photo Jesse sends with a meal: rotate upright, resize to 1280 px on the long side, JPEG quality 80, and strip all metadata (EXIF holds GPS location and the site is public). One photo can be listed on several entries.
- `id`: `YYYY-MM-DD-N`, unique in the file. Keep ids stable when editing.

## Edits
The site's "Ask Claude to edit" button copies a line like `Plate Log edit, 2026-10-25, lunch, "Hush puppies" (240 kcal): `, followed by Jesse's change. Find that entry by date and name, change it, rebuild, commit (`Edit 2026-10-25: hush puppies, 3 not 5`) and push. When a portion changes, scale the components and all totals together, micronutrients included.

## Recipes
Recipes live in `recipes/*.md`, one file per collection, one `## Recipe name` heading per recipe. The site lists every `##` heading as a recipe and has search. Add new recipes to the fitting collection, keep "Gap:" notes for missing parts, and add a nutrition line once one has been worked out.

## Settings
`settings.json` holds the daily calorie budget, protein and fiber goals, the sodium limit, and the repo name used for "Edit file" links.
