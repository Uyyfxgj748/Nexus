/**
 * Script de limpieza integral de src/personajes.json
 * Ejecutar con: node scripts/limpiar_personajes.js
 */
const fs = require('fs');
const path = require('path');

const FILE   = path.join(__dirname, '../src/personajes.json');
const BACKUP = path.join(__dirname, '../src/personajes.backup.json');

// ── Restaurar desde backup y trabajar sobre él ───────────────────────────────
if (!fs.existsSync(BACKUP)) {
  fs.copyFileSync(FILE, BACKUP);
  console.log('✅ Backup creado en src/personajes.backup.json');
} else {
  console.log('♻️  Restaurando desde backup original...');
  fs.copyFileSync(BACKUP, FILE);
}

let { personajes } = JSON.parse(fs.readFileSync(FILE, 'utf8'));
console.log(`📦 Personajes originales: ${personajes.length}`);

// ────────────────────────────────────────────────────────────────────────────
// 1. NORMALIZACIÓN DE NOMBRES DE SERIES
// ────────────────────────────────────────────────────────────────────────────
const SERIE_RENAMES = {
  'Bocchi the Rock':  'Bocchi the Rock!',
  'Date a Live':      'Date A Live',
  'Honkai Star Rail': 'Honkai: Star Rail',
  'Goddess of Victory: NIKKE.': 'Nikke',
  'The quintessential quintuplets': 'The Quintessential Quintuplets',
  'vocaloid':         'Vocaloid',
  'Dungeon ni Deai wo Motomeru no wa Machigatteiru Darou ka': 'DanMachi',
  'Akame ga kill':    'Akame ga Kill!',
  'SAO Progressive':  'Sword Art Online',
  'Sword Art Online Alternative': 'Sword Art Online',
  'Mate seihei no slave': 'Chained Soldier',
};
personajes = personajes.map(p => ({ ...p, serie: SERIE_RENAMES[p.serie] || p.serie }));

// ────────────────────────────────────────────────────────────────────────────
// 2. ELIMINAR PERSONAJES DUPLICADOS / INCORRECTOS (por id)
// ────────────────────────────────────────────────────────────────────────────
const REMOVE_IDS = new Set([
  'yamada_ryo',             // Bocchi: "Ryo" = mismo que "Ryou" (yamada_ryou)
  'yatogami_touka',         // Date A Live: "Tohka Yatogami" = mismo que "Tohka"
  'itsuka_shido',           // Date A Live: "Shidou Itsuka" = mismo que "Shido"
  'kafka_honkai_star_rail', // Honkai: Star Rail: Kafka duplicada (valor 900 < 1100)
  'bronya_rand',            // Honkai: Star Rail: "Bronya Rand" = mismo que "Bronya" (val 950)
]);
personajes = personajes.filter(p => !REMOVE_IDS.has(p.id));

