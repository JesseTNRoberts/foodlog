// Builds the static site into _site/: validates every entry file, bundles all
// days, settings and recipes into data.json, and copies the site shell.
// Run: node scripts/build.mjs   (no dependencies)
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const out = path.join(root, "_site");
const MEALS = ["breakfast", "lunch", "dinner", "snacks"];
const NUMS = ["kcal", "lo", "hi", "protein", "carbs", "fat", "satfat", "fiber", "sugar", "addedSugar", "sodium", "cholesterol"];
const MICROS = ["vitA", "vitC", "vitD", "vitE", "vitK", "b6", "b12", "folate", "calcium", "iron", "magnesium", "potassium", "zinc"];
const errors = [];

function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(d =>
    d.isDirectory() ? walk(path.join(dir, d.name)) : [path.join(dir, d.name)]);
}

function checkEntry(e, where) {
  if (!e || typeof e !== "object") return errors.push(`${where}: not an object`);
  if (!e.name) errors.push(`${where}: missing name`);
  if (!MEALS.includes(e.meal)) errors.push(`${where}: meal must be one of ${MEALS.join(", ")}`);
  if (typeof e.kcal !== "number") errors.push(`${where}: kcal must be a number`);
  for (const f of NUMS) if (e[f] != null && typeof e[f] !== "number") errors.push(`${where}: ${f} must be a number`);
  for (const k of Object.keys(e.micros || {})) {
    if (!MICROS.includes(k)) errors.push(`${where}: unknown micronutrient "${k}" (use ${MICROS.join(", ")})`);
    else if (typeof e.micros[k] !== "number") errors.push(`${where}: micros.${k} must be a number`);
  }
  if (e.eaten != null && (typeof e.eaten !== "object" || typeof e.eaten.pct !== "number" || e.eaten.pct <= 0 || e.eaten.pct > 100))
    errors.push(`${where}: eaten must be {"pct": 1-100, "of": "what the 100% is"}`);
  if (e.ingredients != null && (!Array.isArray(e.ingredients) || e.ingredients.some(x => typeof x !== "string")))
    errors.push(`${where}: ingredients must be an array of strings`);
  if (e.ingredientsFrom != null && !["menu", "recipe", "guess"].includes(e.ingredientsFrom))
    errors.push(`${where}: ingredientsFrom must be menu, recipe or guess`);
  if (e.photos != null) {
    if (!Array.isArray(e.photos)) errors.push(`${where}: photos must be an array of paths`);
    else for (const p of e.photos) {
      if (typeof p !== "string" || !p.startsWith("photos/")) errors.push(`${where}: photo "${p}" must be a path under photos/`);
      else if (!fs.existsSync(path.join(root, p))) errors.push(`${where}: photo file not found: ${p}`);
    }
  }
}

const days = [];
for (const file of walk(path.join(root, "entries")).filter(f => f.endsWith(".json")).sort()) {
  const rel = path.relative(root, file);
  let doc;
  try { doc = JSON.parse(fs.readFileSync(file, "utf8")); }
  catch (err) { errors.push(`${rel}: invalid JSON (${err.message})`); continue; }
  const date = path.basename(file, ".json");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) { errors.push(`${rel}: file name must be YYYY-MM-DD.json`); continue; }
  if (doc.date && doc.date !== date) errors.push(`${rel}: "date" (${doc.date}) doesn't match the file name`);
  if (!Array.isArray(doc.entries)) { errors.push(`${rel}: "entries" must be an array`); continue; }
  doc.entries.forEach((e, i) => {
    checkEntry(e, `${rel} entry ${i + 1}`);
    e.servings ??= 1;
    e.id ??= `${date}-${i + 1}`;
  });
  days.push({ date, note: doc.note || "", entries: doc.entries });
}

const settings = JSON.parse(fs.readFileSync(path.join(root, "settings.json"), "utf8"));

const recipes = walk(path.join(root, "recipes")).filter(f => f.endsWith(".md")).sort().map(f => {
  const md = fs.readFileSync(f, "utf8");
  const title = (md.match(/^#\s+(.+)$/m) || [, path.basename(f, ".md")])[1].trim();
  return { slug: path.basename(f, ".md"), title, md };
});

if (errors.length) {
  console.error("Build failed:\n  " + errors.join("\n  "));
  process.exit(1);
}

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });
for (const f of fs.readdirSync(path.join(root, "site"))) fs.copyFileSync(path.join(root, "site", f), path.join(out, f));
if (fs.existsSync(path.join(root, "photos"))) fs.cpSync(path.join(root, "photos"), path.join(out, "photos"), { recursive: true });
fs.writeFileSync(path.join(out, "data.json"), JSON.stringify({ generated: new Date().toISOString(), settings, days, recipes }));
fs.writeFileSync(path.join(out, ".nojekyll"), "");
const n = days.reduce((a, d) => a + d.entries.length, 0);
console.log(`Built _site: ${days.length} days, ${n} entries, ${recipes.length} recipe files.`);
