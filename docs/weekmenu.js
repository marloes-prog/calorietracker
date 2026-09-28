'use strict';
// ---------- Bakje Geluk weekmenu's ----------
// De recepten zijn betaalde content en staan daarom niet in deze (openbare) repo. Marloes leest ze
// eenmalig in uit een bestand; ze staan daarna alleen in localStorage op haar telefoon.
// Wordt vóór app.js geladen: hier alleen functies, die pas bij aanroep S, save() enz. gebruiken.

const BG_KEY = 'calorietracker.bakjegeluk';
const DINER_PERSONEN = 3; // 2 volwassenen en 2 kinderen; de kinderen tellen samen als 1
const SLOTS = [
  { id: 'ontbijt', name: 'Ontbijt', lijst: 'Ontbijt', meal: 'breakfast', icon: '🍳' },
  { id: 'tuss1', name: 'Tussendoortje ochtend', lijst: 'Tussendoortje', meal: 'snack', icon: '🍎' },
  { id: 'lunch', name: 'Lunch', lijst: 'Lunch', meal: 'lunch', icon: '🥪' },
  { id: 'tuss2', name: 'Tussendoortje middag', lijst: 'Tussendoortje', meal: 'snack', icon: '🥕' },
  { id: 'diner', name: 'Diner', lijst: 'Diner', meal: 'dinner', icon: '🍝', persons: DINER_PERSONEN },
  { id: 'bakje', name: 'Bakje Geluk', lijst: 'Bakje Geluk', meal: 'snack', icon: '🍨' },
];
const slotOf = id => SLOTS.find(s => s.id === id);

let BG = null;
function bg() {
  if (!BG) {
    let d = null;
    try { d = JSON.parse(localStorage.getItem(BG_KEY)); } catch { }
    const list = d?.gerechten || [];
    BG = { list, byId: Object.fromEntries(list.map(g => [g.id, g])) };
  }
  return BG;
}
const plan = () => (S.plan ||= {});
const dishAt = (day, slot) => bg().byId[plan()[day]?.[slot]];
const eatenEntry = (day, slot) => (S.diary[day] || []).find(e => e.menu?.slot === slot);
const weekStart = k => shiftDay(k, -((toDate(k).getDay() + 6) % 7));
const plannedKcal = (day, except) => SLOTS.reduce((s, sl) => s + (sl.id !== except && dishAt(day, sl.id)?.kcal || 0), 0);
const dayTitle = k => toDate(k).toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'short' });

// Afvinken als gegeten: één dagboekregel met alleen de kcal uit het weekmenu. Nog een keer = weghalen.
function toggleEaten(day, slot) {
  const had = eatenEntry(day, slot);
  if (had) {
    S.diary[day] = S.diary[day].filter(e => e !== had);
    if (!S.diary[day].length) delete S.diary[day];
    save();
    return toast('Weggehaald uit je dagboek');
  }
  const d = dishAt(day, slot);
  if (!d) return;
  const sl = slotOf(slot);
  (S.diary[day] ||= []).push({
    id: uid(), t: Date.now(), meal: sl.meal, name: d.naam, brand: '', unit: 'g', qty: 100, serving: null,
    n: { kcal: d.kcal }, menu: { slot, dishId: d.id },
  });
  save();
  persistOnce();
  toast(`In je dagboek bij ${mealName(sl.meal)}`);
}

// Kaart op het dagboek met wat er voor deze dag gepland staat.
function menuTodayHtml(day) {
  const rows = SLOTS.map(sl => ({ sl, d: dishAt(day, sl.id) })).filter(x => x.d);
  if (!rows.length) return '';
  const eaten = rows.filter(x => eatenEntry(day, x.sl.id));
  return `<section class="card">
    <div class="meal-head"><div class="meal-ic">📅</div>
      <div class="t"><h3>Weekmenu</h3><small class="num">${plannedKcal(day)} kcal gepland · ${eaten.length} van ${rows.length} gegeten</small></div>
      <button class="icon-btn" data-act="menu" aria-label="Weekmenu openen">${ic('right')}</button></div>
    <ul class="entries">${rows.map(({ sl, d }) => {
      const on = !!eatenEntry(day, sl.id);
      return `<li class="entry" data-md="${sl.id}"><div class="t"><b>${esc(d.naam)}</b><small>${sl.icon} ${esc(sl.name)} · ${d.kcal} kcal</small></div>
        <button class="eat${on ? ' on' : ''}" data-eat="${sl.id}">${ic('check')}${on ? 'Gegeten' : 'Eet'}</button></li>`;
    }).join('')}</ul></section>`;
}

