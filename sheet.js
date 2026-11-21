// Шаг 3: загрузка файла LSS из CharBox и лист персонажа.
// Этот файл только объявляет функции; общие помощники (el, show, sb, busy…) живут в app.js.

const STAT_KEYS = ['str', 'dex', 'con', 'int', 'wis', 'cha'];
const STAT_SHORT = { str: 'СИЛ', dex: 'ЛОВ', con: 'ТЕЛ', int: 'ИНТ', wis: 'МДР', cha: 'ХАР' };
const STAT_FULL = { str: 'Сила', dex: 'Ловкость', con: 'Телосложение', int: 'Интеллект', wis: 'Мудрость', cha: 'Харизма' };

function modOf(score) { return Math.floor(((Number(score) || 10) - 10) / 2); }
function signed(n) { n = Number(n) || 0; return n >= 0 ? '+' + n : '−' + Math.abs(n); }
function toInt(v, fallback) {
  const n = parseInt(String(v === null || v === undefined ? '' : v).replace('−', '-').replace(/[^\d-]/g, ''), 10);
  return Number.isFinite(n) ? n : fallback;
}
function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }

// ---------- разбор файла LSS ----------

// Текст из «документа» LSS (вложенные абзацы) → список строк
function docLines(doc) {
  const walk = (n) => {
    if (!n) return '';
    if (typeof n.text === 'string') return n.text;
    return (n.content || []).map(walk).join('');
  };
  const out = [];
  for (const p of (doc && Array.isArray(doc.content) ? doc.content : [])) {
    const t = walk(p).replace(/\s+/g, ' ').trim();
    if (t) out.push(t);
  }
  return out;
}

function htmlBody(html) {
  return new DOMParser().parseFromString(String(html), 'text/html').body;
}

// HTML-заметка LSS → список умений {name, text}. Читаем только текст, разметку не переносим.
function htmlFeatures(html) {
  const out = [];
  if (!html || typeof html !== 'string') return out;
  const norm = (t) => String(t || '').replace(/\s+/g, ' ').trim();
  let cur = null;
  for (const node of Array.from(htmlBody(html).childNodes)) {
    const t = norm(node.textContent);
    if (!t) continue;
    let titleEl = null;
    if (node.nodeName === 'STRONG') titleEl = node;
    else if (node.nodeType === 1) {
      let c = node.firstChild;
      while (c && c.nodeType === 3 && !c.textContent.trim()) c = c.nextSibling;
      if (c && c.nodeName === 'STRONG') titleEl = c;
    }
    const tt = titleEl ? norm(titleEl.textContent) : '';
    if (titleEl && /:$/.test(tt)) {
      const name = norm(tt.replace(/:$/, '').replace(/\[[^\]]*\]/g, ''));
      const rest = t.startsWith(tt) ? t.slice(tt.length).trim() : t;
      if (/^Умения от/i.test(name) && !rest) { cur = null; continue; }
      cur = { name: name || 'Умение', text: rest };
      out.push(cur);
    } else if (cur) {
      cur.text += (cur.text ? '\n' : '') + t;
    } else {
      cur = { name: 'Заметка', text: t };
      out.push(cur);
    }
  }
  return out;
}

// HTML → простой текст, каждый абзац с новой строки
function htmlLines(html) {
  if (!html || typeof html !== 'string') return [];
  const out = [];
  const body = htmlBody(html);
  const blocks = body.querySelectorAll('p, li');
  const list = blocks.length ? Array.from(blocks) : [body];
  for (const b of list) {
    const t = String(b.textContent || '').replace(/\s+/g, ' ').trim();
    if (t && !/:$/.test(t)) out.push(t);
  }
  return out;
}

function textField(d, key) {
  const f = d.text && d.text[key];
  return f && f.value ? f.value.data : null;
}

