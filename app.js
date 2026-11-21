// Сайт «Отправиться в путешествие?» — шаг 2: регистрация, вход, заявки админа.
// Ключ ниже — открытый (publishable): он предназначен для сайта, данные защищает база.
const SUPABASE_URL = 'https://jurpenbisavgrqpdqwhx.supabase.co';
const SUPABASE_KEY = 'sb_publishable_wXCrGg4ivVRKyMSJPuhEuA_R5Dy_0iM';
const EMAIL_DOMAIN = 'igrok.puteshestvie.kz';

const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
const app = document.getElementById('app');

// ---------- помощники ----------

// Собирает элемент. Текст всегда вставляется как текст, не как разметка.
function el(tag, props, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props || {})) {
    if (value === null || value === undefined || value === false) continue;
    if (key === 'class') node.className = value;
    else if (key.startsWith('on')) node.addEventListener(key.slice(2), value);
    else if (key === 'hidden') node.hidden = true;
    else node.setAttribute(key, value === true ? '' : value);
  }
  for (const child of children.flat()) {
    if (child === null || child === undefined || child === false) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}

function show(centered, ...children) {
  app.className = centered ? 'screen centered' : 'screen';
  app.replaceChildren(...children.flat().filter(Boolean));
  window.scrollTo(0, 0);
}

// Номер → 7XXXXXXXXXX (11 цифр) или null
function normalizePhone(raw) {
  let d = String(raw || '').replace(/\D/g, '');
  if (d.length === 10) d = '7' + d;
  if (d.length === 11 && d.startsWith('8')) d = '7' + d.slice(1);
  return /^7\d{10}$/.test(d) ? d : null;
}

function prettyPhone(d) {
  if (!/^7\d{10}$/.test(d || '')) return d || '';
  return `+7 ${d.slice(1, 4)} ${d.slice(4, 7)} ${d.slice(7, 9)} ${d.slice(9, 11)}`;
}

function field(id, label, type, placeholder, extra) {
  const input = el('input', Object.assign({ id, type, placeholder, autocomplete: 'off' }, extra || {}));
  return { input, node: el('div', { class: 'field' }, el('label', { for: id }, label), input) };
}

function errorBox() {
  const node = el('p', { class: 'error', role: 'alert', hidden: true });
  return {
    node,
    set(text) { node.textContent = text || ''; node.hidden = !text; },
  };
}

async function busy(button, text, work) {
  const old = button.textContent;
  button.disabled = true;
  button.textContent = text;
  try {
    return await work();
  } finally {
    button.disabled = false;
    button.textContent = old;
  }
}

// ---------- экраны ----------

function showLogin(prefillPhone) {
  const phone = field('phone', 'Номер телефона', 'tel', '+7 ___ ___ __ __', { autocomplete: 'tel', inputmode: 'tel' });
  const pass = field('pass', 'Пароль', 'password', 'Ваш пароль', { autocomplete: 'current-password' });
  if (prefillPhone) phone.input.value = prettyPhone(prefillPhone);
  const err = errorBox();
  const submit = el('button', { class: 'btn', type: 'submit' }, 'Войти');

  const form = el('form', { class: 'stack', novalidate: true, onsubmit: async (e) => {
    e.preventDefault();
    err.set('');
    const d = normalizePhone(phone.input.value);
    if (!d) return err.set('Проверьте номер телефона: нужно 11 цифр.');
    if (!pass.input.value) return err.set('Введите пароль.');
    await busy(submit, 'Входим…', async () => {
      const { error } = await sb.auth.signInWithPassword({ email: `${d}@${EMAIL_DOMAIN}`, password: pass.input.value });
      if (error) {
        err.set(/invalid login/i.test(error.message) ? 'Неверный номер или пароль.' : 'Не получилось войти. Проверьте интернет и попробуйте ещё раз.');
        return;
      }
      await route();
    });
  } }, phone.node, pass.node, err.node, submit);

  show(true,
    el('div', { class: 'head' },
      el('h1', {}, 'Отправиться в путешествие?'),
      el('p', { class: 'muted' }, 'Войдите, чтобы открыть своего персонажа')),
    form,
    el('button', { class: 'btn link', type: 'button', onclick: () => showRegister() }, 'Нет аккаунта? Зарегистрироваться'));
}