// Details van een gerecht. Met day+slot hoort het bij de planning; met pick kies je het.
function openDish({ day, slot, dishId, pick }) {
  const d = bg().byId[dishId] || dishAt(day, slot);
  if (!d) return toast('Dit gerecht staat niet meer in je weekmenu-bestand');
  const sl = slotOf(slot);
  const planned = day && plan()[day]?.[slot] === d.id;
  const on = planned && !!eatenEntry(day, slot);
  const el = sheet(`
    <h2 class="dish-title">${esc(d.naam)}</h2>
    <small>${d.kcal} kcal${sl ? ' · ' + esc(sl.name) : ''}${day ? ' · ' + esc(dayTitle(day)) : ''}</small>
    <div class="section-title">Ingrediënten${d.lijst === 'Diner' ? ' voor 1 persoon' : ''}</div>
    <ul class="ingl">${d.ingredienten.map(i => `<li>${esc(i)}</li>`).join('')}</ul>
    ${d.bereiding.length ? `<div class="section-title">Bereiding</div><ol class="steps">${d.bereiding.map(s => `<li>${esc(s.replace(/^\d+\.\s*/, ''))}</li>`).join('')}</ol>` : ''}
    <p class="hint">Uit Bakje Geluk ${esc(d.bronnen.join(', '))}</p>
    ${pick ? '<button class="btn" id="pick" type="button">Kiezen</button>' : ''}
    ${planned ? `<button class="btn${on ? ' ghost' : ''}" id="eat" type="button">${on ? 'Toch niet gegeten' : 'Gegeten, zet in dagboek'}</button>
      <button class="btn ghost" id="other" type="button">Ander gerecht kiezen</button>
      <button class="btn danger" id="rm" type="button">Weghalen uit weekmenu</button>` : ''}`);
  const refresh = () => layers[layers.length - 1]?._refresh?.();
  $('#pick', el)?.addEventListener('click', () => pick(d));
  $('#eat', el)?.addEventListener('click', () => { toggleEaten(day, slot); closeLayers(1, refresh); });
  $('#other', el)?.addEventListener('click', () => closeLayers(1, () => openPicker(day, slot)));
  $('#rm', el)?.addEventListener('click', () => {
    delete plan()[day][slot];
    if (!Object.keys(plan()[day]).length) delete plan()[day];
    save();
    closeLayers(1, () => { refresh(); toast('Weggehaald'); });
  });
  openLayer(el);
}

// Een gerecht kiezen voor één eetmoment op één dag. Tik = kiezen, het rondje rechts = eerst bekijken.
function openPicker(day, slot) {
  const sl = slotOf(slot);
  let sort = 'naam';
  const room = goals().kcal - plannedKcal(day, slot);
  const el = screen(sl.name, `
    <p class="muted pick-info">${esc(dayTitle(day))} · nog <b class="num">${r0(room)}</b> kcal ruimte in je dagdoel</p>
    <form class="search" id="sf"><input id="q" type="search" placeholder="Zoek op naam of ingrediënt" enterkeyhint="search" autocomplete="off"></form>
    <div class="seg two" id="sort"><button type="button" data-s="naam" class="on">Op naam</button><button type="button" data-s="kcal">Minste kcal</button></div>
    <div class="list" id="lst" style="margin-top:14px"></div>`);
  const q = $('#q', el);
  const draw = () => {
    const term = norm(q.value.trim());
    const list = bg().list
      .filter(d => d.lijst === sl.lijst && (!term || norm(`${d.naam} ${d.ingredienten.join(' ')}`).includes(term)))
      .sort((a, b) => (sort === 'kcal' ? a.kcal - b.kcal : 0) || a.naam.localeCompare(b.naam, 'nl'));
    $('#lst', el).innerHTML = list.length ? list.map(d => `<div class="item" data-d="${d.id}">
      <div class="t"><b>${esc(d.naam)}</b><small><span class="num${d.kcal > room ? ' over-txt' : ''}">${d.kcal} kcal</span> · ${esc(d.ingredienten.slice(0, 3).join(', '))}</small></div>
      <button class="plus" type="button" data-info aria-label="Bekijken">${ic('search')}</button></div>`).join('')
      : '<div class="empty">Niets gevonden.</div>';
  };
  const choose = (d, n) => {
    (plan()[day] ||= {})[slot] = d.id;
    save();
    persistOnce();
    closeLayers(n, () => { layers[layers.length - 1]?._refresh?.(); toast(`${d.naam} op ${dayTitle(day)}`); });
  };
  q.addEventListener('input', draw);
  $('#sf', el).addEventListener('submit', e => { e.preventDefault(); q.blur(); });
  $('#sort', el).addEventListener('click', e => {
    const b = e.target.closest('[data-s]');
    if (!b) return;
    sort = b.dataset.s;
    el.querySelectorAll('#sort button').forEach(x => x.classList.toggle('on', x === b));
    draw();
  });
  $('#lst', el).addEventListener('click', e => {
    const row = e.target.closest('[data-d]');
    if (!row) return;
    const d = bg().byId[row.dataset.d];
    if (e.target.closest('[data-info]')) openDish({ dishId: d.id, slot, pick: x => choose(x, 2) });
    else choose(d, 1);
  });
  draw();
  openLayer(el);
}