// Главная функция: текст файла → { sheet, source, notes }
function parseLss(fileText) {
  const bad = 'Не получилось прочитать файл. Нужен файл LSS из CharBox (заканчивается на .json).';
  let outer, d;
  try {
    outer = JSON.parse(fileText);
    d = outer && outer.data;
    if (typeof d === 'string') d = JSON.parse(d);
  } catch (_) {
    throw new Error(bad);
  }
  if (!d || typeof d !== 'object' || !d.stats || !d.name) throw new Error(bad);

  const notes = [];
  const info = d.info || {};
  const val = (o, fb) => (o && o.value !== undefined && o.value !== null && o.value !== '' ? o.value : fb);
  const vit = d.vitality || {};
  const prof = toInt(d.proficiency, 2);

  const stats = {};
  for (const k of STAT_KEYS) stats[k] = toInt(d.stats[k] && d.stats[k].score, 10);
  const saves = {};
  for (const k of STAT_KEYS) saves[k] = !!(d.saves && d.saves[k] && d.saves[k].isProf);

  const skills = Object.values(d.skills || {})
    .filter((s) => s && s.label && STAT_KEYS.includes(s.baseStat))
    .map((s) => ({ label: String(s.label), stat: s.baseStat, prof: clamp(toInt(s.isProf, 0), 0, 2) }))
    .sort((a, b) => a.label.localeCompare(b.label, 'ru'));

  const weapons = (Array.isArray(d.weaponsList) ? d.weaponsList : []).map((w) => {
    const name = String(val(w.name, 'Оружие'));
    const fromFile = toInt(val(w.mod, ''), null);
    const ability = STAT_KEYS.includes(w.ability) ? w.ability : 'str';
    const guess = modOf(stats[ability]) + (w.isProf ? prof : 0) + toInt(val(w.modBonus, 0), 0);
    if (fromFile === null) notes.push(`«${name}»: в файле нет бонуса атаки. Проверьте число ниже и поправьте по своему листу.`);
    return { name, bonus: fromFile === null ? guess : fromFile, dmg: String(val(w.dmg, '')) };
  });

  // снаряжение: убираем точные повторы генератора
  const itemLines = docLinesOrHtml(textField(d, 'equipment'));
  const seen = new Set();
  const items = [];
  let dups = 0;
  for (const line of itemLines) {
    const key = line.toLowerCase();
    if (seen.has(key)) { dups++; continue; }
    seen.add(key);
    items.push({ name: line, qty: 1 });
  }
  if (dups) notes.push(`В снаряжении убрано повторов: ${dups}. Количество предметов проверьте на вкладке «Вещи».`);

  const slots = [];
  for (let l = 1; l <= 9; l++) {
    const max = toInt(d.spells && d.spells['slots-' + l] && d.spells['slots-' + l].value, 0);
    if (max > 0) slots.push({ level: l, max, used: 0 });
  }
  const spells = [];
  for (let l = 0; l <= 9; l++) {
    for (const line of docLinesOrHtml(textField(d, 'spells-level-' + l))) {
      spells.push({ name: line.replace(/\s*\[[^\]]*\]\s*$/, '').trim() || line, level: l });
    }
  }

  // умения: из блока «атаки» и заметок
  const features = [];
  const addFeature = (f) => {
    const name = String(f.name || 'Умение').slice(0, 80);
    const same = features.find((x) => x.name.toLowerCase() === name.toLowerCase());
    if (same) { if ((f.text || '').length > same.text.length) same.text = f.text; return; }
    features.push({ name, text: String(f.text || ''), usesMax: 0, usesLeft: 0 });
  };
  for (const line of docLinesOrHtml(textField(d, 'attacks'))) {
    const i = line.indexOf(':');
    if (i > 0 && i < 60) addFeature({ name: line.slice(0, i).replace(/\s*\(\d+\)\s*$/, ''), text: line.slice(i + 1).trim() });
    else addFeature({ name: 'Умение', text: line });
  }
  for (const key of ['notes-1', 'notes-2', 'notes-3', 'notes-4', 'notes-5', 'notes-6', 'feats', 'features']) {
    const raw = textField(d, key);
    if (typeof raw === 'string') htmlFeatures(raw).forEach(addFeature);
    else if (raw && typeof raw === 'object') docLines(raw).forEach((t) => addFeature({ name: 'Заметка', text: t }));
  }
  for (const f of features) {
    if (/дыхание дракона/i.test(f.name)) { f.usesMax = prof; f.usesLeft = prof; }
    if (/типа \.|\(\)|\s\.\s+—/.test(f.text)) notes.push(`В умении «${f.name}» генератор оставил пустое место. Допишите текст на вкладке «Магия».`);
  }

  const profRaw = textField(d, 'prof');
  const profLines = typeof profRaw === 'string' ? htmlLines(profRaw) : docLines(profRaw);

  let portrait = d.avatar && (d.avatar.webp || d.avatar.jpeg);
  if (typeof portrait !== 'string' || !/^https:\/\//.test(portrait)) portrait = '';

  const hpMax = Math.max(1, toInt(val(vit['hp-max'], 1), 1));
  const sheet = {
    v: 1,
    name: String(val(d.name, 'Без имени')).slice(0, 80),
    cls: String(val(info.charClass, '')),
    species: String(val(info.race, '')),
    background: String(val(info.background, '')),
    alignment: String(val(info.alignment, '')),
    level: clamp(toInt(val(info.level, 1), 1), 1, 20),
    xp: Math.max(0, toInt(val(info.experience, 0), 0)),
    portrait,
    hp: { cur: clamp(toInt(val(vit['hp-current'], hpMax), hpMax), 0, hpMax), max: hpMax, temp: Math.max(0, toInt(val(vit['hp-temp'], 0), 0)) },
    ac: toInt(val(vit.ac, 10), 10),
    speed: toInt(val(vit.speed, 30), 30),
    hitDie: String(val(vit['hit-die'], '')).replace(/^d/i, 'к'),
    prof,
    stats, saves, skills, weapons,
    gold: Math.max(0, toInt(d.coins && d.coins.gp && d.coins.gp.value, 0)),
    items,
    spell: {
      dc: toInt(d.spellsInfo && d.spellsInfo.save && d.spellsInfo.save.customModifier, 8 + prof + modOf(stats.cha)),
      atk: toInt(d.spellsInfo && d.spellsInfo.mod && d.spellsInfo.mod.customModifier, prof + modOf(stats.cha)),
      slots,
    },
    spells, features,
    profText: profLines.join('\n'),
  };
  return { sheet, source: outer, notes };
}

