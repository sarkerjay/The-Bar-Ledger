/* =========================================================
   The Bar Ledger — app.js
   Vanilla JS, no build step. Cocktails and shelf state live in a shared
   Supabase database (see README + schema.sql); the oz/ml/ratio display
   preference stays local to each device via localStorage.
========================================================= */

/* ---------------------------------------------------------
   Config: units & dynamic category coloring
--------------------------------------------------------- */
// 1 US fl oz treated as 30ml — the standard bartending rounding, not the
// precise 29.57ml conversion. Good enough for pouring, see README.
const OZ_TO_ML = 30;

const UNITS = {
  oz:       { label: 'oz',   volume: true },
  ml:       { label: 'ml',   volume: true },
  cl:       { label: 'cl',   volume: true },
  dash:     { label: 'dash', pluralLabel: 'dashes',    volume: false },
  tsp:      { label: 'tsp',  volume: false },
  tbsp:     { label: 'tbsp', volume: false },
  barspoon: { label: 'barspoon', pluralLabel: 'barspoons', volume: false },
  pinch:    { label: 'pinch', pluralLabel: 'pinches',  volume: false },
  whole:    { label: '', freeform: true, volume: false },
  top:      { label: 'top with', topUp: true, volume: false },
};

// Spirit/base-ingredient categories are NOT a fixed list — they grow as you
// tag new ones on the Add Cocktail form. This palette just gives each
// category name a stable, distinct color (via a simple string hash) so the
// same category always looks the same without us having to store a color
// per category ourselves.
const CATEGORY_PALETTE = [
  '#C6992F', '#7A8B99', '#8B3A2B', '#A5672B', '#7C8B4A',
  '#6E2430', '#6B4C7A', '#1E4D3B', '#4E7A8C', '#9C5A46',
];

function hashCategoryColor(label) {
  const key = (label || 'Other').trim().toLowerCase();
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  }
  return CATEGORY_PALETTE[hash % CATEGORY_PALETTE.length];
}

/* ---------------------------------------------------------
   Glass types — a fixed set, each with a small line-art icon.
   viewBox is consistent (0 0 24 32) so icons align neatly.
--------------------------------------------------------- */
const GLASS_TYPES = {
  coupe:      { label: 'Coupe',              paths: '<path d="M4 6 Q12 18 20 6"/><path d="M4 6 L20 6"/><path d="M12 15 L12 26"/><path d="M7 27 L17 27"/>' },
  martini:    { label: 'Martini / Nick & Nora', paths: '<path d="M4 6 L12 16 L20 6"/><path d="M4 6 L20 6"/><path d="M12 16 L12 26"/><path d="M7 27 L17 27"/>' },
  wine:       { label: 'Wine Glass',         paths: '<path d="M6 6 C6 14 7 17 12 17 C17 17 18 14 18 6"/><path d="M6 6 L18 6"/><path d="M12 17 L12 26"/><path d="M7 27 L17 27"/>' },
  flute:      { label: 'Champagne Flute',    paths: '<path d="M10 4 L14 4 L13.3 18 C13.3 20 10.7 20 10.7 18 Z"/><path d="M12 20 L12 26"/><path d="M7 27 L17 27"/>' },
  rocks:      { label: 'Rocks / Old Fashioned', paths: '<path d="M6 10 L18 10 L17 26 L7 26 Z"/>' },
  highball:   { label: 'Highball',           paths: '<path d="M8 5 L16 5 L15.3 27 L8.7 27 Z"/>' },
  collins:    { label: 'Collins',            paths: '<path d="M9 4 L15 4 L14.5 28 L9.5 28 Z"/>' },
  shot:       { label: 'Shot',               paths: '<path d="M9 14 L15 14 L14.5 24 L9.5 24 Z"/>' },
  copper_mug: { label: 'Copper Mug',         paths: '<path d="M6 8 L15 8 L15 26 L6 26 Z"/><path d="M15 12 C20 12 20 20 15 20"/>' },
  hurricane:  { label: 'Hurricane',          paths: '<path d="M8 5 C6 10 9 13 9 16 C9 20 6 22 6 26 L18 26 C18 22 15 20 15 16 C15 13 18 10 16 5 Z"/>' },
  julep:      { label: 'Julep Tin',          paths: '<path d="M8 8 L16 8 L15.3 26 L8.7 26 Z"/><path d="M8.3 12 L15.7 12"/>' },
  other:      { label: 'Other',              paths: '<path d="M7 6 L17 6 L15.5 26 L8.5 26 Z" stroke-dasharray="2.2 2.2"/>' },
};

function renderGlassIcon(glassTypeId, size) {
  const def = GLASS_TYPES[glassTypeId];
  if (!def) return '';
  const px = size || 20;
  return `<svg viewBox="0 0 24 32" width="${px}" height="${px}" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">${def.paths}</svg>`;
}

// Retired glass-type ids get mapped forward, so a cocktail saved (or
// imported from an old backup) before a merge like this still resolves
// to a real icon instead of showing nothing.
const GLASS_TYPE_ALIASES = { nick_nora: 'martini' };

function getGlassLabel(cocktail) {
  if (!cocktail.glassType) return '';
  if (cocktail.glassType === 'other') return cocktail.glassCustom ? cocktail.glassCustom.trim() : 'Other';
  return (GLASS_TYPES[cocktail.glassType] || {}).label || '';
}

// Back-compat: older saved/exported cocktails used a free-text `glass`
// string. Map it onto the new glassType/glassCustom fields so old backups
// still import cleanly and show an icon.
function normalizeGlass(cocktail) {
  if (cocktail.glassType !== undefined) {
    if (cocktail.glassCustom === undefined) cocktail.glassCustom = '';
    if (GLASS_TYPE_ALIASES[cocktail.glassType]) cocktail.glassType = GLASS_TYPE_ALIASES[cocktail.glassType];
    return cocktail;
  }
  const old = (cocktail.glass || '').trim();
  if (!old) {
    cocktail.glassType = '';
    cocktail.glassCustom = '';
    return cocktail;
  }
  const match = Object.entries(GLASS_TYPES).find(([, def]) => def.label.toLowerCase() === old.toLowerCase());
  if (match) {
    cocktail.glassType = match[0];
    cocktail.glassCustom = '';
  } else {
    cocktail.glassType = 'other';
    cocktail.glassCustom = old;
  }
  delete cocktail.glass;
  return cocktail;
}

