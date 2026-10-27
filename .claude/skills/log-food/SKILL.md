---
name: "log-food"
description: "Use when Jesse tells Claude what he ate or sends a meal photo to log: estimate nutrition and add the entry to his foodlog repo and website."
---

# Log food to Plate Log

Jesse's food log is the GitHub repo **JesseTNRoberts/foodlog**. Every push to `main` rebuilds the site at **https://jessetnroberts.github.io/foodlog/** in about a minute. Any meal he describes or photographs should end up there, not just as an estimate in chat.

## Steps
1. **Get the repo.** If it isn't already in the session, attach it with push access (`add_repo` owner `JesseTNRoberts`, repo `foodlog`, access `push`), then `git clone --depth 1 https://github.com/JesseTNRoberts/foodlog`. If a clone exists, `git pull --ff-only` first.
2. **Read the rules and defaults in the repo:** `CLAUDE.md` (entry format), `reference/nutrition-estimates.md` (how he cooks, hand-size scale, per-unit numbers) and the matching recipe in `recipes/`. If the session has no repo access at all, fall back to the Eating project's `claude/nutrition-estimates.md`.
3. **Estimate.** Size portions from the photo (his left hand is the scale) or his words, not from old logged norms. Restaurant food: he often eats a third to a half; estimate what he ate. **Always give the percent of the item eaten** (`eaten: {pct, of}`), never "some" or "finished it", so a later "I ate another 50%" maps to the same base. Also list the **full ingredients** for each entry (`ingredients`), including hidden fat, breading and dressing parts. Look them up first when possible (search the restaurant's menu description; use his recipe for home cooking) and set `ingredientsFrom` to `menu`, `recipe` or `guess`. List every component, including hidden oil, dressing, cheese and nuts. Give an honest lo/hi range.
4. **Ask at most one short question**, only if the answer would swing the total a lot. Otherwise state the assumption in `notes` and log it.
5. **Write the entry** into `entries/YYYY/YYYY-MM-DD.json` using his local date (US Eastern unless he says otherwise; when the date is ambiguous, ask). Include the full format from `CLAUDE.md`: per-serving kcal, lo, hi, protein, carbs, fat, satfat, fiber, sugar, addedSugar, sodium, cholesterol, the 13 micronutrients, per-ingredient components (each with grams and every nutrient, micros included) whose sums are the entry totals, `eaten` percent, `ingredients`, `ingredientsFrom`, confidence, and notes. Pick the meal (breakfast, lunch, dinner, snacks) from what he says or the time.
6. **Save his photos.** Save every meal photo he sent to `photos/YYYY/YYYY-MM-DD/<meal>-<food>.jpg`: rotate upright, resize to 1280 px on the long side, JPEG quality 80, and strip all metadata, since EXIF holds GPS and the site is public. Add the paths to the entry's `photos` array.
7. **Validate and publish:** `node scripts/build.mjs` (fix any error it reports), then commit (`Log YYYY-MM-DD: short food list`) and push.
8. **Reply briefly:** the percent eaten, the guessed ingredients, one small table of components, the total with range and macros, the main uncertainty, and the link `https://jessetnroberts.github.io/foodlog/#/day/YYYY-MM-DD`.

## Edits
The site's "Ask Claude to edit" button copies a line like `Plate Log edit, 2026-10-25, lunch, "Hush puppies" (240 kcal): ` followed by his change. Find that entry by date and name, update it (scale components, totals and micronutrients together when a portion changes), rebuild, commit (`Edit YYYY-MM-DD: what changed`) and push.

## Recipes
When he shares or changes a recipe, update both the repo's `recipes/` file (one `## Name` heading per recipe) and the Eating project's matching recipe doc.

## If pushing fails
Say so plainly, keep the entry committed locally, and tell him the Claude GitHub App needs access to the foodlog repo (https://github.com/apps/claude/installations/select_target).