// ────────────────────────────────────────────────────────────────────────────
// 3. CORRECCIONES ESPECÍFICAS POR ID (ids reales verificados)
// ────────────────────────────────────────────────────────────────────────────
const CHAR_FIXES = {
  // ── Formatos / género ─────────────────────────────────────────────────────
  'sam_samsung':         { nombre: 'Sam', genero: 'Femenino' },
  'azuma_yachiho':       { serie: 'Chained Soldier' },
  'nakano_miku':         { nombre: 'Miku Nakano' },

  // ── Honkai ───────────────────────────────────────────────────────────────
  'bronya_zaychik':      { nombre: 'Bronya Zaychik' },   // HI3 — evita conflicto con HSR
  'seele_vollerei':      { nombre: 'Seele Vollerei' },   // HI3 — la de HSR se llama solo Seele
  'raiden_mei':          { nombre: 'Raiden Mei' },       // HI3 — evita conflicto con Mei (MHA/FMA/Naruto)
  'asta_star_rail':      { nombre: 'Asta (HSR)' },       // HSR — evita conflicto con Black Clover
  'robin_star_rail':     { nombre: 'Robin (HSR)' },      // HSR — evita conflicto con One Piece

  // ── Rin ──────────────────────────────────────────────────────────────────
  'tohsaka_rin':         { nombre: 'Tohsaka Rin' },      // Fate
  'kagamine_rin':        { nombre: 'Kagamine Rin' },     // Vocaloid
  'itoshi_rin':          { nombre: 'Itoshi Rin' },       // Blue Lock
  'hoshizora_rin':       { nombre: 'Rin (Love Live)' },  // Love Live
  'matsuoka_rin':        { nombre: 'Rin (Free!)' },      // Free!

  // ── Mei ───────────────────────────────────────────────────────────────────
  'terumi_mei':          { nombre: 'Mei Terumi' },       // Naruto
  'hatsume_mei':         { nombre: 'Mei Hatsume' },      // MHA
  'mei_chang':           { nombre: 'Mei Chang' },        // FMA

  // ── Sakura ───────────────────────────────────────────────────────────────
  'haruno_sakura':       { nombre: 'Sakura Haruno' },    // Naruto
  'matou_sakura':        { nombre: 'Sakura Matou' },     // Fate

  // ── Sayaka ───────────────────────────────────────────────────────────────
  'igarashi_sayaka':     { nombre: 'Sayaka (Kakegurui)' },
  'maizono_sayaka':      { nombre: 'Sayaka Maizono' },   // Danganronpa
  'miki_sayaka':         { nombre: 'Sayaka Miki' },      // Madoka

  // ── Makoto ───────────────────────────────────────────────────────────────
  'naegi_makoto':        { nombre: 'Makoto Naegi' },     // Danganronpa
  'kino_makoto':         { nombre: 'Makoto (Sailor Moon)' },
  'tachibana_makoto':    { nombre: 'Makoto (Free!)' },

  // ── Haruka ───────────────────────────────────────────────────────────────
  'tenou_haruka':        { nombre: 'Haruka Tenoh' },     // Sailor Moon
  'nanase_haruka':       { nombre: 'Haruka Nanase' },    // Free!

  // ── Nagisa ───────────────────────────────────────────────────────────────
  'hazuki_nagisa':       { nombre: 'Nagisa (Free!)' },

  // ── Shinji ───────────────────────────────────────────────────────────────
  'hirako_shinji':       { nombre: 'Hirako Shinji' },    // Bleach
  'ikari_shinji':        { nombre: 'Shinji Ikari' },     // NGE
  'yoshimatsu_shinji':   { nombre: 'Shinji (Lycoris Recoil)' },

  // ── Kyoko ────────────────────────────────────────────────────────────────
  'kirigiri_kyoko':      { nombre: 'Kyoko Kirigiri' },   // Danganronpa — verificado
  'sakura_kyoko':        { nombre: 'Kyoko (Madoka)' },   // Madoka

  // ── Mami ─────────────────────────────────────────────────────────────────
  'nanami_mami':         { nombre: 'Mami Nanami' },
  'tomoe_mami':          { nombre: 'Mami Tomoe' },

  // ── Tomoyo ───────────────────────────────────────────────────────────────
  'daidouji_tomoyo':     { nombre: 'Tomoyo (CCS)' },

  // ── Ichigo ───────────────────────────────────────────────────────────────
  'kurosaki_ichigo':     { nombre: 'Ichigo Kurosaki' },  // Bleach

  // ── Tohru ────────────────────────────────────────────────────────────────
  'honda_tohru':         { nombre: 'Tohru Honda' },      // Fruits Basket

  // ── Lucy ─────────────────────────────────────────────────────────────────
  'lucy_cyberpunk':      { nombre: 'Lucy (Cyberpunk)' },
  'lucy_zenless_zone_zero': { nombre: 'Lucy (ZZZ)' },

  // ── Yuri ─────────────────────────────────────────────────────────────────
  'yuri_briar':          { nombre: 'Yuri Briar' },       // Spy x Family
  'nakamura_yuri':       { nombre: 'Yuri (Angel Beats)' },
  'jahad_yuri':          { nombre: 'Yuri (Tower of God)' },

  // ── Love Live desambiguación ─────────────────────────────────────────────
  'nishikino_maki':      { nombre: 'Maki (Love Live)' },
  'takami_chika':        { nombre: 'Chika (Love Live)' },
  'minami_kotori':       { nombre: 'Kotori (Love Live)' },
  'sakurauchi_riko':     { nombre: 'Riko (Love Live)' },
  'kurosawa_ruby':       { nombre: 'Ruby (Love Live)' },

  // ── Varios ───────────────────────────────────────────────────────────────
  'mizuno_ami':          { nombre: 'Ami (Sailor Moon)' },
  'kawashima_ami':       { nombre: 'Ami (Toradora)' },
  'kurumi_lycoris_recoil': { nombre: 'Kurumi (Lycoris Recoil)' },
  'nana_elfen_lied':     { nombre: 'Nana (Elfen Lied)' },
  'deviluke_nana':       { nombre: 'Nana (To Love-Ru)' },
  'deviluke_momo':       { nombre: 'Momo (To Love-Ru)' },
  'kotegawa_yui':        { nombre: 'Yui (To Love-Ru)' },
  'yuigahama_yui':       { nombre: 'Yui (SNAFU)' },
  'yui_sao':             { nombre: 'Yui (SAO)' },
  'ichinose_asuna':      { nombre: 'Asuna (Blue Archive)' },
  'tendou_karin':        { nombre: 'Karin (Blue Archive)' },
  'hoshino_aqua':        { nombre: 'Aqua (Oshi no Ko)' },
  'freya_danmachi':      { nombre: 'Eris (DanMachi)' },
  'nakano_itsuki':       { nombre: 'Itsuki Nakano' },    // Quintuplets
  'sumeragi_itsuki':     { nombre: 'Itsuki (Kakegurui)' },
  'kawasumi_itsuki':     { nombre: 'Itsuki (Shield Hero)' },
  'edward_cowboy_bebop': { nombre: 'Edward (Cowboy Bebop)' },
  'ryugazaki_rei':       { nombre: 'Rei (Free!)' },
  'sakaguchi_hinata':    { nombre: 'Hinata (TenSura)' },
  'hyuuga_hinata':       { nombre: 'Hinata Hyuga' },     // Naruto
  'sohma_yuki':          { nombre: 'Yuki (Fruits Basket)' },
};