function showRegister() {
  let role = 'player';
  const notes = {
    player: 'Игрок ведёт своего персонажа и вступает в группу по коду.',
    master: 'Ведущий смотрит персонажей группы, но ничего не меняет.',
  };
  const note = el('p', { class: 'muted' }, notes.player);
  const bPlayer = el('button', { type: 'button', 'aria-pressed': 'true' }, 'Игрок');
  const bMaster = el('button', { type: 'button', 'aria-pressed': 'false' }, 'Ведущий');
  const pick = (r) => {
    role = r;
    bPlayer.setAttribute('aria-pressed', String(r === 'player'));
    bMaster.setAttribute('aria-pressed', String(r === 'master'));
    note.textContent = notes[r];
  };
  bPlayer.addEventListener('click', () => pick('player'));
  bMaster.addEventListener('click', () => pick('master'));

  const name = field('rname', 'Ваше имя', 'text', 'Как вас зовут', { autocomplete: 'name', maxlength: '40' });
  const phone = field('rphone', 'Номер телефона', 'tel', '+7 ___ ___ __ __', { autocomplete: 'tel', inputmode: 'tel' });
  const pass = field('rpass', 'Пароль', 'password', 'Не короче 6 символов', { autocomplete: 'new-password' });
  const pass2 = field('rpass2', 'Пароль ещё раз', 'password', 'Повторите пароль', { autocomplete: 'new-password' });
  const err = errorBox();
  const submit = el('button', { class: 'btn', type: 'submit' }, 'Отправить заявку');

  const form = el('form', { class: 'stack', novalidate: true, onsubmit: async (e) => {
    e.preventDefault();
    err.set('');
    const n = name.input.value.trim();
    const d = normalizePhone(phone.input.value);
    const p = pass.input.value;
    if (n.length < 2) return err.set('Введите имя.');
    if (!d) return err.set('Проверьте номер телефона: нужно 11 цифр.');
    if (p.length < 6) return err.set('Пароль должен быть не короче 6 символов.');
    if (p !== pass2.input.value) return err.set('Пароли не совпадают.');

    await busy(submit, 'Отправляем…', async () => {
      let res, data;
      try {
        res = await fetch(`${SUPABASE_URL}/functions/v1/register`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', apikey: SUPABASE_KEY },
          body: JSON.stringify({ name: n, phone: d, password: p, role }),
        });
        data = await res.json().catch(() => ({}));
      } catch (_) {
        return err.set('Нет связи с сервером. Проверьте интернет и попробуйте ещё раз.');
      }
      if (!res.ok) return err.set(data.error || 'Не получилось отправить заявку. Попробуйте ещё раз.');

      if (data.approved) {
        // первый зарегистрированный — админ сайта, входит сразу
        const { error } = await sb.auth.signInWithPassword({ email: `${d}@${EMAIL_DOMAIN}`, password: p });
        if (error) return showLogin(d);
        return route();
      }
      showSent(d);
    });
  } },
    el('div', { class: 'field' }, el('div', { class: 'label' }, 'Я захожу как'), el('div', { class: 'choice' }, bPlayer, bMaster), note),
    name.node, phone.node, pass.node, pass2.node, err.node, submit);

  show(false,
    el('div', { class: 'head' },
      el('h1', {}, 'Регистрация'),
      el('p', { class: 'muted' }, 'Войти можно будет после того, как заявку подтвердит админ сайта.')),
    form,
    el('button', { class: 'btn link', type: 'button', onclick: () => showLogin() }, 'Уже есть аккаунт? Войти'));
}

function showSent(phone) {
  show(true,
    el('div', { class: 'card notice' },
      el('div', { class: 'title' }, 'Заявка отправлена'),
      el('p', { class: 'muted' }, 'Админ сайта увидит её и подтвердит. После этого войдите по своему номеру и паролю.')),
    el('button', { class: 'btn outline', type: 'button', onclick: () => showLogin(phone) }, 'На экран входа'));
}

