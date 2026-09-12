# The Bar Ledger

A personal cocktail database — store recipes, browse by spirit, mark what's on your shelf, and see exactly what you can make right now. Runs as a small static site backed by a free Supabase database, so the same data shows up on your laptop, your phone, anywhere you open it.

## One-time setup

### 1. Create a Supabase project
Go to [supabase.com](https://supabase.com), sign up free, and create a new project (pick any name/region, set a database password and store it somewhere — you won't need it day-to-day, Supabase handles that).

### 2. Create the tables
In your new project, open **SQL Editor** (left sidebar) -> **New query**, paste in the contents of `schema.sql` from this folder, and click **Run**. This creates two tables: `cocktails` and `shelf`.

### 3. Get your project's API keys
In the project, go to **Settings -> API**. You'll need:
- **Project URL**
- **anon / public key** (sometimes called "publishable key" on newer projects)

Open `config.js` in this folder and paste them in:
```js
const SUPABASE_URL = "https://your-project-ref.supabase.co";
const SUPABASE_ANON_KEY = "eyJ...";
```
This key is meant to be public/client-side — it's not a secret, so it's fine to commit `config.js` as-is. See the security note in `schema.sql` for what that does and doesn't protect.

### 4. Put it on GitHub
```
cd bar-ledger
git init
git add .
git commit -m "Initial commit"
```
Create a new empty repository on [github.com](https://github.com/new) (don't initialize it with a README), then:
```
git remote add origin https://github.com/YOUR_USERNAME/bar-ledger.git
git branch -M main
git push -u origin main
```

### 5. Host it — GitHub Pages
In your new GitHub repo: **Settings -> Pages** -> under "Build and deployment", set Source to **Deploy from a branch**, branch `main`, folder `/ (root)`, then **Save**. GitHub gives you a URL like `https://YOUR_USERNAME.github.io/bar-ledger/` within a minute or two — that's your app, reachable from any device's browser. Every future `git push` to `main` redeploys it automatically.

*(Netlify or Vercel work just as well if you'd rather — drag-and-drop the folder or connect the repo — but GitHub Pages needs no separate account since you're already on GitHub.)*

### 6. Load your recipes
Open the hosted URL, click **Import** (top right), and choose your `bar-ledger-import.json`. Since the tables started empty, the app will also have seeded itself with 8 sample cocktails on first load; Import will replace any of those that share a name with your own (Negroni, Old Fashioned, Whiskey Sour) and add the rest fresh.

## Editing it going forward

The code now lives in a real GitHub repo, which plugs into [Claude Code](https://claude.com/product/claude-code): clone the repo to your machine, run `claude` inside that folder, and describe what you want changed. It can edit the files, and commit/push directly — push to `main` and GitHub Pages redeploys within a minute or two, live on every device. You can also just keep bringing changes here to this chat and copying files across, if that's easier — either works.

## File structure

```
bar-ledger/
├── index.html    # page structure — Browse / My Shelf / Add Cocktail tabs
├── style.css     # all styling
├── app.js        # data model, Supabase calls, rendering, all app logic
├── config.js     # YOUR Supabase project URL + anon key go here
├── schema.sql    # run once in Supabase's SQL Editor to create the tables
└── README.md     # this file
```

## How data works now

Cocktails and shelf state live in your Supabase project's Postgres database — shared across every device that opens the hosted URL, updated in real time as you add/edit/delete/toggle. The oz/ml/ratio display toggle is the one thing kept local per-device (in that browser's localStorage), since it's a display preference, not data worth syncing.

**Export still works** the same way as before — it downloads a JSON snapshot of everything currently in the database, good for backups or moving to a different setup later. **Import** now upserts: matching names get replaced in place, new names get added, both written straight to Supabase.

If the app shows a red banner saying it can't reach the database, it's almost always one of: `config.js` still has the placeholder text, the keys were copied with extra whitespace, or you're offline.

## How the app works

**Browse** — every cocktail, filterable by base-ingredient category down the left rail. Categories aren't a fixed list — they're built from whatever category name you type when tagging an ingredient (e.g. "Gin", "Amaro", "Mezcal"), so the rail grows as your collection does. A cocktail appears under every category it has a base ingredient in — a Negroni shows up under Gin, Liqueur, *and* Vermouth.

**My Shelf** — expand "Manage what's on your shelf" to toggle on what you actually have (spirits, liqueurs, vermouths, bitters — genuinely yes/no, no quantities). The grid below shows *only* cocktails where every tracked base ingredient is toggled on.

**Add Cocktail** — a form for new recipes: amount, unit, and whether each ingredient counts toward "My Shelf." Checked ingredients need a category (autocomplete offers ones you've already used).

**Editing & deleting** — every card has Edit and Delete links at the bottom. Edit reopens the form pre-filled; saving updates that cocktail in place.

**Notes** — an optional free-text field per cocktail, shown on the card when present.

**Units** — a toggle switches every card between oz, ml, and ratio. Ratio mode only reduces genuinely measured liquids (oz/ml/cl) to a whole-number ratio (e.g. a Daiquiri becomes "8 White Rum : 3 Lime Juice : 3 Simple Syrup"); dashes, bar spoons, and other non-volume amounts are listed underneath unchanged.

**Glass icons** — Glass is a dropdown of common types (Coupe, Rocks, Highball, Martini/Nick & Nora, Copper Mug, and more), each with a small line-art icon shown next to the glass name on every card. "Other…" lets you name anything not in the list.

## The oz ↔ ml conversion

Uses the standard bartender's rounding of 1 oz = 30 ml (not the precise 29.57 ml), since that's what most recipes and jiggers are calibrated to.

## Look and feel

A prohibition-era palette — near-black charcoal, aged parchment cards, brass gold as the one interactive color, with deep emerald and burgundy reserved for "on the shelf" and "missing/delete" respectively. Headings are set in Cinzel, body text in Montserrat, with a faint diamond-lattice texture and a gold rule under the header as the one deliberate ornamental touch.
