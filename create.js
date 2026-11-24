// Пошаговое создание персонажа по правилам ДнД 2024.
// Порядок шагов как в книге правил: класс → предыстория → вид → характеристики → навыки и снаряжение → проверка.
// Общие помощники (el, show, sb, busy, errorBox, route) — в app.js; DEFAULT_SKILLS, STAT_*, modOf, signed, toInt, clamp, openCharacter, showUpload — в sheet.js.

const ALL_SKILLS = ['Акробатика', 'Анализ', 'Аркана', 'Атлетика', 'Внимательность', 'Выживание', 'Выступление', 'Запугивание', 'История', 'Ловкость рук', 'Медицина', 'Обман', 'Природа', 'Проницательность', 'Религия', 'Скрытность', 'Убеждение', 'Уход за животными'];

// Доспехи стартовых наборов: [название, базовый КД, сколько Ловкости идёт в КД (null — вся)]
const C_ARMOR = { leather: ['Кожаный доспех', 11, null], studded: ['Проклёпанный кожаный доспех', 12, null], chainshirt: ['Кольчужная рубаха', 13, 2], chainmail: ['Кольчуга', 16, 0] };

// eq: варианты снаряжения. w — оружие из списка сайта [название, штук]; i — прочие вещи [название, штук]; a — доспех; sh — щит; g — золото.
const C_CLASSES = [
  { name: 'Бард', die: 8, saves: ['dex', 'cha'], n: 3, skills: null, cast: 'cha', rec: ['cha', 'dex', 'con', 'wis', 'int', 'str'],
    about: 'Музыкант и помощник. Вдохновляет союзников, много навыков, магия.',
    prof: 'Лёгкие доспехи. Простое оружие. Три музыкальных инструмента.',
    eq: [{ label: 'Набор барда', a: 'leather', w: [['Кинжал', 2]], i: [['Музыкальный инструмент', 1], ['Набор артиста', 1]], g: 19 }, { label: 'Только золото', g: 90 }] },
  { name: 'Варвар', die: 12, saves: ['str', 'con'], n: 2, skills: ['Уход за животными', 'Атлетика', 'Запугивание', 'Природа', 'Внимательность', 'Выживание'], cast: null, rec: ['str', 'con', 'dex', 'wis', 'cha', 'int'],
    about: 'Боец ближнего боя. Ярость, много хитов, простая игра.',
    prof: 'Лёгкие и средние доспехи, щиты. Простое и воинское оружие.',
    eq: [{ label: 'Набор варвара', w: [['Секира', 1], ['Ручной топор', 4]], i: [['Набор путешественника', 1]], g: 15 }, { label: 'Только золото', g: 75 }] },
  { name: 'Воин', die: 10, saves: ['str', 'con'], n: 2, skills: ['Акробатика', 'Уход за животными', 'Атлетика', 'История', 'Проницательность', 'Запугивание', 'Убеждение', 'Внимательность', 'Выживание'], cast: null, rec: ['str', 'con', 'dex', 'wis', 'cha', 'int'],
    about: 'Мастер оружия и доспехов. Проще всего для новичка.',
    prof: 'Все доспехи и щиты. Простое и воинское оружие.',
    eq: [{ label: 'Тяжёлый набор', a: 'chainmail', w: [['Двуручный меч', 1], ['Цеп', 1], ['Метательное копьё', 8]], i: [['Набор исследователя подземелий', 1]], g: 4 },
      { label: 'Набор стрелка', a: 'studded', w: [['Скимитар', 1], ['Короткий меч', 1], ['Длинный лук', 1]], i: [['Стрелы', 20], ['Колчан', 1], ['Набор исследователя подземелий', 1]], g: 11 },
      { label: 'Только золото', g: 155 }] },
  { name: 'Волшебник', die: 6, saves: ['int', 'wis'], n: 2, skills: ['Аркана', 'История', 'Проницательность', 'Анализ', 'Медицина', 'Природа', 'Религия'], cast: 'int', rec: ['int', 'con', 'dex', 'wis', 'cha', 'str'],
    about: 'Учёный маг. Самый большой выбор заклинаний, но мало хитов.',
    prof: 'Доспехов нет. Простое оружие.',
    eq: [{ label: 'Набор волшебника', w: [['Кинжал', 2], ['Боевой посох', 1]], i: [['Мантия', 1], ['Книга заклинаний', 1], ['Набор учёного', 1]], g: 5 }, { label: 'Только золото', g: 55 }] },
  { name: 'Друид', die: 8, saves: ['int', 'wis'], n: 2, skills: ['Уход за животными', 'Аркана', 'Проницательность', 'Медицина', 'Природа', 'Внимательность', 'Религия', 'Выживание'], cast: 'wis', rec: ['wis', 'con', 'dex', 'int', 'cha', 'str'],
    about: 'Маг природы. Превращается в зверей, лечит, управляет стихиями.',
    prof: 'Лёгкие доспехи и щиты. Простое оружие. Набор травника.',
    eq: [{ label: 'Набор друида', a: 'leather', sh: true, w: [['Серп', 1], ['Боевой посох', 1]], i: [['Набор путешественника', 1], ['Набор травника', 1]], g: 9 }, { label: 'Только золото', g: 50 }] },
  { name: 'Жрец', die: 8, saves: ['wis', 'cha'], n: 2, skills: ['История', 'Проницательность', 'Медицина', 'Убеждение', 'Религия'], cast: 'wis', rec: ['wis', 'con', 'str', 'dex', 'cha', 'int'],
    about: 'Лекарь и защитник. Лечение, поддержка, божественная магия.',
    prof: 'Лёгкие и средние доспехи, щиты. Простое оружие.',
    eq: [{ label: 'Набор жреца', a: 'chainshirt', sh: true, w: [['Булава', 1]], i: [['Священный символ', 1], ['Набор священника', 1]], g: 7 }, { label: 'Только золото', g: 110 }] },
  { name: 'Колдун', die: 8, saves: ['wis', 'cha'], n: 2, skills: ['Аркана', 'Обман', 'История', 'Запугивание', 'Анализ', 'Природа', 'Религия'], cast: 'cha', rec: ['cha', 'con', 'dex', 'wis', 'int', 'str'],
    about: 'Маг с покровителем. Мало ячеек, но они возвращаются после короткого отдыха.',
    prof: 'Лёгкие доспехи. Простое оружие.',
    eq: [{ label: 'Набор колдуна', a: 'leather', w: [['Серп', 1], ['Кинжал', 2]], i: [['Магическая фокусировка (сфера)', 1], ['Книга (оккультные знания)', 1], ['Набор учёного', 1]], g: 15 }, { label: 'Только золото', g: 100 }] },
  { name: 'Монах', die: 8, saves: ['str', 'dex'], n: 2, skills: ['Акробатика', 'Атлетика', 'История', 'Проницательность', 'Религия', 'Скрытность'], cast: null, rec: ['dex', 'wis', 'con', 'str', 'int', 'cha'], unarmored: 'wis',
    about: 'Мастер рукопашного боя. Быстрый, без доспехов, много ударов.',
    prof: 'Доспехов нет. Простое оружие и лёгкое воинское. Один инструмент ремесленника или музыкальный инструмент.',
    eq: [{ label: 'Набор монаха', w: [['Копьё', 1], ['Кинжал', 5]], i: [['Инструмент ремесленника или музыкальный', 1], ['Набор путешественника', 1]], g: 11 }, { label: 'Только золото', g: 50 }] },
  { name: 'Паладин', die: 10, saves: ['wis', 'cha'], n: 2, skills: ['Атлетика', 'Проницательность', 'Запугивание', 'Медицина', 'Убеждение', 'Религия'], cast: 'cha', rec: ['str', 'cha', 'con', 'wis', 'dex', 'int'],
    about: 'Святой воин. Тяжёлые доспехи, лечение касанием, удары с карой.',
    prof: 'Все доспехи и щиты. Простое и воинское оружие.',
    eq: [{ label: 'Набор паладина', a: 'chainmail', sh: true, w: [['Длинный меч', 1], ['Метательное копьё', 6]], i: [['Священный символ', 1], ['Набор священника', 1]], g: 9 }, { label: 'Только золото', g: 150 }] },
  { name: 'Плут', die: 8, saves: ['dex', 'int'], n: 4, skills: ['Акробатика', 'Атлетика', 'Обман', 'Проницательность', 'Запугивание', 'Анализ', 'Внимательность', 'Убеждение', 'Ловкость рук', 'Скрытность'], cast: null, rec: ['dex', 'con', 'int', 'wis', 'cha', 'str'],
    about: 'Ловкач. Скрытность, замки, сильный удар из засады.',
    prof: 'Лёгкие доспехи. Простое оружие, воинское фехтовальное и лёгкое. Воровские инструменты.',
    eq: [{ label: 'Набор плута', a: 'leather', w: [['Кинжал', 2], ['Короткий меч', 1], ['Короткий лук', 1]], i: [['Стрелы', 20], ['Колчан', 1], ['Воровские инструменты', 1], ['Набор взломщика', 1]], g: 8 }, { label: 'Только золото', g: 100 }] },
  { name: 'Следопыт', die: 10, saves: ['str', 'dex'], n: 3, skills: ['Уход за животными', 'Атлетика', 'Проницательность', 'Анализ', 'Природа', 'Внимательность', 'Скрытность', 'Выживание'], cast: 'wis', rec: ['dex', 'wis', 'con', 'str', 'int', 'cha'],
    about: 'Охотник и разведчик. Лук или два клинка, немного магии природы.',
    prof: 'Лёгкие и средние доспехи, щиты. Простое и воинское оружие.',
    eq: [{ label: 'Набор следопыта', a: 'studded', w: [['Скимитар', 1], ['Короткий меч', 1], ['Длинный лук', 1]], i: [['Стрелы', 20], ['Колчан', 1], ['Фокусировка друида (омела)', 1], ['Набор путешественника', 1]], g: 7 }, { label: 'Только золото', g: 150 }] },
  { name: 'Чародей', die: 6, saves: ['con', 'cha'], n: 2, skills: ['Аркана', 'Обман', 'Проницательность', 'Запугивание', 'Убеждение', 'Религия'], cast: 'cha', rec: ['cha', 'con', 'dex', 'wis', 'int', 'str'],
    about: 'Маг с врождённой силой. Мало заклинаний, зато их можно усиливать.',
    prof: 'Доспехов нет. Простое оружие.',
    eq: [{ label: 'Набор чародея', w: [['Копьё', 1], ['Кинжал', 2]], i: [['Магическая фокусировка (кристалл)', 1], ['Набор исследователя подземелий', 1]], g: 28 }, { label: 'Только золото', g: 50 }] },
];

