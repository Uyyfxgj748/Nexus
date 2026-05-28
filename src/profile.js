const { getUsuario, guardarUsuario, cargarUsuarios } = require('./database');
const { enviarMediaLocal } = require('./mediaUtils');

const axios = require('axios');

const MARRY_GIFS = [
    'https://media.tenor.com/x-VcN-mO3s0AAAAC/wedding-rings.gif',
    'https://media.tenor.com/OgzPZaLqFPkAAAAC/marry-me-proposal.gif',
    'https://media.tenor.com/VGmcCPumQqsAAAAC/anime-couple-anime-kiss.gif',
    'https://media.tenor.com/Xg0cG4nCXHMAAAAC/wedding-couple.gif',
];

const DIVORCE_GIFS = [
    'https://media.tenor.com/ZJZJqeW_IFIAAAAC/divorce-signing.gif',
    'https://media.tenor.com/e08_M2m4NAAAAAAC/breakup-sad.gif',
    'https://media.tenor.com/hbdFN5NkjT8AAAAC/sad-anime.gif',
    'https://media.tenor.com/7pJxiSH2sHgAAAAC/crying-sad.gif',
];

async function cmdPerfil(sock, jid, senderJid, mencionados) {
    const objetivo = mencionados && mencionados.length > 0 ? mencionados[0] : senderJid;
    const u = getUsuario(objetivo);

    let parejaText = '💔 _Soltero/a_';
    if (u.pareja) {
        const uPareja = getUsuario(u.pareja);
        const nombrePareja = uPareja.pushName || u.parejaNombre || u.pareja.split('@')[0];
        parejaText = `💑 *${nombrePareja}*`;
    }

    const favText = u.favorito ? `_${u.favorito}_` : '_Sin definir_';
    const logrosCount = (u.logros || []).length;
    const clanText = u.clanId ? `⚔️ *${u.clanId}*` : '_Sin clan_';
    const mascotaText = u.mascota ? `${u.mascota.emoji} *${u.mascota.nombre}* (Nv.${u.mascota.nivel})` : '_Sin mascota_';
    const repText = u.reputacion ?? 0;

    const nivel = u.nivel || 1;
    const expActual = u.experiencia || 0;
    const expSig = nivel * 100;
    const progreso = Math.min(Math.floor((expActual / expSig) * 10), 10);
    const barra = '▰'.repeat(progreso) + '░'.repeat(10 - progreso);
    const nombre = u.pushName || objetivo.split('@')[0];
    const rango = obtenerRango(nivel);

    const texto =
`✦ ─── ${nombre} PROFILE ─── ✦

👤 Usuario   : @${objetivo.split('@')[0]}
📛 Nombre    : *${nombre}*
⚧️ Género    : ${u.genero ? `*${u.genero}*` : '_No definido_'}
🎂 Cumple    : ${u.cumpleanos ? `*${u.cumpleanos}*` : '_No definido_'}
💬 Bio       : ${u.descripcion ? `_"${u.descripcion}"_` : '_Sin descripción_'}

┈┈┈┈┈┈┈┈┈┈ ⚡ ┈┈┈┈┈┈┈┈┈┈

🎯 Nivel     : *${nivel}*
🏅 Rango     : *${rango.nombre}* ${rango.emoji}
📊 XP        : *${expActual} / ${expSig}*
              ${barra}
💬 Mensajes  : *${u.mensajes || 0}*
🏆 Logros    : *${logrosCount}*
⭐ Reputación: *${repText}*

┈┈┈┈┈┈┈┈┈┈ 💰 ┈┈┈┈┈┈┈┈┈┈

💵 Cartera   : *${(u.monedas || 0).toLocaleString()} ⓃNC*
🏦 Banco     : *${(u.banco || 0).toLocaleString()} ⓃNC*

┈┈┈┈┈┈┈┈┈┈ 💞 ┈┈┈┈┈┈┈┈┈┈

💍 Pareja    : ${parejaText}
🏰 Clan      : ${clanText}
⭐ Favorito  : ${favText}
🐾 Mascota   : ${mascotaText}`;

    let pfpUrl = null;
    try {
        pfpUrl = await Promise.race([
            sock.profilePictureUrl(objetivo, 'image'),
            new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 5000))
        ]);
    } catch {}

    if (pfpUrl) {
        try {
            const img = await axios.get(pfpUrl, { responseType: 'arraybuffer', timeout: 15000 });
            await sock.sendMessage(jid, {
                image: Buffer.from(img.data),
                caption: texto,
                mentions: [objetivo]
            });
            return;
        } catch {}
    }
    await sock.sendMessage(jid, { text: texto, mentions: [objetivo] });
}

