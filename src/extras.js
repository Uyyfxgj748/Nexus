const { getUsuario, guardarUsuario, cargarUsuarios, getGrupo } = require('./database');
const botState = require('./botState');
const fs = require('fs-extra');
const path = require('path');

const EVENT_PATH = path.join(__dirname, '../data/evento_activo.json');
const LOOT_PATH = path.join(__dirname, '../data/loot_activo.json');

// ══════════════════════════════════════════
//  AFK
// ══════════════════════════════════════════
const FRASES_AFK = [
    'ha entrado en modo zen 🧘',
    'se ausentó del mundo digital 🌙',
    'fue a cargar energías ⚡',
    'está en otro plano de existencia ✨',
    'desapareció en el vacío 🌌',
    'tomó un descanso merecido 💤',
    'se fue a buscar señal wifi 📡',
    'entró en modo hibernación 🐻',
    'salió a tomar aire fresco 🍃',
    'está ocupado siendo productivo (o eso dice) 📚',
];

const FRASES_VUELTA = [
    '¡ha regresado de su aventura!',
    'volvió del reino de los ausentes.',
    '¡de vuelta en la realidad!',
    'regresó cargado de energía.',
    'ha vuelto del más allá.',
    'retornó a la civilización.',
    '¡sobrevivió a su ausencia!',
];

async function cmdAfk(sock, jid, senderJid, args, pushName) {
    const u = getUsuario(senderJid);
    const mensaje = args.join(' ').trim() || 'sin razón especificada';
    u.afk = { activo: true, mensaje, desde: Date.now() };
    guardarUsuario(senderJid, u);
    const nombre = pushName || senderJid.split('@')[0];
    const frase = FRASES_AFK[Math.floor(Math.random() * FRASES_AFK.length)];
    await sock.sendMessage(jid, {
        text: `💤 *${nombre}* ${frase}\n\n📝 _"${mensaje}"_`
    });
}

async function verificarAfk(sock, jid, senderJid, pushName, texto) {
    const u = getUsuario(senderJid);
    if (u.afk?.activo) {
        u.afk.activo = false;
        const elapsed = Date.now() - (u.afk.desde || Date.now());
        const mins = Math.floor(elapsed / 60000);
        const hours = Math.floor(mins / 60);
        const tiempoStr = hours > 0 ? `${hours}h ${mins % 60}m` : `${mins}m`;
        guardarUsuario(senderJid, u);
        const frase = FRASES_VUELTA[Math.floor(Math.random() * FRASES_VUELTA.length)];
        await sock.sendMessage(jid, {
            text: `🌟 *${pushName || senderJid.split('@')[0]}* ${frase}\n⏱️ _Estuvo ausente ${tiempoStr}_`
        });
    }
}

async function notificarAfk(sock, jid, mencionados) {
    if (!mencionados?.length) return;
    for (const uid of mencionados) {
        const u = getUsuario(uid);
        if (u.afk?.activo) {
            const elapsed = Date.now() - (u.afk.desde || Date.now());
            const mins = Math.floor(elapsed / 60000);
            const tiempoStr = mins > 60 ? `${Math.floor(mins / 60)}h ${mins % 60}m` : `${mins}m`;
            await sock.sendMessage(jid, {
                text: `💤 *@${uid.split('@')[0]}* está AFK hace *${tiempoStr}*.\n📝 _"${u.afk.mensaje}"_`,
                mentions: [uid]
            });
        }
    }
}

// ══════════════════════════════════════════
//  MASCOTAS — 100 ESPECIES CON RAREZA
// ══════════════════════════════════════════
const RAREZA = {
    comun:      { nombre: 'Común',       color: '⬜', prob: 50 },
    poco_comun: { nombre: 'Poco común',  color: '🟩', prob: 25 },
    raro:       { nombre: 'Raro',        color: '🟦', prob: 15 },
    epico:      { nombre: 'Épico',       color: '🟪', prob: 8  },
    legendario: { nombre: 'Legendario',  color: '🟨', prob: 2  },
};

