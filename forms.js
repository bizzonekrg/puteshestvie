// Превращения в зверя. «Дикий облик» друида — строго по правилам 2024: известные облики, опасность, полёт, применения.
// «Превращение» (заклинание 4 уровня) — для любого персонажа: меняются все параметры, кроме хитов.

const FORM_STATS = ['str', 'dex', 'con', 'int', 'wis', 'cha'];

function parseCr(raw) {
  const t = String(raw === null || raw === undefined ? '' : raw).trim().replace(',', '.');
  const m = /^(\d+)\s*\/\s*(\d+)$/.exec(t);
  if (m) return toInt(m[2], 0) ? toInt(m[1], 0) / toInt(m[2], 1) : 0;
  const n = parseFloat(t);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}
function crLabel(n) { return n === 0.125 ? '1/8' : n === 0.25 ? '1/4' : n === 0.5 ? '1/2' : String(n); }

// Правила дикого облика на этом уровне друида или null
function wildRules(s) {
  if (!/друид/i.test(s.cls || '')) return null;
  const n = Math.min(20, Math.max(1, toInt(s.level, 1)));
  if (n < 2) return null;
  const moon = s.college === 'moon' && n >= 3;
  const base = n >= 8 ? 1 : n >= 4 ? 0.5 : 0.25;
  return {
    level: n, moon,
    known: n >= 8 ? 8 : n >= 4 ? 6 : 4,
    cr: moon ? Math.max(base, Math.floor(n / 3)) : base,
    fly: n >= 8,
    uses: n >= 17 ? 4 : n >= 6 ? 3 : 2,
    hours: Math.floor(n / 2),
    temp: moon ? n * 3 : n,
  };
}
function wildState(s) {
  if (!s.wild || typeof s.wild !== 'object') s.wild = { known: [], custom: [], used: 0 };
  s.wild.known = Array.isArray(s.wild.known) ? s.wild.known : [];
  s.wild.custom = Array.isArray(s.wild.custom) ? s.wild.custom : [];
  s.wild.used = Math.max(0, toInt(s.wild.used, 0));
  return s.wild;
}
function allBeasts(s) { return BEASTS.concat((s.wild && Array.isArray(s.wild.custom)) ? s.wild.custom : []); }
function findBeast(s, name) { const k = hintKey(name); return allBeasts(s).find((b) => hintKey(b.name) === k) || null; }
function beastLine(b) { return `Опасность ${b.crText || crLabel(b.cr)} · КД ${b.ac} · ${b.speed}`; }
// Почему друид пока не может взять этого зверя ('' — может)
function wildBlock(r, b) {
  if (b.cr > r.cr) {
    if (b.cr <= 1) return `опасность ${crLabel(b.cr)} — с ${b.cr <= 0.5 ? 4 : 8} уровня друида`;
    return `опасность ${crLabel(b.cr)} — только Круг луны, с ${Math.ceil(b.cr * 3)} уровня`;
  }
  if (b.fly && !r.fly) return 'летает — с 8 уровня друида';
  return '';
}

function enterForm(s, b, kind) {
  if (s.form) leaveForm(s);
  const r = kind === 'wild' ? wildRules(s) : null;
  s.form = { kind, beast: JSON.parse(JSON.stringify(b)), back: { stats: Object.assign({}, s.stats), ac: s.ac, speed: s.speed } };
  const keys = kind === 'wild' ? ['str', 'dex', 'con'] : FORM_STATS;
  for (const k of keys) s.stats[k] = toInt(b.stats[k], 10);
  s.ac = kind === 'wild' && r && r.moon ? Math.max(toInt(b.ac, 10), 13 + modOf(s.stats.wis)) : toInt(b.ac, 10);
  s.speed = toInt(b.walk, 30);
  const temp = kind === 'wild' ? (r ? r.temp : 0) : toInt(b.hp, 0);
  s.hp.temp = Math.max(toInt(s.hp.temp, 0), temp);
}
function leaveForm(s) {
  const f = s.form;
  if (!f) return;
  if (f.back) { Object.assign(s.stats, f.back.stats); s.ac = f.back.ac; s.speed = f.back.speed; }
  if (f.kind === 'spell') s.hp.temp = 0; // «Превращение» кончается вместе с временными хитами
  s.form = null;
}
// Спасбросок в облике: дикий облик — большее из своего и звериного; заклинание — только звериный
function formSave(s, k, own) {
  const f = s.form;
  if (!f) return own;
  const b = f.beast, beast = b.saves && b.saves[k] !== undefined ? toInt(b.saves[k], 0) : modOf(toInt(b.stats[k], 10));
  return f.kind === 'spell' ? beast : Math.max(own, beast);
}
function formSkill(s, sk, own) {
  const f = s.form;
  if (!f) return own;
  const b = f.beast, has = b.skills && b.skills[sk.label] !== undefined;
  if (f.kind === 'spell') return has ? toInt(b.skills[sk.label], 0) : modOf(toInt(b.stats[sk.stat], 10));
  return has ? Math.max(own, toInt(b.skills[sk.label], 0)) : own;
}