async function cmdSetbirth(sock, jid, senderJid, args) {
    const fecha = args[0];
    if (!fecha || !/^\d{2}\/\d{2}\/\d{4}$/.test(fecha)) {
        await sock.sendMessage(jid, { text: '❌ Uso: #setbirth DD/MM/AAAA\nEjemplo: #setbirth 15/03/2000' });
        return;
    }
    const u = getUsuario(senderJid);
    u.cumpleanos = fecha;
    guardarUsuario(senderJid, u);
    await sock.sendMessage(jid, { text: `🎂 Cumpleaños establecido: *${fecha}*` });
}

async function cmdDelbirth(sock, jid, senderJid) {
    const u = getUsuario(senderJid);
    u.cumpleanos = null;
    guardarUsuario(senderJid, u);
    await sock.sendMessage(jid, { text: '✅ Tu fecha de cumpleaños fue eliminada.' });
}

async function cmdSetdesc(sock, jid, senderJid, args) {
    const desc = args.join(' ');
    if (!desc) {
        await sock.sendMessage(jid, { text: '❌ Uso: #setdesc [descripción]' });
        return;
    }
    const u = getUsuario(senderJid);
    u.descripcion = desc;
    guardarUsuario(senderJid, u);
    await sock.sendMessage(jid, { text: `✅ Descripción actualizada: _${desc}_` });
}

async function cmdSetgenre(sock, jid, senderJid, args) {
    const genero = args[0]?.toLowerCase();
    if (!genero || !['hombre', 'mujer'].includes(genero)) {
        await sock.sendMessage(jid, { text: '❌ Uso: #setgenre hombre | mujer' });
        return;
    }
    const u = getUsuario(senderJid);
    u.genero = genero;
    guardarUsuario(senderJid, u);
    await sock.sendMessage(jid, { text: `✅ Género establecido: *${genero}*` });
}

async function cmdDelgenre(sock, jid, senderJid) {
    const u = getUsuario(senderJid);
    u.genero = null;
    guardarUsuario(senderJid, u);
    await sock.sendMessage(jid, { text: '✅ Tu género fue eliminado.' });
}

async function cmdSetfav(sock, jid, senderJid, args) {
    const personaje = args.join(' ');
    if (!personaje) {
        await sock.sendMessage(jid, { text: '❌ Uso: #setfav [nombre del personaje]' });
        return;
    }
    const u = getUsuario(senderJid);
    u.favorito = personaje;
    guardarUsuario(senderJid, u);
    await sock.sendMessage(jid, { text: `⭐ Personaje favorito establecido: *${personaje}*` });
}

async function cmdMarry(sock, jid, senderJid, mencionados) {
    if (!mencionados || mencionados.length === 0) {
        await sock.sendMessage(jid, { text: '❌ Uso: #marry @usuario' });
        return;
    }
    const objetivo = mencionados[0];
    if (objetivo === senderJid) {
        await sock.sendMessage(jid, { text: '❌ No puedes casarte contigo mismo.' });
        return;
    }
    const uSender = getUsuario(senderJid);
    const uObjetivo = getUsuario(objetivo);
    if (uSender.pareja) {
        await sock.sendMessage(jid, { text: `❌ Ya estás casado/a con @${uSender.pareja.split('@')[0]}. Usa #divorce primero.`, mentions: [uSender.pareja] });
        return;
    }
    if (uObjetivo.pareja) {
        await sock.sendMessage(jid, { text: `❌ @${objetivo.split('@')[0]} ya está casado/a.`, mentions: [objetivo] });
        return;
    }
    uSender.pareja = objetivo;
    uSender.parejaNombre = uObjetivo.pushName || objetivo.split('@')[0];
    uObjetivo.pareja = senderJid;
    uObjetivo.parejaNombre = uSender.pushName || senderJid.split('@')[0];
    guardarUsuario(senderJid, uSender);
    guardarUsuario(objetivo, uObjetivo);

    const caption = `💍 ¡@${senderJid.split('@')[0]} y @${objetivo.split('@')[0]} ahora están casados! 🎊\n\n_¡Que sean muy felices!_ 💑`;
    const mentions = [senderJid, objetivo];
    const enviado = await enviarMediaLocal(sock, jid, 'media/marry', caption, mentions, true);
    if (!enviado) {
        const gifUrl = MARRY_GIFS[Math.floor(Math.random() * MARRY_GIFS.length)];
        try {
            await sock.sendMessage(jid, { video: { url: gifUrl }, caption, gifPlayback: true, mentions });
        } catch {
            await sock.sendMessage(jid, { text: caption, mentions });
        }
    }
}

