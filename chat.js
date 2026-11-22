// Чат группы: общий для игроков и ведущего. Сообщение на языке, которого персонаж не знает,
// сервер присылает уже тарабарщиной — настоящий текст на телефон не приходит.

const CHAT_LANGS = ['Общий', 'Язык жестов', 'Великаний', 'Гномий', 'Гоблинский', 'Дварфийский', 'Драконий', 'Орочий', 'Полуросликов', 'Эльфийский',
  'Бездны', 'Глубинная речь', 'Друидический', 'Инфернальный', 'Небесный', 'Первичный', 'Подземный', 'Сильван', 'Воровской жаргон', 'Язык зверей'];
const CHAT_EFFECTS = { beasts: 'Разговор с животными', all: 'Понимание языков' };
const CHAT_EFFECT_TEXT = {
  beasts: 'Вы понимаете язык зверей и можете на нём говорить, пока не выключите.',
  all: 'Вы понимаете сообщения на любом языке, пока не выключите. Говорить на этих языках заклинание не даёт.',
};
const langKey = (x) => String(x || '').trim().replace(/\s+/g, ' ').toLowerCase().replace(/ё/g, 'е');

function chatSeen(gid, set) {
  try {
    if (set !== undefined) localStorage.setItem('chatseen:' + gid, String(set));
    return toInt(localStorage.getItem('chatseen:' + gid), 0);
  } catch (e) { return 0; }
}

// Кнопка «Чат» со счётчиком новых сообщений
function chatButton(profile, gid, back, cls, onOpen) {
  const b = el('button', { class: cls || 'btn', type: 'button', onclick: onOpen || (() => showChat(profile, gid, back)) }, 'Чат группы');
  sb.rpc('chat_count', { p_group: gid, p_after: chatSeen(gid) }).then(({ data }) => { if (data > 0) b.textContent = `Чат группы · новых: ${data}`; }, () => {});
  return b;
}

function chatModal(title, build) {
  const back = el('div', { class: 'modal-back' });
  const close = () => back.remove();
  const box = el('div', { class: 'modal stack' }, el('div', { class: 'title' }, title), build(close),
    el('button', { class: 'btn link', type: 'button', onclick: close }, 'Закрыть'));
  back.addEventListener('click', (e) => { if (e.target === back) close(); });
  back.append(box);
  document.body.append(back);
}