function docLinesOrHtml(raw) {
  if (!raw) return [];
  if (typeof raw === 'string') return htmlLines(raw);
  return docLines(raw);
}

// ---------- всплывающая форма ----------

function openForm(opts) {
  const back = el('div', { class: 'modal-back' });
  const inputs = {};
  const close = () => back.remove();
  const rows = opts.fields.map((f) => {
    const id = 'f_' + f.key;
    const input = f.area
      ? el('textarea', { id, rows: '6' })
      : el('input', { id, type: 'text', inputmode: f.numeric ? 'numeric' : null, autocomplete: 'off' });
    input.value = f.value === null || f.value === undefined ? '' : String(f.value);
    inputs[f.key] = input;
    return el('div', { class: 'field' }, el('label', { for: id }, f.label), input, f.hint ? el('p', { class: 'muted small' }, f.hint) : null);
  });
  const form = el('form', { class: 'modal stack', novalidate: true, onsubmit: (e) => {
    e.preventDefault();
    const vals = {};
    for (const f of opts.fields) {
      const raw = inputs[f.key].value.trim();
      vals[f.key] = f.numeric ? toInt(raw, f.fallback === undefined ? 0 : f.fallback) : raw;
    }
    close();
    opts.onSave(vals);
  } },
    el('div', { class: 'title' }, opts.title),
    rows,
    el('button', { class: 'btn', type: 'submit' }, opts.saveText || 'Сохранить'),
    opts.onDelete ? el('button', { class: 'btn outline danger', type: 'button', onclick: () => { close(); opts.onDelete(); } }, opts.deleteText || 'Удалить') : null,
    el('button', { class: 'btn link', type: 'button', onclick: close }, 'Отмена'));
  back.addEventListener('click', (e) => { if (e.target === back) close(); });
  back.append(form);
  document.body.append(back);
}

// ---------- загрузка и проверка ----------

function showUpload(profile) {
  const err = errorBox();
  const input = el('input', { id: 'lssfile', type: 'file', accept: '.json,application/json', class: 'filehide' });
  input.addEventListener('change', async () => {
    err.set('');
    const file = input.files && input.files[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) return err.set('Файл слишком большой. Нужен файл LSS из CharBox.');
    try {
      const parsed = parseLss(await file.text());
      showReview(profile, parsed);
    } catch (e) {
      err.set(e && e.message ? e.message : 'Не получилось прочитать файл.');
      input.value = '';
    }
  });

  show(false,
    el('div', { class: 'head' },
      el('h1', { class: 'small' }, 'Загрузка персонажа'),
      el('p', { class: 'muted' }, 'Скачайте в CharBox файл LSS и выберите его здесь.')),
    el('div', { class: 'card' },
      el('div', { class: 'title' }, 'Как получить файл'),
      el('p', { class: 'muted' }, '1. Откройте персонажа на dnd24.charbox.org.'),
      el('p', { class: 'muted' }, '2. Нажмите экспорт и выберите LSS.'),
      el('p', { class: 'muted' }, '3. Файл с окончанием lss_export.json сохранится в телефоне.')),
    input,
    el('label', { for: 'lssfile', class: 'btn' }, 'Выбрать файл LSS'),
    err.node,
    el('button', { class: 'btn outline spacer', type: 'button', onclick: () => route() }, 'Назад'));
}

function showReview(profile, parsed) {
  const s = parsed.sheet;
  const err = errorBox();
  const line = (a, b) => el('div', { class: 'kv' }, el('span', { class: 'muted' }, a), el('strong', {}, b));

  const bonusInputs = s.weapons.map((w, i) => {
    const input = el('input', { id: 'wb' + i, type: 'text', inputmode: 'numeric', autocomplete: 'off' });
    input.value = signed(w.bonus);
    return { w, input, node: el('div', { class: 'field' }, el('label', { for: 'wb' + i }, `${w.name} — бонус атаки`), input) };
  });

  const save = el('button', { class: 'btn', type: 'button' }, 'Сохранить персонажа');
  save.addEventListener('click', async () => {
    err.set('');
    for (const b of bonusInputs) b.w.bonus = toInt(b.input.value, b.w.bonus);
    await busy(save, 'Сохраняем…', async () => {
      const { data, error } = await sb.from('characters').insert({
        owner_id: profile.id, name: s.name, class_name: s.cls, species: s.species, level: s.level,
        sheet: s, source_lss: parsed.source,
      }).select('id').single();
      if (error || !data) return err.set('Не получилось сохранить персонажа. Попробуйте ещё раз.');
      await openCharacter(profile, data.id, 'main');
    });
  });

  show(false,
    el('div', { class: 'head' },
      el('h1', { class: 'small' }, 'Проверьте персонажа'),
      el('p', { class: 'muted' }, 'Вот что сайт прочитал из файла.')),
    el('div', { class: 'card' },
      line('Имя', s.name),
      line('Класс и уровень', `${s.cls || '—'}, ${s.level}`),
      line('Вид', s.species || '—'),
      line('Хиты · КД · Скорость', `${s.hp.max} · ${s.ac} · ${s.speed} фт`),
      line('Оружие', String(s.weapons.length)),
      line('Предметы', String(s.items.length)),
      line('Заклинания', `${s.spells.length}, ячеек: ${s.spell.slots.reduce((a, x) => a + x.max, 0)}`),
      line('Умения', String(s.features.length)),
      line('Золото', `${s.gold} зм`)),
    (bonusInputs.length || parsed.notes.length) ? el('div', { class: 'card notice' },
      el('div', { class: 'title' }, 'Нужно проверить'),
      parsed.notes.map((n) => el('p', { class: 'muted' }, n)),
      bonusInputs.map((b) => b.node)) : null,
    err.node,
    save,
    el('button', { class: 'btn outline', type: 'button', onclick: () => showUpload(profile) }, 'Выбрать другой файл'));
}

