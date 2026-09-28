'use strict';

// ---------- Basis ----------
const KEY = 'calorietracker.v1';
const APP_VERSION = '2026-09-28-8'; // gelijk houden met VERSION in sw.js
const OFF = 'https://world.openfoodfacts.org';
const OFF_FIELDS = 'code,product_name,product_name_nl,brands,nutriments,serving_size,serving_quantity,image_front_small_url,quantity,product_quantity_unit';

const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const r0 = n => Math.round(n || 0);
const fmtN = n => (Math.round((n || 0) * 10) / 10).toLocaleString('nl-NL');
// Voor invoervelden: zonder duizendtal-punt, want "2.000" leest num() terug als 2.
const fmtIn = n => String(Math.round((n || 0) * 100) / 100).replace('.', ',');
const num = v => { const n = parseFloat(String(v ?? '').replace(',', '.')); return Number.isFinite(n) ? n : undefined; };
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

const ICON = {
  left: '<path d="M15 18l-6-6 6-6"/>',
  right: '<path d="M9 18l6-6-6-6"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/>',
  barcode: '<path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2M7 8v8M10 8v8M13 8v8M17 8v8"/>',
  camera: '<path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z"/><circle cx="12" cy="13.5" r="3.5"/>',
  pencil: '<path d="M4 20h4L19 9l-4-4L4 16v4zM13.5 6.5l4 4"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  flash: '<path d="M13 2L4 14h7l-1 8 9-12h-7l1-8z"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>',
  image: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="M21 16l-5-5-9 9"/>',
  bowl: '<path d="M3 11h18a9 9 0 0 1-18 0z"/><path d="M8 7c0-1.5 1-2 1-3.5M12 7c0-1.5 1-2 1-3.5M16 7c0-1.5 1-2 1-3.5"/>',
  check: '<path d="M5 12l5 5 9-10"/>',
  swap: '<path d="M4 8h13l-3-3M20 16H7l3 3"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  cart: '<path d="M3 4h2l2.5 11h11L21 8H7"/><circle cx="9" cy="19.5" r="1.5"/><circle cx="17" cy="19.5" r="1.5"/>',
};
const ic = name => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[name]}</svg>`;

const MEALS = [
  { id: 'breakfast', name: 'Ontbijt', short: 'Ontbijt', icon: '🍳', share: 0.25 },
  { id: 'lunch', name: 'Lunch', short: 'Lunch', icon: '🥪', share: 0.30 },
  { id: 'dinner', name: 'Diner', short: 'Diner', icon: '🍝', share: 0.35 },
  { id: 'snack', name: 'Tussendoortjes', short: 'Tussendoor', icon: '🍎', share: 0.10 },
];
const mealName = id => MEALS.find(m => m.id === id)?.name || '';

const NUTS = [
  { k: 'kcal', label: 'Energie', unit: 'kcal' },
  { k: 'carbs', label: 'Koolhydraten', unit: 'g' },
  { k: 'sugar', label: 'waarvan suikers', unit: 'g', sub: true },
  { k: 'fat', label: 'Vet', unit: 'g' },
  { k: 'sat', label: 'waarvan verzadigd', unit: 'g', sub: true },
  { k: 'protein', label: 'Eiwit', unit: 'g' },
  { k: 'fiber', label: 'Vezels', unit: 'g' },
  { k: 'salt', label: 'Zout', unit: 'g' },
];
const NKEYS = NUTS.map(x => x.k);
const MACROS = [
  { k: 'carbs', l: 'Koolhydraten', s: 'K', c: 'var(--carbs)', kcal: 4 },
  { k: 'protein', l: 'Eiwit', s: 'E', c: 'var(--protein)', kcal: 4 },
  { k: 'fat', l: 'Vet', s: 'V', c: 'var(--fat)', kcal: 9 },
];

// ---------- Opslag ----------
function load() {
  try {
    const d = JSON.parse(localStorage.getItem(KEY));
    if (d && d.diary && d.foods) return d;
  } catch { }
  return { profile: null, foods: {}, diary: {} };
}
let S = load();
S.recipes ||= {};
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(S)); }
  catch { toast('Opslaan mislukt. Is het geheugen vol?'); }
}

// ---------- Datum ----------
const dayKey = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const toDate = k => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
const shiftDay = (k, n) => { const d = toDate(k); d.setDate(d.getDate() + n); return dayKey(d); };
let today = dayKey(new Date());
let cur = today;
function dayLabel(k) {
  if (k === today) return 'Vandaag';
  if (k === shiftDay(today, -1)) return 'Gisteren';
  if (k === shiftDay(today, 1)) return 'Morgen';
  return toDate(k).toLocaleDateString('nl-NL', { weekday: 'long' });
}

// ---------- Rekenen ----------
const grams = e => e.qty * (e.serving ? e.serving.g : 1);
function nutrOf(n, g) {
  const o = {};
  for (const k of NKEYS) o[k] = ((n && n[k]) || 0) * g / 100;
  return o;
}
function total(entries) {
  const t = Object.fromEntries(NKEYS.map(k => [k, 0]));
  for (const e of entries) {
    const v = nutrOf(e.n, grams(e));
    for (const k of NKEYS) t[k] += v[k];
  }
  return t;
}

const ACT = [
  { v: 1.2, l: 'Weinig beweging', d: 'Zittend werk, nauwelijks sport' },
  { v: 1.375, l: 'Licht actief', d: '1-3 keer per week sporten of veel lopen' },
  { v: 1.55, l: 'Actief', d: '3-5 keer per week sporten' },
  { v: 1.725, l: 'Zeer actief', d: 'Dagelijks sporten of lichamelijk werk' },
];
const GOALS = [
  { v: -500, l: 'Afvallen', d: 'Ongeveer een halve kilo per week' },
  { v: -250, l: 'Rustig afvallen', d: 'Ongeveer een kwart kilo per week' },
  { v: 0, l: 'Gewicht houden', d: 'Evenveel eten als je verbruikt' },
  { v: 300, l: 'Aankomen', d: 'Rustig spiermassa opbouwen' },
];
const SPLITS = [
  { v: 'bal', l: 'Gebalanceerd', c: 50, p: 20, f: 30 },
  { v: 'eiwit', l: 'Eiwitrijk', c: 40, p: 30, f: 30 },
  { v: 'low', l: 'Koolhydraatarm', c: 25, p: 35, f: 40 },
  { v: 'eigen', l: 'Eigen verdeling' },
];
const DEFAULT_PROFILE = { sex: 'v', age: 35, height: 168, weight: 70, act: 1.375, goal: 0, split: 'bal', c: 50, p: 20, f: 30, kcalOverride: null };

// Mifflin-St Jeor, keer activiteit, plus of min het doel. Afgerond op tientallen.
function calcKcal(p) {
  const bmr = 10 * p.weight + 6.25 * p.height - 5 * p.age + (p.sex === 'm' ? 5 : -161);
  return Math.round((bmr * p.act + p.goal) / 10) * 10;
}
function goals(p = S.profile || DEFAULT_PROFILE) {
  const kcal = p.kcalOverride || calcKcal(p);
  return { kcal, carbs: kcal * p.c / 100 / 4, protein: kcal * p.p / 100 / 4, fat: kcal * p.f / 100 / 9, pct: { carbs: p.c, protein: p.p, fat: p.f } };
}

// ---------- Weergave ----------
const hasNutr = f => f && f.n && f.n.kcal !== undefined && f.n.kcal !== null;
const UNIT_NAME = { g: 'gram', ml: 'milliliter', stuk: 'stuk' };
// Producten "per stuk" (gekookt ei = 70 kcal) bewaren hun waarden intern per 100 stuks,
// zodat alle sommen hetzelfde blijven als bij gram en milliliter.
const baseText = u => (u === 'stuk' ? 'per stuk' : `per 100 ${u}`);
const baseQty = u => (u === 'stuk' ? 1 : 100);
const perBase = (f, k) => (f.n[k] === undefined || f.n[k] === null ? f.n[k] : f.unit === 'stuk' ? f.n[k] / 100 : f.n[k]);
const thumb = f => f.img
  ? `<img class="thumb" src="${esc(f.img)}" alt="" loading="lazy" referrerpolicy="no-referrer">`
  : '<div class="thumb">🍽️</div>';
function amountLabel(e) {
  if (e.menu) return 'Bakje Geluk weekmenu';
  if (e.recipe) {
    const { eaten, portions } = e.recipe;
    return `${fmtN(eaten)} ${eaten === 1 ? 'portie' : 'porties'}${portions !== 1 ? ` van ${fmtN(portions)}` : ''}`;
  }
  return e.serving
    ? `${fmtN(e.qty)} × ${e.serving.label} (${fmtN(grams(e))} ${e.unit})`
    : `${fmtN(e.qty)} ${e.unit}`;
}

let toastTimer;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2400);
}

function render() {
  const app = $('#app');
  const g = goals();
  const day = S.diary[cur] || [];
  const t = total(day);
  const left = g.kcal - t.kcal;
  const over = left < 0;
  const C = 2 * Math.PI * 62;
  const frac = Math.min(t.kcal / g.kcal, 1);
  const kc = Object.fromEntries(MACROS.map(m => [m.k, t[m.k] * m.kcal]));
  const kcSum = kc.carbs + kc.protein + kc.fat;
  const pct = k => (kcSum ? Math.round(kc[k] / kcSum * 100) : 0);

  app.innerHTML = `
    <header class="topbar">
      <button class="icon-btn" data-act="prev" aria-label="Vorige dag">${ic('left')}</button>
      <button class="title" data-act="today">${esc(dayLabel(cur))}
        <small>${esc(toDate(cur).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: cur.slice(0, 4) === today.slice(0, 4) ? undefined : 'numeric' }))}</small></button>
      <button class="icon-btn" data-act="next" aria-label="Volgende dag">${ic('right')}</button>
      <button class="icon-btn" data-act="menu" aria-label="Weekmenu">${ic('calendar')}</button>
      <button class="icon-btn" data-act="profile" aria-label="Profiel en doelen">${ic('user')}</button>
    </header>
    ${S.profile ? '' : `<div class="banner"><div class="t"><b>Stel je dagdoel in</b><br><small>Nu reken ik met een standaarddoel. Met je lengte, gewicht en doel wordt het persoonlijk.</small></div><button class="add-btn" data-act="profile" aria-label="Doel instellen">${ic('right')}</button></div>`}
    <section class="card summary">
      <div class="summary-top">
        <div class="stat"><b class="num">${r0(t.kcal)}</b><small>gegeten</small></div>
        <div class="ring${over ? ' over' : ''}">
          <svg viewBox="0 0 140 140"><circle class="track" cx="70" cy="70" r="62"/>
            <circle class="prog" cx="70" cy="70" r="62" stroke-dasharray="${C}" stroke-dashoffset="${C * (1 - frac)}"/></svg>
          <div class="ring-label"><b class="num">${r0(Math.abs(left))}</b><small>${over ? 'kcal te veel' : 'kcal over'}</small></div>
        </div>
        <div class="stat"><b class="num">${g.kcal}</b><small>doel</small></div>
      </div>
      <div class="macros">
        ${MACROS.map(m => `<div class="macro${t[m.k] > g[m.k] * 1.05 ? ' over' : ''}">
          <div class="lbl">${m.l}</div>
          <div class="bar"><i style="width:${Math.min(100, t[m.k] / g[m.k] * 100)}%;background:${m.c}"></i></div>
          <small class="num">${r0(t[m.k])} / ${r0(g[m.k])} g</small></div>`).join('')}
      </div>
      <div class="split">
        <div class="split-head"><span>Macroverdeling</span><small>% van je kcal · doel</small></div>
        <div class="split-bar">${kcSum ? MACROS.map(m => `<i style="width:${kc[m.k] / kcSum * 100}%;background:${m.c}"></i>`).join('') : ''}</div>
        <div class="legend">${MACROS.map(m => `<div><span><i class="dot" style="background:${m.c}"></i>${m.l}</span>
          <small class="num"><b>${pct(m.k)}%</b> · doel ${g.pct[m.k]}%</small></div>`).join('')}</div>
      </div>
    </section>
    ${menuTodayHtml(cur)}
    ${MEALS.map(m => {
      const es = day.filter(e => e.meal === m.id);
      const mt = total(es);
      return `<section class="card">
        <div class="meal-head">
          <div class="meal-ic">${m.icon}</div>
          <div class="t"><h3>${m.name}</h3><small class="num">${r0(mt.kcal)} / ${r0(g.kcal * m.share)} kcal</small></div>
          <button class="add-btn" data-add="${m.id}" aria-label="${m.name} toevoegen">${ic('plus')}</button>
        </div>
        ${es.length ? `<ul class="entries">${es.map(e => `<li class="entry" data-entry="${e.id}">
            <div class="t"><b>${esc(e.name)}</b><small>${esc(amountLabel(e))}${e.brand ? ' · ' + esc(e.brand) : ''}</small></div>
            <span class="k num">${r0(nutrOf(e.n, grams(e)).kcal)} kcal</span></li>`).join('')}</ul>
          <div class="meal-macros">${MACROS.map(x => `<span><i class="dot" style="background:${x.c}"></i>${x.l} ${fmtN(mt[x.k])} g</span>`).join('')}</div>` : ''}
      </section>`;
    }).join('')}
    <p class="hint">Je gegevens staan alleen op deze telefoon. Maak af en toe een back-up via je profiel.</p>`;
}

$('#app').addEventListener('click', e => {
  const a = e.target.closest('[data-act],[data-add],[data-entry],[data-eat],[data-md]');
  if (!a) return;
  if (a.dataset.add) return openAdd(a.dataset.add);
  if (a.dataset.eat) { toggleEaten(cur, a.dataset.eat); return render(); }
  if (a.dataset.md) return openDish({ day: cur, slot: a.dataset.md });
  if (a.dataset.entry) {
    const entry = (S.diary[cur] || []).find(x => x.id === a.dataset.entry);
    if (entry?.menu) openDish({ day: cur, slot: entry.menu.slot, dishId: entry.menu.dishId });
    else if (entry?.recipe) openRecipe({ entry });
    else if (entry) openPortion({ entry });
    return;
  }
  const act = a.dataset.act;
  if (act === 'prev') { cur = shiftDay(cur, -1); render(); }
  if (act === 'next') { cur = shiftDay(cur, 1); render(); }
  if (act === 'today') { cur = today; render(); }
  if (act === 'profile') openProfile();
  if (act === 'menu') openWeekMenu();
});

// Na middernacht springt "Vandaag" mee als je de app weer opent.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') return;
  const now = dayKey(new Date());
  if (now !== today) {
    if (cur === today) cur = now;
    today = now;
    if (!layers.length) render();
  }
});

// ---------- Lagen (schermen en sheets) met de terugknop van Android ----------
const layers = [];
let afterClose = null;
function openLayer(el, onclose) {
  el._onclose = onclose;
  layers.push(el);
  document.body.append(el);
  history.pushState({ depth: layers.length }, '');
  requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('open')));
  return el;
}
// Sluit n lagen; `then` draait zodra ze weg zijn.
function closeLayers(n = 1, then = null) {
  n = Math.min(n, layers.length);
  if (!n) { then?.(); return; }
  afterClose = then;
  history.go(-n);
}
const closeAll = then => closeLayers(layers.length, then);
window.addEventListener('popstate', e => {
  const depth = e.state?.depth || 0;
  while (layers.length > depth) {
    const el = layers.pop();
    el._onclose?.();
    el.classList.remove('open');
    setTimeout(() => el.remove(), 260);
  }
  if (!layers.length && reloadPending) return location.reload();
  if (!layers.length) render();
  const then = afterClose;
  afterClose = null;
  then?.();
});
history.replaceState({ depth: 0 }, '');

function screen(title, body) {
  const el = document.createElement('div');
  el.className = 'layer screen';
  el.innerHTML = `<div class="inner">
    <header class="topbar"><button class="icon-btn" data-close aria-label="Terug">${ic('left')}</button>
      <div class="title">${esc(title)}</div><div style="width:42px"></div></header>${body}</div>`;
  el.addEventListener('click', e => { if (e.target.closest('[data-close]')) closeLayers(); });
  return el;
}
function sheet(body) {
  const el = document.createElement('div');
  el.className = 'layer sheet-wrap';
  el.innerHTML = `<div class="sheet"><div class="grip"></div>${body}</div>`;
  el.addEventListener('click', e => { if (e.target === el || e.target.closest('[data-close]')) closeLayers(); });
  return el;
}

// ---------- Open Food Facts ----------
function cleanServing(s) {
  if (!s || /^\s*[\d.,]+\s*(g|gr|ml)\s*$/i.test(s)) return 'portie';
  const label = s.replace(/\(.*?\)/g, '').replace(/\b(portions?|servings?)\b/gi, 'portie').replace(/^\s*1\s+/, '').trim();
  return label || 'portie';
}
function fromOFF(p) {
  const nm = p.nutriments || {};
  const get = k => { const v = nm[k + '_100g']; return v === undefined || v === null || v === '' ? undefined : +v; };
  let kcal = get('energy-kcal');
  if (kcal === undefined) { const kj = get('energy-kj') ?? get('energy'); if (kj !== undefined) kcal = kj / 4.184; }
  const brands = Array.isArray(p.brands) ? p.brands[0] : String(p.brands || '').split(',')[0];
  const sq = parseFloat(p.serving_quantity);
  return {
    id: 'off:' + p.code, code: String(p.code || ''), source: 'off',
    name: String(p.product_name_nl || p.product_name || '').trim(),
    brand: String(brands || '').trim(),
    unit: p.product_quantity_unit === 'ml' || /\d\s*(ml|cl|l)\b/i.test(p.quantity || '') ? 'ml' : 'g',
    n: {
      kcal: kcal === undefined ? undefined : Math.round(kcal),
      carbs: get('carbohydrates'), sugar: get('sugars'), fat: get('fat'), sat: get('saturated-fat'),
      protein: get('proteins'), fiber: get('fiber'), salt: get('salt'),
    },
    servings: sq > 0 ? [{ label: cleanServing(p.serving_size), g: sq }] : [],
    img: p.image_front_small_url || null,
  };
}
// Open Food Facts geeft bij drukte of te veel zoekopdrachten per minuut een 503; dan even wachten en opnieuw.
async function fetchJson(url, tries = 3) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url);
      if (r.ok) return await r.json();
      if (r.status === 404) return r.json();
    } catch { }
    if (i < tries - 1) await new Promise(res => setTimeout(res, 2000 * (i + 1)));
  }
  throw new Error('Open Food Facts reageert niet');
}
const found = new Map(); // zoekresultaten die nog niet in je eigen lijst staan
const getFood = id => S.foods[id] || found.get(id);

// ---------- Leren uit je dagboek ----------
// Per dag en maaltijd de set producten die je at, bijvoorbeeld {meal:'breakfast', ids:[brood, halvarine]}.
function mealGroups() {
  const groups = [];
  for (const es of Object.values(S.diary)) {
    const by = {};
    for (const e of es) if (e.foodId && !e.recipe) (by[e.meal] ||= new Set()).add(e.foodId);
    for (const [meal, ids] of Object.entries(by)) groups.push({ meal, ids });
  }
  return groups;
}
const usable = id => S.foods[id] && hasNutr(S.foods[id]);
function topCounts(counts, max) {
  return Object.entries(counts)
    .filter(([id, n]) => n >= 2 && usable(id))
    .sort((a, b) => b[1] - a[1] || (S.foods[b[0]].used || 0) - (S.foods[a[0]].used || 0))
    .slice(0, max)
    .map(([id]) => S.foods[id]);
}
// Wat je het vaakst bij deze maaltijd eet (minstens twee keer).
function frequentFor(meal) {
  const counts = {};
  for (const g of mealGroups()) if (g.meal === meal) for (const id of g.ids) counts[id] = (counts[id] || 0) + 1;
  return topCounts(counts, 8);
}
// Wat je meestal in dezelfde maaltijd samen met dit product eet (minstens twee keer).
function companionsOf(foodId) {
  const counts = {};
  for (const g of mealGroups()) {
    if (!g.ids.has(foodId)) continue;
    for (const id of g.ids) if (id !== foodId) counts[id] = (counts[id] || 0) + 1;
  }
  return topCounts(counts, 5);
}
// Past een eerder bewaarde hoeveelheid nog bij dit product? Na omzetten van gram naar stuk niet meer:
// dan zou "2 × snee (35 g)" ineens 70 stuks worden.
function fits(food, p) {
  if (!p) return false;
  if (p.unit && p.unit !== food.unit) return false;
  if (!p.serving) return true;
  return food.unit !== 'stuk' && (food.servings || []).some(s => s.label === p.serving.label && s.g === p.serving.g);
}
// De portie die je de vorige keer nam, anders één portie of 100 gram (of 1 stuk).
function defaultPortion(food) {
  if (fits(food, food.last)) return food.last;
  const s = (food.servings || [])[0];
  return s ? { qty: 1, serving: s } : { qty: baseQty(food.unit), serving: null };
}
function portionText(food, p = defaultPortion(food)) {
  return p.serving ? `${fmtN(p.qty)} × ${p.serving.label}` : `${fmtN(p.qty)} ${food.unit}`;
}
function makeEntry(food, meal, qty, serving) {
  return { id: uid(), t: Date.now(), meal, foodId: food.id, name: food.name, brand: food.brand || '', unit: food.unit, n: { ...food.n }, qty, serving };
}

// ---------- Eten toevoegen ----------
// Tijdens het samenstellen van een maaltijd kies je ingrediënten via hetzelfde toevoegscherm.
// `picking` onthoudt dan waar het gekozen ingrediënt heen moet.
let picking = null;

function itemHtml(f) {
  const info = hasNutr(f) ? `${r0(perBase(f, 'kcal'))} kcal ${baseText(f.unit)}` : 'voedingswaarden ontbreken';
  return `<div class="item" data-food="${esc(f.id)}">${thumb(f)}
    <div class="t"><b>${esc(f.name)}</b><small>${esc([f.brand, info].filter(Boolean).join(' · '))}</small></div>
    <span class="plus">${ic('plus')}</span></div>`;
}

function recipeItemHtml(r) {
  const { t } = recipeTotals(r.items);
  return `<div class="item" data-recipe="${esc(r.id)}"><div class="thumb">🥘</div>
    <div class="t"><b>${esc(r.name)}</b><small>${r.items.length} ingrediënten · ${r0(t.kcal / r.portions)} kcal per portie</small></div>
    <span class="plus">${ic('plus')}</span></div>`;
}

// `pick`: callback als je een ingrediënt voor een maaltijd kiest in plaats van iets te eten.
function openAdd(meal, pick = null) {
  const el = screen(pick ? 'Ingrediënt kiezen' : `${mealName(meal)} toevoegen`, `
    <form class="search" id="sf"><input id="q" type="search" placeholder="Zoek een product" enterkeyhint="search" autocomplete="off">
      <button class="icon-btn" aria-label="Zoeken">${ic('search')}</button></form>
    <div class="tiles${pick ? '' : ' four'}">
      <button class="tile" data-t="barcode"><span class="ic">${ic('barcode')}</span>Barcode scannen</button>
      <button class="tile" data-t="label"><span class="ic">${ic('camera')}</span>Etiket scannen</button>
      <button class="tile" data-t="manual"><span class="ic">${ic('pencil')}</span>Zelf invoeren</button>
      ${pick ? '' : `<button class="tile" data-t="recipe"><span class="ic">${ic('bowl')}</span>Maaltijd maken</button>`}
    </div>
    <div id="local"></div><div id="off"></div>`);
  const q = $('#q', el);
  const section = (title, html) => `<div class="section-title">${title}</div><div class="list">${html}</div>`;
  const showLocal = () => {
    const term = norm(q.value.trim());
    const match = s => !term || norm(s).includes(term);
    const recipes = pick ? [] : Object.values(S.recipes)
      .filter(r => match(r.name))
      .sort((a, b) => (b.used || 0) - (a.used || 0));
    const often = term || pick ? [] : frequentFor(meal);
    const foods = Object.values(S.foods)
      .filter(f => !often.includes(f) && match(`${f.name} ${f.brand || ''}`))
      .sort((a, b) => (b.used || 0) - (a.used || 0))
      .slice(0, 30);
    let html = '';
    if (recipes.length) html += section('Mijn maaltijden', recipes.map(recipeItemHtml).join(''));
    if (often.length) html += section(`Vaak bij ${mealName(meal).toLowerCase()}`, often.map(itemHtml).join(''));
    html += section(term ? 'Mijn producten' : 'Recent', foods.length ? foods.map(itemHtml).join('') : `<div class="empty">${term
      ? 'Niet in je eigen lijst. Druk op zoeken om Open Food Facts te doorzoeken.'
      : 'Nog niets toegevoegd. Zoek een product of scan een barcode.'}</div>`);
    $('#local', el).innerHTML = html;
  };
  el._refresh = showLocal;
  q.addEventListener('input', () => { showLocal(); $('#off', el).innerHTML = ''; });
  $('#sf', el).addEventListener('submit', e => {
    e.preventDefault();
    q.blur();
    showLocal();
    searchOFF(q.value, $('#off', el));
  });
  el.addEventListener('click', e => {
    const rec = e.target.closest('[data-recipe]');
    if (rec) return openRecipe({ recipe: S.recipes[rec.dataset.recipe], meal });
    const item = e.target.closest('[data-food]');
    if (item) {
      const food = getFood(item.dataset.food);
      if (!food) return;
      if (hasNutr(food)) openPortion({ food, meal });
      else openFoodForm({ food, meal, note: 'Van dit product ontbreken de voedingswaarden. Scan het etiket of vul ze zelf in.' });
      return;
    }
    const tile = e.target.closest('[data-t]');
    if (!tile) return;
    if (tile.dataset.t === 'barcode') openScanner(meal);
    if (tile.dataset.t === 'label') openFoodForm({ meal, scan: true });
    if (tile.dataset.t === 'manual') openFoodForm({ meal });
    if (tile.dataset.t === 'recipe') openRecipe({ meal });
  });
  showLocal();
  if (pick) picking = { cb: pick, base: layers.length, el };
  openLayer(el, () => { if (picking?.el === el) picking = null; });
}

async function searchOFF(term, box) {
  term = term.trim();
  if (term.length < 2) return;
  box.innerHTML = '<div class="section-title">Open Food Facts</div><div class="list"><div class="empty"><span class="spinner"></span></div></div>';
  try {
    const url = `${OFF}/cgi/search.pl?search_terms=${encodeURIComponent(term)}&search_simple=1&action=process&json=1&page_size=40&fields=${OFF_FIELDS}`;
    const d = await fetchJson(url);
    const foods = (d.products || []).map(fromOFF).filter(f => f.name && f.code);
    foods.forEach(f => found.set(f.id, f));
    // Producten met voedingswaarden eerst.
    foods.sort((a, b) => hasNutr(b) - hasNutr(a));
    box.innerHTML = `<div class="section-title">Open Food Facts</div><div class="list">${foods.length
      ? foods.map(f => itemHtml(S.foods[f.id] || f)).join('')
      : '<div class="empty">Geen resultaten. Probeer een ander woord of scan de barcode.</div>'}</div>`;
  } catch {
    box.innerHTML = `<div class="section-title">Open Food Facts</div><div class="list"><div class="empty">
      Zoeken lukt nu niet. De database is soms even overbelast; probeer het over een minuut opnieuw of scan de barcode.</div></div>`;
  }
}

// ---------- Portiegrootte ----------
function donut(v) {
  const C = 2 * Math.PI * 32;
  const kc = MACROS.map(m => (v[m.k] || 0) * m.kcal);
  const sum = kc.reduce((a, b) => a + b, 0);
  let start = 0;
  const arcs = sum ? MACROS.map((m, i) => {
    const len = kc[i] / sum * C;
    const s = `<circle cx="38" cy="38" r="32" stroke="${m.c}" stroke-dasharray="${len} ${C - len}" stroke-dashoffset="${-start}"/>`;
    start += len;
    return s;
  }).join('') : '';
  return `<div class="donut"><svg viewBox="0 0 76 76"><circle cx="38" cy="38" r="32" stroke="var(--line)"/>${arcs}</svg>
    <div class="c"><b class="num">${r0(v.kcal)}</b>kcal</div></div>`;
}

function openPortion({ food, meal, entry }) {
  if (entry) {
    food = S.foods[entry.foodId] || {
      id: entry.foodId, name: entry.name, brand: entry.brand, unit: entry.unit, n: entry.n,
      servings: entry.serving ? [entry.serving] : [], source: 'custom',
    };
    meal = entry.meal;
  }
  const pick = !entry && picking;
  const servs = [...(food.servings || [])];
  const start = entry && fits(food, entry) ? entry : defaultPortion(food);
  let sIdx = -1;
  const qty = start.qty;
  if (start.serving) {
    sIdx = servs.findIndex(s => s.label === start.serving.label && s.g === start.serving.g);
    if (sIdx < 0) { servs.push(start.serving); sIdx = servs.length - 1; }
  }
  let curMeal = meal;
  const comps = entry || pick ? [] : companionsOf(food.id);
  const chosen = new Set();

  const el = sheet(`
    <div class="prod-head">${thumb(food)}<div class="t"><h2>${esc(food.name)}</h2><small>${esc(food.brand || '')}</small></div></div>
    <div class="amount">
      <label class="field">Hoeveelheid<input id="qty" type="text" inputmode="decimal" value="${fmtIn(qty)}" autocomplete="off"></label>
      <label class="field">Eenheid<select id="unit"></select></label>
    </div>
    <div id="addserv" class="addserv" hidden>
      <div class="grid2">
        <label class="field">Naam<input id="asl" value="stuk" autocomplete="off"></label>
        <label class="field">Weegt<div class="unit"><input id="asg" type="text" inputmode="decimal" placeholder="bijv. 55" autocomplete="off"><em>${food.unit}</em></div></label>
      </div>
      <button class="btn ghost" id="asok" type="button">Eenheid bewaren</button>
    </div>
    ${pick ? '' : `<div class="seg" id="meal">${MEALS.map(m => `<button type="button" data-m="${m.id}" class="${m.id === curMeal ? 'on' : ''}">${m.short}</button>`).join('')}</div>`}
    <div class="result" id="result"></div>
    ${comps.length ? `<div class="combo"><h3>Vaak samen met ${esc(food.name)}</h3>
      <div class="chips">${comps.map(f => `<button type="button" class="chip" data-c="${esc(f.id)}"><span class="ci">${ic('plus')}</span>
        <span>${esc(f.name)}<small>${esc(portionText(f))} · ${r0(nutrOf(f.n, grams(defaultPortion(f))).kcal)} kcal</small></span></button>`).join('')}</div></div>` : ''}
    <details class="nutr"><summary>Voedingswaarden ${baseText(food.unit)}</summary>
      <table class="ntable">${NUTS.map(x => `<tr class="${x.sub ? 'sub' : ''}"><td>${x.label}</td><td class="num">${perBase(food, x.k) === undefined || perBase(food, x.k) === null ? '–' : fmtN(perBase(food, x.k)) + ' ' + x.unit}</td></tr>`).join('')}</table>
    </details>
    <button class="btn" id="save">${entry ? 'Opslaan' : pick ? 'Toevoegen aan maaltijd' : 'Toevoegen'}</button>
    ${entry ? '<button class="btn danger" id="del">Verwijderen</button>' : ''}
    <div style="text-align:center;margin-top:10px"><button class="link" id="edit">Product bewerken</button></div>`);

  const qtyIn = $('#qty', el), unitSel = $('#unit', el);
  // Zelf een eenheid toevoegen, zoals "stuk (55 g)" bij eieren of "schep (15 g)".
  const fillUnits = () => {
    unitSel.innerHTML = `<option value="-1">${UNIT_NAME[food.unit]}</option>
      ${servs.map((s, i) => `<option value="${i}">${esc(s.label)} (${fmtIn(s.g)} ${food.unit})</option>`).join('')}
      ${food.unit === 'stuk' ? '' : '<option value="new">+ Stuk of portie toevoegen</option>'}`;
    unitSel.value = String(sIdx);
  };
  fillUnits();
  const gramsNow = () => (num(qtyIn.value) || 0) * (sIdx >= 0 ? servs[sIdx].g : 1);
  const update = () => {
    const v = nutrOf(food.n, gramsNow());
    for (const id of chosen) {
      const f = S.foods[id];
      const extra = nutrOf(f.n, grams(defaultPortion(f)));
      for (const k of NKEYS) v[k] += extra[k];
    }
    $('#result', el).innerHTML = `${donut(v)}<div class="rows">${MACROS.map(m => `<div><i class="dot" style="background:${m.c}"></i><span>${m.l}</span><b class="num">${fmtN(v[m.k])} g</b></div>`).join('')}
      <div><small>${chosen.size ? `inclusief ${chosen.size} extra` : `${fmtN(gramsNow())} ${food.unit} totaal`}</small></div></div>`;
  };
  qtyIn.addEventListener('input', update);
  qtyIn.addEventListener('focus', () => qtyIn.select());
  unitSel.addEventListener('change', () => {
    if (unitSel.value === 'new') {
      unitSel.value = String(sIdx);
      $('#addserv', el).hidden = false;
      $('#asg', el).focus();
      return;
    }
    const g = gramsNow();
    sIdx = +unitSel.value;
    const q = sIdx >= 0 ? g / servs[sIdx].g : g;
    qtyIn.value = fmtIn(q > 0 ? q : (sIdx >= 0 ? 1 : baseQty(food.unit)));
    update();
  });
  $('#asok', el).addEventListener('click', () => {
    const label = $('#asl', el).value.trim() || 'stuk';
    const g = num($('#asg', el).value);
    if (!(g > 0)) return toast(`Vul in hoeveel ${food.unit} één ${label} weegt`);
    const sv = { label, g };
    food.servings = [...(food.servings || []), sv];
    S.foods[food.id] = { ...(S.foods[food.id] || food), servings: food.servings };
    save();
    servs.push(sv);
    sIdx = servs.length - 1;
    qtyIn.value = '1';
    fillUnits();
    $('#addserv', el).hidden = true;
    update();
  });
  $('#meal', el)?.addEventListener('click', e => {
    const b = e.target.closest('[data-m]');
    if (!b) return;
    curMeal = b.dataset.m;
    el.querySelectorAll('#meal button').forEach(x => x.classList.toggle('on', x === b));
  });
  el.querySelector('.chips')?.addEventListener('click', e => {
    const c = e.target.closest('[data-c]');
    if (!c) return;
    const on = !chosen.has(c.dataset.c);
    if (on) chosen.add(c.dataset.c); else chosen.delete(c.dataset.c);
    c.classList.toggle('on', on);
    $('.ci', c).innerHTML = ic(on ? 'check' : 'plus');
    update();
  });
  $('#save', el).addEventListener('click', () => {
    const q = num(qtyIn.value);
    if (!(q > 0)) return toast('Vul een hoeveelheid in');
    const serving = sIdx >= 0 ? { ...servs[sIdx] } : null;
    if (pick) {
      // Ingrediënt voor een maaltijd: niets in het dagboek, terug naar het maaltijdscherm.
      S.foods[food.id] = { ...food, used: Date.now() };
      save();
      const p = picking;
      const item = { foodId: food.id, name: food.name, brand: food.brand || '', unit: food.unit, n: { ...food.n }, qty: q, serving };
      return closeLayers(layers.length - p.base, () => p.cb(item));
    }
    S.foods[food.id] = { ...food, used: Date.now(), last: { qty: q, serving, unit: food.unit } };
    const data = { meal: curMeal, foodId: food.id, name: food.name, brand: food.brand || '', unit: food.unit, n: { ...food.n }, qty: q, serving };
    if (entry) Object.assign(entry, data);
    else {
      const day = (S.diary[cur] ||= []);
      day.push({ id: uid(), t: Date.now(), ...data });
      for (const id of chosen) {
        const f = S.foods[id];
        const p = defaultPortion(f);
        day.push(makeEntry(f, curMeal, p.qty, p.serving));
        S.foods[id] = { ...f, used: Date.now() };
      }
    }
    save();
    persistOnce();
    const n = chosen.size + 1;
    closeAll(() => toast(entry ? 'Opgeslagen' : `${n > 1 ? `${n} producten t` : 'T'}oegevoegd aan ${mealName(curMeal)}`));
  });
  $('#del', el)?.addEventListener('click', () => {
    S.diary[cur] = (S.diary[cur] || []).filter(x => x !== entry);
    if (!S.diary[cur].length) delete S.diary[cur];
    save();
    closeAll(() => toast('Verwijderd'));
  });
  $('#edit', el).addEventListener('click', () => openFoodForm({ food, meal: curMeal, entry, back: 2 }));
  update();
  openLayer(el);
}

// ---------- Maaltijden (recepten) ----------
function recipeTotals(items) {
  let g = 0;
  const t = Object.fromEntries(NKEYS.map(k => [k, 0]));
  for (const it of items) {
    const gi = grams(it);
    g += gi;
    const v = nutrOf(it.n, gi);
    for (const k of NKEYS) t[k] += v[k];
  }
  return { g, t };
}
function servsFor(it) {
  const list = [...(S.foods[it.foodId]?.servings || [])];
  if (it.serving && !list.some(s => s.label === it.serving.label && s.g === it.serving.g)) list.push(it.serving);
  return list;
}

// Een maaltijd staat als één regel in het dagboek, met de ingrediënten erin bewaard.
// Aanpassen geldt voor die ene keer, tenzij je "ook in de opgeslagen maaltijd bewaren" aanvinkt.
function openRecipe({ recipe, meal, entry }) {
  const tpl = entry ? S.recipes[entry.recipeId] : recipe;
  const src = entry ? { name: entry.name, ...entry.recipe } : recipe || { name: '', portions: 1, items: [] };
  const items = structuredClone(src.items);
  let curMeal = entry ? entry.meal : meal;
  const btnText = () => (entry ? 'Opslaan' : `Toevoegen aan ${mealName(curMeal)}`);
  const el = screen(entry ? 'Maaltijd bewerken' : tpl ? src.name : 'Nieuwe maaltijd', `
    <div class="form-card">
      <label class="field">Naam<input id="rname" value="${esc(src.name)}" placeholder="bijv. Broccolitaart" autocomplete="off"></label>
      <div class="grid2">
        <label class="field">Recept is voor<div class="unit"><input id="rport" type="text" inputmode="decimal" value="${fmtIn(src.portions)}" autocomplete="off"><em>porties</em></div></label>
        <label class="field">Jij eet<div class="unit"><input id="reat" type="text" inputmode="decimal" value="${fmtIn(src.eaten ?? 1)}" autocomplete="off"><em>portie</em></div></label>
      </div>
    </div>
    <div class="section-title">Ingrediënten voor het hele recept</div>
    <div class="list" id="ing"></div>
    <button class="btn ghost" id="addi" type="button">${ic('plus')} Ingrediënt toevoegen</button>
    <div class="seg" id="meal">${MEALS.map(m => `<button type="button" data-m="${m.id}" class="${m.id === curMeal ? 'on' : ''}">${m.short}</button>`).join('')}</div>
    <div class="result" id="result"></div>
    ${tpl ? '<label class="check"><input type="checkbox" id="keep"> Wijzigingen ook in de opgeslagen maaltijd bewaren</label>' : ''}
    <button class="btn" id="save" type="button">${btnText()}</button>
    ${entry ? '<button class="btn danger" id="del" type="button">Verwijderen uit dagboek</button>'
      : `<button class="btn ghost" id="only" type="button">${tpl ? 'Alleen de maaltijd bijwerken' : 'Bewaren zonder toe te voegen'}</button>`}
    ${tpl && !entry ? '<div style="text-align:center;margin-top:12px"><button class="link" id="rdel" type="button">Maaltijd verwijderen uit je lijst</button></div>' : ''}`);

  const ing = $('#ing', el);
  const renderIng = () => {
    ing.innerHTML = items.length ? items.map((it, i) => {
      const sv = servsFor(it);
      const si = it.serving ? sv.findIndex(s => s.label === it.serving.label && s.g === it.serving.g) : -1;
      return `<div class="ing" data-i="${i}">
        <div class="ing-top"><b>${esc(it.name)}</b><span class="k num">${r0(nutrOf(it.n, grams(it)).kcal)} kcal</span>
          <button class="x" type="button" data-rm aria-label="${esc(it.name)} weghalen">${ic('close')}</button></div>
        <div class="ing-amt"><input type="text" inputmode="decimal" value="${fmtIn(it.qty)}" data-q autocomplete="off">
          <select data-u><option value="-1"${si < 0 ? ' selected' : ''}>${UNIT_NAME[it.unit]}</option>
          ${sv.map((s, j) => `<option value="${j}"${j === si ? ' selected' : ''}>${esc(s.label)} (${fmtIn(s.g)} ${it.unit})</option>`).join('')}</select></div></div>`;
    }).join('') : '<div class="empty">Nog geen ingrediënten. Voeg toe wat er in het hele gerecht gaat.</div>';
  };
  const readNums = () => ({ portions: num($('#rport', el).value) || 0, eaten: num($('#reat', el).value) || 0 });
  const update = () => {
    const { portions, eaten } = readNums();
    const { t } = recipeTotals(items);
    const share = portions > 0 ? eaten / portions : 0;
    const v = Object.fromEntries(NKEYS.map(k => [k, t[k] * share]));
    $('#result', el).innerHTML = `${donut(v)}<div class="rows">${MACROS.map(m => `<div><i class="dot" style="background:${m.c}"></i><span>${m.l}</span><b class="num">${fmtN(v[m.k])} g</b></div>`).join('')}
      <div><small>Jouw deel. Hele recept: ${r0(t.kcal)} kcal</small></div></div>`;
  };
  ing.addEventListener('input', e => {
    if (!e.target.matches('[data-q]')) return;
    const row = e.target.closest('[data-i]');
    const it = items[+row.dataset.i];
    it.qty = num(e.target.value) || 0;
    $('.k', row).textContent = `${r0(nutrOf(it.n, grams(it)).kcal)} kcal`;
    update();
  });
  ing.addEventListener('change', e => {
    if (!e.target.matches('[data-u]')) return;
    const it = items[+e.target.closest('[data-i]').dataset.i];
    const g = grams(it), sv = servsFor(it), j = +e.target.value;
    it.serving = j >= 0 ? { ...sv[j] } : null;
    const q = j >= 0 ? g / sv[j].g : g;
    it.qty = Math.round((q > 0 ? q : (j >= 0 ? 1 : baseQty(it.unit))) * 10) / 10;
    renderIng();
    update();
  });
  ing.addEventListener('click', e => {
    if (!e.target.closest('[data-rm]')) return;
    items.splice(+e.target.closest('[data-i]').dataset.i, 1);
    renderIng();
    update();
  });
  $('#rport', el).addEventListener('input', update);
  $('#reat', el).addEventListener('input', update);
  $('#addi', el).addEventListener('click', () => openAdd(curMeal, item => { items.push(item); renderIng(); update(); }));
  $('#meal', el).addEventListener('click', e => {
    const b = e.target.closest('[data-m]');
    if (!b) return;
    curMeal = b.dataset.m;
    el.querySelectorAll('#meal button').forEach(x => x.classList.toggle('on', x === b));
    $('#save', el).textContent = btnText();
  });

  const collect = () => {
    const name = $('#rname', el).value.trim();
    const { portions, eaten } = readNums();
    const { g, t } = recipeTotals(items);
    if (!name) return toast('Geef de maaltijd een naam');
    if (!items.length) return toast('Voeg minstens één ingrediënt toe');
    if (!(portions > 0)) return toast('Vul in voor hoeveel porties het recept is');
    if (!(g > 0)) return toast('Vul de hoeveelheden van de ingrediënten in');
    return { name, portions, eaten, g, t };
  };
  const saveTemplate = c => {
    const id = tpl?.id || 'r:' + uid();
    S.recipes[id] = { id, name: c.name, portions: c.portions, items: structuredClone(items), used: Date.now() };
    return id;
  };
  const backToList = msg => closeLayers(1, () => { layers[layers.length - 1]?._refresh?.(); toast(msg); });

  $('#save', el).addEventListener('click', () => {
    const c = collect();
    if (!c) return;
    if (!(c.eaten > 0)) return toast('Vul in hoeveel porties je eet');
    let rid = tpl?.id || entry?.recipeId;
    if ((!tpl && !entry) || $('#keep', el)?.checked) rid = saveTemplate(c);
    else if (S.recipes[rid]) S.recipes[rid].used = Date.now();
    const data = {
      meal: curMeal, recipeId: rid, name: c.name, brand: '', unit: 'g', serving: null,
      n: Object.fromEntries(NKEYS.map(k => [k, c.t[k] / c.g * 100])),
      qty: c.g * c.eaten / c.portions,
      recipe: { portions: c.portions, eaten: c.eaten, items: structuredClone(items) },
    };
    if (entry) Object.assign(entry, data);
    else (S.diary[cur] ||= []).push({ id: uid(), t: Date.now(), ...data });
    save();
    persistOnce();
    closeAll(() => toast(entry ? 'Opgeslagen' : `Toegevoegd aan ${mealName(curMeal)}`));
  });
  $('#only', el)?.addEventListener('click', () => {
    const c = collect();
    if (!c) return;
    saveTemplate(c);
    save();
    backToList(tpl ? 'Maaltijd bijgewerkt' : 'Maaltijd bewaard');
  });
  $('#del', el)?.addEventListener('click', () => {
    S.diary[cur] = (S.diary[cur] || []).filter(x => x !== entry);
    if (!S.diary[cur].length) delete S.diary[cur];
    save();
    closeAll(() => toast('Verwijderd'));
  });
  $('#rdel', el)?.addEventListener('click', () => {
    if (!confirm(`"${tpl.name}" verwijderen uit je maaltijden? Wat je al gegeten hebt blijft staan.`)) return;
    delete S.recipes[tpl.id];
    save();
    backToList('Maaltijd verwijderd');
  });
  renderIng();
  update();
  openLayer(el);
}

// ---------- Etiketfoto uitsnijden ----------
// Geeft {x, y, w, h} als fractie van de foto, null voor de hele foto, of undefined als ze teruggaat.
// Alleen de tabel lezen scheelt veel: geen ingrediëntentekst of achtergrond, en de letters worden groter.
function openCrop(file) {
  return new Promise(resolve => {
    let done = false;
    const finish = v => { if (!done) { done = true; resolve(v); } };
    const el = document.createElement('div');
    el.className = 'layer cropper';
    el.innerHTML = `<div class="crop-top"><button class="icon-btn" data-close aria-label="Terug">${ic('left')}</button>
        <p>Sleep de hoeken om alleen de tabel</p></div>
      <div class="crop-stage"><div class="crop-wrap"><img alt="Je foto"><div class="crop-box">
        <i data-h="nw"></i><i data-h="ne"></i><i data-h="sw"></i><i data-h="se"></i></div></div></div>
      <div class="crop-bottom"><button class="btn ghost" id="whole" type="button">Hele foto</button>
        <button class="btn" id="use" type="button">Lees de tabel</button></div>`;
    const img = $('img', el), box = $('.crop-box', el);
    let r = { x: 0.1, y: 0.25, w: 0.8, h: 0.5 }; // fracties van de foto
    const draw = () => Object.assign(box.style, { left: `${r.x * 100}%`, top: `${r.y * 100}%`, width: `${r.w * 100}%`, height: `${r.h * 100}%` });
    draw();
    let drag = null;
    box.addEventListener('pointerdown', e => {
      e.preventDefault();
      box.setPointerCapture(e.pointerId);
      drag = { h: e.target.dataset.h || 'move', x: e.clientX, y: e.clientY, r: { ...r } };
    });
    box.addEventListener('pointermove', e => {
      if (!drag) return;
      const rect = img.getBoundingClientRect();
      const dx = (e.clientX - drag.x) / rect.width, dy = (e.clientY - drag.y) / rect.height;
      const o = drag.r, min = 0.08;
      let { x, y, w, h } = o;
      if (drag.h === 'move') {
        x = Math.min(1 - w, Math.max(0, o.x + dx));
        y = Math.min(1 - h, Math.max(0, o.y + dy));
      } else {
        if (drag.h.includes('w')) { x = Math.min(o.x + o.w - min, Math.max(0, o.x + dx)); w = o.x + o.w - x; }
        if (drag.h.includes('e')) w = Math.min(1 - o.x, Math.max(min, o.w + dx));
        if (drag.h.includes('n')) { y = Math.min(o.y + o.h - min, Math.max(0, o.y + dy)); h = o.y + o.h - y; }
        if (drag.h.includes('s')) h = Math.min(1 - o.y, Math.max(min, o.h + dy));
      }
      r = { x, y, w, h };
      draw();
    });
    box.addEventListener('pointerup', () => { drag = null; });
    el.addEventListener('click', e => { if (e.target.closest('[data-close]')) closeLayers(); });
    $('#whole', el).addEventListener('click', () => { finish(null); closeLayers(); });
    $('#use', el).addEventListener('click', () => { finish({ ...r }); closeLayers(); });
    img.src = URL.createObjectURL(file);
    openLayer(el, () => finish(undefined));
  });
}

// ---------- Eigen product en etiket scannen ----------
function openFoodForm({ food, meal, entry, code, scan, note, back = 1 } = {}) {
  const f = food ? structuredClone(food) : { id: 'c:' + uid(), name: '', brand: '', code: code || '', unit: 'g', n: {}, servings: [], source: 'custom' };
  const known = !!S.foods[f.id];
  // Intern staat alles per 100 g/ml (of per 100 stuks). Tonen per de hoeveelheid die ze zelf koos.
  const ref0 = f.ref || baseQty(f.unit);
  const val = k => (f.n[k] === undefined || f.n[k] === null ? '' : fmtIn(f.n[k] * ref0 / 100));
  const s0 = (f.servings || [])[0];
  const el = screen(food && known ? 'Product bewerken' : 'Nieuw product', `
    ${note ? `<div class="notice warn">${esc(note)}</div>` : ''}
    <div class="form-card">
      <h3>Etiket scannen</h3>
      <p class="muted" style="font-size:14px;margin-top:4px">Fotografeer de voedingswaardetabel recht van voren, met goed licht en zonder schittering. Daarna zet je een kader om de tabel.</p>
      <div class="row">
        <button class="btn ghost" id="photo" type="button">${ic('camera')} Foto maken</button>
        <button class="btn ghost" id="gallery" type="button">${ic('image')} Galerij</button>
      </div>
      <input type="file" accept="image/*" capture="environment" id="fcam" hidden>
      <input type="file" accept="image/*" id="fgal" hidden>
      <div id="ocr"></div>
      <div style="text-align:center;margin-top:12px"><button class="link" id="pastebtn" type="button">Of plak tekst uit Google Lens</button></div>
      <div id="pastebox" hidden>
        <p class="muted" style="font-size:13px;margin-top:10px">Richt Google Lens of je camera-app op de tabel, kies "Tekst", selecteer alles en kopieer. Plak het hier.</p>
        <textarea id="pastetxt" class="paste" rows="6" placeholder="Energie 1569 kJ / 375 kcal&#10;Vetten 12,5 g&#10;…"></textarea>
        <button class="btn ghost" id="pasteok" type="button">Waarden invullen</button>
      </div>
    </div>
    <div class="form-card">
      <h3>Product</h3>
      <label class="field">Naam<input id="name" value="${esc(f.name)}" placeholder="bijv. Griekse yoghurt" autocomplete="off"></label>
      <label class="field">Merk (optioneel)<input id="brand" value="${esc(f.brand || '')}" autocomplete="off"></label>
      <label class="field">Barcode (optioneel)<input id="code" value="${esc(f.code || '')}" inputmode="numeric" autocomplete="off"></label>
    </div>
    <div class="form-card">
      <h3>Waarvoor gelden de waarden hieronder?</h3>
      <div class="grid2">
        <label class="field">Per<input id="ref" type="text" inputmode="decimal" value="${fmtIn(ref0)}" autocomplete="off"></label>
        <label class="field">Eenheid<select id="unit"><option value="g">gram</option><option value="ml">milliliter</option><option value="stuk">stuk</option></select></label>
      </div>
      <p class="muted" id="refsum" style="font-size:13px;margin-top:8px"></p>
      <div class="grid2">${NUTS.map(x => `<label class="field${x.sub ? ' sub' : ''}">${x.label}
        <div class="unit"><input id="n-${x.k}" type="text" inputmode="decimal" value="${val(x.k)}" autocomplete="off"><em>${x.k === 'kcal' ? 'kcal' : 'g'}</em></div></label>`).join('')}</div>
      <p class="muted" style="font-size:13px;margin-top:10px">Laat je calorieën leeg, dan reken ik ze uit met koolhydraten, eiwit en vet.</p>
    </div>
    <div class="form-card" id="portcard" ${f.unit === 'stuk' ? 'hidden' : ''}>
      <h3>Portie of stuk (optioneel)</h3>
      <div class="grid2">
        <label class="field">Omschrijving<input id="sl" value="${esc(s0?.label || '')}" placeholder="bijv. stuk of plak" autocomplete="off"></label>
        <label class="field">Gewicht<div class="unit"><input id="sg" type="text" inputmode="decimal" value="${s0 ? fmtIn(s0.g) : ''}" autocomplete="off"><em class="uu">${f.unit}</em></div></label>
      </div>
    </div>
    <button class="btn" id="save" type="button">Opslaan</button>
    ${known ? '<button class="btn danger" id="del" type="button">Verwijderen uit mijn producten</button>' : ''}`);

  const unitSel = $('#unit', el);
  unitSel.value = f.unit;
  const refIn = $('#ref', el);
  const refSum = () => {
    const r = num(refIn.value) || 0, u = unitSel.value;
    const what = u === 'stuk' ? `${fmtN(r)} ${r === 1 ? 'stuk' : 'stuks'}` : `${fmtN(r)} ${u}`;
    const kcal = num($('#n-kcal', el).value);
    $('#refsum', el).textContent = `${kcal !== undefined ? `${fmtN(kcal)} kcal` : 'De waarden'} per ${what}. Hoeveel je eet, kies je daarna.`;
  };
  el.addEventListener('input', e => { if (e.target === refIn || e.target.id === 'n-kcal') refSum(); });
  let lastUnit = f.unit;
  unitSel.addEventListener('change', () => {
    el.querySelectorAll('.uu').forEach(x => { x.textContent = unitSel.value; });
    $('#portcard', el).hidden = unitSel.value === 'stuk';
    // Van gram naar stuk: 100 wordt 1, en andersom.
    if (unitSel.value === 'stuk' && num(refIn.value) === 100) refIn.value = '1';
    if (lastUnit === 'stuk' && unitSel.value !== 'stuk' && num(refIn.value) === 1) refIn.value = '100';
    lastUnit = unitSel.value;
    refSum();
  });
  refSum();
  $('#photo', el).addEventListener('click', () => $('#fcam', el).click());
  $('#gallery', el).addEventListener('click', () => $('#fgal', el).click());

  // Etiket en Google Lens leveren waarden per 100 g.
  const fillValues = values => {
    const keys = Object.keys(values);
    if (keys.length) {
      refIn.value = '100';
      if (unitSel.value === 'stuk') { unitSel.value = 'g'; unitSel.dispatchEvent(new Event('change')); }
    }
    for (const k of keys) $(`#n-${k}`, el).value = fmtIn(values[k]);
    return keys.length;
  };
  const runOcr = async file => {
    if (!file) return;
    const crop = await openCrop(file);
    if (crop === undefined) return; // teruggegaan
    const box = $('#ocr', el);
    const url = URL.createObjectURL(file);
    box.innerHTML = `<p class="muted" id="ost" style="font-size:14px;margin-top:10px">Bezig…</p><div class="progress"><i id="obar"></i></div>`;
    try {
      const { text, values } = await Scan.label(file, (p, status) => {
        if (status) $('#ost', el).textContent = status + '…';
        $('#obar', el).style.width = p === null ? '8%' : `${Math.round(p * 100)}%`;
      }, crop);
      const n = fillValues(values);
      box.innerHTML = `<img class="photo-prev" src="${url}" alt="Je foto">
        <div class="notice${n >= 4 ? '' : ' warn'}">${n >= 4
          ? `${n} waarden ingevuld. Vergelijk ze even met de foto.`
          : n ? `Maar ${n} waarden gevonden. Kijk wat er ontbreekt, of probeer Google Lens hieronder.`
          : 'Ik kon geen waarden uit de foto halen. Probeer een scherpere foto van dichterbij, of plak de tekst uit Google Lens.'}</div>
        <details class="nutr"><summary>Herkende tekst</summary><pre style="white-space:pre-wrap;font-size:12px">${esc(text)}</pre></details>`;
    } catch (err) {
      box.innerHTML = `<div class="notice warn">Scannen mislukt: ${esc(err.message || err)}</div>`;
    }
  };
  $('#fcam', el).addEventListener('change', e => { runOcr(e.target.files[0]); e.target.value = ''; });
  $('#fgal', el).addEventListener('change', e => { runOcr(e.target.files[0]); e.target.value = ''; });
  $('#pastebtn', el).addEventListener('click', () => { $('#pastebox', el).hidden = false; $('#pastetxt', el).focus(); });
  $('#pasteok', el).addEventListener('click', () => {
    const n = fillValues(Scan.parseLabel($('#pastetxt', el).value));
    toast(n ? `${n} waarden ingevuld` : 'Geen voedingswaarden gevonden in de tekst');
  });

  $('#save', el).addEventListener('click', () => {
    const name = $('#name', el).value.trim();
    if (!name) return toast('Geef het product een naam');
    const n = {};
    for (const x of NUTS) n[x.k] = num($(`#n-${x.k}`, el).value);
    if (n.kcal === undefined) {
      if ([n.carbs, n.protein, n.fat].every(v => v === undefined)) return toast('Vul in elk geval de calorieën in');
      n.kcal = Math.round(4 * (n.carbs || 0) + 4 * (n.protein || 0) + 9 * (n.fat || 0) + 2 * (n.fiber || 0));
    }
    const ref = num(refIn.value);
    if (!(ref > 0)) return toast('Vul in voor welke hoeveelheid de waarden gelden');
    for (const k of NKEYS) if (n[k] !== undefined) n[k] = n[k] * 100 / ref;
    const perPiece = unitSel.value === 'stuk';
    const sl = $('#sl', el).value.trim(), sg = perPiece ? 0 : num($('#sg', el).value);
    let servings = perPiece ? [] : [...(sg > 0 ? [{ label: sl || 'portie', g: sg }] : []), ...(f.servings || []).slice(1)];
    // Waarden "per 30 g" ingevuld? Dan is 30 g vast ook een handige portie.
    if (!perPiece && ref !== 100 && !servings.some(x => x.g === ref)) servings.push({ label: 'portie', g: ref });
    const saved = {
      ...f, name, n, ref,
      brand: $('#brand', el).value.trim(),
      code: $('#code', el).value.trim(),
      unit: unitSel.value,
      servings,
      used: Date.now(),
    };
    const unitChanged = saved.unit !== f.unit;
    if (unitChanged) delete saved.last;
    S.foods[saved.id] = saved;
    // Een aangepast product werkt overal door: in het dagboek en in opgeslagen maaltijden.
    let changed = 0;
    if (known) {
      const adapt = x => {
        x.n = { ...saved.n };
        x.name = saved.name;
        x.brand = saved.brand || '';
        if (unitChanged) {
          const sv = (saved.servings || [])[0];
          if (saved.unit === 'stuk') { x.qty = x.serving ? x.qty : 1; x.serving = null; } // 2 sneetjes worden 2 stuks
          else if (f.unit === 'stuk') { if (sv) x.serving = { ...sv }; else { x.qty = 100; x.serving = null; } }
          x.unit = saved.unit;
        }
        changed++;
      };
      for (const day of Object.values(S.diary)) for (const e of day) if (e.foodId === saved.id && !e.recipe) adapt(e);
      for (const r of Object.values(S.recipes)) for (const it of r.items) if (it.foodId === saved.id) adapt(it);
    }
    save();
    if (changed) toast(`Aangepast, ook op ${changed} ${changed === 1 ? 'plek' : 'plekken'} in je dagboek of maaltijden`);
    closeLayers(back, () => openPortion(entry ? { entry } : { food: saved, meal }));
  });
  $('#del', el)?.addEventListener('click', () => {
    if (!confirm(`"${f.name}" verwijderen uit je producten? Wat je al gegeten hebt blijft staan.`)) return;
    delete S.foods[f.id];
    save();
    closeLayers(back, () => toast('Product verwijderd'));
  });
  openLayer(el);
  if (scan) $('#fcam', el).click();
}