async function showChat(profile, gid, back) {
  show(false, el('p', { class: 'muted center' }, 'Загрузка…'));
  const goBack = back || (() => showGroup(profile, gid));
  const first = await sb.rpc('chat_list', { p_group: gid, p_after: 0 });
  if (first.error || !first.data) {
    return show(true, el('p', { class: 'error' }, first.error ? rpcError(first.error) : 'Чат недоступен.'),
      el('button', { class: 'btn', type: 'button', onclick: goBack }, 'Назад'));
  }
  let d = first.data, last = 0, lang = '', sending = false;
  const err = errorBox();
  const list = el('div', { class: 'chatlist' });
  const fxBox = el('div', {});
  const empty = el('p', { class: 'muted center chatempty' }, '');
  const langBtn = el('button', { class: 'chipbtn', type: 'button' }, 'Язык: Общий');
  const time = (iso) => { const t = new Date(iso); return isNaN(t) ? '' : String(t.getHours()).padStart(2, '0') + ':' + String(t.getMinutes()).padStart(2, '0'); };

  const bubble = (m) => {
    if (m.kind === 'sys') return el('p', { class: 'chatsys' }, m.text);
    if (m.kind === 'roll') return el('p', { class: 'chatsys roll' }, `${m.author} бросает ${m.text}`);
    const tags = [m.is_master ? 'ведущий' : '', m.lang ? 'на языке: ' + m.lang.toLowerCase() : ''].filter(Boolean).join(' · ');
    const body = m.known ? m.text : (m.text || 'делает знаки руками');
    return el('div', { class: 'chatmsg' + (m.mine ? ' mine' : '') },
      el('div', { class: 'chathead' }, el('strong', {}, m.author), el('span', { class: 'muted2' }, time(m.at))),
      tags ? el('div', { class: 'chattag' }, tags) : null,
      el('div', { class: m.known ? 'chattext' : 'chattext unknown' }, body),
      m.known ? null : el('div', { class: 'muted2' }, 'Ваш персонаж не знает этого языка.'));
  };
  const nearBottom = () => window.innerHeight + window.scrollY >= document.body.scrollHeight - 160;
  const add = (msgs, force) => {
    if (!msgs || !msgs.length) return;
    const stick = force || nearBottom();
    for (const m of msgs) { if (m.id > last) { list.append(bubble(m)); last = m.id; } }
    empty.textContent = '';
    chatSeen(gid, last);
    if (stick) window.scrollTo(0, document.body.scrollHeight);
  };
  const drawFx = () => {
    const fx = d.effects || [];
    fxBox.replaceChildren(...fx.map((e) => {
      const mine = !d.is_master;
      const off = el('button', { class: 'mini', type: 'button' }, mine ? 'Выключить' : 'Снять');
      off.addEventListener('click', () => busy(off, '…', async () => {
        const { error } = await sb.rpc('chat_effect', { p_group: gid, p_effect: e.effect, p_on: false, p_ritual: false, p_character: d.is_master ? e.character_id : null });
        if (error) err.set(rpcError(error));
        await refresh(true);
      }));
      return el('div', { class: 'card rowcard slim notice' }, el('div', { class: 'grow' }, `Действует: ${CHAT_EFFECTS[e.effect]}`, mine ? null : el('p', { class: 'muted small' }, e.character)), off);
    }));
  };
  const refresh = async (full) => {
    const { data, error } = await sb.rpc('chat_list', { p_group: gid, p_after: last });
    if (error || !data) return;
    const meta = JSON.stringify([data.effects, data.me, data.status]) !== JSON.stringify([d.effects, d.me, d.status]);
    const msgs = data.messages; d = data;
    add(msgs, full);
    if (meta || full) { drawFx(); fixLang(); }
  };
  // языки, на которых можно писать
  const myLangs = () => {
    if (d.is_master) {
      const extra = (d.group_langs || []).filter((x) => !CHAT_LANGS.some((y) => langKey(y) === langKey(x)));
      return CHAT_LANGS.concat(extra);
    }
    const mine = ((d.me && d.me.langs) || []).filter((x) => langKey(x) !== 'общий');
    const beasts = (d.effects || []).some((e) => e.effect === 'beasts') && !mine.some((x) => langKey(x) === 'язык зверей');
    return ['Общий'].concat(mine, beasts ? ['Язык зверей'] : []);
  };
  const fixLang = () => {
    if (lang && !myLangs().some((x) => langKey(x) === langKey(lang))) lang = '';
    langBtn.textContent = 'Язык: ' + (lang || 'Общий');
    langBtn.classList.toggle('on', !!lang);
  };
  langBtn.addEventListener('click', () => chatModal('На каком языке сказать', (close) => [
    el('div', { class: 'chips wrap' }, myLangs().map((x) => {
      const cur = langKey(x) === langKey(lang || 'Общий');
      return el('button', { class: 'chipbtn' + (cur ? ' on' : ''), type: 'button', onclick: () => { lang = langKey(x) === 'общий' ? '' : x; fixLang(); close(); } }, x);
    })),
    el('p', { class: 'muted small' }, d.is_master
      ? 'Вам доступны все языки. Кто языка не знает, увидит тарабарщину.'
      : 'Здесь языки вашего персонажа. Отметить их можно в листе: «Персонаж» → «Языки». Кто языка не знает, увидит тарабарщину.'),
  ]));
  const diceBtn = el('button', { class: 'chipbtn', type: 'button' }, 'Кости');
  diceBtn.addEventListener('click', () => chatModal('Бросить кость', (close) => [
    el('div', { class: 'chips wrap' }, [4, 6, 8, 10, 12, 20, 100].map((n) => el('button', { class: 'chipbtn', type: 'button', onclick: async () => {
      close();
      const { error } = await sb.rpc('chat_roll', { p_group: gid, p_sides: n });
      if (error) err.set(rpcError(error));
      await refresh(true);
    } }, 'к' + n))),
    el('p', { class: 'muted small' }, 'Результат пишется в чат от вашего имени. Пользоваться не обязательно: можно бросать настоящие кости.'),
  ]));
  const skillBtn = el('button', { class: 'chipbtn', type: 'button' }, 'Умения');
  skillBtn.addEventListener('click', () => chatModal('Умения', (close) => {
    const me = d.me || {};
    const cards = ['beasts', 'all'].filter((k) => me[k]).map((k) => {
      const active = (d.effects || []).some((e) => e.effect === k);
      const cast = async (ritual, button) => busy(button, '…', async () => {
        const { error } = await sb.rpc('chat_effect', { p_group: gid, p_effect: k, p_on: true, p_ritual: ritual });
        if (error) { err.set(rpcError(error)); close(); return; }
        close(); await refresh(true);
      });
      const b1 = el('button', { class: 'btn', type: 'button', disabled: active || !(me.slots > 0) }, 'Применить и потратить ячейку');
      const b2 = el('button', { class: 'btn outline', type: 'button', disabled: active }, 'Ритуалом, без ячейки');
      b1.addEventListener('click', () => cast(false, b1));
      b2.addEventListener('click', () => cast(true, b2));
      return el('div', { class: 'card' }, el('div', { class: 'lvh' }, CHAT_EFFECTS[k]),
        el('p', { class: 'muted small' }, CHAT_EFFECT_TEXT[k] + ` Свободных ячеек: ${me.slots || 0}.`),
        active ? el('p', { class: 'small warn' }, 'Уже действует. Выключить можно над лентой сообщений.') : null, b1, b2);
    });
    return cards.length ? [cards, el('p', { class: 'muted small' }, 'В чат напишется, что вы применили умение. Ведущий может снять действие.')]
      : [el('p', { class: 'muted' }, 'В листе вашего персонажа нет заклинаний «Разговор с животными» или «Понимание языков». Если язык персонаж знает постоянно, отметьте его в листе: «Персонаж» → «Языки».')];
  }));

  const input = el('input', { id: 'chatin', type: 'text', placeholder: 'Сообщение', maxlength: '1000', autocomplete: 'off', 'aria-label': 'Сообщение' });
  const sendBtn = el('button', { class: 'btn chatsend', type: 'submit' }, 'Отпр.');
  const form = el('form', { class: 'chatform', novalidate: true, onsubmit: async (e) => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text || sending) return;
    sending = true; err.set('');
    const { error } = await sb.rpc('chat_send', { p_group: gid, p_text: text, p_lang: lang });
    sending = false;
    if (error) return err.set(rpcError(error));
    input.value = '';
    await refresh(true);
  } }, input, sendBtn);

  show(false,
    el('div', { class: 'topbar' }, el('button', { class: 'mini', type: 'button', onclick: goBack }, '← Назад')),
    el('div', { class: 'head' }, el('h1', { class: 'small' }, 'Чат группы'),
      el('p', { class: 'muted' }, d.can_write ? 'Видят игроки группы и ведущий.' : 'Игра завершена. Чат остался для чтения.')),
    d.can_write ? timerBar(gid) : null,
    fxBox, list,
    empty,
    d.can_write ? el('div', { class: 'chatbar' }, err.node,
      el('div', { class: 'chips wrap' }, langBtn, diceBtn, d.is_master ? null : skillBtn), form) : null);
  empty.textContent = d.messages.length ? '' : 'Сообщений пока нет.';
  add(d.messages, true);
  drawFx(); fixLang();
  window.scrollTo(0, document.body.scrollHeight);
  if (d.can_write) {
    const timer = setInterval(() => {
      if (!document.body.contains(list)) return clearInterval(timer);
      if (document.visibilityState === 'visible') refresh(false);
    }, 4000);
  }
}