// Aplicar fixes — búsqueda también por id con variantes
personajes = personajes.map(p => {
  const fix = CHAR_FIXES[p.id];
  return fix ? { ...p, ...fix } : p;
});

// ────────────────────────────────────────────────────────────────────────────
// 4. ELIMINAR DUPLICADOS REALES (mismo nombre + serie tras fixes)
// ────────────────────────────────────────────────────────────────────────────
{
  const seen = new Set();
  const before = personajes.length;
  personajes = personajes.filter(p => {
    const key = p.nombre.toLowerCase() + '|' + p.serie.toLowerCase();
    if (seen.has(key)) {
      console.log(`🗑  Dup eliminado: "${p.nombre}" (${p.serie}) id=${p.id}`);
      return false;
    }
    seen.add(key);
    return true;
  });
  console.log(`🗑  ${before - personajes.length} duplicados eliminados.`);
}

// ────────────────────────────────────────────────────────────────────────────
// 5. NUEVOS PERSONAJES Y SERIES
//    Solo se insertan si el id Y el nombre+serie no existen ya.
// ────────────────────────────────────────────────────────────────────────────
const NUEVOS = [
  // ── Kaiju No. 8 ──────────────────────────────────────────────────────────
  { nombre: 'Kafka Hibino',      genero: 'Masculino', serie: 'Kaiju No. 8', valor: 1000, tag: 'kafka_hibino',          id: 'kafka_hibino_kaiju8' },
  { nombre: 'Mina Ashiro',       genero: 'Femenino',  serie: 'Kaiju No. 8', valor: 1100, tag: 'ashiro_mina',           id: 'ashiro_mina_kaiju8' },
  { nombre: 'Reno Ichikawa',     genero: 'Masculino', serie: 'Kaiju No. 8', valor:  900, tag: 'ichikawa_reno',         id: 'ichikawa_reno_kaiju8' },
  { nombre: 'Kikoru Shinomiya',  genero: 'Femenino',  serie: 'Kaiju No. 8', valor: 1050, tag: 'shinomiya_kikoru',      id: 'shinomiya_kikoru' },
  { nombre: 'Isao Shinomiya',    genero: 'Masculino', serie: 'Kaiju No. 8', valor:  950, tag: 'shinomiya_isao',        id: 'shinomiya_isao' },
  { nombre: 'Soshiro Hoshina',   genero: 'Masculino', serie: 'Kaiju No. 8', valor: 1100, tag: 'hoshina_soshiro',       id: 'hoshina_soshiro' },

  // ── Mashle: Magic and Muscles ─────────────────────────────────────────────
  { nombre: 'Mash Burnedead',    genero: 'Masculino', serie: 'Mashle',      valor: 1000, tag: 'mash_burnedead',        id: 'mash_burnedead' },
  { nombre: 'Finn Ames',         genero: 'Masculino', serie: 'Mashle',      valor:  750, tag: 'finn_ames',             id: 'finn_ames' },
  { nombre: 'Lance Crown',       genero: 'Masculino', serie: 'Mashle',      valor:  850, tag: 'lance_crown_(mashle)',   id: 'lance_crown_mashle' },
  { nombre: 'Dot Barrett',       genero: 'Masculino', serie: 'Mashle',      valor:  800, tag: 'dot_barrett',           id: 'dot_barrett' },
  { nombre: 'Lemon Irvine',      genero: 'Femenino',  serie: 'Mashle',      valor:  850, tag: 'lemon_irvine',          id: 'lemon_irvine' },
  { nombre: 'Cell War',          genero: 'Masculino', serie: 'Mashle',      valor:  900, tag: 'cell_war_(mashle)',      id: 'cell_war_mashle' },

  // ── The Apothecary Diaries ────────────────────────────────────────────────
  { nombre: 'Maomao',            genero: 'Femenino',  serie: 'The Apothecary Diaries', valor:  950, tag: 'maomao_(apothecary_diaries)',   id: 'maomao_apothecary' },
  { nombre: 'Jinshi',            genero: 'Masculino', serie: 'The Apothecary Diaries', valor: 1100, tag: 'jinshi_(apothecary_diaries)',    id: 'jinshi_apothecary' },
  { nombre: 'Gyokuyou',          genero: 'Femenino',  serie: 'The Apothecary Diaries', valor:  900, tag: 'gyokuyou_(apothecary_diaries)', id: 'gyokuyou_apothecary' },
  { nombre: 'Gaoshun',           genero: 'Masculino', serie: 'The Apothecary Diaries', valor:  800, tag: 'gaoshun_(apothecary_diaries)',  id: 'gaoshun_apothecary' },
  { nombre: 'Lishu',             genero: 'Femenino',  serie: 'The Apothecary Diaries', valor:  750, tag: 'lishu_(apothecary_diaries)',    id: 'lishu_apothecary' },

  // ── Classroom of the Elite ────────────────────────────────────────────────
  { nombre: 'Kiyotaka Ayanokoji', genero: 'Masculino', serie: 'Classroom of the Elite', valor: 1200, tag: 'ayanokouji_kiyotaka', id: 'ayanokouji_kiyotaka' },
  { nombre: 'Suzune Horikita',   genero: 'Femenino',  serie: 'Classroom of the Elite', valor: 1000, tag: 'horikita_suzune',     id: 'horikita_suzune' },
  { nombre: 'Kikyou Kushida',    genero: 'Femenino',  serie: 'Classroom of the Elite', valor:  900, tag: 'kushida_kikyou',      id: 'kushida_kikyou' },
  { nombre: 'Kei Karuizawa',     genero: 'Femenino',  serie: 'Classroom of the Elite', valor:  950, tag: 'karuizawa_kei',       id: 'karuizawa_kei' },
  { nombre: 'Honami Ichinose',   genero: 'Femenino',  serie: 'Classroom of the Elite', valor: 1000, tag: 'ichinose_honami',     id: 'ichinose_honami' },
  { nombre: 'Arisu Sakayanagi',  genero: 'Femenino',  serie: 'Classroom of the Elite', valor: 1100, tag: 'sakayanagi_arisu',    id: 'sakayanagi_arisu' },
  { nombre: 'Kakeru Ryuen',      genero: 'Masculino', serie: 'Classroom of the Elite', valor: 1050, tag: 'ryuuen_kakeru',       id: 'ryuuen_kakeru' },

  // ── The Eminence in Shadow ────────────────────────────────────────────────
  { nombre: 'Shadow',            genero: 'Masculino', serie: 'The Eminence in Shadow', valor: 1200, tag: 'shadow_(eminence_in_shadow)', id: 'shadow_eminence' },
  { nombre: 'Alpha',             genero: 'Femenino',  serie: 'The Eminence in Shadow', valor: 1000, tag: 'alpha_(eminence_in_shadow)',  id: 'alpha_eminence' },
  { nombre: 'Beta',              genero: 'Femenino',  serie: 'The Eminence in Shadow', valor:  950, tag: 'beta_(eminence_in_shadow)',   id: 'beta_eminence' },
  { nombre: 'Gamma',             genero: 'Femenino',  serie: 'The Eminence in Shadow', valor:  900, tag: 'gamma_(eminence_in_shadow)',  id: 'gamma_eminence' },
  { nombre: 'Delta',             genero: 'Femenino',  serie: 'The Eminence in Shadow', valor:  850, tag: 'delta_(eminence_in_shadow)',  id: 'delta_eminence' },
  { nombre: 'Epsilon',           genero: 'Femenino',  serie: 'The Eminence in Shadow', valor:  800, tag: 'epsilon_(eminence_in_shadow)', id: 'epsilon_eminence' },

  // ── Accel World (expansión) ───────────────────────────────────────────────
  { nombre: 'Haruyuki Arita',    genero: 'Masculino', serie: 'Accel World', valor:  800, tag: 'arita_haruyuki',    id: 'arita_haruyuki' },
  { nombre: 'Chiyuri Kurashima', genero: 'Femenino',  serie: 'Accel World', valor:  800, tag: 'kurashima_chiyuri', id: 'kurashima_chiyuri' },
  { nombre: 'Takumu Mayuzumi',   genero: 'Masculino', serie: 'Accel World', valor:  850, tag: 'mayuzumi_takumu',   id: 'mayuzumi_takumu' },
  { nombre: 'Utai Shinomiya',    genero: 'Femenino',  serie: 'Accel World', valor:  900, tag: 'shinomiya_utai',    id: 'shinomiya_utai' },

  // ── A Silent Voice (expansión) ────────────────────────────────────────────
  { nombre: 'Shoya Ishida',      genero: 'Masculino', serie: 'A Silent Voice', valor:  900, tag: 'ishida_shoya',     id: 'ishida_shoya' },
  { nombre: 'Yuzuru Nishimiya',  genero: 'Femenino',  serie: 'A Silent Voice', valor:  800, tag: 'nishimiya_yuzuru', id: 'nishimiya_yuzuru' },
  { nombre: 'Nagatsuka',         genero: 'Masculino', serie: 'A Silent Voice', valor:  700, tag: 'nagatsuka_tomohiro', id: 'nagatsuka_tomohiro' },

  // ── Violet Evergarden (expansión) ────────────────────────────────────────
  { nombre: 'Claudia Hodgins',   genero: 'Masculino', serie: 'Violet Evergarden', valor:  900, tag: 'hodgins_claudia', id: 'hodgins_claudia' },
  { nombre: 'Ann Magnolia',      genero: 'Femenino',  serie: 'Violet Evergarden', valor:  850, tag: 'magnolia_ann',     id: 'magnolia_ann' },

  // ── Sousou no Frieren (expansión) ─────────────────────────────────────────
  { nombre: 'Stark',             genero: 'Masculino', serie: 'Sousou no Frieren', valor:  950, tag: 'stark_(frieren)',  id: 'stark_frieren' },
  { nombre: 'Denken',            genero: 'Masculino', serie: 'Sousou no Frieren', valor:  900, tag: 'denken_(frieren)', id: 'denken_frieren' },
  { nombre: 'Lawine',            genero: 'Femenino',  serie: 'Sousou no Frieren', valor:  850, tag: 'lawine_(frieren)', id: 'lawine_frieren' },
  { nombre: 'Laufen',            genero: 'Femenino',  serie: 'Sousou no Frieren', valor:  850, tag: 'laufen_(frieren)', id: 'laufen_frieren' },

  // ── Berserk (expansión) ───────────────────────────────────────────────────
  { nombre: 'Skull Knight',      genero: 'Masculino', serie: 'Berserk',       valor: 1400, tag: 'skull_knight',          id: 'skull_knight' },
  { nombre: 'Farnese',           genero: 'Femenino',  serie: 'Berserk',       valor:  900, tag: 'de_vandimion_farnese',   id: 'farnese_berserk' },

  // ── Vinland Saga (expansión) ──────────────────────────────────────────────
  { nombre: 'Canute',            genero: 'Masculino', serie: 'Vinland Saga',  valor: 1000, tag: 'canute_(vinland_saga)', id: 'canute_vinland_saga' },
  { nombre: 'Leif Erikson',      genero: 'Masculino', serie: 'Vinland Saga',  valor:  800, tag: 'leif_erikson_(vinland)', id: 'leif_erikson_vinland' },

  // ── Solo Leveling (expansión) ─────────────────────────────────────────────
  { nombre: 'Cha Hae-In',        genero: 'Femenino',  serie: 'Solo Leveling', valor: 1100, tag: 'cha_hae-in',        id: 'cha_haein_solo' },
  { nombre: 'Baek Yoonho',       genero: 'Masculino', serie: 'Solo Leveling', valor: 1000, tag: 'baek_yoonho',       id: 'baek_yoonho' },

  // ── Wuthering Waves (expansión) ───────────────────────────────────────────
  { nombre: 'Changli',           genero: 'Femenino',  serie: 'Wuthering Waves', valor: 1100, tag: 'changli_(wuwa)',    id: 'changli_wuwa' },
  { nombre: 'Zhezhi',            genero: 'Femenino',  serie: 'Wuthering Waves', valor: 1050, tag: 'zhezhi_(wuwa)',     id: 'zhezhi_wuwa' },
  { nombre: 'Cartethyia',        genero: 'Femenino',  serie: 'Wuthering Waves', valor: 1200, tag: 'cartethyia_(wuwa)', id: 'cartethyia_wuwa' },
  { nombre: 'Camellya',          genero: 'Femenino',  serie: 'Wuthering Waves', valor: 1150, tag: 'camellya_(wuwa)',   id: 'camellya_wuwa' },

  // ── Zenless Zone Zero (expansión) ────────────────────────────────────────
  { nombre: 'Belle',             genero: 'Femenino',  serie: 'Zenless Zone Zero', valor: 1000, tag: 'belle_(zzz)',      id: 'belle_zzz' },
  { nombre: 'Wise',              genero: 'Masculino', serie: 'Zenless Zone Zero', valor: 1000, tag: 'wise_(zzz)',       id: 'wise_zzz' },
  { nombre: 'Ellen Joe',         genero: 'Femenino',  serie: 'Zenless Zone Zero', valor: 1100, tag: 'ellen_joe_(zzz)',  id: 'ellen_joe_zzz_new' },
  { nombre: 'Burnice White',     genero: 'Femenino',  serie: 'Zenless Zone Zero', valor: 1000, tag: 'burnice_white_(zzz)', id: 'burnice_white_zzz' },
  { nombre: 'Caesar King',       genero: 'Femenino',  serie: 'Zenless Zone Zero', valor: 1050, tag: 'caesar_king_(zzz)', id: 'caesar_king_zzz' },
  { nombre: 'Miyabi',            genero: 'Femenino',  serie: 'Zenless Zone Zero', valor: 1150, tag: 'miyabi_(zzz)',     id: 'miyabi_zzz_new' },
  { nombre: 'Yanagi',            genero: 'Femenino',  serie: 'Zenless Zone Zero', valor: 1100, tag: 'yanagi_(zzz)',     id: 'yanagi_zzz_new' },
  { nombre: 'Zhu Yuan',          genero: 'Femenino',  serie: 'Zenless Zone Zero', valor: 1050, tag: 'zhu_yuan_(zzz)',   id: 'zhu_yuan_zzz_new' },

  // ── Genshin Impact (expansión) ────────────────────────────────────────────
  { nombre: 'Clorinde',          genero: 'Femenino',  serie: 'Genshin Impact', valor: 1100, tag: 'clorinde_(genshin)',   id: 'clorinde_genshin_new' },
  { nombre: 'Navia',             genero: 'Femenino',  serie: 'Genshin Impact', valor: 1050, tag: 'navia_(genshin)',      id: 'navia_genshin_new' },
  { nombre: 'Chiori',            genero: 'Femenino',  serie: 'Genshin Impact', valor: 1000, tag: 'chiori_(genshin)',     id: 'chiori_genshin_new' },
  { nombre: 'Mualani',           genero: 'Femenino',  serie: 'Genshin Impact', valor: 1050, tag: 'mualani_(genshin)',    id: 'mualani_genshin' },
  { nombre: 'Kinich',            genero: 'Masculino', serie: 'Genshin Impact', valor: 1050, tag: 'kinich_(genshin)',     id: 'kinich_genshin' },
  { nombre: 'Xilonen',           genero: 'Femenino',  serie: 'Genshin Impact', valor: 1100, tag: 'xilonen_(genshin)',    id: 'xilonen_genshin' },
  { nombre: 'Chasca',            genero: 'Femenino',  serie: 'Genshin Impact', valor: 1050, tag: 'chasca_(genshin)',     id: 'chasca_genshin' },
  { nombre: 'Citlali',           genero: 'Femenino',  serie: 'Genshin Impact', valor: 1150, tag: 'citlali_(genshin)',    id: 'citlali_genshin_new' },
  { nombre: 'Mavuika',           genero: 'Femenino',  serie: 'Genshin Impact', valor: 1300, tag: 'mavuika_(genshin)',    id: 'mavuika_genshin' },
  { nombre: 'Iansan',            genero: 'Femenino',  serie: 'Genshin Impact', valor: 1050, tag: 'iansan_(genshin)',     id: 'iansan_genshin' },
];

