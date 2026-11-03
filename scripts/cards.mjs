// Recipe cards: recipes/cards/<id>.json. A card holds a recipe's batch yield by volume
// and every ingredient with its batch amount, grams, whole-food score and nutrition per 100 g,
// so a portion ("1/2 cup of my spaghetti") scales into entry components exactly.
// Used by scripts/build.mjs (validation, site data) and scripts/recipe.mjs (logging).
import fs from "node:fs";
import path from "node:path";

export const NUTS = ["kcal", "protein", "carbs", "fat", "satfat", "fiber", "sugar", "addedSugar", "sodium", "cholesterol"];
export const MICROS = ["vitA", "vitC", "vitD", "vitE", "vitK", "b6", "b12", "folate", "calcium", "iron", "magnesium", "potassium", "zinc"];

// Volume units, in cups. "batch" means the whole recipe; "%" means percent of the batch.
export const UNITS = {
  cup: 1, cups: 1, c: 1,
  tbsp: 1 / 16, tablespoon: 1 / 16, tablespoons: 1 / 16,
  tsp: 1 / 48, teaspoon: 1 / 48, teaspoons: 1 / 48,
  "fl oz": 1 / 8, floz: 1 / 8,
  ml: 1 / 236.588, l: 1000 / 236.588, liter: 1000 / 236.588,
  pint: 2, pints: 2, quart: 4, quarts: 4,
};

const r = (n, dp = 2) => Math.round(n * 10 ** dp) / 10 ** dp;