// Чаты завершённых игр
async function showChatArchive(profile) {
  show(false, el('p', { class: 'muted center' }, 'Загрузка…'));
  const { data, error } = await sb.rpc('chat_archive');
  const backHere = () => showChatArchive(profile);
  show(false,
    el('div', { class: 'topbar' }, el('button', { class: 'mini', type: 'button', onclick: () => route() }, '← Назад')),
    el('div', { class: 'head' }, el('h1', { class: 'small' }, 'Чаты прошлых игр'), el('p', { class: 'muted' }, 'Переписка завершённых игр. Только для чтения.')),
    error ? el('p', { class: 'error' }, rpcError(error)) : null,
    (data || []).map((g) => el('button', { class: 'card rowcard asbutton', type: 'button', onclick: () => showChat(profile, g.id, backHere) },
      el('div', { class: 'grow' }, el('div', { class: 'title' }, g.name),
        el('p', { class: 'muted' }, `${g.finished_at ? new Date(g.finished_at).toLocaleDateString('ru-RU') : ''} · сообщений: ${g.count}`)))),
    (!error && !(data || []).length) ? el('p', { class: 'muted' }, 'Пока пусто. Чат появится здесь после завершённой игры, в которой переписывались.') : null);
}

// Языки из строки «Знание языков: …» (так их записывает CharBox). Общий есть всегда.
function langsFromText(text) {
  const m = /(?:^|\n)\s*(?:знание\s+)?язык(?:и|ов)\s*:\s*([^\n]+)/i.exec(String(text || ''));
  const out = ['Общий'];
  if (m) for (const raw of m[1].split(/[,;]/)) {
    const v = raw.trim().replace(/\.$/, '').slice(0, 40);
    if (!v) continue;
    const std = CHAT_LANGS.find((x) => langKey(x) === langKey(v));
    if (!out.some((x) => langKey(x) === langKey(std || v))) out.push(std || v);
  }
  return out;
}

