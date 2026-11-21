// Выдача ведущим: предмет из списка ДнД 2024, свой предмет или золото — всем или выбранным персонажам.
// Общие помощники (el, show, sb, busy, errorBox, route) — в app.js; rpcError — в groups.js; toInt — в sheet.js; CATALOG — в catalog.js.

// Блок выбора «что выдаём». allowGold=false — для награды в конце игры (золото там отдельным полем).
function giftPicker(allowGold, own) {
  let mode = 'list';
  let chosen = null;
  const uid = Math.random().toString(36).slice(2, 8);
  const inp = (id, placeholder, numeric) => el('input', { id: id + uid, type: 'text', inputmode: numeric ? 'numeric' : null, placeholder, autocomplete: 'off' });

  // из списка
  const search = inp('gs', 'Например: меч, зелье', false);
  const qty = inp('gq', '1', true);
  qty.value = '1';
  const results = el('div', { class: 'results' });
  const picked = el('p', { class: 'muted' }, 'Предмет не выбран.');
  const drawResults = () => {
    const q = search.value.trim().toLowerCase();
    const list = CATALOG.filter((it) => !q || it.name.toLowerCase().includes(q) || it.group.toLowerCase().includes(q));
    results.replaceChildren(...(list.length ? list.map((it) => {
      const b = el('button', { class: 'pick', type: 'button', 'aria-pressed': String(chosen === it) },
        el('span', { class: 'title' }, it.name), el('span', { class: 'muted' }, catalogLine(it)));
      b.addEventListener('click', () => {
        chosen = it;
        picked.textContent = `Выбрано: ${it.name}`;
        drawResults();
      });
      return b;
    }) : [el('p', { class: 'muted' }, 'Ничего не нашлось. Попробуйте другое слово или вкладку «Свой».')]));
  };
  search.addEventListener('input', drawResults);
  drawResults();
  const listBox = el('div', { class: 'stack' },
    el('div', { class: 'field' }, el('label', { for: 'gs' + uid }, 'Поиск по списку ДнД 2024'), search),
    results, picked,
    el('div', { class: 'field' }, el('label', { for: 'gq' + uid }, own ? 'Сколько штук' : 'Сколько штук каждому'), qty));

  // свой предмет
  const oname = inp('on', 'Например: Клинок бури', false);
  const odmg = inp('od', 'Например: 1к8+1 электричество', false);
  const oqty = inp('oq', '1', true);
  oqty.value = '1';
  const odesc = el('textarea', { id: 'ox' + uid, rows: '3', placeholder: 'Что делает предмет', maxlength: '500' });
  const ownBox = el('div', { class: 'stack', hidden: true },
    el('div', { class: 'field' }, el('label', { for: 'on' + uid }, 'Название'), oname),
    el('div', { class: 'field' }, el('label', { for: 'od' + uid }, 'Урон (заполните, если это оружие)'), odmg),
    el('div', { class: 'field' }, el('label', { for: 'ox' + uid }, 'Описание и свойства (не обязательно)'), odesc),
    el('div', { class: 'field' }, el('label', { for: 'oq' + uid }, own ? 'Сколько штук' : 'Сколько штук каждому'), oqty));

  // золото
  const coins = coinInputs('gc' + uid);
  const goldBox = el('div', { class: 'stack', hidden: true },
    el('p', { class: 'muted' }, 'Сколько монет каждому. Заполните один вид или сразу несколько.'),
    coins.node);

  const tabs = [['list', 'Из списка', listBox], ['own', 'Свой', ownBox]].concat(allowGold ? [['gold', 'Монеты', goldBox]] : []);
  const buttons = tabs.map(([key, label]) => {
    const b = el('button', { type: 'button', 'aria-pressed': String(key === mode) }, label);
    b.addEventListener('click', () => {
      mode = key;
      tabs.forEach(([k, , box], i) => { box.hidden = k !== key; buttons[i].setAttribute('aria-pressed', String(k === key)); });
    });
    return b;
  });

  return {
    node: el('div', { class: 'stack' },
      el('div', { class: 'label' }, own ? 'Что добавляем' : 'Что выдаём'),
      el('div', { class: 'choice' + (allowGold ? ' three' : '') }, buttons),
      listBox, ownBox, goldBox),
    // Возвращает { gifts: [...], label } или { error }. У монет подарков столько, сколько видов заполнено.
    read() {
      if (mode === 'gold') {
        const c = coins.read();
        const kinds = Object.keys(c);
        if (!kinds.length) return { error: 'Впишите, сколько монет выдать.' };
        return { gifts: kinds.map((k) => ({ kind: 'gold', gold: c[k], coin: k })), label: `Монеты: ${coinsText(c)}` };
      }
      if (mode === 'own') {
        const name = oname.value.trim();
        if (!name) return { error: 'Впишите название предмета.' };
        const dmg = odmg.value.trim();
        const n = Math.max(1, toInt(oqty.value, 1));
        const own = { kind: dmg ? 'weapon' : 'item', name, dmg, descr: odesc.value.trim(), qty: n, ability: 'best' };
        return { gift: own, gifts: [own], label: name };
      }
      if (!chosen) return { error: 'Выберите предмет из списка.' };
      const n = Math.max(1, toInt(qty.value, 1));
      const fromList = { kind: chosen.kind, name: chosen.name, dmg: chosen.dmg, props: chosen.props, descr: chosen.descr, ability: chosen.ability || 'best', qty: n };
      return { gift: fromList, gifts: [fromList], label: chosen.name };
    },
  };
}