// Черты происхождения
const C_FEATS = {
  'Бдительный': 'К броску инициативы прибавляется бонус мастерства. Сразу после броска инициативы можно поменяться местом в очереди с согласным союзником.',
  'Дикий атакующий': 'Раз в ход, попав оружием, бросаете кости урона дважды и берёте лучший результат.',
  'Посвящённый в магию (жрец)': 'Два заговора и одно заклинание 1 уровня из списка жреца. Заклинание всегда подготовлено, раз до долгого отдыха творится без ячейки. Добавьте их в «Магии» через «Все классы» и «Добавить сверх счёта».',
  'Посвящённый в магию (волшебник)': 'Два заговора и одно заклинание 1 уровня из списка волшебника. Заклинание всегда подготовлено, раз до долгого отдыха творится без ячейки. Добавьте их в «Магии» через «Все классы» и «Добавить сверх счёта».',
  'Посвящённый в магию (друид)': 'Два заговора и одно заклинание 1 уровня из списка друида. Заклинание всегда подготовлено, раз до долгого отдыха творится без ячейки. Добавьте их в «Магии» через «Все классы» и «Добавить сверх счёта».',
  'Умелый': 'Владение тремя навыками или инструментами на выбор. Отметьте их во вкладке «Персонаж».',
  'Крепкий': 'Максимум хитов больше на 2 за каждый уровень персонажа.',
  'Везунчик': 'Очки удачи по числу бонуса мастерства, возвращаются после долгого отдыха. Очко даёт преимущество на свой бросок к20 или помеху на атаку по вам.',
};

