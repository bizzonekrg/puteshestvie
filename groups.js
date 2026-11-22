// Шаг 4: группы — создание, вступление по коду, состав, управление предводителя, вход ведущего.
// Общие помощники (el, show, sb, busy, errorBox, field, route) живут в app.js, openForm — в sheet.js.

// Понятные сообщения из базы приходят с кодом P0001; всё остальное — общая фраза
function rpcError(error) {
  if (error && error.code === 'P0001' && error.message) return error.message;
  return 'Не получилось. Проверьте интернет и попробуйте ещё раз.';
}

async function loadMyGroups() {
  const { data, error } = await sb.rpc('my_groups');
  return { groups: error ? null : (data || []), error };
}

// Всплывающий выбор из списка
function openChoice(title, options, onPick) {
  const back = el('div', { class: 'modal-back' });
  const close = () => back.remove();
  const box = el('div', { class: 'modal stack' },
    el('div', { class: 'title' }, title),
    options.length ? options.map((o) => el('button', { class: 'btn outline', type: 'button', onclick: () => { close(); onPick(o.value); } }, o.label))
      : el('p', { class: 'muted' }, 'Выбирать пока не из кого.'),
    el('button', { class: 'btn link', type: 'button', onclick: close }, 'Отмена'));
  back.addEventListener('click', (e) => { if (e.target === back) close(); });
  back.append(box);
  document.body.append(back);
}

function ratingText(master) {
  if (!master) return '';
  if (!master.rated) return 'Оценок пока нет';
  return `Рейтинг ${String(master.rating).replace('.', ',')} из 10 · оценок: ${master.rated}`;
}

// ---------- экран «Выбор группы» (игрок) ----------

async function showGroups(profile, prefillCode) {
  show(false, el('p', { class: 'muted center' }, 'Загрузка…'));
  const { groups, error: gErr } = await loadMyGroups();
  const { data: allChars, error: cErr } = await sb.from('characters')
    .select('id, name, class_name, level').eq('owner_id', profile.id).order('created_at', { ascending: true });

  const taken = new Set((groups || []).map((g) => g.character_id).filter(Boolean));
  const chars = (allChars || []).filter((c) => !taken.has(c.id));
  let picked = chars.length ? chars[0].id : null;

  const err = errorBox();
  if (gErr || cErr) err.set('Не удалось загрузить данные. Проверьте интернет.');

  const charButtons = chars.map((c) => {
    const b = el('button', { class: 'pick', type: 'button', 'aria-pressed': String(c.id === picked) },
      el('span', { class: 'title' }, c.name),
      el('span', { class: 'muted' }, `${c.class_name || 'Персонаж'} · ${c.level} ур.`));
    b.addEventListener('click', () => {
      picked = c.id;
      charButtons.forEach((x) => x.setAttribute('aria-pressed', 'false'));
      b.setAttribute('aria-pressed', 'true');
    });
    return b;
  });

  const code = field('gcode', 'Код группы', 'text', 'Введите код', { autocapitalize: 'characters', maxlength: '12' });
  if (prefillCode) code.input.value = prefillCode;
  const joinBtn = el('button', { class: 'btn', type: 'button' }, 'Вступить');
  joinBtn.addEventListener('click', async () => {
    err.set('');
    if (!picked) return err.set('Сначала загрузите персонажа: свободных персонажей нет.');
    if (!code.input.value.trim()) return err.set('Введите код группы. Его даёт предводитель.');
    await busy(joinBtn, 'Вступаем…', async () => {
      const { data, error } = await sb.rpc('join_group', { p_code: code.input.value, p_character: picked });
      if (error) return err.set(rpcError(error));
      await showGroup(profile, data);
    });
  });

  const gname = field('gname', 'Название новой группы', 'text', 'Например: Поход за драконом', { maxlength: '40' });
  const createBtn = el('button', { class: 'btn outline', type: 'button' }, '+ Создать группу');
  createBtn.addEventListener('click', async () => {
    err.set('');
    if (!picked) return err.set('Сначала загрузите персонажа: свободных персонажей нет.');
    if (gname.input.value.trim().length < 2) return err.set('Впишите название группы.');
    await busy(createBtn, 'Создаём…', async () => {
      const { data, error } = await sb.rpc('create_group', { p_name: gname.input.value, p_character: picked });
      if (error) return err.set(rpcError(error));
      await showGroup(profile, data);
    });
  });

  show(false,
    el('div', { class: 'head' },
      el('h1', { class: 'small' }, 'Выберите группу'),
      el('p', { class: 'muted' }, 'Вступите в группу по коду или создайте свою.')),
    el('div', { class: 'card' },
      el('div', { class: 'title' }, 'С каким персонажем идёте'),
      chars.length ? charButtons : el('p', { class: 'muted' }, 'Свободных персонажей нет: все уже состоят в группах или ещё не загружены.'),
      el('button', { class: 'btn dashed', type: 'button', onclick: () => showUpload(profile) }, '+ Загрузить нового персонажа')),
    err.node,
    el('div', { class: 'card' },
      el('div', { class: 'title' }, 'Вступить по коду'),
      el('p', { class: 'muted' }, 'Код даёт предводитель группы.'),
      code.node, joinBtn),
    el('div', { class: 'card' },
      el('div', { class: 'title' }, 'Своя группа'),
      el('p', { class: 'muted' }, 'Вы станете предводителем, получите код для друзей и сможете позже передать полномочия другому игроку.'),
      gname.node, createBtn),
    el('button', { class: 'btn outline spacer', type: 'button', onclick: () => route() }, 'Назад'));
}