// Плашка «В облике» вверху листа
function formBanner(s, ro) {
  const f = s.form;
  if (!f) return null;
  const b = f.beast, r = wildRules(s);
  const back = ro ? null : el('button', { class: 'mini', type: 'button', onclick: () => { leaveForm(s); changed(); } }, 'Вернуть свой облик');
  const lines = f.kind === 'wild'
    ? [`Дикий облик${r ? ': до ' + r.hours + ' ч' : ''}. Сила, Ловкость, Телосложение, КД и скорость — звериные. Хиты, Интеллект, Мудрость, Харизма, умения и языки — свои.`,
      'Говорить можно. Колдовать нельзя, но концентрация на уже наложенном заклинании сохраняется.']
    : ['Заклинание «Превращение»: все параметры звериные, свои остаются только хиты. Говорить и колдовать нельзя, снаряжение не действует.',
      `Временные хиты — это хиты зверя (${b.hp}). Когда они кончатся, превращение заканчивается.`];
  return el('div', { class: 'card notice' },
    el('div', { class: 'cardhead' }, el('div', { class: 'title' }, 'В облике: ' + b.name), back),
    el('p', { class: 'muted small' }, `${b.size || 'Зверь'} · ${beastLine(b)}${b.senses ? ' · ' + b.senses : ''}`),
    lines.map((t) => el('p', { class: 'muted small' }, t)),
    (b.traits || []).map((t) => el('p', { class: 'small' }, t)));
}
function formAttacks(s) {
  const f = s.form;
  if (!f) return null;
  return el('div', { class: 'card' }, el('div', { class: 'title' }, 'Атаки зверя'),
    (f.beast.actions || []).map(([name, text]) => el('div', { class: 'biopart' }, el('div', { class: 'label' }, name), el('p', {}, text))),
    !(f.beast.actions || []).length ? el('p', { class: 'muted' }, 'Атаки не вписаны.') : null,
    el('p', { class: 'muted small' }, 'Своим оружием в этом облике обычно пользоваться нельзя.'));
}

// Окно выбора зверя. opts: { title, note, list, blocked(b) → причина или '', onPick(b), onCustom }
function openBeastPicker(opts) {
  const back = el('div', { class: 'modal-back' });
  const close = () => back.remove();
  const search = el('input', { type: 'text', placeholder: 'Поиск: волк, медведь', autocomplete: 'off', 'aria-label': 'Поиск зверя' });
  const results = el('div', { class: 'results stack' });
  const draw = () => {
    const q = hintKey(search.value);
    const list = opts.list.filter((b) => !q || hintKey(b.name).includes(q));
    results.replaceChildren(...(list.length ? list.map((b) => {
      const why = opts.blocked ? opts.blocked(b) : '';
      return el('button', { class: 'pick', type: 'button', disabled: !!why, onclick: () => { close(); opts.onPick(b); } },
        el('span', { class: 'title' }, b.name),
        el('span', { class: 'muted' }, why ? `Пока нельзя: ${why}` : beastLine(b)),
        el('span', { class: 'muted small' }, (b.actions || []).map(([n, t]) => n + ': ' + t).join(' · ')));
    }) : [el('p', { class: 'muted' }, 'Ничего не нашлось.')]));
  };
  search.addEventListener('input', draw);
  draw();
  const box = el('div', { class: 'modal stack full fixed' },
    el('div', { class: 'cardhead' }, el('div', { class: 'title' }, opts.title), el('button', { class: 'mini solid', type: 'button', onclick: close }, 'Закрыть')),
    opts.note ? el('p', { class: 'muted small' }, opts.note) : null,
    search, results,
    opts.onCustom ? el('button', { class: 'btn outline', type: 'button', onclick: () => { close(); opts.onCustom(); } }, 'Вписать своего зверя') : null);
  back.append(box);
  document.body.append(back);
}

