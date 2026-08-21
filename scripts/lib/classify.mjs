/**
 * Odvodi z URL slugu to, co sa da odvodit bez crawlu: rydzost, tvar, motiv,
 * kamen, farba zlata, rozmer a citatelny slovensky nazov.
 *
 * Co sa odvodit neda — cena, hmotnost, SKU, skutocny nazov z e-shopu — zostava
 * null a caka na crawl. Nikdy sa nedopĺňa dohadom.
 */

/* ── Slovnik diakritiky ─────────────────────────────────────────────────────
 * Postaveny z 226 realnych slov v slugoch kategorie Zlate nausnice.
 * Slova, ktore diakritiku nepotrebuju, tu zamerne nie su.
 */
const DIA = {
  afrohacik: 'afroháčik', anjelske: 'anjelské', bocne: 'bočné', briliantove: 'briliantové',
  castou: 'časťou', cira: 'číra', cire: 'číre', cirom: 'čírom', ciry: 'číry', cirym: 'čírym',
  cirymi: 'čírymi', citrin: 'citrín', delfin: 'delfín', detske: 'detské',
  diamantove: 'diamantové', dvojfarebne: 'dvojfarebné', francuzske: 'francúzske',
  francuzsky: 'francúzsky', glazurovane: 'glazúrované', gravirovanim: 'gravírovaním',
  gulatou: 'guľatou', gulicka: 'guľička', haciky: 'háčiky', hladky: 'hladký',
  hranate: 'hranaté', hudobny: 'hudobný', huslovy: 'husľový', jednorozec: 'jednorožec',
  jemne: 'jemné', jemnym: 'jemným', kamen: 'kameň', keramicke: 'keramické',
  klbove: 'kĺbové', kluc: 'kľúč', kombinovane: 'kombinované', kontura: 'kontúra',
  kontury: 'kontúry', korytnacky: 'korytnačky', kridla: 'krídla', kristaliky: 'kryštáliky',
  kristalov: 'kryštálov', kriz: 'kríž', krizik: 'krížik', kruzkom: 'krúžkom',
  kruzky: 'krúžky', kruzok: 'krúžok', leskla: 'lesklá', leskle: 'lesklé',
  leskly: 'lesklý', lesklym: 'lesklým', leziaca: 'ležiaca', ligotava: 'ligotavá',
  ligotave: 'ligotavé', ligotavy: 'ligotavý', listkami: 'lístkami', listok: 'lístok',
  linia: 'línia', linie: 'línie', luxusne: 'luxusné', macka: 'mačka', mala: 'malá', male: 'malé', maslicka: 'mašlička',
  modry: 'modrý', motiv: 'motív', motyl: 'motýľ', motylik: 'motýlik',
  nausnice: 'náušnice', nekonecna: 'nekonečna', objimke: 'objímke', oblucik: 'oblúčik',
  obluk: 'oblúk', obluky: 'oblúky', okruhle: 'okrúhle', okruhlej: 'okrúhlej',
  okruhly: 'okrúhly', okruhlym: 'okrúhlym', olivinom: 'olivínom', opal: 'opál',
  opalom: 'opálom', osmicka: 'osmička', oval: 'ovál', ovalny: 'oválny',
  palicka: 'palička', perlet: 'perleť', perletou: 'perleťou', pravidelne: 'pravidelné',
  prekrizene: 'prekrížené', prirodna: 'prírodná', prirodnou: 'prírodnou',
  prirodny: 'prírodný', priveskom: 'príveskom', privesok: 'prívesok',
  puzetove: 'puzetové', rozsireny: 'rozšírený', rubin: 'rubín', ruzove: 'ružové',
  pas: 'pás', pasy: 'pásy', ramena: 'ramená', ryhovanim: 'ryhovaním', sesticipa: 'šesťcípa', sikma: 'šikmá',
  skakajuci: 'skákajúci', slziciek: 'slzičiek', slzicka: 'slzička',
  slzickami: 'slzičkami', spirala: 'špirála', spiralovito: 'špirálovito',
  srdiecka: 'srdiečka', srdieckami: 'srdiečkami', stocene: 'stočené',
  stvorlistok: 'štvorlístok', swarovski: 'Swarovski', synteticky: 'syntetický',
  syntetickym: 'syntetickým', tenke: 'tenké', topas: 'topás',
  trblietava: 'trblietavá', trblietavymi: 'trblietavými', uzka: 'úzka',
  velke: 'veľké', vetvicka: 'vetvička', vykladana: 'vykladaná',
  vykladane: 'vykladané', vypukly: 'vypuklý', vypuklym: 'vypuklým',
  vyrezavanou: 'vyrezávanou', vyrezmi: 'výrezmi', vyrezy: 'výrezy',
  zamok: 'zámok', zaoblene: 'zaoblené', zapinanie: 'zapínanie', zarezmi: 'zárezmi',
  zarezy: 'zárezy', zatocene: 'zatočené', zdobena: 'zdobená', zdobene: 'zdobené',
  zdobeny: 'zdobený', zeleny: 'zelený', zirkon: 'zirkón', zirkonikmi: 'zirkónikmi',
  zirkonmi: 'zirkónmi', zirkonom: 'zirkónom', zirkonova: 'zirkónová',
  zirkonovy: 'zirkónový', zirkonovymi: 'zirkónovými', zirkony: 'zirkóny',
  zlte: 'žlté', zlteho: 'žltého', zltom: 'žltom', zvlneny: 'zvlnený',
};

