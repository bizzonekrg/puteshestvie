// Шаг 5: конец игры — ведущий выдаёт награды, игрок принимает награду и обязательно оценивает ведущего.
// Общие помощники (el, show, sb, busy, errorBox, route) — в app.js; rpcError, ratingText — в groups.js; toInt — в sheet.js.

// ---------- ведущий: завершение игры ----------

function showFinish(profile, gid, d) {
  const err = errorBox();
  const rows = (d.members || []).map((m, i) => {
    const input = (id, placeholder, numeric) => el('input', { id: id + i, type: 'text', inputmode: numeric ? 'numeric' : null, placeholder, autocomplete: 'off' });
    const xp = input('fxp', '+0', true);
    const gold = input('fgp', '+0', true);
    const coin = coinSelect('fcn' + i);
    const level = el('input', { id: 'flv' + i, type: 'checkbox', class: 'check' });
    // предмет выбирается из списка или создаётся свой — во всплывающем окне
    const row = { gift: null };
    const giftText = el('p', { class: 'muted' }, 'Предмет не выбран.');
    const giftBtn = el('button', { class: 'btn outline', type: 'button' }, 'Выбрать предмет');
    const giftDrop = el('button', { class: 'btn link', type: 'button', hidden: true }, 'Убрать предмет');
    giftBtn.addEventListener('click', () => openGiftModal((r) => {
      row.gift = r.gift;
      giftText.textContent = `Предмет: ${r.label}${r.gift.dmg ? ' · ' + r.gift.dmg : ''}${r.gift.qty > 1 ? ' · ' + r.gift.qty + ' шт.' : ''}`;
      giftBtn.textContent = 'Выбрать другой предмет';
      giftDrop.hidden = false;
    }));
    giftDrop.addEventListener('click', () => {
      row.gift = null;
      giftText.textContent = 'Предмет не выбран.';
      giftBtn.textContent = 'Выбрать предмет';
      giftDrop.hidden = true;
    });
    return Object.assign(row, {
      m, xp, gold, coin, level,
      node: el('div', { class: 'card' },
        el('div', { class: 'title' }, m.character),
        el('p', { class: 'muted' }, `${m.class_name || 'Персонаж'} · ${m.level} ур. · игрок: ${m.name}`),
        el('div', { class: 'grid2' },
          el('div', { class: 'field' }, el('label', { for: 'fxp' + i }, 'Опыт'), xp),
          el('div', { class: 'field' }, el('label', { for: 'fgp' + i }, 'Монеты'), gold)),
        el('div', { class: 'field' }, el('label', { for: 'fcn' + i }, 'Какие монеты'), coin),
        giftText, giftBtn, giftDrop,
        el('label', { class: 'checkrow', for: 'flv' + i }, level, 'Повысить уровень')),
    });
  });

  const submit = el('button', { class: 'btn', type: 'button' }, 'Завершить игру и выдать награды');
  submit.addEventListener('click', async () => {
    err.set('');
    if (!window.confirm('Завершить игру? Награды уйдут игрокам, группа распустится. Отменить это будет нельзя.')) return;
    const rewards = rows.map((r) => ({
      character_id: r.m.character_id,
      xp: Math.max(0, toInt(r.xp.value, 0)),
      gold: Math.max(0, toInt(r.gold.value, 0)),
      coin: r.coin.value,
      gift: r.gift,
      level_up: r.level.checked,
    }));
    await busy(submit, 'Завершаем…', async () => {
      const { error } = await sb.rpc('finish_game', { p_group: gid, p_rewards: rewards });
      if (error) { err.set(rpcError(error)); return; }
      show(true,
        el('div', { class: 'card notice' },
          el('div', { class: 'title' }, 'Игра завершена'),
          el('p', { class: 'muted' }, 'Награды выданы, группа распущена. Игроки увидят награду и поставят вам оценку при следующем входе.')),
        el('button', { class: 'btn', type: 'button', onclick: () => route() }, 'Готово'));
    });
  });

  show(false,
    el('div', { class: 'head' },
      el('h1', { class: 'small' }, 'Завершение игры'),
      el('p', { class: 'muted' }, `Группа «${d.name}». Выдайте награды — игроки примут их сами. После этого группа распускается.`)),
    rows.length ? rows.map((r) => r.node) : el('p', { class: 'muted' }, 'В группе нет игроков.'),
    err.node,
    submit,
    el('button', { class: 'btn outline', type: 'button', onclick: () => showGroup(profile, gid) }, 'Назад к группе'));
}

// ---------- игрок: награда ----------