function showWaiting(profile) {
  const rejected = profile.status === 'rejected';
  show(true,
    el('div', { class: 'card notice' },
      el('div', { class: 'title' }, rejected ? 'Заявка отклонена' : 'Заявка ждёт подтверждения'),
      el('p', { class: 'muted' }, rejected
        ? 'Админ сайта отклонил заявку. Если это ошибка, свяжитесь с ним.'
        : `${profile.name}, админ сайта ещё не подтвердил вашу заявку. Загляните позже.`)),
    rejected ? null : el('button', { class: 'btn', type: 'button', onclick: () => route() }, 'Проверить ещё раз'),
    el('button', { class: 'btn outline', type: 'button', onclick: logout }, 'Выйти'));
}

async function showHome(profile) {
  let pending = null;
  if (profile.is_admin) {
    const { count, error } = await sb.from('profiles').select('id', { count: 'exact', head: true }).eq('status', 'pending');
    pending = error ? null : (count || 0);
  }
  show(false,
    el('div', { class: 'head' },
      el('h1', { class: 'small' }, `Здравствуйте, ${profile.name}!`),
      el('p', { class: 'muted' }, profile.role === 'master' ? 'Вы вошли как ведущий.' : 'Вы вошли как игрок.')),
    profile.is_admin ? el('div', { class: 'card notice' },
      el('div', { class: 'title' }, 'Вы — админ сайта'),
      el('p', { class: 'muted' }, pending === null ? 'Не удалось проверить заявки.' : (pending > 0 ? `Новых заявок на вход: ${pending}` : 'Новых заявок на вход нет.')),
      el('button', { class: 'btn', type: 'button', onclick: () => showAdmin(profile) }, 'Заявки на вход')) : null,
    el('div', { class: 'card' },
      el('div', { class: 'title' }, 'Персонажи'),
      el('p', { class: 'muted' }, 'Загрузка персонажа и его лист появятся на следующем шаге сборки сайта.')),
    el('button', { class: 'btn outline spacer', type: 'button', onclick: () => showChangePassword(profile) }, 'Сменить пароль'),
    el('button', { class: 'btn outline', type: 'button', onclick: logout }, 'Выйти'));
}

function showChangePassword(profile) {
  const pass = field('npass', 'Новый пароль', 'password', 'Не короче 6 символов', { autocomplete: 'new-password' });
  const pass2 = field('npass2', 'Новый пароль ещё раз', 'password', 'Повторите пароль', { autocomplete: 'new-password' });
  const err = errorBox();
  const submit = el('button', { class: 'btn', type: 'submit' }, 'Сохранить пароль');

  const form = el('form', { class: 'stack', novalidate: true, onsubmit: async (e) => {
    e.preventDefault();
    err.set('');
    const p = pass.input.value;
    if (p.length < 6) return err.set('Пароль должен быть не короче 6 символов.');
    if (p !== pass2.input.value) return err.set('Пароли не совпадают.');
    await busy(submit, 'Сохраняем…', async () => {
      const { error } = await sb.auth.updateUser({ password: p });
      if (error) return err.set('Не получилось сменить пароль. Попробуйте ещё раз.');
      show(true,
        el('div', { class: 'card notice' },
          el('div', { class: 'title' }, 'Пароль изменён'),
          el('p', { class: 'muted' }, 'В следующий раз входите с новым паролем.')),
        el('button', { class: 'btn', type: 'button', onclick: () => route() }, 'Готово'));
    });
  } }, pass.node, pass2.node, err.node, submit);

  show(false,
    el('div', { class: 'head' },
      el('h1', { class: 'small' }, 'Смена пароля'),
      el('p', { class: 'muted' }, `Номер: ${prettyPhone(profile.phone)}`)),
    form,
    el('button', { class: 'btn outline spacer', type: 'button', onclick: () => route() }, 'Назад'));
}