const C_BACKGROUNDS = [
  { name: 'Мудрец', about: 'Годы за книгами и свитками.', abil: ['con', 'int', 'wis'], skills: ['Аркана', 'История'], tool: 'Набор каллиграфа', feat: 'Посвящённый в магию (волшебник)',
    items: [['Боевой посох', 1], ['Набор каллиграфа', 1], ['Книга (история)', 1], ['Пергамент', 8], ['Мантия', 1]], weapons: ['Боевой посох'], gold: 8 },
  { name: 'Послушник', about: 'Служба в храме.', abil: ['int', 'wis', 'cha'], skills: ['Проницательность', 'Религия'], tool: 'Набор каллиграфа', feat: 'Посвящённый в магию (жрец)',
    items: [['Набор каллиграфа', 1], ['Книга (молитвы)', 1], ['Священный символ', 1], ['Пергамент', 10], ['Мантия', 1]], weapons: [], gold: 8 },
  { name: 'Преступник', about: 'Жизнь вне закона.', abil: ['dex', 'con', 'int'], skills: ['Ловкость рук', 'Скрытность'], tool: 'Воровские инструменты', feat: 'Бдительный',
    items: [['Кинжал', 2], ['Воровские инструменты', 1], ['Ломик', 1], ['Кошель', 2], ['Дорожная одежда', 1]], weapons: ['Кинжал'], gold: 16 },
  { name: 'Солдат', about: 'Служба в войске.', abil: ['str', 'dex', 'con'], skills: ['Атлетика', 'Запугивание'], tool: 'Игровой набор', feat: 'Дикий атакующий',
    items: [['Копьё', 1], ['Короткий лук', 1], ['Стрелы', 20], ['Игровой набор', 1], ['Комплект целителя', 1], ['Колчан', 1], ['Дорожная одежда', 1]], weapons: ['Копьё', 'Короткий лук'], gold: 14 },
  { name: 'Шарлатан', about: 'Мошенник и обманщик: чужие имена, поддельные бумаги, ловкие руки.', abil: ['dex', 'con', 'cha'], skills: ['Ловкость рук', 'Обман'], tool: 'Набор для подделки', feat: 'Умелый',
    items: [['Набор для подделки', 1], ['Костюм', 1], ['Отличная одежда', 1]], weapons: [], gold: 15 },
  { name: 'Другая', about: 'Предыстории нет в списке: соберите её сами по книге или вместе с ведущим.', custom: true, abil: ['str', 'dex', 'con', 'int', 'wis', 'cha'], skills: [], tool: '', feat: '', items: [], weapons: [], gold: 50 },
];

// Виды. t — черты [название, описание, сколько применений (0 — без счётчика; 'pb' — по бонусу мастерства), с какого уровня].
// pick — обязательный выбор внутри вида: варианты могут давать свои черты, скорость и заклинания.
const C_SPECIES = [
  { name: 'Человек', speed: 30, about: 'Навык на выбор, лишняя черта, вдохновение после долгого отдыха.', anySkill: true, anyFeat: true,
    t: [['Находчивость', 'После каждого долгого отдыха вы получаете героическое вдохновение.', 0, 1]] },
  { name: 'Дварф', speed: 30, about: 'Тёмное зрение, стойкость к яду, больше хитов.', hpPerLevel: 1,
    t: [['Тёмное зрение', 'Видите в темноте на 120 фт.', 0, 1], ['Дварфская стойкость', 'Сопротивление урону ядом, преимущество на спасброски от отравления.', 0, 1], ['Дварфская выдержка', 'Максимум хитов больше на 1 за каждый уровень. Сайт уже учёл это в хитах.', 0, 1],
      ['Знание камня', 'Бонусным действием, стоя на камне или касаясь его, на 10 минут получаете чувство вибраций 60 фт.', 'pb', 1]] },
  { name: 'Эльф', speed: 30, about: 'Тёмное зрение, заговор, не спит, а медитирует.', skillOf: ['Проницательность', 'Внимательность', 'Выживание'],
    t: [['Тёмное зрение', 'Видите в темноте на 60 фт.', 0, 1], ['Наследие фей', 'Преимущество на спасброски от очарования.', 0, 1], ['Транс', 'Вам не нужен сон, магия не может вас усыпить. Долгий отдых занимает 4 часа.', 0, 1]],
    pick: { label: 'Род эльфов', opts: [
      { name: 'Высший эльф', t: [['Эльфийский род: высший эльф', 'Заговор «Фокусы» (можно менять на другой заговор волшебника после долгого отдыха). С 3 уровня «Обнаружение магии», с 5 — «Туманный шаг»: раз в день без ячейки.', 0, 1]], spells: [[1, 'Prestidigitation'], [3, 'Detect Magic'], [5, 'Misty Step']] },
      { name: 'Лесной эльф', speed: 35, t: [['Эльфийский род: лесной эльф', 'Скорость 35 фт и заговор «Искусство друидов». С 3 уровня «Скороход», с 5 — «Бесследное передвижение»: раз в день без ячейки.', 0, 1]], spells: [[1, 'Druidcraft'], [3, 'Longstrider'], [5, 'Pass without Trace']] },
      { name: 'Дроу', t: [['Эльфийский род: дроу', 'Тёмное зрение 120 фт и заговор «Пляшущие огоньки». С 3 уровня «Огонь фей», с 5 — «Тьма»: раз в день без ячейки.', 0, 1]], spells: [[1, 'Dancing Lights'], [3, 'Faerie Fire'], [5, 'Darkness']] }] } },
  { name: 'Драконорождённый', speed: 30, about: 'Дыхание дракона, сопротивление одному типу урона, тёмное зрение.',
    t: [['Тёмное зрение', 'Видите в темноте на 60 фт.', 0, 1],
      ['Драконий полёт', 'Бонусным действием на 10 минут появляются призрачные крылья: скорость полёта равна вашей скорости. Раз до долгого отдыха.', 1, 5]],
    pick: { label: 'Предок-дракон', opts: [['Красный', 'огонь'], ['Золотой', 'огонь'], ['Латунный', 'огонь'], ['Синий', 'электричество'], ['Бронзовый', 'электричество'], ['Белый', 'холод'], ['Серебряный', 'холод'], ['Зелёный', 'яд'], ['Чёрный', 'кислота'], ['Медный', 'кислота']].map(([d, dmg]) => ({ name: `${d} — ${dmg}`,
      t: [['Наследие драконов', `Предок: ${d.toLowerCase()} дракон. Ваш тип урона — ${dmg}.`, 0, 1], ['Дыхание дракона', `Вместо одной атаки: конус 15 фт или линия 30 фт. Спасбросок Ловкости, Сл 8 + Телосложение + бонус мастерства. Урон 1к10 (${dmg}), половина при успехе. 2к10 с 5 уровня, 3к10 с 11, 4к10 с 17.`, 'pb', 1], ['Сопротивление урону', `Сопротивление урону типа «${dmg}».`, 0, 1]] })) } },
  { name: 'Гном', speed: 30, about: 'Маленький и хитрый. Тёмное зрение, преимущество на умственные спасброски.',
    t: [['Тёмное зрение', 'Видите в темноте на 60 фт.', 0, 1], ['Гномья хитрость', 'Преимущество на спасброски Интеллекта, Мудрости и Харизмы.', 0, 1]],
    pick: { label: 'Род гномов', opts: [
      { name: 'Лесной гном', t: [['Гномий род: лесной гном', 'Заговор «Малая иллюзия». «Разговор с животными» всегда подготовлен и творится без ячейки столько раз, каков бонус мастерства.', 'pb', 1]], spells: [[1, 'Minor Illusion'], [1, 'Speak with Animals']] },
      { name: 'Скальный гном', t: [['Гномий род: скальный гном', 'Заговоры «Починка» и «Фокусы». За 10 минут можно собрать крошечное заводное устройство с одним эффектом «Фокусов», до трёх штук сразу.', 0, 1]], spells: [[1, 'Mending'], [1, 'Prestidigitation']] }] } },
  { name: 'Голиаф', speed: 35, about: 'Потомок великанов. Скорость 35 фт, дар великана, позже становится большим.',
    t: [['Мощное телосложение', 'Преимущество на проверки, чтобы вырваться из захвата. При переноске груза считаетесь на размер больше.', 0, 1],
      ['Большая форма', 'Бонусным действием на 10 минут становитесь большим: преимущество на проверки Силы, скорость +10 фт. Раз до долгого отдыха.', 1, 5]],
    pick: { label: 'Наследие великанов', opts: [
      ['Облачный: прыжок облака', 'Бонусным действием телепорт на 30 фт.'], ['Огненный: ожог огня', 'Попав атакой, добавляете 1к10 урона огнём.'], ['Ледяной: холод мороза', 'Попав атакой, добавляете 1к6 холодом и снижаете скорость цели на 10 фт.'],
      ['Холмовой: кувырок холма', 'Попав по существу не больше большого, сбиваете его с ног.'], ['Каменный: стойкость камня', 'Реакцией уменьшаете полученный урон на 1к12 + Телосложение.'], ['Штормовой: гром шторма', 'Реакцией наносите 1к8 звуком тому, кто ранил вас в 60 фт.']]
      .map(([n, text]) => ({ name: n, t: [['Наследие великанов', n + '. ' + text, 'pb', 1]] })) } },
  { name: 'Полурослик', speed: 30, about: 'Маленький и везучий. Перебрасывает единицы, не боится.',
    t: [['Храбрость', 'Преимущество на спасброски от испуга.', 0, 1], ['Проворство полурослика', 'Можете проходить через пространство существ крупнее вас.', 0, 1], ['Удача', 'Выбросив 1 на к20, перебрасываете и берёте новый результат.', 0, 1], ['Естественная скрытность', 'Можете прятаться за существом крупнее вас.', 0, 1]] },
  { name: 'Орк', speed: 30, about: 'Выносливый боец. Рывок с временными хитами, не падает с первого раза.',
    t: [['Тёмное зрение', 'Видите в темноте на 120 фт.', 0, 1], ['Прилив адреналина', 'Рывок бонусным действием, и вы получаете временные хиты, равные бонусу мастерства. Возвращается и после короткого отдыха.', 'pb', 1], ['Непоколебимая стойкость', 'Упав до 0 хитов, остаётесь с 1 хитом. Раз до долгого отдыха.', 1, 1]] },
  { name: 'Тифлинг', speed: 30, about: 'Наследие Нижних планов. Тёмное зрение, сопротивление и врождённые заклинания.',
    t: [['Тёмное зрение', 'Видите в темноте на 60 фт.', 0, 1], ['Потустороннее присутствие', 'Вы знаете заговор «Чудотворство».', 0, 1]],
    pick: { label: 'Наследие исчадий', opts: [
      { name: 'Инфернальное', t: [['Наследие исчадий: инфернальное', 'Сопротивление огню и заговор «Огненный снаряд». С 3 уровня «Адское возмездие», с 5 — «Тьма»: раз в день без ячейки.', 0, 1]], spells: [[1, 'Thaumaturgy'], [1, 'Fire Bolt'], [3, 'Hellish Rebuke'], [5, 'Darkness']] },
      { name: 'Бездны', t: [['Наследие исчадий: бездны', 'Сопротивление яду и заговор «Ядовитые брызги». С 3 уровня «Луч болезни», с 5 — «Удержание личности»: раз в день без ячейки.', 0, 1]], spells: [[1, 'Thaumaturgy'], [1, 'Poison Spray'], [3, 'Ray of Sickness'], [5, 'Hold Person']] },
      { name: 'Хтоническое', t: [['Наследие исчадий: хтоническое', 'Сопротивление некротической энергии и заговор «Леденящее прикосновение». С 3 уровня «Ложная жизнь», с 5 — «Луч слабости»: раз в день без ячейки.', 0, 1]], spells: [[1, 'Thaumaturgy'], [1, 'Chill Touch'], [3, 'False Life'], [5, 'Ray of Enfeeblement']] }] } },
];