/* "zlate" je dvojznacne: pridavne meno ("zlaté náušnice") alebo lokal podstatneho
 * mena ("v žltom 14k zlate"). Rozhoduje predlozka, ktora vsak nemusi stat priamo
 * pred slovom — v "v-zltom-14k-zlate" su medzi nimi dve slova. */
const PREPOSITIONS = new Set(['v', 'vo', 'zo', 'z', 'na']);
const LOOKBACK = 4; // "pasy-v-zltom-a-bielom-zlate" ma medzi predlozkou a slovom tri slova

const isLocative = (words, i) => {
  for (let k = i - 1; k >= 0 && k >= i - LOOKBACK; k--) {
    if (PREPOSITIONS.has(words[k])) return true;
    if (/nausnic/.test(words[k])) return false; // "nausnice ... zlate" je pridavne meno
  }
  return false;
};

const PURITY = [
  [/(^|-)(18k|750)(-|$)/, '18k', 750],
  [/(^|-)(14k|585)(-|$)/, '14k', 585],
  [/(^|-)(9k|375)(-|$)/, '9k', 375],
];

/** Tvar a upevnenie — ako sa nausnica nosi. */
const FORM = [
  [/visiace|visiacim|prevliekacie|afrohacik|haciky|retiazk/, 'visiace'],
  [/puzet/, 'puzetky'],
  [/kruh|kruzok|kruzky|kruzkom|obruc|polkruhy|okruhl/, 'kruhy'],
];

/** Motiv — co nausnica zobrazuje. Nezavisle od tvaru. */
const MOTIF = [
  [/srdce|srdiecka|srdieckami/, 'srdce'],
  [/motyl/, 'motýľ'],
  [/kvet|kvetinka|margaretky|listok|listkami|listami|vetvicka|stvorlistok/, 'kvet a list'],
  [/macka|delfin|korytnacky|jednorozec/, 'zvieratko'],
  [/kriz|krizik/, 'krížik'],
  [/hviezda|sesticipa/, 'hviezda'],
  [/kridla|anjelske/, 'krídla'],
  [/nekonecna|osmicka|leziaca|symbol/, 'symbol'],
  [/zrnko|zrnka/, 'zrnko'],
  [/slza|slzicka|slziciek|slzickami|kvapka|kvapke/, 'kvapka'],
  [/vlnkou|vlnky|zvlneny/, 'vlnka'],
  [/huslovy|hudobny|kluc/, 'hudobný motív'],
  [/oval|ovalny/, 'ovál'],
  [/gulicka|gulatou/, 'guľička'],
  [/spirala|spiralovito|stocene|zatocene/, 'špirála'],
];

const STONE = [
  [/brilant|briliant/, 'briliant'],
  [/diamant/, 'diamant'],
  [/smaragd/, 'smaragd'],
  [/rubin/, 'rubín'],
  [/ametyst/, 'ametyst'],
  [/topas/, 'topás'],
  [/citrin/, 'citrín'],
  [/olivin/, 'olivín'],
  [/opal/, 'opál'],
  [/perlet/, 'perleť'],
  [/perl(a|ou|y)/, 'perla'],
  [/swarovski|kristal/, 'Swarovski'],
  [/zirkon/, 'zirkón'],
];

const GOLD_COLOUR = [
  [/dvojfarebn|zlte-biele-a-ruzove|v-zltom-a-bielom|kombinovane/, 'kombinované'],
  [/ruzove-zlato|ruzovom-zlate/, 'ružové'],
  [/bieleho-zlata|bielom-zlate|biele-zlato|z-bieleho/, 'biele'],
];

const NON_GOLD = /strieborn|striebro|(^|-)925(-|$)|ocele|ocelov|chirurgick|titan|medene|fimo|krabicka|(^|-)set(-|$)/;
const GOLD = /zlat|zlto|zltom|zlteho|(^|-)(14k|585|9k|375|18k|750)(-|$)/;

const first = (table, s, fallback = null) => {
  for (const [re, ...vals] of table) if (re.test(s)) return vals.length > 1 ? vals : vals[0];
  return fallback;
};

export function isGoldEarring(slug) {
  return /nausnic/.test(slug) && GOLD.test(slug) && !NON_GOLD.test(slug);
}

/** Citatelny slovensky nazov zo slugu. Nie je to nazov z e-shopu — ten prinesie crawl. */
export function nameFromSlug(slug) {
  const words = slug.split('-');
  const out = words.map((w, i) => {
    if (w === 'zlate') return isLocative(words, i) ? 'zlate' : 'zlaté';
    return DIA[w] ?? w;
  });
  const s = out.join(' ');
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function classify(url) {
  const slug = (url.match(/\/\d+-([^/]+?)\.html/) || [, ''])[1];
  const p = first(PURITY, slug, [null, null]);
  const size = (slug.match(/(\d{1,2})-?mm/) || [, null])[1];
  return {
    productId: (url.match(/\/(\d+)-/) || [, null])[1],
    slug,
    derivedName: nameFromSlug(slug),
    purity: p[0],
    purityMillesimal: p[1],
    form: first(FORM, slug, 'iný tvar'),
    motif: first(MOTIF, slug),
    stone: first(STONE, slug),
    goldColour: first(GOLD_COLOUR, slug, 'žlté'),
    sizeMm: size ? Number(size) : null,
    isGold: isGoldEarring(slug),
  };
}