// Окно выбора языков в листе персонажа
function openLangsForm(s) {
  const cur = Array.isArray(s.langs) && s.langs.length ? s.langs.slice() : ['Общий'];
  const has = (x) => cur.some((y) => langKey(y) === langKey(x));
  const back = el('div', { class: 'modal-back' });
  const close = () => back.remove();
  const body = el('div', { class: 'stack' });
  const draw = () => {
    const custom = cur.filter((x) => !CHAT_LANGS.some((y) => langKey(y) === langKey(x)));
    const check = (x, locked) => {
      const b = el('button', { class: 'wcheck' + (has(x) ? ' on' : ''), type: 'button', disabled: locked }, el('span', { class: 'box' }), el('span', {}, x));
      b.addEventListener('click', () => { const i = cur.findIndex((y) => langKey(y) === langKey(x)); if (i >= 0) cur.splice(i, 1); else cur.push(x); draw(); });
      return b;
    };
    body.replaceChildren(
      el('div', { class: 'wchecks' }, CHAT_LANGS.map((x) => check(x, langKey(x) === 'общий')), custom.map((x) => check(x, false))),
      el('p', { class: 'muted small' }, '«Язык зверей» отмечайте, только если персонаж понимает зверей постоянно. Если на время, через заклинание, — это кнопка «Умения» в чате группы.'));
  };
  draw();
  const box = el('div', { class: 'modal stack' }, el('div', { class: 'title' }, 'Языки'),
    el('p', { class: 'muted' }, 'По правилам персонаж знает общий и ещё минимум два языка. От языков зависит, что вы понимаете в чате группы.'), body,
    el('button', { class: 'btn', type: 'button', onclick: () => { if (!has('Общий')) cur.unshift('Общий'); s.langs = cur; close(); changed(); } }, 'Сохранить'),
    el('button', { class: 'btn link', type: 'button', onclick: close }, 'Отмена'));
  back.append(box);
  document.body.append(back);
}