// ---------- лист персонажа ----------

let CH = null; // открытый персонаж: { profile, id, sheet, tab, open, saveState, timer, badge }

async function openCharacter(profile, id, tab, back) {
  show(false, el('p', { class: 'muted center' }, 'Загрузка…'));
  const { data, error } = await sb.from('characters').select('id, owner_id, sheet').eq('id', id).maybeSingle();
  if (error || !data || !data.sheet || !data.sheet.stats) {
    return show(true,
      el('p', { class: 'error' }, 'Не удалось открыть персонажа.'),
      el('button', { class: 'btn', type: 'button', onclick: () => route() }, 'Назад'));
  }
  const s = data.sheet;
  // подстраховка: недостающие части листа
  s.hp = s.hp || { cur: 1, max: 1, temp: 0 };
  s.weapons = s.weapons || []; s.items = s.items || []; s.spells = s.spells || []; s.features = s.features || [];
  s.skills = s.skills || []; s.saves = s.saves || {}; s.spell = s.spell || { dc: 10, atk: 0, slots: [] };
  s.spell.slots = s.spell.slots || [];
  CH = { profile, id: data.id, own: data.owner_id === profile.id, sheet: s, tab: tab || 'main', open: new Set(), saveState: 'saved', timer: null, badge: null, back: back || null, group: undefined };
  renderChar();
}

function badgeText(state) {
  return state === 'saving' ? 'Сохраняем…' : state === 'error' ? 'Не сохранилось. Проверьте интернет' : 'Сохранено';
}

async function saveNow() {
  const c = CH;
  if (!c) return;
  clearTimeout(c.timer);
  c.timer = null;
  const s = c.sheet;
  const { data, error } = await sb.from('characters')
    .update({ sheet: s, name: s.name, class_name: s.cls, species: s.species, level: s.level })
    .eq('id', c.id).select('id');
  if (c.timer) return; // пока сохраняли, появились новые правки — их сохранит следующий запуск
  c.saveState = (error || !data || !data.length) ? 'error' : 'saved';
  if (c.badge) { c.badge.textContent = badgeText(c.saveState); c.badge.classList.toggle('bad', c.saveState === 'error'); }
}

// Вызывается после любой правки листа
function changed() {
  CH.saveState = 'saving';
  clearTimeout(CH.timer);
  CH.timer = setTimeout(saveNow, 700);
  renderChar();
}

async function leaveCharacter() {
  if (CH && CH.timer) await saveNow();
  const back = CH && CH.back;
  CH = null;
  if (back) back(); else route();
}

function skillBonus(s, sk) { return modOf(s.stats[sk.stat]) + s.prof * (sk.prof || 0); }

function renderChar() {
  const c = CH;
  const s = c.sheet;
  const y = window.scrollY;
  const ro = !c.own; // чужой персонаж — только просмотр
  const editBtn = (text, fn) => (ro ? null : el('button', { class: 'mini', type: 'button', onclick: fn }, text));

  c.badge = el('span', { class: 'badge' + (c.saveState === 'error' ? ' bad' : '') }, ro ? 'Только просмотр' : badgeText(c.saveState));
  const top = el('div', { class: 'topbar' },
    el('button', { class: 'mini', type: 'button', onclick: leaveCharacter }, '← Назад'),
    c.badge);

  let portrait = null;
  if (s.portrait && /^https:\/\//.test(s.portrait)) {
    portrait = el('img', { class: 'portrait', src: s.portrait, alt: 'Портрет персонажа', referrerpolicy: 'no-referrer' });
    portrait.addEventListener('error', () => portrait.remove());
  }
  const header = el('div', { class: 'chead' },
    portrait,
    el('div', { class: 'grow' },
      el('h1', { class: 'small' }, s.name),
      el('p', { class: 'muted' }, [s.cls, s.species].filter(Boolean).join(' · '))),
    el('div', { class: 'chip' }, `${s.level} ур.`));

  let body = [];
  if (c.tab === 'main') body = tabMain(s, ro, editBtn);
  else if (c.tab === 'items') body = tabItems(s, ro, editBtn);
  else if (c.tab === 'magic') body = tabMagic(s, ro, editBtn);
  else body = tabGroup(c, ro);

  const tab = (key, label) => el('button', { type: 'button', 'aria-current': c.tab === key ? 'page' : null, onclick: () => { c.tab = key; renderChar(); window.scrollTo(0, 0); } }, label);
  const nav = el('nav', { class: 'tabs', 'aria-label': 'Разделы' }, tab('main', 'Персонаж'), tab('items', 'Вещи'), tab('magic', 'Магия'), tab('group', 'Группа'));

  app.className = 'screen withtabs';
  app.replaceChildren(top, header, ...body.flat(Infinity).filter(Boolean), nav);
  window.scrollTo(0, y);
}