// ---------------------------------------------------------
// Supabase connection (shared, multi-device storage)
// ---------------------------------------------------------
// Fill in SUPABASE_URL / SUPABASE_ANON_KEY in config.js (loaded before this
// file, see README). The anon/public key is *meant* to be exposed in
// client-side code — it isn't a secret — access is governed by the table
// policies set up in schema.sql (left open there, since this is a personal,
// low-stakes app; lock it down later with real Row Level Security if wanted).
const SUPABASE_CONFIGURED =
  typeof SUPABASE_URL === 'string' && SUPABASE_URL && !SUPABASE_URL.includes('YOUR_') &&
  typeof SUPABASE_ANON_KEY === 'string' && SUPABASE_ANON_KEY && !SUPABASE_ANON_KEY.includes('YOUR_');

const supabaseClient = SUPABASE_CONFIGURED
  ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : null;

function showBanner(message, isError) {
  const banner = document.getElementById('status-banner');
  if (!banner) return;
  if (!message) { banner.hidden = true; return; }
  banner.textContent = message;
  banner.className = 'status-banner' + (isError ? ' is-error' : '');
  banner.hidden = false;
}

// Postgres columns are snake_case; the rest of the app works in the
// camelCase shape it always has. These two functions are the only place
// that needs to know about that difference.
function rowToCocktail(row) {
  return {
    id: row.id,
    name: row.name,
    glassType: row.glass_type || '',
    glassCustom: row.glass_custom || '',
    ingredients: row.ingredients || [],
    instructions: row.instructions || '',
    garnish: row.garnish || '',
    notes: row.notes || '',
    isFavorite: !!row.is_favorite,
  };
}
function cocktailToRow(cocktail) {
  return {
    id: cocktail.id,
    name: cocktail.name,
    glass_type: cocktail.glassType || '',
    glass_custom: cocktail.glassCustom || '',
    ingredients: cocktail.ingredients || [],
    instructions: cocktail.instructions || '',
    garnish: cocktail.garnish || '',
    notes: cocktail.notes || '',
    is_favorite: !!cocktail.isFavorite,
  };
}

const UNIT_STORAGE_KEY = 'barledger.unit.v1'; // display preference only — kept per-device on purpose

/* ---------------------------------------------------------
   Seed data — replace / extend freely from the Add Cocktail tab
--------------------------------------------------------- */
function seedCocktails() {
  return [
    {
      id: 'seed-negroni', name: 'Negroni', glassType: 'rocks', glassCustom: '',
      ingredients: [
        { name: 'London Dry Gin', amount: 1, unit: 'oz', isBase: true, category: 'Gin' },
        { name: 'Campari', amount: 1, unit: 'oz', isBase: true, category: 'Liqueur' },
        { name: 'Sweet Vermouth', amount: 1, unit: 'oz', isBase: true, category: 'Vermouth' },
      ],
      instructions: 'Stir all ingredients with ice. Strain into a rocks glass over fresh ice.',
      garnish: 'Orange peel', notes: '',
    },
    {
      id: 'seed-daiquiri', name: 'Daiquiri', glassType: 'coupe', glassCustom: '',
      ingredients: [
        { name: 'White Rum', amount: 2, unit: 'oz', isBase: true, category: 'Rum' },
        { name: 'Lime Juice', amount: 0.75, unit: 'oz', isBase: false },
        { name: 'Simple Syrup', amount: 0.75, unit: 'oz', isBase: false },
      ],
      instructions: 'Shake all ingredients hard with ice. Double strain into a chilled coupe.',
      garnish: 'Lime wheel', notes: '',
    },
    {
      id: 'seed-old-fashioned', name: 'Old Fashioned', glassType: 'rocks', glassCustom: '',
      ingredients: [
        { name: 'Bourbon', amount: 2, unit: 'oz', isBase: true, category: 'Whiskey' },
        { name: 'Simple Syrup', amount: 0.25, unit: 'oz', isBase: false },
        { name: 'Angostura Bitters', amount: 2, unit: 'dash', isBase: true, category: 'Bitters' },
      ],
      instructions: 'Stir all ingredients with ice until chilled. Strain over one large ice cube.',
      garnish: 'Orange peel', notes: '',
    },
    {
      id: 'seed-margarita', name: 'Margarita', glassType: 'coupe', glassCustom: '',
      ingredients: [
        { name: 'Blanco Tequila', amount: 2, unit: 'oz', isBase: true, category: 'Tequila' },
        { name: 'Triple Sec', amount: 1, unit: 'oz', isBase: true, category: 'Liqueur' },
        { name: 'Lime Juice', amount: 1, unit: 'oz', isBase: false },
      ],
      instructions: 'Shake all ingredients with ice. Strain into a salt-rimmed glass over ice.',
      garnish: 'Lime wheel', notes: '',
    },
    {
      id: 'seed-moscow-mule', name: 'Moscow Mule', glassType: 'copper_mug', glassCustom: '',
      ingredients: [
        { name: 'Vodka', amount: 2, unit: 'oz', isBase: true, category: 'Vodka' },
        { name: 'Lime Juice', amount: 0.5, unit: 'oz', isBase: false },
        { name: 'Ginger Beer', amount: 4, unit: 'oz', isBase: false },
      ],
      instructions: 'Build over ice in a copper mug. Top with ginger beer and stir gently.',
      garnish: 'Mint sprig, lime wheel', notes: '',
    },
    {
      id: 'seed-whiskey-sour', name: 'Whiskey Sour', glassType: 'rocks', glassCustom: '',
      ingredients: [
        { name: 'Bourbon', amount: 2, unit: 'oz', isBase: true, category: 'Whiskey' },
        { name: 'Lemon Juice', amount: 0.75, unit: 'oz', isBase: false },
        { name: 'Simple Syrup', amount: 0.75, unit: 'oz', isBase: false },
        { name: 'Egg White (optional)', amount: 1, unit: 'whole', isBase: false },
      ],
      instructions: 'Dry shake without ice, then shake again with ice. Strain into a rocks glass over ice.',
      garnish: 'Angostura dashes on the foam', notes: '',
    },
    {
      id: 'seed-martini', name: 'Martini', glassType: 'martini', glassCustom: '',
      ingredients: [
        { name: 'London Dry Gin', amount: 2.5, unit: 'oz', isBase: true, category: 'Gin' },
        { name: 'Dry Vermouth', amount: 0.5, unit: 'oz', isBase: true, category: 'Vermouth' },
      ],
      instructions: 'Stir with ice until very cold. Strain into a chilled coupe or martini glass.',
      garnish: 'Lemon twist or olive', notes: '',
    },
    {
      id: 'seed-mojito', name: 'Mojito', glassType: 'highball', glassCustom: '',
      ingredients: [
        { name: 'White Rum', amount: 2, unit: 'oz', isBase: true, category: 'Rum' },
        { name: 'Lime Juice', amount: 1, unit: 'oz', isBase: false },
        { name: 'Sugar', amount: 2, unit: 'tsp', isBase: false },
        { name: 'Mint Leaves', amount: 8, unit: 'whole', isBase: false },
        { name: 'Soda Water', amount: 1, unit: 'top', isBase: false },
      ],
      instructions: 'Muddle mint with sugar and lime juice. Add rum and ice, top with soda water, stir gently.',
      garnish: 'Mint sprig', notes: '',
    },
  ];
}

