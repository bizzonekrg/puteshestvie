// Окно «Новый уровень»: показывает, что меняется, и применяет одной кнопкой.
// Если уровень подняли сразу на несколько ступеней — окна идут по очереди.

function profAt(n) { return 2 + Math.floor((Math.min(20, Math.max(1, n)) - 1) / 4); }

function hpDieOf(s) {
  const cls = s.cls || '';
  return /варвар/i.test(cls) ? 12 : /воин|боец|паладин|следопыт|рейнджер/i.test(cls) ? 10 : /чародей|волшебник/i.test(cls) ? 6
    : /бард|жрец|клирик|друид|монах|плут|разбойник|колдун/i.test(cls) ? 8 : toInt(String(s.hitDie || '').replace(/\D/g, ''), 0);
}

// Ячейки по правилам класса на уровне n: массив по уровням ячеек или null, если класс не колдует
function ruleSlotsAt(cls, n) {
  n = Math.min(20, Math.max(1, n)); cls = cls || '';
  if (/колдун/i.test(cls)) { const a = []; a[Math.min(5, Math.ceil(n / 2)) - 1] = n >= 17 ? 4 : n >= 11 ? 3 : n >= 2 ? 2 : 1; return Array.from(a, (x) => x || 0); }
  if (/бард|жрец|клирик|друид|чародей|волшебник/i.test(cls)) return BARD_SLOTS[n - 1];
  if (/паладин|следопыт|рейнджер/i.test(cls)) return HALF_SLOTS[n - 1];
  return null;
}

function slotsLine(arr) {
  const parts = [];
  (arr || []).forEach((max, i) => { if (max > 0) parts.push(`${max} × ${i + 1} ур.`); });
  return parts.length ? parts.join(', ') : 'нет';
}

// Уровни, на которых класс даёт черту или +2 к характеристике
function asiLevel(cls, n) {
  const base = [4, 8, 12, 16, 19];
  if (/воин|боец/i.test(cls || '')) base.push(6, 14);
  if (/плут|разбойник/i.test(cls || '')) base.push(10);
  return base.includes(n);
}

// Что меняется при переходе на уровень n (чистая функция: лист не трогает)
function levelUpPlan(s, n) {
  const cls = s.cls || '', con = modOf(s.stats.con), die = hpDieOf(s);
  const plan = { level: n, die, con, hpAdd: die ? Math.max(1, die / 2 + 1 + con) : 0 };
  const p0 = profAt(n - 1), p1 = profAt(n);
  plan.prof = p1 !== p0 ? { from: p0, to: p1 } : null;
  const rs = ruleSlotsAt(cls, n);
  if (rs) {
    const cur = [];
    for (const x of (s.spell.slots || [])) cur[x.level - 1] = x.max;
    const curArr = Array.from({ length: 9 }, (_, i) => cur[i] || 0), ruleArr = Array.from({ length: 9 }, (_, i) => rs[i] || 0);
    plan.slots = { from: curArr, to: ruleArr, same: curArr.join() === ruleArr.join() };
  }
  const a = spellLimits({ level: n - 1, cls }), b = spellLimits({ level: n, cls });
  if (a && b) {
    const lines = [];
    if (b.cantrip != null && b.cantrip !== a.cantrip) lines.push(['Заговоров можно знать', `${a.cantrip} → ${b.cantrip}`]);
    if (b.spell != null && b.spell !== a.spell) lines.push(['Заклинаний можно готовить', `${a.spell} → ${b.spell}`]);
    const newLv = b.maxLv > a.maxLv ? b.maxLv : 0;
    if (lines.length || newLv) plan.spells = { lines, newLv };
  }
  const has = (name) => s.features.some((f) => hintKey(f.name) === hintKey(name));
  const cd = classData(cls);
  plan.features = [];
  plan.pickSub = '';
  if (cd) {
    for (const [lv, name] of cd.features) if (lv === n && !has(name)) plan.features.push({ name, from: 'class' });
    const col = cd.subs.find((x) => x.key === s.college) || null;
    if (col) {
      for (const [lv, name] of col.features) if (lv === n && !has(name)) plan.features.push({ name, from: 'sub', col });
      plan.subSpells = col.spells.filter(([lv, name, , en]) => lv === n && !s.spells.some((x) => hintKey(x.name) === hintKey(name) || (en && x.en && hintKey(x.en) === hintKey(en))));
      plan.col = col;
    } else if (n >= cd.subLevel) plan.pickSub = cd.subWhat;
  }
  plan.asi = asiLevel(cls, n);
  return plan;
}