const TIPOS_MASCOTAS = [
    // ── Común (50%) ─────────────────────────────────────────────────────────
    { nombre: 'Gatito',          emoji: '🐱', rareza: 'comun'      },
    { nombre: 'Perrito',         emoji: '🐶', rareza: 'comun'      },
    { nombre: 'Conejo',          emoji: '🐰', rareza: 'comun'      },
    { nombre: 'Pollito',         emoji: '🐤', rareza: 'comun'      },
    { nombre: 'Hamster',         emoji: '🐹', rareza: 'comun'      },
    { nombre: 'Pez dorado',      emoji: '🐠', rareza: 'comun'      },
    { nombre: 'Tortuga',         emoji: '🐢', rareza: 'comun'      },
    { nombre: 'Paloma',          emoji: '🕊️',  rareza: 'comun'      },
    { nombre: 'Ratón',           emoji: '🐭', rareza: 'comun'      },
    { nombre: 'Lagarto',         emoji: '🦎', rareza: 'comun'      },
    { nombre: 'Pato',            emoji: '🦆', rareza: 'comun'      },
    { nombre: 'Gallina',         emoji: '🐔', rareza: 'comun'      },
    { nombre: 'Cerdo',           emoji: '🐷', rareza: 'comun'      },
    { nombre: 'Vaca',            emoji: '🐮', rareza: 'comun'      },
    { nombre: 'Oveja',           emoji: '🐑', rareza: 'comun'      },
    { nombre: 'Cabra',           emoji: '🐐', rareza: 'comun'      },
    { nombre: 'Pájaro',          emoji: '🐦', rareza: 'comun'      },
    { nombre: 'Mariposa',        emoji: '🦋', rareza: 'comun'      },
    { nombre: 'Caracol',         emoji: '🐌', rareza: 'comun'      },
    { nombre: 'Cangrejo',        emoji: '🦀', rareza: 'comun'      },
    { nombre: 'Rana',            emoji: '🐸', rareza: 'comun'      },
    { nombre: 'Insecto',         emoji: '🪲', rareza: 'comun'      },
    { nombre: 'Lombriz',         emoji: '🪱', rareza: 'comun'      },
    { nombre: 'Abeja',           emoji: '🐝', rareza: 'comun'      },
    { nombre: 'Araña',           emoji: '🕷️',  rareza: 'comun'      },
    // ── Poco Común (25%) ────────────────────────────────────────────────────
    { nombre: 'Zorro',           emoji: '🦊', rareza: 'poco_comun' },
    { nombre: 'Panda',           emoji: '🐼', rareza: 'poco_comun' },
    { nombre: 'Pingüino',        emoji: '🐧', rareza: 'poco_comun' },
    { nombre: 'Lobo',            emoji: '🐺', rareza: 'poco_comun' },
    { nombre: 'Ciervo',          emoji: '🦌', rareza: 'poco_comun' },
    { nombre: 'Mono',            emoji: '🐒', rareza: 'poco_comun' },
    { nombre: 'Caballo',         emoji: '🐴', rareza: 'poco_comun' },
    { nombre: 'Tigre',           emoji: '🐯', rareza: 'poco_comun' },
    { nombre: 'León',            emoji: '🦁', rareza: 'poco_comun' },
    { nombre: 'Elefante',        emoji: '🐘', rareza: 'poco_comun' },
    { nombre: 'Delfín',          emoji: '🐬', rareza: 'poco_comun' },
    { nombre: 'Koala',           emoji: '🐨', rareza: 'poco_comun' },
    { nombre: 'Camello',         emoji: '🐫', rareza: 'poco_comun' },
    { nombre: 'Mapache',         emoji: '🦝', rareza: 'poco_comun' },
    { nombre: 'Nutria',          emoji: '🦦', rareza: 'poco_comun' },
    { nombre: 'Erizo',           emoji: '🦔', rareza: 'poco_comun' },
    { nombre: 'Murciélago',      emoji: '🦇', rareza: 'poco_comun' },
    { nombre: 'Canguro',         emoji: '🦘', rareza: 'poco_comun' },
    { nombre: 'Oso polar',       emoji: '🐻‍❄️', rareza: 'poco_comun' },
    { nombre: 'Búho',            emoji: '🦉', rareza: 'poco_comun' },
    { nombre: 'Flamenco',        emoji: '🦩', rareza: 'poco_comun' },
    { nombre: 'Loro',            emoji: '🦜', rareza: 'poco_comun' },
    { nombre: 'Cocodrilo',       emoji: '🐊', rareza: 'poco_comun' },
    { nombre: 'Hipopótamo',      emoji: '🦛', rareza: 'poco_comun' },
    { nombre: 'Rinoceronte',     emoji: '🦏', rareza: 'poco_comun' },
    // ── Raro (15%) ──────────────────────────────────────────────────────────
    { nombre: 'Gato negro',      emoji: '🐈‍⬛', rareza: 'raro'       },
    { nombre: 'Oso grizzly',     emoji: '🐻', rareza: 'raro'       },
    { nombre: 'Gorila',          emoji: '🦍', rareza: 'raro'       },
    { nombre: 'Orangután',       emoji: '🦧', rareza: 'raro'       },
    { nombre: 'Tiburón',         emoji: '🦈', rareza: 'raro'       },
    { nombre: 'Pulpo',           emoji: '🐙', rareza: 'raro'       },
    { nombre: 'Ballena',         emoji: '🐳', rareza: 'raro'       },
    { nombre: 'Calamar',         emoji: '🦑', rareza: 'raro'       },
    { nombre: 'Caballo de mar',  emoji: '🦭', rareza: 'raro'       },
    { nombre: 'Águila',          emoji: '🦅', rareza: 'raro'       },
    { nombre: 'Pavo real',       emoji: '🦚', rareza: 'raro'       },
    { nombre: 'Gato siamés',     emoji: '🐈', rareza: 'raro'       },
    { nombre: 'Tortuga marina',  emoji: '🐢', rareza: 'raro'       },
    { nombre: 'Anaconda',        emoji: '🐍', rareza: 'raro'       },
    { nombre: 'Leopardo',        emoji: '🐆', rareza: 'raro'       },
    // ── Épico (8%) ──────────────────────────────────────────────────────────
    { nombre: 'Dragón de Komodo',emoji: '🦎', rareza: 'epico'      },
    { nombre: 'Pantera negra',   emoji: '🐈‍⬛', rareza: 'epico'      },
    { nombre: 'Lince',           emoji: '🐱', rareza: 'epico'      },
    { nombre: 'Lobo ártico',     emoji: '🐺', rareza: 'epico'      },
    { nombre: 'Caballo alado',   emoji: '🦄', rareza: 'epico'      },
    { nombre: 'Jaguar',          emoji: '🐆', rareza: 'epico'      },
    { nombre: 'Cóndor',          emoji: '🦅', rareza: 'epico'      },
    { nombre: 'Fénix bebé',      emoji: '🔥', rareza: 'epico'      },
    { nombre: 'Kirin',           emoji: '🦄', rareza: 'epico'      },
    { nombre: 'Manticora',       emoji: '🦁', rareza: 'epico'      },
    // ── Legendario (2%) ─────────────────────────────────────────────────────
    { nombre: 'Dragón',          emoji: '🐲', rareza: 'legendario' },
    { nombre: 'Fénix',           emoji: '🦅', rareza: 'legendario' },
    { nombre: 'Unicornio',       emoji: '🦄', rareza: 'legendario' },
    { nombre: 'Kraken',          emoji: '🐙', rareza: 'legendario' },
    { nombre: 'Basilisco',       emoji: '🐍', rareza: 'legendario' },
    { nombre: 'Behemoth',        emoji: '🐘', rareza: 'legendario' },
    { nombre: 'Leviatán',        emoji: '🐋', rareza: 'legendario' },
    { nombre: 'Dragón de sombra',emoji: '🐉', rareza: 'legendario' },
    { nombre: 'Simurgh',         emoji: '🦅', rareza: 'legendario' },
    { nombre: 'Celestial',       emoji: '⭐', rareza: 'legendario' },
];

function obtenerMascotaAleatoria() {
    // Ruleta ponderada por rareza
    const rand = Math.random() * 100;
    let acum = 0;
    let rarezaSeleccionada;
    for (const [key, val] of Object.entries(RAREZA)) {
        acum += val.prob;
        if (rand < acum) { rarezaSeleccionada = key; break; }
    }
    const pool = TIPOS_MASCOTAS.filter(m => m.rareza === rarezaSeleccionada);
    return pool[Math.floor(Math.random() * pool.length)];
}

const COOLDOWN_ADOPTAR = 60 * 60 * 1000; // 1 hora