/* ---------------------------------------------------------
   State
--------------------------------------------------------- */
const state = {
  cocktails: [],
  shelf: {},        // normalized ingredient name -> boolean
  unit: 'oz',        // 'oz' | 'ml' | 'ratio'
  browseCategory: 'all',
  shelfCategory: 'all',
  browseSearch: '',
  shelfSearch: '',
  editingId: null,   // id of the cocktail currently being edited, or null
};

// Reserved rail key for the pinned "★ Favorites" entry — distinct from any
// real category key so a user-created category can never collide with it.
const FAVORITES_KEY = '__favorites__';

function normalize(name) {
  return name.trim().toLowerCase();
}

function uid() {
  return (crypto.randomUUID ? crypto.randomUUID() : 'c-' + Date.now() + '-' + Math.random().toString(16).slice(2));
}

/* ---------------------------------------------------------
   Persistence — Supabase (shared across every device you open this on)
--------------------------------------------------------- */
async function loadState() {
  const rawUnit = localStorage.getItem(UNIT_STORAGE_KEY);
  if (rawUnit === 'oz' || rawUnit === 'ml' || rawUnit === 'ratio') state.unit = rawUnit;

  if (!SUPABASE_CONFIGURED) {
    showBanner('Setup needed: add your Supabase project URL and anon key to config.js (see README).', true);
    state.cocktails = [];
    state.shelf = {};
    return;
  }

  try {
    const { data: existingRows, error: countError } = await supabaseClient.from('cocktails').select('id');
    if (countError) throw countError;

    if (existingRows.length === 0) {
      const seedRows = seedCocktails().map(cocktailToRow);
      const { error: seedError } = await supabaseClient.from('cocktails').insert(seedRows);
      if (seedError) throw seedError;
    }

    const { data: cocktailRows, error: fetchError } = await supabaseClient.from('cocktails').select('*').order('name');
    if (fetchError) throw fetchError;
    state.cocktails = cocktailRows.map(rowToCocktail);
    state.cocktails.forEach(normalizeGlass);

    const { data: shelfRows, error: shelfError } = await supabaseClient.from('shelf').select('*');
    if (shelfError) throw shelfError;
    state.shelf = {};
    (shelfRows || []).forEach(r => { state.shelf[r.key] = r.is_stocked; });

    showBanner(null);
  } catch (err) {
    console.error('Supabase load failed:', err);
    showBanner("Couldn't reach the database — check your connection and the keys in config.js.", true);
    state.cocktails = [];
    state.shelf = {};
  }
}

function saveUnit() {
  localStorage.setItem(UNIT_STORAGE_KEY, state.unit);
}

async function insertCocktailRemote(cocktail) {
  const { error } = await supabaseClient.from('cocktails').insert([cocktailToRow(cocktail)]);
  if (error) throw error;
}
async function updateCocktailRemote(cocktail) {
  const { error } = await supabaseClient.from('cocktails').update(cocktailToRow(cocktail)).eq('id', cocktail.id);
  if (error) throw error;
}
async function deleteCocktailRemote(id) {
  const { error } = await supabaseClient.from('cocktails').delete().eq('id', id);
  if (error) throw error;
}
async function upsertShelfRemote(key, isStocked) {
  const { error } = await supabaseClient.from('shelf').upsert({ key, is_stocked: isStocked });
  if (error) throw error;
}
async function upsertCocktailsRemote(cocktails) {
  const { error } = await supabaseClient.from('cocktails').upsert(cocktails.map(cocktailToRow));
  if (error) throw error;
}
async function updateFavoriteRemote(id, isFavorite) {
  const { error } = await supabaseClient.from('cocktails').update({ is_favorite: isFavorite }).eq('id', id);
  if (error) throw error;
}

/* ---------------------------------------------------------
   Ingredient / cocktail helpers
--------------------------------------------------------- */
function getBaseIngredients(cocktail) {
  return cocktail.ingredients.filter(i => i.isBase);
}

function missingBaseIngredients(cocktail) {
  return getBaseIngredients(cocktail).filter(i => !state.shelf[normalize(i.name)]);
}

function isMakeable(cocktail) {
  const bases = getBaseIngredients(cocktail);
  if (bases.length === 0) return true; // nothing tagged to check against
  return missingBaseIngredients(cocktail).length === 0;
}

function categoryKey(label) {
  return (label || 'Other').trim().toLowerCase();
}

function cocktailMatchesCategory(cocktail, activeKey) {
  if (activeKey === 'all') return true;
  if (activeKey === FAVORITES_KEY) return !!cocktail.isFavorite;
  return getBaseIngredients(cocktail).some(i => categoryKey(i.category) === activeKey);
}

// Search matches against the cocktail's own name AND its ingredient names
// (base or not) — e.g. "campari" surfaces the Negroni. Case-insensitive
// substring match, no fuzzy matching.
function cocktailMatchesSearch(cocktail, query) {
  const q = (query || '').trim().toLowerCase();
  if (!q) return true;
  if (cocktail.name.toLowerCase().includes(q)) return true;
  return cocktail.ingredients.some(i => i.name.toLowerCase().includes(q));
}

// Favorited cocktails first (A-Z among themselves), then everything else
// (A-Z) — used everywhere a grid of cocktails gets sorted.
function compareCocktails(a, b) {
  if (!!a.isFavorite !== !!b.isFavorite) return a.isFavorite ? -1 : 1;
  return a.name.localeCompare(b.name);
}

function primaryTabLabel(cocktail) {
  const bases = getBaseIngredients(cocktail);
  return bases.length ? (bases[0].category || 'Other').trim() : 'Uncategorized';
}