// Применить план к листу. add — прибавка хитов, picked — имена отмеченных умений
function levelUpApply(s, plan, add, picked) {
  add = Math.max(0, toInt(add, plan.hpAdd));
  s.hp.max += add; s.hp.cur = clamp(s.hp.cur + add, 0, s.hp.max);
  if (plan.prof) {
    const d = plan.prof.to - toInt(s.prof, plan.prof.from);
    s.prof = plan.prof.to;
    if (d > 0) {
      if (plan.slots || (s.spells || []).length) { s.spell.dc = toInt(s.spell.dc, 10) + d; s.spell.atk = toInt(s.spell.atk, 0) + d; }
      for (const w of s.weapons) w.bonus = toInt(w.bonus, 0) + d;
    }
  }
  if (plan.slots && !plan.slots.same) {
    const used = {};
    for (const x of s.spell.slots) used[x.level] = x.used;
    s.spell.slots = plan.slots.to.map((max, i) => ({ level: i + 1, max, used: clamp(used[i + 1] || 0, 0, max) })).filter((x) => x.max > 0);
  }
  const set = new Set(picked.map(hintKey));
  for (const f of plan.features) {
    if (!set.has(hintKey(f.name))) continue;
    if (f.from === 'sub') { s.features.push({ name: f.name, text: f.col.name, usesMax: 0, usesLeft: 0 }); s.collegeAdded = (s.collegeAdded || []).concat([f.name]); }
    else s.features.push({ name: f.name, text: '', usesMax: 0, usesLeft: 0 });
  }
  for (const [, name, lvl, en] of (plan.subSpells || [])) {
    const h = SPELL_HINT_INDEX.get(hintKey(en));
    const nm = h ? h.names[0].charAt(0).toUpperCase() + h.names[0].slice(1) : name;
    s.spells.push({ name: nm, level: h ? h.level : lvl, en });
    s.collegeAdded = (s.collegeAdded || []).concat(nm === name ? [name] : [name, nm]);
  }
}