// Форма «свой зверь» → объект зверя
function customBeastForm(onSave) {
  openForm({
    title: 'Свой зверь',
    fields: [
      { key: 'name', label: 'Название', value: '' },
      { key: 'cr', label: 'Опасность', value: '1/4', hint: 'Как в книге: 0, 1/8, 1/4, 1/2, 1, 2…' },
      { key: 'fly', label: 'Летает? (да или нет)', value: 'нет' },
      { key: 'ac', label: 'КД', numeric: true, value: 12, fallback: 12 },
      { key: 'hp', label: 'Хиты зверя', numeric: true, value: 10, fallback: 10 },
      { key: 'speed', label: 'Скорость', value: '30 фт', hint: 'Например: 40 фт, лазание 30 фт' },
      { key: 'str', label: 'Сила', numeric: true, value: 10, fallback: 10 },
      { key: 'dex', label: 'Ловкость', numeric: true, value: 10, fallback: 10 },
      { key: 'con', label: 'Телосложение', numeric: true, value: 10, fallback: 10 },
      { key: 'int', label: 'Интеллект', numeric: true, value: 2, fallback: 2 },
      { key: 'wis', label: 'Мудрость', numeric: true, value: 10, fallback: 10 },
      { key: 'cha', label: 'Харизма', numeric: true, value: 5, fallback: 5 },
      { key: 'attack', label: 'Атаки', area: true, value: '', hint: 'Каждая с новой строки. Например: Укус: атака +4, 1к6+2 колющий' },
    ],
    saveText: 'Сохранить зверя',
    onSave: (v) => {
      const name = (v.name || '').trim().slice(0, 40);
      if (!name) return;
      const cr = parseCr(v.cr);
      const b = { name, en: '', size: 'Зверь', custom: true, ac: clamp(v.ac, 1, 30), hp: Math.max(1, v.hp), speed: (v.speed || '30 фт').slice(0, 60),
        walk: toInt(v.speed, 30), fly: /^\s*(да|yes|\+)/i.test(v.fly) || /пол[её]т/i.test(v.speed || ''),
        stats: Object.fromEntries(FORM_STATS.map((k) => [k, clamp(v[k], 1, 30)])), saves: {}, skills: {}, senses: '', cr, crText: crLabel(cr), traits: [],
        actions: String(v.attack || '').split('\n').map((t) => t.trim()).filter(Boolean).map((t) => { const i = t.indexOf(':'); return i > 0 ? [t.slice(0, i).trim(), t.slice(i + 1).trim()] : ['Атака', t]; }) };
      onSave(b);
    },
  });
}