// ---------- экран «Группа» ----------

async function showGroup(profile, gid) {
  show(false, el('p', { class: 'muted center' }, 'Загрузка…'));
  const { data: d, error } = await sb.rpc('group_detail', { p_group: gid });
  if (error || !d) {
    return show(true,
      el('p', { class: 'error' }, error ? rpcError(error) : 'Группа не найдена.'),
      el('button', { class: 'btn', type: 'button', onclick: () => route() }, 'Назад'));
  }

  const err = errorBox();
  const reload = () => showGroup(profile, gid);
  // выполнить действие в базе и перерисовать экран
  const act = async (button, fn, args, after) => {
    err.set('');
    await busy(button, '…', async () => {
      const { error: e } = await sb.rpc(fn, args);
      if (e) { err.set(rpcError(e)); window.scrollTo(0, 0); return; }
      await (after || reload)();
    });
  };

  // ведущий
  let masterCard;
  if (d.master) {
    const yes = el('button', { class: 'btn', type: 'button' }, 'Подтвердить');
    const no = el('button', { class: 'btn outline', type: 'button', style: 'min-height:54px' }, 'Отклонить');
    const drop = el('button', { class: 'btn outline', type: 'button' }, 'Убрать ведущего');
    yes.addEventListener('click', () => act(yes, 'confirm_master', { p_group: gid, p_ok: true }));
    no.addEventListener('click', () => act(no, 'confirm_master', { p_group: gid, p_ok: false }));
    drop.addEventListener('click', () => { if (window.confirm(`Убрать ведущего ${d.master.name}?`)) act(drop, 'confirm_master', { p_group: gid, p_ok: false }); });
    masterCard = el('div', { class: 'card' + (d.master_confirmed ? '' : ' notice') },
      el('div', { class: 'label' }, d.master_confirmed ? 'Ведущий' : 'Заявка ведущего'),
      el('div', { class: 'title' }, d.master.name),
      el('p', { class: 'muted' }, `${ratingText(d.master)} · проведено игр: ${d.master.games || 0}`),
      d.master_confirmed ? null : el('p', { class: 'muted' }, d.is_leader ? 'Подтвердите, если это ваш ведущий.' : 'Ждёт подтверждения предводителя.'),
      d.is_leader ? (d.master_confirmed ? drop : el('div', { class: 'row2' }, yes, no)) : null);
  } else {
    masterCard = el('div', { class: 'card' },
      el('div', { class: 'label' }, 'Ведущий'),
      el('p', { class: 'muted' }, d.is_leader ? 'Ведущего пока нет. Дайте ему код группы — он войдёт сам, а вы подтвердите.' : 'Ведущего пока нет.'));
  }

  // состав
  const others = (d.members || []).filter((m) => !m.is_me);
  const memberCards = (d.members || []).map((m) => el('button', { class: 'card rowcard asbutton' + (m.is_me ? ' mine' : ''), type: 'button',
    onclick: () => openCharacter(profile, m.character_id, 'main', reload) },
    el('div', { class: 'grow' },
      el('div', { class: 'title' }, m.character),
      el('p', { class: 'muted' }, `${m.class_name || 'Персонаж'} · ${m.level} ур. · Хиты ${m.hp_cur}/${m.hp_max} · КД ${m.ac}`),
      el('p', { class: 'muted small' }, `Игрок: ${m.name}${m.is_leader ? ' · предводитель' : ''}`)),
    m.is_me ? el('span', { class: 'chip' }, 'Вы') : el('span', { class: 'gold' }, 'Смотреть')));

  // управление предводителя
  let manage = null;
  if (d.is_leader) {
    // приглашение: название группы, код и ссылка, по которой код подставится сам
    const link = `${location.origin}${location.pathname}?code=${encodeURIComponent(d.code)}`;
    const invite = `Группа «${d.name}»\nКод для вступления: ${d.code}\n${link}`;
    const copied = el('span', { class: 'muted small', hidden: true }, 'Приглашение скопировано: название, код и ссылка');
    const copyBtn = el('button', { class: 'mini', type: 'button' }, 'Скопировать');
    copyBtn.addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(invite); copied.textContent = 'Приглашение скопировано: название, код и ссылка'; }
      catch (_) { copied.textContent = 'Не скопировалось — перепишите код вручную'; }
      copied.hidden = false;
    });
    const shareBtn = navigator.share ? el('button', { class: 'btn', type: 'button' }, 'Отправить приглашение') : null;
    if (shareBtn) shareBtn.addEventListener('click', async () => {
      try { await navigator.share({ text: invite }); } catch (_) { /* человек закрыл окно отправки */ }
    });
    const newCode = el('button', { class: 'btn outline', type: 'button' }, 'Сменить код');
    newCode.addEventListener('click', () => { if (window.confirm('Сменить код? Старый код перестанет работать.')) act(newCode, 'new_group_code', { p_group: gid }); });
    const rename = el('button', { class: 'btn outline', type: 'button', onclick: () => openForm({
      title: 'Название группы',
      fields: [{ key: 'name', label: 'Название', value: d.name }],
      onSave: (v) => act(rename, 'rename_group', { p_group: gid, p_name: v.name }),
    }) }, 'Изменить название');
    const transfer = el('button', { class: 'btn outline', type: 'button', onclick: () => openChoice('Кому передать полномочия',
      others.map((m) => ({ label: `${m.name} — ${m.character}`, value: m.user_id })),
      (uid) => act(transfer, 'transfer_leader', { p_group: gid, p_user: uid })) }, 'Передать полномочия');
    const cancel = el('button', { class: 'btn outline danger', type: 'button' }, 'Отменить игру и распустить группу');
    cancel.addEventListener('click', () => {
      if (window.confirm('Распустить группу? Персонажи останутся у игроков.')) act(cancel, 'cancel_group', { p_group: gid }, () => route());
    });
    manage = el('div', { class: 'card' },
      el('div', { class: 'title' }, 'Управление группой'),
      el('p', { class: 'muted' }, 'Этот блок видит только предводитель.'),
      el('div', { class: 'label' }, 'Код для вступления'),
      el('div', { class: 'cardhead' }, el('div', { class: 'codebig grow' }, d.code), copyBtn),
      copied,
      el('p', { class: 'muted small prewrap' }, invite),
      shareBtn,
      newCode, rename, transfer, cancel);
  }

  const leave = (d.is_leader) ? null : el('button', { class: 'btn outline', type: 'button' }, 'Выйти из группы');
  if (leave) leave.addEventListener('click', () => { if (window.confirm('Выйти из группы?')) act(leave, 'leave_group', { p_group: gid }, () => route()); });

  show(false,
    el('div', { class: 'topbar' }, el('button', { class: 'mini', type: 'button', onclick: () => route() }, '← Назад'),
      el('button', { class: 'mini', type: 'button', onclick: reload }, 'Обновить')),
    el('div', { class: 'head' },
      el('h1', { class: 'small' }, d.name),
      el('p', { class: 'muted' }, 'Чужих персонажей можно только смотреть. Ведущий видит всех, но ничего не меняет.')),
    err.node,
    el('div', { class: 'card tight' }, el('div', { class: 'label' }, 'Предводитель группы'), el('div', { class: 'title' }, d.leader ? d.leader.name : '—')),
    masterCard,
    (d.is_master && !d.master_confirmed) ? el('p', { class: 'muted' }, 'Состав группы откроется, когда предводитель подтвердит вас.') : [
      el('h2', {}, `Игроки: ${(d.members || []).length}`),
      memberCards,
    ],
    (d.is_member || (d.is_master && d.master_confirmed)) ? el('div', { class: 'card' },
      el('div', { class: 'title' }, 'Чат группы'),
      el('p', { class: 'muted' }, 'Переписка игроков и ведущего. Можно писать на языках персонажей и бросать кости.'),
      chatButton(profile, gid)) : null,
    (d.is_master && d.master_confirmed) ? el('div', { class: 'card' },
      el('div', { class: 'title' }, 'Во время игры'),
      el('p', { class: 'muted' }, 'Выдайте предмет, зелье или золото всем сразу или выбранным персонажам.'),
      el('button', { class: 'btn', type: 'button', onclick: () => showGive(profile, gid, d) }, 'Выдать')) : null,
    (d.is_master && d.master_confirmed) ? el('div', { class: 'card notice' },
      el('div', { class: 'title' }, 'Конец игры'),
      el('p', { class: 'muted' }, 'Когда игра закончится, выдайте награды. После этого группа распустится.'),
      el('button', { class: 'btn', type: 'button', onclick: () => showFinish(profile, gid, d) }, 'Завершить игру')) : null,
    manage,
    leave);
}