// Всплывающее окно выбора предмета (для экрана «Завершение игры»)
function openGiftModal(onPick, own) {
  const back = el('div', { class: 'modal-back' });
  const close = () => back.remove();
  const picker = giftPicker(false, own);
  const err = errorBox();
  const box = el('div', { class: 'modal stack' },
    el('div', { class: 'title' }, own ? 'Добавить в свои вещи' : 'Предмет в награду'),
    picker.node, err.node,
    el('button', { class: 'btn', type: 'button', onclick: () => {
      const r = picker.read();
      if (r.error) return err.set(r.error);
      close();
      onPick(r);
    } }, own ? 'Добавить' : 'Выбрать'),
    el('button', { class: 'btn link', type: 'button', onclick: close }, 'Отмена'));
  back.addEventListener('click', (e) => { if (e.target === back) close(); });
  back.append(box);
  document.body.append(back);
}

// ---------- экран «Выдать» (ведущий, во время игры) ----------

function showGive(profile, gid, d) {
  const err = errorBox();
  const picker = giftPicker(true);
  const members = d.members || [];

  const all = el('input', { id: 'gall', type: 'checkbox', class: 'check' });
  all.checked = true;
  const boxes = members.map((m, i) => {
    const cb = el('input', { id: 'gm' + i, type: 'checkbox', class: 'check' });
    cb.checked = true;
    cb.addEventListener('change', () => { all.checked = boxes.every((b) => b.cb.checked); });
    return { m, cb, node: el('label', { class: 'checkrow', for: 'gm' + i }, cb, `${m.character} (${m.name})`) };
  });
  all.addEventListener('change', () => boxes.forEach((b) => { b.cb.checked = all.checked; }));

  const submit = el('button', { class: 'btn', type: 'button' }, 'Выдать');
  submit.addEventListener('click', async () => {
    err.set('');
    const r = picker.read();
    if (r.error) return err.set(r.error);
    const ids = boxes.filter((b) => b.cb.checked).map((b) => b.m.character_id);
    if (!ids.length) return err.set('Отметьте хотя бы одного персонажа.');
    await busy(submit, 'Выдаём…', async () => {
      let data = 0;
      let done = 0;
      for (const gift of r.gifts) {
        const res = await sb.rpc('give_gift', { p_group: gid, p_characters: ids, p_gift: gift });
        if (res.error) {
          // часть могла уже уйти игрокам — говорим об этом прямо, чтобы ведущий не выдал дважды
          return err.set(rpcError(res.error) + (done ? ` Часть уже выдана: ${done} из ${r.gifts.length}. Не повторяйте выдачу целиком.` : ''));
        }
        data = res.data;
        done++;
      }
      show(true,
        el('div', { class: 'card notice' },
          el('div', { class: 'title' }, 'Выдано'),
          el('p', { class: 'muted' }, `${r.label} — персонажей: ${data}. Игроки увидят сообщение в листе в течение 15 секунд или при обновлении страницы.`)),
        el('button', { class: 'btn', type: 'button', onclick: () => showGive(profile, gid, d) }, 'Выдать ещё'),
        el('button', { class: 'btn outline', type: 'button', onclick: () => showGroup(profile, gid) }, 'Назад к группе'));
    });
  });

  show(false,
    el('div', { class: 'head' },
      el('h1', { class: 'small' }, 'Выдать'),
      el('p', { class: 'muted' }, `Группа «${d.name}». Выданное попадает в листы игроков само.`)),
    el('div', { class: 'card' }, picker.node),
    el('div', { class: 'card' },
      el('div', { class: 'label' }, 'Кому'),
      members.length ? [el('label', { class: 'checkrow strong', for: 'gall' }, all, 'Всем персонажам группы'), boxes.map((b) => b.node)]
        : el('p', { class: 'muted' }, 'В группе нет игроков.')),
    err.node,
    submit,
    el('button', { class: 'btn outline', type: 'button', onclick: () => showGroup(profile, gid) }, 'Назад к группе'));
}