function tabMain(s, ro, editBtn) {
  const hp = s.hp;
  const step = (d) => { hp.cur = clamp(hp.cur + d, 0, hp.max); changed(); };
  const hpCard = el('div', { class: 'card' },
    el('div', { class: 'cardhead' }, el('span', { class: 'label caps' }, 'Хиты'),
      editBtn('Изменить', () => openForm({
        title: 'Хиты',
        fields: [
          { key: 'cur', label: 'Сейчас', numeric: true, value: hp.cur, fallback: hp.cur },
          { key: 'max', label: 'Максимум', numeric: true, value: hp.max, fallback: hp.max },
          { key: 'temp', label: 'Временные хиты', numeric: true, value: hp.temp || 0 },
        ],
        onSave: (v) => { hp.max = Math.max(1, v.max); hp.cur = clamp(v.cur, 0, hp.max); hp.temp = Math.max(0, v.temp); changed(); },
      }))),
    el('div', { class: 'hprow' },
      ro ? el('span', {}) : el('button', { class: 'round', type: 'button', 'aria-label': 'Уменьшить хиты', onclick: () => step(-1) }, '−'),
      el('div', { class: 'hpval' }, el('span', { class: 'big' }, String(hp.cur)), el('span', { class: 'muted' }, ` / ${hp.max}`)),
      ro ? el('span', {}) : el('button', { class: 'round', type: 'button', 'aria-label': 'Увеличить хиты', onclick: () => step(1) }, '+')),
    hp.temp > 0 ? el('p', { class: 'muted center' }, `Временные хиты: ${hp.temp}`) : null);

  const tile = (label, value) => el('div', { class: 'tile' }, el('div', { class: 'label' }, label), el('div', { class: 'tval' }, value));
  const row3 = el('div', { class: 'grid3' }, tile('КД', String(s.ac)), tile('Инициатива', signed(modOf(s.stats.dex))), tile('Скорость', `${s.speed} фт`));

  const numCard = (label, value, title, key, suffix) => el('div', { class: 'card tight' },
    el('div', { class: 'label' }, label),
    el('div', { class: 'tval nowrap' }, value),
    ro ? null : el('button', { class: 'mini wide', type: 'button', onclick: () => openForm({
      title,
      fields: [{ key: 'v', label: title + (suffix ? `, ${suffix}` : ''), numeric: true, value: s[key], fallback: s[key] }],
      onSave: (v) => { s[key] = Math.max(0, v.v); changed(); },
    }) }, 'Изменить'));
  const row2 = el('div', { class: 'grid2' }, numCard('Опыт', String(s.xp), 'Опыт', 'xp'), numCard('Золото', `${s.gold} зм`, 'Золото', 'gold', 'зм'));

  const statsGrid = el('div', { class: 'grid3' }, STAT_KEYS.map((k) => el('div', { class: 'tile' },
    el('div', { class: 'label' }, STAT_SHORT[k]),
    el('div', { class: 'tval big2' }, signed(modOf(s.stats[k]))),
    el('div', { class: 'muted small' }, String(s.stats[k])))));

  const listRow = (mark, label, value) => el('div', { class: 'lrow' }, el('span', {}, (mark ? '● ' : '○ ') + label), el('strong', {}, value));
  const saves = el('div', { class: 'card' }, el('div', { class: 'title' }, 'Спасброски'),
    STAT_KEYS.map((k) => listRow(s.saves[k], STAT_FULL[k], signed(modOf(s.stats[k]) + (s.saves[k] ? s.prof : 0)))),
    el('p', { class: 'muted small' }, `● — владение. Бонус мастерства ${signed(s.prof)}`));
  const skills = el('div', { class: 'card' }, el('div', { class: 'title' }, 'Навыки'),
    s.skills.map((sk) => listRow(sk.prof > 0, `${sk.label} (${STAT_SHORT[sk.stat]})`, signed(skillBonus(s, sk)))));

  const passive = (word) => {
    const sk = s.skills.find((x) => x.label.toLowerCase().startsWith(word));
    return sk ? String(10 + skillBonus(s, sk)) : '—';
  };
  const passives = el('div', { class: 'grid3' }, tile('Пасс. внимат.', passive('внимат')), tile('Пасс. проницат.', passive('проницат')), tile('Пасс. анализ', passive('анализ')));

  const weaponForm = (w, isNew) => openForm({
    title: isNew ? 'Новое оружие' : 'Оружие',
    fields: [
      { key: 'name', label: 'Название', value: w.name },
      { key: 'bonus', label: 'Бонус атаки', numeric: true, value: signed(w.bonus), fallback: w.bonus },
      { key: 'dmg', label: 'Урон', value: w.dmg, hint: 'Например: 1к8+3 рубящий' },
    ],
    onSave: (v) => { w.name = v.name || 'Оружие'; w.bonus = v.bonus; w.dmg = v.dmg; if (isNew) s.weapons.push(w); changed(); },
    onDelete: isNew ? null : () => { s.weapons.splice(s.weapons.indexOf(w), 1); changed(); },
  });
  const weapons = [
    el('h2', {}, 'Оружие'),
    s.weapons.map((w) => el('div', { class: 'card rowcard' },
      el('div', { class: 'grow' }, el('div', { class: 'title' }, w.name), el('p', { class: 'muted' }, `Атака ${signed(w.bonus)}${w.dmg ? ' · урон ' + w.dmg : ''}`)),
      editBtn('Изменить', () => weaponForm(w, false)))),
    ro ? null : el('button', { class: 'btn dashed', type: 'button', onclick: () => weaponForm({ name: '', bonus: 0, dmg: '' }, true) }, '+ Добавить оружие'),
  ];

  const mainForm = () => openForm({
    title: 'Основное',
    fields: [
      { key: 'name', label: 'Имя персонажа', value: s.name },
      { key: 'cls', label: 'Класс', value: s.cls },
      { key: 'species', label: 'Вид', value: s.species },
      { key: 'level', label: 'Уровень', numeric: true, value: s.level, fallback: s.level },
      { key: 'ac', label: 'КД', numeric: true, value: s.ac, fallback: s.ac },
      { key: 'speed', label: 'Скорость, фт', numeric: true, value: s.speed, fallback: s.speed },
      { key: 'prof', label: 'Бонус мастерства', numeric: true, value: s.prof, fallback: s.prof },
    ],
    onSave: (v) => {
      s.name = (v.name || s.name).slice(0, 80); s.cls = v.cls; s.species = v.species;
      s.level = clamp(v.level, 1, 20); s.ac = v.ac; s.speed = Math.max(0, v.speed); s.prof = clamp(v.prof, 0, 10);
      changed();
    },
    deleteText: 'Удалить персонажа',
    onDelete: async () => {
      if (!window.confirm(`Удалить персонажа «${s.name}» навсегда?`)) return;
      clearTimeout(CH.timer);
      const { data, error } = await sb.from('characters').delete().eq('id', CH.id).select('id');
      if (error || !data || !data.length) { window.alert('Не получилось удалить. Попробуйте ещё раз.'); return; }
      CH = null;
      route();
    },
  });
  const statsForm = () => openForm({
    title: 'Характеристики',
    fields: STAT_KEYS.map((k) => ({ key: k, label: STAT_FULL[k], numeric: true, value: s.stats[k], fallback: s.stats[k] })),
    onSave: (v) => { for (const k of STAT_KEYS) s.stats[k] = clamp(v[k], 1, 30); changed(); },
  });

  return [
    hpCard, row3, row2,
    el('div', { class: 'cardhead' }, el('h2', {}, 'Характеристики'), editBtn('Изменить', statsForm)),
    statsGrid, passives, saves, skills,
    weapons,
    s.profText ? el('div', { class: 'card' }, el('div', { class: 'title' }, 'Владения и языки'), s.profText.split('\n').map((t) => el('p', { class: 'muted' }, t))) : null,
    ro ? null : el('button', { class: 'btn outline', type: 'button', onclick: mainForm }, 'Изменить имя, уровень, КД'),
  ];
}