async function cmdDivorce(sock, jid, senderJid) {
    const u = getUsuario(senderJid);
    if (!u.pareja) {
        await sock.sendMessage(jid, { text: '❌ No estás casado/a.' });
        return;
    }
    const exPareja = u.pareja;
    const uEx = getUsuario(exPareja);
    u.pareja = null;
    uEx.pareja = null;
    guardarUsuario(senderJid, u);
    guardarUsuario(exPareja, uEx);

    const caption = `💔 @${senderJid.split('@')[0]} se divorció de @${exPareja.split('@')[0]}`;
    const mentions = [senderJid, exPareja];
    const enviado = await enviarMediaLocal(sock, jid, 'media/divorce', caption, mentions, true);
    if (!enviado) {
        const gifUrl = DIVORCE_GIFS[Math.floor(Math.random() * DIVORCE_GIFS.length)];
        try {
            await sock.sendMessage(jid, { video: { url: gifUrl }, caption, gifPlayback: true, mentions });
        } catch {
            await sock.sendMessage(jid, { text: caption, mentions });
        }
    }
}

function obtenerRango(nivel) {
    if (nivel >= 41) return { nombre: 'Legendario', emoji: '🟡' };
    if (nivel >= 31) return { nombre: 'Maestro', emoji: '🟣' };
    if (nivel >= 21) return { nombre: 'Guerrero', emoji: '🔴' };
    if (nivel >= 11) return { nombre: 'Explorador', emoji: '🔵' };
    return { nombre: 'Novato', emoji: '🟢' };
}

async function cmdRango(sock, jid, senderJid, mencionados) {
    const objetivo = mencionados && mencionados.length > 0 ? mencionados[0] : senderJid;
    const u = getUsuario(objetivo);
    const nivel = u.nivel || 1;
    const rango = obtenerRango(nivel);

    const texto =
`╭━━━〔 🏅 SISTEMA DE RANGOS 〕━━━╮
┃
┃ 🟢 *Novato*      — Nivel 1–10
┃ 🔵 *Explorador*  — Nivel 11–20
┃ 🔴 *Guerrero*    — Nivel 21–30
┃ 🟣 *Maestro*     — Nivel 31–40
┃ 🟡 *Legendario*  — Nivel 41+
┃
╰━━━━━━━━━━━━━━━━━━━━━━━╯

👤 @${objetivo.split('@')[0]}
🎯 Nivel actual: *${nivel}*
🏅 Tu rango: *${rango.nombre}* ${rango.emoji}

_Sube de nivel enviando mensajes en el grupo._`;

    await sock.sendMessage(jid, { text: texto, mentions: [objetivo] });
}