// Every distinct category currently in use, across all cocktails, sorted.
function collectCategories() {
  const byKey = new Map();
  for (const c of state.cocktails) {
    for (const ing of getBaseIngredients(c)) {
      const label = (ing.category || 'Other').trim();
      const key = categoryKey(label);
      if (!byKey.has(key)) byKey.set(key, label);
    }
  }
  return Array.from(byKey.entries())
    .map(([key, label]) => ({ key, label, color: hashCategoryColor(label) }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

// Unique base-ingredient names across the whole collection, grouped by category.
function collectShelfIngredients() {
  const groups = new Map(); // categoryKey -> { label, color, items: [{name,key}] }
  const seenNames = new Set();
  for (const c of state.cocktails) {
    for (const ing of getBaseIngredients(c)) {
      const nameKey = normalize(ing.name);
      const catLabel = (ing.category || 'Other').trim();
      const catKey = categoryKey(catLabel);
      const dedupeKey = catKey + '::' + nameKey;
      if (seenNames.has(dedupeKey)) continue;
      seenNames.add(dedupeKey);
      if (!groups.has(catKey)) groups.set(catKey, { label: catLabel, color: hashCategoryColor(catLabel), items: [] });
      groups.get(catKey).items.push({ name: ing.name.trim(), key: nameKey });
    }
  }
  const list = Array.from(groups.values());
  for (const g of list) g.items.sort((a, b) => a.name.localeCompare(b.name));
  list.sort((a, b) => a.label.localeCompare(b.label));
  return list;
}

/* ---------------------------------------------------------
   Unit conversion & formatting
--------------------------------------------------------- */
function toMl(amount, unit) {
  if (unit === 'ml') return amount;
  if (unit === 'cl') return amount * 10;
  if (unit === 'oz') return amount * OZ_TO_ML;
  return null;
}
function fromMl(ml, unit) {
  if (unit === 'ml') return ml;
  if (unit === 'cl') return ml / 10;
  if (unit === 'oz') return ml / OZ_TO_ML;
  return null;
}

function trimNumber(n) {
  const rounded = Math.round(n * 100) / 100;
  return String(rounded);
}

const OZ_FRACTIONS = { 0.25: '¼', 0.5: '½', 0.75: '¾', 0.125: '⅛', 0.375: '⅜', 0.625: '⅝', 0.875: '⅞' };

function formatOz(n) {
  const whole = Math.floor(n + 1e-6);
  let frac = Math.round((n - whole) * 8) / 8;
  let w = whole;
  if (frac >= 1) { w += 1; frac = 0; }
  const fracStr = OZ_FRACTIONS[frac];
  if (fracStr) return w > 0 ? `${w} ${fracStr}` : fracStr;
  if (w === 0 && frac === 0) return '0';
  return trimNumber(n);
}

function formatMl(n) {
  return String(Math.round(n));
}

function formatGeneric(n) {
  return trimNumber(n);
}

function formatVolumeLine(ingredient, unitMode) {
  let amt;
  if (ingredient.unit === unitMode) {
    amt = ingredient.amount;
  } else {
    const ml = toMl(ingredient.amount, ingredient.unit);
    amt = fromMl(ml, unitMode);
  }
  const display = unitMode === 'oz' ? formatOz(amt) : formatMl(amt);
  return `${display} ${unitMode} ${ingredient.name}`;
}

function formatNonVolumeLine(ingredient) {
  const u = UNITS[ingredient.unit] || { label: ingredient.unit };
  if (u.topUp) return `Top with ${ingredient.name}`;
  if (u.freeform) return `${formatGeneric(ingredient.amount)} ${ingredient.name}`;
  const label = ingredient.amount === 1 ? u.label : (u.pluralLabel || u.label + 's');
  return `${formatGeneric(ingredient.amount)} ${label} ${ingredient.name}`;
}

function gcd(a, b) { return b ? gcd(b, a % b) : a; }
function gcdArray(arr) { return arr.reduce((a, b) => gcd(a, b)); }

// Only genuinely measured liquids (oz/ml/cl) participate in the ratio.
// Dashes, spoons, whole items etc. are listed separately, unchanged.
function buildRatioLines(cocktail) {
  const vol = cocktail.ingredients.filter(i => (UNITS[i.unit] || {}).volume);
  const nonVol = cocktail.ingredients.filter(i => !(UNITS[i.unit] || {}).volume);
  const extraLines = nonVol.map(formatNonVolumeLine);

  if (vol.length === 0) {
    return { ratioLine: null, extraLines };
  }
  const mls = vol.map(i => toMl(i.amount, i.unit));
  // Scale to integers (rounded to 0.01ml) so GCD reduction finds the true
  // simplest ratio, e.g. 60ml:22.5ml:22.5ml -> 8:3:3.
  const scaled = mls.map(v => Math.round(v * 100));
  const g = gcdArray(scaled) || 1;
  const ints = scaled.map(v => Math.round(v / g));
  const ratioLine = vol.map((ing, idx) => `${ints[idx]} ${ing.name}`).join(' : ');
  return { ratioLine, extraLines };
}

function buildIngredientLines(cocktail, unitMode) {
  if (unitMode === 'ratio') {
    const { ratioLine, extraLines } = buildRatioLines(cocktail);
    const lines = [];
    if (ratioLine) lines.push({ text: ratioLine, isRatio: true });
    for (const l of extraLines) lines.push({ text: l, isRatio: false });
    return lines;
  }
  return cocktail.ingredients.map(ing => {
    const isVol = (UNITS[ing.unit] || {}).volume;
    const text = isVol ? formatVolumeLine(ing, unitMode) : formatNonVolumeLine(ing);
    return { text, isRatio: false };
  });
}

/* ---------------------------------------------------------
   Rendering: category rails
--------------------------------------------------------- */
function renderCategoryRail(containerEl, activeKey, onSelect) {
  containerEl.innerHTML = '';
  const favBtn = document.createElement('button');
  favBtn.className = 'category-btn category-btn-favorites' + (activeKey === FAVORITES_KEY ? ' is-active' : '');
  favBtn.innerHTML = `<span class="dot star-dot">★</span> Favorites`;
  favBtn.addEventListener('click', () => onSelect(FAVORITES_KEY));
  containerEl.appendChild(favBtn);

  const allBtn = document.createElement('button');
  allBtn.className = 'category-btn' + (activeKey === 'all' ? ' is-active' : '');
  allBtn.innerHTML = `<span class="dot" style="--dot-color:#C6992F"></span> All cocktails`;
  allBtn.addEventListener('click', () => onSelect('all'));
  containerEl.appendChild(allBtn);

  for (const cat of collectCategories()) {
    const btn = document.createElement('button');
    btn.className = 'category-btn' + (activeKey === cat.key ? ' is-active' : '');
    btn.innerHTML = `<span class="dot" style="--dot-color:${cat.color}"></span> ${cat.label}`;
    btn.addEventListener('click', () => onSelect(cat.key));
    containerEl.appendChild(btn);
  }
}

/* ---------------------------------------------------------
   Rendering: cocktail card
--------------------------------------------------------- */
function renderCard(cocktail, unitMode, opts) {
  const { showAvailability, expanded, inModal } = opts;
  const card = document.createElement('article');
  card.className = 'cocktail-card' + (inModal ? ' cocktail-card-modal' : ' is-clickable');
  const tabLabel = primaryTabLabel(cocktail);
  card.style.setProperty('--tab-color', hashCategoryColor(tabLabel));

  const bases = getBaseIngredients(cocktail);

  const tab = document.createElement('div');
  tab.className = 'card-tab';
  tab.textContent = tabLabel;
  card.appendChild(tab);

  const favBtn = document.createElement('button');
  favBtn.type = 'button';
  favBtn.className = 'card-favorite-btn' + (cocktail.isFavorite ? ' is-active' : '');
  favBtn.setAttribute('aria-label', cocktail.isFavorite ? 'Remove from favorites' : 'Add to favorites');
  favBtn.setAttribute('aria-pressed', String(!!cocktail.isFavorite));
  favBtn.textContent = cocktail.isFavorite ? '★' : '☆';
  favBtn.addEventListener('click', () => toggleFavorite(cocktail));
  card.appendChild(favBtn);

  const name = document.createElement('h3');
  name.className = 'card-name';
  name.textContent = cocktail.name;
  card.appendChild(name);

  const glassLabel = getGlassLabel(cocktail);
  if (glassLabel) {
    const glass = document.createElement('p');
    glass.className = 'card-glass';
    glass.innerHTML = `${renderGlassIcon(cocktail.glassType, 18)}<span>${glassLabel}</span>`;
    card.appendChild(glass);
  }

  const list = document.createElement('ul');
  list.className = 'card-ingredients';
  for (const line of buildIngredientLines(cocktail, unitMode)) {
    const li = document.createElement('li');
    if (line.isRatio) li.className = 'ratio-line';
    li.textContent = line.text;
    list.appendChild(li);
  }
  card.appendChild(list);

  if (showAvailability) {
    const missing = missingBaseIngredients(cocktail);
    const note = document.createElement('p');
    if (bases.length === 0) {
      note.className = 'card-availability';
      note.textContent = '';
    } else if (missing.length === 0) {
      note.className = 'card-availability is-ready';
      note.textContent = 'On the shelf';
    } else {
      note.className = 'card-availability is-missing';
      note.textContent = 'Missing: ' + missing.map(i => i.name).join(', ');
    }
    card.appendChild(note);
  }

  const details = document.createElement('details');
  details.className = 'card-instructions';
  if (expanded) details.open = true;
  const summary = document.createElement('summary');
  summary.textContent = 'Instructions';
  details.appendChild(summary);
  const p = document.createElement('p');
  p.textContent = cocktail.instructions;
  details.appendChild(p);
  card.appendChild(details);

  if (cocktail.garnish) {
    const g = document.createElement('p');
    g.className = 'card-garnish';
    g.textContent = 'Garnish: ' + cocktail.garnish;
    card.appendChild(g);
  }

  if (cocktail.notes) {
    const n = document.createElement('p');
    n.className = 'card-notes';
    n.textContent = cocktail.notes;
    card.appendChild(n);
  }

  const actions = document.createElement('div');
  actions.className = 'card-actions';
  const editBtn = document.createElement('button');
  editBtn.className = 'card-action-btn';
  editBtn.type = 'button';
  editBtn.textContent = 'Edit';
  editBtn.addEventListener('click', () => {
    if (inModal) closeCocktailModal();
    startEdit(cocktail);
  });
  const deleteBtn = document.createElement('button');
  deleteBtn.className = 'card-action-btn is-delete';
  deleteBtn.type = 'button';
  deleteBtn.textContent = 'Delete';
  deleteBtn.addEventListener('click', () => {
    if (inModal) closeCocktailModal();
    deleteCocktail(cocktail.id);
  });
  actions.appendChild(editBtn);
  actions.appendChild(deleteBtn);
  card.appendChild(actions);

  if (!inModal) {
    card.addEventListener('click', (e) => {
      if (e.target.closest('.card-actions') || e.target.closest('.card-favorite-btn')) return;
      openCocktailModal(cocktail, unitMode, { showAvailability });
    });
  }

  return card;
}

/* ---------------------------------------------------------
   Favorites — persisted to Supabase so they follow the collection
   across devices, not just this browser.
--------------------------------------------------------- */
async function toggleFavorite(cocktail) {
  const newVal = !cocktail.isFavorite;
  cocktail.isFavorite = newVal;
  renderBrowse();
  renderShelf();
  refreshModalIfShowing(cocktail.id);
  try {
    await updateFavoriteRemote(cocktail.id, newVal);
  } catch (err) {
    console.error('Failed to save favorite:', err);
    cocktail.isFavorite = !newVal;
    renderBrowse();
    renderShelf();
    refreshModalIfShowing(cocktail.id);
    alert("Couldn't save that — check your connection and try again.");
  }
}

/* ---------------------------------------------------------
   Full-size cocktail view ("zoom") — an overlay showing the same card,
   just bigger and with instructions expanded, not a new route.
--------------------------------------------------------- */
let activeModal = null; // { cocktailId, unitMode, opts } while the overlay is open

function renderModalContent(cocktail) {
  const slot = document.getElementById('modal-card-slot');
  slot.innerHTML = '';
  slot.appendChild(renderCard(cocktail, activeModal.unitMode, { ...activeModal.opts, expanded: true, inModal: true }));
}

function openCocktailModal(cocktail, unitMode, opts) {
  activeModal = { cocktailId: cocktail.id, unitMode, opts };
  renderModalContent(cocktail);
  document.getElementById('cocktail-modal-overlay').hidden = false;
  document.body.classList.add('modal-open');
}

function closeCocktailModal() {
  if (!activeModal) return;
  activeModal = null;
  document.getElementById('cocktail-modal-overlay').hidden = true;
  document.getElementById('modal-card-slot').innerHTML = '';
  document.body.classList.remove('modal-open');
}

function refreshModalIfShowing(cocktailId) {
  if (!activeModal || activeModal.cocktailId !== cocktailId) return;
  const cocktail = state.cocktails.find(c => c.id === cocktailId);
  if (!cocktail) { closeCocktailModal(); return; }
  renderModalContent(cocktail);
}

function wireModal() {
  const overlay = document.getElementById('cocktail-modal-overlay');
  document.getElementById('modal-close-btn').addEventListener('click', closeCocktailModal);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeCocktailModal();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && activeModal) closeCocktailModal();
  });
}