// ---------- блоки для главного экрана ----------

function groupListCards(profile, groups) {
  return (groups || []).map((g) => el('button', { class: 'card rowcard asbutton', type: 'button', onclick: () => showGroup(profile, g.id) },
    el('div', { class: 'grow' },
      el('div', { class: 'title' }, g.name),
      el('p', { class: 'muted' }, `Предводитель: ${g.leader_name || '—'} · игроков: ${g.members}`),
      g.is_master ? el('p', { class: 'muted small' }, g.master_confirmed ? 'Вы ведущий' : 'Ваша заявка ведущего ждёт подтверждения')
        : (g.is_leader ? el('p', { class: 'muted small' }, 'Вы предводитель') : null)),
    el('span', { class: 'gold' }, 'Открыть')));
}

// Блок «Мои группы» для игрока
async function playerGroupsBlock(profile) {
  const { groups, error } = await loadMyGroups();
  return [
    el('h2', {}, 'Мои группы'),
    error ? el('p', { class: 'error' }, 'Не удалось загрузить группы.') : null,
    groupListCards(profile, groups),
    (!error && !groups.length) ? el('p', { class: 'muted' }, 'Вы пока не в группе.') : null,
    el('button', { class: 'btn outline', type: 'button', onclick: () => showGroups(profile) }, 'Вступить или создать группу'),    el('button', { class: 'btn link', type: 'button', onclick: () => showChatArchive(profile) }, 'Чаты прошлых игр'),
  ];
}