// Ячейки заклинаний по классу и уровню
function createSlots(cls, n) {
  if (cls === 'Колдун') { const a = []; a[Math.min(5, Math.ceil(n / 2)) - 1] = n >= 17 ? 4 : n >= 11 ? 3 : n >= 2 ? 2 : 1; return Array.from(a, (x) => x || 0); }
  if (['Бард', 'Жрец', 'Друид', 'Чародей', 'Волшебник'].includes(cls)) return BARD_SLOTS[n - 1];
  if (['Паладин', 'Следопыт'].includes(cls)) return HALF_SLOTS[n - 1];
  return [];
}

// Собирает готовый лист из выбора игрока. Чистая функция: её можно проверять без экрана.
function buildCreatedSheet(w) {
  const c = C_CLASSES.find((x) => x.name === w.cls);
  const bg = C_BACKGROUNDS.find((x) => x.name === w.bg);
  const sp = C_SPECIES.find((x) => x.name === w.species);
  const opt = sp.pick ? sp.pick.opts.find((x) => x.name === w.speciesOpt) || sp.pick.opts[0] : null;
  const n = clamp(toInt(w.level, 1), 1, 20);
  const prof = 2 + Math.floor((n - 1) / 4);
  const stats = {};
  for (const k of STAT_KEYS) stats[k] = Math.min(20, toInt(w.base[k], 10) + (w.bonus[k] || 0));
  const m = (k) => modOf(stats[k]);
  const feats = [bg.custom ? (w.customFeat || '').trim() : bg.feat].concat(sp.anyFeat && w.humanFeat ? [w.humanFeat] : []).filter(Boolean);

  // хиты: на 1 уровне максимум кости, дальше среднее
  let hp = Math.max(1, c.die + m('con')) + (n - 1) * Math.max(1, c.die / 2 + 1 + m('con'));
  if (sp.hpPerLevel) hp += sp.hpPerLevel * n;
  if (feats.includes('Крепкий')) hp += 2 * n;

  // навыки
  const mySkills = new Set([].concat(bg.custom ? w.customSkills : bg.skills, w.classSkills, w.speciesSkill ? [w.speciesSkill] : []));
  const skills = DEFAULT_SKILLS.map(([label, stat]) => ({ label, stat, prof: mySkills.has(label) ? 1 : 0 }));
  const saves = {};
  for (const k of STAT_KEYS) saves[k] = c.saves.includes(k);

  // снаряжение
  const eq = c.eq[w.eq] || c.eq[0];
  const takeBg = w.bgEq !== 'gold' && !bg.custom;
  const items = [], weapons = [];
  const addItem2 = (name, qty) => { const s = items.find((x) => x.name === name); if (s) s.qty += qty; else items.push({ name, qty }); };
  const addWeapon = (name) => {
    if (weapons.some((x) => x.name === name)) return;
    const cat = CATALOG.find((x) => x.name === name && x.kind === 'weapon');
    if (!cat) return;
    const ab = cat.ability === 'dex' ? 'dex' : cat.ability === 'str' ? 'str' : (m('dex') > m('str') ? 'dex' : 'str');
    weapons.push({ name, bonus: m(ab) + prof, dmg: cat.dmg, note: cat.props || '' });
  };
  for (const [name, qty] of eq.w || []) { addItem2(name, qty); addWeapon(name); }
  for (const [name, qty] of eq.i || []) addItem2(name, qty);
  if (eq.a) addItem2(C_ARMOR[eq.a][0], 1);
  if (eq.sh) addItem2('Щит', 1);
  if (takeBg) { for (const [name, qty] of bg.items) addItem2(name, qty); for (const name of bg.weapons) addWeapon(name); }
  const gold = (eq.g || 0) + (takeBg ? bg.gold : 50);

  // КД: лучший из доступных вариантов
  let ac = 10 + m('dex');
  if (eq.a) { const [, base, cap] = C_ARMOR[eq.a]; ac = base + (cap === null ? m('dex') : cap === 0 ? 0 : Math.min(cap, m('dex'))); }
  if (c.name === 'Варвар') ac = Math.max(ac, 10 + m('dex') + m('con'));
  if (c.unarmored && !eq.a && !eq.sh) ac = Math.max(ac, 10 + m('dex') + m(c.unarmored));
  if (eq.sh) ac += 2;

  // умения: класс по уровню, вид, черты
  const features = [];
  const cd = classData(c.name);
  const usesOf = (u) => (u === 'pb' ? prof : u || 0);
  if (cd) for (const [lv, name] of cd.features) if (lv <= n) features.push({ name, text: '', usesMax: 0, usesLeft: 0 });
  for (const [name, text, uses, lv] of sp.t.concat(opt ? opt.t : [])) if (lv <= n) features.push({ name, text, usesMax: usesOf(uses), usesLeft: usesOf(uses) });
  for (const f of feats) features.push({ name: f, text: C_FEATS[f] || 'Черта происхождения. Впишите описание из книги.', usesMax: 0, usesLeft: 0 });

  // заклинания вида (в счёт класса не идут)
  const spells = [], given = [];
  for (const [lv, en] of (opt && opt.spells) || []) {
    if (lv > n) continue;
    const h = SPELL_HINT_INDEX.get(hintKey(en));
    if (!h || spells.some((x) => x.en === en)) continue;
    const name = h.names[0].charAt(0).toUpperCase() + h.names[0].slice(1);
    spells.push({ name, level: h.level, en }); given.push(name);
  }

  const slots = createSlots(c.name, n).map((max, i) => ({ level: i + 1, max, used: 0 })).filter((x) => x.max > 0);
  const castMod = c.cast ? m(c.cast) : 0;
  const tools = [bg.custom ? '' : bg.tool].filter(Boolean).join(', ');
  return {
    v: 1, name: String(w.name).trim().slice(0, 80), cls: c.name, species: sp.name + (opt && sp.name !== 'Драконорождённый' && sp.name !== 'Голиаф' ? ` (${opt.name.toLowerCase()})` : ''),
    background: bg.custom ? (w.customBg || '').trim() : bg.name, alignment: '', level: n, xp: 0, portrait: '',
    hp: { cur: hp, max: hp, temp: 0 }, ac, speed: (opt && opt.speed) || sp.speed, hitDie: 'к' + c.die, prof, stats, saves, skills,
    weapons, gold, coins: {}, items,
    spell: { dc: 8 + prof + castMod, atk: prof + castMod, slots }, spells, features,
    profText: c.prof + (tools ? ' Инструмент от предыстории: ' + tools + '.' : ''),
    langs: ['Общий'].concat((w.langs || []).slice(0, 2)),
    extraSpells: given, created: 'wizard',
  };
}