// ────────────────────────────────────────────────────────────────────────────
// 6. INSERTAR NUEVOS — saltar si id O nombre+serie ya existen
// ────────────────────────────────────────────────────────────────────────────
const existingIds    = new Set(personajes.map(p => p.id));
const existingNS     = new Set(personajes.map(p => p.nombre.toLowerCase() + '|' + p.serie.toLowerCase()));
let added = 0, skipped = 0;
for (const np of NUEVOS) {
  if (existingIds.has(np.id)) { skipped++; continue; }
  const nsKey = np.nombre.toLowerCase() + '|' + np.serie.toLowerCase();
  if (existingNS.has(nsKey)) { skipped++; continue; }
  personajes.push(np);
  existingIds.add(np.id);
  existingNS.add(nsKey);
  added++;
}

// ────────────────────────────────────────────────────────────────────────────
// 7. ORDENAR: por serie, luego por valor desc
// ────────────────────────────────────────────────────────────────────────────
personajes.sort((a, b) => {
  if (a.serie < b.serie) return -1;
  if (a.serie > b.serie) return  1;
  return (b.valor || 0) - (a.valor || 0);
});

// ────────────────────────────────────────────────────────────────────────────
// 8. VALIDACIÓN FINAL
// ────────────────────────────────────────────────────────────────────────────
const nameMap = {};
personajes.forEach(p => {
  if (!nameMap[p.nombre]) nameMap[p.nombre] = [];
  nameMap[p.nombre].push(p.serie);
});
const stillDups = Object.entries(nameMap).filter(([, s]) => s.length > 1);

