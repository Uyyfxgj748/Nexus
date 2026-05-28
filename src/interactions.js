const axios = require('axios');
const fs   = require('fs');
const path = require('path');
const os   = require('os');
const { execSync } = require('child_process');
const ffmpeg = require('fluent-ffmpeg');

// Usar el ffmpeg del sistema (Nix) que es más compatible que el bundled de @ffmpeg-installer
function resolverFfmpegPath() {
    try {
        return execSync('which ffmpeg', { encoding: 'utf8' }).trim();
    } catch {
        // Fallback al bundled si el sistema no tiene ffmpeg
        return require('@ffmpeg-installer/ffmpeg').path;
    }
}
ffmpeg.setFfmpegPath(resolverFfmpegPath());

const HUMAN_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
    'Accept': '*/*',
    'Accept-Language': 'en-US,en;q=0.9',
    'Referer': 'https://www.google.com/'
};

// Headers específicos para Rule34 (incluye User-Agent NexusBot/1.0 obligatorio)
const NEXUS_R34_HEADERS = {
    'User-Agent': 'NexusBot/1.0',
    'Accept': '*/*',
    'Accept-Language': 'en-US,en;q=0.9',
    'Referer': 'https://rule34.xxx/'
};

axios.defaults.headers.common = { ...axios.defaults.headers.common, ...HUMAN_HEADERS };

// ══════════════════════════════════════════
//  MEDIA LOCAL — busca archivos en interactions/sfw o interactions/nsfw
// ══════════════════════════════════════════
const LOCAL_MEDIA_EXTS = new Set(['.gif', '.mp4', '.webm', '.jpg', '.jpeg', '.png', '.webp']);


// Alias → carpeta canónica para acciones NSFW
const NSFW_ACCION_CARPETA = {
    mamada:   'blowjob',
    bj:       'blowjob',
    paja:     'fap',
    coger:    'fuck',
    '69':     'sixnine',
    nalgada:  'spank',
    encuerar: 'undress',
    tijeras:  'yuri',
};

// Alias → carpeta canónica para imágenes NSFW
const NSFW_IMG_CARPETA = {
    poto:      'ass',
    boobs:     'paizuri',
    tetas:     'paizuri',
    hentaigif: 'hentai',
    nekomimi:  'neko',
};

// ── LRU anti-repetición de URLs SFW ─────────────────────────────────────────
// Evita que el bot envíe la misma URL dos veces seguidas por endpoint.
const SFW_URL_HISTORY = new Map(); // endpoint → string[]
const SFW_HISTORY_MAX = 30;

function sfwRecordUrl(endpoint, url) {
    if (!url) return;
    const arr = SFW_URL_HISTORY.get(endpoint) || [];
    if (!arr.includes(url)) arr.push(url);
    if (arr.length > SFW_HISTORY_MAX) arr.shift();
    SFW_URL_HISTORY.set(endpoint, arr);
}

function sfwFilterUrls(endpoint, urls) {
    if (!urls.length) return urls;
    const seen = new Set(SFW_URL_HISTORY.get(endpoint) || []);
    if (!seen.size) return urls;
    const fresh = urls.filter(u => !seen.has(u));
    return fresh.length >= 3 ? fresh : urls;
}

/**
 * Busca un archivo multimedia aleatorio en interactions/{categoria}/{carpeta}/.
 * Solo sirve archivos colocados manualmente — no escribe nada automáticamente.
 * Devuelve { buffer, isVideo } o null si no hay archivos.
 */
function obtenerMediaLocal(categoria, carpeta) {
    if (!carpeta) return null;
    try {
        const dir = path.join(__dirname, '..', 'interactions', categoria, carpeta);
        if (!fs.existsSync(dir)) return null;
        const archivos = fs.readdirSync(dir).filter(f => {
            const ext = path.extname(f).toLowerCase();
            return LOCAL_MEDIA_EXTS.has(ext) && !f.startsWith('.');
        });
        if (!archivos.length) return null;

        // Barajar aleatoriamente y devolver el primero que se pueda leer
        const shuffled = [...archivos].sort(() => Math.random() - 0.5);
        for (const archivo of shuffled) {
            const filePath = path.join(dir, archivo);
            const ext = path.extname(archivo).toLowerCase();
            const isVideo = ext === '.mp4' || ext === '.webm';
            try {
                const buffer = fs.readFileSync(filePath);
                if (buffer.length < 100) continue;
                return { buffer, isVideo };
            } catch { continue; }
        }
        return null;
    } catch {
        return null;
    }
}

function logRequestError(contexto, err) {
    const txt = String(err?.message || err?.response?.data || '').toLowerCase();
    if (err?.response?.status === 429 || txt.includes('rate-overlimit') || txt.includes('too many requests') || txt.includes('overlimit')) return;
    console.error('ERROR:', contexto, err.response?.data || err.message);
}

// ══════════════════════════════════════════
//  DICCIONARIO DE TRADUCCIÓN R34 (ES → tags booru)
// ══════════════════════════════════════════
const R34_TAG_DICT = {
    // Cuerpo
    'tetas': 'breasts', 'pechos': 'breasts', 'senos': 'breasts',
    'tetas grandes': 'big_breasts', 'tetona': 'big_breasts', 'tetonas': 'big_breasts',
    'tetas pequeñas': 'small_breasts', 'plana': 'flat_chest', 'planas': 'flat_chest',
    'culo': 'ass', 'poto': 'ass', 'nalgas': 'ass', 'trasero': 'ass', 'pompas': 'ass',
    'culo grande': 'large_ass', 'coño': 'pussy', 'vagina': 'pussy', 'pene': 'penis',
    'polla': 'penis', 'pito': 'penis', 'piernas': 'legs', 'muslos': 'thighs',
    'muslos gruesos': 'thick_thighs', 'cintura': 'waist', 'cadera': 'hips',
    'ombligo': 'navel', 'pies': 'feet', 'axilas': 'armpits',
    // Cabello
    'rubia': 'blonde_hair', 'rubio': 'blonde_hair',
    'pelirroja': 'red_hair', 'pelirrojo': 'red_hair',
    'morena': 'brown_hair', 'moreno': 'brown_hair',
    'negra': 'black_hair', 'cabello negro': 'black_hair',
    'azul': 'blue_hair', 'cabello azul': 'blue_hair',
    'rosa': 'pink_hair', 'cabello rosa': 'pink_hair',
    'verde': 'green_hair', 'plateada': 'silver_hair', 'blanca': 'white_hair',
    'morada': 'purple_hair', 'arcoiris': 'multicolored_hair',
    // Ojos
    'ojos azules': 'blue_eyes', 'ojos rojos': 'red_eyes', 'ojos verdes': 'green_eyes',
    'ojos rosas': 'pink_eyes', 'ojos morados': 'purple_eyes',
    // Tipo de personaje
    'neko': 'catgirl', 'gata': 'catgirl', 'catgirl': 'catgirl',
    'elfa': 'elf', 'demonio': 'demon_girl', 'angel': 'angel',
    'succubus': 'succubus', 'bruja': 'witch', 'maid': 'maid',
    'ninja': 'ninja', 'vikinga': 'viking', 'guerrera': 'warrior',
    'sirena': 'mermaid', 'hada': 'fairy', 'coneja': 'bunny_girl', 'conejita': 'bunny_girl',
    'zorra': 'fox_girl', 'lobo': 'wolf_girl', 'dragona': 'dragon_girl',
    'milf': 'milf', 'madre': 'milf', 'maestra': 'teacher', 'enfermera': 'nurse',
    'policia': 'police', 'idol': 'idol', 'bruja': 'witch',
    'futanari': 'futanari', 'futa': 'futanari', 'trap': 'femboy', 'femboy': 'femboy',
    // Ropa y lencería
    'desnuda': 'nude', 'desnudo': 'nude', 'sin ropa': 'nude',
    'lenceria': 'lingerie', 'lencería': 'lingerie', 'ropa interior': 'lingerie',
    'bikini': 'bikini', 'tanga': 'thong', 'calzones': 'panties', 'panties': 'panties',
    'calcetas': 'socks', 'medias': 'thighhighs', 'leggings': 'leggings',
    'vestido': 'dress', 'falda': 'skirt', 'minifalta': 'miniskirt', 'uniforme': 'school_uniform',
    'colegiala': 'school_uniform', 'pijama': 'pajamas', 'kimono': 'kimono',
    'armadura': 'armor', 'bata': 'open_clothes', 'sueter': 'sweater', 'suéter': 'sweater',
    // Acciones / situaciones
    'hentai': 'sex', 'sexo': 'sex', 'follar': 'sex', 'coger': 'sex',
    'mamada': 'blowjob', 'chupar': 'blowjob', 'lamer': 'cunnilingus',
    'creampie': 'creampie', 'corrida': 'cum', 'correrse': 'cum',
    'anal': 'anal', 'doble': 'double_penetration', 'dp': 'double_penetration',
    'masturbacion': 'masturbation', 'masturbación': 'masturbation', 'paja': 'handjob',
    'beso': 'kiss', 'abuso': 'rape', 'atada': 'bondage', 'bondage': 'bondage',
    'sumisa': 'submissive', 'dominatrix': 'femdom', 'dominacion': 'femdom',
    'grupo': 'group_sex', 'orgia': 'orgy', 'yuri': 'yuri', 'yaoi': 'yaoi',
    // Cantidad de personajes
    'sola': '1girl', 'solo': '1girl', 'dos chicas': '2girls', 'pareja': 'hetero',
    // Otras
    'anime': '1girl', 'ecchi': 'ecchi', 'tentaculo': 'tentacle', 'tentáculos': 'tentacle',
    'magia': 'magic', 'playa': 'beach', 'piscina': 'pool', 'ducha': 'shower', 'baño': 'bath',
    'gordita': 'chubby', 'curvilínea': 'curvy', 'delgada': 'slim', 'musculosa': 'muscular',
    'embarazada': 'pregnant', 'lactando': 'lactation', 'leche': 'lactation',
    'cosplay': 'cosplay', 'gamer': 'gamer_girl', 'bailando': 'dancing'
};

function traducirTagsR34(input) {
    const palabras = String(input || '').toLowerCase().trim().split(/\s+/).filter(Boolean);
    const traducidas = palabras.map(p => R34_TAG_DICT[p] || p);
    return traducidas.join('+');
}

function parsearInputR34(queryRaw) {
    const raw = String(queryRaw || '').trim();
    const normaliz = s => s.toLowerCase()
        .replace(/[áàä]/g, 'a').replace(/[éèë]/g, 'e')
        .replace(/[íìï]/g, 'i').replace(/[óòö]/g, 'o').replace(/[úùü]/g, 'u');
    const palabras = raw.toLowerCase().split(/\s+/).filter(Boolean);
    let waifuTag = null;
    let restoIdx = 0;
    for (let n = Math.min(3, palabras.length); n >= 1; n--) {
        const candidato = palabras.slice(0, n).join(' ');
        const w = encontrarWaifu(candidato);
        if (w?.tag) {
            const normCand = normaliz(candidato).replace(/\s/g, '');
            const normKey  = normaliz(w.key || '').replace(/\s/g, '');
            if (normCand === normKey) {
                waifuTag = String(w.tag).toLowerCase();
                restoIdx = n;
                break;
            }
        }
    }
    const restoPalabras = palabras.slice(restoIdx);
    const tagsExtra = restoPalabras.map(p => R34_TAG_DICT[p] || p.replace(/\s+/g, '_')).filter(Boolean);
    const todosTags = waifuTag ? [waifuTag, ...tagsExtra] : (tagsExtra.length ? tagsExtra : [palabras.join('_')]);
    const hayTraduccion = restoPalabras.some((p, i) => (R34_TAG_DICT[p] || p) !== restoPalabras[i]);
    return { tags: todosTags.join('+'), waifuTag, tagsExtra, labelOriginal: raw, hayTraduccion };
}

function sugerenciasR34() {
    const pares = [
        ['rubia', 'blonde_hair'], ['morena', 'brown_hair'], ['pelirroja', 'red_hair'],
        ['desnuda', 'nude'], ['bikini', 'bikini'], ['colegiala', 'school_uniform'],
        ['lenceria', 'lingerie'], ['neko', 'catgirl'], ['milf', 'milf'],
        ['maid', 'maid'], ['medias', 'thighhighs'], ['futa', 'futanari'],
        ['yuri', 'yuri'], ['conejita', 'bunny_girl'], ['creampie', 'creampie'],
    ];
    const elegidos = pares.sort(() => Math.random() - 0.5).slice(0, 5);
    return elegidos.map(([es, en]) => `_${es}_ → \`${en}\``).join('\n');
}

function pidRandomR34() {
    return Math.floor(Math.random() * 51); // 0..50
}

