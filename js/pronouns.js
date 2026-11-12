// Pronouns. Three parts:
//   PERSONAL     every form of ja/ti/on… and јас/ти/тој…, long and short
//   POSSESSIVE   my/your/his… in every gender, plus MK definite and kinship forms
//   DRILLS       fill-in-the-blank frames that test short forms, placement and doubling
// "a/b" in one slot = both accepted; '-' = no such form.

// ---------- personal ----------
// sr.long / sr.short: 7 slots like nouns: nom gen dat acc voc ins loc
//   short forms exist only for gen, dat, acc; they are clitics and sit in second position
//   (Vidim ga. Dao sam mu knjigu.). Long forms are for emphasis and after prepositions.
// mk: nom; acc = direct object, dat = indirect object; long + short (S) forms.
//   MK long dative is usually на + accusative (на мене); нему/нејзе/нам/вам/ним are the
//   older one-word forms, still heard for emphasis. The short form is used even when the
//   long one is there: Мене ми рече. На неа ѝ дадов.
export const PERSONAL = [
  { id: '1sg', en: 'I / me',
    sr: { long: 'ja mene meni mene - mnom/mnome meni', short: '- me mi me - - -' },
    mk: { nom: 'јас', acc: 'мене', accS: 'ме', dat: 'на мене', datS: 'ми' } },
  { id: '2sg', en: 'you (one person, informal)',
    sr: { long: 'ti tebe tebi tebe ti tobom tebi', short: '- te ti te - - -' },
    mk: { nom: 'ти', acc: 'тебе', accS: 'те', dat: 'на тебе', datS: 'ти' } },
  { id: '3m', en: 'he / him',
    sr: { long: 'on njega njemu njega - njim/njime njemu', short: '- ga mu ga - - -' },
    mk: { nom: 'тој', acc: 'него', accS: 'го', dat: 'на него/нему', datS: 'му' } },
  { id: '3f', en: 'she / her',
    sr: { long: 'ona nje njoj nju - njom/njome njoj', short: '- je joj je/ju - - -' },
    mk: { nom: 'таа', acc: 'неа', accS: 'ја', dat: 'на неа/нејзе', datS: 'ѝ/и' },
    note: 'SR je = her (object) AND is; MK ја = her. Classic bleed spot.' },
  { id: '3n', en: 'it',
    sr: { long: 'ono njega njemu njega - njim/njime njemu', short: '- ga mu ga - - -' },
    mk: { nom: 'тоа', acc: 'него', accS: 'го', dat: 'на него/нему', datS: 'му' } },
  { id: '1pl', en: 'we / us',
    sr: { long: 'mi nas nama nas - nama nama', short: '- nas nam nas - - -' },
    mk: { nom: 'ние', acc: 'нас', accS: 'нѐ/не', dat: 'на нас/нам', datS: 'ни' },
    note: 'MK нѐ (us) has an accent mark to tell it apart from не (not)' },
  { id: '2pl', en: 'you (plural or formal)',
    sr: { long: 'vi vas vama vas vi vama vama', short: '- vas vam vas - - -' },
    mk: { nom: 'вие', acc: 'вас', accS: 'ве', dat: 'на вас/вам', datS: 'ви' } },
  { id: '3pl', en: 'they / them',
    sr: { long: 'oni njih njima njih - njima njima', short: '- ih im ih - - -' },
    mk: { nom: 'тие', acc: 'нив', accS: 'ги', dat: 'на нив/ним', datS: 'им' },
    note: 'SR nominative also one (all-female group) and ona (neuter); MK тие for all' },
  { id: 'refl', en: 'oneself (myself, yourself…)',
    sr: { long: '- sebe sebi sebe - sobom sebi', short: '- se si se - - -' },
    mk: { nom: '-', acc: 'себе/себеси', accS: 'се', dat: 'на себе', datS: 'си' },
    note: 'same form for every person: perem se, se мијам; kupio sam sebi / си купив' },
];