/* ---------------------------------------------------------
   Rendering: Browse view
--------------------------------------------------------- */
function renderBrowse() {
  renderCategoryRail(document.getElementById('browse-categories'), state.browseCategory, (key) => {
    state.browseCategory = key;
    renderBrowse();
  });
  syncUnitToggle('unit-toggle-browse');

  const grid = document.getElementById('browse-grid');
  const empty = document.getElementById('browse-empty');
  grid.innerHTML = '';

  const matches = state.cocktails
    .filter(c => cocktailMatchesCategory(c, state.browseCategory))
    .filter(c => cocktailMatchesSearch(c, state.browseSearch));
  matches.sort(compareCocktails);

  if (matches.length === 0) {
    empty.hidden = false;
  } else {
    empty.hidden = true;
    for (const c of matches) {
      grid.appendChild(renderCard(c, state.unit, { showAvailability: true }));
    }
  }
}

/* ---------------------------------------------------------
   Rendering: Shelf view
--------------------------------------------------------- */
function renderShelfManager() {
  const container = document.getElementById('shelf-groups');
  container.innerHTML = '';
  const groups = collectShelfIngredients();

  if (groups.length === 0) {
    container.innerHTML = '<p class="field-hint">No base ingredients tagged yet. Tag spirits/liqueurs/vermouths/bitters as "on my shelf" when adding a cocktail.</p>';
    return;
  }

  for (const group of groups) {
    const groupEl = document.createElement('div');
    groupEl.className = 'shelf-group';
    const h4 = document.createElement('h4');
    h4.style.setProperty('--dot-color', group.color);
    h4.textContent = group.label;
    groupEl.appendChild(h4);

    for (const item of group.items) {
      const row = document.createElement('label');
      row.className = 'shelf-item';
      const isOn = !!state.shelf[item.key];
      row.innerHTML = `
        <span class="switch">
          <input type="checkbox" ${isOn ? 'checked' : ''} data-key="${item.key}" />
          <span class="track"></span>
          <span class="thumb"></span>
        </span>
        <span>${item.name}</span>
      `;
      row.querySelector('input').addEventListener('change', async (e) => {
        const checked = e.target.checked;
        state.shelf[item.key] = checked;
        renderShelf();
        renderBrowse();
        try {
          await upsertShelfRemote(item.key, checked);
        } catch (err) {
          console.error('Failed to save shelf toggle:', err);
          state.shelf[item.key] = !checked;
          renderShelfManager();
          renderShelf();
          renderBrowse();
          alert("Couldn't save that — check your connection and try again.");
        }
      });
      groupEl.appendChild(row);
    }
    container.appendChild(groupEl);
  }
}