// ══════════════════════════════════════════
//  BASE DE DATOS WAIFUS
// ══════════════════════════════════════════
const waifuDB = [
    // Re:Zero
    { key: 'rem', tag: 'rem_(re_zero)' }, { key: 'ram', tag: 'ram_(re_zero)' },
    { key: 'emilia', tag: 'emilia_(re_zero)' }, { key: 'beatrice', tag: 'beatrice_(re_zero)' },
    { key: 'echidna', tag: 'echidna_(re_zero)' }, { key: 'satella', tag: 'satella_(re_zero)' },
    // SAO
    { key: 'asuna', tag: 'asuna_(sao)' }, { key: 'suguha', tag: 'suguha_kirigaya' },
    { key: 'silica', tag: 'silica_(sao)' }, { key: 'sinon', tag: 'asada_shino' },
    { key: 'alice', tag: 'alice_schuberg' }, { key: 'yuuki', tag: 'yuuki_(sao)' },
    // AOT
    { key: 'mikasa', tag: 'mikasa_ackerman' }, { key: 'historia', tag: 'historia_reiss' },
    { key: 'annie', tag: 'annie_leonhardt' }, { key: 'sasha', tag: 'blouse_sasha' },
    { key: 'hange', tag: 'hange_zoe' }, { key: 'pieck', tag: 'pieck_finger' },
    // Naruto
    { key: 'hinata', tag: 'hyuuga_hinata' }, { key: 'sakura', tag: 'haruno_sakura' },
    { key: 'tsunade', tag: 'tsunade' }, { key: 'temari', tag: 'temari_(naruto)' },
    { key: 'konan', tag: 'konan_(naruto)' }, { key: 'kushina', tag: 'uzumaki_kushina' },
    // Demon Slayer
    { key: 'nezuko', tag: 'kamado_nezuko' }, { key: 'shinobu', tag: 'kochou_shinobu' },
    { key: 'mitsuri', tag: 'kanroji_mitsuri' }, { key: 'kanao', tag: 'tsuyuri_kanao' },
    { key: 'daki', tag: 'daki_(kimetsu)' },
    // JJK
    { key: 'nobara', tag: 'kugisaki_nobara' }, { key: 'maki', tag: 'zenin_maki' },
    { key: 'mai', tag: 'zenin_mai' }, { key: 'mei mei', tag: 'mei_mei_(jujutsu)' },
    { key: 'miwa', tag: 'miwa_kasumi' },
    // MHA
    { key: 'ochako', tag: 'uraraka_ochako' }, { key: 'tsuyu', tag: 'asui_tsuyu' },
    { key: 'momo', tag: 'yaoyorozu_momo' }, { key: 'toga', tag: 'toga_himiko' },
    { key: 'mirko', tag: 'usagiyama_rumi' }, { key: 'jirou', tag: 'jirou_kyouka' },
    { key: 'mina', tag: 'ashido_mina' }, { key: 'nejire', tag: 'hado_nejire' },
    // One Piece
    { key: 'nami', tag: 'nami_(one_piece)' }, { key: 'robin', tag: 'nico_robin' },
    { key: 'hancock', tag: 'boa_hancock' }, { key: 'yamato', tag: 'yamato_(one_piece)' },
    { key: 'carrot', tag: 'carrot_(one_piece)' },
    // Dragon Ball
    { key: 'bulma', tag: 'bulma' }, { key: 'android 18', tag: 'android_18' },
    { key: 'caulifla', tag: 'caulifla' }, { key: 'kale', tag: 'kale_(dragon_ball)' },
    { key: 'videl', tag: 'videl' },
    // Fate
    { key: 'saber', tag: 'saber_(fate)' }, { key: 'rin', tag: 'tohsaka_rin' },
    { key: 'illya', tag: 'illyasviel_von_einzbern' }, { key: 'artoria', tag: 'artoria_pendragon' },
    { key: 'tamamo', tag: 'tamamo_no_mae_(fate)' }, { key: 'scathach', tag: 'scathach_(fate)' },
    { key: 'nero', tag: 'nero_claudius_(fate)' }, { key: 'medusa', tag: 'medusa_(fate)' },
    { key: 'morgan', tag: 'morgan_le_fay_(fate)' },
    // Konosuba
    { key: 'aqua', tag: 'aqua_(konosuba)' }, { key: 'megumin', tag: 'megumin_(konosuba)' },
    { key: 'darkness', tag: 'lalatina_dustiness_ford' }, { key: 'yunyun', tag: 'yunyun_(konosuba)' },
    { key: 'wiz', tag: 'wiz_(konosuba)' }, { key: 'eris', tag: 'eris_(konosuba)' },
    // Spy x Family
    { key: 'yor', tag: 'yor_forger' }, { key: 'anya', tag: 'anya_forger' },
    // Date A Live
    { key: 'tohka', tag: 'yatogami_tohka' }, { key: 'kurumi', tag: 'tokisaki_kurumi' },
    { key: 'kotori', tag: 'itsuka_kotori' }, { key: 'yoshino', tag: 'yoshino_(date_a_live)' },
    { key: 'origami', tag: 'tobiichi_origami' }, { key: 'miku date', tag: 'izayoi_miku' },
    // Overlord
    { key: 'albedo', tag: 'albedo_(overlord)' }, { key: 'shalltear', tag: 'shalltear_bloodfallen' },
    // DITF
    { key: 'zero two', tag: 'zero_two_(darling_in_the_franxx)' }, { key: '02', tag: 'zero_two_(darling_in_the_franxx)' },
    { key: 'ichigo ditf', tag: 'ichigo_(darling_in_the_franxx)' },
    // Dragon Maid
    { key: 'tohru', tag: 'tohru_(kobayashi_dragon_maid)' }, { key: 'kanna', tag: 'kanna_kamui' },
    { key: 'lucoa', tag: 'quetzalcoatl_(dragon_maid)' }, { key: 'ilulu', tag: 'ilulu_(dragon_maid)' },
    // Quintuplets
    { key: 'nino', tag: 'nakano_nino' }, { key: 'miku nino', tag: 'nakano_miku' },
    { key: 'ichika', tag: 'nakano_ichika' }, { key: 'yotsuba', tag: 'nakano_yotsuba' },
    { key: 'itsuki', tag: 'nakano_itsuki' },
    // Genshin
    { key: 'lumine', tag: 'lumine_(genshin_impact)' }, { key: 'ganyu', tag: 'ganyu_(genshin_impact)' },
    { key: 'hu tao', tag: 'hu_tao_(genshin_impact)' }, { key: 'hutao', tag: 'hu_tao_(genshin_impact)' },
    { key: 'raiden', tag: 'raiden_shogun' },
    { key: 'raiden shogun', tag: 'raiden_shogun' }, { key: 'yae miko', tag: 'yae_miko' },
    { key: 'kokomi', tag: 'sangonomiya_kokomi' }, { key: 'fischl', tag: 'fischl_(genshin_impact)' },
    { key: 'eula', tag: 'eula_(genshin_impact)' }, { key: 'nahida', tag: 'nahida_(genshin_impact)' },
    { key: 'furina', tag: 'furina_(genshin_impact)' }, { key: 'nilou', tag: 'nilou_(genshin_impact)' },
    { key: 'shenhe', tag: 'shenhe_(genshin_impact)' }, { key: 'yelan', tag: 'yelan_(genshin_impact)' },
    { key: 'keqing', tag: 'keqing_(genshin_impact)' }, { key: 'ningguang', tag: 'ningguang_(genshin_impact)' },
    // Bleach
    { key: 'rukia', tag: 'kuchiki_rukia' }, { key: 'orihime', tag: 'inoue_orihime' },
    { key: 'yoruichi', tag: 'shihouin_yoruichi' }, { key: 'rangiku', tag: 'matsumoto_rangiku' },
    { key: 'nell', tag: 'nelliel_tu_odelschwanck' }, { key: 'unohana', tag: 'unohana_retsu' },
    // Fairy Tail
    { key: 'erza', tag: 'scarlet_erza' }, { key: 'lucy ft', tag: 'heartfilia_lucy' },
    { key: 'mirajane', tag: 'strauss_mirajane' }, { key: 'juvia', tag: 'lockser_juvia' },
    // Chainsaw Man
    { key: 'makima', tag: 'makima_(chainsaw_man)' }, { key: 'power', tag: 'power_(chainsaw_man)' },
    { key: 'reze', tag: 'reze_(chainsaw_man)' }, { key: 'himeno', tag: 'himeno_(chainsaw_man)' },
    { key: 'kobeni', tag: 'kobeni_higashiyama' }, { key: 'asa', tag: 'mitaka_asa' },
    // Lycoris Recoil
    { key: 'chisato', tag: 'nishikigi_chisato' }, { key: 'takina', tag: 'inoue_takina' },
    // Pokemon
    { key: 'misty', tag: 'kasumi_(pokemon)' }, { key: 'dawn', tag: 'hikari_(pokemon)' },
    { key: 'serena', tag: 'serena_(pokemon)' }, { key: 'may', tag: 'haruka_(pokemon)' },
    { key: 'cynthia', tag: 'shirona_(pokemon)' }, { key: 'nessa', tag: 'rurina_(pokemon)' },
    { key: 'marnie', tag: 'maril_(pokemon)' },
    // Vocaloid
    { key: 'miku', tag: 'hatsune_miku' }, { key: 'luka', tag: 'megurine_luka' },
    { key: 'gumi', tag: 'gumi_(vocaloid)' }, { key: 'rin vocaloid', tag: 'kagamine_rin' },
    // Honkai / Star Rail
    { key: 'kiana', tag: 'kiana_kaslana' }, { key: 'bronya', tag: 'bronya_zaychik' },
    { key: 'elysia', tag: 'elysia_(honkai)' }, { key: 'kafka', tag: 'kafka_(star_rail)' },
    { key: 'seele star', tag: 'seele_(star_rail)' },
    // Black Clover
    { key: 'noelle', tag: 'noelle_silva' }, { key: 'mimosa', tag: 'vermillion_mimosa' },
    // Goblin Slayer
    { key: 'priestess', tag: 'priestess_(goblin_slayer)' },
    // DxD
    { key: 'rias', tag: 'rias_gremory' }, { key: 'akeno', tag: 'himejima_akeno' },
    { key: 'koneko', tag: 'toujou_koneko' }, { key: 'xenovia', tag: 'quarta_xenovia' },
    // NGNL
    { key: 'shiro', tag: 'shiro_(no_game_no_life)' }, { key: 'jibril', tag: 'jibril_(no_game_no_life)' },
    // Toradora
    { key: 'taiga', tag: 'aisaka_taiga' },
    // Rent a GF
    { key: 'chizuru', tag: 'mizuhara_chizuru' }, { key: 'ruka', tag: 'sarashina_ruka' },
    // Kaguya
    { key: 'kaguya', tag: 'shinomiya_kaguya' }, { key: 'chika', tag: 'fujiwara_chika' },
    // Madoka
    { key: 'madoka', tag: 'kaname_madoka' }, { key: 'homura', tag: 'akemi_homura' },
    { key: 'mami', tag: 'tomoe_mami' },
    // Evangelion
    { key: 'rei', tag: 'ayanami_rei' }, { key: 'asuka', tag: 'souryuu_asuka_langley' },
    { key: 'mari', tag: 'illustrious_makinami' }, { key: 'misato', tag: 'katsuragi_misato' },
    // Oregairu
    { key: 'yukino', tag: 'yukinoshita_yukino' }, { key: 'yui', tag: 'yuigahama_yui' },
    { key: 'iroha', tag: 'isshiki_iroha' },
    // Sailor Moon
    { key: 'usagi', tag: 'tsukino_usagi' }, { key: 'sailor moon', tag: 'tsukino_usagi' },
    { key: 'rei sailor', tag: 'hino_rei' }, { key: 'chibiusa', tag: 'chibiusa' },
    // Love Live
    { key: 'maki', tag: 'nishikino_maki' }, { key: 'honoka', tag: 'kousaka_honoka' },
    { key: 'nico', tag: 'yazawa_nico' }, { key: 'eli', tag: 'ayase_eli' },
    // Bocchi
    { key: 'bocchi', tag: 'gotou_hitori' }, { key: 'hitori', tag: 'gotou_hitori' },
    { key: 'nijika', tag: 'ijichi_nijika' }, { key: 'ryou', tag: 'yamada_ryou' },
    { key: 'ikuyo', tag: 'kita_ikuyo' },
    // Dungeon Meshi
    { key: 'marcille', tag: 'donato_marcille' }, { key: 'falin', tag: 'touden_falin' },
    // Oshi no Ko
    { key: 'ai', tag: 'hoshino_ai' }, { key: 'ruby', tag: 'hoshino_ruby' },
    { key: 'kana', tag: 'arima_kana' },
    // Tensura
    { key: 'shion', tag: 'shion_(tensura)' }, { key: 'milim', tag: 'nava_milim' },
    { key: 'shuna', tag: 'shuna_(tensura)' },
    // Kakegurui
    { key: 'yumeko', tag: 'jabami_yumeko' }, { key: 'mary', tag: 'saotome_mary' },
    { key: 'kirari', tag: 'momobami_kirari' }, { key: 'midari', tag: 'ikishima_midari' },
    // Mushoku Tensei
    { key: 'roxy', tag: 'migurdia_roxy' },
    { key: 'sylphie', tag: 'sylphiette_(mushoku_tensei)' },
    { key: 'sylphiette', tag: 'sylphiette_(mushoku_tensei)' },
    { key: 'eris mushoku', tag: 'eris_(mushoku_tensei)' },
    // Angel Beats
    { key: 'kanade', tag: 'tachibana_kanade' }, { key: 'angel beats', tag: 'tachibana_kanade' },
    // FMA
    { key: 'winry', tag: 'rockbell_winry' }, { key: 'riza', tag: 'hawkeye_riza' },
    { key: 'olivier', tag: 'armstrong_olivier' },
    // Toaru
    { key: 'misaka', tag: 'misaka_mikoto' }, { key: 'mikoto', tag: 'misaka_mikoto' },
    { key: 'index', tag: 'index_librorum_prohibitorum' }, { key: 'shokuhou', tag: 'shokuhou_misaki' },
    // Danganronpa
    { key: 'kyoko', tag: 'kirigiri_kyouko' }, { key: 'junko', tag: 'enoshima_junko' },
    { key: 'chiaki', tag: 'nanami_chiaki' }, { key: 'sayaka', tag: 'maizono_sayaka' },
    // Extra popular
    { key: 'neco arc', tag: 'neco-arc' }, { key: 'neco-arc', tag: 'neco-arc' },
    { key: 'necoarc', tag: 'neco-arc' }, { key: 'neco arc chaos', tag: 'neco-arc_chaos' },
    { key: 'marin', tag: 'kitagawa_marin' }, { key: 'nagatoro', tag: 'nagatoro_hayase' },
    { key: 'touka', tag: 'kirishima_touka' }, { key: 'bishamon', tag: 'bishamonten_(noragami)' },
    { key: 'raphtalia', tag: 'raphtalia' }, { key: 'filo', tag: 'filo_(tate_no_yuusha)' },
    { key: 'reina', tag: 'reina_(myriad_colors)' }, { key: 'shouko', tag: 'nishimiya_shouko' },
    { key: 'lucy', tag: 'lucy_(cyberpunk_edgerunners)' },
    { key: 'power csm', tag: 'power_(chainsaw_man)' },
    { key: 'komi', tag: 'komi_shouko' },
    { key: 'yashahime', tag: 'moroha_(yashahime)' },
    { key: 'nezuko chan', tag: 'kamado_nezuko' },
    // Más personajes populares
    { key: 'power brs', tag: 'black_rock_shooter' },
    { key: 'holo', tag: 'holo_(spice_and_wolf)' },
    { key: 'spice wolf', tag: 'holo_(spice_and_wolf)' },
    { key: 'remu', tag: 'rem_(re_zero)' },
    { key: 'rezero rem', tag: 'rem_(re_zero)' },
    // Nier Automata
    { key: '2b', tag: 'yorha_no.2_type_b' }, { key: 'yorha 2b', tag: 'yorha_no.2_type_b' },
    { key: 'yorha2b', tag: 'yorha_no.2_type_b' }, { key: 'a2 nier', tag: 'yorha_a2_type_a' },
    // UTAU / Kasane Teto
    { key: 'teto', tag: 'kasane_teto' }, { key: 'kasane teto', tag: 'kasane_teto' },
    { key: 'kasane', tag: 'kasane_teto' }, { key: 'tetoo', tag: 'kasane_teto' },
    // Mushoku Tensei aliases extras
    { key: 'roxy migurdia', tag: 'migurdia_roxy' }, { key: 'roxymigurdia', tag: 'migurdia_roxy' },
    // Sword Art Online alias
    { key: 'asada shino', tag: 'asada_shino' },
    // Más populares
    { key: 'chitoge', tag: 'kirisaki_chitoge' }, { key: 'onodera', tag: 'onodera_kosaki' },
    { key: 'raku', tag: 'kirisaki_chitoge' },
    { key: 'violet evergarden', tag: 'violet_evergarden' }, { key: 'violet', tag: 'violet_evergarden' },
    { key: 'frieren', tag: 'frieren_(sousou_no_frieren)' }, { key: 'fern', tag: 'fern_(sousou_no_frieren)' },
    { key: 'ai hayasaka', tag: 'hayasaka_ai' }, { key: 'hayasaka', tag: 'hayasaka_ai' },
    { key: 'ishtar fate', tag: 'ishtar_(fate)' }, { key: 'ereshkigal', tag: 'ereshkigal_(fate)' },
    { key: 'abigail fate', tag: 'abigail_williams_(fate)' },
    { key: 'himari', tag: 'himari_(blue_archive)' }, { key: 'hoshino blue', tag: 'hoshino_(blue_archive)' },
    { key: 'shizuku', tag: 'shizuku_(blue_archive)' },
    // KonoSuba alias
    { key: 'kazuma', tag: 'satou_kazuma' },
    // Más Re:Zero
    { key: 'frederica', tag: 'baumann_frederica' }, { key: 'petra', tag: 'leyte_petra' },
    // Más MHA
    { key: 'midnight', tag: 'kayama_nemuri' }, { key: 'mt lady', tag: 'mt._lady' },
    // Más One Piece
    { key: 'vivi', tag: 'nefertari_vivi' }, { key: 'nefertari', tag: 'nefertari_vivi' },
    // ── Adiciones populares (extra) ──────────────────────────────────────
    // Genshin extra
    { key: 'mona', tag: 'mona_(genshin_impact)' }, { key: 'amber', tag: 'amber_(genshin_impact)' },
    { key: 'jean', tag: 'jean_(genshin_impact)' }, { key: 'lisa', tag: 'lisa_(genshin_impact)' },
    { key: 'rosaria', tag: 'rosaria_(genshin_impact)' }, { key: 'beidou', tag: 'beidou_(genshin_impact)' },
    { key: 'xiangling', tag: 'xiangling_(genshin_impact)' }, { key: 'kazuha', tag: 'kaedehara_kazuha' },
    { key: 'xiao', tag: 'xiao_(genshin_impact)' }, { key: 'venti', tag: 'venti_(genshin_impact)' },
    { key: 'zhongli', tag: 'zhongli_(genshin_impact)' }, { key: 'ayaka', tag: 'kamisato_ayaka' },
    { key: 'ayato', tag: 'kamisato_ayato' }, { key: 'wanderer', tag: 'wanderer_(genshin_impact)' },
    { key: 'tighnari', tag: 'tighnari_(genshin_impact)' }, { key: 'lyney', tag: 'lyney_(genshin_impact)' },
    { key: 'navia', tag: 'navia_(genshin_impact)' }, { key: 'clorinde', tag: 'clorinde_(genshin_impact)' },
    // Honkai Star Rail extra
    { key: 'march 7th', tag: 'march_7th_(star_rail)' }, { key: 'march7', tag: 'march_7th_(star_rail)' },
    { key: 'silver wolf', tag: 'silver_wolf_(star_rail)' }, { key: 'fu xuan', tag: 'fu_xuan_(star_rail)' },
    { key: 'jingliu', tag: 'jingliu_(star_rail)' }, { key: 'topaz', tag: 'topaz_(star_rail)' },
    { key: 'firefly', tag: 'firefly_(star_rail)' }, { key: 'acheron', tag: 'acheron_(star_rail)' },
    { key: 'black swan', tag: 'black_swan_(star_rail)' }, { key: 'bronya star', tag: 'bronya_(star_rail)' },
    { key: 'tingyun', tag: 'tingyun_(star_rail)' }, { key: 'sparkle', tag: 'sparkle_(star_rail)' },
    // Blue Archive
    { key: 'aru', tag: 'aru_(blue_archive)' }, { key: 'mika', tag: 'mika_(blue_archive)' },
    { key: 'arona', tag: 'arona_(blue_archive)' }, { key: 'hina', tag: 'hina_(blue_archive)' },
    { key: 'iori', tag: 'iori_(blue_archive)' }, { key: 'asuna ba', tag: 'asuna_(blue_archive)' },
    { key: 'shiroko', tag: 'shiroko_(blue_archive)' }, { key: 'yuuka', tag: 'yuuka_(blue_archive)' },
    { key: 'noa', tag: 'noa_(blue_archive)' }, { key: 'koharu', tag: 'koharu_(blue_archive)' },
    { key: 'plana', tag: 'plana_(blue_archive)' },
    // Azur Lane
    { key: 'enterprise', tag: 'enterprise_(azur_lane)' }, { key: 'belfast', tag: 'belfast_(azur_lane)' },
    { key: 'taihou', tag: 'taihou_(azur_lane)' }, { key: 'azuma', tag: 'azuma_(azur_lane)' },
    { key: 'akagi', tag: 'akagi_(azur_lane)' }, { key: 'kaga', tag: 'kaga_(azur_lane)' },
    { key: 'shimakaze', tag: 'shimakaze_(azur_lane)' },
    // Nikke
    { key: 'rapi', tag: 'rapi_(nikke)' }, { key: 'modernia', tag: 'modernia_(nikke)' },
    { key: 'scarlet', tag: 'scarlet_(nikke)' }, { key: 'helm', tag: 'helm_(nikke)' },
    { key: 'dorothy', tag: 'dorothy_(nikke)' }, { key: 'red hood', tag: 'red_hood_(nikke)' },
    // Arknights
    { key: 'amiya', tag: 'amiya_(arknights)' }, { key: 'skadi', tag: 'skadi_(arknights)' },
    { key: 'mostima', tag: 'mostima_(arknights)' }, { key: 'eyjafjalla', tag: 'eyjafjalla_(arknights)' },
    { key: 'angelina', tag: 'angelina_(arknights)' }, { key: 'texas', tag: 'texas_(arknights)' },
    { key: 'lappland', tag: 'lappland_(arknights)' }, { key: 'surtr', tag: 'surtr_(arknights)' },
    { key: 'nian', tag: 'nian_(arknights)' }, { key: 'ch\'en', tag: 'ch\'en_(arknights)' },
    // FGO/Fate extras
    { key: 'jeanne fate', tag: 'jeanne_d\'arc_(fate)' }, { key: 'mash', tag: 'mash_kyrielight' },
    { key: 'shielder', tag: 'mash_kyrielight' }, { key: 'mordred', tag: 'mordred_(fate)' },
    { key: 'jalter', tag: 'jeanne_d\'arc_alter_(fate)' }, { key: 'okita', tag: 'okita_souji_(fate)' },
    { key: 'kama', tag: 'kama_(fate)' }, { key: 'kiara', tag: 'sessyoin_kiara' },
    { key: 'parvati', tag: 'parvati_(fate)' }, { key: 'durga', tag: 'durga_(fate)' },
    // Touhou
    { key: 'reimu', tag: 'hakurei_reimu' }, { key: 'marisa', tag: 'kirisame_marisa' },
    { key: 'sakuya', tag: 'izayoi_sakuya' }, { key: 'remilia', tag: 'remilia_scarlet' },
    { key: 'flandre', tag: 'flandre_scarlet' }, { key: 'patchouli', tag: 'patchouli_knowledge' },
    { key: 'youmu', tag: 'konpaku_youmu' }, { key: 'yuyuko', tag: 'saigyouji_yuyuko' },
    // K-On
    { key: 'mio', tag: 'akiyama_mio' }, { key: 'yui kon', tag: 'hirasawa_yui' },
    { key: 'azusa', tag: 'nakano_azusa' },
    // Idolmaster / Hololive
    { key: 'haruka', tag: 'amami_haruka' }, { key: 'pekora', tag: 'usada_pekora' },
    { key: 'marine', tag: 'houshou_marine' }, { key: 'aqua hololive', tag: 'minato_aqua' },
    { key: 'gura', tag: 'gawr_gura' }, { key: 'calliope', tag: 'mori_calliope' },
    { key: 'kronii', tag: 'ouro_kronii' }, { key: 'fauna', tag: 'ceres_fauna' },
    { key: 'noel', tag: 'shirogane_noel' }, { key: 'rushia', tag: 'uruha_rushia' },
    { key: 'korone', tag: 'inugami_korone' }, { key: 'okayu', tag: 'nekomata_okayu' },
    // Chainsaw Man extras
    { key: 'quanxi', tag: 'quanxi_(chainsaw_man)' }, { key: 'fami', tag: 'fami_(chainsaw_man)' },
    // Helltaker
    { key: 'modeus', tag: 'modeus_(helltaker)' }, { key: 'azazel', tag: 'azazel_(helltaker)' },
    { key: 'cerberus', tag: 'cerberus_(helltaker)' }, { key: 'lucifer', tag: 'lucifer_(helltaker)' },
    // Jujutsu Kaisen extras
    { key: 'gojo', tag: 'gojou_satoru' }, { key: 'sukuna', tag: 'ryoumen_sukuna' },
    // Re:Zero extras
    { key: 'crusch', tag: 'crusch_karsten' }, { key: 'priscilla', tag: 'priscilla_barielle' },
    // Sword Art Online extras
    { key: 'lisbeth', tag: 'shinozaki_rika' }, { key: 'leafa', tag: 'suguha_kirigaya' },
    // Konosuba extras
    { key: 'iris', tag: 'iris_(konosuba)' },
    // Tensura extras
    { key: 'rimuru', tag: 'rimuru_tempest' },
    // Spy x Family extras
    { key: 'fiona', tag: 'fiona_frost' },
    // High School DxD extras
    { key: 'irina', tag: 'shidou_irina' }, { key: 'kuroka', tag: 'kuroka_(dxd)' },
    // Tate no Yuusha extras
    { key: 'sadina', tag: 'sadina_(tate_no_yuusha)' },
    // Eminence in Shadow
    { key: 'alpha', tag: 'alpha_(eminence_in_shadow)' }, { key: 'beta', tag: 'beta_(eminence_in_shadow)' },
    { key: 'delta', tag: 'delta_(eminence_in_shadow)' },
    // Mushoku Tensei extras
    { key: 'eris', tag: 'eris_(mushoku_tensei)' }, { key: 'rudeus', tag: 'rudeus_greyrat' },
    // MiSide
    { key: 'mita', tag: 'mita_(miside)' }, { key: 'mita miside', tag: 'mita_(miside)' },
    { key: 'miside', tag: 'mita_(miside)' }, { key: 'mita chan', tag: 'mita_(miside)' },
    { key: 'chibi mita', tag: 'chibi_mita_(miside)' },
    // Nikke: Goddess of Victory
    { key: 'rapi', tag: 'rapi_(nikke)' }, { key: 'nikke rapi', tag: 'rapi_(nikke)' },
    { key: 'modernia', tag: 'modernia_(nikke)' }, { key: 'nikke modernia', tag: 'modernia_(nikke)' },
    { key: 'scarlet nikke', tag: 'scarlet_(nikke)' }, { key: 'helm', tag: 'helm_(nikke)' },
    { key: 'dorothy nikke', tag: 'dorothy_(nikke)' }, { key: 'red hood', tag: 'red_hood_(nikke)' },
    { key: 'crown', tag: 'crown_(nikke)' }, { key: 'noise', tag: 'noise_(nikke)' },
    { key: 'maiden nikke', tag: 'maiden_(nikke)' }, { key: 'sugar nikke', tag: 'sugar_(nikke)' },
    { key: 'volume nikke', tag: 'volume_(nikke)' }, { key: 'neon', tag: 'neon_(nikke)' },
    { key: 'alice nikke', tag: 'alice_(nikke)' }, { key: 'noir', tag: 'noir_(nikke)' },
    { key: 'blanc', tag: 'blanc_(nikke)' }, { key: 'novel', tag: 'novel_(nikke)' },
    { key: 'snow white nikke', tag: 'snow_white_(nikke)' }, { key: 'biscuit', tag: 'biscuit_(nikke)' },
    // Arknights
    { key: 'amiya', tag: 'amiya_(arknights)' }, { key: 'skadi arknights', tag: 'skadi_(arknights)' },
    { key: 'mostima', tag: 'mostima_(arknights)' }, { key: 'eyjafjalla', tag: 'eyjafjalla_(arknights)' },
    { key: 'angelina', tag: 'angelina_(arknights)' }, { key: 'texas arknights', tag: 'texas_(arknights)' },
    { key: 'lappland', tag: 'lappland_(arknights)' }, { key: 'surtr', tag: 'surtr_(arknights)' },
    { key: 'ch\'en', tag: 'ch\'en_(arknights)' }, { key: 'chen arknights', tag: 'ch\'en_(arknights)' },
    { key: 'exusiai', tag: 'exusiai_(arknights)' }, { key: 'siege', tag: 'siege_(arknights)' },
    { key: 'hoshiguma', tag: 'hoshiguma_(arknights)' }, { key: 'schwarz', tag: 'schwarz_(arknights)' },
    { key: 'ceobe', tag: 'ceobe_(arknights)' }, { key: 'silverash', tag: 'silverash_(arknights)' },
    { key: 'ifrit arknights', tag: 'ifrit_(arknights)' }, { key: 'specter', tag: 'specter_(arknights)' },
    { key: 'saga', tag: 'saga_(arknights)' }, { key: 'w arknights', tag: 'w_(arknights)' },
    { key: 'blaze', tag: 'blaze_(arknights)' }, { key: 'nearl', tag: 'nearl_(arknights)' },
    { key: 'saria', tag: 'saria_(arknights)' }, { key: 'mudrock', tag: 'mudrock_(arknights)' },
    { key: 'eunectes', tag: 'eunectes_(arknights)' }, { key: 'platinum', tag: 'platinum_(arknights)' },
    // Wuthering Waves
    { key: 'jiyan', tag: 'jiyan_(wuthering_waves)' }, { key: 'calcharo', tag: 'calcharo_(wuthering_waves)' },
    { key: 'rover wuwa', tag: 'rover_(wuthering_waves)' }, { key: 'lingyang', tag: 'lingyang_(wuthering_waves)' },
    { key: 'jinhsi', tag: 'jinhsi_(wuthering_waves)' }, { key: 'changli', tag: 'changli_(wuthering_waves)' },
    { key: 'yinlin', tag: 'yinlin_(wuthering_waves)' }, { key: 'carlotta', tag: 'carlotta_(wuthering_waves)' },
    { key: 'shorekeeper', tag: 'shorekeeper_(wuthering_waves)' }, { key: 'camellya', tag: 'camellya_(wuthering_waves)' },
    { key: 'zhezhi', tag: 'zhezhi_(wuthering_waves)' }, { key: 'roccia', tag: 'roccia_(wuthering_waves)' },
    { key: 'encore wuwa', tag: 'encore_(wuthering_waves)' }, { key: 'verina', tag: 'verina_(wuthering_waves)' },
    // Zenless Zone Zero
    { key: 'nicole zzy', tag: 'nicole_demara' }, { key: 'grace howard', tag: 'grace_howard_(zzz)' },
    { key: 'koleda', tag: 'koleda_(zenless_zone_zero)' }, { key: 'nekomata', tag: 'nekomata_(zenless_zone_zero)' },
    { key: 'ellen joe', tag: 'ellen_joe_(zzz)' }, { key: 'ellen zzz', tag: 'ellen_joe_(zzz)' },
    { key: 'zhu yuan', tag: 'zhu_yuan_(zzz)' }, { key: 'qingyi', tag: 'qingyi_(zzz)' },
    { key: 'jane doe', tag: 'jane_doe_(zzz)' }, { key: 'jane zzz', tag: 'jane_doe_(zzz)' },
    { key: 'miyabi', tag: 'miyabi_(zenless_zone_zero)' }, { key: 'astra yao', tag: 'astra_yao_(zzz)' },
    { key: 'evelyn', tag: 'evelyn_chevalier_(zzz)' }, { key: 'harumasa', tag: 'harumasa_(zzz)' },
    // FGO extras
    { key: 'scathach', tag: 'scathach_(fate)' }, { key: 'tamamo', tag: 'tamamo-no-mae_(fate)' },
    { key: 'atalante', tag: 'atalante_(fate)' }, { key: 'florence', tag: 'florence_nightingale_(fate)' },
    { key: 'Morgan fate', tag: 'morgan_le_fay_(fate)' }, { key: 'melusine', tag: 'melusine_(fate)' },
    { key: 'caenis', tag: 'caenis_(fate)' }, { key: 'arash', tag: 'arash_(fate)' },
    // Demon Slayer extras
    { key: 'nezuko', tag: 'kamado_nezuko' }, { key: 'shinobu', tag: 'kocho_shinobu' },
    { key: 'mitsuri', tag: 'kanroji_mitsuri' }, { key: 'kanao', tag: 'tsuyuri_kanao' },
    { key: 'daki', tag: 'daki_(kimetsu_no_yaiba)' }, { key: 'tamayo', tag: 'tamayo_(kimetsu_no_yaiba)' },
    // Bocchi extras
    { key: 'bocchi', tag: 'gotou_hitori' }, { key: 'gotou', tag: 'gotou_hitori' },
    // Frieren extras
    { key: 'frieren', tag: 'frieren_(sousou_no_frieren)' }, { key: 'fern', tag: 'fern_(sousou_no_frieren)' },
    { key: 'sein', tag: 'sein_(sousou_no_frieren)' }, { key: 'stark', tag: 'stark_(sousou_no_frieren)' },
    // Overlord extras
    { key: 'albedo', tag: 'albedo_(overlord)' }, { key: 'shalltear', tag: 'shalltear_bloodfallen' },
    { key: 'narberal', tag: 'narberal_gamma' }, { key: 'aura', tag: 'aura_bella_fiora' },
    { key: 'evileye', tag: 'evileye_(overlord)' }, { key: 'lupusregina', tag: 'lupusregina_beta' },
    // Date a Live extras
    { key: 'shidou', tag: 'shidou_itsuka' }, { key: 'kurumi', tag: 'tokisaki_kurumi' },
    { key: 'tohka', tag: 'yatogami_touka' }, { key: 'yoshino', tag: 'yoshino_(date_a_live)' },
    { key: 'kotori', tag: 'itsuka_kotori' }, { key: 'origami', tag: 'tobiichi_origami' },
    { key: 'miku date', tag: 'izayoi_miku' }, { key: 'natsumi', tag: 'natsumi_(date_a_live)' },
    // Sword Art Online extras
    { key: 'alice sao', tag: 'alice_schuberg' }, { key: 'eugeo', tag: 'eugeo_(sao)' },
    // Naruto extras
    { key: 'hinata', tag: 'hyuuga_hinata' }, { key: 'sakura', tag: 'haruno_sakura' },
    { key: 'tsunade', tag: 'tsunade_(naruto)' }, { key: 'temari', tag: 'temari_(naruto)' },
    { key: 'ino', tag: 'yamanaka_ino' }, { key: 'mei terumi', tag: 'terumi_mei' },
    { key: 'karin', tag: 'uzumaki_karin' }, { key: 'konan', tag: 'konan_(naruto)' },
    // MHA extras
    { key: 'mirko', tag: 'usagiyama_rumi' }, { key: 'nemuri', tag: 'kayama_nemuri' },
    { key: 'nejire', tag: 'hado_nejire' }, { key: 'ibara', tag: 'shiozaki_ibara' },
    { key: 'toga', tag: 'himiko_toga' }, { key: 'camie', tag: 'utsushimi_camie' },
    // Hololive extras
    { key: 'fubuki', tag: 'shirakami_fubuki' }, { key: 'mio', tag: 'ookami_mio' },
    { key: 'subaru holo', tag: 'oozora_subaru' }, { key: 'ayame', tag: 'nakiri_ayame' },
    { key: 'miko holo', tag: 'sakura_miko' }, { key: 'nene holo', tag: 'momosuzu_nene' },
    { key: 'lamy', tag: 'yukihana_lamy' }, { key: 'botan holo', tag: 'shishiro_botan' },
    { key: 'chloe holo', tag: 'laplus_darknesss' }, { key: 'iroha', tag: 'kazama_iroha' },
    { key: 'lui', tag: 'takane_lui' }, { key: 'koyori', tag: 'hakui_koyori' },
    { key: 'ina', tag: 'ninomae_ina\'nis' }, { key: 'sana', tag: 'tsukumo_sana' },
    // Vtubers Nijisanji
    { key: 'elira', tag: 'elira_pendora' }, { key: 'pomu', tag: 'pomu_rainpuff' },
    { key: 'selen', tag: 'selen_tatsuki' }, { key: 'rosemi', tag: 'rosemi_lovelock' },
    { key: 'petra nijisanji', tag: 'petra_gurin' }, { key: 'finana', tag: 'finana_ryugu' },
    // ── JoJo's Bizarre Adventure ──────────────────────────────────────────
    { key: 'giorno', tag: 'giorno_giovanna' }, { key: 'giorno giovanna', tag: 'giorno_giovanna' },
    { key: 'dio', tag: 'dio_brando' }, { key: 'dio brando', tag: 'dio_brando' },
    { key: 'jotaro', tag: 'jotaro_kujo' }, { key: 'jotaro kujo', tag: 'jotaro_kujo' },
    { key: 'jolyne', tag: 'cujoh_jolyne' }, { key: 'jolyne cujoh', tag: 'cujoh_jolyne' },
    { key: 'trish una', tag: 'trish_una' }, { key: 'trish', tag: 'trish_una' },
    { key: 'kira', tag: 'kira_yoshikage' }, { key: 'yoshikage kira', tag: 'kira_yoshikage' },
    { key: 'gyro', tag: 'gyro_zeppeli' }, { key: 'gyro zeppeli', tag: 'gyro_zeppeli' },
    { key: 'yasuho', tag: 'hirose_yasuho' }, { key: 'hirose yasuho', tag: 'hirose_yasuho' },
    { key: 'yukako', tag: 'yamagishi_yukako' }, { key: 'lisa lisa jojo', tag: 'lisa_lisa_(jojo)' },
    // ── Death Note ────────────────────────────────────────────────────────
    { key: 'light yagami', tag: 'yagami_light' }, { key: 'light', tag: 'yagami_light' },
    { key: 'yagami', tag: 'yagami_light' }, { key: 'kira death note', tag: 'yagami_light' },
    { key: 'l death note', tag: 'l_(death_note)' }, { key: 'lawliet', tag: 'l_(death_note)' },
    { key: 'misa amane', tag: 'amane_misa' }, { key: 'misa', tag: 'amane_misa' },
    { key: 'amane misa', tag: 'amane_misa' }, { key: 'near death note', tag: 'near_(death_note)' },
    { key: 'ryuk', tag: 'ryuk_(death_note)' }, { key: 'mello', tag: 'mello_(death_note)' },
    { key: 'rem death note', tag: 'rem_(death_note)' },
    // ── Inuyasha ──────────────────────────────────────────────────────────
    { key: 'kagome', tag: 'higurashi_kagome' }, { key: 'kagome higurashi', tag: 'higurashi_kagome' },
    { key: 'inuyasha', tag: 'inuyasha_(character)' },
    { key: 'sango', tag: 'sango_(inuyasha)' }, { key: 'miroku', tag: 'miroku_(inuyasha)' },
    { key: 'sesshomaru', tag: 'sesshoumaru' }, { key: 'sesshoumaru', tag: 'sesshoumaru' },
    { key: 'kikyo', tag: 'kikyou_(inuyasha)' }, { key: 'kikyou', tag: 'kikyou_(inuyasha)' },
    { key: 'kagura inuyasha', tag: 'kagura_(inuyasha)' },
    // ── Black Butler ──────────────────────────────────────────────────────
    { key: 'sebastian', tag: 'sebastian_michaelis' }, { key: 'sebastian michaelis', tag: 'sebastian_michaelis' },
    { key: 'ciel', tag: 'phantomhive_ciel' }, { key: 'ciel phantomhive', tag: 'phantomhive_ciel' },
    { key: 'grell', tag: 'sutcliff_grell' }, { key: 'grell sutcliff', tag: 'sutcliff_grell' },
    { key: 'elizabeth midford', tag: 'midford_elizabeth' }, { key: 'lizzy midford', tag: 'midford_elizabeth' },
    { key: 'mey rin', tag: 'mei_rin_(black_butler)' }, { key: 'mey-rin', tag: 'mei_rin_(black_butler)' },
    // ── Food Wars / Shokugeki no Soma ─────────────────────────────────────
    { key: 'soma', tag: 'yukihira_souma' }, { key: 'soma yukihira', tag: 'yukihira_souma' },
    { key: 'yukihira', tag: 'yukihira_souma' }, { key: 'food wars', tag: 'nakiri_erina' },
    { key: 'erina nakiri', tag: 'nakiri_erina' }, { key: 'erina', tag: 'nakiri_erina' },
    { key: 'megumi tadokoro', tag: 'tadokoro_megumi' }, { key: 'megumi food', tag: 'tadokoro_megumi' },
    { key: 'alice nakiri', tag: 'nakiri_alice' }, { key: 'ikumi', tag: 'mito_ikumi' },
    { key: 'nikumi', tag: 'mito_ikumi' }, { key: 'mito ikumi', tag: 'mito_ikumi' },
    // ── Made in Abyss ─────────────────────────────────────────────────────
    { key: 'riko abyss', tag: 'riko_(made_in_abyss)' }, { key: 'riko made in abyss', tag: 'riko_(made_in_abyss)' },
    { key: 'nanachi', tag: 'nanachi_(made_in_abyss)' }, { key: 'prushka', tag: 'prushka_(made_in_abyss)' },
    { key: 'bondrewd', tag: 'bondrewd' }, { key: 'reg abyss', tag: 'reg_(made_in_abyss)' },
    // ── Cowboy Bebop ──────────────────────────────────────────────────────
    { key: 'spike', tag: 'spike_spiegel' }, { key: 'spike spiegel', tag: 'spike_spiegel' },
    { key: 'faye', tag: 'faye_valentine' }, { key: 'faye valentine', tag: 'faye_valentine' },
    { key: 'ed bebop', tag: 'edward_(cowboy_bebop)' }, { key: 'cowboy bebop', tag: 'faye_valentine' },
    // ── Berserk ───────────────────────────────────────────────────────────
    { key: 'guts', tag: 'guts_(berserk)' }, { key: 'guts berserk', tag: 'guts_(berserk)' },
    { key: 'griffith', tag: 'griffith_(berserk)' }, { key: 'casca', tag: 'casca_(berserk)' },
    { key: 'schierke', tag: 'schierke_(berserk)' }, { key: 'farnese', tag: 'farnese_de_vandimion' },
    // ── Spice and Wolf ────────────────────────────────────────────────────
    { key: 'holo', tag: 'holo_(spice_and_wolf)' }, { key: 'holo spice', tag: 'holo_(spice_and_wolf)' },
    { key: 'lawrence', tag: 'kraft_lawrence' }, { key: 'kraft lawrence', tag: 'kraft_lawrence' },
    // ── Trigun ────────────────────────────────────────────────────────────
    { key: 'vash', tag: 'vash_the_stampede' }, { key: 'vash trigun', tag: 'vash_the_stampede' },
    { key: 'meryl', tag: 'meryl_strife' }, { key: 'wolfwood', tag: 'wolfwood_(trigun)' },
    // ── Steins;Gate ───────────────────────────────────────────────────────
    { key: 'kurisu', tag: 'makise_kurisu' }, { key: 'makise kurisu', tag: 'makise_kurisu' },
    { key: 'christina', tag: 'makise_kurisu' }, { key: 'mayuri', tag: 'shiina_mayuri' },
    { key: 'okabe', tag: 'okabe_rintarou' }, { key: 'hououin', tag: 'okabe_rintarou' },
    { key: 'suzuha', tag: 'amane_suzuha' }, { key: 'moeka', tag: 'kiryu_moeka' },
    { key: 'steins gate', tag: 'makise_kurisu' },
    // ── Gurren Lagann ─────────────────────────────────────────────────────
    { key: 'yoko', tag: 'littner_yoko' }, { key: 'yoko littner', tag: 'littner_yoko' },
    { key: 'nia', tag: 'teppelin_nia' }, { key: 'nia teppelin', tag: 'teppelin_nia' },
    { key: 'simon gurren', tag: 'simon_(gurren_lagann)' }, { key: 'kamina', tag: 'kamina_(gurren_lagann)' },
    // ── K-On! ─────────────────────────────────────────────────────────────
    { key: 'yui hirasawa', tag: 'hirasawa_yui' }, { key: 'yui kon', tag: 'hirasawa_yui' },
    { key: 'mio akiyama', tag: 'akiyama_mio' }, { key: 'ritsu', tag: 'tainaka_ritsu' },
    { key: 'tsumugi', tag: 'kotobuki_tsumugi' }, { key: 'mugi', tag: 'kotobuki_tsumugi' },
    { key: 'azusa kon', tag: 'nakano_azusa' }, { key: 'azunyan', tag: 'nakano_azusa' },
    // ── Elfen Lied ────────────────────────────────────────────────────────
    { key: 'lucy elfen', tag: 'lucy_(elfen_lied)' }, { key: 'nyu', tag: 'lucy_(elfen_lied)' },
    { key: 'nana elfen', tag: 'nana_(elfen_lied)' }, { key: 'elfen lied', tag: 'lucy_(elfen_lied)' },
    // ── Berserk aliases ───────────────────────────────────────────────────
    { key: 'femto', tag: 'griffith_(berserk)' },
    // ── Accel World ───────────────────────────────────────────────────────
    { key: 'kuroyukihime', tag: 'kuroyukihime_(accel_world)' }, { key: 'black lotus', tag: 'kuroyukihime_(accel_world)' },
    // ── Violet Evergarden (extra aliases) ────────────────────────────────
    { key: 'gilbert', tag: 'bougainvillea_gilbert' }, { key: 'cattleya', tag: 'baudelaire_cattleya' },
    // ── SAO extra ─────────────────────────────────────────────────────────
    { key: 'quinella', tag: 'quinella_(sao)' }, { key: 'administrator sao', tag: 'quinella_(sao)' },
    { key: 'alice zuberg', tag: 'alice_zuberg' },
    // Generales
    { key: 'waifu', tag: '1girl' }, { key: 'girl', tag: '1girl' },
    { key: 'anime girl', tag: '1girl' }, { key: 'kawaii', tag: '1girl+kawaii' },
    { key: 'loli', tag: '1girl+chibi' }, { key: 'kemonomimi', tag: 'kemonomimi_mode' },
    { key: 'neko', tag: 'cat_girl' }, { key: 'nekogirl', tag: 'cat_girl' },
    { key: 'elf', tag: 'elf_(fantasy)' }, { key: 'maid', tag: 'maid' },
    { key: 'nurse', tag: 'nurse' }, { key: 'school', tag: 'school_uniform' },
    { key: 'bunny', tag: 'bunny_girl' }, { key: 'bunnygirl', tag: 'bunny_girl' },
    { key: 'fox girl', tag: 'fox_girl' }, { key: 'kitsune', tag: 'fox_girl' },
    { key: 'angel', tag: 'angel_girl' }, { key: 'demon', tag: 'demon_girl' },
    { key: 'femboy', tag: 'femboy' }, { key: 'trap', tag: 'trap' },
    { key: 'futa', tag: 'futanari' }, { key: 'tomboy', tag: 'tomboy' },
    { key: 'thicc', tag: 'thick_thighs' }, { key: 'milf', tag: 'milf' },
    { key: 'bikini', tag: 'bikini+1girl' }, { key: 'swimsuit', tag: 'swimsuit+1girl' },
    { key: 'lingerie', tag: 'lingerie+1girl' }, { key: 'gym', tag: 'gym_uniform+1girl' },
    { key: 'kimono', tag: 'kimono+1girl' }, { key: 'witch', tag: 'witch+1girl' },
    { key: 'office', tag: 'office_lady' }, { key: 'goth', tag: 'goth+1girl' },
];

