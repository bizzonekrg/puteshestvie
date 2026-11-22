// Таймер игры. Запускает ведущий, видят все участники группы: на странице группы и над лентой чата.

function timerClock(sec) {
  sec = Math.max(0, Math.floor(sec));
  return Math.floor(sec / 3600) + ':' + String(Math.floor((sec % 3600) / 60)).padStart(2, '0');
}

// Строка «Игра идёт: 1:25 из 4:00». onState(state) — если нужно знать, запущен ли таймер.
function timerBar(gid, onState) {
  const val = el('strong', {}, '');
  const node = el('div', { class: 'timerbar', hidden: true }, el('span', { class: 'muted' }, 'Игра идёт'), val);
  let st = null, got = 0, ticked = '';
  const draw = () => {
    if (!st || !st.on) { node.hidden = true; return; }
    const sec = st.elapsed + (Date.now() - got) / 1000, total = st.minutes * 60, left = total - sec;
    node.hidden = false;
    node.classList.toggle('warn', left <= 1800 && left > 0);
    node.classList.toggle('over', left <= 0);
    val.textContent = left <= 0 ? `Время вышло · ${timerClock(sec)}` : `${timerClock(sec)} из ${timerClock(total)}`;
    // один раз на порог просим сервер дописать строку в чат (сервер сам следит, чтобы не было повторов)
    const mark = left <= 0 ? 'over' : left <= 1800 ? 'warn' : '';
    if (mark && mark !== ticked) { ticked = mark; sb.rpc('game_tick', { p_group: gid }).then(() => {}, () => {}); }
  };
  const load = async () => {
    const { data, error } = await sb.rpc('game_state', { p_group: gid });
    if (error || !data) return;
    st = data; got = Date.now();
    if (onState) onState(st);
    draw();
  };
  load();
  let n = 0;
  const timer = setInterval(() => {
    if (!document.body.contains(node)) return clearInterval(timer);
    if (document.visibilityState !== 'visible') return;
    n += 1;
    if (n % 30 === 0) load(); else draw();
  }, 1000);
  node.reload = load;
  return node;
}

// Карточка ведущего: запуск, длительность, остановка
function timerMasterCard(gid) {
  const err = errorBox();
  const body = el('div', { class: 'stack' });
  const bar = timerBar(gid, (st) => render(st));
  const call = async (button, action, minutes) => {
    err.set('');
    await busy(button, '…', async () => {
      const { error } = await sb.rpc('game_timer', { p_group: gid, p_action: action, p_minutes: minutes || 240 });
      if (error) return err.set(rpcError(error));
      await bar.reload();
    });
  };
  const hoursToMin = (raw) => Math.round(parseFloat(String(raw).replace(',', '.')) * 60);
  function render(st) {
    if (!st.on) {
      const inp = el('input', { id: 'gthours', type: 'text', inputmode: 'decimal', autocomplete: 'off' });
      inp.value = '4';
      const start = el('button', { class: 'btn', type: 'button' }, 'Начать игру');
      start.addEventListener('click', () => { const m = hoursToMin(inp.value); if (!(m > 0)) return err.set('Впишите число часов, например 4 или 3,5.'); call(start, 'start', m); });
      body.replaceChildren(el('p', { class: 'muted' }, 'Запустите таймер, когда начнёте. Его увидят все в группе.'),
        el('div', { class: 'field' }, el('label', { for: 'gthours' }, 'Сколько длится игра, часов'), inp), start);
      return;
    }
    const t = new Date(st.started_at), end = new Date(t.getTime() + st.minutes * 60000);
    const hm = (d) => String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
    const change = el('button', { class: 'btn outline', type: 'button' }, 'Изменить длительность');
    change.addEventListener('click', () => {
      const raw = window.prompt('Сколько всего длится игра, часов', String(Math.round(st.minutes / 6) / 10).replace('.', ','));
      if (raw === null) return;
      const m = hoursToMin(raw); if (!(m > 0)) return err.set('Впишите число часов, например 4 или 3,5.');
      call(change, 'set', m);
    });
    const stop = el('button', { class: 'btn outline', type: 'button' }, 'Остановить таймер');
    stop.addEventListener('click', () => { if (window.confirm('Остановить таймер? Это не перерыв: таймер уберётся у всех.')) call(stop, 'stop'); });
    body.replaceChildren(el('p', { class: 'muted small' }, `Начата в ${hm(t)}, по плану до ${hm(end)}.`), change, stop);
  }
  return el('div', { class: 'card' }, el('div', { class: 'title' }, 'Игра'), bar, body, err.node,
    el('p', { class: 'muted small' }, 'Таймер ничего не блокирует. Игру завершаете вы кнопкой «Завершить игру».'));
}