function tabItems(s, ro, editBtn) {
  const itemForm = (it, isNew) => openForm({
    title: isNew ? 'Новый предмет' : 'Предмет',
    fields: [
      { key: 'name', label: 'Название', value: it.name },
      { key: 'qty', label: 'Количество', numeric: true, value: it.qty, fallback: 1 },
    ],
    onSave: (v) => { it.name = v.name || 'Предмет'; it.qty = Math.max(1, v.qty); if (isNew) s.items.push(it); changed(); },
    onDelete: isNew ? null : () => { s.items.splice(s.items.indexOf(it), 1); changed(); },
  });
  return [
    el('div', { class: 'card rowcard' },
      el('div', { class: 'grow' }, el('div', { class: 'label' }, 'Золото'), el('div', { class: 'tval' }, `${s.gold} зм`)),
      editBtn('Изменить', () => openForm({
        title: 'Золото',
        fields: [{ key: 'v', label: 'Золото, зм', numeric: true, value: s.gold, fallback: s.gold }],
        onSave: (v) => { s.gold = Math.max(0, v.v); changed(); },
      }))),
    el('h2', {}, 'Снаряжение'),
    s.items.length ? null : el('p', { class: 'muted' }, 'Предметов пока нет.'),
    s.items.map((it) => el('div', { class: 'card rowcard slim' },
      el('div', { class: 'grow' }, it.name),
      el('span', { class: 'muted nowrap' }, `${it.qty} шт.`),
      editBtn('Изм.', () => itemForm(it, false)))),
    ro ? null : el('button', { class: 'btn dashed', type: 'button', onclick: () => itemForm({ name: '', qty: 1 }, true) }, '+ Добавить предмет'),
  ];
}