async function cmdLevel(sock, jid, senderJid, mencionados) {
    const objetivo = mencionados && mencionados.length > 0 ? mencionados[0] : senderJid;
    const u = getUsuario(objetivo);
    const nivel = u.nivel || 1;
    const expActual = u.experiencia || 0;
    const expSig = nivel * 100;
    const faltan = Math.max(0, expSig - expActual);
    const progreso = Math.min(Math.floor((expActual / expSig) * 12), 12);
    const barra = '█'.repeat(progreso) + '░'.repeat(12 - progreso);
    const rango = obtenerRango(nivel);

    const texto =
`╭━━━〔 ⭐ NIVEL DE USUARIO 〕━━━╮
┃ 👤 @${objetivo.split('@')[0]}
┃
┃ 🎯 Nivel actual : *${nivel}*
┃ 🏅 Rango        : *${rango.nombre}* ${rango.emoji}
┃ 📊 Progreso     : *${expActual} / ${expSig} XP*
┃
┃ ⏳ Avance:
┃ [${barra}]
┃
┃ 🔥 Te faltan: *${faltan} XP* para subir de nivel
╰━━━━━━━━━━━━━━━━━━━━━━━╯`;

    await sock.sendMessage(jid, { text: texto, mentions: [objetivo] });
}

async function cmdLeaderboard(sock, jid, groupMetadata, pagina = 1) {
    const { paginar, piePagina, emblema } = require('./paginator');
    const db = cargarUsuarios();
    let entries = Object.entries(db).filter(([key, u]) =>
        key.includes('@') && !key.endsWith('@g.us')
    );

    const esGrupo = !!groupMetadata?.participants?.length;
    if (esGrupo) {
        const memberIds = new Set(groupMetadata.participants.map(p => p.id));
        const filtrado = entries.filter(([key]) => memberIds.has(key));
        if (filtrado.length > 0) entries = filtrado;
    }

    const todos = entries
        .map(([ujid, u]) => ({ jid: ujid, nivel: u.nivel || 1, exp: u.experiencia || 0 }))
        .sort((a, b) => b.nivel !== a.nivel ? b.nivel - a.nivel : b.exp - a.exp);

    const { items: usuarios, pag, totalPags, inicio } = paginar(todos, pagina, 10);
    const titulo = esGrupo ? '🏆 TOP NIVELES — GRUPO' : '🏆 LEADERBOARD';
    let texto = `╔══════════════════╗\n║   ${titulo}   ║\n╚══════════════════╝\n\n`;
    for (let i = 0; i < usuarios.length; i++) {
        const u = usuarios[i];
        const rango = obtenerRango(u.nivel);
        texto += `${emblema(inicio + i)} @${u.jid.split('@')[0]} — Nv.*${u.nivel}* ${rango.emoji}\n`;
    }
    if (esGrupo) texto += `\n_Solo miembros de este grupo_\n_Usa *#rankglobal* para el ranking mundial_`;
    texto += piePagina(pag, totalPags, 'leaderboard');
    const mentions = usuarios.map(u => u.jid);
    await sock.sendMessage(jid, { text: texto, mentions });
}

async function cmdCumpleanos(sock, jid) {
    const db = cargarUsuarios();
    const hoy = new Date();
    const dia = String(hoy.getDate()).padStart(2, '0');
    const mes = String(hoy.getMonth() + 1).padStart(2, '0');
    const proximos = Object.entries(db)
        .filter(([, u]) => u.cumpleanos)
        .map(([jid, u]) => {
            const [d, m] = u.cumpleanos.split('/');
            return { jid, dia: d, mes: m, cumpleanos: u.cumpleanos };
        })
        .filter(u => u.mes === mes);
    if (proximos.length === 0) {
        await sock.sendMessage(jid, { text: '🎂 No hay cumpleaños este mes.' });
        return;
    }
    let texto = `╔══════════════════╗\n║  🎂 CUMPLEAÑOS    ║\n╚══════════════════╝\n\n`;
    for (const u of proximos) {
        const esHoy = u.dia === dia ? ' ← ¡HOY! 🎉' : '';
        texto += `🎂 @${u.jid.split('@')[0]} — ${u.cumpleanos}${esHoy}\n`;
    }
    const mentions = proximos.map(u => u.jid);
    await sock.sendMessage(jid, { text: texto, mentions });
}