async function showAdmin(profile) {
  if (!profile.is_admin) return showHome(profile);
  show(false, el('p', { class: 'muted center' }, 'Загрузка…'));

  const { data, error } = await sb.from('profiles')
    .select('id, name, phone, role, created_at')
    .eq('status', 'pending')
    .order('created_at', { ascending: true });

  const err = errorBox();
  if (error) err.set('Не удалось загрузить заявки. Попробуйте ещё раз.');

  const decide = async (button, id, status) => {
    err.set('');
    await busy(button, '…', async () => {
      const { data: rows, error: upErr } = await sb.from('profiles').update({ status }).eq('id', id).select('id');
      if (upErr || !rows || rows.length === 0) return err.set('Не получилось сохранить решение. Попробуйте ещё раз.');
      await showAdmin(profile);
    });
  };

  const cards = (data || []).map((p) => {
    const yes = el('button', { class: 'btn', type: 'button' }, 'Принять');
    const no = el('button', { class: 'btn outline', type: 'button', style: 'min-height:54px' }, 'Отклонить');
    yes.addEventListener('click', () => decide(yes, p.id, 'approved'));
    no.addEventListener('click', () => decide(no, p.id, 'rejected'));
    return el('div', { class: 'card' },
      el('div', { class: 'title' }, p.name),
      el('p', { class: 'muted' }, `${prettyPhone(p.phone)} · ${p.role === 'master' ? 'ведущий' : 'игрок'}`),
      el('div', { class: 'row2' }, yes, no));
  });

  // участники, которым админ может сбросить пароль
  const { data: members, error: mErr } = await sb.from('profiles')
    .select('id, name, phone, role, is_admin')
    .eq('status', 'approved')
    .order('name', { ascending: true });

  const memberCards = (members || []).map((m) => {
    const result = el('p', { class: 'muted', hidden: true });
    const reset = el('button', { class: 'btn outline', type: 'button' }, 'Сбросить пароль');
    reset.addEventListener('click', async () => {
      if (!window.confirm(`Сбросить пароль: ${m.name}? Старый пароль перестанет работать.`)) return;
      err.set('');
      await busy(reset, 'Сбрасываем…', async () => {
        const { data: out, error: fnErr } = await sb.functions.invoke('admin-reset-password', { body: { user_id: m.id } });
        if (fnErr || !out || !out.password) return err.set('Не получилось сбросить пароль. Попробуйте ещё раз.');
        result.hidden = false;
        result.replaceChildren('Временный пароль: ', el('strong', { style: 'color:#EDEAE2;font-size:18px;letter-spacing:0.06em' }, out.password),
          '. Передайте его участнику. После входа пусть сменит пароль кнопкой «Сменить пароль».');
      });
    });
    return el('div', { class: 'card' },
      el('div', { class: 'title' }, m.name + (m.is_admin ? ' (админ)' : '')),
      el('p', { class: 'muted' }, `${prettyPhone(m.phone)} · ${m.role === 'master' ? 'ведущий' : 'игрок'}`),
      reset, result);
  });

  show(false,
    el('div', { class: 'head' },
      el('h1', { class: 'small' }, 'Заявки на вход'),
      el('p', { class: 'muted' }, 'Этот экран видит только админ сайта.')),
    err.node,
    cards.length ? cards : (error ? null : el('div', { class: 'card' }, el('p', { class: 'muted' }, 'Новых заявок нет.'))),
    el('h1', { class: 'small', style: 'margin-top:10px' }, 'Участники'),
    mErr ? el('p', { class: 'error' }, 'Не удалось загрузить участников.') : memberCards,
    el('button', { class: 'btn outline spacer', type: 'button', onclick: () => route() }, 'Назад'));
}

// ---------- вход, выход, маршрут ----------

async function logout() {
  await sb.auth.signOut();
  showLogin();
}

async function route() {
  const { data: { session } } = await sb.auth.getSession();
  if (!session) return showLogin();

  const { data: profile, error } = await sb.from('profiles')
    .select('id, name, phone, role, status, is_admin')
    .eq('id', session.user.id)
    .maybeSingle();

  if (error) {
    return show(true,
      el('p', { class: 'error' }, 'Не удалось загрузить данные. Проверьте интернет.'),
      el('button', { class: 'btn', type: 'button', onclick: () => route() }, 'Попробовать ещё раз'),
      el('button', { class: 'btn outline', type: 'button', onclick: logout }, 'Выйти'));
  }
  if (!profile) { await sb.auth.signOut(); return showLogin(); }
  if (profile.status !== 'approved') return showWaiting(profile);
  return showHome(profile);
}

route();