// ── Pokémon: rareza basada en clasificación oficial ─────────────────────────
const POKEMON_LEGENDARIOS = [144,145,146,150,243,244,245,249,250,377,378,379,380,381,382,383,384,480,481,482,483,484,485,486,487,488,638,639,640,641,642,643,644,645,646,716,717,718,772,773,785,786,787,788,789,790,791,792,800,888,889,890,891,892,894,895,896,897,898,1001,1002,1003,1004,1007,1008,1014,1015,1016,1017];
const POKEMON_MITICOS = [151,251,385,386,489,490,491,492,493,494,647,648,649,719,720,721,801,802,807,808,809,893];

async function _fetchPokemonAleatorio() {
    // Pesos por rareza (mantienen escala anterior aproximada)
    const r = Math.random() * 100;
    let pool;
    if (r < 5) pool = POKEMON_LEGENDARIOS;
    else if (r < 15) pool = POKEMON_MITICOS;
    else pool = null; // cualquiera

    let id;
    if (pool) {
        id = pool[Math.floor(Math.random() * pool.length)];
    } else {
        id = 1 + Math.floor(Math.random() * 898);
    }

    const resp = await fetch(`https://pokeapi.co/api/v2/pokemon/${id}`);
    if (!resp.ok) throw new Error(`PokeAPI error ${resp.status}`);
    const data = await resp.json();
    const sprite = data.sprites?.other?.['official-artwork']?.front_default
        || data.sprites?.other?.['home']?.front_default
        || data.sprites?.front_default;
    return {
        id: data.id,
        nombre: data.name,
        tipos: (data.types || []).map(t => t.type.name),
        sprite,
        legendario: POKEMON_LEGENDARIOS.includes(data.id),
        mitico: POKEMON_MITICOS.includes(data.id)
    };
}

async function cmdAdoptar(sock, jid, senderJid, args) {
    const u = getUsuario(senderJid);
    if (u.mascota) {
        await sock.sendMessage(jid, {
            text: `❌ Ya tienes un Pokémon: *${u.mascota.emoji} ${u.mascota.nombre}* (${u.mascota.rareza})\nUsa *#petinfo* para verlo o *#changepet* para cambiarlo (800 coins).`
        });
        return;
    }
    if (u.ultimoAdoptar && Date.now() - u.ultimoAdoptar < COOLDOWN_ADOPTAR) {
        const min = Math.ceil((COOLDOWN_ADOPTAR - (Date.now() - u.ultimoAdoptar)) / 60000);
        await sock.sendMessage(jid, { text: `⏳ Debes esperar *${min} minuto(s)* antes de adoptar otro Pokémon.` });
        return;
    }
    const costo = 800;
    if ((u.monedas || 0) < costo) {
        await sock.sendMessage(jid, { text: `❌ Adoptar un Pokémon cuesta *${costo} ⓃNexCoins*. Tienes *${u.monedas || 0}*.` });
        return;
    }

    let poke;
    try {
        poke = await _fetchPokemonAleatorio();
    } catch (e) {
        await sock.sendMessage(jid, { text: `❌ No pude conectar con la Pokédex: ${e.message}` });
        return;
    }

    // Determinar rareza visual
    let rarezaKey, rarInfo;
    if (poke.mitico) { rarezaKey = 'legendario'; rarInfo = { color: '🟡', nombre: 'Mítico ✨' }; }
    else if (poke.legendario) { rarezaKey = 'legendario'; rarInfo = RAREZA.legendario; }
    else if (poke.id <= 151) { rarezaKey = 'epico'; rarInfo = RAREZA.epico; }
    else if (poke.id <= 386) { rarezaKey = 'raro'; rarInfo = RAREZA.raro; }
    else if (poke.id <= 649) { rarezaKey = 'comun'; rarInfo = RAREZA.comun; }
    else { rarezaKey = 'comun'; rarInfo = RAREZA.comun; }

    const nombreInput = args.join(' ').trim();
    const nombreCapitalizado = poke.nombre.charAt(0).toUpperCase() + poke.nombre.slice(1);
    const nombreMascota = nombreInput || nombreCapitalizado;
    u.monedas -= costo;
    u.ultimoAdoptar = Date.now();
    u.mascota = {
        nombre: nombreMascota,
        especie: nombreCapitalizado,
        especiePokeId: poke.id,
        tipos: poke.tipos,
        rareza: rarInfo.nombre,
        rarezaColor: rarInfo.color,
        emoji: '⚡',
        sprite: poke.sprite,
        nivel: 1,
        exp: 0,
        felicidad: 100,
        hambre: 100,
        ultimoAlimento: Date.now(),
        ultimoJuego: Date.now()
    };
    guardarUsuario(senderJid, u);

    const tiposTxt = poke.tipos.join(' / ');
    const caption =
`⚡ *¡Adoptaste un Pokémon!*

${rarInfo.color} Rareza: *${rarInfo.nombre}*
🐾 Especie: *${nombreCapitalizado}* (#${poke.id})
🎨 Tipo(s): *${tiposTxt}*
✏️ Apodo: *${nombreMascota}*
⭐ Nivel: *1*

_Usa *#petfeed* para alimentarlo, *#petplay* para jugar y *#petinfo* para ver sus stats._`;

    if (poke.sprite) {
        try {
            const r = await fetch(poke.sprite);
            const buf = Buffer.from(await r.arrayBuffer());
            await sock.sendMessage(jid, { image: buf, caption });
            return;
        } catch {}
    }
    await sock.sendMessage(jid, { text: caption });
}