// ── Distancia de Levenshtein para fuzzy matching ───────────────────────────
function levenshtein(a, b) {
    const m = a.length, n = b.length;
    const dp = Array.from({ length: m + 1 }, (_, i) => Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)));
    for (let i = 1; i <= m; i++) {
        for (let j = 1; j <= n; j++) {
            dp[i][j] = a[i - 1] === b[j - 1]
                ? dp[i - 1][j - 1]
                : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
        }
    }
    return dp[m][n];
}

function normalizar(s) {
    return s.toLowerCase().trim()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9\s]/g, '')
        .replace(/\s+/g, ' ');
}

function encontrarWaifu(input) {
    if (!input) return null;
    const q = normalizar(input);
    const qSinEsp = q.replace(/\s/g, '');
    const qPalabras = q.split(' ').filter(Boolean);

    // 1. Coincidencia exacta (normalizada)
    const exacta = waifuDB.find(w => normalizar(w.key) === q);
    if (exacta) return exacta;

    // 2. Sin espacios
    const sinEsp = waifuDB.find(w => normalizar(w.key).replace(/\s/g, '') === qSinEsp);
    if (sinEsp) return sinEsp;

    // 2b. Orden invertido de palabras (nombres japoneses: "amane misa" → "misa amane")
    if (qPalabras.length >= 2) {
        const qInv = [...qPalabras].reverse().join(' ');
        const invertido = waifuDB.find(w => normalizar(w.key) === qInv);
        if (invertido) return invertido;
        const invertidoSinEsp = waifuDB.find(w => normalizar(w.key).replace(/\s/g, '') === qInv.replace(/\s/g, ''));
        if (invertidoSinEsp) return invertidoSinEsp;
    }

    // 3. Partial match — menos estricto para queries largas
    const cobertura = q.length >= 8 ? 0.50 : 0.60;
    const parciales = waifuDB.filter(w => {
        const nk = normalizar(w.key);
        if (nk.includes(q)) return true;
        if (q.includes(nk) && nk.length >= Math.ceil(q.length * cobertura)) return true;
        return false;
    });
    if (parciales.length) {
        parciales.sort((a, b) => normalizar(b.key).length - normalizar(a.key).length);
        return parciales[0];
    }

    // 4. Por palabras individuales (mín 3 caracteres) — prioriza más coincidencias
    const palabras = qPalabras.filter(p => p.length >= 3);
    if (palabras.length > 0) {
        const candidatos = waifuDB
            .filter(w => {
                const norm = normalizar(w.key);
                return palabras.some(p => norm.includes(p) || p.includes(norm.replace(/\s/g, '')));
            })
            .sort((a, b) => {
                const na = normalizar(a.key), nb = normalizar(b.key);
                const matchA = palabras.filter(p => na.includes(p)).length;
                const matchB = palabras.filter(p => nb.includes(p)).length;
                if (matchA !== matchB) return matchB - matchA;
                return nb.length - na.length;
            });
        if (candidatos.length) return candidatos[0];
    }

    // 5. Fuzzy matching con Levenshtein (tolerancia según longitud)
    let mejorMatch = null;
    let mejorDist = Infinity;
    for (const w of waifuDB) {
        const norm = normalizar(w.key);
        const tolerancia = Math.max(2, Math.floor(Math.min(q.length, norm.length) * 0.35));
        const dist = levenshtein(q, norm);
        if (dist < mejorDist && dist <= tolerancia) {
            mejorDist = dist;
            mejorMatch = w;
        }
        const distSinEsp = levenshtein(qSinEsp, norm.replace(/\s/g, ''));
        if (distSinEsp < mejorDist && distSinEsp <= tolerancia) {
            mejorDist = distSinEsp;
            mejorMatch = w;
        }
    }
    if (mejorMatch) return mejorMatch;

    return null;
}