// Inlezen van het bestand uit de map "Bakje Geluk weekmenu's" in Dropbox.
function menuImportHtml() {
  const n = bg().list.length;
  return `<div class="form-card"><h3>Bakje Geluk weekmenu's</h3>
    <p class="muted" style="font-size:14px;margin-top:4px">${n ? `${n} gerechten ingelezen.` : 'Nog niet ingelezen.'}
      Kies het bestand <b>Bakje Geluk voor calorietracker.json</b>. De recepten blijven alleen op deze telefoon.</p>
    <button class="btn ghost" id="bgimp" type="button">${n ? 'Opnieuw inlezen' : 'Bestand inlezen'}</button>
    <input type="file" id="bgf" accept="application/json,.json" hidden></div>`;
}
function wireMenuImport(el, done) {
  $('#bgimp', el).addEventListener('click', () => $('#bgf', el).click());
  $('#bgf', el).addEventListener('change', async e => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const d = JSON.parse(await file.text());
      if (d?.soort !== 'bakjegeluk-weekmenus' || !Array.isArray(d.gerechten)) throw new Error();
      localStorage.setItem(BG_KEY, JSON.stringify({ gerechten: d.gerechten }));
      BG = null;
      persistOnce();
      toast(`${d.gerechten.length} gerechten ingelezen`);
      done?.();
    } catch {
      toast('Dit is niet het weekmenu-bestand');
    }
  });
}

// Het weekoverzicht: per dag de zes eetmomenten.
function openWeekMenu() {
  let wk = weekStart(cur);
  const el = screen('Weekmenu', '<div id="wm"></div>');
  const box = $('#wm', el);
  const draw = () => {
    if (!bg().list.length) {
      box.innerHTML = `<div class="notice">Lees eerst de Bakje Geluk weekmenu's in. Het bestand staat in Dropbox in de map
        <b>Bakje Geluk weekmenu's</b>.</div>${menuImportHtml()}`;
      wireMenuImport(box, draw);
      return;
    }
    const goal = goals().kcal;
    const days = [...Array(7)].map((_, i) => shiftDay(wk, i));
    box.innerHTML = `
      <div class="weeknav"><button class="icon-btn" data-w="-7" aria-label="Vorige week">${ic('left')}</button>
        <b>Week van ${esc(toDate(wk).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long' }))}</b>
        <button class="icon-btn" data-w="7" aria-label="Volgende week">${ic('right')}</button></div>
      <button class="btn ghost" id="shop" type="button">${ic('cart')} Boodschappenlijst</button>
      ${days.map(day => {
        const tot = plannedKcal(day);
        return `<section class="card"><div class="day-head"><h3>${esc(dayTitle(day))}</h3>
          <small class="num${tot > goal ? ' over-txt' : ''}">${tot} / ${goal} kcal</small></div>
          ${SLOTS.map(sl => {
            const d = dishAt(day, sl.id);
            const on = d && eatenEntry(day, sl.id);
            return `<div class="slot" data-day="${day}" data-slot="${sl.id}"><span class="si">${sl.icon}</span>
              <div class="t"><small>${esc(sl.name)}</small><b class="${d ? '' : 'leeg'}">${d ? esc(d.naam) : 'Kies een gerecht'}</b></div>
              <span class="k num">${d ? `${on ? '✓ ' : ''}${d.kcal}` : ic('plus')}</span></div>`;
          }).join('')}</section>`;
      }).join('')}`;
  };
  el._refresh = draw;
  box.addEventListener('click', e => {
    const w = e.target.closest('[data-w]');
    if (w) { wk = shiftDay(wk, +w.dataset.w); return draw(); }
    if (e.target.closest('#shop')) return openShopping(wk);
    const s = e.target.closest('[data-slot]');
    if (!s) return;
    if (dishAt(s.dataset.day, s.dataset.slot)) openDish({ day: s.dataset.day, slot: s.dataset.slot });
    else openPicker(s.dataset.day, s.dataset.slot);
  });
  draw();
  openLayer(el);
}