async function cmdPetInfo(sock, jid, senderJid) {
    const u = getUsuario(senderJid);
    if (!u.mascota) {
        await sock.sendMessage(jid, { text: '❌ No tienes Pokémon. Adopta uno con *#adoptpokemon [apodo]* o *#adoptp*' });
        return;
    }
    const m = u.mascota;
    const horasSinAlimento = (Date.now() - m.ultimoAlimento) / 3600000;
    const hambre = Math.max(0, Math.round((m.hambre || 100) - horasSinAlimento * 5));
    const felicidad = Math.max(0, Math.round((m.felicidad || 100) - horasSinAlimento * 3));
    m.hambre = hambre;
    m.felicidad = felicidad;
    guardarUsuario(senderJid, u);

    const xpNext = m.nivel * 100;
    const barHam = '█'.repeat(Math.round(hambre / 10)) + '░'.repeat(10 - Math.round(hambre / 10));
    const barFel = '█'.repeat(Math.round(felicidad / 10)) + '░'.repeat(10 - Math.round(felicidad / 10));
    const rarColor = m.rarezaColor || '⬜';
    const tiposTxt = (m.tipos && m.tipos.length) ? `\n🎨 Tipo(s): *${m.tipos.join(' / ')}*` : '';
    const idTxt = m.especiePokeId ? ` (#${m.especiePokeId})` : '';

    const caption =
`${m.emoji} *${m.nombre}* — @${senderJid.split('@')[0]}
${rarColor} Rareza: *${m.rareza || 'Común'}* | Especie: *${m.especie || m.emoji}*${idTxt}${tiposTxt}

⭐ Nivel: *${m.nivel}* (${m.exp}/${xpNext} XP)
🍖 Hambre:    [${barHam}] ${hambre}%
😊 Felicidad: [${barFel}] ${felicidad}%

_Alimenta con *#petfeed* · Juega con *#petplay*_`;

    if (m.sprite) {
        try {
            const r = await fetch(m.sprite);
            const buf = Buffer.from(await r.arrayBuffer());
            await sock.sendMessage(jid, { image: buf, caption, mentions: [senderJid] });
            return;
        } catch {}
    }
    await sock.sendMessage(jid, { text: caption, mentions: [senderJid] });
}

async function cmdPetFeed(sock, jid, senderJid) {
    const u = getUsuario(senderJid);
    if (!u.mascota) {
        await sock.sendMessage(jid, { text: '❌ No tienes mascota.' });
        return;
    }
    const costo = 30;
    if ((u.monedas || 0) < costo) {
        await sock.sendMessage(jid, { text: `❌ Alimentar cuesta *${costo} ⓃNexCoins*.` });
        return;
    }
    const ahora = Date.now();
    const cooldown = 30 * 60 * 1000;
    if (u.mascota.ultimoAlimento && ahora - u.mascota.ultimoAlimento < cooldown) {
        const m = Math.ceil((cooldown - (ahora - u.mascota.ultimoAlimento)) / 60000);
        await sock.sendMessage(jid, { text: `⏳ Tu mascota no tiene hambre todavía. Aliméntala en *${m} minutos*.` });
        return;
    }
    u.monedas -= costo;
    u.mascota.hambre = Math.min(100, (u.mascota.hambre || 0) + 30);
    u.mascota.exp = (u.mascota.exp || 0) + 10;
    u.mascota.ultimoAlimento = ahora;
    if (u.mascota.exp >= u.mascota.nivel * 100) {
        u.mascota.exp -= u.mascota.nivel * 100;
        u.mascota.nivel++;
        guardarUsuario(senderJid, u);
        await sock.sendMessage(jid, {
            text: `${u.mascota.emoji} *¡${u.mascota.nombre}* subió al nivel *${u.mascota.nivel}!* 🎉\n🍖 +30% hambre | 🏅 ¡Nivel arriba!`
        });
    } else {
        guardarUsuario(senderJid, u);
        await sock.sendMessage(jid, {
            text: `🍖 Alimentaste a *${u.mascota.nombre}* (−${costo} ⓃNC)\n📊 Hambre: *${u.mascota.hambre}%* | XP: *${u.mascota.exp}/${u.mascota.nivel * 100}*`
        });
    }
}

async function cmdPetPlay(sock, jid, senderJid) {
    const u = getUsuario(senderJid);
    if (!u.mascota) {
        await sock.sendMessage(jid, { text: '❌ No tienes mascota.' });
        return;
    }
    const ahora = Date.now();
    const cooldown = 60 * 60 * 1000;
    if (u.mascota.ultimoJuego && ahora - u.mascota.ultimoJuego < cooldown) {
        const m = Math.ceil((cooldown - (ahora - u.mascota.ultimoJuego)) / 60000);
        await sock.sendMessage(jid, { text: `⏳ Tu mascota está cansada. Vuelve en *${m} minutos*.` });
        return;
    }
    u.mascota.felicidad = Math.min(100, (u.mascota.felicidad || 0) + 25);
    u.mascota.exp = (u.mascota.exp || 0) + 15;
    u.mascota.ultimoJuego = ahora;
    const msgs = [
        `¡${u.mascota.nombre} se divirtió mucho jugando! 🎾`,
        `${u.mascota.nombre} corrió por todos lados y está feliz. 🏃`,
        `¡Jugaste con ${u.mascota.nombre} hasta que se cansó! 😄`,
        `${u.mascota.nombre} te mordisqueó de cariño mientras jugaban. 💕`,
    ];
    if (u.mascota.exp >= u.mascota.nivel * 100) {
        u.mascota.exp -= u.mascota.nivel * 100;
        u.mascota.nivel++;
        guardarUsuario(senderJid, u);
        await sock.sendMessage(jid, {
            text: `${u.mascota.emoji} *¡Nivel arriba!* 🎉 ${u.mascota.nombre} → Nv.*${u.mascota.nivel}*\n😊 +25% felicidad | +15 XP`
        });
    } else {
        guardarUsuario(senderJid, u);
        await sock.sendMessage(jid, {
            text: `🎮 ${msgs[Math.floor(Math.random() * msgs.length)]}\n😊 Felicidad: *${u.mascota.felicidad}%* | XP: *${u.mascota.exp}/${u.mascota.nivel * 100}*`
        });
    }
}