// ══════════════════════════════════════════
//  ACCIONES SFW - ANIME
//  Cada acción tiene:
//  - emoji, nekos, mencion[] (con destinatario, usa @dest), solo[] (sin destinatario)
// ══════════════════════════════════════════
const SFW_ACCIONES = {
    abrazar: {
        emoji: '🤗', nekos: 'hug',
        mencion: [
            'abrazó a *@dest* con toda su fuerza',
            'corrió hacia *@dest* y no lo/la soltó',
            'le dio el abrazo más apretado del universo a *@dest*',
            'envolvió a *@dest* en un abrazo de oso 🐻',
            'se colgó del cuello de *@dest* sin pedir permiso',
        ],
        solo: [
            'quiere abrazar a alguien del grupo 🤗',
            'tiene los brazos abiertos esperando un abrazo',
            'anda buscando a quién abrazar desesperadamente',
            'necesita un abrazo urgente, ¿quién se apunta? 🫂',
            'se abrazó a sí mismo/a porque nadie más quiso',
        ],
    },
    hug: {
        emoji: '🤗', nekos: 'hug',
        mencion: [
            'abrazó a *@dest* sin avisar',
            'se lanzó encima de *@dest* a abrazar',
            'aplastó a *@dest* con un abrazo enorme',
            'no quiere soltar a *@dest* del abrazo',
            'le dio un abrazo tan fuerte que *@dest* casi no puede respirar',
        ],
        solo: [
            'anda repartiendo abrazos gratis 🤗',
            'quiere abrazar a alguien del chat',
            'tiene los brazos listos para abrazar',
            'se siente solo/a y quiere un abrazo',
            'busca a alguien cálido con quien abrazarse 🫂',
        ],
    },
    besar: {
        emoji: '💋', nekos: 'kiss',
        mencion: [
            'besó a *@dest* en los labios sin pedir permiso 💋',
            'le robó un beso a *@dest*',
            'se lanzó de cabeza a besar a *@dest*',
            'plantó un beso enorme en la boca de *@dest*',
            'besó a *@dest* apasionadamente 😘',
        ],
        solo: [
            'lanzó un beso al aire esperando que alguien lo atrape 💋',
            'anda repartiendo besos gratis en el chat',
            'quiere besar a alguien del grupo',
            'tiene los labios listos para quien quiera 💋',
            'manda un beso volado a todo el grupo 😘',
        ],
    },
    kiss: {
        emoji: '💋', nekos: 'kiss',
        mencion: [
            'besó a *@dest* de sopetón 💋',
            'le dio un beso que dejó sin palabras a *@dest*',
            'se acercó sigilosamente y besó a *@dest*',
            'le robó los labios a *@dest*',
            'besó a *@dest* como si no hubiera un mañana 💋',
        ],
        solo: [
            'lanzó un beso al vacío 💋',
            'anda buscando unos labios a quien besar',
            'quiere dar un beso a alguien del chat',
            'tiene ganas de besar a alguien urgentemente',
            'manda kisses a todo el que quiera recibirlos 💋',
        ],
    },
    muak: {
        emoji: '💋', nekos: 'kiss',
        mencion: [
            '¡MUAK! le dio un beso sonoro a *@dest* 💋',
            'se lanzó sobre *@dest* y le estampó un besote',
            'le dio el muak más ruidoso del chat a *@dest*',
            'besó a *@dest* haciendo el mayor ruido posible 😘',
            '¡Muak! le robó un beso a *@dest* sin avisar',
        ],
        solo: [
            '¡Muak! manda besos a todo el grupo 💋',
            'reparte muaks sin discriminar a nadie',
            'manda el besito más ruidoso del universo',
            'lanza muaks al aire para quien los atrape 💋',
            '¡MUAK! para todo el que quiera uno 😘',
        ],
    },
    kisscheek: {
        emoji: '😘', nekos: 'kiss',
        mencion: [
            'le dio un beso tímido en la mejilla a *@dest* 😘',
            'se acercó a *@dest* y le plantó un besito en la mejilla',
            'le regaló el besito más dulce en la mejilla a *@dest*',
            'se puso de puntillas para besar la mejilla de *@dest*',
            'le estampó un beso suave en la mejilla a *@dest* 😊',
        ],
        solo: [
            'manda besitos en la mejilla a todo el grupo 😘',
            'anda dando besitos en la mejilla a quien quiera',
            'tiene ganas de dar un besito inocente a alguien',
            'lanza un besito al aire para quien lo necesite 😘',
            'quiere dar un beso en la mejilla a alguien del chat',
        ],
    },
    beso: {
        emoji: '😘', nekos: 'kiss',
        mencion: [
            'le plantó un beso en la mejilla a *@dest* 😘',
            'le regaló un besito suave en la mejilla a *@dest*',
            'se sonrojó y le dio un beso en la mejilla a *@dest*',
            'tímidamente le besó la mejilla a *@dest*',
            'le dejó una marca de labios en la mejilla a *@dest* 💋',
        ],
        solo: [
            'manda besos al aire para quien quiera recibirlos 😘',
            'anda repartiendo besos en la mejilla sin cobrar',
            'quiere dar un besito a alguien del grupo',
            'lanza un beso tímido al chat 😘',
            'tiene ganas de besar a alguien en la mejilla',
        ],
    },
    golpear: {
        emoji: '👋', nekos: 'slap',
        mencion: [
            'golpeó a *@dest* sin piedad 👋',
            'le dio una bofetada épica a *@dest*',
            'abofeteó a *@dest* con toda su alma',
            'le cruzó la cara a *@dest* de un guantazo',
            'le pegó una cachetada que se escuchó en todo el chat a *@dest*',
        ],
        solo: [
            'golpeó al aire con toda su frustración 👋',
            'anda buscando a quién darle una bofetada',
            'practica sus bofetadas contra el viento',
            'tiene la mano lista para quien la quiera sentir 👋',
            'está de mal humor y necesita golpear algo',
        ],
    },
    slap: {
        emoji: '👋', nekos: 'slap',
        mencion: [
            'le metió un slap a *@dest* sin contemplaciones 👋',
            'abofeteó a *@dest* con toda la fuerza',
            'le cruzó la cara a *@dest* de un tortazo',
            'le pegó una bofetada que retumbó en el chat a *@dest*',
            'slapeó a *@dest* sin previo aviso 💥',
        ],
        solo: [
            'slapea el aire porque necesita desahogarse 👋',
            'anda buscando una cara donde estampar una bofetada',
            'golpeó el aire con entusiasmo',
            'practica sus bofetadas en el vacío 👋',
            'tiene las manos calientes y nadie a quien golpear',
        ],
    },
    acariciar: {
        emoji: '🥰', nekos: 'pat',
        mencion: [
            'acarició la cabeza de *@dest* con mucha ternura 🥰',
            'le dio palmaditas suaves en la cabeza a *@dest*',
            'acarició el pelo de *@dest* con cariño',
            'le hizo mimos en la cabeza a *@dest*',
            'consintió a *@dest* con unas caricias muy tiernas 🥰',
        ],
        solo: [
            'quiere acariciar a alguien del grupo 🥰',
            'anda buscando a quién darle palmaditas en la cabeza',
            'tiene ganas de consentir a alguien con mimos',
            'acarició el aire porque no hay nadie cerca',
            'reparte caricias gratis para quien las necesite 🥰',
        ],
    },
    pat: {
        emoji: '🥰', nekos: 'pat',
        mencion: [
            'le dio un pat cariñoso a *@dest* 🥰',
            'pateo a *@dest* en la cabeza con mucho amor',
            'le regaló el pat más tierno a *@dest*',
            'acarició suavemente la cabeza de *@dest*',
            'mimó a *@dest* con pats interminables 🥰',
        ],
        solo: [
            'anda dando pats gratis a quien los quiera 🥰',
            'quiere patear a alguien en la cabeza con cariño',
            'tiene ganas de hacer mimos a alguien del chat',
            'reparte pats de calidad sin cobrar',
            'se hizo pats a sí mismo/a porque nadie más apareció 🥰',
        ],
    },
    bailar: {
        emoji: '💃', nekos: 'dance',
        mencion: [
            'bailó con *@dest* sin parar 💃',
            'invitó a *@dest* a la pista de baile',
            'sacó a *@dest* a bailar de la nada',
            'se puso a bailar con *@dest* sin ningún motivo',
            'no quiso dejar de bailar con *@dest* en toda la noche 💃',
        ],
        solo: [
            'bailó solo/a como si nadie mirara 💃',
            'se puso a bailar en pleno chat sin avisar',
            'empezó a moverse al ritmo sin música',
            'bailó sin parar aunque estuviera solo/a 💃',
            'se marcó unos pasos de baile épicos en solitario',
        ],
    },
    dance: {
        emoji: '💃', nekos: 'dance',
        mencion: [
            'hizo bailar a *@dest* sin que pudiera negarse 💃',
            'arrancó a bailar junto a *@dest*',
            'tomó de la mano a *@dest* y lo/la llevó a bailar',
            'se puso a bailar pegado/a a *@dest*',
            'convirtió a *@dest* en su pareja de baile 🕺',
        ],
        solo: [
            'se soltó a bailar en el chat 💃',
            'está bailando sin música y sin vergüenza',
            'baila como si nadie lo/la estuviera viendo',
            'se marcó un solo de baile épico 💃',
            'puso su canción favorita en la cabeza y se puso a bailar',
        ],
    },
    llorar: {
        emoji: '😢', nekos: 'cry',
        mencion: [
            'lloró en el hombro de *@dest* 😢',
            'usó a *@dest* de pañuelo humano',
            'se puso a llorar delante de *@dest* sin pudor',
            'buscó el consuelo de *@dest* entre lágrimas',
            'empapó la camisa de *@dest* de tanto llorar 😭',
        ],
        solo: [
            'llora desconsolado/a en el chat 😢',
            'se puso a llorar sin ningún motivo aparente',
            'está en un rincón llorando a moco tendido',
            'llora hasta que alguien le haga caso 😭',
            'anda llorando por el chat, alguien que lo/la consuele',
        ],
    },
    cry: {
        emoji: '😢', nekos: 'cry',
        mencion: [
            'llora mientras abraza a *@dest* 😢',
            'dejó a *@dest* con la camisa mojada de lágrimas',
            'corrió hacia *@dest* llorando sin control',
            'se puso a llorar mirando a *@dest*',
            'no puede parar de llorar junto a *@dest* 😭',
        ],
        solo: [
            'está llorando en el chat y no se sabe por qué 😢',
            'llora en silencio en un rincón',
            'se le cayó el lagrimón más grande del chat',
            'llora hasta que alguien le dé un abrazo 😭',
            'está soltando el llanto sin control',
        ],
    },
    morder: {
        emoji: '😬', nekos: 'bite',
        mencion: [
            'mordió a *@dest* sin previo aviso 😬',
            'le clavó los dientes a *@dest* de repente',
            'mordió el hombro de *@dest* con ganas',
            'decidió morder a *@dest* porque sí',
            'dejó marca de mordida en *@dest* 🦷',
        ],
        solo: [
            'muerde el aire porque tiene ganas de morder a alguien 😬',
            'anda buscando a quién hincarle el diente',
            'tiene ganas de morder a alguien del grupo',
            'muerde cosas al azar por el chat 🦷',
            'está en modo vampiro y busca su próxima víctima 😬',
        ],
    },
    bite: {
        emoji: '😬', nekos: 'bite',
        mencion: [
            'biteó a *@dest* sin contemplaciones 😬',
            'le clavó los dientes en el cuello a *@dest*',
            'mordió a *@dest* con toda su fuerza',
            'atacó el brazo de *@dest* con los dientes',
            'le pegó un mordisco enorme a *@dest* 🦷',
        ],
        solo: [
            'está mordiendo el aire desesperadamente 😬',
            'anda en modo fiera buscando a quién morder',
            'quiere hincarle el diente a alguien del chat',
            'muerde lo que encuentra porque está aburrido/a 😬',
            'busca una víctima para morderla sin piedad',
        ],
    },
    sonrojar: {
        emoji: '😳', nekos: 'blush',
        mencion: [
            'se sonrojó por culpa de *@dest* 😳',
            'se puso rojo/a como un tomate mirando a *@dest*',
            'casi le explota la cara de vergüenza por *@dest*',
            'no puede evitar sonrojarse ante *@dest*',
            'se quedó colorado/a por algo que dijo *@dest* 😳',
        ],
        solo: [
            'se sonrojó sin motivo aparente 😳',
            'se puso colorado/a de la nada',
            'está todo/a sonrojado/a y no quiere decir por qué',
            'se pone rojo/a con solo leer el chat 😳',
            'le subieron los colores sin razón 😊',
        ],
    },
    blush: {
        emoji: '😳', nekos: 'blush',
        mencion: [
            'blushea sin control por culpa de *@dest* 😳',
            'se puso rojo/a de cabeza a pies mirando a *@dest*',
            'casi se desmaya del blushing que le provocó *@dest*',
            'se esconde la cara por lo que le hizo *@dest*',
            'no puede mirar a *@dest* a los ojos de tanta vergüenza 😳',
        ],
        solo: [
            'está blushando en el chat sin razón aparente 😳',
            'se puso colorad@ de repente',
            'anda todo/a rojo/a y dice que no es nada',
            'blushea solo de existir 😊',
            'tiene las mejillas rojas y no quiere explicar por qué 😳',
        ],
    },
    acurrucar: {
        emoji: '🫂', nekos: 'cuddle',
        mencion: [
            'se acurrucó con *@dest* bajo una manta cálida 🫂',
            'se pegó a *@dest* como un koala',
            'se acurrucó contra *@dest* buscando calor',
            'no quiere soltarse de *@dest* en ningún momento',
            'se hizo bolita al lado de *@dest* muy contento/a 🫂',
        ],
        solo: [
            'se acurrucó solo/a en un rincón del chat 🫂',
            'busca a alguien con quien acurrucarse urgentemente',
            'quiere acurrucarse con alguien del grupo',
            'anda buscando calor humano desesperadamente 🫂',
            'se hizo una bolita y espera a que alguien lo/la acompañe',
        ],
    },
    cuddle: {
        emoji: '🫂', nekos: 'cuddle',
        mencion: [
            'cuddleó a *@dest* sin soltarle 🫂',
            'se apretujó contra *@dest* buscando mimos',
            'se enroscó alrededor de *@dest* como un gatito',
            'se acurrucó en los brazos de *@dest* felizmente',
            'no hay manera de separar a *@dest* de sus brazos 🫂',
        ],
        solo: [
            'quiere cuddlear con alguien del grupo 🫂',
            'anda buscando a alguien con quien hacerse bolita',
            'se acurrucó solo/a esperando compañía',
            'necesita cuddlear con urgencia, ¿quién se apunta? 🫂',
            'se abrazó a una almohada imaginaria en el chat',
        ],
    },
    picar: {
        emoji: '👉', nekos: 'poke',
        mencion: [
            'picó a *@dest* con el dedo repetidamente 👉',
            'le metió el dedo en la costilla a *@dest*',
            'no dejó de picar a *@dest* hasta que reaccionó',
            'tocó a *@dest* para llamar su atención',
            'poke poke poke a *@dest* sin parar 👉',
        ],
        solo: [
            'pica al aire porque no hay nadie a quien molestar 👉',
            'anda picando a quien se le acerque',
            'quiere picar a alguien del grupo',
            'tiene el dedo listo para picar a cualquiera 👉',
            'anda con el modo poke activado en el chat',
        ],
    },
    poke: {
        emoji: '👉', nekos: 'poke',
        mencion: [
            'pokeó a *@dest* sin descanso 👉',
            'no para de tocarle el hombro a *@dest*',
            'poke poke a *@dest* hasta que haga caso',
            'le clavó el dedo a *@dest* para llamarle la atención',
            'molestó a *@dest* a pura fuerza de pokes 👉',
        ],
        solo: [
            'pokea el aire buscando a quién molestar 👉',
            'anda en modo poke y nadie está a salvo',
            'quiere pokear a alguien del chat',
            'tiene el dedo ansioso y nadie cerca a quien picar 👉',
            'poke poke al vacío porque se aburre',
        ],
    },
    punetazo: {
        emoji: '👊', nekos: 'punch',
        mencion: [
            'le pegó un puñetazo a *@dest* 👊',
            'le mandó un derechazo a *@dest* sin avisar',
            'le dio un puñete a *@dest* con toda su fuerza',
            'golpeó a *@dest* en la cara sin dudarlo',
            'le plantó el puño en la cara a *@dest* 💥',
        ],
        solo: [
            'lanzó un puñetazo al aire con rabia 👊',
            'anda buscando a quién meter un puñete',
            'practica sus golpes en el viento',
            'tiene el puño listo para quien se acerque 👊',
            'golpeó el aire hasta cansarse',
        ],
    },
    punch: {
        emoji: '👊', nekos: 'punch',
        mencion: [
            'punched a *@dest* directo en el estómago 👊',
            'le dio un uppercut a *@dest*',
            'le metió un combo entero a *@dest*',
            'golpeó a *@dest* con un derechazo limpio',
            'noqueó a *@dest* de un solo puñetazo 💥',
        ],
        solo: [
            'practica sus puñetazos en el vacío 👊',
            'anda repartiendo puñetes al aire',
            'lanza golpes al viento por no tener a quién pegarle',
            'tiene los puños calientes y nadie enfrente 👊',
            'golpea el aire hasta que le duela el brazo',
        ],
    },
    reir: {
        emoji: '😂', nekos: 'laugh',
        mencion: [
            'se ríe a carcajadas de *@dest* 😂',
            'no puede parar de reírse mirando a *@dest*',
            'se parte el estómago de risa por culpa de *@dest*',
            'se muere de risa por lo que hizo *@dest*',
            'llora de risa por culpa de *@dest* 😂',
        ],
        solo: [
            'se ríe solo/a sin motivo aparente 😂',
            'está muerto/a de risa en el chat',
            'no puede parar de reírse de nada',
            'se parte de risa por algo que solo él/ella entiende 😂',
            'llora de risa y nadie sabe por qué',
        ],
    },
    laugh: {
        emoji: '😂', nekos: 'laugh',
        mencion: [
            'se carcajea sin parar de *@dest* 😂',
            'se muere de risa mirando a *@dest*',
            'no puede aguantar la risa con *@dest* cerca',
            'se ríe tanto de *@dest* que le duele la barriga',
            'llora de la risa por lo que hizo *@dest* 😂',
        ],
        solo: [
            'se carcajea solo/a en el chat 😂',
            'está en modo risa y no puede parar',
            'ríe sin control y sin explicación',
            'se está riendo a mandíbula batiente 😂',
            'le dio el ataque de risa y nadie lo/la entiende',
        ],
    },
    correr: {
        emoji: '🏃', nekos: 'run',
        mencion: [
            'salió corriendo junto a *@dest* 🏃',
            'echó a correr al lado de *@dest* sin parar',
            'se fue con *@dest* a toda velocidad',
            'corrió tan rápido con *@dest* que desaparecieron',
            'arrancó a correr con *@dest* sin mirar atrás 🏃',
        ],
        solo: [
            'salió corriendo del chat sin decir nada 🏃',
            'escapó a toda velocidad sin motivo',
            'se fue corriendo y no dijo a dónde',
            'salió disparado/a como si lo/la persiguieran 🏃',
            'huyó del chat a toda prisa',
        ],
    },
    run: {
        emoji: '🏃', nekos: 'run',
        mencion: [
            'corrió con *@dest* sin parar 🏃',
            'se puso a correr junto a *@dest*',
            'salió disparado/a con *@dest* a toda velocidad',
            'no pudo seguir el ritmo de *@dest* corriendo',
            'escapó junto a *@dest* como si fuera la última vez 🏃',
        ],
        solo: [
            'salió corriendo del chat a toda pastilla 🏃',
            'se fue corriendo sin despedirse de nadie',
            'está corriendo por el chat y no se sabe por qué',
            'huyó del grupo a toda velocidad 🏃',
            'arrancó a correr y no piensa volver pronto',
        ],
    },
    triste: {
        emoji: '😔', nekos: 'sad',
        mencion: [
            'está muy triste por *@dest* 😔',
            'llora en silencio pensando en *@dest*',
            'se puso deprimido/a por culpa de *@dest*',
            'anda con el ánimo por los suelos por *@dest*',
            'no puede dejar de pensar triste en *@dest* 😢',
        ],
        solo: [
            'está triste y no quiere hablar con nadie 😔',
            'anda con el ánimo por los suelos hoy',
            'se siente solo/a y muy triste',
            'está de bajón total en el chat 😢',
            'tristeza modo activado, alguien que lo/la anime',
        ],
    },
    sad: {
        emoji: '😔', nekos: 'sad',
        mencion: [
            'está sad por culpa de *@dest* 😔',
            'se pone muy triste mirando a *@dest*',
            'derrama una lagrimita pensando en *@dest*',
            'anda deprimido/a por *@dest*',
            'siente un vacío enorme desde que *@dest* hizo eso 😢',
        ],
        solo: [
            'está sad y no sabe bien por qué 😔',
            'el mood de hoy es: tristeza profunda',
            'anda con cara de perrito abandonado/a',
            'necesita que alguien lo/la anime 😢',
            'está en modo sad y no hay quien lo/la saque',
        ],
    },
    enojado: {
        emoji: '😠', nekos: 'baka',
        mencion: [
            'está muy enojado/a con *@dest* 😠',
            'le gritó BAKA a *@dest* sin contemplaciones',
            'está furioso/a con *@dest* y no lo/la perdona',
            'le puso mala cara a *@dest*',
            'tiene muchas ganas de regañar a *@dest* 😠',
        ],
        solo: [
            'está enojado/a sin motivo aparente 😠',
            'anda furioso/a con el mundo entero',
            'tiene cara de pocos amigos hoy',
            'está de mal humor y es mejor no acercarse 😠',
            'modo enojado activado, nadie le hable',
        ],
    },
    angry: {
        emoji: '😠', nekos: 'baka',
        mencion: [
            'está muy angry con *@dest* 😠',
            'le mandó un BAKA épico a *@dest*',
            'está a punto de explotar de rabia con *@dest*',
            'fulminó a *@dest* con la mirada',
            'regañó a *@dest* sin dejar que respondiera 😠',
        ],
        solo: [
            'está angry y no quiere hablar con nadie 😠',
            'anda furioso/a por el chat, mejor apartarse',
            'tiene el modo angry activado al 100%',
            'está echando fuego por las orejas 😠',
            'angry mode ON, nadie se le acerque',
        ],
    },
    saludar: {
        emoji: '👋', nekos: 'wave',
        mencion: [
            'saludó a *@dest* agitando la mano con entusiasmo 👋',
            'le hizo señas a *@dest* desde lejos',
            'mandó un gran saludo a *@dest*',
            'no paró de agitar la mano hacia *@dest*',
            'le gritó el saludo más efusivo a *@dest* 👋',
        ],
        solo: [
            'saludó a todo el grupo con entusiasmo 👋',
            'manda un saludo gigante a todo el chat',
            'agita la mano para que todos lo/la vean',
            'dice hola a quien quiera responder 👋',
            '¡Hola a todos! — gritó alegremente al chat',
        ],
    },
    wave: {
        emoji: '👋', nekos: 'wave',
        mencion: [
            'le hizo un wave enorme a *@dest* 👋',
            'saludó a *@dest* agitando el brazo desde lejos',
            'mandó un saludo cómplice a *@dest*',
            'no dejó de saludar a *@dest* hasta que respondió',
            'le hizo señas imposibles de ignorar a *@dest* 👋',
        ],
        solo: [
            'hace wave al chat entero 👋',
            'saluda al vacío porque nadie le presta atención',
            'agita la mano con mucho entusiasmo',
            'manda un wave a quien quiera recibirlo 👋',
            'saluda a todo el mundo aunque nadie responda',
        ],
    },
    greet: {
        emoji: '👋', nekos: 'wave',
        mencion: [
            'saludó formalmente a *@dest* con una reverencia 👋',
            'le dio la bienvenida a *@dest* al chat',
            'saludó a *@dest* con una gran sonrisa',
            'no dejó de saludar a *@dest* en todo el rato',
            'recibió a *@dest* con los brazos abiertos 👋',
        ],
        solo: [
            'saludó al grupo con mucha educación 👋',
            'da los buenos días/tardes/noches al chat',
            'saluda a todos los presentes del grupo',
            'llegó al chat y saludó a todos 👋',
            '¡Buenas a tod@s! — anunció al entrar al grupo',
        ],
    },
    hi: {
        emoji: '👋', nekos: 'wave',
        mencion: [
            '¡HI! le gritó a *@dest* en pleno chat 👋',
            'saludó a *@dest* con un hi muy animado',
            'entró al chat solo para saludar a *@dest*',
            'mandó un hola enorme a *@dest*',
            'no pudo resistirse a saludar a *@dest* 👋',
        ],
        solo: [
            '¡Hi! — saludó al chat sin más 👋',
            'entró solo para decir hi a todo el mundo',
            'manda un hi gigante a quien lo lea',
            'saluda al chat con toda la energía del mundo 👋',
            'hi hi hi a todo el grupo sin excepción',
        ],
    },
    aburrido: {
        emoji: '😴', nekos: 'bored',
        mencion: [
            'se aburre muchísimo con *@dest* 😴',
            'bostezó en la cara de *@dest* sin vergüenza',
            'se quedó dormido/a escuchando a *@dest*',
            'definitivamente se muere de aburrimiento con *@dest*',
            'no puede aguantar más el aburrimiento de *@dest* 😴',
        ],
        solo: [
            'está aburrido/a y no sabe qué hacer con su vida 😴',
            'bosteza sin parar en el chat',
            'anda sin tener qué hacer y se muere del aburrimiento',
            'se muere de tedio en el chat 😴',
            'el aburrimiento lo/la tiene en modo zombie',
        ],
    },
    bored: {
        emoji: '😴', nekos: 'bored',
        mencion: [
            'está súper bored gracias a *@dest* 😴',
            'se quedó dormido/a de aburrimiento con *@dest*',
            'bostezó monumentalmente en la cara de *@dest*',
            'perdió el hilo de la conversación de *@dest* hace rato',
            'ni *@dest* lo/la salva de este aburrimiento 😴',
        ],
        solo: [
            'modo bored activado al máximo 😴',
            'está tan aburrido/a que habla solo/a',
            'el aburrimiento es tan grande que se podría tocar',
            'está contando las baldosas del chat de puro aburrimiento 😴',
            'nada ni nadie lo/la divierte en el chat',
        ],
    },
    bofetada: {
        emoji: '🤦', nekos: 'facepalm',
        mencion: [
            'se hizo un facepalm épico por culpa de *@dest* 🤦',
            'no puede creer lo que acaba de hacer *@dest*',
            'se cubre la cara de vergüenza ajena por *@dest*',
            'perdió toda la fe en la humanidad por culpa de *@dest*',
            'se puso la mano en la frente mirando a *@dest* 🤦',
        ],
        solo: [
            'se hace un facepalm monumental 🤦',
            'no puede creer lo que está leyendo en el chat',
            'la vergüenza ajena le golpea con fuerza',
            'se cubre la cara sin poder creer lo que ve 🤦',
            'facepalm máximo, esto ya es demasiado',
        ],
    },
    facepalm: {
        emoji: '🤦', nekos: 'facepalm',
        mencion: [
            'facepalm total por lo que hizo *@dest* 🤦',
            'se pone la mano en la cara al ver a *@dest*',
            'no tiene palabras para lo que acaba de hacer *@dest*',
            'le sobrevino un facepalm por cada cosa que dice *@dest*',
            'ay *@dest*... facepalm 🤦',
        ],
        solo: [
            'facepalm de proporciones épicas 🤦',
            'se golpea la frente sin poder evitarlo',
            'esto merece un facepalm de campeonato',
            'el chat lo/la tiene en modo facepalm constante 🤦',
            'facepalm infinito para lo que está viendo',
        ],
    },
    feliz: {
        emoji: '😄', nekos: 'happy',
        mencion: [
            'está súper feliz con *@dest* 😄',
            'no puede dejar de sonreír al lado de *@dest*',
            'la alegría le explota por dentro al ver a *@dest*',
            'está irradiando felicidad gracias a *@dest*',
            'se alegra muchísimo de estar con *@dest* 😄',
        ],
        solo: [
            'está de muy buen humor hoy sin razón aparente 😄',
            'anda feliz por el chat contagiando energía',
            'irradia buena vibra por todos lados',
            'tiene una sonrisa que no se le borra 😄',
            'la felicidad le sale por los poros hoy',
        ],
    },
    happy: {
        emoji: '😄', nekos: 'happy',
        mencion: [
            'está muy happy al lado de *@dest* 😄',
            'se alegra un montón de ver a *@dest*',
            'sonríe de oreja a oreja por *@dest*',
            'la felicidad lo/la invade gracias a *@dest*',
            'está en modo happy total por *@dest* 😄',
        ],
        solo: [
            'está happy y quiere que todos lo sepan 😄',
            'anda con la sonrisa pegada en la cara',
            'la buena vibra de hoy no tiene explicación',
            'está en modo happy activado 100% 😄',
            'felicidad pura en el chat hoy',
        ],
    },
    pensar: {
        emoji: '🤔', nekos: 'think',
        mencion: [
            'está pensando profundamente en *@dest* 🤔',
            'no puede dejar de darle vueltas al tema de *@dest*',
            'reflexiona sobre *@dest* con mucha seriedad',
            'caviló durante horas en lo de *@dest*',
            'tiene la mente ocupada 100% con *@dest* 🤔',
        ],
        solo: [
            'está pensando en el chat con cara de filósofo/a 🤔',
            'perdido/a en sus propios pensamientos',
            'anda cavilando algo muy profundo',
            'la mente le va a mil por hora 🤔',
            'piensa tanto que le va a salir humo de la cabeza',
        ],
    },
    think: {
        emoji: '🤔', nekos: 'think',
        mencion: [
            'está pensando muy seriamente en *@dest* 🤔',
            'no puede sacar a *@dest* de su cabeza',
            'reflexiona sobre lo que dijo *@dest*',
            'le da mil vueltas al asunto de *@dest*',
            'tiene a *@dest* muy presente en sus pensamientos 🤔',
        ],
        solo: [
            'está en modo think profundo 🤔',
            'piensa demasiado para su propio bien',
            'lost in thoughts en medio del chat',
            'anda con la cabeza en las nubes pensando 🤔',
            'tiene mil pensamientos y no sabe por cuál empezar',
        ],
    },
    dormir: {
        emoji: '😴', nekos: 'sleep',
        mencion: [
            'se quedó dormido/a en el hombro de *@dest* 😴',
            'usó a *@dest* de almohada y cayó ko',
            'se durmió encima de *@dest* sin pedir permiso',
            'cayó rendido/a al lado de *@dest* roncando',
            'se acomodó contra *@dest* y empezó a roncar 💤',
        ],
        solo: [
            'se quedó dormido/a en pleno chat 😴',
            'se durmió sin avisar a nadie',
            'está roncando en el chat ahora mismo',
            'cayó rendido/a y ni las notificaciones lo/la despiertan 💤',
            'está en el país de los sueños, no molestar',
        ],
    },
    sleep: {
        emoji: '😴', nekos: 'sleep',
        mencion: [
            'se durmió encima de *@dest* sin avisar 😴',
            'usó el hombro de *@dest* de almohada y no hay quien lo/la despierte',
            'se quedó dormido/a agarrado/a a *@dest*',
            'ronca tranquilamente sobre *@dest* 💤',
            'cayó en los brazos de *@dest* rendido/a de sueño',
        ],
        solo: [
            'zzzZZZ... se quedó dormido/a 😴',
            'entró al modo sleep y no hay vuelta atrás',
            'está soñando en pleno chat 💤',
            'se fue a la tierra de los sueños sin despedirse 😴',
            'duerme profundamente y ronca tranquilamente',
        ],
    },
    guinar: {
        emoji: '😉', nekos: 'wink',
        mencion: [
            'le guiñó el ojo a *@dest* con mucha picardía 😉',
            'le mandó un guiño cómplice a *@dest*',
            'le hizo un ojito cargado de intención a *@dest*',
            'guiñó el ojo mirando fijamente a *@dest*',
            'le tiró un guiño misterioso a *@dest* 😉',
        ],
        solo: [
            'guiñó el ojo al chat con mucha picardía 😉',
            'manda un guiño misterioso sin decir a quién',
            'anda guiñando el ojo sin motivo aparente',
            'les lanzó un guiño a todos los del grupo 😉',
            'el guiño más misterioso del chat fue suyo',
        ],
    },
    wink: {
        emoji: '😉', nekos: 'wink',
        mencion: [
            'winkeó a *@dest* con mucho descaro 😉',
            'le tiró el guiño más pícaro del universo a *@dest*',
            'le hizo ojitos irresistibles a *@dest*',
            'guiñó el ojo a *@dest* con toda la intención del mundo',
            'le mandó el wink más cargado de significado a *@dest* 😉',
        ],
        solo: [
            'wink al chat entero 😉',
            'anda guiñando el ojo a quien quiera interpretarlo',
            'el guiño más pícaro del chat es suyo',
            'wink misterioso al aire 😉',
            'guiñó el ojo y nadie sabe qué quiso decir',
        ],
    },
    lamer: {
        emoji: '👅', nekos: 'lick',
        mencion: [
            'lamió a *@dest* de arriba abajo sin avisar 👅',
            'le pasó la lengua por la mejilla a *@dest*',
            'lamió la cara de *@dest* como si fuera un helado',
            'le pegó un lametón enorme a *@dest*',
            'usó a *@dest* de paleta y no paró de lamer 👅',
        ],
        solo: [
            'lamió el aire porque no hay nadie a quien lamer 👅',
            'anda lamiendo lo que encuentra a su paso',
            'tiene la lengua fuera buscando a quién lamer',
            'lamió el teclado de puro aburrimiento 👅',
            'modo lametón activado y sin víctima disponible',
        ],
    },
    lick: {
        emoji: '👅', nekos: 'lick',
        mencion: [
            'lickeó a *@dest* sin el menor pudor 👅',
            'le dio el lametón más enorme del chat a *@dest*',
            'se acercó sigilosamente a *@dest* y le lamió la mejilla',
            'trató a *@dest* como si fuera un lollipop',
            'le pasó la lengua por el cuello a *@dest* 👅',
        ],
        solo: [
            'lick al aire porque sí 👅',
            'anda en modo gecko lamiendo todo lo que toca',
            'tiene la lengua fuera esperando a alguien',
            'lickeó el suelo digital del chat 👅',
            'lame el aire buscando a su víctima favorita',
        ],
    },
    cosquillas: {
        emoji: '🤣', nekos: 'tickle',
        mencion: [
            'le hizo cosquillas a *@dest* sin ninguna compasión 🤣',
            'atacó a *@dest* con cosquillas por todos lados',
            'encontró el punto débil de *@dest* y atacó sin piedad',
            'no paró de hacerle cosquillas a *@dest* hasta que se rindió',
            'torturó a *@dest* con cosquillas interminables 🤣',
        ],
        solo: [
            'hace cosquillas en el aire por falta de víctima 🤣',
            'anda buscando a quién hacerle cosquillas',
            'tiene los dedos listos para atacar a quien se acerque',
            'quiere hacer cosquillas a alguien del grupo 🤣',
            'practica sus técnicas de cosquillas en el vacío',
        ],
    },
    tickle: {
        emoji: '🤣', nekos: 'tickle',
        mencion: [
            'tickleó a *@dest* sin misericordia 🤣',
            'encontró los puntos de cosquillas secretos de *@dest*',
            'hizo a *@dest* llorar de risa con sus cosquillas',
            'atacó a *@dest* por los costados con los dedos',
            'no hay defensa posible contra los tickles de *@dest* 🤣',
        ],
        solo: [
            'busca a quién ticklear urgentemente 🤣',
            'tiene los dedos en posición de ataque y nadie enfrente',
            'quiere hacer cosquillas a alguien del chat',
            'anda en modo tickle attack sin víctima 🤣',
            'practica sus mejores técnicas de cosquillas en el aire',
        ],
    },
    comer: {
        emoji: '🍜', nekos: 'nom',
        mencion: [
            'comió junto a *@dest* sin parar 🍜',
            'compartió su comida favorita con *@dest*',
            'invitó a *@dest* a comer y no dejó ni las migas',
            'devoró todo junto a *@dest* en tiempo récord',
            'no paró de comer al lado de *@dest* 🍜',
        ],
        solo: [
            'comió solo/a y sin remordimientos 🍜',
            'se puso a comer en pleno chat sin ofrecer nada',
            'devoró todo lo que encontró',
            'comió como si no hubiera mañana 🍜',
            'nom nom nom solo/a en el chat',
        ],
    },
    eat: {
        emoji: '🍜', nekos: 'nom',
        mencion: [
            'comió con *@dest* y no dejaron nada 🍜',
            'le ofreció comida a *@dest* y compartieron todo',
            'se pegó un festín junto a *@dest*',
            'invitó a *@dest* a comer y disfrutaron mucho',
            'nom nom nom con *@dest* sin parar 🍜',
        ],
        solo: [
            'está comiendo solo/a en el chat 🍜',
            'nom nom nom sin compartir con nadie',
            'se puso a comer sin avisar a nadie',
            'devoró su comida favorita en solitario 🍜',
            'come en el chat y no invita a nadie',
        ],
    },
    matar: {
        emoji: '⚔️', nekos: 'kill',
        mencion: [
            'eliminó a *@dest* del chat ⚔️',
            'le declaró la guerra a *@dest* y no falló',
            'vino directo por *@dest* y terminó el trabajo',
            'ejecutó a *@dest* sin contemplaciones',
            'borró a *@dest* del mapa sin pestañear ⚔️',
        ],
        solo: [
            'busca a quién eliminar del chat ⚔️',
            'anda de caza por el grupo',
            'está listo/a para la batalla y busca rival',
            'busca su próxima víctima con determinación ⚔️',
            'modo asesino activado, nadie está a salvo',
        ],
    },
    kill: {
        emoji: '⚔️', nekos: 'kill',
        mencion: [
            'killeó a *@dest* sin dudarlo un segundo ⚔️',
            'eliminó a *@dest* del mapa permanentemente',
            'se encargó de *@dest* sin hacer ruido',
            'acabó con *@dest* de un solo movimiento',
            'ejecutó a *@dest* con precisión quirúrgica ⚔️',
        ],
        solo: [
            'modo kill activado y sin objetivo fijo ⚔️',
            'anda buscando a quién eliminar del grupo',
            'tiene el arma lista y nadie a quien apuntar',
            'la violencia lo/la llama y no tiene víctima ⚔️',
            'está en modo hunter buscando presa por el chat',
        ],
    },
    seducir: {
        emoji: '😏', nekos: 'seduce',
        mencion: [
            'sedujo a *@dest* con su mirada más pícara 😏',
            'intentó seducir a *@dest* y lo/la dejó sin palabras',
            'le lanzó una mirada cargada de intención a *@dest*',
            'puso su mejor cara de seductor/a ante *@dest*',
            'irresistiblemente sedujo a *@dest* 😏',
        ],
        solo: [
            'está siendo irresistiblemente seductor/a 😏',
            'anda seduciendo al grupo entero sin querer',
            'tiene una sonrisa que lo dice todo',
            'irradia vibras misteriosas y seductoras 😏',
            'modo seducción activado aunque no haya nadie',
        ],
    },
    seduce: {
        emoji: '😏', nekos: 'seduce',
        mencion: [
            'seduceó a *@dest* con descaro total 😏',
            'no paró de lanzarle miradas a *@dest*',
            'le puso los ojos encima a *@dest* con mucha intención',
            'sonrió misteriosamente mirando a *@dest*',
            'hipnotizó a *@dest* con su carisma irresistible 😏',
        ],
        solo: [
            'seduce al chat entero sin esfuerzo 😏',
            'está en modo seductor/a sin nadie que lo/la frene',
            'lanza vibras de seducción al vacío',
            'irradia encanto por todos los poros 😏',
            'modo rizz: activado aunque no haya destinatario',
        ],
    },
    patear: {
        emoji: '🦵', nekos: 'kick',
        mencion: [
            'pateó a *@dest* con todas sus fuerzas 🦵',
            'le dio una patada voladora a *@dest*',
            'le pateó el trasero a *@dest* sin miramientos',
            'mandó a volar a *@dest* de una patada',
            'le estampó el pie en la cara a *@dest* 🦵',
        ],
        solo: [
            'pateó al aire con mucha rabia 🦵',
            'anda buscando a quién patear',
            'practica sus patadas en el viento',
            'tiene el pie listo para quien se le acerque 🦵',
            'patada al vacío porque no hay nadie a quién darle',
        ],
    },
    kick: {
        emoji: '🦵', nekos: 'kick',
        mencion: [
            'kickeó a *@dest* sin compasión 🦵',
            'le metió una patada épica a *@dest*',
            'mandó a *@dest* por los aires de una patada',
            'le dio el kick más potente del chat a *@dest*',
            'no dudó un segundo en patear a *@dest* 🦵',
        ],
        solo: [
            'kick al aire por falta de objetivo 🦵',
            'anda repartiendo patadas al viento',
            'practica sus kicks en el chat vacío',
            'tiene el pie caliente y nadie a quien patear 🦵',
            'modo kickboxing activado y sin rival enfrente',
        ],
    },
    tomar: {
        emoji: '🤝', nekos: 'handhold',
        mencion: [
            'tomó de la mano a *@dest* suavemente 🤝',
            'entrelazó sus dedos con los de *@dest*',
            'no soltó la mano de *@dest* en ningún momento',
            'le ofreció su mano a *@dest* tímidamente',
            'agarró la mano de *@dest* y no la soltó 🤝',
        ],
        solo: [
            'busca de quién agarrarse en el chat 🤝',
            'tiene la mano extendida esperando a alguien',
            'anda buscando una mano cálida que tomar',
            'quiere tomarse de la mano con alguien del grupo 🤝',
            'mano extendida, ¿alguien se apunta?',
        ],
    },
    handhold: {
        emoji: '🤝', nekos: 'handhold',
        mencion: [
            'tomó de la mano a *@dest* y no la suelta 🤝',
            'entrelazó sus dedos con los de *@dest* sin avisar',
            'agarró la mano de *@dest* tímidamente',
            'holdea la mano de *@dest* con mucho cariño',
            'se puso rojo/a de coger la mano de *@dest* 🤝',
        ],
        solo: [
            'busca una mano que agarrar en el grupo 🤝',
            'mano extendida hacia el chat esperando a alguien',
            'quiere handhold con alguien desesperadamente',
            'tiene la mano lista para quien quiera tomarla 🤝',
            'holdea el aire esperando que alguien llegue',
        ],
    },
    bath: {
        emoji: '🛁', nekos: 'bath',
        mencion: [
            'se metió en el baño con *@dest* sin avisar 🛁',
            'invitó a *@dest* a bañarse juntos/as',
            'salpicó a *@dest* con agua de la bañera',
            'compartió la bañera con *@dest* tranquilamente',
            'se está bañando con *@dest* y nadie entiende nada 🛁',
        ],
        solo: [
            'se metió en la bañera solo/a sin invitar a nadie 🛁',
            'está disfrutando el baño en solitario',
            'splish splash en el baño solo/a',
            'se está dando un baño relajante y no quiere compañía 🛁',
            'baño solitario en el chat, nadie moleste',
        ],
    },
    bleh: {
        emoji: '😛', nekos: 'baka',
        mencion: [
            'le sacó la lengua a *@dest* con mucho descaro 😛',
            'hizo una mueca burlona a *@dest*',
            'se burló de *@dest* sacando la lengua',
            'le hizo bleh a *@dest* sin ningún pudor',
            'le hizo la pedorreta a *@dest* 😛',
        ],
        solo: [
            'saca la lengua al chat entero 😛',
            'bleh para todos en general',
            'hace muecas al aire sin razón',
            'se burla de la nada en el chat 😛',
            'bleh bleh bleh sin destinatario concreto',
        ],
    },
    call: {
        emoji: '📞', nekos: 'wave',
        mencion: [
            'llamó a *@dest* y no para de timbrar 📞',
            'está intentando comunicarse con *@dest*',
            'le marcó el teléfono a *@dest* sin parar',
            'llama a *@dest* desde el chat a ver si responde',
            'alo alo, ¿está *@dest*? 📞',
        ],
        solo: [
            'llama a alguien del grupo pero nadie contesta 📞',
            'está timbran a todo el chat sin suerte',
            'alo alo... ¿hay alguien ahí? 📞',
            'marca números al azar en el grupo',
            'espera que alguien le conteste la llamada 📞',
        ],
    },
    clap: {
        emoji: '👏', nekos: 'highfive',
        mencion: [
            'aplaudió a *@dest* con mucho entusiasmo 👏',
            'le dio una ovación de pie a *@dest*',
            'no paró de aplaudir por lo que hizo *@dest*',
            'le regaló los mejores aplausos del chat a *@dest*',
            'standing ovation para *@dest* 👏',
        ],
        solo: [
            'aplaudió solo/a en el chat porque nadie más lo hizo 👏',
            'aplaude sin importarle que nadie le siga',
            'clap clap clap al vacío',
            'se aplaudió a sí mismo/a con orgullo 👏',
            'aplaude al chat entero por existir',
        ],
    },
    aplaudir: {
        emoji: '👏', nekos: 'highfive',
        mencion: [
            'aplaudió a *@dest* sin parar 👏',
            'le dio una ovación merecida a *@dest*',
            'no pudo evitar aplaudir lo que hizo *@dest*',
            'se puso de pie para aplaudir a *@dest*',
            'bravo bravo a *@dest* 👏',
        ],
        solo: [
            'aplaude al chat aunque nadie lo/la vea 👏',
            'clap clap clap solo/a sin razón',
            'se aplaude a sí mismo/a porque se lo merece',
            'aplaude a todo el grupo por igual 👏',
            'ovación solitaria en el chat',
        ],
    },
    coffee: {
        emoji: '☕', nekos: 'coffee',
        mencion: [
            'tomó café con *@dest* y no dijo nada en todo el rato ☕',
            'invitó a *@dest* a un café y conversaron largo',
            'compartió su taza de café favorita con *@dest*',
            'tomó el café de la mañana junto a *@dest*',
            'café para dos: *@dest* y yo ☕',
        ],
        solo: [
            'tomó café solo/a y en silencio ☕',
            'se hizo un café y no invitó a nadie',
            'café matutino en solitario sin remordimientos',
            'sorbió su café favorito solo/a en el chat ☕',
            'una taza de café y nada más, gracias',
        ],
    },
    cafe: {
        emoji: '☕', nekos: 'coffee',
        mencion: [
            'se tomó un café con *@dest* tranquilamente ☕',
            'invitó a *@dest* a un cafecito',
            'compartió el café de la tarde con *@dest*',
            'sorber café con *@dest* es su actividad favorita',
            'cafecito para *@dest* y para mí ☕',
        ],
        solo: [
            'se tomó su café solo/a y disfrutándolo ☕',
            'cafe solito porque nadie le hizo compañía',
            'sorbe su café favorito en solitario',
            'nadie merece su café hoy ☕',
            'cafecito tranquilo sin compañía',
        ],
    },
    cold: {
        emoji: '🥶', nekos: 'cold',
        mencion: [
            'tiene mucho frío y se pegó a *@dest* buscando calor 🥶',
            'está helado/a y culpa a *@dest* por alguna razón',
            'tiembla de frío al lado de *@dest*',
            'busca el calor de *@dest* porque se está congelando',
            'brrrr... se pegó a *@dest* como si fuera una estufa 🥶',
        ],
        solo: [
            'tiene un frío terrible y nadie le da calor 🥶',
            'se está congelando en el chat',
            'brrrr, alguien que le traiga una manta',
            'el frío lo/la tiene temblando en el grupo 🥶',
            'se murió de frío antes de que nadie llegara',
        ],
    },
    cook: {
        emoji: '🍳', nekos: 'cook',
        mencion: [
            'cocinó algo delicioso para *@dest* 🍳',
            'se puso a cocinar especialmente para *@dest*',
            'hizo su mejor plato y se lo ofreció a *@dest*',
            'cocinó con todo el amor del mundo para *@dest*',
            'el menú de hoy es especial para *@dest* 🍳',
        ],
        solo: [
            'cocinó algo increíble y no invitó a nadie 🍳',
            'se puso a cocinar solo/a y olió de maravilla',
            'chef mode activado en solitario',
            'cocinó para sí mismo/a porque nadie lo merece 🍳',
            'se hizo el mejor plato del mundo y no compartió',
        ],
    },
    dramatic: {
        emoji: '🎭', nekos: 'dramatic',
        mencion: [
            'está siendo extremadamente dramático/a con *@dest* 🎭',
            'actuó la escena más dramática del chat con *@dest*',
            'convirtió cualquier cosa de *@dest* en un drama épico',
            'no puede dejar de dramatizar todo lo que hace *@dest*',
            'Oscar a la actuación más dramática por culpa de *@dest* 🎭',
        ],
        solo: [
            'está en modo drama total sin motivo 🎭',
            'convirtió el chat en un teatro de su drama',
            'el drama lo/la persigue aunque esté solo/a',
            'actuación dramática de máximo nivel sin audiencia 🎭',
            'gana el Oscar al drama más innecesario del día',
        ],
    },
    drama: {
        emoji: '🎭', nekos: 'dramatic',
        mencion: [
            'montó un drama épico alrededor de *@dest* 🎭',
            'hizo de cualquier gesto de *@dest* toda una telenovela',
            'dramatizó sin parar con *@dest* como protagonista',
            'sin *@dest* no habría drama, pero aquí estamos 🎭',
            'le montó el drama más grande del chat a *@dest*',
        ],
        solo: [
            'el drama empieza y termina con él/ella 🎭',
            'monodrama en el chat de la más alta calidad',
            'drama de una persona, aplausos de cero',
            'convirtió el chat en su escenario personal 🎭',
            'drama puro sin necesidad de coprotagonista',
        ],
    },
    draw: {
        emoji: '🎨', nekos: 'draw',
        mencion: [
            'dibujó algo increíble para *@dest* 🎨',
            'le hizo un retrato a *@dest* con mucho detalle',
            'se pasó horas dibujando algo para *@dest*',
            'le dedicó su mejor dibujo a *@dest*',
            'arte exclusivo hecho con amor para *@dest* 🎨',
        ],
        solo: [
            'dibujó algo y no lo quiso mostrar a nadie 🎨',
            'se puso a dibujar en solitario y quedó genial',
            'arte modo solo activado',
            'dibujó su obra maestra sin que nadie la vea 🎨',
            'se puso creativo/a y nadie lo supo',
        ],
    },
    drunk: {
        emoji: '🍺', nekos: 'drunk',
        mencion: [
            'está borracho/a y se colgó del cuello de *@dest* 🍺',
            'bebió de más y le habla solo a *@dest*',
            'está en modo drunk y *@dest* tiene que aguantarlo/la',
            'le contó todos sus secretos a *@dest* después de unas copas',
            'borracho/a perdido/a junto a *@dest* 🍺',
        ],
        solo: [
            'está borracho/a y eso explica todo 🍺',
            'pedo perdido/a en el chat',
            'las copas lo/la tienen en modo incoherente',
            'está celebrando solo/a y ya se le fue la mano 🍺',
            'drunk mode activado, mejor no hacerle caso',
        ],
    },
    gaming: {
        emoji: '🎮', nekos: 'gaming',
        mencion: [
            'está jugando videojuegos con *@dest* y no para 🎮',
            'invitó a *@dest* a una partida y llevan horas',
            'no quiere dejar de jugar con *@dest*',
            'se puso a jugar con *@dest* y olvidaron la hora',
            'la alianza gaming con *@dest* es imparable 🎮',
        ],
        solo: [
            'está jugando videojuegos solo/a y no quiere que lo/la molesten 🎮',
            'modo gaming activado, no disponible para el chat',
            'solo mode gaming en marcha',
            'está en plena partida y nadie puede distraerlo/la 🎮',
            'gamer solitario/a que no quiere ser molestado/a',
        ],
    },
    heat: {
        emoji: '🥵', nekos: 'heat',
        mencion: [
            'tiene un calor terrible y le echó la culpa a *@dest* 🥵',
            'está derritiéndose de calor al lado de *@dest*',
            'busca sombra junto a *@dest* porque se funde',
            'el calor lo/la tiene sin fuerzas al lado de *@dest*',
            'sudando sin parar con *@dest* cerca 🥵',
        ],
        solo: [
            'tiene un calor insoportable y necesita un ventilador 🥵',
            'se está derritiendo en el chat',
            'el calor lo/la tiene en modo zombie',
            'alguien que le traiga un helado por favor 🥵',
            'se funde de calor y nadie hace nada',
        ],
    },
    jump: {
        emoji: '⬆️', nekos: 'yeet',
        mencion: [
            'saltó encima de *@dest* sin avisar ⬆️',
            'se lanzó hacia *@dest* con un salto épico',
            'saltó de alegría junto a *@dest*',
            'pegó un salto tremendo al ver a *@dest*',
            'se impulsó hacia *@dest* con un salto de campeón/a ⬆️',
        ],
        solo: [
            'saltó al vacío del chat sin mirar ⬆️',
            'pegó un brinco enorme sin motivo aparente',
            'saltó sin red y sin destinatario',
            'se tiró al vacío digital con mucho estilo ⬆️',
            'salto épico en solitario, nadie lo vio',
        ],
    },
    lewd: {
        emoji: '😈', nekos: 'smug',
        mencion: [
            'está siendo muy lascivo/a con *@dest* 😈',
            'le lanzó la mirada más lewd del chat a *@dest*',
            'le coqueteó sin vergüenza alguna a *@dest*',
            'convirtió cualquier cosa de *@dest* en algo lewd',
            'modo lewd activado 100% apuntando a *@dest* 😈',
        ],
        solo: [
            'está en modo lewd y no hay quién lo/la pare 😈',
            'mente sucia sin destinatario concreto',
            'lewd mode activado aunque no haya nadie',
            'sus pensamientos son un desastre hoy 😈',
            'modo lascivo/a: ON, audiencia: nadie',
        ],
    },
    love: {
        emoji: '❤️', nekos: 'hug',
        mencion: [
            'está profundamente enamorado/a de *@dest* ❤️',
            'no puede dejar de pensar en *@dest* ni un segundo',
            'el amor que siente por *@dest* no tiene límites',
            'se le salen los corazones de los ojos al ver a *@dest*',
            'está loco/a de amor por *@dest* ❤️',
        ],
        solo: [
            'está enamorado/a y no dice de quién ❤️',
            'el amor le sale por todos los poros hoy',
            'corazones flotando alrededor de su cabeza',
            'está en modo enamorado/a sin remedio ❤️',
            'el amor lo/la tiene en las nubes sin aterrizar',
        ],
    },
    amor: {
        emoji: '❤️', nekos: 'hug',
        mencion: [
            'está lleno/a de amor por *@dest* ❤️',
            'quiere a *@dest* con toda su alma',
            'el amor que siente por *@dest* es incondicional',
            'no hay nadie en el chat que quiera más que a *@dest*',
            'corazón rebosante de amor hacia *@dest* ❤️',
        ],
        solo: [
            'tiene tanto amor que no sabe dónde ponerlo ❤️',
            'el amor le desborda en el chat',
            'anda repartiendo amor gratis para quien lo quiera',
            'lleno/a de amor hoy sin saber bien para quién ❤️',
            'el amor lo/la tiene flotando en el chat',
        ],
    },
    nope: {
        emoji: '🙅', nekos: 'shrug',
        mencion: [
            'le dijo que no a *@dest* con mucha determinación 🙅',
            'rechazó todo lo que propuso *@dest*',
            'nope nope nope a *@dest* sin contemplaciones',
            'se negó rotundamente ante *@dest*',
            'la respuesta para *@dest* siempre es no 🙅',
        ],
        solo: [
            'nope a todo en el chat 🙅',
            'se negó sin dar explicaciones',
            'su respuesta es no y punto',
            'nope nope nope al chat entero 🙅',
            'rechazo masivo a todo lo que venga',
        ],
    },
    pout: {
        emoji: '😤', nekos: 'baka',
        mencion: [
            'está haciendo pucheros por culpa de *@dest* 😤',
            'no puede creer lo que hizo *@dest* y hace pucheros',
            'pucheros infinitos dirigidos a *@dest*',
            'está enfurruñado/a con *@dest* y lo demuestra',
            'puchero monumental por lo que hizo *@dest* 😤',
        ],
        solo: [
            'hace pucheros en el chat sin motivo aparente 😤',
            'está enfurruñado/a con el mundo entero',
            'puchero mode: activado',
            'está de morros y nadie sabe por qué 😤',
            'pucheros al vacío porque le apetece',
        ],
    },
    psycho: {
        emoji: '🔪', nekos: 'psycho',
        mencion: [
            'se puso en modo psicópata con *@dest* 🔪',
            'la mirada que le lanzó a *@dest* no era normal',
            'planificó algo retorcido contra *@dest*',
            'le sonrió a *@dest* de una forma muy inquietante',
            'psycho mode activado y *@dest* es el objetivo 🔪',
        ],
        solo: [
            'entró en modo psicópata sin destinatario 🔪',
            'está planeando algo y nadie sabe qué',
            'la mirada dice demasiado hoy',
            'psycho mode: ON, víctima: pendiente 🔪',
            'ríe en silencio y eso da más miedo que cualquier otra cosa',
        ],
    },
    push: {
        emoji: '💨', nekos: 'kick',
        mencion: [
            'empujó a *@dest* sin ningún motivo 💨',
            'le dio un empujón a *@dest* de la nada',
            'mandó a *@dest* de un lado a otro de un empujón',
            'empujó a *@dest* con toda su fuerza',
            'bum, *@dest* cayó de un empujón 💨',
        ],
        solo: [
            'empujó el aire porque no hay nadie a quien empujar 💨',
            'anda dando empujones al viento',
            'tiene ganas de empujar a alguien del grupo',
            'empuja sin víctima y eso lo frustra 💨',
            'modo empujón activado y sin objetivo',
        ],
    },
    scared: {
        emoji: '😱', nekos: 'scared',
        mencion: [
            'se asustó muchísimo por culpa de *@dest* 😱',
            'pegó un grito de terror al ver lo que hizo *@dest*',
            'tiene miedo de *@dest* y no lo oculta',
            'se escondió detrás del chat por culpa de *@dest*',
            'el susto que le dio *@dest* no lo/la supera 😱',
        ],
        solo: [
            'está asustado/a y no sabe de qué 😱',
            'pegó un grito al chat sin razón aparente',
            'tiene miedo de algo y no quiere decir qué',
            'se esconde en un rincón del chat 😱',
            'modo asustado/a activado sin motivo claro',
        ],
    },
    scream: {
        emoji: '😱', nekos: 'scream',
        mencion: [
            'le gritó a *@dest* con todas sus fuerzas 😱',
            'le metió el grito más épico del chat a *@dest*',
            'no pudo evitar gritar al ver lo que hizo *@dest*',
            'AAAAAAA le gritó directamente a *@dest*',
            'perdió los papeles y gritó a *@dest* sin parar 😱',
        ],
        solo: [
            'gritó al vacío del chat 😱',
            'AAAAAAA sin destinatario concreto',
            'el grito interior salió al exterior',
            'gritó porque le apetecía y punto 😱',
            'grito al chat entero sin explicación',
        ],
    },
    shy: {
        emoji: '🙈', nekos: 'blush',
        mencion: [
            'está muy tímido/a con *@dest* 🙈',
            'no puede mirar a *@dest* de lo tímido/a que es',
            'se esconde al ver a *@dest*',
            'le hablaría a *@dest* pero la timidez no lo/la deja',
            'se pone rojo/a solo de pensar en *@dest* 🙈',
        ],
        solo: [
            'está tímido/a en el chat hoy 🙈',
            'se esconde detrás de la pantalla',
            'la timidez lo/la tiene en silencio',
            'quiere hablar pero la vergüenza lo/la frena 🙈',
            'modo shy activado: cero interacciones',
        ],
    },
    timido: {
        emoji: '🙈', nekos: 'blush',
        mencion: [
            'se puso muy tímido/a con *@dest* 🙈',
            'no hay manera de que mire a *@dest* a los ojos',
            'se sonrojó y escondió la cara al ver a *@dest*',
            'la timidez lo/la domina cuando está con *@dest*',
            'quiere acercarse a *@dest* pero no puede 🙈',
        ],
        solo: [
            'está tan tímido/a que apenas escribe 🙈',
            'la vergüenza lo/la tiene en modo invisible',
            'modo tímido/a: activado',
            'quiere participar en el chat pero no se atreve 🙈',
            'timidez máxima hoy y sin cura aparente',
        ],
    },
    sing: {
        emoji: '🎤', nekos: 'sing',
        mencion: [
            'cantó su canción favorita para *@dest* 🎤',
            'le dedicó una canción entera a *@dest*',
            'se arrancó a cantar mirando a *@dest*',
            'usó a *@dest* de audiencia para su concierto privado',
            'la voz más hermosa del chat sonó para *@dest* 🎤',
        ],
        solo: [
            'cantó solo/a en el chat y fue increíble 🎤',
            'concierto privado sin público en el grupo',
            'se arrancó a cantar sin pedir permiso',
            'la canción salió sola y sonó fenomenal 🎤',
            'karaoke solitario en el chat, nadie aplaudió',
        ],
    },
    smoke: {
        emoji: '🚬', nekos: 'smoke',
        mencion: [
            'está fumando tranquilamente con *@dest* 🚬',
            'compartió un cigarro con *@dest* en silencio',
            'fuma al lado de *@dest* sin decir nada',
            'le ofreció fuego a *@dest* con mucho estilo',
            'momento cigarro con *@dest* en el chat 🚬',
        ],
        solo: [
            'fuma solo/a en el chat con cara de interesante 🚬',
            'cigarro solitario y cara de pocos amigos',
            'fumando en el rincón del chat sin compañía',
            'humo en el chat, sin comentarios 🚬',
            'modo fumador/a misteriosos/a: activado',
        ],
    },
    spit: {
        emoji: '💦', nekos: 'baka',
        mencion: [
            'le escupió a *@dest* de la manera más asquerosa 💦',
            'ptui, escupió justo en dirección a *@dest*',
            'le lanzó un escupitajo a *@dest* sin avergonzarse',
            'decidió que *@dest* merecía un escupitajo',
            'le escupió con mucha puntería a *@dest* 💦',
        ],
        solo: [
            'escupió al aire porque tiene el poder 💦',
            'escupitajo al vacío sin destinatario',
            'ptui al chat en general',
            'lanzó un escupitajo enorme sin apuntar 💦',
            'escupitajo máster en el chat',
        ],
    },
    escupir: {
        emoji: '💦', nekos: 'baka',
        mencion: [
            'escupió en la dirección de *@dest* sin pensarlo 💦',
            'le lanzó un escupitajo épico a *@dest*',
            'ptui directo a *@dest*',
            'escupió a *@dest* y no se arrepiente',
            'el escupitajo más legendario del chat fue para *@dest* 💦',
        ],
        solo: [
            'escupió al chat en general 💦',
            'ptui al vacío por las dudas',
            'escupitajo sin víctima pero con mucha fuerza',
            'escupió al viento porque puede 💦',
            'lanzó el escupitajo al grupo sin apuntar a nadie',
        ],
    },
    step: {
        emoji: '👟', nekos: 'kick',
        mencion: [
            'pisó a *@dest* con toda su fuerza 👟',
            'le pasó por encima a *@dest* literalmente',
            'le puso el pie encima a *@dest* sin piedad',
            'step on me — dijo *@dest*, y obedeció',
            'le pisó el pie a *@dest* y ni se disculpó 👟',
        ],
        solo: [
            'pisó el suelo del chat con mucha actitud 👟',
            'anda pisando fuerte por el grupo',
            'cada paso suyo se escucha desde lejos',
            'pisotea el aire con estilo 👟',
            'step step step sin nadie debajo',
        ],
    },
    pisar: {
        emoji: '👟', nekos: 'kick',
        mencion: [
            'pisó a *@dest* sin ningún remordimiento 👟',
            'le pasó por encima a *@dest* tranquilamente',
            'dejó la huella de su zapato en *@dest*',
            'pisó a *@dest* como si fuera alfombra',
            'le aplastó el pie a *@dest* y siguió su camino 👟',
        ],
        solo: [
            'pisa fuerte en el chat 👟',
            'cada pisada suya retumba en el grupo',
            'camina pisando fuerte por el chat',
            'pisó el suelo con toda la actitud 👟',
            'paso a paso, nadie lo/la detiene',
        ],
    },
    walk: {
        emoji: '🚶', nekos: 'walk',
        mencion: [
            'está caminando tranquilamente con *@dest* 🚶',
            'se fue a dar un paseo con *@dest*',
            'caminó sin prisa junto a *@dest*',
            'paseó a *@dest* por el chat con calma',
            'anduvieron juntos/as sin decir nada 🚶',
        ],
        solo: [
            'está caminando solo/a por el chat 🚶',
            'se fue a pasear sin decir adónde',
            'camina tranquilamente por el grupo',
            'paseíto solitario sin compañía 🚶',
            'walk walk walk por el chat sin rumbo',
        ],
    },
    caminar: {
        emoji: '🚶', nekos: 'walk',
        mencion: [
            'caminó junto a *@dest* sin apuro 🚶',
            'se fue a dar una vuelta con *@dest*',
            'paseo tranquilo en compañía de *@dest*',
            'anduvo al lado de *@dest* disfrutando el momento',
            'caminata lenta y agradable con *@dest* 🚶',
        ],
        solo: [
            'se puso a caminar solo/a por el chat 🚶',
            'caminata solitaria sin destino concreto',
            'anda por el grupo sin rumbo fijo',
            'paseo sin compañía pero con actitud 🚶',
            'camina tranquilo/a sin importar nada',
        ],
    },
};