// ---------- Barcode ----------
function openScanner(meal) {
  const el = document.createElement('div');
  el.className = 'layer scanner';
  el.innerHTML = `<video muted playsinline></video><div class="scan-frame"></div><div class="scan-msg" hidden></div>
    <div class="scan-top">
      <button class="icon-btn" data-close aria-label="Sluiten">${ic('close')}</button>
      <span class="scan-tools">
        <button class="icon-btn" id="swcam" hidden aria-label="Andere camera">${ic('swap')}</button>
        <button class="icon-btn" id="torch" hidden aria-label="Lamp aan of uit">${ic('flash')}</button>
      </span>
    </div>
    <div class="scan-bottom">
      <div class="zooms" id="zooms"></div>
      <p>Houd de barcode op 15 tot 20 cm in het kader.<br>Wazig? Tik op het beeld om scherp te stellen.</p>
      <form id="mf"><input id="mc" inputmode="numeric" placeholder="Of typ de barcode" autocomplete="off"><button>Zoek</button></form></div>`;
  let ctl = null, done = false;
  const msg = html => {
    $('.scan-frame', el).hidden = true;
    const m = $('.scan-msg', el);
    m.hidden = false;
    m.innerHTML = html;
  };
  const onCode = code => {
    if (done) return;
    done = true;
    ctl?.stop();
    navigator.vibrate?.(60);
    msg(`<span class="spinner"></span><p style="margin-top:12px">Product ${esc(code)} opzoeken…</p>`);
    lookupCode(code, meal, el);
  };
  el.addEventListener('click', e => { if (e.target.closest('[data-close]')) closeLayers(); });
  $('#mf', el).addEventListener('submit', e => {
    e.preventDefault();
    const code = $('#mc', el).value.replace(/\s/g, '');
    if (code.length >= 6) onCode(code);
  });
  openLayer(el, () => { done = true; ctl?.stop(); });

  if (!navigator.mediaDevices?.getUserMedia) {
    msg('Deze browser geeft geen toegang tot de camera. Typ de barcode hieronder in.');
    return;
  }
  Scan.barcode($('video', el), onCode).then(c => {
    ctl = c;
    if (done) { c.stop(); return; }
    const t = $('#torch', el);
    let on = false;
    t.addEventListener('click', () => { on = !on; t.classList.toggle('on', on); c.torch(on).catch(() => { }); });
    const zooms = $('#zooms', el);
    const showTools = () => {
      t.hidden = !c.hasTorch;
      const steps = c.zoomSteps;
      zooms.innerHTML = steps.length > 1 ? steps.map(z => `<button type="button" data-z="${z}" class="${Math.round(c.zoom) === z ? 'on' : ''}">${z}×</button>`).join('') : '';
    };
    showTools();
    zooms.addEventListener('click', e => {
      const b = e.target.closest('[data-z]');
      if (!b) return;
      c.setZoom(+b.dataset.z);
      zooms.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b));
    });
    // Tik op het beeld: opnieuw scherpstellen.
    $('video', el).addEventListener('click', () => { c.focus(); navigator.vibrate?.(15); });
    if (c.cameraCount > 1) {
      const sw = $('#swcam', el);
      sw.hidden = false;
      sw.addEventListener('click', async () => {
        const n = await c.switchCamera();
        on = false; t.classList.remove('on');
        showTools();
        if (n) toast(`Camera ${n} van ${c.cameraCount}`);
      });
    }
  }).catch(err => {
    if (done) return;
    msg(err.name === 'NotAllowedError'
      ? 'Geen toegang tot de camera. Geef toestemming via het slotje naast het webadres, of typ de barcode hieronder in.'
      : `Camera starten lukt niet: ${esc(err.message || err.name)}. Typ de barcode hieronder in.`);
  });
}