function tabMagic(s, ro, editBtn) {
  const c = CH;
  const sp = s.spell;
  const tile = (label, value) => el('div', { class: 'tile' }, el('div', { class: 'label' }, label), el('div', { class: 'tval' }, value));

  const head = [
    el('div', { class: 'grid2' }, tile('Сложность спасброска', String(sp.dc)), tile('Атака заклинанием', signed(sp.atk))),
    ro ? null : el('button', { class: 'btn outline', type: 'button', onclick: () => openForm({
      title: 'Магия и ячейки',
      fields: [
        { key: 'dc', label: 'Сложность спасброска', numeric: true, value: sp.dc, fallback: sp.dc },
        { key: 'atk', label: 'Атака заклинанием', numeric: true, value: signed(sp.atk), fallback: sp.atk },
      ].concat([1, 2, 3, 4, 5, 6, 7, 8, 9].map((l) => {
        const cur = sp.slots.find((x) => x.level === l);
        return { key: 'l' + l, label: `Ячеек ${l} уровня`, numeric: true, value: cur ? cur.max : 0 };
      })),
      onSave: (v) => {
        sp.dc = v.dc; sp.atk = v.atk;
        const next = [];
        for (let l = 1; l <= 9; l++) {
          const max = clamp(v['l' + l], 0, 9);
          if (max <= 0) continue;
          const cur = sp.slots.find((x) => x.level === l);
          next.push({ level: l, max, used: clamp(cur ? cur.used : 0, 0, max) });
        }
        sp.slots = next;
        changed();
      },
    }) }, 'Изменить сложность и ячейки'),
  ];

  const slots = sp.slots.map((sl) => {
    const left = sl.max - sl.used;
    return el('div', { class: 'card' },
      el('div', { class: 'cardhead' }, el('div', { class: 'title' }, `Ячейки ${sl.level} ур.`), el('p', { class: 'muted nowrap' }, `Осталось ${left} из ${sl.max}`)),
      ro ? null : el('div', { class: 'grid2' },
        el('button', { class: 'mini', type: 'button', disabled: sl.used <= 0, onclick: () => { sl.used = Math.max(0, sl.used - 1); changed(); } }, 'Вернуть'),
        el('button', { class: 'mini solid', type: 'button', disabled: left <= 0, onclick: () => { sl.used = Math.min(sl.max, sl.used + 1); changed(); } }, 'Потратить')));
  });

  const spellForm = (x, isNew) => openForm({
    title: isNew ? 'Новое заклинание' : 'Заклинание',
    fields: [
      { key: 'name', label: 'Название', value: x.name },
      { key: 'level', label: 'Уровень', numeric: true, value: x.level, hint: '0 — заговор' },
    ],
    onSave: (v) => { x.name = v.name || 'Заклинание'; x.level = clamp(v.level, 0, 9); if (isNew) s.spells.push(x); changed(); },
    onDelete: isNew ? null : () => { s.spells.splice(s.spells.indexOf(x), 1); changed(); },
  });
  const spellBlocks = [];
  for (let l = 0; l <= 9; l++) {
    const list = s.spells.filter((x) => x.level === l);
    if (!list.length) continue;
    spellBlocks.push(el('h2', {}, l === 0 ? 'Заговоры' : `Заклинания ${l} уровня`));
    for (const x of list) spellBlocks.push(el('div', { class: 'card rowcard slim' }, el('div', { class: 'grow' }, x.name), editBtn('Изм.', () => spellForm(x, false))));
  }
  if (!s.spells.length) spellBlocks.push(el('h2', {}, 'Заклинания'), el('p', { class: 'muted' }, 'Заклинаний пока нет.'));
  if (!ro) spellBlocks.push(el('button', { class: 'btn dashed', type: 'button', onclick: () => spellForm({ name: '', level: 1 }, true) }, '+ Добавить заклинание'));

  const featureForm = (f, isNew) => openForm({
    title: isNew ? 'Новое умение' : 'Умение',
    fields: [
      { key: 'name', label: 'Название', value: f.name },
      { key: 'text', label: 'Описание', area: true, value: f.text },
      { key: 'usesMax', label: 'Сколько раз можно применить', numeric: true, value: f.usesMax || 0, hint: '0 — без счётчика. Счётчик восполняется после долгого отдыха.' },
    ],
    onSave: (v) => {
      f.name = v.name || 'Умение'; f.text = v.text;
      const max = clamp(v.usesMax, 0, 99);
      f.usesLeft = isNew || max !== f.usesMax ? max : clamp(f.usesLeft, 0, max);
      f.usesMax = max;
      if (isNew) s.features.push(f);
      changed();
    },
    onDelete: isNew ? null : () => { s.features.splice(s.features.indexOf(f), 1); changed(); },
  });
  const features = [
    el('h2', {}, 'Умения'),
    s.features.length ? null : el('p', { class: 'muted' }, 'Умений пока нет.'),
    s.features.map((f, i) => {
      const opened = c.open.has(i);
      return el('div', { class: 'card' },
        el('div', { class: 'cardhead' }, el('div', { class: 'title grow' }, f.name), editBtn('Изм.', () => featureForm(f, false))),
        f.usesMax > 0 ? el('div', { class: 'cardhead' },
          el('p', { class: 'muted' }, `Осталось ${f.usesLeft} из ${f.usesMax}`),
          ro ? null : el('button', { class: 'mini solid', type: 'button', disabled: f.usesLeft <= 0, onclick: () => { f.usesLeft = Math.max(0, f.usesLeft - 1); changed(); } }, 'Применить')) : null,
        f.text ? el('button', { class: 'mini wide', type: 'button', 'aria-expanded': String(opened), onclick: () => { if (opened) c.open.delete(i); else c.open.add(i); renderChar(); } }, opened ? 'Скрыть описание' : 'Показать описание') : null,
        opened ? f.text.split('\n').map((t) => el('p', { class: 'muted' }, t)) : null);
    }),
    ro ? null : el('button', { class: 'btn dashed', type: 'button', onclick: () => featureForm({ name: '', text: '', usesMax: 0, usesLeft: 0 }, true) }, '+ Добавить умение'),
  ];

  const isWarlock = /колдун/i.test(s.cls || '');
  const rests = ro ? null : el('div', { class: 'card' },
    el('div', { class: 'title' }, 'Отдых'),
    el('p', { class: 'muted' }, isWarlock
      ? 'Короткий отдых возвращает ячейки колдуна. Долгий — ячейки, применения умений и все хиты.'
      : 'Долгий отдых возвращает ячейки, применения умений и все хиты. Короткий у вашего класса ячейки не возвращает.'),
    el('div', { class: 'grid2' },
      el('button', { class: 'btn outline', type: 'button', onclick: () => {
        if (!window.confirm('Короткий отдых?')) return;
        if (isWarlock) sp.slots.forEach((x) => { x.used = 0; });
        changed();
      } }, 'Короткий отдых'),
      el('button', { class: 'btn outline', type: 'button', onclick: () => {
        if (!window.confirm('Долгий отдых? Вернутся ячейки, умения и все хиты.')) return;
        sp.slots.forEach((x) => { x.used = 0; });
        s.features.forEach((f) => { if (f.usesMax > 0) f.usesLeft = f.usesMax; });
        s.hp.cur = s.hp.max; s.hp.temp = 0;
        changed();
      } }, 'Долгий отдых')));

  return [head, slots.length ? slots : el('p', { class: 'muted' }, 'Ячеек заклинаний нет.'), spellBlocks, features, rests];
}