// ══════════════════════════════════════════
//  NSFW - IMÁGENES
// ══════════════════════════════════════════
const NSFW_CMDS = {
    neko:      'neko',
    hentai:    'hentai',
    ass:       'ass',
    poto:      'ass',
    pussy:     'pussy',
    boobs:     'paizuri',
    tetas:     'paizuri',
    hentaigif: 'hentai',
    loli:      'loli',
    nekomimi:  'neko',
    milf:      'milf',
    ecchi:     'ecchi',
    ero:       'ero',
    creampie:  'creampie',
    trap:      'trap',
    femdom:    'femdom',
};

// Tags específicos para cada tipo NSFW (Gelbooru/Danbooru)
const NSFW_TAGS = {
    ass:      '1girl+ass+rating:explicit',
    pussy:    '1girl+pussy+rating:explicit',
    neko:     'cat_ears+cat_tail+nude+rating:explicit',
    hentai:   '1girl+nude+rating:explicit',
    loli:     '1girl+flat_chest+rating:explicit',
    blowjob:  '1girl+fellatio+rating:explicit',
    boobs:    '1girl+large_breasts+rating:explicit',
    paizuri:  '1girl+paizuri+rating:explicit',
    cum:      '1girl+cum+rating:explicit',
    anal:     '1girl+anal+rating:explicit',
    yuri:     '2girls+yuri+rating:explicit',
    milf:     '1girl+milf+rating:explicit',
    ecchi:    '1girl+ecchi+rating:sensitive',
    ero:      '1girl+underwear+rating:sensitive',
    creampie: '1girl+creampie+rating:explicit',
    trap:     'trap+rating:explicit',
    femdom:   'femdom+rating:explicit',
};

function encodeBooruTags(tags) {
    return encodeURIComponent(String(tags || '').replace(/\+/g, ' ').replace(/\s+/g, ' ').trim());
}