async function cmdCambiarMascota(sock, jid, senderJid, args) {
    const u = getUsuario(senderJid);
    const costo = 800;
    if ((u.monedas || 0) < costo) {
        await sock.sendMessage(jid, { text: `❌ Cambiar de Pokémon cuesta *${costo} ⓃNexCoins*. Tienes *${u.monedas || 0}*.` });
        return;
    }

    let poke;
    try {
        poke = await _fetchPokemonAleatorio();
    } catch (e) {
        await sock.sendMessage(jid, { text: `❌ No pude conectar con la Pokédex: ${e.message}` });
        return;
    }

    let rarInfo;
    if (poke.mitico) rarInfo = { color: '🟡', nombre: 'Mítico ✨' };
    else if (poke.legendario) rarInfo = RAREZA.legendario;
    else if (poke.id <= 151) rarInfo = RAREZA.epico;
    else if (poke.id <= 386) rarInfo = RAREZA.raro;
    else rarInfo = RAREZA.comun;

    const nombreInput = args.join(' ').trim();
    const nombreCapitalizado = poke.nombre.charAt(0).toUpperCase() + poke.nombre.slice(1);
    const nombreMascota = nombreInput || nombreCapitalizado;
    const anteriorNombre = u.mascota?.nombre || '???';
    u.monedas -= costo;
    u.ultimoAdoptar = Date.now();
    u.mascota = {
        nombre: nombreMascota,
        especie: nombreCapitalizado,
        especiePokeId: poke.id,
        tipos: poke.tipos,
        rareza: rarInfo.nombre,
        rarezaColor: rarInfo.color,
        emoji: '⚡',
        sprite: poke.sprite,
        nivel: 1,
        exp: 0,
        felicidad: 100,
        hambre: 100,
        ultimoAlimento: Date.now(),
        ultimoJuego: Date.now()
    };
    guardarUsuario(senderJid, u);
    const tiposTxt = poke.tipos.join(' / ');
    const caption =
`🔄 *Cambiaste tu Pokémon*

❌ Anterior: *${anteriorNombre}*
⚡ Nuevo: *${nombreMascota}* (${nombreCapitalizado} #${poke.id})
🎨 Tipo(s): *${tiposTxt}*
${rarInfo.color} Rareza: *${rarInfo.nombre}*

_¡Cuida bien a tu nuevo compañero!_`;

    if (poke.sprite) {
        try {
            const r = await fetch(poke.sprite);
            const buf = Buffer.from(await r.arrayBuffer());
            await sock.sendMessage(jid, { image: buf, caption });
            return;
        } catch {}
    }
    await sock.sendMessage(jid, { text: caption });
}

async function cmdAbandonarMascota(sock, jid, senderJid) {
    const u = getUsuario(senderJid);
    if (!u.mascota) {
        await sock.sendMessage(jid, { text: '❌ No tienes mascota para abandonar.' });
        return;
    }
    const nombre = u.mascota.nombre;
    const emoji = u.mascota.emoji;
    u.mascota = null;
    u.ultimoAdoptar = Date.now(); // cooldown antes de poder adoptar de nuevo
    guardarUsuario(senderJid, u);
    await sock.sendMessage(jid, {
        text: `💔 *${emoji} ${nombre}* fue liberado/a...\n\n_Espera 1 hora para adoptar una nueva mascota._`
    });
}

// ══════════════════════════════════════════
//  HACK (troll)
// ══════════════════════════════════════════
async function cmdHack(sock, jid, senderJid, mencionados, pushName) {
    const objetivo = mencionados?.length ? mencionados[0] : null;
    const nombre = pushName || senderJid.split('@')[0];
    const victima = objetivo ? `@${objetivo.split('@')[0]}` : 'alguien del grupo';
    const fases = [
        `💻 *${nombre}* inició un ataque...\n🔍 Escaneando IP de ${victima}...`,
        `⚡ *${nombre}* encontró vulnerabilidades...\n🔓 Intentando acceso remoto...`,
        `✅ *${nombre}* hackeó a ${victima} exitosamente! 🎉\n\n💡 _Contraseña: 1234_\n📧 _Email: usuario@example.com_\n🔐 _Tarjeta: **** **** **** 4242_\n\n😂 _¡Es broma! Nadie fue hackeado._`
    ];
    for (const fase of fases) {
        await sock.sendMessage(jid, { text: fase, mentions: objetivo ? [objetivo] : [] });
        await new Promise(r => setTimeout(r, 1500));
    }
}

// ══════════════════════════════════════════
//  RANK GLOBAL
// ══════════════════════════════════════════
async function cmdRankGlobal(sock, jid, pagina = 1) {
    const { paginar, piePagina, emblema } = require('./paginator');
    const db = cargarUsuarios();
    const lista = Object.entries(db)
        .filter(([k]) => k.includes('@') && !k.endsWith('@g.us'))
        .map(([ujid, u]) => ({ jid: ujid, nivel: u.nivel || 1, exp: u.experiencia || 0 }))
        .sort((a, b) => b.nivel !== a.nivel ? b.nivel - a.nivel : b.exp - a.exp);
    const { items: todos, pag, totalPags, inicio } = paginar(lista, pagina, 10);
    let texto = '🌍 *Ranking Global — Niveles*\n' + '─'.repeat(24) + '\n\n';
    todos.forEach((u, i) => {
        texto += `${emblema(inicio + i)} @${u.jid.split('@')[0]} — Nv.*${u.nivel}*\n`;
    });
    texto += piePagina(pag, totalPags, 'rankglobal');
    const mentions = todos.map(u => u.jid);
    await sock.sendMessage(jid, { text: texto, mentions });
}

// ══════════════════════════════════════════
//  EVENTOS
// ══════════════════════════════════════════