const tagMap = {};
personajes.forEach(p => {
  if (!p.tag) return;
  if (!tagMap[p.tag]) tagMap[p.tag] = [];
  tagMap[p.tag].push(p.nombre);
});
const tagDups = Object.entries(tagMap).filter(([, n]) => n.length > 1);

// ────────────────────────────────────────────────────────────────────────────
// 9. GUARDAR
// ────────────────────────────────────────────────────────────────────────────
fs.writeFileSync(FILE, JSON.stringify({ personajes }, null, 2), 'utf8');

const seriesFinales = [...new Set(personajes.map(p => p.serie))].sort();
console.log(`\n📊 RESUMEN FINAL:`);
console.log(`   Personajes totales  : ${personajes.length}`);
console.log(`   Series totales      : ${seriesFinales.length}`);
console.log(`   Nuevos agregados    : ${added}`);
console.log(`   Saltados (ya exist.): ${skipped}`);

if (stillDups.length > 0) {
  console.log(`\n⚠️  Nombres aún duplicados (${stillDups.length}):`);
  stillDups.forEach(([n, s]) => console.log(`   "${n}" → ${s.join(' | ')}`));
} else {
  console.log('\n✅ Sin nombres duplicados entre series.');
}
if (tagDups.length > 0) {
  console.log(`\n⚠️  Tags duplicados (${tagDups.length}):`);
  tagDups.forEach(([t, n]) => console.log(`   "${t}" → ${n.join(' | ')}`));
} else {
  console.log('✅ Sin tags duplicados.');
}

// Series con sus conteos finales
console.log('\n📋 Series finales:');
seriesFinales.forEach(s => {
  const c = personajes.filter(p => p.serie === s).length;
  console.log(`   ${c.toString().padStart(3)} ${s}`);
});
console.log('\n✅ src/personajes.json actualizado correctamente.');
