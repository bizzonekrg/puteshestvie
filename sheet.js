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

// ---------- монеты ----------
// Пять видов: платиновые, золотые, электрумовые, серебряные, медные. Золото лежит в s.gold, остальное в s.coins.
const COINS = [['pp', 'пм', 'Платиновые'], ['gp', 'зм', 'Золотые'], ['ep', 'эм', 'Электрумовые'], ['sp', 'см', 'Серебряные'], ['cp', 'мм', 'Медные']];
function coinGet(s, k) { return k === 'gp' ? toInt(s.gold, 0) : toInt(s.coins && s.coins[k], 0); }
function coinSet(s, k, v) {
  v = Math.max(0, toInt(v, 0));
  if (k === 'gp') s.gold = v;
  else { s.coins = s.coins || {}; s.coins[k] = v; }
}
function coinLabel(k) { const c = COINS.find((x) => x[0] === k); return c ? c[1] : 'зм'; }
function walletText(s) {
  const parts = COINS.map(([k, short]) => [coinGet(s, k), short]).filter(([n]) => n > 0).map(([n, short]) => `${n} ${short}`);
  return parts.length ? parts.join(' · ') : '0 зм';
}
function walletForm(s) {
  openForm({
    title: 'Кошелёк',
    fields: COINS.map(([k, short, full]) => ({ key: k, label: `${full}, ${short}`, numeric: true, value: coinGet(s, k), fallback: coinGet(s, k) })),
    onSave: (v) => { for (const [k] of COINS) coinSet(s, k, v[k]); changed(); },
  });
}
// Пять полей для монет сразу (для ведущего): можно заполнить один вид или несколько
function coinInputs(prefix) {
  const inputs = {};
  const node = el('div', { class: 'grid2' }, COINS.map(([k, short, full]) => {
    const input = el('input', { id: prefix + k, type: 'text', inputmode: 'numeric', placeholder: '0', autocomplete: 'off' });
    inputs[k] = input;
    return el('div', { class: 'field' }, el('label', { for: prefix + k }, `${full}, ${short}`), input);
  }));
  return {
    node,
    // { gp: 5, sp: 3 } — только виды, где вписано больше нуля
    read() {
      const out = {};
      for (const [k] of COINS) { const n = Math.max(0, toInt(inputs[k].value, 0)); if (n > 0) out[k] = n; }
      return out;
    },
  };
}
function coinsText(obj) {
  const parts = COINS.filter(([k]) => toInt(obj && obj[k], 0) > 0).map(([k, short]) => `${toInt(obj[k], 0)} ${short}`);
  return parts.join(' · ');
}

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
      const en = (line.match(/\[([^\]]+)\]\s*$/) || [])[1] || '';
      spells.push({ name: line.replace(/\s*\[[^\]]*\]\s*$/, '').trim() || line, level: l, en });
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
    coins: {
      cp: Math.max(0, toInt(d.coins && d.coins.cp && d.coins.cp.value, 0)),
      sp: Math.max(0, toInt(d.coins && d.coins.sp && d.coins.sp.value, 0)),
      ep: Math.max(0, toInt(d.coins && d.coins.ep && d.coins.ep.value, 0)),
      pp: Math.max(0, toInt(d.coins && d.coins.pp && d.coins.pp.value, 0)),
    },
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
      el('h1', { class: 'small' }, 'Новый персонаж'),
      el('p', { class: 'muted' }, 'Три способа: загрузить файл из CharBox, создать здесь по шагам или переписать готового с листа.')),
    el('div', { class: 'card' },
      el('div', { class: 'title' }, 'Персонаж собран в CharBox'),
      el('p', { class: 'muted' }, '1. Откройте персонажа на dnd24.charbox.org.'),
      el('p', { class: 'muted' }, '2. Нажмите экспорт и выберите LSS.'),
      el('p', { class: 'muted' }, '3. Файл с окончанием lss_export.json сохранится в телефоне.')),
    input,
    el('label', { for: 'lssfile', class: 'btn' }, 'Выбрать файл LSS'),
    err.node,
    el('div', { class: 'card' },
      el('div', { class: 'title' }, 'Нет персонажа?'),
      el('p', { class: 'muted' }, 'Создайте его здесь по шагам: класс, предыстория, вид, характеристики, навыки и снаряжение. Сайт сам посчитает хиты, защиту и остальное по правилам 2024 года.'),
      el('button', { class: 'btn', type: 'button', onclick: () => showCreate(profile) }, 'Создать персонажа по шагам')),
    el('div', { class: 'card' },
      el('div', { class: 'title' }, 'Персонаж уже есть на бумаге или в PDF?'),
      el('p', { class: 'muted' }, 'Перепишите с листа основное одной формой. Сайт ничего не считает и не проверяет: что впишете, то и будет. Остальное допишете в листе.'),
      el('button', { class: 'btn outline', type: 'button', onclick: () => showManual(profile) }, 'Внести готового персонажа вручную')),
    el('button', { class: 'btn outline spacer', type: 'button', onclick: () => route() }, 'Назад'));
}

// Список навыков для персонажа, созданного вручную
const DEFAULT_SKILLS = [
  ['Акробатика', 'dex'], ['Анализ', 'int'], ['Аркана', 'int'], ['Атлетика', 'str'], ['Внимательность', 'wis'], ['Выживание', 'wis'],
  ['Выступление', 'cha'], ['Запугивание', 'cha'], ['История', 'int'], ['Ловкость рук', 'dex'], ['Медицина', 'wis'], ['Обман', 'cha'],
  ['Природа', 'int'], ['Проницательность', 'wis'], ['Религия', 'int'], ['Скрытность', 'dex'], ['Убеждение', 'cha'], ['Уход за животными', 'wis'],
];