async function lookupCode(code, meal, scanner) {
  // Alleen doorgaan als de scanner nog openstaat; anders heeft ze hem al weggeklikt.
  const leave = then => { if (layers[layers.length - 1] === scanner) closeLayers(1, then); };
  const local = Object.values(S.foods).find(f => f.code === code);
  if (local) {
    return leave(() => hasNutr(local) ? openPortion({ food: local, meal }) : openFoodForm({ food: local, meal }));
  }
  try {
    const d = await fetchJson(`${OFF}/api/v2/product/${encodeURIComponent(code)}.json?fields=${OFF_FIELDS}`);
    if (d.status === 1 && d.product) {
      const f = fromOFF({ ...d.product, code });
      if (hasNutr(f) && f.name) return leave(() => openPortion({ food: f, meal }));
      return leave(() => openFoodForm({ food: f, meal, note: 'Dit product staat in de database, maar zonder volledige gegevens. Scan het etiket of vul de waarden zelf in.' }));
    }
    leave(() => openFoodForm({ code, meal, note: `Barcode ${code} is onbekend. Scan het etiket of vul de waarden zelf in. De volgende keer herkent de app hem.` }));
  } catch {
    leave(() => openFoodForm({ code, meal, note: 'Opzoeken lukte niet, mogelijk geen internet. Vul de waarden zelf in of probeer het straks opnieuw.' }));
  }
}