function renderShelf() {
  renderCategoryRail(document.getElementById('shelf-categories'), state.shelfCategory, (key) => {
    state.shelfCategory = key;
    renderShelf();
  });
  syncUnitToggle('unit-toggle-shelf');

  const grid = document.getElementById('shelf-grid');
  const empty = document.getElementById('shelf-empty');
  grid.innerHTML = '';

  const makeable = state.cocktails.filter(isMakeable);
  const matches = makeable
    .filter(c => cocktailMatchesCategory(c, state.shelfCategory))
    .filter(c => cocktailMatchesSearch(c, state.shelfSearch));
  matches.sort(compareCocktails);

  if (matches.length === 0) {
    empty.hidden = false;
  } else {
    empty.hidden = true;
    for (const c of matches) {
      grid.appendChild(renderCard(c, state.unit, { showAvailability: false }));
    }
  }
}

/* ---------------------------------------------------------
   Unit toggle (shared state, two toolbars to keep in sync)
--------------------------------------------------------- */
function syncUnitToggle(containerId) {
  const container = document.getElementById(containerId);
  container.querySelectorAll('.unit-btn').forEach(btn => {
    btn.classList.toggle('is-active', btn.dataset.unit === state.unit);
  });
}

function wireUnitToggles() {
  document.querySelectorAll('.unit-toggle').forEach(container => {
    container.addEventListener('click', (e) => {
      const btn = e.target.closest('.unit-btn');
      if (!btn) return;
      state.unit = btn.dataset.unit;
      saveUnit();
      renderBrowse();
      renderShelf();
    });
  });
}

/* ---------------------------------------------------------
   Search — filters live as you type, combined (AND) with whichever
   category-rail filter is active.
--------------------------------------------------------- */
function wireSearchInputs() {
  document.getElementById('search-browse').addEventListener('input', (e) => {
    state.browseSearch = e.target.value;
    renderBrowse();
  });
  document.getElementById('search-shelf').addEventListener('input', (e) => {
    state.shelfSearch = e.target.value;
    renderShelf();
  });
}

/* ---------------------------------------------------------
   Navigation between views
--------------------------------------------------------- */
function switchView(viewName) {
  closeCocktailModal();
  document.querySelectorAll('.nav-btn').forEach(b => {
    const active = b.dataset.view === viewName;
    b.classList.toggle('is-active', active);
    b.setAttribute('aria-selected', String(active));
  });
  document.querySelectorAll('.view').forEach(v => v.classList.remove('is-active'));
  document.getElementById('view-' + viewName).classList.add('is-active');

  if (viewName === 'browse') renderBrowse();
  if (viewName === 'shelf') { renderShelfManager(); renderShelf(); }
}

function wireNav() {
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => switchView(btn.dataset.view));
  });
}

/* ---------------------------------------------------------
   Add / Edit Cocktail form
--------------------------------------------------------- */
function unitOptionsHtml(selected) {
  return Object.keys(UNITS).map(key => {
    const label = key === 'whole' ? 'whole/piece' : (key === 'top' ? 'top with' : key);
    return `<option value="${key}" ${key === selected ? 'selected' : ''}>${label}</option>`;
  }).join('');
}