function showManual(profile) {
  const err = errorBox();
  const f = (id, label, placeholder, numeric, value, hint) => {
    const input = el('input', { id, type: 'text', inputmode: numeric ? 'numeric' : null, placeholder, autocomplete: 'off' });
    if (value !== undefined) input.value = String(value);
    return { input, node: el('div', { class: 'field' }, el('label', { for: id }, label), input, hint ? el('p', { class: 'muted small' }, hint) : null) };
  };
  const name = f('mn', 'Имя персонажа', 'Как зовут персонажа', false);
  const cls = f('mc', 'Класс', 'Например: Воин', false, undefined, 'Пишите как в правилах: Бард, Колдун, Жрец. По названию сайт подберёт умения, заклинания и подсказки.');
  const species = f('ms', 'Вид', 'Например: Человек', false, undefined, 'Кто персонаж по рождению: человек, эльф, дварф.');
  const level = f('ml', 'Уровень', '1', true, 1, 'От 1 до 20. От уровня зависят умения и ячейки.');
  const hp = f('mh', 'Хиты (максимум)', '10', true, undefined, 'Сколько урона выдерживает персонаж. Число с листа.');
  const ac = f('ma', 'КД', '10', true, 10, 'Класс доспеха: во столько надо попасть, чтобы ранить персонажа.');
  const speed = f('mv', 'Скорость, фт', '30', true, 30, 'Сколько футов проходит за ход. Обычно 30.');
  const stats = STAT_KEYS.map((k) => Object.assign(f('mst' + k, STAT_FULL[k], '10', true, 10), { k }));

  const save = el('button', { class: 'btn', type: 'button' }, 'Создать персонажа');
  save.addEventListener('click', async () => {
    err.set('');
    const nm = name.input.value.trim();
    if (nm.length < 2) return err.set('Впишите имя персонажа.');
    const lvl = clamp(toInt(level.input.value, 1), 1, 20);
    const hpMax = Math.max(1, toInt(hp.input.value, 0));
    if (!toInt(hp.input.value, 0)) return err.set('Впишите хиты персонажа.');
    const st = {};
    for (const x of stats) st[x.k] = clamp(toInt(x.input.value, 10), 1, 30);
    const prof = 2 + Math.floor((lvl - 1) / 4);
    const s = {
      v: 1, name: nm.slice(0, 80), cls: cls.input.value.trim(), species: species.input.value.trim(),
      background: '', alignment: '', level: lvl, xp: 0, portrait: '',
      hp: { cur: hpMax, max: hpMax, temp: 0 }, ac: toInt(ac.input.value, 10), speed: Math.max(0, toInt(speed.input.value, 30)),
      hitDie: '', prof, stats: st,
      saves: { str: false, dex: false, con: false, int: false, wis: false, cha: false },
      skills: DEFAULT_SKILLS.map(([label, stat]) => ({ label, stat, prof: 0 })),
      weapons: [], gold: 0, coins: {}, items: [],
      spell: { dc: 8 + prof, atk: prof, slots: [] }, spells: [], features: [], profText: '',
    };
    await busy(save, 'Создаём…', async () => {
      const { data, error } = await sb.from('characters').insert({
        owner_id: profile.id, name: s.name, class_name: s.cls, species: s.species, level: s.level, sheet: s,
      }).select('id').single();
      if (error || !data) return err.set('Не получилось создать персонажа. Попробуйте ещё раз.');
      await openCharacter(profile, data.id, 'main');
    });
  });

  show(false,
    el('div', { class: 'head' },
      el('h1', { class: 'small' }, 'Персонаж вручную'),
      el('p', { class: 'muted' }, 'Эта форма для персонажа, который уже создан на бумаге или в PDF. Впишите основное с листа; владения, оружие, вещи, заклинания и умения добавите потом в самом листе. Если персонажа ещё нет, вернитесь назад и создайте его по шагам.')),
    el('div', { class: 'card' }, name.node, cls.node, species.node,
      el('div', { class: 'grid2' }, level.node, hp.node), el('div', { class: 'grid2' }, ac.node, speed.node)),
    el('div', { class: 'card' }, el('div', { class: 'title' }, 'Характеристики'), el('p', { class: 'muted' }, 'Сила, Ловкость и остальные: от них считаются все броски. Вписывайте само значение (например 16), а не модификатор (+3).'),
      el('div', { class: 'grid2' }, stats.map((x) => x.node))),
    err.node, save,
    el('button', { class: 'btn outline', type: 'button', onclick: () => showUpload(profile) }, 'Назад'));
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
      line('Монеты', walletText(s))),
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
  const { data, error } = await sb.from('characters').select('id, owner_id, sheet, rev').eq('id', id).maybeSingle();
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
  s.coins = s.coins || {};
  CH = { profile, id: data.id, own: data.owner_id === profile.id, sheet: s, tab: tab || 'main', open: new Set(), saveState: 'saved', timer: null, badge: null, back: back || null, group: undefined, notices: [], checking: false, stamp: data.rev, base: JSON.stringify(s) };
  const opened = CH;
  renderChar();
  if (opened.own) {
    checkGifts(opened);
    // раз в 15 секунд смотрим, не выдал ли что-нибудь ведущий
    const timer = setInterval(() => {
      if (CH !== opened) return clearInterval(timer);
      if (document.visibilityState === 'visible') checkGifts(opened);
    }, 15000);
  }
}

function badgeText(state) {
  return state === 'saving' ? 'Сохраняем…' : state === 'error' ? 'Не сохранилось. Проверьте интернет' : 'Сохранено';
}

// Слияние листов: base — каким лист был при последней сверке, mine — мой, theirs — свежий с сервера.
// Что менял я — остаётся моим; что я не трогал — берётся с сервера. Списки сравниваются целиком.
function mergeSheet(base, mine, theirs) {
  const plain = (x) => x && typeof x === 'object' && !Array.isArray(x);
  if (plain(mine) && plain(theirs)) {
    const b = plain(base) ? base : {};
    const out = {};
    for (const k of new Set([...Object.keys(mine), ...Object.keys(theirs)])) {
      const inMine = k in mine, inTheirs = k in theirs;
      if (inMine && inTheirs) out[k] = mergeSheet(b[k], mine[k], theirs[k]);
      else if (inMine) { if (!(k in b) || JSON.stringify(mine[k]) !== JSON.stringify(b[k])) out[k] = mine[k]; }
      else if (!(k in b)) out[k] = theirs[k];
    }
    return out;
  }
  return JSON.stringify(mine) !== JSON.stringify(base) ? mine : theirs;
}