async function cmdAllBirthdays(sock, jid, pagina = 1) {
    const { paginar, piePagina } = require('./paginator');
    const db = cargarUsuarios();
    const lista = Object.entries(db)
        .filter(([, u]) => u.cumpleanos)
        .map(([jid, u]) => ({ jid, cumpleanos: u.cumpleanos }))
        .sort((a, b) => {
            const [da, ma] = a.cumpleanos.split('/').map(Number);
            const [db2, mb] = b.cumpleanos.split('/').map(Number);
            return ma !== mb ? ma - mb : da - db2;
        });
    if (lista.length === 0) {
        await sock.sendMessage(jid, { text: '🎂 Nadie ha registrado su cumpleaños aún.' });
        return;
    }
    const { items: todos, pag, totalPags } = paginar(lista, pagina, 20);
    let texto = `╔══════════════════╗\n║  🎂 TODOS LOS CUMPLEAÑOS ║\n╚══════════════════╝\n\n`;
    for (const u of todos) {
        texto += `🎂 @${u.jid.split('@')[0]} — ${u.cumpleanos}\n`;
    }
    texto += piePagina(pag, totalPags, 'allbirthdays');
    const mentions = todos.map(u => u.jid);
    await sock.sendMessage(jid, { text: texto, mentions });
}

async function cmdGrupoInfo(sock, jid, groupMetadata) {
    if (!groupMetadata) {
        await sock.sendMessage(jid, { text: '❌ Este comando solo funciona en grupos.' });
        return;
    }
    const admins = groupMetadata.participants.filter(p => p.admin).length;
    const texto = `╔══════════════════╗
║   📊 INFO GRUPO    ║
╚══════════════════╝
📛 Nombre: *${groupMetadata.subject}*
👥 Miembros: *${groupMetadata.participants.length}*
👑 Admins: *${admins}*
🆔 ID: \`${jid}\`
📅 Creado: *${new Date(groupMetadata.creation * 1000).toLocaleDateString('es-ES')}*
📝 Descripción: _${groupMetadata.desc || 'Sin descripción'}_`;
    await sock.sendMessage(jid, { text: texto });
}

async function cmdRacha(sock, jid, senderJid, mencionados) {
    const objetivo = mencionados?.length ? mencionados[0] : senderJid;
    const u        = getUsuario(objetivo);
    const nombre   = u.pushName || objetivo.split('@')[0];
    const esProp   = objetivo === senderJid;

    const racha    = u.racha    || 0;
    const rachaMax = u.rachaMax || 0;
    const c        = u.contadores || {};

    const totalVictorias =
        (c.ganadosTrivia   || 0) +
        (c.ganadosMath     || 0) +
        (c.ganadosPpt      || 0) +
        (c.ganadosAhorcado || 0) +
        (c.ganadosScramble || 0) +
        (c.ganadosQuien    || 0);

    // Barra de racha (cada bloque = 1 victoria, máx 10 visibles)
    const bloques  = Math.min(racha, 10);
    const barra    = '🔥'.repeat(bloques) + '⬜'.repeat(10 - bloques);

    // Nivel de racha
    const nivelRacha =
        racha === 0  ? '😴 Sin racha activa' :
        racha < 3    ? '🌱 Calentando motores' :
        racha < 5    ? '🔥 En racha' :
        racha < 10   ? '🔥🔥 ¡Imparable!' :
        racha < 20   ? '🏆 ¡Legendario!' :
                       '👑 ¡DIOS DE LOS JUEGOS!';

    const SEP  = '─'.repeat(28);
    let texto  = `╔══════════════════════════╗\n`;
    texto     += `║   🔥  SISTEMA DE RACHAS  ║\n`;
    texto     += `╚══════════════════════════╝\n\n`;
    texto     += `👤 *${nombre}*\n${SEP}\n`;
    texto     += `${barra}\n`;
    texto     += `🔥 *Racha actual:* ${racha} ${racha === 1 ? 'victoria' : 'victorias'}\n`;
    texto     += `🏅 *Racha máxima:* ${rachaMax} ${rachaMax === 1 ? 'victoria' : 'victorias'}\n`;
    texto     += `✨ *Estado:* ${nivelRacha}\n`;
    texto     += `${SEP}\n`;
    texto     += `🎮 *Victorias por juego:*\n`;
    texto     += `  🧠 Trivia:   *${c.ganadosTrivia   || 0}*\n`;
    texto     += `  🧮 Mates:    *${c.ganadosMath     || 0}*\n`;
    texto     += `  ✊ PPT:      *${c.ganadosPpt      || 0}*\n`;
    texto     += `  🪓 Ahorcado: *${c.ganadosAhorcado || 0}*\n`;
    texto     += `  🔀 Scramble: *${c.ganadosScramble || 0}*\n`;
    texto     += `  🕵️ ¿Quién?:  *${c.ganadosQuien   || 0}*\n`;
    texto     += `${SEP}\n`;
    texto     += `🏆 *Total de victorias:* *${totalVictorias}*\n`;

    if (racha >= 3 && esProp) {
        texto += `\n_¡Sigue así! Una derrota reiniciará tu racha._`;
    } else if (racha === 0 && esProp) {
        texto += `\n_Juega y gana seguido para acumular tu racha._`;
    }

    await sock.sendMessage(jid, { text: texto, mentions: [objetivo] });
}