// Вкладка «Группа»: в какой группе этот персонаж
function tabGroup(c, ro) {
  if (ro) return [el('div', { class: 'card' }, el('p', { class: 'muted' }, 'Это персонаж другого игрока. Вернитесь к группе кнопкой «Назад».'))];
  if (c.group === undefined) {
    c.group = null;
    c.groupLoading = true;
    loadMyGroups().then(({ groups, error }) => {
      if (CH !== c) return;
      c.groupLoading = false;
      c.groupError = !!error;
      c.group = (groups || []).find((g) => g.character_id === c.id) || null;
      if (c.tab === 'group') renderChar();
    });
  }
  if (c.groupLoading) return [el('p', { class: 'muted center' }, 'Загрузка…')];
  if (c.groupError) return [el('p', { class: 'error' }, 'Не удалось загрузить группу. Проверьте интернет.')];
  const go = async (fn) => { if (c.timer) await saveNow(); CH = null; fn(); };
  if (c.group) {
    const g = c.group;
    return [el('div', { class: 'card' },
      el('div', { class: 'label' }, 'Персонаж состоит в группе'),
      el('div', { class: 'title' }, g.name),
      el('p', { class: 'muted' }, `Предводитель: ${g.leader_name || '—'} · игроков: ${g.members}`),
      el('button', { class: 'btn', type: 'button', onclick: () => go(() => showGroup(c.profile, g.id)) }, 'Открыть группу'))];
  }
  return [el('div', { class: 'card' },
    el('div', { class: 'title' }, 'Группа'),
    el('p', { class: 'muted' }, 'Этот персонаж пока не в группе.'),
    el('button', { class: 'btn', type: 'button', onclick: () => go(() => showGroups(c.profile)) }, 'Вступить или создать группу'))];
}