// ══════════════════════════════════════════
//  NSFW - ACCIONES (texto)
// ══════════════════════════════════════════
const NSFW_ACCIONES = {
    anal: {
        emoji: '🍑',
        mencion: [
            'le hizo un anal a *@dest*',
            'penetró el culito de *@dest* sin pedir permiso',
            'le metió por atrás a *@dest* bien rico',
            'le rompió el culo a *@dest* sin compasión',
        ],
        solo: [
            'quiere hacerle un anal a alguien del grupo',
            'anda buscando un culito que penetrar',
            'quiere meter por atrás sin pedir permiso',
            'está cachondo y quiere romper culos',
        ],
    },
    blowjob: {
        emoji: '💦',
        mencion: [
            'le dio una mamada a *@dest*',
            'se arrodilló ante *@dest* y se la mamó entera',
            'le chupó el pene a *@dest* con ganas',
            'se metió a *@dest* en la boca hasta el fondo',
        ],
        solo: [
            'está dando mamadas a quien quiera',
            'anda de rodillas buscando a quien mamar',
            'tiene la boca lista para el primero que quiera',
            'quiere chupar a alguien del grupo ahora mismo',
        ],
    },
    mamada: {
        emoji: '💦',
        mencion: [
            'le dio una mamada a *@dest*',
            'se arrodilló ante *@dest* y se la mamó entera',
            'le chupó el pene a *@dest* con ganas',
            'se metió a *@dest* en la boca hasta el fondo',
        ],
        solo: [
            'está dando mamadas a quien quiera',
            'anda de rodillas buscando a quien mamar',
            'tiene la boca lista para el primero que quiera',
            'quiere chupar a alguien del grupo ahora mismo',
        ],
    },
    bj: {
        emoji: '💦',
        mencion: [
            'le dio una mamada a *@dest*',
            'se arrodilló ante *@dest* y se la mamó entera',
            'le chupó el pene a *@dest* con ganas',
            'se metió a *@dest* en la boca hasta el fondo',
        ],
        solo: [
            'está dando mamadas a quien quiera',
            'anda de rodillas buscando a quien mamar',
            'tiene la boca lista para el primero que quiera',
            'quiere chupar a alguien del grupo ahora mismo',
        ],
    },
    boobjob: {
        emoji: '🍈',
        mencion: [
            'le hizo una rusa a *@dest*',
            'le apretó las tetas alrededor de la polla a *@dest*',
            'le ofreció sus pechos a *@dest* para una rusa',
            'metió la polla de *@dest* entre sus tetas y empezó a moverse',
        ],
        solo: [
            'está haciendo rusas a quien quiera',
            'quiere apretar una polla entre sus tetas',
            'anda ofreciendo rusas gratis en el grupo',
            'tiene los pechos listos para complacer a alguien',
        ],
    },
    cum: {
        emoji: '💦',
        mencion: [
            'se vino encima de *@dest*',
            'acabó todo encima de *@dest* sin avisar',
            'le llenó la cara de leche a *@dest*',
            'se corrió sobre *@dest* a chorro',
        ],
        solo: [
            'se vino encima de todos',
            'acabó sin avisarle a nadie',
            'se corrió a lo bestia y roció a todo el grupo',
            'se vino solo como un campeón',
        ],
    },
    cummouth: {
        emoji: '💦',
        mencion: [
            'acabó en la boca de *@dest*',
            'se corrió directo en la boca de *@dest*',
            'le llenó la boca de leche a *@dest*',
            'le hizo tragar todo a *@dest*',
        ],
        solo: [
            'acabó en la boca de alguien del grupo',
            'quiere acabar en la boca de alguien',
            'se corrió buscando una boca abierta',
            'quiere que alguien le trague hasta la última gota',
        ],
    },
    cumshot: {
        emoji: '💦',
        mencion: [
            'le disparó semen a *@dest*',
            'regó a *@dest* de leche de arriba a abajo',
            'le salpicó la cara a *@dest* sin compasión',
            'acabó a distancia sobre *@dest*',
        ],
        solo: [
            'disparó semen sin apuntar a nadie',
            'regó a todos sin avisar',
            'se corrió a lo bestia y salpicó a todo el grupo',
            'disparó su carga al aire libre',
        ],
    },
    fap: {
        emoji: '💦',
        mencion: [
            'se hizo una paja pensando en *@dest*',
            'se pajeó mirando las fotos de *@dest*',
            'acabó imaginándose a *@dest*',
            'se masturbó sin parar pensando en *@dest*',
        ],
        solo: [
            'se está haciendo una paja... qué rico',
            'está en el baño haciéndose una paja',
            'se masturbó solo como de costumbre',
            'anda de pajero por el grupo',
        ],
    },
    paja: {
        emoji: '💦',
        mencion: [
            'se hizo una paja pensando en *@dest*',
            'se pajeó mirando las fotos de *@dest*',
            'acabó imaginándose a *@dest*',
            'se masturbó sin parar pensando en *@dest*',
        ],
        solo: [
            'se está haciendo una paja... qué rico',
            'está en el baño haciéndose una paja',
            'se masturbó solo como de costumbre',
            'anda de pajero por el grupo',
        ],
    },
    footjob: {
        emoji: '🦶',
        mencion: [
            'le hizo una paja con los pies a *@dest*',
            'usó sus pies para complacer a *@dest*',
            'apretó la polla de *@dest* entre sus pies despacito',
            'le dio una footjob de lujo a *@dest*',
        ],
        solo: [
            'está dando pajas con los pies a quien quiera',
            'anda ofreciendo footjobs gratis en el grupo',
            'quiere usar sus pies con alguien del grupo',
            'tiene los pies listos para complacer al primero que pida',
        ],
    },
    fuck: {
        emoji: '🔥',
        mencion: [
            'se cogió a *@dest*',
            'se tiró a *@dest* sin pensarlo dos veces',
            'le metió la polla a *@dest* hasta el fondo',
            'folló a *@dest* sin parar hasta acabar',
        ],
        solo: [
            'se cogió a todos los del grupo',
            'anda queriendo coger con quien sea',
            'se tiró a todo el grupo de una vez',
            'está cachondo y quiere follar a todos',
        ],
    },
    coger: {
        emoji: '🔥',
        mencion: [
            'se cogió a *@dest*',
            'se tiró a *@dest* sin pensarlo dos veces',
            'le metió la polla a *@dest* hasta el fondo',
            'folló a *@dest* sin parar hasta acabar',
        ],
        solo: [
            'se cogió a todos los del grupo',
            'anda queriendo coger con quien sea',
            'se tiró a todo el grupo de una vez',
            'está cachondo y quiere follar a todos',
        ],
    },
    grabboobs: {
        emoji: '🍈',
        mencion: [
            'le agarró las tetas a *@dest*',
            'apretó los pechos de *@dest* con las dos manos',
            'le metió mano a las tetas a *@dest* sin pedir permiso',
            'le sobó los senos a *@dest* bien rico',
        ],
        solo: [
            'anda agarrando tetas por ahí sin permiso',
            'quiere agarrarle las tetas a alguien del grupo',
            'está con las manos listas para apretar pechos',
            'anda de pillo agarrando todo lo que puede',
        ],
    },
    grope: {
        emoji: '🙈',
        mencion: [
            'manoseó a *@dest*',
            'le metió mano a *@dest* por todos lados',
            'tocó a *@dest* donde no debía',
            'le agarró el culo a *@dest* sin avisar',
        ],
        solo: [
            'está manoseando a alguien del grupo',
            'anda tocando lo que no debe por ahí',
            'metió mano sin pedir permiso',
            'está de manoseo libre por todo el grupo',
        ],
    },
    handjob: {
        emoji: '💦',
        mencion: [
            'le hizo una paja a *@dest*',
            'le agarró la polla a *@dest* y empezó a moverla',
            'le dio placer con la mano a *@dest* hasta el final',
            'le sacudió la polla a *@dest* sin parar',
        ],
        solo: [
            'le está haciendo una paja a alguien por ahí',
            'anda ofreciendo pajas con la mano gratis',
            'tiene las manos listas para complacer a quien quiera',
            'quiere hacerle una paja a alguien del grupo',
        ],
    },
    lickass: {
        emoji: '🍑',
        mencion: [
            'le lamió el culo a *@dest*',
            'enterró la cara en el trasero de *@dest*',
            'le comió el culo a *@dest* rico rico',
            'le pasó la lengua por el ano a *@dest* despacito',
        ],
        solo: [
            'está lamiendo culos por ahí',
            'quiere comer el culo de alguien del grupo',
            'anda buscando un culito que lamer',
            'tiene la lengua lista para comer culos',
        ],
    },
    lickdick: {
        emoji: '💦',
        mencion: [
            'le lamió el pene a *@dest*',
            'le pasó la lengua por toda la polla a *@dest*',
            'le chupó la punta a *@dest* despacito',
            'adoró el pene de *@dest* con la lengua de arriba a abajo',
        ],
        solo: [
            'anda lamiendo penes por ahí',
            'quiere lamer la polla de alguien del grupo',
            'tiene la lengua lista para un pene',
            'está buscando una polla que lamer ahora mismo',
        ],
    },
    lickpussy: {
        emoji: '💦',
        mencion: [
            'le lamió el coño a *@dest*',
            'le comió el coño a *@dest* con ganas',
            'enterró la cara entre las piernas de *@dest*',
            'le pasó la lengua por el clítoris a *@dest* sin parar',
        ],
        solo: [
            'está lamiendo coños por ahí',
            'quiere comer el coño de alguien del grupo',
            'tiene la lengua lista para un coño rico',
            'anda buscando a quién comerle el coño',
        ],
    },
    sixnine: {
        emoji: '🔥',
        mencion: [
            'hizo un 69 con *@dest*',
            'se puso en 69 con *@dest* a la vez',
            'se comió a *@dest* mientras *@dest* se lo comía',
            'montó un 69 bien húmedo con *@dest*',
        ],
        solo: [
            'quiere hacer un 69 con alguien del grupo',
            'anda buscando pareja para un 69',
            'quiere comerse a alguien mientras le comen',
            'tiene ganas de un buen 69 mutuo ahora mismo',
        ],
    },
    '69': {
        emoji: '🔥',
        mencion: [
            'hizo un 69 con *@dest*',
            'se puso en 69 con *@dest* a la vez',
            'se comió a *@dest* mientras *@dest* se lo comía',
            'montó un 69 bien húmedo con *@dest*',
        ],
        solo: [
            'quiere hacer un 69 con alguien del grupo',
            'anda buscando pareja para un 69',
            'quiere comerse a alguien mientras le comen',
            'tiene ganas de un buen 69 mutuo ahora mismo',
        ],
    },
    spank: {
        emoji: '🍑',
        mencion: [
            'le dio una nalgada a *@dest*',
            'le azotó el culo a *@dest* sin avisar',
            'le dejó la marca de la mano en el culo a *@dest*',
            'le cacheteó las nalgas a *@dest* con fuerza',
        ],
        solo: [
            'anda dando nalgadas por ahí sin permiso',
            'está azotando culos sin pedir permiso',
            'quiere darle una nalgada a alguien del grupo',
            'tiene el brazo listo para nalgadas',
        ],
    },
    nalgada: {
        emoji: '🍑',
        mencion: [
            'le dio una nalgada a *@dest*',
            'le azotó el culo a *@dest* sin avisar',
            'le dejó la marca de la mano en el culo a *@dest*',
            'le cacheteó las nalgas a *@dest* con fuerza',
        ],
        solo: [
            'anda dando nalgadas por ahí sin permiso',
            'está azotando culos sin pedir permiso',
            'quiere darle una nalgada a alguien del grupo',
            'tiene el brazo listo para nalgadas',
        ],
    },
    suckboobs: {
        emoji: '🍈',
        mencion: [
            'le chupó las tetas a *@dest*',
            'se metió los pezones de *@dest* en la boca',
            'mamó los pechos de *@dest* con ganas',
            'le chupó los pezones a *@dest* despacito',
        ],
        solo: [
            'está chupando tetas sin parar',
            'quiere chupar las tetas de alguien del grupo',
            'anda buscando pechos que mamar',
            'tiene la boca lista para unas tetas ricas',
        ],
    },
    undress: {
        emoji: '👗',
        mencion: [
            'desnudó a *@dest*',
            'le quitó toda la ropa a *@dest* de un jalón',
            'dejó a *@dest* en cueros sin que se lo esperara',
            'le arrancó la ropa a *@dest* despacito pieza por pieza',
        ],
        solo: [
            'está desnudando a alguien del grupo',
            'anda quitándole la ropa a quien pueda',
            'quiere dejar a alguien del grupo en cueros',
            'tiene ganas de ver a alguien completamente desnudo',
        ],
    },
    encuerar: {
        emoji: '👗',
        mencion: [
            'desnudó a *@dest*',
            'le quitó toda la ropa a *@dest* de un jalón',
            'dejó a *@dest* en cueros sin que se lo esperara',
            'le arrancó la ropa a *@dest* despacito pieza por pieza',
        ],
        solo: [
            'está desnudando a alguien del grupo',
            'anda quitándole la ropa a quien pueda',
            'quiere dejar a alguien del grupo en cueros',
            'tiene ganas de ver a alguien completamente desnudo',
        ],
    },
    yuri: {
        emoji: '🌸',
        mencion: [
            'hizo tijeras con *@dest*',
            'se frotó bien rico con *@dest*',
            'montó unas tijeras apretadas con *@dest*',
            'se restregó con *@dest* hasta que las dos se vinieron',
        ],
        solo: [
            'quiere hacer tijeras con alguien del grupo',
            'anda buscando con quién frotarse',
            'está lista para unas ricas tijeras',
            'quiere montar tijeras con quien quiera ahora',
        ],
    },
    tijeras: {
        emoji: '🌸',
        mencion: [
            'hizo tijeras con *@dest*',
            'se frotó bien rico con *@dest*',
            'montó unas tijeras apretadas con *@dest*',
            'se restregó con *@dest* hasta que las dos se vinieron',
        ],
        solo: [
            'quiere hacer tijeras con alguien del grupo',
            'anda buscando con quién frotarse',
            'está lista para unas ricas tijeras',
            'quiere montar tijeras con quien quiera ahora',
        ],
    },
};

// ══════════════════════════════════════════
//  OBTENER GIF DE NEKOS.BEST + DESCARGAR BUFFER
// ══════════════════════════════════════════
// Endpoints que el API de nekos.best realmente soporta (sin los custom que darían 404).
const NEKOS_BEST_REAL = new Set([
    'hug', 'kiss', 'slap', 'pat', 'dance', 'cry', 'bite', 'blush', 'cuddle',
    'poke', 'punch', 'laugh', 'run', 'wave', 'bored', 'facepalm', 'happy',
    'think', 'sleep', 'wink', 'tickle', 'nom', 'shoot', 'smug', 'kick',
    'handhold', 'baka', 'handshake', 'highfive', 'yeet', 'feed', 'nod',
    'thumbsup', 'stare', 'shrug', 'sad',
]);

// Todos los endpoints reconocidos (real + personalizados) — usado para lookups de tags.
const NEKOS_BEST_VALIDOS = new Set([
    ...NEKOS_BEST_REAL,
    'smoke', 'kill', 'cold', 'drunk', 'gaming', 'heat', 'draw', 'sing',
    'coffee', 'cook', 'psycho', 'scream', 'scared', 'dramatic', 'bath', 'walk',
    'seduce', 'lick',
]);

// Endpoints nativos de purrbot.site/api/img/sfw/<ep>/gif
// Para endpoints personalizados sin equivalente exacto, se usa el más cercano semánticamente.
const PURRBOT_MAP = {
    hug: 'hug', kiss: 'kiss', slap: 'slap', pat: 'pat', cry: 'cry',
    poke: 'poke', bite: 'bite', tickle: 'tickle', dance: 'dance',
    cuddle: 'cuddle', punch: 'punch', feed: 'feed', lick: 'lick',
    wave: 'wave', nod: 'nod', smile: 'smile', wink: 'wink',
    blush: 'blush', run: 'run', sleep: 'sleep', stare: 'stare',
    shrug: 'shrug', sad: 'cry', facepalm: 'facepalm', baka: 'baka',
    kick: 'kick', nom: 'nom', happy: 'smile', laugh: 'smile',
    highfive: 'highfive', handhold: 'handhold', thumbsup: 'thumbsup',
    handshake: 'handshake', think: 'pout', bored: 'pout',
    yeet: 'throw', shoot: 'punch',
    // Personalizados — fallback al endpoint purrbot más próximo semánticamente
    smoke:    'stare',     // mirando fijamente / relajado (lo más cercano)
    // kill: SIN purrbot — purrbot no tiene endpoint de kill; slap enviaba contenido incorrecto
    cold:     'cry',       // expresión de sufrimiento
    drunk:    'bored',     // estado alterado
    gaming:   'smile',     // entretenimiento
    heat:     'pout',      // incomodidad / expresión facial
    draw:     'pout',      // actividad tranquila / pensativo
    sing:     'dance',     // performance
    coffee:   'feed',      // consumir algo
    cook:     'feed',      // relacionado con comida
    psycho:   'stare',     // mirada intensa
    scream:   'baka',      // gritar / vociferar
    scared:   'cry',       // expresión de miedo
    dramatic: 'cry',       // dramatismo
    bath:     'pout',      // estado personal
    walk:     'run',       // desplazamiento
    seduce:   'wink',      // coquetería — wink es el más cercano disponible
};

// Endpoints que waifu.pics soporta en /many/sfw/<ep> (devuelve hasta 30 URLs)
const WAIFU_PICS_ENDPOINTS = new Set([
    'hug', 'kiss', 'lick', 'pat', 'smug', 'bonk', 'yeet', 'blush',
    'smile', 'wave', 'highfive', 'handhold', 'nom', 'bite', 'glomp',
    'slap', 'kill', 'kick', 'happy', 'wink', 'poke', 'dance', 'cringe',
    'cuddle', 'cry', 'bully',
]);

// Para endpoints personalizados sin soporte nativo en waifu.pics,
// mapear al endpoint más cercano para obtener contenido visual similar.
const WAIFU_PICS_FALLBACK = {
    seduce:   'smug',    // expresión seductora ≈ smug
    psycho:   'kill',    // intensidad ≈ kill category
    gaming:   'smug',    // entretenido ≈ smug
    heat:     'blush',   // acalorado ≈ ruborizarse
    drunk:    'cry',     // estado alterado ≈ cry
    smoke:    'smug',    // cool/relajado ≈ smug
    cold:     'cry',     // sufrimiento ≈ cry
    draw:     'smile',   // actividad creativa ≈ smile
    sing:     'dance',   // performance ≈ dance
    coffee:   'nom',     // beber algo ≈ nom (comer)
    cook:     'nom',     // preparar comida ≈ nom
    scream:   'baka',    // vociferar ≈ baka
    scared:   'cry',     // miedo ≈ cry
    dramatic: 'cry',     // drama ≈ cry
    bath:     'blush',   // íntimo ≈ blush
    walk:     'wave',    // moverse ≈ wave
};

// Endpoints que hmtai.hatsunia.dev soporta (CDN propio, no bloquea IPs de servidor).
// Clave para comandos que fallan por CDN blocking en nekos.best.
const HMTAI_ENDPOINTS = new Set([
    'hug', 'kiss', 'pat', 'cry', 'slap', 'bite', 'poke', 'cuddle', 'dance',
    'punch', 'wave', 'happy', 'sleep', 'wink', 'run', 'pout', 'laugh', 'lick',
    'blush', 'kill', 'scream', 'shrug', 'sad', 'smile', 'bleh', 'nom', 'tickle',
    'yeet', 'baka', 'smug', 'stare', 'nod', 'highfive', 'handhold', 'thumbsup',
    'shoot', 'coffee', 'bored', 'think', 'throw',
]);

// Tags semánticos para Safebooru — usan la sintaxis REAL de Safebooru:
// palabras separadas por espacio = AND entre tags (NO son frases descriptivas).
// Ej: "coffee animated" busca posts con tag "coffee" Y tag "animated".
// Cada endpoint tiene múltiples variantes; se elige una al azar en cada llamada.
const SFW_SEMANTIC_TAGS = {
    hug:      ['hug animated', 'hug anime', 'embrace animated'],
    kiss:     ['kiss animated', 'kiss anime', 'kissing animated'],
    slap:     ['slap animated', 'slap anime', 'cheek_slap animated'],
    pat:      ['headpat animated', 'head_pat animated', 'pat animated'],
    dance:    ['dancing animated', 'dance animated', 'spin animated'],
    cry:      ['crying animated', 'tears animated', 'sobbing animated'],
    bite:     ['bite animated', 'biting animated', 'nibble animated'],
    blush:    ['blush animated', 'blushing animated', 'embarrassed animated'],
    cuddle:   ['cuddle animated', 'cuddling animated', 'snuggle animated'],
    poke:     ['poke animated', 'poking animated', 'finger_poke animated'],
    punch:    ['punch animated', 'punching animated', 'fist animated'],
    laugh:    ['laughing animated', 'laugh animated', 'hysterical animated'],
    run:      ['running animated', 'run animated', 'sprint animated'],
    wave:     ['waving animated', 'wave animated', 'waving_hand animated'],
    bored:    ['bored animated', 'yawning animated', 'yawn animated'],
    facepalm: ['facepalm animated', 'face_palm animated'],
    happy:    ['happy animated', 'excited animated', 'joy animated'],
    think:    ['thinking animated', 'pondering animated', 'contemplating animated'],
    sleep:    ['sleeping animated', 'sleep animated', 'zzz animated'],
    wink:     ['winking animated', 'wink animated', 'eye_wink animated'],
    tickle:   ['tickling animated', 'tickle animated'],
    nom:      ['eating animated', 'nom animated', 'food animated'],
    eat:      ['eating animated', 'food animated', 'ramen animated'],
    lick:     ['licking animated', 'lick animated', 'tongue animated'],
    shoot:    ['shooting animated', 'gun animated', 'pistol animated'],
    smug:     ['smug animated', 'smug_face animated', 'smirk animated'],
    kick:     ['kick animated', 'kicking animated', 'roundhouse_kick animated'],
    handhold: ['hand_holding animated', 'holding_hands animated'],
    baka:     ['baka animated', 'angry_anime animated', 'yelling animated'],
    highfive: ['high_five animated', 'highfive animated', 'clap animated'],
    yeet:     ['throwing animated', 'throw animated', 'yeet animated'],
    feed:     ['feeding animated', 'feed animated', 'spoon_feed animated'],
    nod:      ['nod animated', 'nodding animated'],
    thumbsup: ['thumbs_up animated', 'approval animated'],
    stare:    ['staring animated', 'stare animated', 'wide_eyes animated'],
    shrug:    ['shrug animated', 'shrugging animated'],
    sad:      ['sad animated', 'sadness animated', 'depressed animated'],
    // Personalizados — tags reales de Safebooru (sin frases descriptivas largas)
    smoke:    ['smoking animated', 'cigarette animated', 'smoke animated'],
    kill:     ['death animated', 'fight animated', 'sword animated', 'kill animated'],
    cold:     ['shivering animated', 'cold animated', 'snow animated'],
    drunk:    ['drunk animated', 'alcohol animated', 'tipsy animated'],
    gaming:   ['video_game animated', 'controller animated', 'playing_games animated'],
    heat:     ['sweat animated', 'sweating animated', 'hot animated'],
    draw:     ['drawing animated', 'sketch animated', 'artist animated'],
    sing:     ['singing animated', 'microphone animated', 'song animated'],
    coffee:   ['coffee animated', 'coffee_cup animated', 'drinking_coffee animated'],
    cook:     ['cooking animated', 'kitchen animated', 'chef animated'],
    psycho:   ['yandere animated', 'insane animated', 'crazy_eyes animated'],
    scream:   ['screaming animated', 'scream animated', 'yelling animated'],
    scared:   ['scared animated', 'fear animated', 'frightened animated'],
    dramatic: ['crying animated', 'dramatic animated', 'tears animated'],
    bath:     ['bathing animated', 'bath animated', 'bubbles animated'],
    walk:     ['walking animated', 'walk animated', 'strolling animated'],
    seduce:   ['winking animated', 'flirting animated', 'seductive animated'],
};

// Re-encodifica cualquier media (GIF o MP4) al formato exacto que WhatsApp
// necesita para mostrarla animada en el chat con gifPlayback:true.
// Usa execFile directo para mayor fiabilidad y mensajes de error claros.
const { execFile } = require('child_process');
const { promisify } = require('util');
const execFileAsync = promisify(execFile);

let _ffmpegBin = null;
function getFfmpegBin() {
    if (_ffmpegBin) return _ffmpegBin;
    try {
        const { execSync } = require('child_process');
        _ffmpegBin = execSync('which ffmpeg', { encoding: 'utf8' }).trim();
    } catch {
        _ffmpegBin = require('@ffmpeg-installer/ffmpeg').path;
    }
    return _ffmpegBin;
}

async function convertirParaGifPlayback(inputBuffer, ext = 'gif') {
    const ts     = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const tmpIn  = path.join(os.tmpdir(), `gif_in_${ts}.${ext}`);
    const tmpOut = path.join(os.tmpdir(), `gif_out_${ts}.mp4`);
    fs.writeFileSync(tmpIn, inputBuffer);
    try {
        await execFileAsync(getFfmpegBin(), [
            '-y',
            '-loglevel', 'error',   // suprime el progreso verbose que desborda maxBuffer
            '-i', tmpIn,
            '-vcodec', 'libx264',
            '-profile:v', 'baseline',
            '-level', '3.0',
            '-pix_fmt', 'yuv420p',
            '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2',
            '-r', '15',
            '-an',
            '-movflags', '+faststart',
            '-crf', '28',
            tmpOut,
        ], {
            timeout:   60000,
            maxBuffer: 50 * 1024 * 1024,   // 50 MB — sobrado para cualquier stderr de error
        });
        const mp4 = fs.readFileSync(tmpOut);
        if (mp4.length < 100) throw new Error('MP4 resultante vacío o corrupto');
        return mp4;
    } finally {
        try { fs.unlinkSync(tmpIn); } catch {}
        try { fs.unlinkSync(tmpOut); } catch {}
    }
}

// Descarga una URL y la convierte a MP4. Lanza error si falla.
async function descargarYConvertir(url, endpoint) {
    const bufRes = await axios.get(url, {
        responseType: 'arraybuffer',
        timeout: 30000,
        headers: HUMAN_HEADERS
    });
    const rawBuf     = Buffer.from(bufRes.data);
    const cType      = bufRes.headers['content-type'] || '';
    const ext        = (url.includes('.gif') || cType.includes('image/gif')) ? 'gif'
                     : (url.includes('.webm') || cType.includes('video/webm')) ? 'webm'
                     : 'mp4';
    console.log(`[SFW] Descargado ${rawBuf.length} bytes (${cType}) para "${endpoint}". Convirtiendo...`);
    const mp4 = await convertirParaGifPlayback(rawBuf, ext);
    console.log(`[SFW] Conversión OK: ${mp4.length} bytes MP4`);
    return mp4;
}

async function obtenerGifBuffer(endpointInput) {
    const endpoint = String(endpointInput || 'hug').toLowerCase();

    // ── Fase 1: resolver qué endpoint usar en cada fuente ──────────────────────
    const tagVariants = SFW_SEMANTIC_TAGS[endpoint] || [`${endpoint} animated`];
    const selectedTag = tagVariants[Math.floor(Math.random() * tagVariants.length)];

    // NOTA: nekos.best CDN devuelve 403 en TODAS sus URLs desde IPs de servidor.
    // No se incluye en el pool para evitar que llene los 8 intentos con URLs rotas.

    // waifu.pics: endpoint nativo si existe, o el más próximo vía WAIFU_PICS_FALLBACK
    const wpDirect  = WAIFU_PICS_ENDPOINTS.has(endpoint) ? endpoint : (WAIFU_PICS_FALLBACK[endpoint] || null);

    // purrbot.site: endpoint nativo o aproximado (siempre tiene algo)
    const purrbotEp = PURRBOT_MAP[endpoint] || null;

    // hmtai.hatsunia.dev: CDN propio, no bloquea IPs de servidor — reemplaza nekos.best
    const hmtaiEp   = HMTAI_ENDPOINTS.has(endpoint) ? endpoint
                    : (HMTAI_ENDPOINTS.has(PURRBOT_MAP[endpoint] || '') ? PURRBOT_MAP[endpoint] : null);

    // ── Fase 2: consultar todas las fuentes en paralelo ─────────────────────────
    const fetches = [];

    // waifu.pics /many — hasta 30 URLs por petición (CDN propio, muy confiable)
    if (wpDirect) {
        fetches.push(
            axios.post(`https://api.waifu.pics/many/sfw/${wpDirect}`, {}, {
                timeout: 9000,
                headers: { 'Content-Type': 'application/json' }
            })
                .then(r => (r.data?.files || []).filter(Boolean))
                .catch(() => [])
        );
    }

    // purrbot.site — 3 peticiones paralelas para mayor variedad (1 URL cada una)
    if (purrbotEp) {
        fetches.push(
            Promise.allSettled([
                axios.get(`https://purrbot.site/api/img/sfw/${purrbotEp}/gif`, { timeout: 8000 }),
                axios.get(`https://purrbot.site/api/img/sfw/${purrbotEp}/gif`, { timeout: 8000 }),
                axios.get(`https://purrbot.site/api/img/sfw/${purrbotEp}/gif`, { timeout: 8000 }),
            ]).then(rs => rs
                .filter(r => r.status === 'fulfilled')
                .map(r => r.value?.data?.link)
                .filter(Boolean)
            )
        );
    }

    // hmtai.hatsunia.dev — CDN propio, no bloquea servers; 3 peticiones paralelas
    if (hmtaiEp) {
        fetches.push(
            Promise.allSettled([
                axios.get(`https://hmtai.hatsunia.dev/v2/${hmtaiEp}`, { timeout: 8000 }),
                axios.get(`https://hmtai.hatsunia.dev/v2/${hmtaiEp}`, { timeout: 8000 }),
                axios.get(`https://hmtai.hatsunia.dev/v2/${hmtaiEp}`, { timeout: 8000 }),
            ]).then(rs => rs
                .filter(r => r.status === 'fulfilled')
                .map(r => r.value?.data?.url)
                .filter(Boolean)
            )
        );
    }

    // otakugifs.xyz — 2 peticiones paralelas
    fetches.push(
        Promise.allSettled([
            axios.get(`https://api.otakugifs.xyz/gif?reaction=${endpoint}&format=gif`, { timeout: 8000 }),
            axios.get(`https://api.otakugifs.xyz/gif?reaction=${endpoint}&format=gif`, { timeout: 8000 }),
        ]).then(rs => rs
            .filter(r => r.status === 'fulfilled')
            .map(r => r.value?.data?.url)
            .filter(Boolean)
        )
    );

    // nekos.life — fallback adicional
    fetches.push(
        axios.get(`https://nekos.life/api/v2/img/${endpoint}`, { timeout: 8000 })
            .then(r => r.data?.url ? [r.data.url] : [])
            .catch(() => [])
    );

    // Safebooru — TODOS los tags en paralelo con pid=0 (garantiza resultados en endpoints raros)
    // + una petición extra con pid aleatorio para variedad en endpoints con muchos posts.
    // Esto soluciona el problema donde pid aleatorio (0-9) falla el 90% del tiempo
    // cuando un tag tiene pocos posts (ej: "kill animated" solo tiene 2 posts, solo en pid=0).
    const safebooruExtract = p =>
        Array.isArray(p)
            ? p.filter(x => /\.(gif|mp4|webm)$/i.test(x.file_url || '')).map(x => x.file_url).filter(Boolean)
            : [];
    const safebooruGet = (tag, pid) =>
        axios.get(
            `https://safebooru.org/index.php?page=dapi&s=post&q=index&json=1&limit=50` +
            `&tags=${encodeURIComponent(tag)}&pid=${pid}`,
            { timeout: 12000 }
        ).then(r => safebooruExtract(r.data)).catch(() => []);

    // pid=0 para cada variante del tag (cobertura total de contenido raro)
    const sbPid0Promises = tagVariants.map(t => safebooruGet(t, 0));
    // pid aleatorio 1-6 sobre el tag seleccionado (variedad en endpoints populares)
    const sbPidRand = safebooruGet(selectedTag, 1 + Math.floor(Math.random() * 6));

    fetches.push(
        Promise.all([...sbPid0Promises, sbPidRand])
            .then(results => [...new Set(results.flat())])
    );

    // ── Fase 3: agregar resultados y deduplicar ──────────────────────────────────
    const settled = await Promise.allSettled(fetches);
    const rawUrls = [];
    for (const r of settled) {
        if (r.status === 'fulfilled' && Array.isArray(r.value)) rawUrls.push(...r.value);
    }
    const uniqueUrls = [...new Set(rawUrls.filter(Boolean))];

    // ── Fase 4: anti-repetición LRU en memoria ───────────────────────────────────
    const pool = sfwFilterUrls(endpoint, uniqueUrls);

    if (!pool.length) {
        // Pool vacío — intentar con endpoint de fallback purrbot (solo una vez, evita ciclos)
        const fallbackEp = PURRBOT_MAP[endpoint];
        if (fallbackEp && HMTAI_ENDPOINTS.has(fallbackEp) && fallbackEp !== endpoint) {
            try { return await obtenerGifBuffer(fallbackEp); } catch {}
        }
        throw new Error(`Sin URLs disponibles para "${endpoint}" — todos los proveedores fallaron`);
    }

    // ── Fase 5: selección aleatoria real y descarga ──────────────────────────────
    // Priorizar URLs de GIF/MP4 (animadas) sobre imágenes estáticas en el pool
    const animadas  = pool.filter(u => /\.(gif|mp4|webm)$/i.test(u));
    const candidatos = animadas.length >= 3 ? animadas : pool;
    const shuffled   = [...candidatos].sort(() => Math.random() - 0.5);

    let lastErr;
    for (const url of shuffled.slice(0, 8)) {   // máximo 8 intentos
        try {
            const mp4 = await descargarYConvertir(url, endpoint);
            sfwRecordUrl(endpoint, url);           // registrar SOLO si se descargó bien
            console.log(`[SFW] ✅ "${endpoint}" — pool ${pool.length} URLs, descargado: ${url.slice(-60)}`);
            return { buffer: mp4 };
        } catch (e) {
            lastErr = e;
            console.error(`[SFW] ❌ Fallo descargando "${url.slice(-60)}": ${e.message}`);
        }
    }

    throw new Error(`Descarga fallida para "${endpoint}": ${lastErr?.message}`);
}