function populateGlassSelect() {
  const select = document.getElementById('field-glass-type');
  const options = ['<option value="">— none / unspecified —</option>'];
  for (const [id, def] of Object.entries(GLASS_TYPES)) {
    if (id === 'other') continue;
    options.push(`<option value="${id}">${def.label}</option>`);
  }
  options.push(`<option value="other">Other…</option>`);
  select.innerHTML = options.join('');
}

function updateGlassPreview() {
  const select = document.getElementById('field-glass-type');
  const customField = document.getElementById('field-glass-custom');
  const preview = document.getElementById('glass-icon-preview');
  const val = select.value;
  customField.hidden = val !== 'other';
  preview.innerHTML = val ? renderGlassIcon(val, 26) : '';
}

function wireGlassField() {
  document.getElementById('field-glass-type').addEventListener('change', updateGlassPreview);
}

function createIngredientRow(prefill) {
  const data = prefill || { amount: '', unit: 'oz', name: '', isBase: false, category: '' };
  const wrapper = document.createElement('div');
  wrapper.className = 'ingredient-row-wrapper';
  wrapper.innerHTML = `
    <div class="ingredient-row">
      <input type="number" class="ing-amount" step="0.125" min="0" placeholder="2" value="${data.amount !== '' && data.amount !== undefined ? data.amount : ''}" required />
      <select class="ing-unit">${unitOptionsHtml(data.unit || 'oz')}</select>
      <input type="text" class="ing-name" placeholder="Ingredient name" value="${data.name ? data.name.replace(/"/g, '&quot;') : ''}" required />
      <button type="button" class="row-remove" title="Remove ingredient">&times;</button>
    </div>
    <div class="ingredient-row-extra">
      <label><input type="checkbox" class="ing-isbase" ${data.isBase ? 'checked' : ''} /> on my shelf (spirit/liqueur/vermouth/bitters)</label>
      <input type="text" class="ing-category" list="category-datalist" placeholder="e.g. Gin" value="${data.category ? data.category.replace(/"/g, '&quot;') : ''}" ${data.isBase ? '' : 'disabled'} />
    </div>
  `;
  const isBaseCheckbox = wrapper.querySelector('.ing-isbase');
  const categoryInput = wrapper.querySelector('.ing-category');
  isBaseCheckbox.addEventListener('change', () => {
    categoryInput.disabled = !isBaseCheckbox.checked;
    if (isBaseCheckbox.checked) categoryInput.focus();
  });
  wrapper.querySelector('.row-remove').addEventListener('click', () => {
    const rows = document.querySelectorAll('#ingredient-rows .ingredient-row-wrapper');
    if (rows.length > 1) wrapper.remove();
  });
  return wrapper;
}

function resetIngredientRows() {
  const container = document.getElementById('ingredient-rows');
  container.innerHTML = '';
  container.appendChild(createIngredientRow());
  container.appendChild(createIngredientRow());
}

function updateCategoryDatalist() {
  const datalist = document.getElementById('category-datalist');
  datalist.innerHTML = collectCategories().map(c => `<option value="${c.label.replace(/"/g, '&quot;')}"></option>`).join('');
}

function setFormMode(mode, cocktail) {
  const heading = document.getElementById('add-form-heading');
  const submitBtn = document.getElementById('form-submit-btn');
  const cancelBtn = document.getElementById('cancel-edit-btn');
  if (mode === 'edit') {
    heading.textContent = `Edit "${cocktail.name}"`;
    submitBtn.textContent = 'Save changes';
    cancelBtn.hidden = false;
  } else {
    heading.textContent = 'Add a cocktail';
    submitBtn.textContent = 'Save cocktail';
    cancelBtn.hidden = true;
  }
}

function resetGlassField() {
  document.getElementById('field-glass-type').value = '';
  document.getElementById('field-glass-custom').value = '';
  updateGlassPreview();
}