// Окна по очереди для уровней from+1 … to
function openLevelUp(s, from, to) {
  const levels = [];
  for (let n = from + 1; n <= to; n++) levels.push(n);
  const kv = (a, b) => el('div', { class: 'lvkv' }, el('span', { class: 'muted' }, a), el('span', { class: 'lvval' }, b));
  const show = (idx) => {
    if (idx >= levels.length) return;
    const n = levels[idx], plan = levelUpPlan(s, n), last = idx === levels.length - 1;
    const back = el('div', { class: 'modal-back' });
    const close = () => back.remove();
    const input = el('input', { id: 'lv_hp', type: 'text', inputmode: 'numeric', autocomplete: 'off' });
    input.value = String(plan.hpAdd);
    const after = el('span', { class: 'lvval' }, String(s.hp.max + plan.hpAdd));
    input.addEventListener('input', () => { after.textContent = String(s.hp.max + Math.max(0, toInt(input.value, 0))); });
    const picked = new Set(plan.features.map((f) => f.name));
    const checks = plan.features.map((f) => {
      const b = el('button', { class: 'wcheck on', type: 'button' }, el('span', { class: 'box' }), el('span', {}, f.name + (f.from === 'sub' ? ` (${f.col.name})` : '')));
      b.addEventListener('click', () => { if (picked.has(f.name)) picked.delete(f.name); else picked.add(f.name); b.classList.toggle('on', picked.has(f.name)); });
      return b;
    });
    const subSpellNames = (plan.subSpells || []).map((x) => x[1]);
    const box = el('div', { class: 'modal stack' },
      el('div', { class: 'title' }, 'Новый уровень: ' + n),
      el('p', { class: 'muted' }, (levels.length > 1 ? `Шаг ${idx + 1} из ${levels.length}. ` : '') + 'Проверьте, что меняется, и нажмите «Применить».'),
      plan.die ? el('div', { class: 'card' },
        el('div', { class: 'lvh' }, 'Хиты'),
        kv('Было', String(s.hp.max)),
        el('div', { class: 'field' }, el('label', { for: 'lv_hp' }, 'Прибавка за уровень'), input),
        el('div', { class: 'lvkv' }, el('span', { class: 'muted' }, 'Станет'), after),
        el('p', { class: 'muted small' }, `Сейчас стоит среднее: ${plan.hpAdd} (кость к${plan.die}, Телосложение ${signed(plan.con)}). Если бросали кость с ведущим — сотрите и впишите, что получилось.`)) : null,
      plan.prof ? el('div', { class: 'card' },
        el('div', { class: 'lvh' }, 'Бонус мастерства'),
        kv('Было', signed(plan.prof.from)), kv('Станет', signed(plan.prof.to)),
        el('p', { class: 'muted small' }, 'Навыки и спасброски с владением, сложность и атака заклинаний, атака оружия вырастут на 1.')) : null,
      plan.slots ? el('div', { class: 'card' },
        el('div', { class: 'lvh' }, 'Ячейки заклинаний'),
        kv('Сейчас', slotsLine(plan.slots.from)), kv('Станет', slotsLine(plan.slots.to)),
        plan.slots.same ? el('p', { class: 'muted small' }, 'На этом уровне ячейки не меняются.') : null) : null,
      plan.spells ? el('div', { class: 'card' },
        el('div', { class: 'lvh' }, 'Заклинания'),
        plan.spells.lines.map(([a, b]) => kv(a, b)),
        el('p', { class: 'muted small' }, (plan.spells.newLv ? `Теперь доступны заклинания ${plan.spells.newLv} уровня. ` : '') + 'Новые заклинания добавьте на вкладке «Магия».')) : null,
      (checks.length || subSpellNames.length || plan.asi || plan.pickSub) ? el('div', { class: 'card' },
        el('div', { class: 'lvh' }, 'Новые умения'),
        checks.length ? el('div', { class: 'wchecks' }, checks) : null,
        checks.length ? el('p', { class: 'muted small' }, 'Отмеченные умения добавятся в лист. Галочку можно снять.') : null,
        subSpellNames.length ? el('p', { class: 'muted small' }, `${plan.col.name} даёт заклинания: ${subSpellNames.join(', ')}. Они добавятся сами и в счёт не идут.`) : null,
        plan.asi ? el('p', { class: 'small warn' }, 'На этом уровне положена черта или +2 к характеристике. Выберите вместе с ведущим и впишите в лист.') : null,
        plan.pickSub ? el('p', { class: 'small warn' }, `Пора выбрать ${plan.pickSub} — на вкладке «Магия».`) : null) : null,
      el('button', { class: 'btn', type: 'button', onclick: () => {
        levelUpApply(s, plan, input.value, [...picked]);
        close(); changed(); show(idx + 1);
      } }, last ? 'Применить' : 'Применить и дальше'),
      el('button', { class: 'btn link', type: 'button', onclick: () => {
        // «Позже»: уровень уже записан; бонус мастерства ставим по уровню, остальное не трогаем
        s.prof = profAt(s.level);
        close(); changed();
      } }, 'Позже'),
      el('p', { class: 'muted small center' }, '«Позже»: уровень поменяется, остальное останется как было.'));
    back.append(box);
    document.body.append(back);
  };
  show(0);
}