// ══════════════════════════════════════════
//  INTERACCIÓN SFW ANIME
// ══════════════════════════════════════════
async function cmdInteraccion(sock, jid, senderJid, accion, mencionados, pushName) {
    const config = SFW_ACCIONES[accion];
    if (!config) return;

    const senderNombre = pushName || senderJid.split('@')[0];
    const elegir = arr => arr[Math.floor(Math.random() * arr.length)];

    let texto;
    if (mencionados && mencionados.length > 0) {
        const destinoNum = mencionados[0].split('@')[0];
        const parteAccion = elegir(config.mencion).replace('@dest', `@${destinoNum}`);
        texto = `${config.emoji} *${senderNombre}* ${parteAccion}`;
    } else {
        texto = `${config.emoji} *${senderNombre}* ${elegir(config.solo)}`;
    }

    try {
        const { buffer } = await obtenerGifBuffer(config.nekos);
        // No forzar mimetype — Baileys lo auto-detecta desde los magic bytes del MP4.
        // Forzarlo explícitamente puede interferir con el upload a los servidores de WhatsApp.
        await sock.sendMessage(jid, {
            video: buffer,
            caption: texto,
            gifPlayback: true,
            mentions: mencionados || []
        });
    } catch (err) {
        // Si no se pudo obtener o convertir el GIF, mandar solo el texto de la acción.
        // Mejor texto limpio que un GIF roto / ícono borroso que no descarga.
        logRequestError('cmdInteraccion', err);
        await sock.sendMessage(jid, {
            text: texto,
            mentions: mencionados || []
        });
    }
}

// ══════════════════════════════════════════
//  NSFW IMAGEN
//  1. xbooru.com   (principal)
//  2. yande.re     (secundario)
//  3. hypnohub.net (terciario)
//  4. konachan.com (cuaternario)
//  5. tbib.org     (quinto)
//  6. pic.re       (fallback aleatorio)
// ══════════════════════════════════════════

const IMG_EXT = /\.(jpg|jpeg|jpe|png|webp|gif)$/i;
const rnd = n => Math.floor(Math.random() * n);

// Tags por categoría para cada API
const XBOORU_TAGS = {
    ass: 'ass', pussy: 'pussy', neko: 'neko', hentai: 'hentai',
    loli: 'flat_chest', blowjob: 'blowjob', paizuri: 'paizuri',
    oral: 'blowjob', cum: 'cum', anal: 'anal', yuri: 'yuri',
    milf: 'milf', ecchi: 'lingerie', ero: 'underwear',
    creampie: 'creampie', trap: 'trap', femdom: 'femdom',
};

const YANDERE_TAGS = {
    ass: 'ass', pussy: 'pussy', neko: 'animal_ears', hentai: 'nude',
    loli: 'flat_chest', blowjob: 'blowjob', paizuri: 'paizuri',
    oral: 'blowjob', cum: 'cum', anal: 'anal', yuri: 'yuri',
    milf: 'nude', ecchi: 'nude', ero: 'nude',
    creampie: 'creampie', trap: 'trap', femdom: 'nude',
};

const HYPNOHUB_TAGS = {
    ass: 'ass', pussy: 'pussy', neko: 'neko', hentai: 'nude',
    loli: 'nude', blowjob: 'paizuri', paizuri: 'paizuri',
    oral: 'paizuri', cum: 'cum', anal: 'anal', yuri: 'yuri',
    milf: 'milf', ecchi: 'nude', ero: 'nude',
    creampie: 'cum', trap: 'trap', femdom: 'femdom',
};

const KONACHAN_TAGS = {
    ass: 'ass', pussy: 'pussy', neko: 'neko', hentai: 'nude',
    loli: 'nude', blowjob: 'blowjob', paizuri: 'paizuri',
    oral: 'blowjob', cum: 'cum', anal: 'anal', yuri: 'yuri',
    milf: 'nude', ecchi: 'nude', ero: 'nude',
    creampie: 'nude', trap: 'trap', femdom: 'nude',
};

// Helper: booru con field file_url (xbooru, hypnohub, konachan)
async function buscarEnBooruFileUrl(baseUrl, tag, nombre) {
    try {
        const pid = rnd(10);
        const res = await axios.get(
            `${baseUrl}&tags=${encodeURIComponent(tag)}&pid=${pid}`,
            { timeout: 15000, headers: HUMAN_HEADERS }
        );
        const posts = Array.isArray(res.data) ? res.data : [];
        const imgs = posts.filter(p => p.file_url && IMG_EXT.test(p.file_url));
        if (imgs.length) return imgs[rnd(imgs.length)].file_url;
    } catch (err) { logRequestError(nombre, err); }
    return null;
}

// Helper: tbib (usa directory + image)
async function buscarEnTbib(tag) {
    try {
        const pid = rnd(10);
        const res = await axios.get(
            `https://tbib.org/index.php?page=dapi&s=post&q=index&json=1&limit=100&tags=${encodeURIComponent(tag)}&pid=${pid}`,
            { timeout: 15000, headers: HUMAN_HEADERS }
        );
        const posts = Array.isArray(res.data) ? res.data : [];
        const imgs = posts.filter(p => p.directory != null && p.image && IMG_EXT.test(p.image));
        if (imgs.length) {
            const p = imgs[rnd(imgs.length)];
            return `https://tbib.org/images/${p.directory}/${p.image}`;
        }
    } catch (err) { logRequestError('tbib', err); }
    return null;
}

// Helper: yande.re (usa file_url)
async function buscarEnYandere(tag) {
    try {
        const page = rnd(10) + 1;
        const res = await axios.get(
            `https://yande.re/post.json?limit=100&tags=${encodeURIComponent(tag)}&page=${page}`,
            { timeout: 15000, headers: HUMAN_HEADERS }
        );
        const posts = Array.isArray(res.data) ? res.data : [];
        const imgs = posts.filter(p => p.file_url && IMG_EXT.test(p.file_url));
        if (imgs.length) return imgs[rnd(imgs.length)].file_url;
    } catch (err) { logRequestError('yande.re', err); }
    return null;
}

async function buscarImagenNsfw(tipo, prefGif = false) {
    // Construir lista de fuentes con sus tags específicos
    const fuentes = [
        { fn: () => buscarEnBooruFileUrl('https://xbooru.com/index.php?page=dapi&s=post&q=index&json=1&limit=100', XBOORU_TAGS[tipo] || tipo, 'xbooru') },
        { fn: () => buscarEnYandere(YANDERE_TAGS[tipo] || 'nude') },
        { fn: () => buscarEnBooruFileUrl('https://hypnohub.net/index.php?page=dapi&s=post&q=index&json=1&limit=100', HYPNOHUB_TAGS[tipo] || 'nude', 'hypnohub') },
        { fn: () => buscarEnBooruFileUrl('https://konachan.com/post.json?limit=100', KONACHAN_TAGS[tipo] || 'nude', 'konachan') },
        { fn: () => buscarEnTbib(XBOORU_TAGS[tipo] || tipo) },
    ];

    // Aleatorizar orden para repartir carga entre APIs y dar más variedad
    const shuffled = fuentes.sort(() => Math.random() - 0.5);

    for (const { fn } of shuffled) {
        const url = await fn();
        if (url) return url;
    }

    // Fallback final: pic.re aleatorio
    try {
        const res = await axios.get('https://pic.re/image.json', { timeout: 10000, headers: HUMAN_HEADERS });
        const raw = res.data?.file_url || res.data?.url || (typeof res.data === 'string' ? res.data : null);
        if (raw) return raw.startsWith('http') ? raw : `https://${raw}`;
    } catch (err) { logRequestError('pic.re', err); }

    return null;
}

async function cmdNsfw(sock, jid, tipo) {
    const endpoint = NSFW_CMDS[tipo];
    if (!endpoint) return;

    // 0. Carpeta local — prioridad sobre APIs externas
    const carpetaLocal = NSFW_IMG_CARPETA[tipo] || endpoint;
    const local = obtenerMediaLocal('nsfw', carpetaLocal);
    if (local) {
        const caption = `🔞 *${tipo.toUpperCase()}*`;
        if (local.isVideo) {
            await sock.sendMessage(jid, { video: local.buffer, caption, gifPlayback: true });
        } else {
            await sock.sendMessage(jid, { image: local.buffer, caption });
        }
        return;
    }

    try {
        const mediaUrl = await buscarImagenNsfw(endpoint, false);
        if (!mediaUrl) {
            await sock.sendMessage(jid, { text: '❌ No pude cargar la imagen. Intenta de nuevo.' });
            return;
        }

        const esVideo = /\.(mp4|webm)$/i.test(mediaUrl);
        if (esVideo) {
            await sock.sendMessage(jid, {
                video: { url: mediaUrl },
                caption: `🔞 *${tipo.toUpperCase()}*`,
                gifPlayback: true
            });
        } else {
            await sock.sendMessage(jid, {
                image: { url: mediaUrl },
                caption: `🔞 *${tipo.toUpperCase()}*`
            });
        }
    } catch (err) {
        logRequestError('cmdNsfw', err);
        await sock.sendMessage(jid, { text: `❌ Error NSFW: ${err.response?.status || err.message}` });
    }
}

// ══════════════════════════════════════════
//  NSFW ACCIÓN + GIF
// ══════════════════════════════════════════
const NSFW_ACCION_GIF = {
    anal:      'anal',
    blowjob:   'blowjob', mamada: 'blowjob', bj: 'blowjob',
    boobjob:   'paizuri',
    cum:       'cum',
    cummouth:  'oral',
    cumshot:   'cum',
    fap:       'hentai',  paja: 'hentai',
    footjob:   'hentai',
    fuck:      'hentai',  coger: 'hentai',
    grabboobs: 'paizuri',
    grope:     'ecchi',
    handjob:   'hentai',
    lickass:   'ass',
    lickdick:  'blowjob',
    lickpussy: 'hentai',
    sixnine:   'hentai',  '69': 'hentai',
    spank:     'ass',     nalgada: 'ass',
    suckboobs: 'paizuri',
    undress:   'ecchi',   encuerar: 'ecchi',
    yuri:      'yuri',    tijeras: 'yuri',
};

async function cmdNsfwAccion(sock, jid, senderJid, accion, mencionados, pushName) {
    const config = NSFW_ACCIONES[accion];
    if (!config) return;
    const senderNombre = pushName || senderJid.split('@')[0];
    const elegir = arr => arr[Math.floor(Math.random() * arr.length)];
    let texto;
    if (mencionados && mencionados.length > 0) {
        const destinoNum = mencionados[0].split('@')[0];
        const parteAccion = elegir(config.mencion).replace('@dest', `@${destinoNum}`);
        texto = `${config.emoji} *${senderNombre}* ${parteAccion} 🔞`;
    } else {
        texto = `${config.emoji} *${senderNombre}* ${elegir(config.solo)} 🔞`;
    }

    // 0. Carpeta local — prioridad sobre APIs externas
    const carpetaAccion = NSFW_ACCION_CARPETA[accion] || accion;
    const localAccion = obtenerMediaLocal('nsfw', carpetaAccion);
    if (localAccion) {
        if (localAccion.isVideo) {
            await sock.sendMessage(jid, {
                video: localAccion.buffer,
                caption: texto,
                gifPlayback: true,
                mimetype: 'video/mp4',
                mentions: mencionados || []
            });
        } else {
            await sock.sendMessage(jid, {
                image: localAccion.buffer,
                caption: texto,
                mentions: mencionados || []
            });
        }
        return;
    }

    const gifTipo = NSFW_ACCION_GIF[accion];
    if (gifTipo) {
        try {
            const mediaUrl = await buscarImagenNsfw(gifTipo, true);
            if (mediaUrl) {
                const esVideo = /\.(mp4|webm)$/i.test(mediaUrl);
                if (esVideo) {
                    // Descargar como buffer para evitar bloqueos por hotlink
                    try {
                        const dominio = new URL(mediaUrl).hostname;
                        const videoRes = await axios.get(mediaUrl, {
                            responseType: 'arraybuffer',
                            timeout: 60000,
                            maxContentLength: 50 * 1024 * 1024,
                            headers: { ...HUMAN_HEADERS, 'Referer': `https://${dominio}/` }
                        });
                        await sock.sendMessage(jid, {
                            video: Buffer.from(videoRes.data),
                            caption: texto,
                            gifPlayback: true,
                            mimetype: 'video/mp4',
                            mentions: mencionados || []
                        });
                    } catch {
                        // Fallback URL
                        await sock.sendMessage(jid, {
                            video: { url: mediaUrl },
                            caption: texto,
                            gifPlayback: true,
                            mentions: mencionados || []
                        });
                    }
                } else {
                    await sock.sendMessage(jid, {
                        image: { url: mediaUrl },
                        caption: texto,
                        mentions: mencionados || []
                    });
                }
                return;
            }
        } catch (err) { logRequestError('cmdNsfwAccion', err); }
    }
    await sock.sendMessage(jid, { text: texto, mentions: mencionados || [] });
}

// ══════════════════════════════════════════
//  WAIFU
// ══════════════════════════════════════════
async function buscarWaifuImagen(tag) {
    let imgUrl = null;

    // 1. Safebooru (siempre SFW, gran base de datos)
    if (!imgUrl) {
        try {
            const pid = Math.floor(Math.random() * 8);
            const res = await axios.get(
                `https://safebooru.org/index.php?page=dapi&s=post&q=index&json=1&limit=100&tags=${encodeBooruTags(tag)}&pid=${pid}`,
                { timeout: 15000, headers: HUMAN_HEADERS }
            );
            const posts = Array.isArray(res.data) ? res.data.filter(p => p.file_url || p.image) : [];
            if (posts.length) {
                const p = posts[Math.floor(Math.random() * posts.length)];
                imgUrl = p.file_url || `https://safebooru.org//images/${p.directory}/${p.image}`;
            }
        } catch (err) { logRequestError('waifu safebooru', err); }
    }

    // 2. Gelbooru rating:general como fallback
    if (!imgUrl) {
        try {
            const pid = Math.floor(Math.random() * 5);
            const res = await axios.get(
                `https://gelbooru.com/index.php?page=dapi&s=post&q=index&json=1&limit=100&tags=${encodeBooruTags(tag + '+rating:general')}&pid=${pid}`,
                { timeout: 15000, headers: HUMAN_HEADERS }
            );
            const posts = parsearPostsGelbooru(res.data);
            if (posts.length) {
                const p = posts[Math.floor(Math.random() * posts.length)];
                imgUrl = p.file_url || p.sample_url;
            }
        } catch (err) { logRequestError('waifu gelbooru', err); }
    }

    // 3. Danbooru rating:general como segundo fallback
    if (!imgUrl) {
        try {
            const tagLimpio = tag.split('+')[0];
            const pid = Math.floor(Math.random() * 5) + 1;
            const res = await axios.get(
                `https://danbooru.donmai.us/posts.json?tags=${encodeBooruTags(tagLimpio + '+rating:g')}&limit=50&page=${pid}`,
                { timeout: 15000, headers: HUMAN_HEADERS }
            );
            const posts = (res.data || []).filter(p => p.file_url && /\.(jpg|jpeg|png|webp)$/i.test(p.file_url));
            if (posts.length) {
                imgUrl = posts[Math.floor(Math.random() * posts.length)].file_url;
            }
        } catch (err) { logRequestError('waifu danbooru', err); }
    }

    return imgUrl;
}

async function cmdWaifu(sock, jid, args) {
    try {
        const nombre = args.join(' ').trim();
        const waifu = nombre ? encontrarWaifu(nombre) : null;

        if (!nombre) {
            let imgUrl = null;
            try {
                const res = await axios.get('https://api.waifu.pics/sfw/waifu', { timeout: 10000 });
                imgUrl = res.data?.url;
            } catch (err) { logRequestError('waifu.pics sfw', err); }
            if (!imgUrl) {
                try {
                    const res = await axios.get('https://nekos.best/api/v2/waifu', { timeout: 10000 });
                    imgUrl = res.data?.results?.[0]?.url;
                } catch (err) { logRequestError('nekos.best waifu', err); }
            }
            if (imgUrl) {
                await sock.sendMessage(jid, {
                    image: { url: imgUrl },
                    caption: `💖 *Waifu random*\n\n_Usa *#waifu [nombre]* para buscar un personaje específico_\nEjemplo: #waifu rem, #waifu nezuko, #waifu miku`
                });
            } else {
                await sock.sendMessage(jid, { text: '❌ No pude obtener una waifu random. Intenta de nuevo.' });
            }
            return;
        }

        // Búsqueda específica
        const tag = waifu ? waifu.tag : nombre.toLowerCase().replace(/\s+/g, '_');
        const displayName = nombre.charAt(0).toUpperCase() + nombre.slice(1);
        const encontrada = waifu ? (waifu.key.charAt(0).toUpperCase() + waifu.key.slice(1)) : displayName;

        let imgUrl = await buscarWaifuImagen(tag);

        // Si encontró waifu en DB pero sin imagen, intenta sin modificar el nombre
        if (!imgUrl && waifu && tag !== nombre.toLowerCase().replace(/\s+/g, '_')) {
            imgUrl = await buscarWaifuImagen(nombre.toLowerCase().replace(/\s+/g, '_'));
        }

        if (imgUrl) {
            const caption = waifu && waifu.key !== nombre.toLowerCase()
                ? `💖 *${encontrada}*\n_¡Aquí está tu waifu!_`
                : `💖 *${displayName}*\n_¡Aquí está tu waifu!_`;
            await sock.sendMessage(jid, { image: { url: imgUrl }, caption });
            return;
        }

        // Fallback: waifu.pics random si no se encontró imagen específica
        let fallbackUrl = null;
        try {
            const res = await axios.get('https://api.waifu.pics/sfw/waifu', { timeout: 10000 });
            fallbackUrl = res.data?.url;
        } catch (err) { logRequestError('waifu fallback', err); }
        if (fallbackUrl) {
            await sock.sendMessage(jid, {
                image: { url: fallbackUrl },
                caption: `🔍 No encontré imagen exacta de *${displayName}*\n💭 Mostrando una waifu aleatoria como alternativa`
            });
        } else {
            await sock.sendMessage(jid, { text: `❌ No encontré imágenes de *${displayName}*. Prueba con: #waifu rem, #waifu miku, #waifu nezuko` });
        }
    } catch (err) {
        logRequestError('cmdWaifu', err);
        await sock.sendMessage(jid, { text: '❌ Error buscando waifu. Intenta de nuevo.' });
    }
}

// ══════════════════════════════════════════
//  BÚSQUEDA EN IMAGEBOARDS NSFW
// ══════════════════════════════════════════

// Helper para normalizar los posts de Gelbooru (varias versiones de API)
function parsearPostsGelbooru(data) {
    if (!data) return [];
    if (Array.isArray(data)) return data;
    if (Array.isArray(data.post)) return data.post;
    if (data['@attributes'] && Array.isArray(data.post)) return data.post;
    return [];
}

async function buscarGelbooru(tags, soloVideo = false) {
    const tagsLimpios = tags.replace(/\s+/g, '_');
    const pid = Math.floor(Math.random() * 5);
    const ratingTag = tagsLimpios.includes('rating:') ? '' : '+rating:explicit';
    const tagsFinal = tagsLimpios + ratingTag;

    const res = await axios.get(
        `https://gelbooru.com/index.php?page=dapi&s=post&q=index&json=1&limit=100&tags=${encodeBooruTags(tagsFinal)}&pid=${pid}`,
        { timeout: 20000, headers: HUMAN_HEADERS }
    );
    let posts = parsearPostsGelbooru(res.data);
    if (!posts.length) throw new Error('Sin resultados en Gelbooru');
    if (soloVideo) {
        posts = posts.filter(p => (p.file_url || '').match(/\.(mp4|webm|gif)$/i));
        if (!posts.length) throw new Error('Sin videos/GIFs en Gelbooru');
        // GIFs primero
        posts.sort((a, b) => /\.gif$/i.test(a.file_url||'') ? -1 : 1);
    } else {
        posts = posts.filter(p => p.file_url && /\.(jpg|jpeg|png|webp|gif)$/i.test(p.file_url));
        if (!posts.length) throw new Error('Sin imágenes en Gelbooru');
    }
    const elegido = posts[Math.floor(Math.random() * posts.length)];
    return elegido.file_url || elegido.sample_url;
}

async function buscarDanbooru(tags, rating = 'e') {
    const tagsLimpios = tags.replace(/\s+/g, '_');
    // Danbooru sin auth solo devuelve contenido general/sensitive
    // Intentamos con rating:s (sensitive) ya que rating:e requiere cuenta
    const pid = Math.floor(Math.random() * 5) + 1;
    const res = await axios.get(
        `https://danbooru.donmai.us/posts.json?tags=${encodeBooruTags(tagsLimpios + '+rating:s')}&limit=50&page=${pid}`,
        { timeout: 20000, headers: HUMAN_HEADERS }
    );
    const posts = (res.data || []).filter(p => p.file_url && /\.(jpg|png|webp|gif|mp4)$/i.test(p.file_url));
    if (!posts.length) throw new Error('Sin resultados en Danbooru');
    return posts[Math.floor(Math.random() * posts.length)].file_url;
}

async function buscarRule34Paheal(tags, soloVideo = false) {
    if (soloVideo) throw new Error('Paheal no devuelve videos desde su API pública');
    const tagsLimpios = String(tags || '').replace(/\+/g, ' ').replace(/rating:\w+/g, '').trim();
    const res = await axios.get(
        `https://rule34.paheal.net/api/danbooru/find_posts?tags=${encodeBooruTags(tagsLimpios)}&limit=50`,
        { timeout: 20000, headers: HUMAN_HEADERS }
    );
    const xml = String(res.data || '');
    const posts = [...xml.matchAll(/<tag\b[^>]*>/gi)]
        .map(m => ({
            url: m[0].match(/\bfile_url=['"]([^'"]+)['"]/)?.[1],
            name: m[0].match(/\bfile_name=['"]([^'"]+)['"]/)?.[1]
        }))
        .filter(p => /\.(jpg|jpeg|png|webp|gif)$/i.test(p.name));
    if (!posts.length) throw new Error('Sin resultados en Rule34 Paheal');
    return posts[Math.floor(Math.random() * posts.length)].url;
}

// Búsqueda en tbib.org (Tropical Booru) — comparte estructura con Gelbooru/Rule34
async function buscarTbib(tags, soloVideo = false) {
    const tagsLimpios = tags.replace(/\s+/g, '_');
    const pid = Math.floor(Math.random() * 25);
    try {
        const res = await axios.get(
            `https://tbib.org/index.php?page=dapi&s=post&q=index&json=1&limit=100&tags=${encodeBooruTags(tagsLimpios)}&pid=${pid}`,
            { timeout: 20000, headers: HUMAN_HEADERS }
        );
        let posts = Array.isArray(res.data) ? res.data : (Array.isArray(res.data?.post) ? res.data.post : []);
        posts = posts
            .map(p => {
                if (p.file_url) return p;
                if (p.directory && p.image) {
                    return { ...p, file_url: `https://tbib.org/images/${p.directory}/${p.image}` };
                }
                return null;
            })
            .filter(Boolean);
        if (!posts.length) throw new Error('tbib sin resultados');
        const filtroVideo = soloVideo
            ? posts.filter(p => /\.(mp4|webm|m3u8)$/i.test(p.file_url))
            : posts.filter(p => /\.(jpg|jpeg|png|webp|gif)$/i.test(p.file_url));
        if (!filtroVideo.length) throw new Error('tbib sin formato pedido');
        const e = filtroVideo[Math.floor(Math.random() * filtroVideo.length)];
        return e.file_url;
    } catch (err) {
        throw new Error(`tbib: ${err.message}`);
    }
}

// ── LRU en memoria para evitar repetir las mismas URLs entre llamadas ─────
const NSFW_LRU = new Map(); // key: tag+modo → array de URLs recientes
const NSFW_LRU_MAX = 80;
function _lruKey(tags, modo) { return `${modo}::${tags}`; }
function _lruRecord(tags, modo, url) {
    if (!url) return;
    const k = _lruKey(tags, modo);
    const arr = NSFW_LRU.get(k) || [];
    arr.push(url);
    if (arr.length > NSFW_LRU_MAX) arr.splice(0, arr.length - NSFW_LRU_MAX);
    NSFW_LRU.set(k, arr);
}
function _lruFiltrar(tags, modo, posts) {
    const k = _lruKey(tags, modo);
    const set = new Set(NSFW_LRU.get(k) || []);
    if (!set.size) return posts;
    const fresh = posts.filter(p => !set.has(p.file_url || p.sample_url));
    // Si quedaron muy pocos tras filtrar, devolver el set completo
    return fresh.length >= 5 ? fresh : posts;
}

async function _xbooruFetch(tagsLimpios, pid) {
    try {
        const res = await axios.get(
            `https://xbooru.com/index.php?page=dapi&s=post&q=index&json=1&limit=100&tags=${encodeBooruTags(tagsLimpios)}&pid=${pid}`,
            { timeout: 15000, headers: HUMAN_HEADERS }
        );
        const arr = Array.isArray(res.data) ? res.data : (Array.isArray(res.data?.post) ? res.data.post : []);
        return arr.map(p => {
            if (p.file_url) return p;
            if (p.directory && p.image) return { ...p, file_url: `https://img.xbooru.com/images/${p.directory}/${p.image}` };
            return p;
        });
    } catch (err) { logRequestError('xbooru', err); return []; }
}