// ---------- Profiel en doelen ----------
function choices(name, opts, value, two = false) {
  return `<div class="choices${two ? ' two' : ''}" data-name="${name}">${opts.map(o => `<button type="button" class="choice${String(o.v) === String(value) ? ' on' : ''}" data-v="${o.v}">
    <b>${o.l}</b>${o.d ? `<small>${o.d}</small>` : ''}${o.c ? `<small>${o.c}% koolh · ${o.p}% eiwit · ${o.f}% vet</small>` : ''}</button>`).join('')}</div>`;
}

function openProfile() {
  const p = structuredClone(S.profile || DEFAULT_PROFILE);
  const numField = (id, label, unit, v) => `<label class="field">${label}<div class="unit"><input id="${id}" type="text" inputmode="decimal" value="${v ?? ''}" autocomplete="off"><em>${unit}</em></div></label>`;
  const el = screen('Profiel en doelen', `
    <div class="form-card"><h3>Over jou</h3>
      ${choices('sex', [{ v: 'v', l: 'Vrouw' }, { v: 'm', l: 'Man' }], p.sex, true)}
      <div class="grid2">${numField('age', 'Leeftijd', 'jaar', p.age)}${numField('height', 'Lengte', 'cm', p.height)}</div>
      <div class="grid2">${numField('weight', 'Gewicht', 'kg', fmtIn(p.weight))}</div>
    </div>
    <div class="form-card"><h3>Hoe actief ben je?</h3>${choices('act', ACT, p.act)}</div>
    <div class="form-card"><h3>Wat is je doel?</h3>${choices('goal', GOALS, p.goal)}</div>
    <div class="form-card"><h3>Macroverdeling</h3>${choices('split', SPLITS, p.split)}
      <div class="grid2" id="own" ${p.split === 'eigen' ? '' : 'hidden'}>
        ${numField('pc', 'Koolhydraten', '%', p.c)}${numField('pp', 'Eiwit', '%', p.p)}${numField('pf', 'Vet', '%', p.f)}
      </div>
    </div>
    <div class="form-card goal-box">
      <small>Jouw dagdoel</small><b class="num" id="gk"></b><small id="gm"></small>
      <div style="text-align:left">${numField('override', 'Eigen caloriedoel (optioneel)', 'kcal', p.kcalOverride || '')}</div>
    </div>
    <button class="btn" id="save" type="button">Opslaan</button>
    <div class="form-card"><h3>Back-up</h3>
      <p class="muted" style="font-size:14px;margin-top:4px">Alles staat alleen op deze telefoon. Download af en toe een back-up, bijvoorbeeld naar Google Drive.</p>
      <div class="row"><button class="btn ghost" id="exp" type="button">Downloaden</button><button class="btn ghost" id="imp" type="button">Terugzetten</button></div>
      <input type="file" id="impf" accept="application/json,.json" hidden>
    </div>
    ${menuImportHtml()}
    <p class="hint">Versie ${APP_VERSION}</p>`);
  wireMenuImport(el);

  const read = () => {
    for (const k of ['age', 'height', 'weight']) p[k] = num($('#' + k, el).value);
    p.kcalOverride = num($('#override', el).value) || null;
    const sp = SPLITS.find(s => s.v === p.split);
    if (p.split === 'eigen') { p.c = num($('#pc', el).value) || 0; p.p = num($('#pp', el).value) || 0; p.f = num($('#pf', el).value) || 0; }
    else Object.assign(p, { c: sp.c, p: sp.p, f: sp.f });
  };
  const update = () => {
    read();
    const ok = p.age > 0 && p.height > 0 && p.weight > 0;
    if (!ok && !p.kcalOverride) { $('#gk', el).textContent = '–'; $('#gm', el).textContent = 'Vul leeftijd, lengte en gewicht in'; return; }
    const g = goals(p);
    $('#gk', el).textContent = `${g.kcal} kcal`;
    $('#gm', el).textContent = `${r0(g.carbs)} g koolh · ${r0(g.protein)} g eiwit · ${r0(g.fat)} g vet`;
  };
  el.addEventListener('input', update);
  el.addEventListener('click', e => {
    const b = e.target.closest('.choice');
    if (!b) return;
    const wrap = b.parentElement;
    const name = wrap.dataset.name;
    p[name] = name === 'act' || name === 'goal' ? +b.dataset.v : b.dataset.v;
    wrap.querySelectorAll('.choice').forEach(x => x.classList.toggle('on', x === b));
    if (name === 'split') $('#own', el).hidden = p.split !== 'eigen';
    update();
  });
  $('#save', el).addEventListener('click', () => {
    read();
    if (!(p.age > 0 && p.height > 0 && p.weight > 0)) return toast('Vul leeftijd, lengte en gewicht in');
    if (Math.round(p.c + p.p + p.f) !== 100) return toast(`De macroverdeling telt op tot ${r0(p.c + p.p + p.f)}%, dat moet 100% zijn`);
    S.profile = p;
    save();
    persistOnce();
    closeLayers(1, () => toast('Doelen opgeslagen'));
  });
  $('#exp', el).addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(S)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `calorietracker-backup-${today}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  });
  $('#imp', el).addEventListener('click', () => $('#impf', el).click());
  $('#impf', el).addEventListener('change', async e => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const d = JSON.parse(await file.text());
      if (!d || !d.diary || !d.foods) throw new Error();
      if (!confirm('Dit vervangt alles wat nu in de app staat door de back-up. Doorgaan?')) return;
      S = d;
      save();
      location.reload();
    } catch {
      toast('Dit is geen geldige back-up');
    }
  });
  update();
  openLayer(el);
}

// Vraag Chrome de gegevens niet zomaar op te ruimen bij weinig opslagruimte.
let persisted = false;
function persistOnce() {
  if (persisted) return;
  persisted = true;
  navigator.storage?.persist?.().catch(() => { });
}

// ---------- Start ----------
render();

// Updates: een geïnstalleerde app blijft vaak op de achtergrond open en laadt dan niet opnieuw.
// Daarom bij elke keer openen naar een nieuwe versie vragen, en die meteen gebruiken.
let reloadPending = false;
if ('serviceWorker' in navigator) {
  const hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.register('sw.js').then(reg => {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') reg.update().catch(() => { });
    });
  }).catch(() => { });
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || reloadPending) return;
    reloadPending = true;
    if (!layers.length) location.reload(); // anders zodra ze terug is op het dagboek
  });
}