// ══════════════════════════════════════════
//  🎂 SCHEDULER DE CUMPLEAÑOS AUTOMÁTICO
// ══════════════════════════════════════════
function iniciarSchedulerCumpleanos(sock, obtenerGrupos) {
    const chequearCumpleanos = async () => {
        try {
            const hoy     = new Date();
            const diaHoy  = String(hoy.getDate()).padStart(2, '0');
            const mesHoy  = String(hoy.getMonth() + 1).padStart(2, '0');
            const hoyStr  = `${diaHoy}/${mesHoy}/${hoy.getFullYear()}`;
            const db      = cargarUsuarios();
            const festejados = [];

            for (const [jid, u] of Object.entries(db)) {
                if (!u.cumpleanos) continue;
                const [d, m] = u.cumpleanos.split('/');
                if (d !== diaHoy || m !== mesHoy) continue;
                if (u.ultimoCumpleanosAvisado === hoyStr) continue;
                festejados.push({ jid, u, hoyStr });
            }

            if (festejados.length === 0) return;

            const grupos = obtenerGrupos();
            for (const { jid: userJid, u, hoyStr: hs } of festejados) {
                const bonus   = Math.floor(Math.random() * 6001) + 5000;
                const xpBonus = 500;
                u.monedas      = (u.monedas      || 0) + bonus;
                u.experiencia  = (u.experiencia   || 0) + xpBonus;
                u.ultimoCumpleanosAvisado = hs;
                guardarUsuario(userJid, u);

                const nombre = u.pushName || userJid.split('@')[0];
                const msg =
`🎂 *¡FELIZ CUMPLEAÑOS, @${userJid.split('@')[0]}!* 🎉

¡Hoy es el día especial de *${nombre}*! 🥳🎊

🎁 *El bot te regala:*
💰 *+${bonus.toLocaleString()} ⓃNexCoins*
⭐ *+${xpBonus} XP*

_¡Que la pases increíble hoy! 🎈🎂🎉_`;

                for (const [gid, g] of Object.entries(grupos)) {
                    if (g.botActivo === false) continue;
                    try {
                        await sock.sendMessage(gid, { text: msg, mentions: [userJid] });
                        await new Promise(r => setTimeout(r, 2500 + Math.floor(Math.random() * 2000)));
                    } catch {}
                }
            }
        } catch (e) {
            console.error('[Cumpleaños] Error en chequeo automático:', e.message);
        }
    };

    const msHasta9am = () => {
        const ahora = new Date();
        const prox  = new Date(ahora);
        prox.setHours(9, 0, 0, 0);
        if (prox <= ahora) prox.setDate(prox.getDate() + 1);
        return prox.getTime() - ahora.getTime();
    };

    setTimeout(async () => {
        await chequearCumpleanos();
        setInterval(chequearCumpleanos, 24 * 60 * 60 * 1000);
    }, msHasta9am());

    console.log('🎂 Scheduler de cumpleaños activo.');
}

module.exports = {
    cmdPerfil, cmdSetbirth, cmdDelbirth, cmdSetdesc, cmdSetgenre, cmdDelgenre,
    cmdSetfav, cmdMarry, cmdDivorce, cmdLevel, cmdLeaderboard,
    cmdCumpleanos, cmdAllBirthdays, cmdGrupoInfo, cmdRango, obtenerRango,
    cmdRacha, iniciarSchedulerCumpleanos
};
