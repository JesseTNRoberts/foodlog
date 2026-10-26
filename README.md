# Plate Log

Jesse's food log and recipe box, published as a website with daily nutrition dashboards, trends and recipes.

- **Day:** calories against budget, protein, fiber and sodium, where the calories came from, macro split, every meal broken into its components, and vitamins and minerals as % of daily value.
- **Trends:** any nutrient by day with a 7-day average and target line, calories by macro and by meal, average micronutrients, and a table of daily totals.
- **Recipes:** every recipe in `recipes/`, searchable.

## How it works
- `entries/YYYY/YYYY-MM-DD.json`: one file per day (format in `CLAUDE.md`).
- `recipes/*.md`: recipe collections.
- `reference/`: cooking defaults and portion scale used for estimates.
- `.claude/skills/log-food/SKILL.md`: the logging skill Claude follows (a copy of the account skill, so any session working in this repo picks it up).
- `scripts/build.mjs`: validates the data and builds `_site/` (no dependencies).
- `.github/workflows/pages.yml`: builds and publishes to GitHub Pages on every push to `main`.

Preview locally: `node scripts/build.mjs && npx serve _site` (or any static server).