// ---------- possessive ----------
// sr: m f n mPl fPl nPl (nominative; they decline like adjectives, drilled with nouns later)
// mk: m f n pl, def = same with the article (мојот, мојата, моето, моите)
// mk.kin: short form after a singular close-family noun (мајка ми, брат му)
export const POSSESSIVE = [
  { id: 'my', en: 'my',
    sr: 'moj moja moje moji moje moja',
    mk: { forms: 'мој моја мое мои', def: 'мојот мојата моето моите', kin: 'ми' } },
  { id: 'your', en: 'your (one person)',
    sr: 'tvoj tvoja tvoje tvoji tvoje tvoja',
    mk: { forms: 'твој твоја твое твои', def: 'твојот твојата твоето твоите', kin: 'ти' } },
  { id: 'his', en: 'his / its',
    sr: 'njegov njegova njegovo njegovi njegove njegova',
    mk: { forms: 'негов негова негово негови', def: 'неговиот неговата неговото неговите', kin: 'му' } },
  { id: 'her', en: 'her',
    sr: 'njen/njezin njena/njezina njeno/njezino njeni/njezini njene/njezine njena/njezina',
    mk: { forms: 'нејзин нејзина нејзино нејзини', def: 'нејзиниот нејзината нејзиното нејзините', kin: 'ѝ/и' } },
  { id: 'our', en: 'our',
    sr: 'naš naša naše naši naše naša',
    mk: { forms: 'наш наша наше наши', def: 'нашиот нашата нашето нашите', kin: 'ни' } },
  { id: 'your-pl', en: 'your (plural or formal)',
    sr: 'vaš vaša vaše vaši vaše vaša',
    mk: { forms: 'ваш ваша ваше ваши', def: 'вашиот вашата вашето вашите', kin: 'ви' } },
  { id: 'their', en: 'their',
    sr: 'njihov njihova njihovo njihovi njihove njihova',
    mk: { forms: 'нивен нивна нивно нивни', def: 'нивниот нивната нивното нивните', kin: 'им' } },
  { id: 'own', en: 'one’s own (my own, his own…)',
    sr: 'svoj svoja svoje svoji svoje svoja',
    mk: { forms: 'свој своја свое свои', def: 'својот својата своето своите', kin: '-' },
    note: 'when the owner is the subject: Tražim svoje ključeve. SR uses it a lot more than MK.' },
];