function startEdit(cocktail) {
  state.editingId = cocktail.id;
  switchView('add');

  document.getElementById('field-name').value = cocktail.name || '';
  document.getElementById('field-instructions').value = cocktail.instructions || '';
  document.getElementById('field-garnish').value = cocktail.garnish || '';
  document.getElementById('field-notes').value = cocktail.notes || '';

  document.getElementById('field-glass-type').value = cocktail.glassType || '';
  document.getElementById('field-glass-custom').value = cocktail.glassCustom || '';
  updateGlassPreview();

  const rowsContainer = document.getElementById('ingredient-rows');
  rowsContainer.innerHTML = '';
  const ingredients = cocktail.ingredients.length ? cocktail.ingredients : [{}];
  for (const ing of ingredients) {
    rowsContainer.appendChild(createIngredientRow({
      amount: ing.amount, unit: ing.unit, name: ing.name, isBase: ing.isBase, category: ing.category,
    }));
  }

  setFormMode('edit', cocktail);
  document.getElementById('form-status').textContent = '';
  document.getElementById('view-add').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function cancelEdit() {
  state.editingId = null;
  document.getElementById('add-form').reset();
  resetIngredientRows();
  resetGlassField();
  setFormMode('add');
  document.getElementById('form-status').textContent = '';
}

async function deleteCocktail(id) {
  const cocktail = state.cocktails.find(c => c.id === id);
  if (!cocktail) return;
  const ok = confirm(`Delete "${cocktail.name}"? This can't be undone.`);
  if (!ok) return;
  try {
    await deleteCocktailRemote(id);
  } catch (err) {
    console.error('Failed to delete cocktail:', err);
    alert("Couldn't delete that — check your connection and try again.");
    return;
  }
  state.cocktails = state.cocktails.filter(c => c.id !== id);
  if (state.editingId === id) cancelEdit();
  updateCategoryDatalist();
  renderBrowse();
  renderShelfManager();
  renderShelf();
}

function wireAddForm() {
  document.getElementById('add-ingredient-btn').addEventListener('click', () => {
    document.getElementById('ingredient-rows').appendChild(createIngredientRow());
  });

  document.getElementById('cancel-edit-btn').addEventListener('click', cancelEdit);

  document.getElementById('add-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const statusEl = document.getElementById('form-status');
    const name = document.getElementById('field-name').value.trim();
    const glassType = document.getElementById('field-glass-type').value;
    const glassCustom = document.getElementById('field-glass-custom').value.trim();
    const instructions = document.getElementById('field-instructions').value.trim();
    const garnish = document.getElementById('field-garnish').value.trim();
    const notes = document.getElementById('field-notes').value.trim();

    const rows = document.querySelectorAll('#ingredient-rows .ingredient-row-wrapper');
    const ingredients = [];
    let missingCategory = false;
    rows.forEach(row => {
      const amountRaw = row.querySelector('.ing-amount').value;
      const unit = row.querySelector('.ing-unit').value;
      const ingName = row.querySelector('.ing-name').value.trim();
      const isBase = row.querySelector('.ing-isbase').checked;
      const category = row.querySelector('.ing-category').value.trim();
      if (!ingName || amountRaw === '') return;
      if (isBase && !category) missingCategory = true;
      const ingredient = { name: ingName, amount: parseFloat(amountRaw), unit, isBase };
      if (isBase) ingredient.category = category;
      ingredients.push(ingredient);
    });

    if (!name || ingredients.length === 0 || !instructions) {
      statusEl.style.color = '#8B3A2B';
      statusEl.textContent = 'Please add a name, at least one ingredient, and instructions.';
      return;
    }
    if (missingCategory) {
      statusEl.style.color = '#8B3A2B';
      statusEl.textContent = 'Give each "on my shelf" ingredient a category (e.g. Gin, Bitters).';
      return;
    }

    const cocktailData = { name, glassType, glassCustom, ingredients, instructions, garnish, notes };
    const submitBtn = document.getElementById('form-submit-btn');
    submitBtn.disabled = true;
    statusEl.style.color = '#5b4d2e';
    statusEl.textContent = 'Saving…';

    if (state.editingId) {
      const existing = state.cocktails.find(c => c.id === state.editingId);
      const cocktail = { id: state.editingId, ...cocktailData, isFavorite: existing ? existing.isFavorite : false };
      try {
        await updateCocktailRemote(cocktail);
      } catch (err) {
        console.error('Failed to save changes:', err);
        submitBtn.disabled = false;
        statusEl.style.color = '#8B3A2B';
        statusEl.textContent = "Couldn't save — check your connection and try again.";
        return;
      }
      const idx = state.cocktails.findIndex(c => c.id === state.editingId);
      if (idx !== -1) state.cocktails[idx] = cocktail;
      submitBtn.disabled = false;
      cancelEdit();
      statusEl.style.color = '#1E4D3B';
      statusEl.textContent = `Saved changes to "${name}".`;
    } else {
      const cocktail = { id: uid(), ...cocktailData };
      try {
        await insertCocktailRemote(cocktail);
      } catch (err) {
        console.error('Failed to save cocktail:', err);
        submitBtn.disabled = false;
        statusEl.style.color = '#8B3A2B';
        statusEl.textContent = "Couldn't save — check your connection and try again.";
        return;
      }
      state.cocktails.push(cocktail);
      submitBtn.disabled = false;
      statusEl.style.color = '#1E4D3B';
      statusEl.textContent = `Saved "${name}" to your collection.`;
      e.target.reset();
      resetIngredientRows();
      resetGlassField();
    }

    updateCategoryDatalist();
    renderBrowse();
    renderShelfManager();
    renderShelf();
  });
}

/* ---------------------------------------------------------
   Export / Import
--------------------------------------------------------- */
function wireExportImport() {
  document.getElementById('export-btn').addEventListener('click', () => {
    const payload = { cocktails: state.cocktails, shelf: state.shelf, exportedAt: new Date().toISOString() };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const dateStr = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `bar-ledger-backup-${dateStr}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  });

  document.getElementById('import-input').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      let data;
      try {
        data = JSON.parse(reader.result);
      } catch (err) {
        alert('That file is not valid JSON.');
        e.target.value = '';
        return;
      }
      if (!data || !Array.isArray(data.cocktails)) {
        alert('That file does not look like a Bar Ledger backup (expected a "cocktails" array).');
        e.target.value = '';
        return;
      }
      const existingByKey = new Map(state.cocktails.map(c => [normalize(c.name), c]));
      const toAdd = [];
      const toReplace = [];
      for (const c of data.cocktails) {
        if (!c || !c.name) continue;
        const key = normalize(c.name);
        if (existingByKey.has(key)) toReplace.push(c);
        else toAdd.push(c);
      }

      const proceed = confirm(
        `This will add ${toAdd.length} new cocktail(s)` +
        (toReplace.length > 0
          ? ` and replace ${toReplace.length} existing cocktail(s) with matching names (${toReplace.map(c => c.name).join(', ')}) with the imported version.`
          : '.') +
        ' Continue?'
      );
      if (!proceed) { e.target.value = ''; return; }

      const prepared = [];
      for (const c of toAdd) {
        if (!c.id) c.id = uid();
        if (!c.notes) c.notes = '';
        normalizeGlass(c);
        prepared.push(c);
      }
      for (const c of toReplace) {
        const key = normalize(c.name);
        const existing = existingByKey.get(key);
        c.id = existing.id; // keep the existing row's id so this is an update, not a duplicate
        if (!c.notes) c.notes = '';
        normalizeGlass(c);
        prepared.push(c);
      }

      try {
        await upsertCocktailsRemote(prepared);
      } catch (err) {
        console.error('Import failed:', err);
        alert("Couldn't import — check your connection and try again.");
        e.target.value = '';
        return;
      }

      const byId = new Map(state.cocktails.map(c => [c.id, c]));
      for (const c of prepared) byId.set(c.id, c);
      state.cocktails = Array.from(byId.values());

      if (data.shelf && typeof data.shelf === 'object') {
        const shelfUpdates = Object.entries(data.shelf).filter(([, val]) => val);
        try {
          for (const [key] of shelfUpdates) {
            await upsertShelfRemote(key, true);
            state.shelf[key] = true;
          }
        } catch (err) {
          console.error('Failed to import shelf state:', err);
        }
      }

      updateCategoryDatalist();
      renderBrowse();
      renderShelfManager();
      renderShelf();
      e.target.value = '';
      alert(`Imported: ${toAdd.length} added, ${toReplace.length} replaced.`);
    };
    reader.readAsText(file);
  });
}

/* ---------------------------------------------------------
   Init
--------------------------------------------------------- */
async function init() {
  wireNav();
  wireUnitToggles();
  wireSearchInputs();
  wireModal();
  populateGlassSelect();
  wireGlassField();
  wireAddForm();
  wireExportImport();
  resetIngredientRows();
  resetGlassField();
  await loadState();
  updateCategoryDatalist();
  renderBrowse();
  renderShelfManager();
  renderShelf();
}

document.addEventListener('DOMContentLoaded', init);