const EVENTOS_CATALOGO = [
    {
        tipo: 'hora_dorada',
        nombre: '⭐ Hora Dorada',
        descripcion: '💰 Las recompensas de *#daily* y *#work* dan ×1.5 durante este evento. ¡Aprovecha ahora!',
        duracion: 60,
        emoji: '⭐'
    },
    {
        tipo: 'lluvia_coins',
        nombre: '🌧️ Lluvia de Coins',
        descripcion: '💸 *#daily* da el TRIPLE de monedas. ¡Reclama ya antes de que pare!',
        duracion: 45,
        emoji: '🌧️'
    },
    {
        tipo: 'trabajo_extra',
        nombre: '💼 Jornada Extra',
        descripcion: '💼 *#work* paga el DOBLE hoy. ¡Todos a trabajar, no hay tiempo que perder!',
        duracion: 90,
        emoji: '💼'
    },
    {
        tipo: 'caos_criminal',
        nombre: '🦹 Caos Criminal',
        descripcion: '🦹 La policía está distraída. *#crime* tiene +25% más de probabilidad de éxito.',
        duracion: 60,
        emoji: '🦹'
    },
    {
        tipo: 'redada',
        nombre: '🚔 Redada Policial',
        descripcion: '🚔 ¡Alerta máxima! La policía está en operativo. *#crime* tiene -20% de probabilidad de éxito.',
        duracion: 60,
        emoji: '🚔'
    },
    {
        tipo: 'golpe_grande',
        nombre: '💰 El Golpe Grande',
        descripcion: '💰 Oportunidad de oro: *#crime* tiene +15% de probabilidad de éxito.',
        duracion: 45,
        emoji: '💰'
    },
    {
        tipo: 'xp_doble',
        nombre: '⚡ XP x2',
        descripcion: '⚡ ¡Cada mensaje da el DOBLE de experiencia! Habla y sube de nivel mucho más rápido.',
        duracion: 120,
        emoji: '⚡'
    },
    {
        tipo: 'bonus_robo',
        nombre: '🦊 Ladrones en la Ciudad',
        descripcion: '🦊 *#robar* tiene +20% de probabilidad de éxito. ¡Los rateros andan sueltos!',
        duracion: 60,
        emoji: '🦊'
    },
    {
        tipo: 'amnistia',
        nombre: '⚖️ Amnistía General',
        descripcion: '⚖️ ¡El gobierno liberó a todos los presos! Todos los encarcelados han sido puestos en libertad.',
        duracion: 1,
        emoji: '⚖️'
    },
    {
        tipo: 'jackpot_fest',
        nombre: '🎰 Jackpot Fest',
        descripcion: '🎰 El jackpot de *#slots* se triplica. ¡A probar suerte en las tragamonedas!',
        duracion: 60,
        emoji: '🎰'
    },
    {
        tipo: 'dia_pesca',
        nombre: '🎣 Día de Pesca',
        descripcion: '🎣 *#pescar* da el DOBLE de monedas. ¡Las aguas están llenas de tesoros!',
        duracion: 60,
        emoji: '🎣'
    },
    {
        tipo: 'veta_oro',
        nombre: '⛏️ Veta de Oro',
        descripcion: '⛏️ *#minar* da el DOBLE de monedas. ¡Se encontró una veta especial bajo tierra!',
        duracion: 60,
        emoji: '⛏️'
    },
    {
        tipo: 'temporada_caza',
        nombre: '🏹 Temporada de Caza',
        descripcion: '🏹 *#cazar* da el DOBLE de botín. ¡Los animales andan por todos lados!',
        duracion: 60,
        emoji: '🏹'
    },
    {
        tipo: 'asedio',
        nombre: '🏰 Asedio Épico',
        descripcion: '🏰 *#mazmorra* da el DOBLE de recompensas. ¡Los monstruos guardan más tesoros hoy!',
        duracion: 45,
        emoji: '🏰'
    },
    {
        tipo: 'racha_suerte',
        nombre: '🌟 Racha de Suerte',
        descripcion: '🌟 Pesca, minería, caza y aventuras dan ×1.5 de ganancias. ¡La fortuna sonríe a todos!',
        duracion: 90,
        emoji: '🌟'
    },
    {
        tipo: 'turbo_laboral',
        nombre: '💊 Turbo Laboral',
        descripcion: '💊 *#work* y *#daily* dan ×2 de recompensas. ¡Todos al trabajo a máxima velocidad!',
        duracion: 45,
        emoji: '💊'
    },
    {
        tipo: 'fiebre_aventura',
        nombre: '🗺️ Fiebre de Aventura',
        descripcion: '🗺️ *#aventura* da el DOBLE de recompensas. ¡Los exploradores están de suerte!',
        duracion: 75,
        emoji: '🗺️'
    },
    {
        tipo: 'noche_oscura',
        nombre: '🌑 Noche Oscura',
        descripcion: '🌑 La ciudad está a oscuras. *#crime* tiene +30% de probabilidad y sin riesgo de cárcel.',
        duracion: 45,
        emoji: '🌑'
    },
    {
        tipo: 'luna_llena',
        nombre: '🌕 Luna Llena',
        descripcion: '🌕 Los animales y peces están activos. *#pescar*, *#cazar* y *#minar* dan ×2.5 de ganancias.',
        duracion: 60,
        emoji: '🌕'
    },
    {
        tipo: 'olimpiadas_nexus',
        nombre: '🏅 Olimpiadas Nexus',
        descripcion: '🏅 ¡Gran competición! Cada mensaje da ×3 de experiencia. ¡Sube de nivel a toda velocidad!',
        duracion: 120,
        emoji: '🏅'
    },
    {
        tipo: 'tormenta_legendaria',
        nombre: '⛈️ Tormenta Legendaria',
        descripcion: '⛈️ ¡Lluvia de riqueza extrema! *#daily* da ×4 y *#work* da ×3. ¡Solo dura 30 minutos!',
        duracion: 30,
        emoji: '⛈️'
    },
    {
        tipo: 'suerte_total',
        nombre: '🍀 Suerte Total',
        descripcion: '🍀 ¡La suerte sonríe a todos! Todas las actividades de economía dan ×2 de ganancias.',
        duracion: 60,
        emoji: '🍀'
    },
    {
        tipo: 'hora_oscura',
        nombre: '😈 La Hora Oscura',
        descripcion: '😈 Los criminales dominan las calles. *#crime* tiene +40% de probabilidad de éxito.',
        duracion: 45,
        emoji: '😈'
    },
    {
        tipo: 'invasion_mazmorra',
        nombre: '⚔️ Invasión de Mazmorras',
        descripcion: '⚔️ Los héroes están en su mejor momento. *#mazmorra* tiene 90% de probabilidad de éxito.',
        duracion: 60,
        emoji: '⚔️'
    },
    {
        tipo: 'fiebre_casino',
        nombre: '🃏 Fiebre de Casino',
        descripcion: '🃏 ¡Las máquinas están calientes! Las ganancias del casino se duplican. ¡A jugar!',
        duracion: 60,
        emoji: '🃏'
    },
    {
        tipo: 'cosecha_abundante',
        nombre: '🌾 Cosecha Abundante',
        descripcion: '🌾 ¡Temporada de abundancia! *#work*, *#daily*, *#pescar*, *#cazar* y *#minar* dan ×1.75.',
        duracion: 90,
        emoji: '🌾'
    },
    {
        tipo: 'vendaval_monedas',
        nombre: '💨 Vendaval de Monedas',
        descripcion: '💨 ¡El viento trae riqueza! *#daily* da ×5 de monedas. ¡Solo dura 20 minutos!',
        duracion: 20,
        emoji: '💨'
    },
    {
        tipo: 'tregua_policial',
        nombre: '🕊️ Tregua Policial',
        descripcion: '🕊️ ¡La policía decidió tomarse el día! *#crime* sin multa ni cárcel al fallar.',
        duracion: 45,
        emoji: '🕊️'
    },
    {
        tipo: 'fiesta_nexus',
        nombre: '🎊 Fiesta Nexus',
        descripcion: '🎊 ¡El bot celebra! XP ×2, *#daily* ×2 y *#work* ×2. ¡Todos a disfrutar!',
        duracion: 90,
        emoji: '🎊'
    },
];