function showReward(profile, r, moreCount) {
  const err = errorBox();
  const line = (a, b) => el('div', { class: 'kv' }, el('span', { class: 'muted' }, a), el('strong', {}, b));
  const empty = !r.xp && !r.gold && !r.item && !r.level_up;
  const accept = el('button', { class: 'btn', type: 'button' }, 'Принять награду');
  accept.addEventListener('click', async () => {
    err.set('');
    await busy(accept, 'Принимаем…', async () => {
      const { error } = await sb.rpc('accept_reward', { p_reward: r.id });
      if (error) return err.set(rpcError(error));
      await route();
    });
  });

  show(true,
    el('div', { class: 'head' },
      el('h1', { class: 'small' }, 'Награда от ведущего'),
      el('p', { class: 'muted' }, `Игра «${r.group}» завершена. Ведущий: ${r.master || '—'}.`)),
    el('div', { class: 'card notice' },
      el('div', { class: 'title' }, r.character),
      line('Опыт', `+${r.xp}`),
      line('Монеты', `+${r.gold} ${coinLabel(r.coin)}`),
      line('Предмет', r.item || '—'),
      line('Уровень', r.level_up ? `повышение до ${Math.min(20, (r.level || 1) + 1)}` : 'без изменений'),
      empty ? el('p', { class: 'muted' }, 'В этот раз ведущий ничего не выдал.') : null),
    el('p', { class: 'muted' }, r.level_up
      ? 'Опыт, монеты и новый уровень запишутся в лист сами, предмет появится в листе, когда вы его откроете. Новые хиты, заклинания и умения за уровень добавьте сами.'
      : 'Опыт и монеты запишутся в лист сами, предмет появится в листе, когда вы его откроете.'),
    moreCount > 0 ? el('p', { class: 'muted' }, `Ещё наград ждёт: ${moreCount}`) : null,
    err.node,
    accept,
    el('button', { class: 'btn link', type: 'button', onclick: logout }, 'Выйти'));
}

// ---------- игрок: обязательная оценка ведущего ----------

function showRate(profile, t) {
  const err = errorBox();
  let score = 0;
  const buttons = [];
  for (let n = 1; n <= 10; n++) {
    const b = el('button', { type: 'button', 'aria-pressed': 'false', 'aria-label': `Оценка ${n}` }, String(n));
    b.addEventListener('click', () => {
      score = n;
      buttons.forEach((x, i) => x.setAttribute('aria-pressed', String(i + 1 === n)));
    });
    buttons.push(b);
  }
  const comment = el('textarea', { id: 'rcomment', rows: '4', placeholder: 'Что понравилось, что улучшить', maxlength: '500' });
  const send = el('button', { class: 'btn', type: 'button' }, 'Отправить оценку и продолжить');
  send.addEventListener('click', async () => {
    err.set('');
    if (!score) return err.set('Выберите оценку от 1 до 10.');
    await busy(send, 'Отправляем…', async () => {
      const { error } = await sb.rpc('rate_master', { p_rating: t.id, p_score: score, p_comment: comment.value });
      if (error) return err.set(rpcError(error));
      await route();
    });
  });

  show(false,
    el('div', { class: 'head' },
      el('h1', { class: 'small' }, 'Оцените ведущего'),
      el('p', { class: 'muted' }, 'Пока не поставите оценку, всё остальное закрыто: и персонаж, и группы.')),
    el('div', { class: 'card' },
      el('div', { class: 'title' }, t.master || 'Ведущий'),
      el('p', { class: 'muted' }, `Игра «${t.group}» · ${ratingText({ rated: t.rated, rating: t.rating })}`),
      el('div', { class: 'label' }, 'Ваша оценка от 1 до 10'),
      el('div', { class: 'scores' }, buttons),
      el('div', { class: 'field' }, el('label', { for: 'rcomment' }, 'Комментарий (не обязательно)'), comment)),
    el('p', { class: 'muted' }, 'Ведущий видит только общий рейтинг, а не кто какую оценку поставил.'),
    err.node,
    send,
    el('button', { class: 'btn link', type: 'button', onclick: logout }, 'Выйти'));
}

// Блок рейтинга для главного экрана ведущего
async function masterStatsBlock() {
  const { data, error } = await sb.rpc('master_stats');
  if (error || !data) return null;
  return el('div', { class: 'card tight' },
    el('div', { class: 'label' }, 'Ваш рейтинг ведущего'),
    el('div', { class: 'title' }, data.rated ? `${String(data.rating).replace('.', ',')} из 10` : 'Оценок пока нет'),
    el('p', { class: 'muted' }, `Оценок: ${data.rated || 0} · проведено игр: ${data.games || 0}`));
}
