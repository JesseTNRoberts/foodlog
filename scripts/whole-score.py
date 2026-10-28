"""Fill in whole-food scores ("whole", 0-1) on every component that lacks one.

The scale (see CLAUDE.md, "Whole-food score"):
  1.0   whole: fruit, vegetables, beans, whole grains, nuts, seeds, eggs, plain meat/fish, water/coffee/tea
  0.85  minimally processed: plain yogurt, cheese, milk, olive oil, ground nut/seed butters, maple syrup, canned plain veg/beans
  0.7   home-cooked dishes and traditional foods: soups, chili, sourdough, pasta, hummus, salsa
  0.5   processed: packaged breads, tortillas, sauces and dressings, restaurant mixed dishes
  0.3   heavily processed: chips, fries, fried/breaded foods, pizza, cereal, deli meat, plant-based meat or cheese
  0.1   ultra-processed sweets: soda, candy, cookies, donuts, pastries, cake, ice cream
Scores Claude sets by hand when logging are never overwritten. Generic "Calories" entries (no food named)
get no score and are left out of the day's percentage.

Run: python3 scripts/whole-score.py   (then node scripts/build.mjs)
"""
import json, glob, re, sys, os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# (score, regex). First match wins, so specific and more processed patterns come first.
RULES = [
    (None, r"^calories$|^homemade$|^12oz can$"),
    # specific cases that the broad patterns below would get wrong
    (0.85, r"maple syrup|syrup, maple|\bnut butter|peanut butter(?!.*(cup|chocolate|banana|smoothie|cauliflower))|almond butter(?!.*(puff|cereal|toast))"),
    (0.8, r"granola(?! bar)"),
    (0.6, r"21 whole grains|whole grains (&|and) seeds|dave's killer"),
    (0.7, r"sour ?dough|baguette"),
    (0.3, r"lavash|fries|chicken, orange|orange chicken|zax|veg out|just egg|cheddar's(?! dr)"),
    (0.2, r"cereal|honey bunches"),
    (0.85, r"cheese crumbles|crumbles, "),
    (0.3, r"frying oil|batter"),
    (0.7, r"homemade (lasagna|with)|lasagna, homemade|tahini sandwich"),
    (0.0, r"powerade|gatorade|arnold palmer"),
    (0.1, r"crumble|caramel|popcorn|sorbet|gelatin|jelly|sugar glaze|gold peak|sweet tea|tea, iced, sweet|reese|mocha|hot cocoa|jingle jangle|"
          r"swirl bread|nut bread|banana bread"),
    (0.2, r"veggie straws|funyuns|frank, beef|puff snacks|sugar, brown|brown sugar|garden salsa|sunchips"),
    (0.25, r"mac & chef|chef boyardee"),
    (0.3, r"potato wedges|garlic knots|stuffing|cheese bread|fry\b|breading|roar"),
    (0.4, r"\bbao\b|fruit leather|fruit roll|roast beef"),
    (0.5, r"souffle|etoufee|tamale|drunken|baked, bbq|bbq beans"),
    (0.6, r"22 grains|21 grain|\bv8\b|juice, v8"),
    (0.7, r"almonds?, nashville|pork dinner|baked, homemade|homemade baked beans|buffalo style|mushy peas|kefir|soy sauce|soya sauce|tamari|aminos|"
          r"hot sauce|cholula|chulula|tobasco|tabasco|hummus|guacamole|salsa|cole slaw|mashed potatoes, homemade|trail mix|acai|rotini|lasagna noodles"),
    (0.8, r"grilled bbq|grilled, bbq|chicken, grilled bbq|rotisserie"),
    (0.85, r"overnight oats|olives?\b|kimchi|pickle|tomatoes, paste|tomato paste|cocoa powder|applesauce unsweetened|vinegar|sardines"),
    (1.0, r"pepitas?|spring mix|romaine|tangerine|prunes|apricot|aprium|rambutan|muscadine|shallot|baby bellas|oysters|lemon juice|juice, lemon|"
          r"mccoun|pike place|blonde roast|\broast$"),
    (1.0, r"broccolett|pintos?\b|red beans$|chicken wings?,? (-\s)?grilled|wing - grilled"),
    # ultra-processed sweets and drinks
    (0.0, r"dr\.? ?pepper|\bcoke\b|soda|sprite|root beer|\bcola\b|lemonade"),
    (0.1, r"half and half tea|sweet tea|milkshake|frappuccino|latte|machiato|macchiato|chai mix|creamer"),
    (0.1, r"donut|doughnut|cookie|oreo|cake|cupcake|brownie|cheezecake|cheesecake|candy|peanut butter cups|haystack|pastry|croissant|"
          r"cinnamon roll|morning bun|danish|scone|muffin|pudding|ice cream|gelato|magnum|whirled|tonight dough|pecan pin|little debbie|"
          r"honey bun|baklava|tartlet|fried pie|pie, |\bpie\b|crisp, homemade|apple crisp|cobbler|strata|bostock|pumpkin roll|"
          r"french toast|waffle|pancake|pan cake|syrup(?!, maple|.*maple)|\bjam\b|marshmallow|s.mores|dumpling|fritter|bread pudding"),
    (0.15, r"pumpkin bread|banana bread|spice cake|pistachio bread|zucchini bread|raisin bread|bites|bite-lettes|energy square|granola bar|"
           r"protein bar|kind bar|\bbar\b|bar, |chocolate"),
    # heavily processed savory
    (0.25, r"impossible|beyond|plant[- ]based (?!.*(tortilla|milk))|vegan (cheese|mayo|mac|pizza|butter)|non-?dairy|daiya|cheeze|cheezy|"
           r"cheese-less|bac-no|kroger vegan|vegan dressing|amys|amy's|mac 'n'|mac & cheese|mac and cheese|mac n|macaroni and cheese|"
           r"beefaroni|pizza pocket|pizza roll|hot pocket|potsticker|egg roll|spring roll|nugget|chicken finger|\btenders?\b|boneless(?!.*grilled)|wing|"
           r"popcorn chicken|corn dog|hot dog|sausage|bacon|pepperoni|salami|bologna|hash ?brown|tots|"
           r"chips|chip\b|fritos|cheetos|doritos|pretzel|crisps|puffs|snack mix|croutons|crackers|thins|scoops|naan bites|naan dippers"),
    (0.3, r"fries|french fried|fried|breaded|battered|crispy|crunch|hush ?pupp|popper|rattle snake|onion ring|okra|"
          r"pizza|flatbread pizza|calzone|cereal|honey bunches|puff cereal|"
          r"burger|whopper|famous star|dave's double|sandwich|biscuit|wrap(?!per)|wrapper|sub\b|veggie delite|melt|"
          r"burrito|quesadilla|nacho|taco|chalupa|orange chicken|honey walnut|panda|chow mein|fried rice|lo mein|"
          r"queso|ketchup|bbq sauce|sauce, honey|cane's|ranch|honey mustard|caesar|dressing|mayo|mayonnaise|"
          r"turkey breast|deli|ham\b|ham and|maple and honey turkey|maple glazed|smoked turkey|honey turkey"),
    # processed
    (0.5, r"bagel|bun\b|buns|roll\b|rolls|breadstick|texas toast|toast|brioche|focaccia|foccacia|white mountain|"
          r"bread(?!.*(sourdough|whole grain|21 whole))|\bpita\b|tortilla|naan|"
          r"sauce|marinara|salsa(?!, homemade)|guacamole|dip|spread|hummus|babaganoush|baba gh|"
          r"jambalaya|creole|etouffee|étouffée|gumbo|stroganoff|lasagna|ravioli|tortellini|alfredo|bisque|chowder|"
          r"teriyaki|hibachi|kung pao|curry|biryani|pad thai|sushi|grits|quiche|casserole|caserole|cornbread|corn bread|"
          r"just egg|egg, plant|smoothie|smoothy|juice|cider|granola(?! bar)|trail mix|salad kit|"
          r"meatball|meat balls|pulled pork|pulled chicken|crack chicken|loaded|mashed potatoes|baked beans|refried|"
          r"protein and nutmilk|silk|\boat milk|oatly|almond milk|oat creamer|hard cider|wine(?!.*cooked)|beer"),
    # traditional / home-cooked
    (0.7, r"soup|chili|stew|pasta|spaghetti|linguine|penne|bowtie|gemelli|noodle|macaroni|"
          r"bowl|salad|stuffed|pintos|red beans|beans and rice|rice|patty|cottage pie|clam|mussel"),
    # minimally processed
    (0.85, r"cheese|cheddar|gouda|colby|gruy|parmesan|feta|goat cheese|mozz|brie|yogurt|milk|butter(?!nut)|cream|"
           r"olive oil|\boil\b|oil,|tahini|almond butter|peanut butter|nut butter|cashew butter|"
           r"maple|honey(?! mustard| bbq| butter| bunches)|syrup|dijon|mustard|harissa|broth|stock|wine|vinegar|"
           r"canned|tofu|tempeh|chickpea pasta|whitefish|steak, new york|salmon patty"),
    # whole
    (1.0, r"salmon|sockeye|trout|catfish|cod|tuna|mahi|grouper|snapper|haddock|halibut|tilapia|shrimp|lobster|crab|scallop|fish|"
          r"chicken|turkey|beef|bison|pork|steak|sirloin|venison|deer|back strap|lamb|egg|"
          r"apple|banana|berr|cuties|orange|mango|pear|peach|nectarine|grape|melon|cherr|plum|kiwi|pineapple|lemon|lime|fruit|"
          r"spinach|broccoli|kale|lettuce|greens|arugula|cabbage|carrot|tomato|cucumber|pepper|onion|garlic|mushroom|portobello|"
          r"zucchini|zuchinni|zuchini|squash|pumpkin|sweet potato|potato|asparagus|brussels|cauliflower|green bean|beans|bean|"
          r"lentil|chickpea|pea\b|peas|corn|avocado|slimcado|celery|beet|eggplant|okra|vegetable|veggie|herb|thyme|basil|ginger|"
          r"quinoa|\boats?\b|oatmeal|farro|barley|buckwheat|chia|flax|pepita|sunflower|pumpkin seed|seed|"
          r"almond|cashew|walnut|pecan|pistachio|peanut|hazelnut|nuts|"
          r"coffee|tea\b|water|salt|pepper\b|spice|cinnamon"),
]
RULES = [(s, re.compile(p, re.I)) for s, p in RULES]


def score(name):
    n = re.sub(r"\(in the [^)]*\)|\(in [^)]*dressing\)", "", name)
    for s, rx in RULES:
        if rx.search(n):
            return s
    return 0.5


def main():
    unmatched = {}
    changed = 0
    for f in sorted(glob.glob(os.path.join(ROOT, "entries", "*", "*.json"))):
        raw = open(f).read()
        doc = json.loads(raw)
        m = re.match(r"\{\n( +)", raw)
        indent = len(m.group(1)) if m else 2
        dirty = False
        for e in doc["entries"]:
            for c in e.get("components") or []:
                if "whole" in c:
                    continue
                s = score(c["name"])
                if s is None:
                    continue
                c["whole"] = s
                dirty = True
                changed += 1
        if dirty:
            with open(f, "w") as fh:
                json.dump(doc, fh, indent=indent, ensure_ascii=False)
                if raw.endswith("\n"):
                    fh.write("\n")
    print(f"Scored {changed} components.")


if __name__ == "__main__":
    if len(sys.argv) > 1:  # quick check: python3 scripts/whole-score.py "Food name"
        for a in sys.argv[1:]:
            print(score(a), a)
    else:
        main()