// ---------- Boodschappen ----------
const FRAC = { '½': 0.5, '¼': 0.25, '¾': 0.75, '⅓': 1 / 3 };
const UNITS = { gr: 'g', g: 'g', gram: 'g', ml: 'ml', el: 'el', tl: 'tl' };
// "125 gr gerookte kip" -> {qty:125, unit:'g', name:'gerookte kip'}. Zonder getal: qty null.
function parseIng(line) {
  const m = line.match(/^(\d+(?:[.,]\d+)?(?:\/\d+)?|[½¼¾⅓])\s*(gr|gram|g|ml|el|tl)?\.?\s+(.+)$/i);
  if (!m) return { qty: null, unit: '', name: line.trim() };
  const [a, b] = m[1].split('/');
  const qty = FRAC[m[1]] ?? (b ? num(a) / num(b) : num(a));
  return { qty, unit: UNITS[(m[2] || '').toLowerCase()] || '', name: m[3].trim() };
}
function shoppingList(wk) {
  const items = new Map();
  for (let i = 0; i < 7; i++) {
    const day = shiftDay(wk, i);
    for (const sl of SLOTS) {
      const d = dishAt(day, sl.id);
      if (!d) continue;
      for (const line of d.ingredienten) {
        const p = parseIng(line);
        // Tips en uitleg die tussen de ingrediënten staan horen niet op de lijst.
        if (/^(tip|optioneel)/i.test(p.name) || (p.qty === null && p.name.split(/\s+/).length > 5)) continue;
        const base = p.name.split(/[,(]/)[0].trim();
        const key = `${norm(base)}|${p.qty === null ? '-' : p.unit}`;
        const it = items.get(key) || { key, name: base, unit: p.unit, qty: p.qty === null ? null : 0, voor: new Set() };
        if (it.qty !== null) it.qty += p.qty * (sl.persons || 1);
        it.voor.add(d.naam);
        items.set(key, it);
      }
    }
  }
  return [...items.values()].sort((a, b) => a.name.localeCompare(b.name, 'nl'));
}
function openShopping(wk) {
  const done = ((S.shop ||= {})[wk] ||= {});
  const el = screen('Boodschappen', `<p class="muted pick-info">Week van ${esc(toDate(wk).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long' }))}.
    Diner voor ${DINER_PERSONEN} personen, de rest voor 1.</p><div id="sl"></div>`);
  const amount = it => (it.qty === null ? '' : it.unit ? `${fmtN(it.qty)} ${it.unit}` : `${fmtN(it.qty)}×`);
  const row = it => `<div class="item${done[it.key] ? ' done' : ''}" data-k="${esc(it.key)}"><span class="tick">${ic('check')}</span>
    <div class="t"><b>${esc(it.name)}</b><small>${esc([amount(it), [...it.voor].join(', ')].filter(Boolean).join(' · '))}</small></div></div>`;
  const draw = () => {
    const list = shoppingList(wk);
    const todo = list.filter(it => !done[it.key]), got = list.filter(it => done[it.key]);
    $('#sl', el).innerHTML = !list.length ? '<div class="list"><div class="empty">Nog niets gepland in deze week.</div></div>'
      : `<div class="list">${todo.length ? todo.map(row).join('') : '<div class="empty">Alles is binnen.</div>'}</div>
        ${got.length ? `<div class="section-title">In huis</div><div class="list">${got.map(row).join('')}</div>` : ''}`;
  };
  $('#sl', el).addEventListener('click', e => {
    const r = e.target.closest('[data-k]');
    if (!r) return;
    if (done[r.dataset.k]) delete done[r.dataset.k];
    else done[r.dataset.k] = 1;
    save();
    draw();
  });
  draw();
  openLayer(el);
}
