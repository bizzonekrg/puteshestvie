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
    el('div', { class: 'card' },
      el('div', { class: 'title' }, 'Нет файла LSS?'),
      el('p', { class: 'muted' }, 'Персонажа можно внести вручную, например по листу PDF: сначала основное, остальное допишете в листе.'),
      el('button', { class: 'btn outline', type: 'button', onclick: () => showManual(profile) }, 'Внести персонажа вручную')),
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
  const f = (id, label, placeholder, numeric, value) => {
    const input = el('input', { id, type: 'text', inputmode: numeric ? 'numeric' : null, placeholder, autocomplete: 'off' });
    if (value !== undefined) input.value = String(value);
    return { input, node: el('div', { class: 'field' }, el('label', { for: id }, label), input) };
  };
  const name = f('mn', 'Имя персонажа', 'Как зовут персонажа', false);
  const cls = f('mc', 'Класс', 'Например: Воин', false);
  const species = f('ms', 'Вид', 'Например: Человек', false);
  const level = f('ml', 'Уровень', '1', true, 1);
  const hp = f('mh', 'Хиты (максимум)', '10', true);
  const ac = f('ma', 'КД', '10', true, 10);
  const speed = f('mv', 'Скорость, фт', '30', true, 30);
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
      el('p', { class: 'muted' }, 'Впишите основное с листа. Владения, оружие, вещи, заклинания и умения добавите потом в самом листе.')),
    el('div', { class: 'card' }, name.node, cls.node, species.node,
      el('div', { class: 'grid2' }, level.node, hp.node), el('div', { class: 'grid2' }, ac.node, speed.node)),
    el('div', { class: 'card' }, el('div', { class: 'title' }, 'Характеристики'), el('p', { class: 'muted' }, 'Вписывайте само значение (например 16), а не модификатор.'),
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
  s.coins = s.coins || {};
  CH = { profile, id: data.id, own: data.owner_id === profile.id, sheet: s, tab: tab || 'main', open: new Set(), saveState: 'saved', timer: null, badge: null, back: back || null, group: undefined, notices: [], checking: false };
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
    el('div', { class: 'title' }, 'Ведущий выдал'),
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
  const profToggle = ro ? null : el('button', { class: 'mini', type: 'button', onclick: () => { CH.editProf = !CH.editProf; renderChar(); } }, editing ? 'Готово' : 'Изменить');
  const saves = el('div', { class: 'card' }, el('div', { class: 'cardhead' }, el('div', { class: 'title' }, 'Спасброски'), profToggle),
    editing ? el('p', { class: 'muted small' }, 'Нажмите на строку, чтобы поставить или снять владение.') : null,
    STAT_KEYS.map((k) => listRow(s.saves[k] ? 1 : 0, STAT_FULL[k], signed(modOf(s.stats[k]) + (s.saves[k] ? s.prof : 0)), () => { s.saves[k] = !s.saves[k]; changed(); })),
    el('p', { class: 'muted small' }, `● — владение. Бонус мастерства ${signed(s.prof)}`));
  const skills = el('div', { class: 'card' }, el('div', { class: 'title' }, 'Навыки'),
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
        w.note ? el('p', { class: 'muted small' }, w.note) : null),
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
    el('div', { class: 'card' },
      el('div', { class: 'cardhead' }, el('div', { class: 'title' }, 'Кошелёк'), editBtn('Изменить', () => walletForm(s))),
      COINS.map(([k, short, full]) => el('div', { class: 'kv' }, el('span', { class: 'muted' }, full), el('strong', {}, `${coinGet(s, k)} ${short}`)))),
    el('h2', {}, 'Снаряжение'),
    s.items.length ? null : el('p', { class: 'muted' }, 'Предметов пока нет.'),
    s.items.map((it) => el('div', { class: 'card rowcard slim' },
      el('div', { class: 'grow' }, it.name, it.note ? el('p', { class: 'muted small' }, it.note) : null),
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
        el('div', { class: 'cardhead' }, el('div', { class: 'grow' }, x.name), hp.btn, editBtn('Изм.', () => spellForm(x, false))),
        hp.box));
    }
  }
  if (!s.spells.length) spellBlocks.push(el('h2', {}, 'Заклинания'), el('p', { class: 'muted' }, 'Заклинаний пока нет.'));
  if (!ro) spellBlocks.push(el('button', { class: 'btn dashed', type: 'button', onclick: () => spellForm({ name: '', level: 1 }, true) }, '+ Добавить заклинание'));

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
  // Коллегия барда: выбор на 3 уровне, умения добавляются в лист сами
  const isBard = /бард/i.test(s.cls || '');
  const college = COLLEGES.find((x) => x.key === s.college) || null;
  const collegeMissing = (col) => {
    const done = new Set((s.collegeAdded || []).map(hintKey));
    const ft = col.features.filter(([lv, n]) => lv <= s.level && !done.has(hintKey(n)) && !s.features.some((f) => hintKey(f.name) === hintKey(n)));
    const spl = col.spells.filter(([lv, n]) => lv <= s.level && !done.has(hintKey(n)) && !s.spells.some((x) => hintKey(x.name) === hintKey(n)));
    return { ft, spl };
  };
  const collegeApply = (col) => {
    const m = collegeMissing(col);
    s.college = col.key;
    s.collegeAdded = s.collegeAdded || [];
    for (const [, n] of m.ft) { s.features.push({ name: n, text: col.name, usesMax: 0, usesLeft: 0 }); s.collegeAdded.push(n); }
    for (const [, n, lvl, en] of m.spl) { s.spells.push({ name: n, level: lvl, en }); s.collegeAdded.push(n); }
    changed();
  };
  let collegeCard = null;
  if (isBard && !ro && s.level >= 3 && !college) {
    collegeCard = el('div', { class: 'card notice' },
      el('div', { class: 'title' }, 'Выберите коллегию'),
      el('p', { class: 'muted' }, 'На 3 уровне бард выбирает коллегию. Посоветуйтесь с ведущим. Умения коллегии с подсказками добавятся в лист сами.'),
      COLLEGES.map((col) => el('button', { class: 'pick', type: 'button', onclick: () => {
        if (window.confirm(col.name + ' — выбрать?')) collegeApply(col);
      } }, el('div', { class: 'title' }, col.name), el('div', { class: 'muted' }, col.about))));
  } else if (isBard && !ro && college) {
    const m = collegeMissing(college);
    const names = m.ft.concat(m.spl).map((x) => x[1]);
    collegeCard = names.length
      ? el('div', { class: 'card notice' },
        el('div', { class: 'title' }, 'Новое от коллегии'),
        el('p', { class: 'muted' }, college.name + ': ' + names.join(', ') + '.'),
        el('button', { class: 'mini solid wide', type: 'button', onclick: () => collegeApply(college) }, 'Добавить в лист'))
      : null;
  }
  const collegeChange = isBard && !ro && college ? el('button', { class: 'btn link', type: 'button', onclick: () => {
    if (!window.confirm(college.name + ': убрать её умения из листа и выбрать коллегию заново?')) return;
    const added = new Set((s.collegeAdded || []).map(hintKey));
    s.features = s.features.filter((f) => !added.has(hintKey(f.name)));
    s.spells = s.spells.filter((x) => !added.has(hintKey(x.name)));
    s.college = ''; s.collegeAdded = [];
    changed();
  } }, 'Сменить коллегию (' + college.name + ')') : null;

  const features = [
    el('h2', {}, 'Умения'),
    collegeCard,
    s.features.length ? null : el('p', { class: 'muted' }, 'Умений пока нет.'),
    s.features.map((f, i) => {
      const opened = c.open.has(i);
      const hp = hintParts('feature', f, 'ft:' + i);
      return el('div', { class: 'card' },
        el('div', { class: 'title' }, f.name),
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

  return [head, slots.length ? slots : el('p', { class: 'muted' }, 'Ячеек заклинаний нет.'), spellBlocks, features, rests,
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