function obtenerEventoActivo(jid) {
    try {
        // Eventos desactivados por defecto: solo aplican si eventosHabilitados === true
        if (jid) {
            const g = getGrupo(jid);
            if (!g.eventosHabilitados) return null;
        }
        if (!fs.existsSync(EVENT_PATH)) return null;
        const data = fs.readJsonSync(EVENT_PATH);
        // Soporta tanto 'expira' (nuevo) como 'fin' (legacy)
        const limite = data?.expira || data?.fin;
        if (limite && Date.now() > limite) return null;
        return data;
    } catch { return null; }
}

function aplicarAmnistia() {
    try {
        const { cargarUsuarios, guardarUsuario } = require('./database');
        const db = cargarUsuarios();
        let liberados = 0;
        for (const [jid, u] of Object.entries(db)) {
            if (u.encarcelado && Date.now() < u.encarcelado) {
                u.encarcelado = null;
                guardarUsuario(jid, u);
                liberados++;
            }
        }
        return liberados;
    } catch { return 0; }
}

async function _dispararEvento(sock, obtenerGrupos) {
    try {
        if (!botState.eventosActivos) return;
        const eventoActual = obtenerEventoActivo();
        if (eventoActual) return;

        const evento = EVENTOS_CATALOGO[Math.floor(Math.random() * EVENTOS_CATALOGO.length)];
        const ahora  = Date.now();
        const expira = ahora + evento.duracion * 60 * 1000;

        fs.writeJsonSync(EVENT_PATH, { ...evento, inicio: ahora, expira });

        let extraMsg = '';
        if (evento.tipo === 'amnistia') {
            const liberados = aplicarAmnistia();
            extraMsg = liberados > 0 ? `\n🔓 *${liberados} presos* han sido liberados.` : '';
        }

        const durTexto = evento.duracion > 1
            ? `\n⏰ Duración: *${evento.duracion} minutos*`
            : '';
        const texto =
`${evento.emoji} *¡EVENTO ALEATORIO ACTIVADO!*

🎉 *${evento.nombre}*

${evento.descripcion}${extraMsg}${durTexto}

_Usa *#evento* para ver el estado del evento_`;

        const grupos = obtenerGrupos();
        for (const [gid, g] of Object.entries(grupos)) {
            if (g.botActivo === false) continue;
            // Los eventos se envían a todos los grupos salvo que estén explícitamente desactivados.
            // Usa #eventos off en un grupo para desactivarlos allí.
            if (g.eventosHabilitados === false) continue;
            try { await sock.sendMessage(gid, { text: texto }); } catch {}
            // Delay aleatorio entre grupos para evitar ráfagas detectables como spam
            await new Promise(r => setTimeout(r, 2000 + Math.floor(Math.random() * 2000)));
        }
    } catch (e) {
        console.error('Error scheduler eventos:', e.message);
    }
}

let _schedulerTimeout  = null;
let _schedulerInterval = null;

function iniciarSchedulerEventos(sock, obtenerGrupos) {
    if (_schedulerTimeout)  { clearTimeout(_schedulerTimeout);   _schedulerTimeout  = null; }
    if (_schedulerInterval) { clearInterval(_schedulerInterval); _schedulerInterval = null; }

    // Primera revisión a los 20 minutos, luego cada 2 horas
    _schedulerTimeout = setTimeout(async () => {
        _schedulerTimeout = null;
        if (Math.random() < 0.50) await _dispararEvento(sock, obtenerGrupos);
        _schedulerInterval = setInterval(async () => {
            if (Math.random() < 0.50) await _dispararEvento(sock, obtenerGrupos);
        }, 2 * 60 * 60 * 1000);
    }, 20 * 60 * 1000);
}

async function cmdEventosCatalogo(sock, jid, pagina = 1) {
    const { paginar, piePagina } = require('./paginator');
    const sep = '─'.repeat(30);
    const total = EVENTOS_CATALOGO.length;

    const grupos = [
        {
            titulo: '💰 Daily & Work',
            tipos: ['hora_dorada', 'lluvia_coins', 'trabajo_extra', 'turbo_laboral', 'cosecha_abundante', 'tormenta_legendaria', 'vendaval_monedas', 'fiesta_nexus']
        },
        {
            titulo: '🦹 Crimen & Robo',
            tipos: ['caos_criminal', 'golpe_grande', 'redada', 'bonus_robo', 'noche_oscura', 'hora_oscura', 'tregua_policial']
        },
        {
            titulo: '🌿 Naturaleza',
            tipos: ['dia_pesca', 'veta_oro', 'temporada_caza', 'luna_llena', 'racha_suerte']
        },
        {
            titulo: '⚔️ Combate',
            tipos: ['asedio', 'fiebre_aventura', 'invasion_mazmorra']
        },
        {
            titulo: '🎰 Casino',
            tipos: ['jackpot_fest', 'fiebre_casino']
        },
        {
            titulo: '⚡ Experiencia',
            tipos: ['xp_doble', 'olimpiadas_nexus']
        },
        {
            titulo: '🌟 Especiales',
            tipos: ['amnistia', 'suerte_total']
        },
    ];

    const { items: gruposPag, pag, totalPags } = paginar(grupos, pagina, 3);
    let txt = `📋 *CATÁLOGO DE EVENTOS NEXUS*\n_${total} eventos que se activan aleatoriamente_\n`;

    for (const grupo of gruposPag) {
        txt += `\n${sep}\n*${grupo.titulo}*\n\n`;
        for (const tipo of grupo.tipos) {
            const ev = EVENTOS_CATALOGO.find(e => e.tipo === tipo);
            if (!ev) continue;
            txt += `${ev.emoji} *${ev.nombre}* _(${ev.duracion} min)_\n${ev.descripcion}\n\n`;
        }
    }

    txt += `${sep}\n_Usa *#evento* para ver si hay uno activo ahora_`;
    txt += piePagina(pag, totalPags, 'catalogo');

    await sock.sendMessage(jid, { text: txt });
}