export function loadCards(root) {
  const dir = path.join(root, "recipes", "cards");
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter(f => f.endsWith(".json")).sort().map(f => {
    const rel = path.join("recipes", "cards", f);
    try { return { rel, card: JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")) }; }
    catch (err) { return { rel, error: `invalid JSON (${err.message})` }; }
  });
}

export function checkCard(card, rel, recipeFiles) {
  const errs = [];
  if (!card.id || !/^[a-z0-9-]+$/.test(card.id)) errs.push(`${rel}: id must be lowercase letters, digits and dashes`);
  if (path.basename(rel, ".json") !== card.id) errs.push(`${rel}: file name must match id "${card.id}"`);
  if (!card.name) errs.push(`${rel}: missing name`);
  const y = card.yield || {};
  if (!(y.amount > 0) || !(UNITS[y.unit] || y.unit === "serving")) errs.push(`${rel}: yield must be {"amount": >0, "unit": "cup"|"tbsp"|... or "serving"}`);
  if (card.recipe) {
    const md = recipeFiles[card.recipe.file];
    if (md == null) errs.push(`${rel}: recipe.file "${card.recipe.file}" not found in recipes/`);
    else if (!md.split(/^##\s+/m).slice(1).some(p => p.split("\n")[0].trim() === card.recipe.heading))
      errs.push(`${rel}: no "## ${card.recipe.heading}" heading in recipes/${card.recipe.file}.md`);
  }
  if (!Array.isArray(card.ingredients) || !card.ingredients.length) errs.push(`${rel}: ingredients must be a non-empty array`);
  (card.ingredients || []).forEach((g, i) => {
    const w = `${rel} ingredient ${i + 1} (${g.name || "?"})`;
    if (!g.name) errs.push(`${w}: missing name`);
    if (!g.amount) errs.push(`${w}: missing amount (as written in the recipe, e.g. "1 lb")`);
    if (!(g.grams >= 0)) errs.push(`${w}: grams must be a number`);
    if (!(g.whole >= 0 && g.whole <= 1)) errs.push(`${w}: whole must be 0–1`);
    const p = g.per100g || {};
    for (const k of NUTS) if (typeof p[k] !== "number") errs.push(`${w}: per100g.${k} must be a number`);
    for (const k of MICROS) if (typeof (p.micros || {})[k] !== "number") errs.push(`${w}: per100g.micros.${k} must be a number`);
  });
  return errs;
}

// Parse "1/2 cup", "1 1/2 cups", "0.75 cup", "3 tbsp", "25%", "1 batch", "2 servings".
export function parsePortion(text, card) {
  const s = String(text).trim().toLowerCase();
  const m = s.match(/^(\d+\s+\d+\/\d+|\d+\/\d+|\d*\.?\d+)\s*(.*)$/);
  if (!m) throw new Error(`Can't read portion "${text}" (try "1/2 cup", "3 tbsp", "25%")`);
  const amt = m[1].split(/\s+/).reduce((a, p) => a + (p.includes("/") ? p.split("/")[0] / p.split("/")[1] : +p), 0);
  const unit = m[2].trim().replace(/\.$/, "");
  const y = card.yield;
  let fraction;
  if (unit === "%") fraction = amt / 100;
  else if (unit === "batch" || unit === "batches" || unit === "recipe") fraction = amt;
  else if (unit === "serving" || unit === "servings") {
    if (y.unit !== "serving") throw new Error(`${card.id} yields ${y.amount} ${y.unit}; give a volume instead of servings`);
    fraction = amt / y.amount;
  } else if (UNITS[unit] != null) {
    if (y.unit === "serving") throw new Error(`${card.id} yields servings; give servings, % or batch`);
    fraction = (amt * UNITS[unit]) / (y.amount * UNITS[y.unit]);
  } else throw new Error(`Unknown unit "${unit}" in "${text}"`);
  return { fraction, label: `${m[1]} ${unit}`.trim() };
}

export function scaleComponent(g, fraction, cardName) {
  const grams = g.grams * fraction, s = grams / 100, p = g.per100g;
  const c = { name: `${g.name} (in the ${cardName})`, portion: `~${r(grams, 1)} g (${g.amount} per batch)`, grams: r(grams, 1) };
  for (const k of NUTS) c[k] = r(p[k] * s);
  c.micros = Object.fromEntries(MICROS.map(k => [k, r(p.micros[k] * s, 3)]));
  c.whole = g.whole;
  return c;
}

export function batchTotals(card) {
  const comps = card.ingredients.map(g => scaleComponent(g, 1, card.short || card.name.toLowerCase()));
  const t = Object.fromEntries(NUTS.map(k => [k, r(comps.reduce((a, c) => a + c[k], 0), 1)]));
  t.micros = Object.fromEntries(MICROS.map(k => [k, r(comps.reduce((a, c) => a + c.micros[k], 0), 2)]));
  t.grams = r(comps.reduce((a, c) => a + c.grams, 0), 0);
  return { totals: t, comps };
}

// Build a complete entry for a portion of a card.
export function entryFromCard(card, portionText, { id, meal, notes, pctOf } = {}) {
  const { fraction, label } = parsePortion(portionText, card);
  const comps = card.ingredients.map(g => scaleComponent(g, fraction, card.short || card.name.toLowerCase()));
  const sum = k => comps.reduce((a, c) => a + c[k], 0);
  const e = { id, name: card.name, portion: `${label}; 100% eaten`, meal, servings: 1, recipeCard: card.id };
  for (const k of NUTS) e[k] = r(sum(k), 1);
  e.kcal = Math.round(sum("kcal"));
  e.lo = Math.round(e.kcal * 0.85); e.hi = Math.round(e.kcal * 1.15);
  e.micros = Object.fromEntries(MICROS.map(k => [k, r(comps.reduce((a, c) => a + c.micros[k], 0), 2)]));
  e.components = comps;
  e.eaten = { pct: 100, of: pctOf || `${label} serving` };
  e.ingredients = card.ingredients.map(g => g.name.toLowerCase());
  e.ingredientsFrom = "recipe";
  e.confidence = "high";
  e.notes = notes || `From the ${card.id} recipe card: ${label} = ${r(fraction * 100, 1)}% of a ${card.yield.amount}-${card.yield.unit} batch.`;
  return e;
}