// ---------- drills ----------
// Same shape as connectors. skill names what the item tests, so mistakes are blamed right:
//   short     short form in the right case
//   place     clitic position (second position in SR; before the verb in MK)
//   cluster   two clitics together, in order (SR: dative before accusative, je last)
//   long      long form for emphasis or after a preposition
//   double    MK clitic doubling of a definite object
//   own       possessive / ownership
// sr or mk can be null when the drill only exists in one language.
export const DRILLS = [
  { id: 'see-him', skill: 'short', prompt: 'I see him.',
    sr: { frame: 'Vidim ___.', ans: 'ga' },
    mk: { frame: '___ гледам.', ans: 'го' } },
  { id: 'not-see-him', skill: 'place', prompt: 'I don’t see him.',
    sr: { frame: 'Ne vidim ___.', ans: 'ga' },
    mk: { frame: 'Не ___ гледам.', ans: 'го' },
    note: 'MK: clitic sits between не and the verb' },
  { id: 'know-her', skill: 'short', bleed: true, prompt: 'I know her.',
    sr: { frame: 'Poznajem ___.', ans: 'je' },
    mk: { frame: '___ познавам.', ans: 'ја' } },
  { id: 'called-me', skill: 'place', prompt: 'She called me.',
    sr: { frame: 'Zvala ___ je.', ans: 'me' },
    mk: { frame: 'Таа ___ се јави.', ans: 'ми' },
    note: 'SR: je always goes last in the clitic group' },
  { id: 'saw-them', skill: 'short', prompt: 'Did you see them?',
    sr: { frame: 'Jesi li ___ video?', ans: 'ih' },
    mk: { frame: 'Дали ___ виде?', ans: 'ги' } },
  { id: 'wait-you-pl', skill: 'short', prompt: 'We’re waiting for you (all).',
    sr: { frame: 'Čekamo ___.', ans: 'vas' },
    mk: { frame: '___ чекаме.', ans: 'ве' } },
  { id: 'gave-him', skill: 'short', prompt: 'I gave him the book.',
    sr: { frame: 'Dao sam ___ knjigu.', ans: 'mu' },
    mk: { frame: '___ ја дадов книгата.', ans: 'му' } },
  { id: 'told-us', skill: 'short', prompt: 'He told us.',
    sr: { frame: 'Rekao ___ je.', ans: 'nam' },
    mk: { frame: '___ кажа.', ans: 'ни' } },
  { id: 'tell-me', skill: 'short', prompt: 'Tell me.',
    sr: { frame: 'Reci ___.', ans: 'mi' },
    mk: { frame: 'Кажи ___.', ans: 'ми' } },
  { id: 'like-it', skill: 'short', prompt: 'I like it.',
    sr: { frame: 'Sviđa ___ se.', ans: 'mi' },
    mk: { frame: '___ се допаѓа.', ans: 'ми' },
    note: 'the liker is in the dative in both: literally "it pleases me"' },
  { id: 'cold', skill: 'short', prompt: 'I’m cold.',
    sr: { frame: 'Hladno ___ je.', ans: 'mi' },
    mk: { frame: 'Студено ___ е.', ans: 'ми' } },
  { id: 'you-like', skill: 'place', prompt: 'Do you like it?',
    sr: { frame: 'Da li ___ se sviđa?', ans: 'ti' },
    mk: { frame: 'Дали ___ се допаѓа?', ans: 'ти' } },
  { id: 'call-you', skill: 'place', prompt: 'I’ll call you.',
    sr: { frame: 'Zvaću ___.', ans: 'te' },
    mk: { frame: 'Ќе ___ се јавам.', ans: 'ти' },
    note: 'MK: clitic between ќе and the verb' },
  { id: 'gave-it-her', skill: 'cluster', prompt: 'I gave it to her.',
    sr: { frame: 'Dao sam ___.', ans: 'joj ga' },
    mk: { frame: '___ дадов.', ans: 'ѝ го/и го' },
    note: 'dative before accusative in both' },
  { id: 'wash', skill: 'short', prompt: 'I’m washing (myself).',
    sr: { frame: 'Perem ___.', ans: 'se' },
    mk: { frame: '___ мијам.', ans: 'се' } },
  { id: 'bought-myself', skill: 'short', prompt: 'I bought myself a phone.',
    sr: { frame: 'Kupio sam ___ telefon.', ans: 'sebi' },
    mk: { frame: '___ купив телефон.', ans: 'си' } },
  { id: 'me-emph', skill: 'long', prompt: 'Me? No way.',
    sr: { frame: '___? Ma kakvi.', ans: 'mene/ja' },
    mk: { frame: '___? Ма какво.', ans: 'мене/јас' } },
  { id: 'for-you', skill: 'long', prompt: 'This is for you.',
    sr: { frame: 'Ovo je za ___.', ans: 'tebe' },
    mk: { frame: 'Ова е за ___.', ans: 'тебе' } },
  { id: 'with-me', skill: 'long', prompt: 'Come with me.',
    sr: { frame: 'Hajde sa ___.', ans: 'mnom' },
    mk: { frame: 'Ајде со ___.', ans: 'мене' } },
  { id: 'with-her', skill: 'long', prompt: 'I’m talking with her.',
    sr: { frame: 'Pričam sa ___.', ans: 'njom' },
    mk: { frame: 'Зборувам со ___.', ans: 'неа' } },
  { id: 'about-him', skill: 'long', prompt: 'We’re talking about him.',
    sr: { frame: 'Pričamo o ___.', ans: 'njemu' },
    mk: { frame: 'Зборуваме за ___.', ans: 'него' } },
  { id: 'saw-marko', skill: 'double', prompt: 'I saw Marko.',
    sr: null,
    mk: { frame: '___ видов Марко.', ans: 'го' },
    note: 'MK doubles a definite object with a clitic; SR never does (Video sam Marka)' },
  { id: 'gave-brother', skill: 'double', prompt: 'I gave the book to my brother.',
    sr: null,
    mk: { frame: 'Му ___ дадов книгата на брат ми.', ans: 'ја' },
    note: 'both objects doubled: му (to brother) + ја (the book)' },
  { id: 'my-mother', skill: 'own', bleed: true, prompt: 'my mother',
    sr: { frame: '___ majka', ans: 'moja' },
    mk: { frame: 'мајка ___', ans: 'ми' } },
  { id: 'his-sister', skill: 'own', prompt: 'his sister',
    sr: { frame: '___ sestra', ans: 'njegova' },
    mk: { frame: 'сестра ___', ans: 'му' } },
  { id: 'my-parents', skill: 'own', bleed: true, prompt: 'my parents',
    sr: { frame: '___ roditelji', ans: 'moji' },
    mk: { frame: '___ родители', ans: 'моите' },
    note: 'plural family: MK uses мои + article, not the short form' },
  { id: 'her-book', skill: 'own', prompt: 'her book',
    sr: { frame: '___ knjiga', ans: 'njena/njezina' },
    mk: { frame: '___ книга', ans: 'нејзината' } },
  { id: 'their-house', skill: 'own', prompt: 'their house',
    sr: { frame: '___ kuća', ans: 'njihova' },
    mk: { frame: '___ куќа', ans: 'нивната' } },
  { id: 'own-keys', skill: 'own', prompt: 'I’m looking for my keys.',
    sr: { frame: 'Tražim ___ ključeve.', ans: 'svoje/moje' },
    mk: { frame: 'Ги барам ___ клучеви.', ans: 'моите/своите' },
    note: 'SR prefers svoje when the owner is the subject' },
];

export const PERSONAL_BY_ID = Object.fromEntries(PERSONAL.map(p => [p.id, p]));
export const POSSESSIVE_BY_ID = Object.fromEntries(POSSESSIVE.map(p => [p.id, p]));
export const DRILL_BY_ID = Object.fromEntries(DRILLS.map(d => [d.id, d]));