async function cmdEvento(sock, jid) {
    const evento = obtenerEventoActivo();
    if (!evento) {
        const ahora  = new Date();
        const esfds  = ahora.getDay() === 0 || ahora.getDay() === 6;
        if (esfds) {
            await sock.sendMessage(jid, { text: '🎉 *Evento activo: ¡Fin de semana doble!*\n\n💰 Las recompensas de *#daily* y *#work* se duplican hoy.\n📅 Termina mañana a medianoche.' });
        } else {
            await sock.sendMessage(jid, { text: '📅 *No hay eventos activos ahora.*\n\n_Los fines de semana se duplican las recompensas automáticamente.\nLos eventos aleatorios se activan solos varias veces al día._\n\n📋 *Posibles eventos:*\n⭐ Hora Dorada · 🌧️ Lluvia de Coins · 💼 Jornada Extra\n🦹 Caos Criminal · 🚔 Redada · 💰 Golpe Grande\n⚡ XP x2 · 🦊 Ladrones · ⚖️ Amnistía' });
        }
        return;
    }
    const limite  = evento.expira || evento.fin;
    const minRest = limite ? Math.max(0, Math.ceil((limite - Date.now()) / 60000)) : 0;
    const finTxt  = minRest > 0 ? `\n⏰ Termina en: *${minRest} minuto(s)*` : '';
    await sock.sendMessage(jid, { text: `🎉 *Evento activo: ${evento.nombre}*\n\n${evento.descripcion}${finTxt}` });
}

async function cmdLoot(sock, jid, senderJid, pushName) {
    try {
        if (!fs.existsSync(LOOT_PATH)) {
            await sock.sendMessage(jid, { text: '❌ No hay loot disponible en este momento.' });
            return;
        }
        const lootData = fs.readJsonSync(LOOT_PATH);
        if (!lootData?.activo) {
            await sock.sendMessage(jid, { text: '❌ No hay loot disponible ahora. ¡Espera el próximo evento!' });
            return;
        }
        const recogidos = lootData.recogidos || {};
        if (recogidos[senderJid]) {
            await sock.sendMessage(jid, { text: '❌ Ya recogiste este loot. ¡Espera el próximo!' });
            return;
        }
        const u = getUsuario(senderJid);
        const premio = Math.floor(Math.random() * 500) + 100;
        u.monedas = (u.monedas || 0) + premio;
        guardarUsuario(senderJid, u);
        recogidos[senderJid] = Date.now();
        lootData.recogidos = recogidos;
        fs.writeJsonSync(LOOT_PATH, lootData);
        const nombre = pushName || senderJid.split('@')[0];
        await sock.sendMessage(jid, { text: `🎁 *${nombre}* recogió el loot y obtuvo *${premio} ⓃNexCoins*!` });
    } catch {
        await sock.sendMessage(jid, { text: '❌ Error recogiendo el loot.' });
    }
}

// ══════════════════════════════════════════
//  AFK LIST (#afklist)
// ══════════════════════════════════════════
async function cmdAfkList(sock, jid, groupMetadata, pagina = 1) {
    const { paginar, piePagina } = require('./paginator');
    const db = cargarUsuarios();
    const ahora = Date.now();
    let todos = [];

    if (groupMetadata?.participants?.length) {
        const memberIds = new Set(groupMetadata.participants.map(p => p.id));
        todos = Object.entries(db)
            .filter(([uid, u]) => memberIds.has(uid) && u.afk?.activo)
            .map(([uid, u]) => {
                const elapsed = ahora - (u.afk.desde || ahora);
                const mins = Math.floor(elapsed / 60000);
                const tiempoStr = mins > 60 ? `${Math.floor(mins / 60)}h ${mins % 60}m` : `${mins}m`;
                const nombre = u.pushName || uid.split('@')[0];
                return { uid, nombre, tiempoStr, mensaje: u.afk.mensaje };
            });
    } else {
        todos = Object.entries(db)
            .filter(([, u]) => u.afk?.activo)
            .map(([uid, u]) => {
                const elapsed = ahora - (u.afk.desde || ahora);
                const mins = Math.floor(elapsed / 60000);
                const tiempoStr = mins > 60 ? `${Math.floor(mins / 60)}h ${mins % 60}m` : `${mins}m`;
                const nombre = u.pushName || uid.split('@')[0];
                return { uid, nombre, tiempoStr, mensaje: u.afk.mensaje };
            });
    }

    if (!todos.length) {
        await sock.sendMessage(jid, { text: '✅ No hay usuarios AFK en este momento.' });
        return;
    }

    const { items: afkUsers, pag, totalPags } = paginar(todos, pagina, 10);
    let texto = `╔══════════════════╗\n║   💤 LISTA AFK     ║\n╚══════════════════╝\n\n`;
    afkUsers.forEach((u, i) => {
        texto += `${i + 1}. 💤 *${u.nombre}*\n`;
        texto += `   ⏱️ Hace: *${u.tiempoStr}*\n`;
        texto += `   📝 _"${u.mensaje}"_\n\n`;
    });
    texto += piePagina(pag, totalPags, 'afklist');
    const mentions = afkUsers.map(u => u.uid);
    await sock.sendMessage(jid, { text: texto, mentions });
}

// ══════════════════════════════════════════
//  AFK DEL (#afkdel / #volver)
// ══════════════════════════════════════════
async function cmdAfkDel(sock, jid, senderJid, pushName) {
    const u = getUsuario(senderJid);
    if (!u.afk?.activo) {
        await sock.sendMessage(jid, { text: '❌ No estás en modo AFK.' });
        return;
    }
    const elapsed = Date.now() - (u.afk.desde || Date.now());
    const mins = Math.floor(elapsed / 60000);
    const tiempoStr = mins > 60 ? `${Math.floor(mins / 60)}h ${mins % 60}m` : `${mins}m`;
    u.afk.activo = false;
    guardarUsuario(senderJid, u);
    const nombre = pushName || senderJid.split('@')[0];
    await sock.sendMessage(jid, {
        text: `🌟 *${nombre}* ya no está AFK.\n⏱️ _Estuvo ausente: ${tiempoStr}_`
    });
}

module.exports = {
    cmdAfk, verificarAfk, notificarAfk,
    cmdAfkList, cmdAfkDel,
    cmdAdoptar, cmdPetInfo, cmdPetFeed, cmdPetPlay, cmdCambiarMascota, cmdAbandonarMascota,
    cmdHack, cmdRankGlobal, cmdEvento, cmdEventosCatalogo, cmdLoot, obtenerEventoActivo,
    iniciarSchedulerEventos,
    TIPOS_MASCOTAS, RAREZA
};