async function _r34Fetch(tagsConcat, pid) {
    try {
        const res = await axios.get(
            `https://api.rule34.xxx/index.php?page=dapi&s=post&q=index&json=1&limit=100&tags=${encodeBooruTags(tagsConcat)}&pid=${pid}`,
            { timeout: 10000, headers: NEXUS_R34_HEADERS }
        );
        const arr = Array.isArray(res.data) ? res.data : (Array.isArray(res.data?.post) ? res.data.post : []);
        return arr;
    } catch (err) { logRequestError('rule34 api', err); return []; }
}

// Verifica el tamaño de un archivo antes de descargarlo (HEAD request)
async function checkFileSize(url, maxMB = 14) {
    try {
        const dominio = new URL(url).hostname;
        const res = await axios.head(url, {
            timeout: 8000,
            headers: { ...HUMAN_HEADERS, 'Referer': `https://${dominio}/` }
        });
        const len = parseInt(res.headers['content-length'] || '0', 10);
        return len === 0 || len <= maxMB * 1024 * 1024;
    } catch { return true; } // si no responde al HEAD, intentar igual
}

// Hypnohub — busca GIFs animados (tienen animat* en tags o extensión .gif)
async function buscarHypnohubVideo(tags) {
    const tagsLimpios = tags.replace(/\s+/g, '_');
    const pid = Math.floor(Math.random() * 5);
    const res = await axios.get(
        `https://hypnohub.net/index.php?page=dapi&s=post&q=index&json=1&limit=100&tags=${encodeBooruTags(tagsLimpios + '+animated')}&pid=${pid}`,
        { timeout: 10000, headers: HUMAN_HEADERS }
    );
    const arr = Array.isArray(res.data) ? res.data : (Array.isArray(res.data?.post) ? res.data.post : []);
    const gifs = arr.filter(p => p.file_url && /\.(gif|mp4|webm)$/i.test(p.file_url));
    if (!gifs.length) throw new Error('hypnohub sin animados');
    return gifs[Math.floor(Math.random() * gifs.length)].file_url;
}

// Yande.re — busca GIFs/videos animados (todas las variantes en paralelo)
async function buscarYandereVideo(tags) {
    const tagsLimpios = tags.replace(/\s+/g, '_');
    const page = Math.floor(Math.random() * 5) + 1;
    const EXT = /\.(gif|mp4|webm)$/i;
    const peticiones = ['+animated_gif', '+animated', ''].map(suffix =>
        axios.get(`https://yande.re/post.json?limit=100&tags=${encodeBooruTags(tagsLimpios + suffix)}&page=${page}`,
            { timeout: 10000, headers: HUMAN_HEADERS })
            .then(r => (r.data || []).filter(p => p.file_url && EXT.test(p.file_url)))
            .catch(() => [])
    );
    const resultados = await Promise.all(peticiones);
    const todos = resultados.flat();
    if (!todos.length) throw new Error('yande.re sin animados para esos tags');
    return todos[Math.floor(Math.random() * todos.length)].file_url;
}

// Konachan — busca GIFs/videos animados (variantes en paralelo)
async function buscarKonachanVideo(tags) {
    const tagsLimpios = tags.replace(/\s+/g, '_');
    const page = Math.floor(Math.random() * 5) + 1;
    const EXT = /\.(gif|mp4|webm)$/i;
    const peticiones = ['+animated', ''].map(suffix =>
        axios.get(`https://konachan.com/post.json?limit=100&tags=${encodeBooruTags(tagsLimpios + suffix)}&page=${page}`,
            { timeout: 10000, headers: HUMAN_HEADERS })
            .then(r => (r.data || []).filter(p => p.file_url && EXT.test(p.file_url)))
            .catch(() => [])
    );
    const resultados = await Promise.all(peticiones);
    const todos = resultados.flat();
    if (!todos.length) throw new Error('konachan sin animados para esos tags');
    return todos[Math.floor(Math.random() * todos.length)].file_url;
}

// rule34video.com — scraping de videos completos (360p con acctoken, máx 14MB)
async function buscarRule34VideoSite(tags, maxMB = 14) {
    const termino = tags.replace(/\+/g, ' ').replace(/_/g, ' ').trim();
    const R34V_HEADERS = { ...HUMAN_HEADERS, 'Referer': 'https://rule34video.com/' };
    // 1. Buscar en la web
    const res = await axios.get(
        `https://rule34video.com/?s=${encodeURIComponent(termino)}&order_by=rating`,
        { timeout: 12000, headers: R34V_HEADERS }
    );
    const html = res.data;
    // 2. Extraer páginas de video individuales (barajadas para variedad)
    const paginasVideo = [...new Set(
        [...html.matchAll(/href="(https:\/\/rule34video\.com\/video\/\d+\/[^"]+)"/g)].map(m => m[1])
    )].sort(() => Math.random() - 0.5);
    if (!paginasVideo.length) throw new Error('rule34video sin resultados');
    // 3. Probar hasta 8 páginas buscando un video ≤ maxMB
    let primerUrl = null;
    for (const paginaUrl of paginasVideo.slice(0, 8)) {
        try {
            const pg = await axios.get(paginaUrl, { timeout: 12000, headers: R34V_HEADERS });
            const match360 = pg.data.match(/https?:\/\/[^\s"']+_360\.mp4\/?\?v-acctoken=[^\s"'&]+/);
            const match480 = pg.data.match(/https?:\/\/[^\s"']+_480p\.mp4\/?\?v-acctoken=[^\s"'&]+/);
            const videoUrl = match360?.[0] || match480?.[0];
            if (!videoUrl) continue;
            if (!primerUrl) primerUrl = videoUrl; // guardar por si todos son grandes
            // Verificar tamaño antes de retornar
            const head = await axios.head(videoUrl, { timeout: 8000, headers: R34V_HEADERS }).catch(() => null);
            const bytes = parseInt(head?.headers?.['content-length'] || '0', 10);
            if (bytes === 0 || bytes <= maxMB * 1024 * 1024) return videoUrl; // cabe o no se sabe el tamaño
        } catch {}
    }
    if (primerUrl) return primerUrl; // ninguno cabía, devolver el primero de todos modos
    throw new Error('rule34video sin URL de video accesible');
}

async function buscarRule34(tags, soloVideo = false, _meta = null) {
    const tagsLimpios = tags.replace(/\s+/g, '_');
    let posts = [];

    if (soloVideo) {
        // Incluir GIFs animados + mp4/webm — los GIFs son mucho más comunes y livianos
        const EXT_ANIM = /\.(mp4|webm|gif)$/i;
        const pidsAnim = [0, 1, 2, 3, pidRandomR34(), pidRandomR34()];
        const pidsRaw  = [0, 1, pidRandomR34(), pidRandomR34()];
        const peticiones = [
            ...pidsAnim.map(p => _r34Fetch(`${tagsLimpios}+animated`, p)),
            ...pidsRaw.map(p => _r34Fetch(`${tagsLimpios}+video`, p)),
            ...pidsRaw.map(p => _r34Fetch(tagsLimpios, p)),
        ];
        const resultados = await Promise.allSettled(peticiones);
        for (const r of resultados) if (r.status === 'fulfilled' && r.value?.length) posts.push(...r.value);

        let videos = posts.filter(p => EXT_ANIM.test(p.file_url || p.sample_url || ''));

        // Deduplicar
        const vistos = new Set();
        videos = videos.filter(p => {
            const key = p.id || p.file_url || p.sample_url;
            if (!key || vistos.has(key)) return false;
            vistos.add(key); return true;
        });

        // GIFs primero (más livianos y compatibles con WhatsApp), luego por score
        videos.sort((a, b) => {
            const aGif = /\.gif$/i.test(a.file_url || '');
            const bGif = /\.gif$/i.test(b.file_url || '');
            if (aGif && !bGif) return -1;
            if (!aGif && bGif) return 1;
            return (Number(b.score) || 0) - (Number(a.score) || 0);
        });

        videos = _lruFiltrar(tagsLimpios, 'video', videos);

        if (videos.length) {
            const pool = videos.slice(0, Math.max(10, Math.floor(videos.length * 0.4)));
            const e = pool[Math.floor(Math.random() * pool.length)];
            const url = e.file_url || e.sample_url;
            _lruRecord(tagsLimpios, 'video', url);
            if (_meta) { _meta.fuente = 'rule34.xxx'; _meta.total = videos.length; _meta.score = Number(e.score) || 0; _meta.esGif = /\.gif$/i.test(url); }
            return url;
        }

        // Fallbacks en PARALELO: rule34video.com + xbooru + yande.re + konachan + hypnohub
        const fallbacksVideo = await Promise.allSettled([
            buscarRule34VideoSite(tagsLimpios).then(u => ({ url: u, fuente: 'rule34video.com' })),
            _xbooruFetch(tagsLimpios, Math.floor(Math.random() * 5))
                .then(xb => {
                    const f = xb.filter(p => EXT_ANIM.test(p.file_url || ''));
                    if (!f.length) throw new Error('xbooru sin animados');
                    f.sort((a, b) => /\.gif$/i.test(a.file_url||'') ? -1 : 1);
                    return { url: f[0].file_url, fuente: 'xbooru.com' };
                }),
            buscarYandereVideo(tagsLimpios).then(u => ({ url: u, fuente: 'yande.re' })),
            buscarKonachanVideo(tagsLimpios).then(u => ({ url: u, fuente: 'konachan.com' })),
            buscarHypnohubVideo(tagsLimpios).then(u => ({ url: u, fuente: 'hypnohub.net' })),
        ]);
        const exitoFallback = fallbacksVideo.find(r => r.status === 'fulfilled' && r.value?.url);
        if (exitoFallback) {
            const { url, fuente } = exitoFallback.value;
            if (_meta) { _meta.fuente = fuente; _meta.esGif = /\.gif$/i.test(url); }
            _lruRecord(tagsLimpios, 'video', url);
            return url;
        }
        throw new Error('Sin videos/GIFs disponibles para esos tags');
    }

    // ── Imágenes: paralelizar páginas para máxima variedad y calidad ─────
    // pid random entre 0 y 50 para máxima variedad (según spec Nexus)
    const pidPool = Array.from({ length: 51 }, (_, i) => i);
    for (let i = pidPool.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [pidPool[i], pidPool[j]] = [pidPool[j], pidPool[i]];
    }
    const pidIntentos = Array.from(new Set([0, pidRandomR34(), ...pidPool.slice(0, 6)])).slice(0, 8);

    const resultados = await Promise.allSettled(pidIntentos.map(p => _r34Fetch(tagsLimpios, p)));
    for (const r of resultados) if (r.status === 'fulfilled' && r.value?.length) posts.push(...r.value);

    // Deduplicar por id/file_url
    const vistos = new Set();
    posts = posts.filter(p => {
        const key = p.id || p.file_url || p.sample_url;
        if (!key || vistos.has(key)) return false;
        vistos.add(key);
        return p.file_url || p.sample_url;
    });

    if (!posts.length) {
        // Imágenes: paheal → xbooru → yande.re → konachan → hypnohub
        try { const u = await buscarRule34Paheal(tagsLimpios, false); _lruRecord(tagsLimpios, 'img', u); if (_meta) _meta.fuente = 'rule34.paheal.net'; return u; }
        catch (err) { logRequestError('rule34 paheal', err); }
        try {
            const xb = await _xbooruFetch(tagsLimpios, Math.floor(Math.random() * 8));
            const xbImg = xb.filter(p => /\.(jpg|jpeg|png|webp|gif)$/i.test(p.file_url || ''));
            if (xbImg.length) {
                const e = xbImg[Math.floor(Math.random() * xbImg.length)];
                _lruRecord(tagsLimpios, 'img', e.file_url);
                if (_meta) _meta.fuente = 'xbooru.com';
                return e.file_url;
            }
        } catch (err) { logRequestError('xbooru img', err); }
        try { const u = await buscarEnYandere(tagsLimpios); if (u) { _lruRecord(tagsLimpios, 'img', u); if (_meta) _meta.fuente = 'yande.re'; return u; } }
        catch (err) { logRequestError('yandere img', err); }
        try { const u = await buscarEnBooruFileUrl(`https://konachan.com/post.json?limit=100`, tagsLimpios, 'konachan'); if (u) { _lruRecord(tagsLimpios, 'img', u); if (_meta) _meta.fuente = 'konachan.com'; return u; } }
        catch (err) { logRequestError('konachan img', err); }
        try { const u = await buscarEnBooruFileUrl(`https://hypnohub.net/index.php?page=dapi&s=post&q=index&json=1&limit=100`, tagsLimpios, 'hypnohub'); if (u) { _lruRecord(tagsLimpios, 'img', u); if (_meta) _meta.fuente = 'hypnohub.net'; return u; } }
        catch (err) { logRequestError('hypnohub img', err); }
        throw new Error('Sin resultados en ninguna fuente');
    }

    let imgs = posts.filter(p => {
        const u = p.file_url || p.sample_url || '';
        return /\.(jpg|jpeg|png|webp|gif)$/i.test(u);
    });
    if (!imgs.length) throw new Error('Sin imágenes válidas');

    // Mejor calidad: ordenar por score (más alto primero) y mezclar el top 60%
    imgs.sort((a, b) => (Number(b.score) || 0) - (Number(a.score) || 0));
    const corte = Math.max(10, Math.floor(imgs.length * 0.6));
    let pool = imgs.slice(0, corte);

    // Filtrar contra cache LRU para no repetir
    pool = _lruFiltrar(tagsLimpios, 'img', pool);

    const elegido = pool[Math.floor(Math.random() * pool.length)];
    const url = elegido.file_url || elegido.sample_url;
    _lruRecord(tagsLimpios, 'img', url);
    if (_meta) { _meta.fuente = 'rule34.xxx'; _meta.total = imgs.length; _meta.score = Number(elegido.score) || 0; }
    return url;
}

async function buscarE621(tags) {
    const tagsLimpios = tags.replace(/\s+/g, '_');
    const page = Math.floor(Math.random() * 5) + 1;
    const res = await axios.get(
        `https://e621.net/posts.json?tags=${encodeBooruTags(tagsLimpios + '+rating:e')}&limit=50&page=${page}`,
        {
            timeout: 20000,
            headers: {
                ...HUMAN_HEADERS,
                'User-Agent': 'NexusBot/1.0 (by Alejx)',
                'Accept': 'application/json'
            }
        }
    );
    const posts = (res.data?.posts || []).filter(p => p.file?.url && /\.(jpg|jpeg|png|webp|gif)$/i.test(p.file.url));
    if (!posts.length) throw new Error('Sin resultados en e621');
    return posts[Math.floor(Math.random() * posts.length)].file.url;
}

async function cmdImageboard(sock, jid, tipo, args, soloVideo = false) {
    const queryRaw = args.join(' ').trim();
    if (!queryRaw) {
        await sock.sendMessage(jid, {
            text: `❌ Uso: *#${tipo} [tags]*\n\n` +
                `💡 Puedes combinar varios tags:\n` +
                `  • *#${tipo} rem lingerie* — waifu + ropa\n` +
                `  • *#${tipo} rubia colegiala desnuda* — en español\n` +
                `  • *#${tipo} miku big_breasts* — inglés\n\n` +
                `🌐 Tags en español disponibles:\n` +
                sugerenciasR34()
        });
        return;
    }

    const esR34 = (tipo === 'rule34' || tipo === 'r34' || tipo === 'rule34video' || tipo === 'r34video');
    const tipoDisplay = tipo.replace('video', ' video').toUpperCase();

    let tags, labelOriginal;

    if (esR34) {
        const parsed = parsearInputR34(queryRaw);
        tags = parsed.tags;
        labelOriginal = parsed.labelOriginal;
        const tagsDisplay = tags.replace(/\+/g, ' + ').replace(/_/g, ' ');
        const traduccionNota = parsed.hayTraduccion ? `\n🔤 _Traducido: ${tagsDisplay}_` : `\n🏷️ _Tags: ${tagsDisplay}_`;
        await sock.sendMessage(jid, { text: `🔥 *Buscando en ${tipoDisplay}...*${traduccionNota}` });
    } else {
        tags = queryRaw.replace(/\s+/g, '_').toLowerCase();
        labelOriginal = queryRaw;
        try {
            const w = encontrarWaifu(queryRaw);
            if (w?.tag) { tags = String(w.tag).toLowerCase(); labelOriginal = w.key || queryRaw; }
        } catch {}
        await sock.sendMessage(jid, { text: `🔍 Buscando en ${tipoDisplay}: *${labelOriginal}* _(tag: ${tags})_...` });
    }

    let url = null;
    const meta = { fuente: null, score: null, total: null };

    // Timeout global de 25s para que nunca se quede colgado
    const _timeout = ms => new Promise((_, rej) => setTimeout(() => rej(new Error('timeout_global')), ms));

    try {
        if (tipo === 'danbooru' || tipo === 'dbooru') {
            try { url = await buscarDanbooru(tags); meta.fuente = 'danbooru.donmai.us'; }
            catch { try { url = await buscarRule34Paheal(tags, soloVideo); meta.fuente = 'rule34.paheal.net'; }
            catch { url = await buscarRule34(tags, soloVideo, meta); } }
        } else if (tipo === 'gelbooru' || tipo === 'gbooru' || tipo === 'booru' || tipo === 'gelboorovideo' || tipo === 'gboorovideo') {
            // Gelbooru está 401 — redirigir a fuentes alternativas
            if (soloVideo) {
                // VIDEO: rule34video.com en paralelo con los boorus
                const EXT_ANIM = /\.(mp4|webm|gif)$/i;
                const resultados = await Promise.allSettled([
                    buscarRule34VideoSite(tags.replace(/\+/g,'_')).then(u => ({ url: u, fuente: 'rule34video.com' })),
                    buscarRule34(tags, true, {}).then(u => ({ url: u, fuente: 'rule34.xxx' })),
                    _xbooruFetch(tags.replace(/\+/g,'_'), Math.floor(Math.random() * 5))
                        .then(xb => {
                            const f = xb.filter(p => EXT_ANIM.test(p.file_url || ''));
                            if (!f.length) throw new Error('xbooru sin animados');
                            return { url: f[Math.floor(Math.random() * f.length)].file_url, fuente: 'xbooru.com' };
                        }),
                    buscarYandereVideo(tags.replace(/\+/g,'_')).then(u => ({ url: u, fuente: 'yande.re' })),
                    buscarKonachanVideo(tags.replace(/\+/g,'_')).then(u => ({ url: u, fuente: 'konachan.com' })),
                ]);
                const ganador = resultados.find(r => r.status === 'fulfilled' && r.value?.url);
                if (ganador) { url = ganador.value.url; meta.fuente = ganador.value.fuente; }
            } else {
                // IMAGEN: xbooru + paheal + rule34
                try {
                    const xb = await _xbooruFetch(tags.replace(/\+/g,'_'), Math.floor(Math.random() * 5));
                    const f = xb.filter(p => /\.(jpg|jpeg|png|webp|gif)$/i.test(p.file_url || ''));
                    if (f.length) { url = f[Math.floor(Math.random() * f.length)].file_url; meta.fuente = 'xbooru.com'; }
                } catch {}
                if (!url) try { url = await buscarRule34Paheal(tags, false); meta.fuente = 'rule34.paheal.net'; } catch {}
                if (!url) try { url = await buscarRule34(tags, false, meta); } catch {}
            }
        } else if (esR34) {
            const primero        = tags.split('+')[0];
            const sinSufijo      = primero.replace(/_\([^)]+\)$/, '');
            const crudo          = queryRaw.toLowerCase().trim().replace(/\s+/g, '_');
            const primeraPalabra = queryRaw.trim().split(/\s+/)[0].toLowerCase();

            if (soloVideo) {
                // VIDEO: todos los candidatos en PARALELO con timeout global de 22s
                const candidatos = [...new Set([tags, primero, sinSufijo, crudo, primeraPalabra].filter(Boolean))];
                const busquedas  = candidatos.map(t => buscarRule34(t, true, {}).catch(() => null));
                const ganador = await Promise.race([
                    Promise.all(busquedas).then(urls => urls.find(u => u)),
                    _timeout(22000)
                ]).catch(() => null);
                if (ganador) {
                    url = ganador;
                    meta.fuente = meta.fuente || 'rule34.xxx';
                }
            } else {
                // IMAGEN: secuencial (más lento pero usa la metadata correcta)
                try { url = await buscarRule34(tags, false, meta); } catch (e1) { logRequestError('r34 principal', e1); }
                if (!url && primero && primero !== tags) {
                    try { url = await buscarRule34(primero, false, meta); } catch (e2) { logRequestError('r34 primer tag', e2); }
                }
                if (!url && sinSufijo && sinSufijo !== primero) {
                    try { url = await buscarRule34(sinSufijo, false, meta); } catch (e3) { logRequestError('r34 sin sufijo', e3); }
                }
                if (!url && crudo !== tags) {
                    try { url = await buscarRule34(crudo, false, meta); } catch (e4) { logRequestError('r34 crudo', e4); }
                }
                if (!url && primeraPalabra && primeraPalabra !== crudo) {
                    try { url = await buscarRule34(primeraPalabra, false, meta); } catch (e5) { logRequestError('r34 primera palabra', e5); }
                }
            }
        } else if (tipo === 'e621') {
            url = await buscarE621(tags);
            meta.fuente = 'e621.net';
        }
    } catch (err) {
        logRequestError('cmdImageboard', err);
    }

    if (!url) {
        const sugerencias = sugerenciasR34();
        const msgVacio = esR34
            ? `❌ *Sin resultados para:* _${queryRaw}_\n\n` +
              `💡 *Consejos:*\n` +
              `• Escribe el nombre exacto: \`miku\`, \`rem\`, \`asuna\`\n` +
              `• Combina tags: \`#r34 rem lingerie big_breasts\`\n` +
              `• Prueba en inglés: \`blonde_hair nude\`, \`school_uniform\`\n\n` +
              `🔤 *Tags en español que puedo traducir:*\n${sugerencias}`
            : `❌ No encontré resultados para: *${tags.replace(/_/g, ' ')}*\n_Intenta con otros tags_`;
        await sock.sendMessage(jid, { text: msgVacio });
        return;
    }

    const tagsLabel = tags.replace(/\+/g, ' · ').replace(/_/g, ' ');
    let label;
    if (esR34) {
        const scoreStr = (meta.score != null && meta.score > 0) ? `  ⭐ ${meta.score}` : '';
        const totalStr = meta.total ? `  📊 ${meta.total} resultados` : '';
        const fuenteStr = meta.fuente ? `\n🌐 _${meta.fuente}_` : '';
        label = `🔞 *${tipoDisplay}* — ${tagsLabel}${scoreStr}${totalStr}${fuenteStr}`;
    } else {
        label = `🔞 *${tipoDisplay}* — ${tagsLabel}`;
    }

    const esGif   = /\.gif$/i.test(url);
    const esVideo = soloVideo || /\.(mp4|webm)$/i.test(url) || (esR34 && meta.esGif === false && soloVideo);
    const esAnimado = esGif || esVideo;

    if (esAnimado) {
        try {
            const dominio = new URL(url).hostname;
            const referer  = `https://${dominio}/`;

            // Verificar tamaño antes de descargar
            const tamanoOk = await checkFileSize(url, 14);
            if (!tamanoOk) throw new Error('archivo_grande');

            const mediaRes = await axios.get(url, {
                responseType: 'arraybuffer',
                timeout: 40000,
                maxContentLength: 14 * 1024 * 1024,
                headers: { ...HUMAN_HEADERS, 'Referer': referer }
            });
            const buf = Buffer.from(mediaRes.data);

            if (esGif) {
                await sock.sendMessage(jid, { video: buf, caption: label, mimetype: 'video/mp4', gifPlayback: true });
            } else {
                await sock.sendMessage(jid, { video: buf, caption: label, mimetype: 'video/mp4' });
            }
        } catch (errMedia) {
            const esPeso = errMedia.message === 'archivo_grande' || errMedia.message?.includes('maxContentLength');
            await sock.sendMessage(jid, {
                text: `🎬 ${label}\n\n🔗 *Enlace directo:*\n${url}\n\n` +
                    (esPeso
                        ? `_El archivo pesa más de 14MB — ábrelo en el navegador._`
                        : `_No se pudo descargar automáticamente — ábrelo en el navegador._`)
            });
        }
    } else {
        await sock.sendMessage(jid, { image: { url }, caption: label });
    }
}

// ══════════════════════════════════════════
//  TOP RANDOM
// ══════════════════════════════════════════
async function cmdTopRandom(sock, jid, groupMetadata, args) {
    if (!groupMetadata) {
        await sock.sendMessage(jid, { text: '❌ Este comando solo funciona en grupos.' });
        return;
    }
    const tema = args.join(' ') || 'los más especiales';
    let participantes = [...(groupMetadata.participants || [])];
    if (participantes.length < 2) {
        await sock.sendMessage(jid, { text: '❌ Se necesitan al menos 2 miembros para crear un top.' });
        return;
    }
    // Fisher-Yates shuffle
    for (let i = participantes.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [participantes[i], participantes[j]] = [participantes[j], participantes[i]];
    }
    const emojis = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'];
    const limit = Math.min(participantes.length, 10);
    const mentions = [];
    let lineas = '';
    for (let i = 0; i < limit; i++) {
        const p = participantes[i];
        lineas += `${emojis[i]} @${p.id.split('@')[0]}\n`;
        mentions.push(p.id);
    }

    const temaDisplay = tema.charAt(0).toUpperCase() + tema.slice(1);
    const texto = `📊 *TOP — ${temaDisplay}*\n${'─'.repeat(24)}\n\n${lineas}\n_¡Generado aleatoriamente!_ 🎲`;
    await sock.sendMessage(jid, { text: texto, mentions });
}

// Filtrar 'kick' del menú SFW — el comando ya está interceptado por el admin kick en handler.js
const TODO_SFW = Object.keys(SFW_ACCIONES).filter(k => k !== 'kick');
const TODO_NSFW_IMG = Object.keys(NSFW_CMDS);
const TODO_NSFW_ACCION = Object.keys(NSFW_ACCIONES);
const TODO_IMAGEBOARDS = ['danbooru', 'dbooru', 'gelbooru', 'gbooru', 'booru', 'rule34', 'r34', 'e621'];
const TODO_IMAGEBOARDS_VIDEO = ['rule34video', 'r34video', 'gelboorovideo', 'gboorovideo'];

// precalentarCacheSfw y precalentarCacheSfwSilente fueron eliminados junto con el
// sistema de caché en disco. El nuevo sistema usa un pool de URLs en paralelo con
// anti-repetición LRU en memoria — no hay nada que precalentar en disco.
async function precalentarCacheSfw(sock, jid) {
    await sock.sendMessage(jid, {
        text: `ℹ️ *Caché SFW*\n\nEl sistema de caché en disco fue reemplazado por un motor de pool en memoria.\nNo es necesario precalentar nada — cada interacción consulta múltiples fuentes en paralelo automáticamente.`
    });
}

async function precalentarCacheSfwSilente() {
    // No-op — el sistema de caché en disco fue eliminado.
}

module.exports = {
    cmdInteraccion, cmdNsfw, cmdNsfwAccion, cmdWaifu, cmdImageboard, cmdTopRandom,
    precalentarCacheSfw, precalentarCacheSfwSilente,
    TODO_SFW, TODO_NSFW_IMG, TODO_NSFW_ACCION, TODO_IMAGEBOARDS, TODO_IMAGEBOARDS_VIDEO,
    R34_TAG_DICT, traducirTagsR34, pidRandomR34, parsearInputR34, sugerenciasR34
};
