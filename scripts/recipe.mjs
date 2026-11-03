// Log or preview a portion of a recipe card.
//   node scripts/recipe.mjs list
//   node scripts/recipe.mjs show spaghetti "1 cup"
//   node scripts/recipe.mjs log spaghetti "1/2 cup" --date 2026-11-02 --meal dinner [--id 2026-11-02-6] [--notes "..."]
// "log" appends the entry to entries/YYYY/YYYY-MM-DD.json (or replaces the entry with --id).
// Cards can be named by id or by any of their aliases ("my spaghetti").
import fs from "node:fs";
import path from "node:path";
import { loadCards, parsePortion, entryFromCard, batchTotals } from "./cards.mjs";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const [cmd, name, portion, ...rest] = process.argv.slice(2);
const opt = {};
for (let i = 0; i < rest.length; i += 2) opt[rest[i].replace(/^--/, "")] = rest[i + 1];

const cards = loadCards(root).filter(c => c.card).map(c => c.card);
const find = n => {
  const q = String(n || "").toLowerCase().trim();
  return cards.find(c => c.id === q) || cards.find(c => (c.aliases || []).some(a => a.toLowerCase() === q));
};
const die = msg => { console.error(msg); process.exit(1); };

if (cmd === "list" || !cmd) {
  for (const c of cards) {
    const { totals } = batchTotals(c);
    console.log(`${c.id}: ${c.name} — ${c.yield.amount} ${c.yield.unit} per batch, ${Math.round(totals.kcal / c.yield.amount)} kcal per ${c.yield.unit}${c.aliases?.length ? ` (aliases: ${c.aliases.join(", ")})` : ""}`);
  }
  process.exit(0);
}
const card = find(name) || die(`No recipe card "${name}". Cards: ${cards.map(c => c.id).join(", ") || "none"}`);
if (!portion) die(`Give a portion, e.g. "1 cup"`);

if (cmd === "show") {
  const e = entryFromCard(card, portion, {});
  console.log(`${card.name}, ${parsePortion(portion, card).label}: ${e.kcal} kcal, ${e.protein} g protein, ${e.carbs} g carbs, ${e.fat} g fat, ${e.fiber} g fiber, ${Math.round(e.sodium)} mg sodium`);
  for (const c of e.components) console.log(`  ${c.name}: ${c.grams} g, ${Math.round(c.kcal)} kcal, ${c.protein} g protein`);
  process.exit(0);
}

if (cmd === "log") {
  const date = opt.date || die("--date YYYY-MM-DD is required");
  const meal = opt.meal || die("--meal breakfast|lunch|dinner|snacks is required");
  const file = path.join(root, "entries", date.slice(0, 4), `${date}.json`);
  const doc = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : { date, entries: [] };
  let id = opt.id;
  if (!id) { let n = doc.entries.length + 1; while (doc.entries.some(e => e.id === `${date}-${n}`)) n++; id = `${date}-${n}`; }
  const e = entryFromCard(card, portion, { id, meal, notes: opt.notes });
  const at = doc.entries.findIndex(x => x.id === id);
  if (at >= 0) { if (doc.entries[at].photos) e.photos = doc.entries[at].photos; doc.entries[at] = e; } else doc.entries.push(e);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(doc, null, 2) + "\n");
  console.log(`${at >= 0 ? "Replaced" : "Added"} ${id}: ${e.name}, ${e.portion} — ${e.kcal} kcal, ${e.protein} g protein`);
  process.exit(0);
}
die(`Unknown command "${cmd}" (use list, show or log)`);