// Карточка «Дикий облик» у друида
function wildCard(s, ro) {
  const r = wildRules(s);
  if (!r) return null;
  const w = wildState(s);
  const left = Math.max(0, r.uses - w.used);
  const known = w.known.map((n) => findBeast(s, n)).filter(Boolean);
  const addKnown = () => openBeastPicker({
    title: 'Добавить облик',
    note: `На ${r.level} уровне друида: опасность до ${crLabel(r.cr)}, ${r.fly ? 'летающие можно' : 'без полёта'}. Недоступных зверей выбрать нельзя.`,
    list: allBeasts(s).filter((b) => !w.known.some((n) => hintKey(n) === hintKey(b.name))),
    blocked: (b) => wildBlock(r, b),
    onPick: (b) => { w.known.push(b.name); changed(); },
    onCustom: () => customBeastForm((b) => {
      const why = wildBlock(r, b);
      if (why) { window.alert(`Этого зверя пока взять нельзя: ${why}.`); return; }
      w.custom = w.custom.filter((x) => hintKey(x.name) !== hintKey(b.name)).concat([b]);
      if (!w.known.some((n) => hintKey(n) === hintKey(b.name))) w.known.push(b.name);
      changed();
    }),
  });
  return el('div', { class: 'card' },
    el('div', { class: 'cardhead' }, el('div', { class: 'title' }, 'Дикий облик'), el('strong', { class: 'warn' }, `${left} из ${r.uses}`)),
    el('p', { class: 'muted small' }, `Превращение бонусным действием, до ${r.hours} ч. Одно применение возвращается после короткого отдыха, все — после долгого. Временные хиты при превращении: ${r.temp}.`),
    ro || s.form ? null : el('div', { class: 'label' }, `Известные облики: ${known.length} из ${r.known}`),
    ro || s.form ? null : known.map((b) => {
      const why = wildBlock(r, b);
      const go = el('button', { class: 'mini solid', type: 'button', disabled: left <= 0 || !!why, onclick: () => {
        if (!window.confirm(`Превратиться: ${b.name}? Потратится одно применение.`)) return;
        w.used += 1; enterForm(s, b, 'wild'); changed(); window.scrollTo(0, 0);
      } }, 'В облик');
      const del = el('button', { class: 'mini', type: 'button', onclick: () => { if (window.confirm(`Убрать облик «${b.name}» из известных?`)) { w.known = w.known.filter((n) => hintKey(n) !== hintKey(b.name)); changed(); } } }, 'Убрать');
      return el('div', { class: 'card wcard' }, el('div', { class: 'grow' }, el('div', { class: 'title' }, b.name), el('p', { class: 'muted wline' }, why ? `Пока нельзя: ${why}` : beastLine(b))),
        el('div', { class: 'btnrow' }, go, del));
    }),
    ro || s.form ? null : (known.length < r.known ? el('button', { class: 'btn dashed', type: 'button', onclick: addKnown }, '+ Добавить облик')
      : el('p', { class: 'muted small' }, 'Известных обликов максимум. Чтобы взять другого зверя, уберите один: по правилам заменять можно после долгого отдыха.')),
    left <= 0 && !s.form ? el('p', { class: 'small warn' }, 'Применения кончились. Вернутся после отдыха.') : null);
}

// Кнопка для заклинания «Превращение» — у любого персонажа
function polymorphCard(s, ro) {
  if (ro || s.form) return null;
  const n = Math.min(20, Math.max(1, toInt(s.level, 1)));
  const pick = () => openBeastPicker({
    title: 'Превращение в зверя',
    note: `Для заклинания «Превращение»: зверь с опасностью не выше уровня персонажа (${n}). Меняются все параметры, свои остаются хиты. Временные хиты равны хитам зверя.`,
    list: BEASTS,
    blocked: (b) => (b.cr > n ? `опасность ${crLabel(b.cr)} выше уровня персонажа` : ''),
    onPick: (b) => { enterForm(s, b, 'spell'); changed(); window.scrollTo(0, 0); },
    onCustom: () => customBeastForm((b) => {
      if (b.cr > n) { window.alert(`Опасность ${crLabel(b.cr)} выше уровня персонажа (${n}).`); return; }
      enterForm(s, b, 'spell'); changed(); window.scrollTo(0, 0);
    }),
  });
  return el('div', { class: 'card' }, el('div', { class: 'title' }, 'Сменить облик'),
    el('p', { class: 'muted small' }, 'Если на персонажа наложили заклинание «Превращение» или подействовал предмет, который превращает в зверя.'),
    el('button', { class: 'btn outline', type: 'button', onclick: pick }, 'Превратиться в зверя'));
}

// Отдых возвращает применения дикого облика
function wildRest(s, long) {
  if (!s.wild) return;
  s.wild.used = long ? 0 : Math.max(0, toInt(s.wild.used, 0) - 1);
}