// ---------- экраны мастера ----------

function showCreate(profile) {
  const w = { step: 1, name: '', cls: '', level: 1, bg: '', bgMode: '21', b2: '', b1: '', customBg: '', customFeat: '', customSkills: [], bgEq: 'pack',
    species: '', speciesOpt: '', speciesSkill: '', humanFeat: '', method: 'array', base: {}, bonus: {}, classSkills: [], eq: 0, langs: [] };
  const STD = [15, 14, 13, 12, 10, 8];
  // Покупка за очки по правилам 2024: 27 очков, значения от 8 до 15
  const PB_COST = { 8: 0, 9: 1, 10: 2, 11: 3, 12: 4, 13: 5, 14: 7, 15: 9 }, PB_TOTAL = 27;
  const pbSpent = () => STAT_KEYS.reduce((sum, k) => sum + (PB_COST[w.base[k]] || 0), 0);
  const cls = () => C_CLASSES.find((x) => x.name === w.cls);
  const bg = () => C_BACKGROUNDS.find((x) => x.name === w.bg);
  const sp = () => C_SPECIES.find((x) => x.name === w.species);
  const err = errorBox();
  const TOTAL = 6;
  const bar = () => el('div', { class: 'wsteps' }, el('div', { class: 'wbar' }, [1, 2, 3, 4, 5, 6].map((i) => el('span', { class: i <= w.step ? 'on' : '' }))), el('p', { class: 'muted small' }, `Шаг ${w.step} из ${TOTAL}`));
  const nav = (onNext, nextLabel) => el('div', { class: 'wnav' },
    el('button', { class: 'btn outline', type: 'button', onclick: () => { err.set(''); if (w.step === 1) showUpload(profile); else { w.step -= 1; draw(); } } }, 'Назад'),
    el('button', { class: 'btn', type: 'button', onclick: onNext }, nextLabel || 'Дальше'));
  const go = (problem) => { if (problem) { err.set(problem); return; } err.set(''); w.step += 1; draw(); window.scrollTo(0, 0); };
  const pick = (title, text, on, onclick, extra) => el('div', { class: 'wpick' + (on ? ' on' : '') },
    el('button', { class: 'wpickbtn', type: 'button', 'aria-pressed': String(!!on), onclick }, el('span', { class: 'title' }, title), el('span', { class: 'muted' }, text)), on ? extra || null : null);
  const select = (id, label, options, value, onchange) => {
    const s = el('select', { id }, options.map(([v, t]) => el('option', { value: v }, t)));
    s.value = value; s.addEventListener('change', () => onchange(s.value));
    return el('div', { class: 'field' }, el('label', { for: id }, label), s);
  };
  const checks = (list, chosen, max, locked) => list.map((name) => {
    const fixed = locked.includes(name), on = fixed || chosen.includes(name), full = !on && chosen.length >= max;
    return el('button', { class: 'wcheck' + (on ? ' on' : ''), type: 'button', disabled: fixed || full, 'aria-pressed': String(on), onclick: () => {
      const i = chosen.indexOf(name); if (i >= 0) chosen.splice(i, 1); else chosen.push(name); draw();
    } }, el('span', { class: 'box' }), el('span', {}, name + (fixed ? ' — уже есть' : '')));
  });
  const head = (title, text) => el('div', { class: 'head' }, el('h1', { class: 'small' }, title), el('p', { class: 'muted' }, text));

  // прибавки от предыстории → w.bonus
  const calcBonus = () => {
    const b = bg(); w.bonus = {};
    if (!b) return;
    if (w.bgMode === '111' && !b.custom) { for (const k of b.abil) w.bonus[k] = 1; return; }
    if (w.b2) w.bonus[w.b2] = 2;
    if (w.b1 && w.b1 !== w.b2) w.bonus[w.b1] = 1;
  };

  function step1() {
    const name = el('input', { id: 'wn', type: 'text', placeholder: 'Как зовут персонажа', autocomplete: 'off', maxlength: '80' });
    name.value = w.name; name.addEventListener('input', () => { w.name = name.value; });
    return [head('Новый персонаж', 'Имя, уровень и класс. Класс определяет, что персонаж умеет.'), bar(),
      el('div', { class: 'card' }, el('div', { class: 'field' }, el('label', { for: 'wn' }, 'Имя персонажа'), name),
        select('wl', 'Уровень', Array.from({ length: 20 }, (_, i) => [String(i + 1), String(i + 1)]), String(w.level), (v) => { w.level = toInt(v, 1); }),
        el('p', { class: 'muted small' }, 'Новичкам обычно говорят начинать с 1 уровня. Если ведущий назвал другой, поставьте его.')),
      C_CLASSES.map((c) => pick(c.name, c.about, w.cls === c.name, () => { if (w.cls !== c.name) { w.cls = c.name; w.classSkills = []; w.eq = 0; } draw(); })),
      err.node, nav(() => go(String(w.name).trim().length < 2 ? 'Впишите имя персонажа.' : !w.cls ? 'Выберите класс.' : ''))];
  }

  function step2() {
    const b = bg();
    const detail = (x) => {
      if (x.custom) {
        const nm = el('input', { id: 'wbn', type: 'text', placeholder: 'Например: Моряк', autocomplete: 'off' }); nm.value = w.customBg; nm.addEventListener('input', () => { w.customBg = nm.value; });
        const ft = el('input', { id: 'wbf', type: 'text', placeholder: 'Например: Крепкий', autocomplete: 'off' }); ft.value = w.customFeat; ft.addEventListener('input', () => { w.customFeat = ft.value; });
        return el('div', { class: 'stack' },
          el('div', { class: 'field' }, el('label', { for: 'wbn' }, 'Название предыстории'), nm),
          el('div', { class: 'field' }, el('label', { for: 'wbf' }, 'Черта происхождения'), ft),
          el('p', { class: 'muted small' }, `Два навыка от предыстории: выбрано ${w.customSkills.length} из 2.`),
          el('div', { class: 'wchecks' }, checks(ALL_SKILLS, w.customSkills, 2, [])));
      }
      return el('div', { class: 'stack' },
        el('div', { class: 'kv' }, el('span', { class: 'muted' }, 'Навыки'), el('strong', {}, x.skills.join(', '))),
        el('div', { class: 'kv' }, el('span', { class: 'muted' }, 'Инструмент'), el('strong', {}, x.tool)),
        el('div', { class: 'kv' }, el('span', { class: 'muted' }, 'Черта'), el('strong', {}, x.feat)),
        el('p', { class: 'muted small' }, C_FEATS[x.feat] || ''));
    };
    const abil = b ? b.abil.map((k) => [k, STAT_FULL[k]]) : [];
    return [head('Предыстория', 'Кем персонаж был до приключений. Даёт два навыка, черту и прибавки к характеристикам.'), bar(),
      C_BACKGROUNDS.map((x) => pick(x.name, x.about, w.bg === x.name, () => { if (w.bg !== x.name) { w.bg = x.name; w.b2 = x.abil[0]; w.b1 = x.abil[1]; w.bgMode = '21'; calcBonus(); } draw(); }, detail(x))),
      b ? el('div', { class: 'card' }, el('div', { class: 'title' }, 'Прибавки к характеристикам'),
        el('p', { class: 'muted' }, b.custom ? 'Одной характеристике +2 и другой +1.' : 'Одной характеристике +2 и другой +1, либо всем трём по +1. Подсказка: +2 ставьте в главную характеристику класса.'),
        b.custom ? null : el('div', { class: 'choice' },
          el('button', { type: 'button', 'aria-pressed': String(w.bgMode === '21'), onclick: () => { w.bgMode = '21'; calcBonus(); draw(); } }, '+2 и +1'),
          el('button', { type: 'button', 'aria-pressed': String(w.bgMode === '111'), onclick: () => { w.bgMode = '111'; calcBonus(); draw(); } }, 'Всем по +1')),
        w.bgMode === '21' || b.custom ? [select('wb2', '+2 к характеристике', abil, w.b2, (v) => { w.b2 = v; if (w.b1 === v) w.b1 = b.abil.find((k) => k !== v); calcBonus(); draw(); }),
          select('wb1', '+1 к характеристике', abil.filter(([k]) => k !== w.b2), w.b1, (v) => { w.b1 = v; calcBonus(); })] : null) : null,
      el('p', { class: 'muted small' }, 'В списке четыре предыстории из бесплатных правил. Остальные двенадцать из книги игрока можно собрать через «Другая».'),
      err.node, nav(() => go(!b ? 'Выберите предысторию.' : b.custom && String(w.customBg).trim().length < 2 ? 'Впишите название предыстории.' : b.custom && w.customSkills.length < 2 ? 'Выберите два навыка предыстории.' : ''))];
  }

  function step3() {
    const s = sp();
    const detail = (x) => el('div', { class: 'stack' },
      x.pick ? select('wso', x.pick.label, x.pick.opts.map((o) => [o.name, o.name]), w.speciesOpt || x.pick.opts[0].name, (v) => { w.speciesOpt = v; draw(); }) : null,
      x.skillOf || x.anySkill ? select('wss', 'Навык от вида', [['', 'Не выбран']].concat((x.skillOf || ALL_SKILLS).map((n) => [n, n])), w.speciesSkill, (v) => { w.speciesSkill = v; }) : null,
      x.anyFeat ? select('wsf', 'Черта от вида', [['', 'Не выбрана']].concat(Object.keys(C_FEATS).map((n) => [n, n])), w.humanFeat, (v) => { w.humanFeat = v; draw(); }) : null,
      x.anyFeat && w.humanFeat ? el('p', { class: 'muted small' }, C_FEATS[w.humanFeat]) : null,
      el('p', { class: 'muted small' }, 'Черты вида: ' + x.t.concat(x.pick ? (x.pick.opts.find((o) => o.name === w.speciesOpt) || x.pick.opts[0]).t : []).map((t) => t[0]).join(', ') + '.'));
    return [head('Вид', 'Кто персонаж по рождению. Черты вида добавятся в умения сами.'), bar(),
      C_SPECIES.map((x) => pick(x.name, x.about, w.species === x.name, () => { if (w.species !== x.name) { w.species = x.name; w.speciesOpt = x.pick ? x.pick.opts[0].name : ''; w.speciesSkill = ''; w.humanFeat = ''; } draw(); }, detail(x))),
      err.node, nav(() => go(!s ? 'Выберите вид.' : (s.skillOf || s.anySkill) && !w.speciesSkill ? 'Выберите навык от вида.' : s.anyFeat && !w.humanFeat ? 'Выберите черту от вида.' : ''))];
  }

  function step4() {
    const c = cls();
    const setRec = () => { c.rec.forEach((k, i) => { w.base[k] = STD[i]; }); }; // совет классу; стоит ровно 27 очков
    if (!Object.keys(w.base).length) setRec();
    calcBonus();
    const rows = STAT_KEYS.map((k) => {
      let input;
      if (w.method === 'array') {
        input = el('select', { 'aria-label': STAT_FULL[k] }, STD.map((v) => el('option', { value: String(v) }, String(v))));
        input.value = String(w.base[k]);
        input.addEventListener('change', () => { const v = toInt(input.value, 10); const other = STAT_KEYS.find((x) => x !== k && w.base[x] === v); if (other) w.base[other] = w.base[k]; w.base[k] = v; draw(); });
      } else if (w.method === 'points') {
        const v = w.base[k], left = PB_TOTAL - pbSpent();
        const canUp = v < 15 && PB_COST[v + 1] - PB_COST[v] <= left;
        input = el('div', { class: 'wpb' },
          el('button', { type: 'button', disabled: v <= 8, 'aria-label': STAT_FULL[k] + ': меньше', onclick: () => { w.base[k] = v - 1; draw(); } }, '−'),
          el('span', {}, String(v)),
          el('button', { type: 'button', disabled: !canUp, 'aria-label': STAT_FULL[k] + ': больше', onclick: () => { w.base[k] = v + 1; draw(); } }, '+'));
      } else {
        input = el('input', { type: 'text', inputmode: 'numeric', 'aria-label': STAT_FULL[k] }); input.value = String(w.base[k]);
        input.addEventListener('change', () => { w.base[k] = clamp(toInt(input.value, 10), 3, 18); draw(); });
      }
      const tot = Math.min(20, toInt(w.base[k], 10) + (w.bonus[k] || 0));
      return el('div', { class: 'wstat' + (w.method === 'points' ? ' pb' : '') }, el('div', {}, STAT_FULL[k], c.rec[0] === k ? el('div', { class: 'small warn' }, 'главная для класса') : null), input,
        el('span', { class: 'muted' }, w.bonus[k] ? '+' + w.bonus[k] : ''), el('strong', {}, `${tot} (${signed(modOf(tot))})`));
    });
    return [head('Характеристики', 'Шесть чисел, от которых считаются все броски. В скобках модификатор: его и прибавляют к броску.'), bar(),
      el('div', { class: 'choice three' },
        el('button', { type: 'button', 'aria-pressed': String(w.method === 'array'), onclick: () => { w.method = 'array'; setRec(); draw(); } }, 'Готовый набор'),
        el('button', { type: 'button', 'aria-pressed': String(w.method === 'points'), onclick: () => { w.method = 'points'; setRec(); draw(); } }, 'За очки'),
        el('button', { type: 'button', 'aria-pressed': String(w.method === 'own'), onclick: () => { w.method = 'own'; draw(); } }, 'Бросал кости')),
      el('div', { class: 'card' },
        w.method === 'array' ? el('p', { class: 'muted' }, 'Числа 15, 14, 13, 12, 10, 8 раздаются по одному разу. Сайт уже расставил их так, как советуют этому классу. Меняете одно, второе встанет на его место.') : null,
        w.method === 'points' ? [el('div', { class: 'wpbleft' }, el('span', {}, 'Осталось очков'), el('strong', {}, `${PB_TOTAL - pbSpent()} из ${PB_TOTAL}`)),
          el('p', { class: 'muted' }, 'Каждое число от 8 до 15. Чем выше, тем дороже: до 13 каждый шаг стоит 1 очко, 14 и 15 — по 2. Когда очки кончатся, «+» перестанет нажиматься.')] : null,
        w.method === 'own' ? [el('p', { class: 'small warn' }, 'Только если бросали кости при ведущем. Иначе выберите «Готовый набор» или «За очки».'),
          el('p', { class: 'muted' }, 'По правилам: четыре кубика к6, три наибольших складываются, и так шесть раз. Впишите, что получилось, — от 3 до 18.')] : null,
        w.method === 'array' ? el('button', { class: 'mini wide', type: 'button', onclick: () => { setRec(); draw(); } }, 'Расставить как советуют: ' + c.name.toLowerCase()) : null,
        w.method === 'points' ? el('button', { class: 'mini wide', type: 'button', onclick: () => { setRec(); draw(); } }, 'Раскидать за меня: ' + c.name.toLowerCase()) : null,
        el('div', { class: 'wstat muted small' }, el('span', {}, 'Характеристика'), el('span', {}, 'Число'), el('span', {}, ''), el('span', {}, 'Итог')), rows),
      el('p', { class: 'muted small' }, 'Прибавки взяты с шага «Предыстория».'), err.node, nav(() => go(''))];
  }

  function step5() {
    const c = cls(), b = bg();
    const locked = [].concat(b.custom ? w.customSkills : b.skills, w.speciesSkill ? [w.speciesSkill] : []);
    w.classSkills = w.classSkills.filter((x) => !locked.includes(x));
    const list = c.skills || ALL_SKILLS;
    const can = Math.min(c.n, list.filter((x) => !locked.includes(x)).length);
    return [head('Навыки, языки и снаряжение', 'Что персонаж умеет и что у него с собой.'), bar(),
      el('div', { class: 'card' }, el('div', { class: 'title' }, `Навыки класса: выбрано ${w.classSkills.length} из ${can}`),
        el('p', { class: 'muted' }, 'К проверке навыка, которым владеете, прибавляется бонус мастерства. Навыки от предыстории и вида уже отмечены.'),
        el('div', { class: 'wchecks' }, checks(list, w.classSkills, can, locked))),
      el('div', { class: 'card' }, el('div', { class: 'title' }, `Языки: выбрано ${w.langs.length} из 2`),
        el('p', { class: 'muted' }, 'Общий язык знают все. По правилам персонаж знает ещё два. От языков зависит, что вы понимаете в чате группы.'),
        el('div', { class: 'wchecks' }, checks(CHAT_LANGS.filter((x) => x !== 'Общий' && x !== 'Язык зверей'), w.langs, 2, []))),
      el('div', { class: 'card' }, el('div', { class: 'title' }, 'Снаряжение класса'),
        c.eq.map((e, i) => pick(e.label, [].concat((e.a ? [C_ARMOR[e.a][0]] : []), e.sh ? ['Щит'] : [], (e.w || []).concat(e.i || []).map(([n, q]) => (q > 1 ? `${n} × ${q}` : n)), [e.g + ' зм']).join(', '), w.eq === i, () => { w.eq = i; draw(); }))),
      b.custom ? el('p', { class: 'muted small' }, 'От своей предыстории сайт даст 50 зм: вещи впишете в листе.') : el('div', { class: 'card' }, el('div', { class: 'title' }, 'Снаряжение предыстории'),
        pick('Набор: ' + b.name.toLowerCase(), b.items.map(([n, q]) => (q > 1 ? `${n} × ${q}` : n)).join(', ') + ', ' + b.gold + ' зм', w.bgEq === 'pack', () => { w.bgEq = 'pack'; draw(); }),
        pick('Только золото', '50 зм', w.bgEq === 'gold', () => { w.bgEq = 'gold'; draw(); })),
      el('p', { class: 'muted small' }, 'Спасброски, владение доспехами и оружием класс даёт без выбора. Сайт отметит их сам.'),
      err.node, nav(() => go(w.classSkills.length < can ? `Выберите навыки класса: ещё ${can - w.classSkills.length}.` : w.langs.length < 2 ? `Выберите языки: ещё ${2 - w.langs.length}.` : ''))];
  }

  function step6() {
    const s = buildCreatedSheet(w), c = cls();
    const kv = (a, b) => el('div', { class: 'kv' }, el('span', { class: 'muted' }, a), el('strong', {}, b));
    const tile = (a, b) => el('div', { class: 'tile' }, el('div', { class: 'label' }, a), el('div', { class: 'tval' }, b));
    const save = el('button', { class: 'btn', type: 'button' }, 'Создать персонажа');
    save.addEventListener('click', () => busy(save, 'Создаём…', async () => {
      const { data, error } = await sb.from('characters').insert({ owner_id: profile.id, name: s.name, class_name: s.cls, species: s.species, level: s.level, sheet: s }).select('id').single();
      if (error || !data) return err.set('Не получилось создать персонажа. Попробуйте ещё раз.');
      await openCharacter(profile, data.id, c.cast ? 'magic' : 'main');
    }));
    const todo = [];
    if (c.cast) todo.push('Выбрать заклинания: в «Магии» кнопка «+ Добавить из справочника», счётчик покажет, сколько положено.');
    if (s.level >= 3) todo.push('Выбрать подкласс: карточка появится в «Магии» над умениями.');
    if (s.level >= 4) todo.push('Повышения характеристик или черты за 4, 8, 12, 16 и 19 уровни сайт не добавлял: поправьте характеристики в листе.');
    if (s.features.some((f) => /Посвящённый в магию/.test(f.name))) todo.push('Черта «Посвящённый в магию»: добавить два заговора и одно заклинание.');
    return [head('Проверьте персонажа', 'Последний шаг. После создания всё можно поправить в листе.'), bar(),
      el('div', { class: 'card' }, el('div', { class: 'title' }, s.name), el('p', { class: 'muted' }, `${s.cls} ${s.level} уровня · ${s.species} · ${s.background || 'без предыстории'}`)),
      el('div', { class: 'grid3' }, tile('Хиты', String(s.hp.max)), tile('КД', String(s.ac)), tile('Скорость', s.speed + ' фт')),
      el('div', { class: 'card' }, el('div', { class: 'title' }, 'Сайт посчитал сам'),
        kv('Характеристики', STAT_KEYS.map((k) => `${STAT_SHORT[k]} ${s.stats[k]}`).join(' · ')),
        kv('Бонус мастерства', signed(s.prof)), kv('Спасброски', c.saves.map((k) => STAT_FULL[k]).join(', ')),
        c.cast ? [kv('Сложность заклинаний', String(s.spell.dc)), kv('Атака заклинанием', signed(s.spell.atk)), kv('Ячейки', s.spell.slots.map((x) => `${x.level} ур. — ${x.max}`).join(', ') || 'нет')] : null),
      el('div', { class: 'card' }, el('div', { class: 'title' }, 'Добавится в лист'),
        kv('Навыки', s.skills.filter((x) => x.prof).map((x) => x.label).join(', ')),
        kv('Умения', String(s.features.length)), kv('Оружие', s.weapons.map((x) => x.name).join(', ') || 'нет'), kv('Вещи', `${s.items.length} и ${s.gold} зм`)),
      todo.length ? el('div', { class: 'card notice' }, el('div', { class: 'title' }, 'Что останется сделать в листе'), todo.map((t) => el('p', { class: 'muted' }, '• ' + t))) : null,
      el('p', { class: 'muted small' }, 'Хиты посчитаны по среднему значению. Если бросали кости, поправьте в листе.'),
      err.node, el('div', { class: 'wnav' }, el('button', { class: 'btn outline', type: 'button', onclick: () => { w.step -= 1; draw(); } }, 'Назад'), save)];
  }

  function draw() { show(false, ...[step1, step2, step3, step4, step5, step6][w.step - 1]().flat(Infinity).filter(Boolean)); }
  draw();
}