async function saveNow() {
  const c = CH;
  if (!c) return;
  clearTimeout(c.timer);
  c.timer = null;
  const s = c.sheet;
  let failed = false;
  for (let attempt = 0; attempt < 3; attempt++) {
    const sent = JSON.stringify(s);
    const { data, error } = await sb.from('characters')
      .update({ sheet: s, name: s.name, class_name: s.cls, species: s.species, level: s.level })
      .eq('id', c.id).eq('rev', c.stamp).select('id, rev');
    if (error) { failed = true; break; }
    if (data && data.length) { c.stamp = data[0].rev; c.base = sent; failed = false; break; }
    // лист на сервере изменил кто-то другой — берём свежий и вносим в него свои правки
    failed = true;
    const fresh = await sb.from('characters').select('sheet, rev').eq('id', c.id).maybeSingle();
    if (fresh.error || !fresh.data || !fresh.data.sheet) break;
    let base = {};
    try { base = JSON.parse(c.base); } catch (e) { base = {}; }
    const merged = mergeSheet(base, JSON.parse(JSON.stringify(s)), fresh.data.sheet);
    Object.keys(s).forEach((k) => delete s[k]);
    Object.assign(s, merged);
    c.stamp = fresh.data.rev;
    c.base = JSON.stringify(fresh.data.sheet);
    if (CH === c && !document.querySelector('.modal')) renderChar();
  }
  if (c.timer) return; // пока сохраняли, появились новые правки — их сохранит следующий запуск
  c.saveState = failed ? 'error' : 'saved';
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

// «Мастерство» оружия работает только у классов с умением «Оружейное мастерство» — остальным его не показываем
function weaponNote(s, w) {
  const note = w.note || '';
  if (/варвар|воин|паладин|следопыт|плут/i.test(s.cls || '')) return note;
  return note.replace(/\s*(·\s*)?мастерство:.*$/i, '').trim();
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
  const header = el('div', { class: 'cheadwrap' },
    el('div', { class: 'chead' },
      portrait,
      el('div', { class: 'grow' }, el('h1', { class: 'small' }, s.name)),
      el('div', { class: 'chip' }, `${s.level} ур.`)),
    el('p', { class: 'muted' }, [s.cls, s.species].filter(Boolean).join(' · ')));

  let body = [];
  if (c.tab === 'main') body = tabMain(s, ro, editBtn);
  else if (c.tab === 'items') body = tabItems(s, ro, editBtn);
  else if (c.tab === 'magic') body = tabMagic(s, ro, editBtn);
  else body = tabGroup(c, ro);

  const tab = (key, label) => el('button', { type: 'button', 'aria-current': c.tab === key ? 'page' : null, onclick: () => {
    // чужой персонаж: вкладка «Группа» уводит из листа — ведущего к списку его групп, игрока обратно в группу
    if (key === 'group' && ro) {
      const goBack = c.profile.role === 'master' ? null : c.back;
      CH = null;
      if (goBack) goBack(); else route();
      return;
    }
    c.tab = key; renderChar(); window.scrollTo(0, 0);
  } }, label);
  const notices = c.notices.map((n) => el('div', { class: 'card notice' },
    el('div', { class: 'title' }, n.own ? 'Добавлено' : 'Ведущий выдал'),
    el('p', {}, n.title),
    n.sub ? el('p', { class: 'muted small' }, n.sub) : null,
    el('button', { class: 'mini wide', type: 'button', onclick: () => { c.notices.splice(c.notices.indexOf(n), 1); renderChar(); } }, 'Понятно')));

  const nav = el('nav', { class: 'tabs', 'aria-label': 'Разделы' }, tab('main', 'Персонаж'), tab('items', 'Вещи'), tab('magic', 'Магия'), tab('group', 'Группа'));

  app.className = 'screen withtabs';
  app.replaceChildren(top, header, ...notices, ...body.flat(Infinity).filter(Boolean), nav);
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
    hp.temp > 0 ? el('p', { class: 'muted center' }, `Временные хиты: ${hp.temp}`) : null,
    (() => {
      // Подсказка: сколько хитов положено классу на этом уровне
      const cls = s.cls || '';
      const die = /варвар/i.test(cls) ? 12 : /воин|боец|паладин|следопыт|рейнджер/i.test(cls) ? 10 : /чародей|волшебник/i.test(cls) ? 6
        : /бард|жрец|клирик|друид|монах|плут|разбойник|колдун/i.test(cls) ? 8 : toInt(String(s.hitDie || '').replace(/\D/g, ''), 0);
      if (ro || !die) return null;
      const con = modOf(s.stats.con), n = Math.min(20, Math.max(1, toInt(s.level, 1)));
      const at = (per) => Math.max(1, die + con) + (n - 1) * Math.max(1, per + con);
      const avg = at(die / 2 + 1), lo = at(1), hi = at(die);
      const text = n === 1 ? `По правилам на 1 уровне: ${avg} (кость к${die}, Телосложение ${signed(con)}).`
        : `По правилам на ${n} уровне: ${avg}, если брать среднее (+${die / 2 + 1} за уровень); от ${lo} до ${hi}, если бросать к${die}. Телосложение ${signed(con)}.`;
      return [el('p', { class: 'muted small' }, text),
        hp.max < lo || (n === 1 && hp.max !== avg) ? el('p', { class: 'small warn' }, `Сейчас максимум ${hp.max} — это меньше, чем может быть на этом уровне. Проверьте.`) : null,
        hp.max !== avg ? el('button', { class: 'mini wide', type: 'button', onclick: () => { const d = avg - hp.max; hp.max = avg; hp.cur = clamp(hp.cur + Math.max(0, d), 0, avg); changed(); } }, `Поставить среднее: ${avg}`) : null];
    })());

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
  const wallet = el('div', { class: 'card tight' },
    el('div', { class: 'label' }, 'Монеты'),
    el('div', { class: 'coincol' }, (() => {
      const have = COINS.map(([k, short]) => [coinGet(s, k), short]).filter(([n]) => n > 0);
      return (have.length ? have : [[0, 'зм']]).map(([n, short]) => el('div', { class: 'nowrap' }, `${n} ${short}`));
    })()),
    ro ? null : el('button', { class: 'mini wide', type: 'button', onclick: () => walletForm(s) }, 'Изменить'));
  const row2 = el('div', { class: 'grid2' }, numCard('Опыт', String(s.xp), 'Опыт', 'xp'), wallet);

  const statsGrid = el('div', { class: 'grid3' }, STAT_KEYS.map((k) => el('div', { class: 'tile' },
    el('div', { class: 'label' }, STAT_SHORT[k]),
    el('div', { class: 'tval big2' }, signed(modOf(s.stats[k]))),
    el('div', { class: 'muted small' }, String(s.stats[k])))));

  // в режиме правки строка становится кнопкой: нажатие меняет владение
  const editing = !ro && CH.editProf;
  const mark = (p) => (p >= 2 ? '●● ' : p >= 1 ? '● ' : '○ ');
  const listRow = (p, label, value, onTap) => (editing
    ? el('button', { class: 'lrow tap', type: 'button', onclick: onTap }, el('span', {}, mark(p) + label), el('strong', {}, value))
    : el('div', { class: 'lrow' }, el('span', {}, mark(p) + label), el('strong', {}, value)));
  const profToggleBtn = () => (ro ? null : el('button', { class: editing ? 'mini solid' : 'mini', type: 'button', onclick: () => { CH.editProf = !CH.editProf; renderChar(); } }, editing ? 'Готово' : 'Изменить'));
  const profToggle = profToggleBtn();
  const saves = el('div', { class: 'card' }, el('div', { class: 'cardhead' }, el('div', { class: 'title' }, 'Спасброски'), profToggle),
    editing ? el('p', { class: 'muted small' }, 'Нажмите на строку, чтобы поставить или снять владение.') : null,
    STAT_KEYS.map((k) => listRow(s.saves[k] ? 1 : 0, STAT_FULL[k], signed(modOf(s.stats[k]) + (s.saves[k] ? s.prof : 0)), () => { s.saves[k] = !s.saves[k]; changed(); })),
    el('p', { class: 'muted small' }, `● — владение. Бонус мастерства ${signed(s.prof)}`));
  const skills = el('div', { class: 'card' }, el('div', { class: 'cardhead' }, el('div', { class: 'title' }, 'Навыки'), profToggleBtn()),
    editing ? el('p', { class: 'muted small' }, 'Нажатие по кругу: нет владения → владение (●) → экспертиза (●●).') : null,
    s.skills.map((sk) => listRow(sk.prof || 0, `${sk.label} (${STAT_SHORT[sk.stat]})`, signed(skillBonus(s, sk)), () => { sk.prof = ((sk.prof || 0) + 1) % 3; changed(); })));

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
      el('div', { class: 'grow' }, el('div', { class: 'title' }, w.name), el('p', { class: 'muted' }, `Атака ${signed(w.bonus)}${w.dmg ? ' · урон ' + w.dmg : ''}`),
        weaponNote(s, w) ? el('p', { class: 'muted small' }, weaponNote(s, w)) : null),
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
      { key: 'prof', label: 'Бонус мастерства', numeric: true, value: s.prof, fallback: s.prof, hint: 'Меняется сам вместе с уровнем: 1–4 ур. +2, 5–8 +3, 9–12 +4, 13–16 +5, 17–20 +6.' },
    ],
    onSave: (v) => {
      s.name = (v.name || s.name).slice(0, 80); s.cls = v.cls; s.species = v.species;
      const oldLevel = s.level, oldProf = s.prof;
      s.level = clamp(v.level, 1, 20); s.ac = v.ac; s.speed = Math.max(0, v.speed); s.prof = clamp(v.prof, 0, 10);
      if (s.level !== oldLevel && s.prof === oldProf) s.prof = 2 + Math.floor((s.level - 1) / 4);
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
    el('div', { class: 'card' },
      el('div', { class: 'cardhead' }, el('div', { class: 'title' }, 'Кошелёк'), editBtn('Изменить', () => walletForm(s))),
      COINS.map(([k, short, full]) => el('div', { class: 'kv' }, el('span', { class: 'muted' }, full), el('strong', {}, `${coinGet(s, k)} ${short}`)))),
    el('h2', {}, 'Снаряжение'),
    s.items.length ? null : el('p', { class: 'muted' }, 'Предметов пока нет.'),
    s.items.map((it, i) => el('div', { class: 'card rowcard slim' },
      el('div', { class: 'grow' }, it.name, it.note ? (() => {
        const key = 'it:' + i, opened = CH.open.has(key);
        return el('button', { class: 'notebtn' + (opened ? ' open' : ''), type: 'button', 'aria-expanded': String(opened),
          onclick: () => { if (opened) CH.open.delete(key); else CH.open.add(key); renderChar(); } }, opened ? it.note : 'Описание ▾');
      })() : null),
      el('span', { class: 'muted nowrap' }, `${it.qty} шт.`),
      editBtn('Изм.', () => itemForm(it, false)))),
    ro ? null : el('button', { class: 'btn dashed', type: 'button', onclick: () => openGiftModal((r) => {
      for (const g of r.gifts) CH.notices.push(Object.assign(applyGift(s, g), { own: true }));
      changed();
    }, true) }, '+ Добавить из списка'),
    ro ? null : el('button', { class: 'btn dashed', type: 'button', onclick: () => itemForm({ name: '', qty: 1 }, true) }, '+ Вписать предмет вручную'),
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

  // Подсказка: встроенная по правилам 2024 или своя, вписанная игроком
  const hintParts = (kind, obj, key) => {
    const opened = c.open.has(key);
    const h = findHint(kind, obj);
    const btn = el('button', { class: opened ? 'mini solid' : 'mini', type: 'button', 'aria-expanded': String(opened), 'aria-label': opened ? 'Скрыть подсказку' : 'Подсказка',
      onclick: () => { if (opened) c.open.delete(key); else c.open.add(key); renderChar(); } }, 'Инфо');
    let box = null;
    if (opened) {
      if (!h) box = el('div', { class: 'hint' }, el('p', { class: 'muted small' }, ro ? 'Подсказки пока нет.' : 'Встроенной подсказки для этого названия пока нет. Нажмите «Изм.» и впишите свою.'));
      else if (h.own) box = el('div', { class: 'hint' }, h.text.split('\n').map((p) => el('p', { class: 'small' }, p)));
      else box = el('div', { class: 'hint' },
        h.meta ? el('p', { class: 'small meta' }, h.meta) : null,
        el('p', { class: 'small' }, el('strong', {}, 'Что делает. '), h.what),
        el('p', { class: 'small' }, el('strong', {}, 'Когда применять. '), h.when));
    }
    return { btn, box };
  };

  const spellForm = (x, isNew) => openForm({
    title: isNew ? 'Новое заклинание' : 'Заклинание',
    fields: [
      { key: 'name', label: 'Название', value: x.name },
      { key: 'level', label: 'Уровень', numeric: true, value: x.level, hint: '0 — заговор' },
      { key: 'hint', label: 'Своя подсказка (не обязательно)', area: true, value: x.hint || '', hint: 'Если заполнить, она заменит встроенную подсказку.' },
    ],
    onSave: (v) => { x.name = v.name || 'Заклинание'; x.level = clamp(v.level, 0, 9); x.hint = v.hint; if (isNew) s.spells.push(x); changed(); },
    onDelete: isNew ? null : () => { s.spells.splice(s.spells.indexOf(x), 1); changed(); },
  });
  const spellBlocks = [];
  for (let l = 0; l <= 9; l++) {
    const list = s.spells.filter((x) => x.level === l);
    if (!list.length) continue;
    spellBlocks.push(el('h2', {}, l === 0 ? 'Заговоры' : `Заклинания ${l} уровня`));
    for (const x of list) {
      const hp = hintParts('spell', x, 'sp:' + s.spells.indexOf(x));
      spellBlocks.push(el('div', { class: 'card slimcard' },
        el('div', { class: 'cardhead' }, el('div', { class: 'grow' }, x.name, (() => {
          // Пометка, если заклинания нет в списке класса (и его не дал подкласс)
          const code = spellListCode(s);
          const h = SPELL_HINT_INDEX.get(hintKey(x.name)) || (x.en ? SPELL_HINT_INDEX.get(hintKey(x.en)) : null);
          const given = (s.collegeAdded || []).some((n) => hintKey(n) === hintKey(x.name));
          if ((s.extraSpells || []).some((n) => hintKey(n) === hintKey(x.name))) return el('div', { class: 'small muted2 nowrap' }, 'от вида');
          const cdx = classData(s.cls), sub = cdx ? cdx.subs.find((k) => k.key === s.college) : null;
          if (given && sub) return el('div', { class: 'small muted2 nowrap' }, cdx.subNew.replace('Новое ', ''));
          return code && h && h.classes && !h.classes.includes(code) && !given ? el('div', { class: 'small warn' }, 'не из списка класса') : null;
        })()), hp.btn, editBtn('Изм.', () => spellForm(x, false))),
        hp.box));
    }
  }
  if (!s.spells.length) spellBlocks.push(el('h2', {}, 'Заклинания'), el('p', { class: 'muted' }, 'Заклинаний пока нет.'));
  if (!ro) spellBlocks.push(
    el('button', { class: 'btn dashed', type: 'button', onclick: () => openSpellPicker(s) }, '+ Добавить из справочника'),
    el('button', { class: 'btn dashed', type: 'button', onclick: () => spellForm({ name: '', level: 1 }, true) }, '+ Вписать заклинание вручную'));

  const featureForm = (f, isNew) => openForm({
    title: isNew ? 'Новое умение' : 'Умение',
    fields: [
      { key: 'name', label: 'Название', value: f.name },
      { key: 'text', label: 'Описание', area: true, value: f.text },
      { key: 'usesMax', label: 'Сколько раз можно применить', numeric: true, value: f.usesMax || 0, hint: '0 — без счётчика. Счётчик восполняется после долгого отдыха.' },
      { key: 'hint', label: 'Своя подсказка (не обязательно)', area: true, value: f.hint || '', hint: 'Если заполнить, она заменит встроенную подсказку.' },
    ],
    onSave: (v) => {
      f.name = v.name || 'Умение'; f.text = v.text; f.hint = v.hint;
      const max = clamp(v.usesMax, 0, 99);
      f.usesLeft = isNew || max !== f.usesMax ? max : clamp(f.usesLeft, 0, max);
      f.usesMax = max;
      if (isNew) s.features.push(f);
      changed();
    },
    onDelete: isNew ? null : () => { s.features.splice(s.features.indexOf(f), 1); changed(); },
  });
  // Класс: умения по уровням и подкласс (коллегия барда, покровитель колдуна)
  const cd = classData(s.cls);
  const college = cd ? (cd.subs.find((x) => x.key === s.college) || null) : null;
  const hasFeature = (n) => s.features.some((f) => hintKey(f.name) === hintKey(n));
  const hasSpell = (n, en) => s.spells.some((x) => hintKey(x.name) === hintKey(n) || (en && x.en && hintKey(x.en) === hintKey(en)));
  const collegeMissing = (col) => {
    const done = new Set((s.collegeAdded || []).map(hintKey));
    const ft = col.features.filter(([lv, n]) => lv <= s.level && !done.has(hintKey(n)) && !hasFeature(n));
    const spl = col.spells.filter(([lv, n, , en]) => lv <= s.level && !done.has(hintKey(n)) && !hasSpell(n, en));
    return { ft, spl };
  };
  const collegeApply = (col) => {
    const m = collegeMissing(col);
    s.college = col.key;
    s.collegeAdded = s.collegeAdded || [];
    for (const [, n] of m.ft) { s.features.push({ name: n, text: col.name, usesMax: 0, usesLeft: 0 }); s.collegeAdded.push(n); }
    for (const [, n, lvl, en] of m.spl) {
      const h = SPELL_HINT_INDEX.get(hintKey(en));
      const name = h ? h.names[0].charAt(0).toUpperCase() + h.names[0].slice(1) : n;
      s.spells.push({ name, level: h ? h.level : lvl, en });
      s.collegeAdded.push(n); if (name !== n) s.collegeAdded.push(name);
    }
    changed();
  };
  let collegeCard = null;
  if (cd && !ro && s.level >= cd.subLevel && !college) {
    collegeCard = el('div', { class: 'card notice' },
      el('div', { class: 'title' }, cd.subTitle),
      el('p', { class: 'muted' }, cd.subText),
      cd.subs.map((col) => el('button', { class: 'pick', type: 'button', onclick: () => {
        if (window.confirm(col.name + ' — выбрать?')) collegeApply(col);
      } }, el('div', { class: 'title' }, col.name), el('div', { class: 'muted' }, col.about))));
  } else if (cd && !ro && college) {
    const m = collegeMissing(college);
    const names = m.ft.concat(m.spl).map((x) => x[1]);
    collegeCard = names.length
      ? el('div', { class: 'card notice' },
        el('div', { class: 'title' }, cd.subNew),
        el('p', { class: 'muted' }, college.name + ': ' + names.join(', ') + '.'),
        el('button', { class: 'mini solid wide', type: 'button', onclick: () => collegeApply(college) }, 'Добавить в лист'))
      : null;
  }
  const collegeChange = cd && !ro && college ? el('button', { class: 'btn link', type: 'button', onclick: () => {
    if (!window.confirm(college.name + ': убрать добавленные умения и заклинания из листа и выбрать заново?')) return;
    const added = new Set((s.collegeAdded || []).map(hintKey));
    s.features = s.features.filter((f) => !added.has(hintKey(f.name)));
    s.spells = s.spells.filter((x) => !added.has(hintKey(x.name)));
    s.college = ''; s.collegeAdded = [];
    changed();
  } }, 'Сменить ' + cd.subWhat + ' (' + college.name + ')') : null;

  // Умения самого класса, положенные по уровню, которых ещё нет в листе
  let classCard = null;
  if (cd && !ro) {
    const seen = new Set((s.classSeen || []).map(hintKey));
    const miss = cd.features.filter(([lv, n]) => lv <= s.level && !seen.has(hintKey(n)) && !hasFeature(n));
    const mark = () => { s.classSeen = (s.classSeen || []).concat(miss.map((x) => x[1])); };
    if (miss.length) classCard = el('div', { class: 'card notice' },
      el('div', { class: 'title' }, 'Положено по уровню'),
      el('p', { class: 'muted' }, 'Этих умений класса нет в листе: ' + miss.map(([lv, n]) => `${n} (${lv} ур.)`).join(', ') + '.'),
      el('div', { class: 'btnrow' },
        el('button', { class: 'mini solid', type: 'button', onclick: () => {
          for (const [, n] of miss) s.features.push({ name: n, text: '', usesMax: 0, usesLeft: 0 });
          mark(); changed();
        } }, 'Добавить'),
        el('button', { class: 'mini', type: 'button', onclick: () => { mark(); changed(); } }, 'Не нужно')));
  }
  // Ячейки, положенные классу на этом уровне: массив по уровням ячеек или null, если класс не колдует
  const ruleSlots = (() => {
    const n = Math.min(20, Math.max(1, s.level)), cls = s.cls || '';
    if (/колдун/i.test(cls)) { const a = []; a[Math.min(5, Math.ceil(n / 2)) - 1] = n >= 17 ? 4 : n >= 11 ? 3 : n >= 2 ? 2 : 1; return Array.from(a, (x) => x || 0); }
    if (/бард|жрец|клирик|друид|чародей|волшебник/i.test(cls)) return BARD_SLOTS[n - 1];
    if (/паладин|следопыт|рейнджер/i.test(cls)) return HALF_SLOTS[n - 1];
    return null;
  })();
  const slotsDiffer = ruleSlots && [1, 2, 3, 4, 5, 6, 7, 8, 9].some((l) => ((sp.slots.find((x) => x.level === l) || {}).max || 0) !== (ruleSlots[l - 1] || 0));
  const ruleLine = cd ? [
    el('p', { class: 'muted small' }, `По правилам на ${s.level} уровне: ${cd.rule(s.level)}.`),
    spellCountText(s) ? el('p', { class: 'muted small' }, 'Сейчас в листе: ' + spellCountText(s) + '.') : null,
    !ro && slotsDiffer ? el('button', { class: 'mini solid wide', type: 'button', onclick: () => {
      sp.slots = ruleSlots.map((max, i) => ({ level: i + 1, max, used: 0 })).filter((x) => x.max > 0);
      changed();
    } }, 'Поставить ячейки по правилам') : null,
  ] : null;

  const features = [
    el('h2', {}, 'Умения'),
    classCard,
    collegeCard,
    s.features.length ? null : el('p', { class: 'muted' }, 'Умений пока нет.'),
    s.features.map((f, i) => {
      const opened = c.open.has(i);
      const hp = hintParts('feature', f, 'ft:' + i);
      return el('div', { class: 'card' },
        el('div', { class: 'title' }, f.name),
        college && (s.collegeAdded || []).some((n) => hintKey(n) === hintKey(f.name)) ? el('div', { class: 'muted2' }, cd.subNew.replace('Новое ', '')) : null,
        el('div', { class: 'btnrow' },
          hp.btn,
          f.text ? el('button', { class: opened ? 'mini solid' : 'mini', type: 'button', 'aria-expanded': String(opened), onclick: () => { if (opened) c.open.delete(i); else c.open.add(i); renderChar(); } }, 'Описание') : null,
          editBtn('Изм.', () => featureForm(f, false))),
        hp.box,
        f.usesMax > 0 ? el('div', { class: 'cardhead' },
          el('p', { class: 'muted' }, `Осталось ${f.usesLeft} из ${f.usesMax}`),
          ro ? null : el('button', { class: 'mini solid', type: 'button', disabled: f.usesLeft <= 0, onclick: () => { f.usesLeft = Math.max(0, f.usesLeft - 1); changed(); } }, 'Применить')) : null,
        opened ? f.text.split('\n').map((t) => el('p', { class: 'muted' }, t)) : null);
    }),
    ro ? null : el('button', { class: 'btn dashed', type: 'button', onclick: () => featureForm({ name: '', text: '', usesMax: 0, usesLeft: 0 }, true) }, '+ Добавить умение'),
    collegeChange,
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

  return [head, ruleLine, slots.length ? slots : el('p', { class: 'muted' }, 'Ячеек заклинаний нет.'), spellBlocks, features, rests,
    el('p', { class: 'muted small' }, 'Подсказки краткие и написаны по правилам 2024 года. Точный текст заклинания смотрите в книге правил.')];
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

// ---------- сколько заклинаний положено по правилам ----------

// Возвращает { spell, cantrip, maxLv } или null, если класс не колдует. null внутри — без ограничения.
function spellLimits(s) {
  const n = Math.min(20, Math.max(1, toInt(s.level, 1))), cls = s.cls || '', i = n - 1;
  const step = (a, b, c) => (n >= 10 ? c : n >= 4 ? b : a);
  if (/колдун/i.test(cls)) return { spell: WARLOCK_PREP[i], cantrip: step(2, 3, 4), maxLv: Math.min(5, Math.ceil(n / 2)) };
  if (/бард/i.test(cls)) return { spell: BARD_PREP[i], cantrip: step(2, 3, 4), maxLv: BARD_SLOTS[i].length };
  if (/жрец|клирик/i.test(cls)) return { spell: BARD_PREP[i], cantrip: step(3, 4, 5), maxLv: BARD_SLOTS[i].length };
  if (/друид/i.test(cls)) return { spell: BARD_PREP[i], cantrip: step(2, 3, 4), maxLv: BARD_SLOTS[i].length };
  if (/чародей/i.test(cls)) return { spell: SORC_PREP[i], cantrip: step(4, 5, 6), maxLv: BARD_SLOTS[i].length };
  if (/волшебник/i.test(cls)) return { spell: null, cantrip: step(3, 4, 5), maxLv: BARD_SLOTS[i].length };
  if (/паладин/i.test(cls)) return { spell: HALF_PREP_PAL[i], cantrip: null, maxLv: HALF_SLOTS[i].length };
  if (/следопыт|рейнджер/i.test(cls)) return { spell: HALF_PREP_RNG[i], cantrip: null, maxLv: HALF_SLOTS[i].length };
  return null;
}
// Свои заклинания — без тех, что дал подкласс (они в счёт не идут)
function ownSpells(s, cantrips) {
  const given = new Set((s.collegeAdded || []).concat(s.extraSpells || []).map(hintKey));
  return s.spells.filter((x) => (cantrips ? x.level === 0 : x.level > 0) && !given.has(hintKey(x.name)));
}
function spellCountText(s) {
  const lim = spellLimits(s);
  if (!lim) return '';
  const part = (label, have, max) => (max == null ? '' : `${label} ${have} из ${max}`);
  return [part('своих заклинаний', ownSpells(s, false).length, lim.spell), part('заговоров', ownSpells(s, true).length, lim.cantrip)].filter(Boolean).join(' · ');
}

// ---------- выбор заклинания из справочника ----------

function openSpellPicker(s) {
  const back = el('div', { class: 'modal-back' });
  const close = () => { back.remove(); renderChar(); };
  const cap = (t) => t.charAt(0).toUpperCase() + t.slice(1);
  const has = (h) => s.spells.some((x) => h.names.some((n) => hintKey(n) === hintKey(x.name)) || (x.en && hintKey(x.en) === hintKey(h.en)));
  let level = -1;
  const code = spellListCode(s);
  let onlyMine = !!code;
  let pending = null; // заклинание, которое не помещается в положенное число
  const lim = spellLimits(s);
  const add = (h, instead) => {
    if (instead) s.spells.splice(s.spells.indexOf(instead), 1);
    s.spells.push({ name: cap(h.names[0]), level: h.level, en: h.en });
    pending = null;
    changed();
    status.textContent = (instead ? `Заменено: ${instead.name} → ` : 'Добавлено: ') + cap(h.names[0]);
    draw();
  };
  const counter = el('p', { class: 'muted small' });
  const scope = el('div', { class: 'choice' });
  const search = el('input', { id: 'spq', type: 'text', placeholder: 'Например: огненный, лечение', autocomplete: 'off' });
  const results = el('div', { class: 'results' });
  const status = el('p', { class: 'muted small' }, 'Нажмите на заклинание, чтобы добавить его в лист.');
  const chips = el('div', { class: 'chips' });
  const draw = () => {
    const maxLv = lim ? lim.maxLv : 9;
    chips.hidden = !!pending; search.hidden = !!pending; scope.hidden = !!pending || !code;
    scope.replaceChildren(
      el('button', { type: 'button', 'aria-pressed': String(onlyMine), onclick: () => { onlyMine = true; draw(); } }, 'Мой класс'),
      el('button', { type: 'button', 'aria-pressed': String(!onlyMine), onclick: () => { onlyMine = false; draw(); } }, 'Все классы'));
    chips.replaceChildren(...[-1, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9].filter((n) => n <= maxLv).map((n) => el('button', { class: 'chipbtn', type: 'button', 'aria-pressed': String(level === n),
      onclick: () => { level = n; draw(); } }, n < 0 ? 'Все уровни' : n === 0 ? 'Заговоры' : n + ' ур.')));
    const ct = spellCountText(s);
    counter.textContent = ct ? 'По правилам: ' + ct + '.' : '';
    if (pending) {
      const isC = pending.level === 0, mineList = ownSpells(s, isC);
      results.replaceChildren(
        el('p', {}, `${isC ? 'Заговоров' : 'Своих заклинаний'} уже ${mineList.length} из ${isC ? lim.cantrip : lim.spell}. Чтобы взять «${cap(pending.names[0])}», замените одно из своих:`),
        ...mineList.map((x) => el('button', { class: 'pick', type: 'button', onclick: () => add(pending, x) },
          el('span', { class: 'title' }, 'Заменить: ' + x.name), el('span', { class: 'muted' }, x.level === 0 ? 'Заговор' : x.level + ' ур.'))),
        el('button', { class: 'mini wide', type: 'button', onclick: () => add(pending) }, 'Добавить сверх счёта'),
        el('p', { class: 'muted small' }, 'Сверх счёта — только если заклинание дала черта, вид или предмет.'),
        el('button', { class: 'btn link', type: 'button', onclick: () => { pending = null; draw(); } }, 'Отмена'));
      return;
    }
    const q = hintKey(search.value);
    const list = SPELL_HINTS.filter((h) => (level < 0 ? h.level <= maxLv : h.level === level) && (!onlyMine || (h.classes || '').includes(code)) && (!q || h.names.some((n) => hintKey(n).includes(q))));
    results.replaceChildren(...(list.length ? list.slice(0, 60).map((h) => {
      const mine = has(h);
      return el('button', { class: 'pick', type: 'button', disabled: mine, onclick: () => {
        const isC = h.level === 0, max = lim ? (isC ? lim.cantrip : lim.spell) : null;
        if (lim && h.level > lim.maxLv) { status.textContent = `${cap(h.names[0])} — ${h.level} уровня, а у вас пока ячейки только до ${lim.maxLv} уровня.`; return; }
        if (max != null && ownSpells(s, isC).length >= max) { pending = h; draw(); return; }
        add(h);
      } },
        el('span', { class: 'title' }, cap(h.names[0]) + (mine ? ' — уже в листе' : '')),
        el('span', { class: 'muted' }, (h.level === 0 ? 'Заговор' : h.level + ' ур.') + ' · ' + h.meta),
        el('span', { class: 'muted small' }, h.what));
    }) : [el('p', { class: 'muted' }, 'Ничего не нашлось. Попробуйте другое слово или впишите заклинание вручную.')]));
    if (list.length > 60) results.append(el('p', { class: 'muted small' }, `Показаны первые 60 из ${list.length}. Уточните поиск или выберите уровень.`));
  };
  search.addEventListener('input', draw);
  draw();
  search.setAttribute('aria-label', 'Поиск по названию');
  search.placeholder = 'Поиск: огненный, лечение';
  const box = el('div', { class: 'modal stack full fixed' },
    el('div', { class: 'cardhead' }, el('div', { class: 'title' }, 'Справочник заклинаний'),
      el('button', { class: 'mini solid', type: 'button', onclick: close }, 'Готово')),
    search, scope, chips, counter, results, status);
  back.addEventListener('click', (e) => { if (e.target === back) close(); });
  back.append(box);
  document.body.append(back);
}

// ---------- выданное ведущим ----------

function addItem(s, name, qty, note) {
  const same = s.items.find((x) => x.name.toLowerCase() === String(name).toLowerCase());
  if (same) { same.qty = (toInt(same.qty, 1)) + qty; if (note && !same.note) same.note = note; }
  else s.items.push(note ? { name, qty, note } : { name, qty });
}

// Записать один подарок в лист и вернуть текст сообщения для игрока
function applyGift(s, g) {
  if (g.kind === 'gold') {
    const k = COINS.some((x) => x[0] === g.coin) ? g.coin : 'gp';
    coinSet(s, k, coinGet(s, k) + toInt(g.gold, 0));
    return { title: `Монеты: +${g.gold} ${coinLabel(k)}`, sub: '' };
  }
  const qty = Math.max(1, toInt(g.qty, 1));
  const count = qty > 1 ? `, ${qty} шт.` : '';
  if (g.kind === 'weapon') {
    const ab = g.ability === 'dex' ? 'dex' : g.ability === 'str' ? 'str' : (modOf(s.stats.dex) > modOf(s.stats.str) ? 'dex' : 'str');
    const bonus = modOf(s.stats[ab]) + (toInt(s.prof, 0));
    s.weapons.push({ name: g.name, bonus, dmg: g.dmg || '', note: [g.props, g.descr].filter(Boolean).join('. ') });
    addItem(s, g.name, qty, '');
    return { title: `${g.name}${count} — добавлено в «Оружие» и «Вещи»`, sub: `Атака ${signed(bonus)}${g.dmg ? ' · урон ' + g.dmg : ''}. Бонус атаки сайт посчитал сам, поправьте, если нужно.` };
  }
  addItem(s, g.name, qty, g.descr || '');
  return { title: `${g.name}${count} — добавлено в «Вещи»`, sub: g.descr || '' };
}

// Забрать у сервера выданное, записать в лист, сохранить и только потом отметить как полученное
async function checkGifts(c) {
  if (!c || CH !== c || !c.own || c.checking) return;
  c.checking = true;
  try {
    const { data, error } = await sb.rpc('my_gifts', { p_character: c.id });
    if (error || !data || !data.length || CH !== c) return;
    const s = c.sheet;
    s.giftsApplied = Array.isArray(s.giftsApplied) ? s.giftsApplied : [];
    const fresh = data.filter((g) => !s.giftsApplied.includes(g.id));
    for (const g of fresh) {
      c.notices.push(applyGift(s, g));
      s.giftsApplied.push(g.id);
    }
    if (s.giftsApplied.length > 200) s.giftsApplied = s.giftsApplied.slice(-200);
    if (fresh.length) changed();
    if (c.timer) await saveNow();
    if (c.saveState === 'saved') await sb.rpc('ack_gifts', { p_ids: data.map((g) => g.id) });
  } finally {
    c.checking = false;
  }
}
