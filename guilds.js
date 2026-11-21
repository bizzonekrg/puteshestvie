// Гильдии (этап 2): список и рейтинг, создание, страница, управление, журнал походов.
// Общие помощники (el, show, sb, busy, errorBox, route) — в app.js; rpcError — в groups.js; openForm — в sheet.js.
// Все действия идут через функции базы guild_*: права проверяет база.

const GUILD_RANK = { leader: 'Глава', deputy: 'Заместитель', member: 'Участник' };
const guildDate = (iso) => { const d = new Date(iso); return isNaN(d) ? '' : d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' }); };
const guildWho = (m) => (m.role === 'master' ? 'ведущий' : (m.chars ? 'персонаж: ' + m.chars : 'игрок'));
const sortieCard = (s) => el('div', { class: 'card tight' },
  el('div', { class: 'title' }, s.group_name || 'Поход'),
  el('p', { class: 'muted' }, [guildDate(s.finished_at), s.master_name ? 'ведущий: ' + s.master_name : ''].filter(Boolean).join(' · ')),
  el('p', { class: 'muted' }, 'Из гильдии: ' + (s.people || []).join(', ')),
  el('p', {}, 'Очков: +' + s.points));

// Карточка на главном экране
async function guildHomeBlock(profile) {
  const { data, error } = await sb.rpc('guild_list');
  if (error) return el('p', { class: 'muted' }, 'Не удалось загрузить гильдии.');
  const mine = data && data.mine;
  return [el('h2', {}, 'Гильдия'),
    mine ? el('button', { class: 'card rowcard asbutton', type: 'button', onclick: () => showGuild(profile, mine.id) },
      el('div', { class: 'grow' }, el('div', { class: 'title' }, mine.name),
        el('p', { class: 'muted' }, mine.status === 'pending' ? 'Ждёт подтверждения админа' : GUILD_RANK[mine.rank])),
      el('span', { class: 'gold' }, 'Открыть')) : el('p', { class: 'muted' }, 'Вы пока не в гильдии.'),
    el('button', { class: 'btn outline', type: 'button', onclick: () => showGuilds(profile) }, mine ? 'Рейтинг гильдий' : 'Гильдии и рейтинг')];
}

// 24. Список и рейтинг
async function showGuilds(profile) {
  show(false, el('p', { class: 'muted center' }, 'Загрузка…'));
  const err = errorBox();
  const { data, error } = await sb.rpc('guild_list');
  if (error) err.set(rpcError(error));
  const mine = data && data.mine, list = (data && data.guilds) || [];
  show(false,
    el('div', { class: 'head' }, el('h1', { class: 'small' }, 'Гильдии'), el('p', { class: 'muted' }, 'Объединения игроков и ведущих. У каждой свой рейтинг и журнал походов.')),
    mine ? null : el('div', { class: 'card' }, el('div', { class: 'title' }, 'Вы пока не в гильдии'),
      el('p', { class: 'muted' }, 'Подайте заявку в одну из гильдий или создайте свою. Состоять можно только в одной.'),
      el('button', { class: 'btn outline', type: 'button', onclick: () => showGuildCreate(profile) }, 'Создать гильдию')),
    el('h2', {}, 'Рейтинг гильдий'),
    el('p', { class: 'muted small' }, 'За каждую завершённую игру гильдия получает 1 очко за каждого своего человека в ней.'),
    err.node,
    list.length ? null : el('p', { class: 'muted' }, 'Гильдий пока нет.'),
    list.map((g, i) => el('button', { class: 'card rowcard asbutton', type: 'button', onclick: () => showGuild(profile, g.id) },
      el('div', { class: 'grow' }, el('div', { class: 'title' }, `${i + 1}. ${g.name}`),
        el('p', { class: 'muted' }, `Очков: ${g.points} · за 30 дней: ${g.points30}`),
        el('p', { class: 'muted' }, `Участников: ${g.members} · походов: ${g.sorties}` + (g.applied ? ' · заявка подана' : ''))),
      el('span', { class: 'gold' }, mine && mine.id === g.id ? 'Моя' : 'Открыть'))),
    el('button', { class: 'btn outline spacer', type: 'button', onclick: () => route() }, 'Назад'));
}

// 25. Создание
function showGuildCreate(profile) {
  const err = errorBox();
  const name = el('input', { id: 'gn', type: 'text', placeholder: 'Название гильдии', maxlength: '40', autocomplete: 'off' });
  const descr = el('textarea', { id: 'gd', rows: '4', placeholder: 'Кого ждём, как играем', maxlength: '500' });
  const save = el('button', { class: 'btn', type: 'button' }, profile.is_admin ? 'Создать гильдию' : 'Отправить на подтверждение');
  save.addEventListener('click', () => busy(save, 'Отправляем…', async () => {
    err.set('');
    const { data, error } = await sb.rpc('guild_create', { p_name: name.value, p_descr: descr.value });
    if (error) return err.set(rpcError(error));
    await showGuild(profile, data);
  }));
  show(false,
    el('div', { class: 'head' }, el('h1', { class: 'small' }, 'Новая гильдия'), el('p', { class: 'muted' }, 'Создать может любой игрок или ведущий.')),
    el('div', { class: 'card' },
      el('div', { class: 'field' }, el('label', { for: 'gn' }, 'Название гильдии'), name),
      el('div', { class: 'field' }, el('label', { for: 'gd' }, 'Описание'), descr),
      el('p', { class: 'muted small' }, profile.is_admin ? 'Вы станете главой. Вы админ, поэтому гильдия появится в списке сразу.' : 'Вы станете главой. Гильдия появится в списке после подтверждения админом сайта.')),
    err.node, save,
    el('button', { class: 'btn outline', type: 'button', onclick: () => showGuilds(profile) }, 'Отмена'));
}

// 26 и 27. Страница гильдии; у главы и заместителей ниже блок управления
async function showGuild(profile, gid) {
  show(false, el('p', { class: 'muted center' }, 'Загрузка…'));
  const { data: d, error } = await sb.rpc('guild_detail', { p_guild: gid });
  if (error || !d) {
    return show(false, el('p', { class: 'error' }, rpcError(error)), el('button', { class: 'btn outline', type: 'button', onclick: () => showGuilds(profile) }, 'К списку гильдий'));
  }
  const err = errorBox();
  const reload = () => showGuild(profile, gid);
  const act = (button, fn, args, after) => busy(button, '…', async () => {
    err.set('');
    const { error: e } = await sb.rpc(fn, args || {});
    if (e) return err.set(rpcError(e));
    await (after || reload)();
  });
  const isLeader = d.my_rank === 'leader', canManage = isLeader || d.my_rank === 'deputy';

  // окно «Изменить» у участника
  const memberMenu = (m) => {
    const back = el('div', { class: 'modal-back' });
    const close = () => back.remove();
    const item = (label, cls, fn, args, question) => el('button', { class: cls, type: 'button', onclick: (ev) => {
      if (question && !window.confirm(question)) return;
      close(); act(ev.currentTarget, fn, args);
    } }, label);
    back.append(el('div', { class: 'modal stack' },
      el('div', { class: 'title' }, m.name), el('p', { class: 'muted' }, GUILD_RANK[m.rank] + ' · ' + guildWho(m)),
      isLeader && m.rank === 'member' ? item('Назначить заместителем', 'btn outline', 'guild_set_rank', { p_profile: m.id, p_rank: 'deputy' }) : null,
      isLeader && m.rank === 'deputy' ? item('Вернуть в участники', 'btn outline', 'guild_set_rank', { p_profile: m.id, p_rank: 'member' }) : null,
      isLeader ? item('Передать главенство', 'btn outline', 'guild_transfer', { p_profile: m.id }, `Передать главенство: ${m.name}? Вы станете заместителем.`) : null,
      isLeader || m.rank === 'member' ? item('Исключить из гильдии', 'btn outline danger', 'guild_kick', { p_profile: m.id }, `Исключить из гильдии: ${m.name}?`) : null,
      el('button', { class: 'btn link', type: 'button', onclick: close }, 'Отмена')));
    back.addEventListener('click', (e) => { if (e.target === back) close(); });
    document.body.append(back);
  };
  const canTouch = (m) => canManage && !m.me && m.rank !== 'leader' && (isLeader || m.rank === 'member');

  const applyBtn = el('button', { class: d.applied ? 'btn outline' : 'btn', type: 'button' }, d.applied ? 'Отозвать заявку' : 'Подать заявку');
  applyBtn.addEventListener('click', () => act(applyBtn, 'guild_apply', { p_guild: gid, p_on: !d.applied }));

  show(false,
    el('div', { class: 'head' }, el('h1', { class: 'small' }, d.name), el('p', { class: 'muted' }, `Гильдия · участников: ${d.members.length}`)),
    d.status === 'pending' ? el('div', { class: 'card notice' }, el('div', { class: 'title' }, 'Ждёт подтверждения'), el('p', { class: 'muted' }, 'Гильдия появится в общем списке, когда её подтвердит админ сайта.')) : null,
    d.status === 'rejected' || d.status === 'disbanded' ? el('div', { class: 'card notice' }, el('p', { class: 'muted' }, 'Этой гильдии больше нет.')) : null,
    el('div', { class: 'card' },
      d.descr ? el('p', { class: 'muted' }, d.descr) : null,
      d.status === 'active' ? [
        el('div', { class: 'kv' }, el('span', { class: 'muted' }, 'Место в рейтинге'), el('strong', {}, String(d.place))),
        el('div', { class: 'kv' }, el('span', { class: 'muted' }, 'Очков за всё время'), el('strong', {}, String(d.points))),
        el('div', { class: 'kv' }, el('span', { class: 'muted' }, 'Очков за 30 дней'), el('strong', {}, String(d.points30))),
        el('div', { class: 'kv' }, el('span', { class: 'muted' }, 'Походов'), el('strong', {}, String(d.sorties_count)))] : null),
    err.node,
    d.status === 'active' && !d.in_any ? applyBtn : null,
    d.status === 'active' && !d.my_rank && d.in_any ? el('p', { class: 'muted small' }, 'Вы состоите в другой гильдии, поэтому подать заявку сюда нельзя.') : null,

    canManage && d.requests.length ? el('div', { class: 'card notice' }, el('div', { class: 'title' }, 'Заявки на вступление'),
      d.requests.map((r) => {
        const yes = el('button', { class: 'mini solid', type: 'button' }, 'Принять');
        const no = el('button', { class: 'mini', type: 'button' }, 'Нет');
        yes.addEventListener('click', () => act(yes, 'guild_decide', { p_request: r.id, p_ok: true }));
        no.addEventListener('click', () => act(no, 'guild_decide', { p_request: r.id, p_ok: false }));
        return el('div', { class: 'card rowcard slim' }, el('div', { class: 'grow' }, r.name, el('p', { class: 'muted small' }, guildWho(r))), yes, no);
      })) : null,

    el('h2', {}, 'Состав'),
    d.members.map((m) => el('div', { class: 'card rowcard slim' },
      el('div', { class: 'grow' }, m.name + (m.me ? ' (вы)' : ''), el('p', { class: 'muted small' }, GUILD_RANK[m.rank] + ' · ' + guildWho(m))),
      canTouch(m) ? el('button', { class: 'mini', type: 'button', onclick: () => memberMenu(m) }, 'Изменить') : null)),

    d.status === 'active' ? [el('h2', {}, 'Последние походы'),
      d.sorties.length ? d.sorties.map(sortieCard) : el('p', { class: 'muted' }, 'Походов пока нет. Они появятся после первой завершённой игры с участием гильдии.'),
      d.sorties_count > d.sorties.length ? el('button', { class: 'btn outline', type: 'button', onclick: () => showGuildJournal(profile, gid, d.name) }, 'Весь журнал походов') : null] : null,

    canManage ? el('div', { class: 'card' }, el('div', { class: 'title' }, 'Управление гильдией'),
      el('button', { class: 'btn outline', type: 'button', onclick: () => openForm({
        title: 'Гильдия',
        fields: [{ key: 'name', label: 'Название', value: d.name }, { key: 'descr', label: 'Описание', area: true, value: d.descr }],
        onSave: async (v) => { const { error: e } = await sb.rpc('guild_update', { p_name: v.name, p_descr: v.descr }); if (e) err.set(rpcError(e)); await reload(); },
      }) }, 'Изменить название и описание'),
      el('p', { class: 'muted small' }, isLeader ? 'Назначить заместителя, передать главенство или исключить: кнопка «Изменить» у участника в составе.' : 'Вы заместитель: принимаете заявки, исключаете участников и меняете описание.'),
      isLeader ? (() => {
        const b = el('button', { class: 'btn outline danger', type: 'button' }, 'Распустить гильдию');
        b.addEventListener('click', () => { if (window.confirm(`Распустить гильдию «${d.name}»? Состав и заявки удалятся, вернуть будет нельзя.`)) act(b, 'guild_disband', {}, () => showGuilds(profile)); });
        return b;
      })() : null) : null,

    d.my_rank && !isLeader ? (() => {
      const b = el('button', { class: 'btn outline danger', type: 'button' }, 'Выйти из гильдии');
      b.addEventListener('click', () => { if (window.confirm('Выйти из гильдии?')) act(b, 'guild_leave', {}, () => showGuilds(profile)); });
      return b;
    })() : null,
    el('button', { class: 'btn outline', type: 'button', onclick: () => showGuilds(profile) }, 'К списку гильдий'));
}

// 28. Журнал походов
async function showGuildJournal(profile, gid, name) {
  show(false, el('p', { class: 'muted center' }, 'Загрузка…'));
  const { data, error } = await sb.rpc('guild_journal', { p_guild: gid });
  const list = data || [];
  show(false,
    el('div', { class: 'head' }, el('h1', { class: 'small' }, 'Журнал походов'), el('p', { class: 'muted' }, name)),
    error ? el('p', { class: 'error' }, rpcError(error)) : null,
    el('div', { class: 'card' },
      el('div', { class: 'kv' }, el('span', { class: 'muted' }, 'Всего походов'), el('strong', {}, String(list.length))),
      el('div', { class: 'kv' }, el('span', { class: 'muted' }, 'Всего очков'), el('strong', {}, String(list.reduce((a, s) => a + (s.points || 0), 0))))),
    list.map(sortieCard),
    el('p', { class: 'muted small' }, 'В журнал попадает каждая завершённая игра, где был хотя бы один человек из гильдии.'),
    el('button', { class: 'btn outline', type: 'button', onclick: () => showGuild(profile, gid) }, 'Назад'));
}

// 29. Карточка для экрана админа: подтверждение новых гильдий
async function guildAdminBlock(profile, refresh) {
  const { data, error } = await sb.rpc('guild_admin_list');
  if (error || !data || !data.length) return null;
  const err = errorBox();
  return el('div', { class: 'card notice' }, el('div', { class: 'title' }, 'Новые гильдии'), err.node,
    data.map((g) => {
      const yes = el('button', { class: 'mini solid', type: 'button' }, 'Да');
      const no = el('button', { class: 'mini', type: 'button' }, 'Нет');
      const go = (b, ok) => busy(b, '…', async () => { const { error: e } = await sb.rpc('guild_admin_decide', { p_guild: g.id, p_ok: ok }); if (e) return err.set(rpcError(e)); await refresh(); });
      yes.addEventListener('click', () => go(yes, true)); no.addEventListener('click', () => go(no, false));
      return el('div', { class: 'card rowcard slim' }, el('div', { class: 'grow' }, g.name, el('p', { class: 'muted small' }, 'Глава: ' + g.leader + (g.descr ? ' · ' + g.descr : ''))), yes, no);
    }));
}