// Блок «Мои группы» для ведущего
async function masterGroupsBlock(profile) {
  const { groups, error } = await loadMyGroups();
  const err = errorBox();
  const code = field('mcode', 'Код группы', 'text', 'Введите код', { autocapitalize: 'characters', maxlength: '12' });
  const fromLink = takeJoinCode();
  if (fromLink) code.input.value = fromLink;
  const send = el('button', { class: 'btn', type: 'button' }, 'Отправить заявку');
  send.addEventListener('click', async () => {
    err.set('');
    if (!code.input.value.trim()) return err.set('Введите код группы. Его даёт предводитель.');
    await busy(send, 'Отправляем…', async () => {
      const { data, error: e } = await sb.rpc('request_master', { p_code: code.input.value });
      if (e) return err.set(rpcError(e));
      await showGroup(profile, data);
    });
  });
  return [
    el('h2', {}, 'Мои группы'),
    error ? el('p', { class: 'error' }, 'Не удалось загрузить группы.') : null,
    groupListCards(profile, groups),
    (!error && !groups.length) ? el('p', { class: 'muted' }, 'Групп пока нет. Новая появится здесь после вашей заявки.') : null,
    el('div', { class: 'card' },
      el('div', { class: 'title' }, 'Войти в группу как ведущий'),
      el('p', { class: 'muted' }, 'Введите код группы. Предводитель подтвердит вас.'),
      code.node, err.node, send),    el('button', { class: 'btn link', type: 'button', onclick: () => showChatArchive(profile) }, 'Чаты прошлых игр'),
  ];
}
