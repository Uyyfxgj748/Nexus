const { getGrupo, guardarGrupo, getUsuario, guardarUsuario, cargarUsuarios, guardarUsuarios, cargarGrupos } = require('./database');
const { guardarNsfwMenuMedia, borrarNsfwMenuMedia, leerNsfwMenuMedia } = require('./menu');
const { isOwner } = require('./owners');
const { parsearDuracion, formatearDuracion, agregarTempban, eliminarTempban, getBanActivo } = require('./tempban');
const { registrarAccion, getModlog, limpiarModlog, ICONOS } = require('./modlog');
const axios = require('axios');
const { downloadContentFromMessage } = require('@whiskeysockets/baileys');
const fs = require('fs-extra');
const path = require('path');

const IMG_DIR = path.join(__dirname, '../data/images');
fs.ensureDirSync(IMG_DIR);

function safeJidPart(jid) {
    return jid.replace(/[^a-zA-Z0-9]/g, '_');
}

function esAdmin(groupMetadata, jid) {
    if (!groupMetadata) return false;
    const participante = groupMetadata.participants.find(p => p.id === jid);
    return participante && (participante.admin === 'admin' || participante.admin === 'superadmin');
}

// Permite admin del grupo O owner del bot
function esAdminOOwner(groupMetadata, jid) {
    return isOwner(jid) || esAdmin(groupMetadata, jid);
}

// Detecta tipo de media (image/video/gif) desde un mensaje o quoted
function detectarMedia(msg) {
    const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;

    // Imagen directa o citada
    if (msg.message?.imageMessage) return { tipo: 'image', mediaMsg: msg.message.imageMessage };
    if (quoted?.imageMessage)       return { tipo: 'image', mediaMsg: quoted.imageMessage };

    // Video/GIF directo o citado
    if (msg.message?.videoMessage) {
        const m = msg.message.videoMessage;
        return { tipo: m.gifPlayback ? 'gif' : 'video', mediaMsg: m };
    }
    if (quoted?.videoMessage) {
        const m = quoted.videoMessage;
        return { tipo: m.gifPlayback ? 'gif' : 'video', mediaMsg: m };
    }

    // Documento (archivo adjunto) — detectar si es imagen o video por mimetype
    const doc    = msg.message?.documentMessage;
    const docQ   = quoted?.documentMessage;
    const docMsg = doc || docQ;
    if (docMsg) {
        const mime = (docMsg.mimetype || '').toLowerCase();
        if (mime.startsWith('image/')) return { tipo: 'image',  mediaMsg: docMsg };
        if (mime.startsWith('video/')) return { tipo: 'video',  mediaMsg: docMsg };
        // Sin mimetype claro: intentar por extensión del nombre
        const nombre = (docMsg.fileName || '').toLowerCase();
        if (/\.(jpg|jpeg|png|webp)$/.test(nombre)) return { tipo: 'image', mediaMsg: docMsg };
        if (/\.(mp4|webm|mov|avi|mkv)$/.test(nombre)) return { tipo: 'video', mediaMsg: docMsg };
    }

    return { tipo: null, mediaMsg: null };
}

async function descargarMedia(mediaMsg, tipo) {
    // documentMessage requiere 'document' como tipo de descarga en Baileys
    let tipoBaileys;
    if (mediaMsg.fileName !== undefined) {
        tipoBaileys = 'document';
    } else if (tipo === 'image') {
        tipoBaileys = 'image';
    } else {
        tipoBaileys = 'video';
    }
    const stream = await downloadContentFromMessage(mediaMsg, tipoBaileys);
    let buffer = Buffer.from([]);
    for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk]);
    return buffer;
}

function esBotAdmin(groupMetadata, botJid) {
    if (!groupMetadata) return false;
    const bot = groupMetadata.participants.find(p => p.id === botJid);
    return bot && (bot.admin === 'admin' || bot.admin === 'superadmin');
}

async function cmdKick(sock, jid, groupMetadata, senderJid, mencionados) {
    if (!esAdmin(groupMetadata, senderJid)) {
        await sock.sendMessage(jid, { text: '❌ Solo los administradores pueden usar este comando.' });
        return;
    }
    if (!mencionados || mencionados.length === 0) {
        await sock.sendMessage(jid, { text: '❌ Uso: #kick @usuario' });
        return;
    }
    const objetivo = mencionados[0];
    try {
        await sock.groupParticipantsUpdate(jid, [objetivo], 'remove');
        registrarAccion(jid, senderJid, 'kick', objetivo);
        await sock.sendMessage(jid, {
            text: `🚫 @${objetivo.split('@')[0]} fue expulsado del grupo.`,
            mentions: [objetivo]
        });
    } catch {
        await sock.sendMessage(jid, { text: '❌ No pude expulsar al usuario. Verifica mis permisos.' });
    }
}

async function cmdPromote(sock, jid, groupMetadata, senderJid, mencionados) {
    if (!esAdmin(groupMetadata, senderJid)) {
        await sock.sendMessage(jid, { text: '❌ Solo los administradores pueden usar este comando.' });
        return;
    }
    if (!mencionados || mencionados.length === 0) {
        await sock.sendMessage(jid, { text: '❌ Uso: #promote @usuario' });
        return;
    }
    const objetivo = mencionados[0];
    try {
        await sock.groupParticipantsUpdate(jid, [objetivo], 'promote');
        await sock.sendMessage(jid, {
            text: `⬆️ @${objetivo.split('@')[0]} ahora es *administrador* del grupo. 👑`,
            mentions: [objetivo]
        });
        const g = getGrupo(jid);
        if (g.alertas) {
            await sock.sendMessage(jid, {
                text: `🔔 *Alerta:* @${objetivo.split('@')[0]} fue promovido a administrador.`,
                mentions: [objetivo]
            });
        }
    } catch {
        await sock.sendMessage(jid, { text: '❌ No pude promover al usuario. Verifica mis permisos.' });
    }
}

async function cmdDemote(sock, jid, groupMetadata, senderJid, mencionados) {
    if (!esAdmin(groupMetadata, senderJid)) {
        await sock.sendMessage(jid, { text: '❌ Solo los administradores pueden usar este comando.' });
        return;
    }
    if (!mencionados || mencionados.length === 0) {
        await sock.sendMessage(jid, { text: '❌ Uso: #demote @usuario' });
        return;
    }
    const objetivo = mencionados[0];
    try {
        await sock.groupParticipantsUpdate(jid, [objetivo], 'demote');
        await sock.sendMessage(jid, {
            text: `⬇️ @${objetivo.split('@')[0]} ya no es administrador del grupo.`,
            mentions: [objetivo]
        });
        const g = getGrupo(jid);
        if (g.alertas) {
            await sock.sendMessage(jid, {
                text: `🔔 *Alerta:* @${objetivo.split('@')[0]} fue removido de administrador.`,
                mentions: [objetivo]
            });
        }
    } catch {
        await sock.sendMessage(jid, { text: '❌ No pude degradar al usuario. Verifica mis permisos.' });
    }
}

async function cmdAntilink(sock, jid, groupMetadata, senderJid, args) {
    if (!esAdmin(groupMetadata, senderJid)) {
        await sock.sendMessage(jid, { text: '❌ Solo los administradores pueden usar este comando.' });
        return;
    }
    const opcion = args[0];
    if (!opcion || !['enable', 'disable', 'on', 'off'].includes(opcion)) {
        await sock.sendMessage(jid, { text: '❌ Uso: #antilink enable | disable' });
        return;
    }
    const g = getGrupo(jid);
    g.antilink = opcion === 'enable' || opcion === 'on';
    guardarGrupo(jid, g);
    await sock.sendMessage(jid, { text: `🔗 Antilink *${opcion === 'enable' || opcion === 'on' ? 'activado ✅' : 'desactivado ❌'}*` });
}

async function verificarAntilink(sock, jid, msg, groupMetadata, senderJid) {
    const g = getGrupo(jid);
    if (!g.antilink) return;
    if (esAdminOOwner(groupMetadata, senderJid)) return;
    const { isOwner } = require('./owners');
    if (isOwner(senderJid)) return;
    const texto = (
        msg.message?.conversation ||
        msg.message?.extendedTextMessage?.text ||
        msg.message?.imageMessage?.caption ||
        msg.message?.videoMessage?.caption || ''
    );
    const tieneLink = /https?:\/\/|wa\.me\/|chat\.whatsapp\.com\/|bit\.ly\/|tinyurl\.com\/|t\.me\//i.test(texto);
    if (!tieneLink) return;
    // Borrar el mensaje con el link
    try {
        await sock.sendMessage(jid, { delete: msg.key });
    } catch {}
    // Avisar y expulsar
    try {
        await sock.sendMessage(jid, {
            text: `🚫 @${senderJid.split('@')[0]} fue expulsado por enviar un enlace.`,
            mentions: [senderJid]
        });
        await sock.groupParticipantsUpdate(jid, [senderJid], 'remove');
    } catch (err) {
        // Si no pudo expulsar (bot sin permisos), al menos advierte
        try {
            await sock.sendMessage(jid, {
                text: `⚠️ @${senderJid.split('@')[0]} los enlaces no están permitidos. (El bot necesita ser admin para expulsar)`,
                mentions: [senderJid]
            });
        } catch {}
        console.error('[ANTILINK] Error al expulsar:', err.message);
    }
}

async function cmdSetwelcome(sock, jid, groupMetadata, senderJid, args) {
    if (!esAdminOOwner(groupMetadata, senderJid)) {
        await sock.sendMessage(jid, { text: '❌ Solo administradores u owner del bot pueden usar este comando.' });
        return;
    }
    const texto = args.join(' ');
    if (!texto) {
        await sock.sendMessage(jid, { text: '❌ Uso: #setwelcome [texto]\nUsa @ o @usuario para mencionar al miembro que entra/sale.\nEjemplo: _Hola @ 👋 bienvenido al grupo_' });
        return;
    }
    const g = getGrupo(jid);
    g.mensajeBienvenida = texto;
    guardarGrupo(jid, g);
    await sock.sendMessage(jid, { text: `✅ Mensaje de bienvenida establecido:\n\n_${texto}_` });
}

async function cmdSetgoodbye(sock, jid, groupMetadata, senderJid, args) {
    if (!esAdminOOwner(groupMetadata, senderJid)) {
        await sock.sendMessage(jid, { text: '❌ Solo administradores u owner del bot pueden usar este comando.' });
        return;
    }
    const texto = args.join(' ');
    if (!texto) {
        await sock.sendMessage(jid, { text: '❌ Uso: #setgoodbye [texto]' });
        return;
    }
    const g = getGrupo(jid);
    g.mensajeDespedida = texto;
    guardarGrupo(jid, g);
    await sock.sendMessage(jid, { text: `✅ Mensaje de despedida establecido:\n\n_${texto}_` });
}

async function cmdResetwelcome(sock, jid, groupMetadata, senderJid) {
    if (!esAdminOOwner(groupMetadata, senderJid)) {
        await sock.sendMessage(jid, { text: '❌ Solo administradores u owner del bot pueden usar este comando.' });
        return;
    }
    const g = getGrupo(jid);
    delete g.mensajeBienvenida;
    guardarGrupo(jid, g);
    await sock.sendMessage(jid, { text: '✅ Mensaje de bienvenida restablecido al texto predeterminado.' });
}

async function cmdResetgoodbye(sock, jid, groupMetadata, senderJid) {
    if (!esAdminOOwner(groupMetadata, senderJid)) {
        await sock.sendMessage(jid, { text: '❌ Solo administradores u owner del bot pueden usar este comando.' });
        return;
    }
    const g = getGrupo(jid);
    delete g.mensajeDespedida;
    guardarGrupo(jid, g);
    await sock.sendMessage(jid, { text: '✅ Mensaje de despedida restablecido al texto predeterminado.' });
}

// ── Helper interno: guardar media de bienvenida o despedida ───────────────────
async function guardarMediaBG(sock, jid, groupMetadata, senderJid, msg, modo, soloImagen) {
    if (!esAdminOOwner(groupMetadata, senderJid)) {
        await sock.sendMessage(jid, { text: '❌ Solo administradores u owner del bot pueden usar este comando.' });
        return;
    }
    const { tipo, mediaMsg } = detectarMedia(msg);
    if (!mediaMsg) {
        const ejemplo = soloImagen
            ? `❌ Envía o responde una *imagen* con *#set${modo}image*`
            : `❌ Envía o responde *imagen / gif / video (máx 1 min)* con *#setmultimedia${modo}*`;
        await sock.sendMessage(jid, { text: `${ejemplo}\n\nEsa media se enviará cuando alguien ${modo === 'welcome' ? 'entre' : 'salga'} del grupo.` });
        return;
    }
    if (soloImagen && tipo !== 'image') {
        await sock.sendMessage(jid, { text: '❌ Este comando solo acepta *imágenes*. Para video/gif usa *#setmultimedia' + modo + '*.' });
        return;
    }
    if (tipo === 'video' || tipo === 'gif') {
        const segs = Number(mediaMsg.seconds || 0);
        if (segs && segs > 60) {
            await sock.sendMessage(jid, { text: `❌ El video dura *${segs}s*. El máximo permitido es *60 segundos*.` });
            return;
        }
    }
    try {
        const buffer = await descargarMedia(mediaMsg, tipo);
        const ext = tipo === 'image' ? 'jpg' : (tipo === 'gif' ? 'mp4' : 'mp4');
        const filename = `${modo}_${safeJidPart(jid)}.${ext}`;
        const filepath = path.join(IMG_DIR, filename);
        fs.writeFileSync(filepath, buffer);
        const g = getGrupo(jid);
        const campo = modo === 'welcome' ? 'welcomeMedia' : 'goodbyeMedia';
        const campoLegacy = modo === 'welcome' ? 'welcomeImagePath' : 'goodbyeImagePath';
        g[campo] = { tipo, path: filepath };
        // Mantener legacy field solo cuando es imagen
        g[campoLegacy] = tipo === 'image' ? filepath : null;
        guardarGrupo(jid, g);
        const accion = modo === 'welcome' ? 'entre' : 'salga';
        const tipoTxt = tipo === 'image' ? 'imagen' : (tipo === 'gif' ? 'GIF' : 'video');
        await sock.sendMessage(jid, { text: `✅ *${tipoTxt} de ${modo === 'welcome' ? 'bienvenida' : 'despedida'} guardado.*\nSe enviará cuando alguien ${accion} al grupo.\n\n_Usa *#del${modo}image* para quitarlo._` });
    } catch (err) {
        await sock.sendMessage(jid, { text: `❌ No pude guardar la media: ${err.message}` });
    }
}

// ── Imagen / multimedia de bienvenida ────────────────────────────────────────
async function cmdSetWelcomeImage(sock, jid, groupMetadata, senderJid, msg) {
    return guardarMediaBG(sock, jid, groupMetadata, senderJid, msg, 'welcome', true);
}
async function cmdSetMultimediaWelcome(sock, jid, groupMetadata, senderJid, msg) {
    return guardarMediaBG(sock, jid, groupMetadata, senderJid, msg, 'welcome', false);
}

async function cmdDelWelcomeImage(sock, jid, groupMetadata, senderJid) {
    if (!esAdminOOwner(groupMetadata, senderJid)) {
        await sock.sendMessage(jid, { text: '❌ Solo administradores u owner del bot pueden usar este comando.' });
        return;
    }
    const g = getGrupo(jid);
    const media = g.welcomeMedia || (g.welcomeImagePath ? { tipo: 'image', path: g.welcomeImagePath } : null);
    if (!media) {
        await sock.sendMessage(jid, { text: '❌ No hay media de bienvenida configurada.' });
        return;
    }
    try { fs.removeSync(media.path); } catch {}
    g.welcomeMedia = null;
    g.welcomeImagePath = null;
    guardarGrupo(jid, g);
    await sock.sendMessage(jid, { text: '✅ Media de bienvenida eliminada.' });
}

async function cmdSetGoodbyeImage(sock, jid, groupMetadata, senderJid, msg) {
    return guardarMediaBG(sock, jid, groupMetadata, senderJid, msg, 'goodbye', true);
}
async function cmdSetMultimediaGoodbye(sock, jid, groupMetadata, senderJid, msg) {
    return guardarMediaBG(sock, jid, groupMetadata, senderJid, msg, 'goodbye', false);
}

async function cmdDelGoodbyeImage(sock, jid, groupMetadata, senderJid) {
    if (!esAdminOOwner(groupMetadata, senderJid)) {
        await sock.sendMessage(jid, { text: '❌ Solo administradores u owner del bot pueden usar este comando.' });
        return;
    }
    const g = getGrupo(jid);
    const media = g.goodbyeMedia || (g.goodbyeImagePath ? { tipo: 'image', path: g.goodbyeImagePath } : null);
    if (!media) {
        await sock.sendMessage(jid, { text: '❌ No hay media de despedida configurada.' });
        return;
    }
    try { fs.removeSync(media.path); } catch {}
    g.goodbyeMedia = null;
    g.goodbyeImagePath = null;
    guardarGrupo(jid, g);
    await sock.sendMessage(jid, { text: '✅ Media de despedida eliminada.' });
}

// ── Media del menú NSFW ───────────────────────────────────────────────────────
async function cmdSetNsfwMenuMedia(sock, jid, groupMetadata, senderJid, msg) {
    if (!isOwner(senderJid)) {
        await sock.sendMessage(jid, { text: '⛔ Solo el owner del bot puede configurar la media del menú NSFW.' });
        return;
    }
    const { tipo, mediaMsg } = detectarMedia(msg);
    if (!mediaMsg) {
        await sock.sendMessage(jid, { text: '❌ Envía o responde una *imagen / gif / video (máx 60s)* con el comando *#setnsfwmedia*.' });
        return;
    }
    if (tipo === 'video' || tipo === 'gif') {
        const segs = Number(mediaMsg.seconds || 0);
        if (segs && segs > 60) {
            await sock.sendMessage(jid, { text: `❌ El video dura *${segs}s*. El máximo permitido es *60 segundos*.` });
            return;
        }
    }
    try {
        const buffer = await descargarMedia(mediaMsg, tipo);
        const ext = tipo === 'image' ? 'jpg' : 'mp4';
        const filepath = path.join(IMG_DIR, `nsfw_menu_media.${ext}`);
        // Borrar la anterior antes de guardar la nueva
        borrarNsfwMenuMedia();
        fs.writeFileSync(filepath, buffer);
        guardarNsfwMenuMedia({ tipo, path: filepath });
        const tipoTxt = tipo === 'image' ? 'imagen' : (tipo === 'gif' ? 'GIF' : 'video');
        await sock.sendMessage(jid, { text: `✅ *${tipoTxt} del menú NSFW guardado.*\nSe enviará en todos los grupos al usar #menunsfw.\n\n_Usa *#delnsfwmedia* para quitarlo._` });
    } catch (err) {
        await sock.sendMessage(jid, { text: `❌ No pude guardar la media: ${err.message}` });
    }
}

async function cmdDelNsfwMenuMedia(sock, jid, groupMetadata, senderJid) {
    if (!isOwner(senderJid)) {
        await sock.sendMessage(jid, { text: '⛔ Solo el owner del bot puede quitar la media del menú NSFW.' });
        return;
    }
    if (!leerNsfwMenuMedia()) {
        await sock.sendMessage(jid, { text: '❌ No hay media del menú NSFW configurada.' });
        return;
    }
    borrarNsfwMenuMedia();
    await sock.sendMessage(jid, { text: '✅ Media del menú NSFW eliminada.' });
}

// Aliases de carpeta (igual que en interactions.js)
const NSFW_CARPETA_ALIAS = {
    mamada: 'blowjob', bj: 'blowjob',
    paja:   'fap',
    coger:  'fuck',
    '69':   'sixnine',
    nalgada: 'spank',
    encuerar: 'undress',
    tijeras: 'yuri',
};

// Carpetas canónicas válidas
const NSFW_CARPETAS_VALIDAS = new Set([
    'anal', 'blowjob', 'boobjob', 'cum', 'cummouth', 'cumshot',
    'fap', 'footjob', 'fuck', 'grabboobs', 'grope', 'handjob',
    'lickass', 'lickdick', 'lickpussy', 'sixnine', 'spank',
    'suckboobs', 'undress', 'yuri',
]);

async function cmdUploadNsfwMedia(sock, jid, senderJid, args, msg) {
    if (!isOwner(senderJid)) {
        await sock.sendMessage(jid, { text: '⛔ Solo el owner puede subir media NSFW.' });
        return;
    }

    const input = (args[0] || '').toLowerCase().trim();
    if (!input) {
        const lista = [...NSFW_CARPETAS_VALIDAS].join(', ');
        await sock.sendMessage(jid, {
            text: `❌ Indica la carpeta. Uso: *#upload <carpeta>* + cita la imagen/gif/video.\n\n📂 Carpetas disponibles:\n${lista}`
        });
        return;
    }

    const carpeta = NSFW_CARPETA_ALIAS[input] || input;
    if (!NSFW_CARPETAS_VALIDAS.has(carpeta)) {
        const lista = [...NSFW_CARPETAS_VALIDAS].join(', ');
        await sock.sendMessage(jid, {
            text: `❌ Carpeta *"${input}"* no válida.\n\n📂 Carpetas disponibles:\n${lista}`
        });
        return;
    }

    const { tipo, mediaMsg } = detectarMedia(msg);
    if (!mediaMsg) {
        await sock.sendMessage(jid, {
            text: `❌ Debes *citar* o enviar una imagen, gif o video junto con *#upload ${input}*.`
        });
        return;
    }

    try {
        const buffer = await descargarMedia(mediaMsg, tipo);
        const ext = tipo === 'image' ? 'jpg' : 'mp4';
        const dirDest = path.join(__dirname, '../interactions/nsfw', carpeta);
        fs.ensureDirSync(dirDest);
        const filename = `${Date.now()}.${ext}`;
        const filepath = path.join(dirDest, filename);
        fs.writeFileSync(filepath, buffer);

        const tipoTxt = tipo === 'image' ? 'imagen' : (tipo === 'gif' ? 'GIF' : 'video');
        const aliasInfo = NSFW_CARPETA_ALIAS[input] ? ` (alias de *${carpeta}*)` : '';
        await sock.sendMessage(jid, {
            text: `✅ *${tipoTxt}* guardada en *${input}${aliasInfo}*.\n📁 Archivo: \`${filename}\`\nYa estará disponible en rotación con *#${input}*.`
        });
    } catch (err) {
        await sock.sendMessage(jid, { text: `❌ Error al guardar: ${err.message}` });
    }
}

// ── Upload SFW ────────────────────────────────────────────────────────────────
const SFW_CARPETAS_VALIDAS = new Set([
    'baka', 'bite', 'blush', 'bored', 'cry', 'cuddle', 'dance', 'facepalm',
    'feed', 'handhold', 'handshake', 'happy', 'highfive', 'hug', 'kick',
    'kiss', 'laugh', 'nod', 'nom', 'pat', 'poke', 'punch', 'run', 'sad',
    'shoot', 'shrug', 'slap', 'sleep', 'smug', 'stare', 'think', 'thumbsup',
    'tickle', 'wave', 'wink', 'yeet',
]);

const SFW_CARPETA_ALIAS = {
    abrazar: 'hug',   besar:   'kiss',  llorar:  'cry',
    bailar:  'dance', golpear: 'slap',  patear:  'kick',
    dormir:  'sleep', correr:  'run',   saludar: 'wave',
    comer:   'nom',   feliz:   'happy', triste:  'sad',
};

async function cmdUploadSfwMedia(sock, jid, senderJid, args, msg) {
    if (!isOwner(senderJid)) {
        await sock.sendMessage(jid, { text: '⛔ Solo el owner puede subir media SFW.' });
        return;
    }

    const input = (args[0] || '').toLowerCase().trim();
    if (!input) {
        const lista = [...SFW_CARPETAS_VALIDAS].sort().join(', ');
        await sock.sendMessage(jid, {
            text: `❌ Indica la carpeta. Uso: *#uploadsfw <carpeta>* + cita la imagen/gif/video.\n\n📂 Carpetas disponibles:\n${lista}`
        });
        return;
    }

    const carpeta = SFW_CARPETA_ALIAS[input] || input;
    if (!SFW_CARPETAS_VALIDAS.has(carpeta)) {
        const lista = [...SFW_CARPETAS_VALIDAS].sort().join(', ');
        await sock.sendMessage(jid, {
            text: `❌ Carpeta *"${input}"* no válida.\n\n📂 Carpetas disponibles:\n${lista}`
        });
        return;
    }

    const { tipo, mediaMsg } = detectarMedia(msg);
    if (!mediaMsg) {
        await sock.sendMessage(jid, {
            text: `❌ Debes *citar* o enviar una imagen, gif o video junto con *#uploadsfw ${input}*.`
        });
        return;
    }

    try {
        const buffer = await descargarMedia(mediaMsg, tipo);
        const ext = tipo === 'image' ? 'jpg' : 'mp4';
        const dirDest = path.join(__dirname, '../interactions/sfw', carpeta);
        fs.ensureDirSync(dirDest);
        const filename = `${Date.now()}.${ext}`;
        const filepath = path.join(dirDest, filename);
        fs.writeFileSync(filepath, buffer);

        const tipoTxt = tipo === 'image' ? 'imagen' : (tipo === 'gif' ? 'GIF' : 'video');
        const aliasInfo = SFW_CARPETA_ALIAS[input] ? ` (alias de *${carpeta}*)` : '';
        await sock.sendMessage(jid, {
            text: `✅ *${tipoTxt}* guardada en *${input}${aliasInfo}*.\n📁 Archivo: \`${filename}\`\nYa estará disponible en rotación con *#${carpeta}*.`
        });
    } catch (err) {
        await sock.sendMessage(jid, { text: `❌ Error al guardar: ${err.message}` });
    }
}

// ── Limpieza de usuarios ──────────────────────────────────────────────────────
async function cmdLimpiarUsuarios(sock, jid, groupMetadata, senderJid) {
    if (!esAdmin(groupMetadata, senderJid) && !isOwner(senderJid)) {
        await sock.sendMessage(jid, { text: '❌ Solo los administradores u owners pueden usar este comando.' });
        return;
    }
    if (!groupMetadata) {
        await sock.sendMessage(jid, { text: '❌ Este comando solo funciona en grupos.' });
        return;
    }
    const miembrosJids = new Set(groupMetadata.participants.map(p => p.id));
    const db = cargarUsuarios();
    let eliminados = 0;
    for (const uid of Object.keys(db)) {
        if (uid.endsWith('@s.whatsapp.net') && !miembrosJids.has(uid)) {
            delete db[uid];
            eliminados++;
        }
    }
    guardarUsuarios(db);
    await sock.sendMessage(jid, {
        text: `🧹 *Limpieza completada*\n\n✅ Se eliminaron *${eliminados}* usuario(s) que ya no están en el grupo de la base de datos.\n👥 Miembros activos conservados: *${miembrosJids.size}*`
    });
}

// ── Resto de comandos admin ──────────────────────────────────────────────────
async function cmdWelcome(sock, jid, groupMetadata, senderJid, args) {
    if (!esAdminOOwner(groupMetadata, senderJid)) {
        await sock.sendMessage(jid, { text: '❌ Solo administradores u owner del bot pueden usar este comando.' });
        return;
    }
    const opcion = args[0];
    if (!opcion || !['enable', 'disable', 'on', 'off'].includes(opcion)) {
        await sock.sendMessage(jid, { text: '❌ Uso: #welcome enable | disable' });
        return;
    }
    const g = getGrupo(jid);
    g.bienvenida = opcion === 'enable' || opcion === 'on';
    guardarGrupo(jid, g);
    await sock.sendMessage(jid, { text: `✅ Bienvenida *${opcion === 'enable' || opcion === 'on' ? 'activada ✅' : 'desactivada ❌'}*` });
}

async function cmdGoodbye(sock, jid, groupMetadata, senderJid, args) {
    if (!esAdminOOwner(groupMetadata, senderJid)) {
        await sock.sendMessage(jid, { text: '❌ Solo administradores u owner del bot pueden usar este comando.' });
        return;
    }
    const opcion = args[0];
    if (!opcion || !['enable', 'disable', 'on', 'off'].includes(opcion)) {
        await sock.sendMessage(jid, { text: '❌ Uso: #goodbye enable | disable' });
        return;
    }
    const g = getGrupo(jid);
    g.despedida = opcion === 'enable' || opcion === 'on';
    guardarGrupo(jid, g);
    await sock.sendMessage(jid, { text: `✅ Despedida *${opcion === 'enable' || opcion === 'on' ? 'activada ✅' : 'desactivada ❌'}*` });
}

async function cmdOnlyadmin(sock, jid, groupMetadata, senderJid, args) {
    if (!esAdminOOwner(groupMetadata, senderJid)) {
        await sock.sendMessage(jid, { text: '❌ Solo los administradores y owners pueden usar este comando.' });
        return;
    }
    const opcion = args[0];
    if (!opcion || !['enable', 'disable', 'on', 'off'].includes(opcion)) {
        await sock.sendMessage(jid, { text: '❌ Uso: #onlyadmin enable | disable' });
        return;
    }
    const g = getGrupo(jid);
    g.soloAdmin = opcion === 'enable' || opcion === 'on';
    guardarGrupo(jid, g);
    await sock.sendMessage(jid, { text: `✅ Modo solo admins *${opcion === 'enable' || opcion === 'on' ? 'activado ✅' : 'desactivado ❌'}*` });
}

async function cmdOpen(sock, jid, groupMetadata, senderJid) {
    if (!esAdmin(groupMetadata, senderJid)) {
        await sock.sendMessage(jid, { text: '❌ Solo los administradores pueden usar este comando.' });
        return;
    }
    try {
        await sock.groupSettingUpdate(jid, 'not_announcement');
        await sock.sendMessage(jid, { text: '🔓 Grupo *abierto*. Todos pueden enviar mensajes.' });
    } catch {
        await sock.sendMessage(jid, { text: '❌ No pude abrir el grupo. Asegúrate de que soy administrador.' });
    }
}

async function cmdClose(sock, jid, groupMetadata, senderJid) {
    if (!esAdmin(groupMetadata, senderJid)) {
        await sock.sendMessage(jid, { text: '❌ Solo los administradores pueden usar este comando.' });
        return;
    }
    try {
        await sock.groupSettingUpdate(jid, 'announcement');
        await sock.sendMessage(jid, { text: '🔒 Grupo *cerrado*. Solo los administradores pueden enviar mensajes.' });
    } catch {
        await sock.sendMessage(jid, { text: '❌ No pude cerrar el grupo. Asegúrate de que soy administrador.' });
    }
}

async function cmdWarn(sock, jid, groupMetadata, senderJid, mencionados, args) {
    if (!esAdminOOwner(groupMetadata, senderJid)) {
        await sock.sendMessage(jid, { text: '❌ Solo los administradores pueden usar este comando.' });
        return;
    }
    if (!mencionados || mencionados.length === 0) {
        await sock.sendMessage(jid, { text: '❌ Uso: #warn @usuario [razón]' });
        return;
    }
    const objetivo = mencionados[0];
    const razon = args.filter(a => !a.startsWith('@')).join(' ') || 'Sin razón especificada';
    const g = getGrupo(jid);
    if (!g.warns) g.warns = {};
    g.warns[objetivo] = (g.warns[objetivo] || 0) + 1;
    guardarGrupo(jid, g);
    const limite = g.limiteAdvertencias || 3;
    registrarAccion(jid, senderJid, 'warn', objetivo, razon);
    await sock.sendMessage(jid, {
        text: `⚠️ *Advertencia* para @${objetivo.split('@')[0]}\n📝 Razón: ${razon}\n🔢 Advertencias: *${g.warns[objetivo]}/${limite}*`,
        mentions: [objetivo]
    });
    if (g.warns[objetivo] >= limite) {
        try {
            await sock.groupParticipantsUpdate(jid, [objetivo], 'remove');
            registrarAccion(jid, 'BOT', 'kick', objetivo, `Límite de warns (${limite}) alcanzado`);
            await sock.sendMessage(jid, {
                text: `🚫 @${objetivo.split('@')[0]} fue expulsado por alcanzar el límite de advertencias (${limite}).`,
                mentions: [objetivo]
            });
            g.warns[objetivo] = 0;
            guardarGrupo(jid, g);
        } catch {
            await sock.sendMessage(jid, { text: '❌ No pude expulsar al usuario. Verifica mis permisos de administrador.' });
        }
    }
}

async function cmdDelwarn(sock, jid, groupMetadata, senderJid, mencionados) {
    if (!esAdminOOwner(groupMetadata, senderJid)) {
        await sock.sendMessage(jid, { text: '❌ Solo los administradores pueden usar este comando.' });
        return;
    }
    if (!mencionados || mencionados.length === 0) {
        await sock.sendMessage(jid, { text: '❌ Uso: #delwarn @usuario' });
        return;
    }
    const objetivo = mencionados[0];
    const g = getGrupo(jid);
    if (!g.warns) g.warns = {};
    if (!g.warns[objetivo] || g.warns[objetivo] === 0) {
        await sock.sendMessage(jid, { text: `ℹ️ @${objetivo.split('@')[0]} no tiene advertencias en este grupo.`, mentions: [objetivo] });
        return;
    }
    g.warns[objetivo] = Math.max(0, g.warns[objetivo] - 1);
    guardarGrupo(jid, g);
    registrarAccion(jid, senderJid, 'delwarn', objetivo);
    await sock.sendMessage(jid, {
        text: `✅ Se eliminó una advertencia de @${objetivo.split('@')[0]}\n🔢 Advertencias: *${g.warns[objetivo]}/${g.limiteAdvertencias || 3}*`,
        mentions: [objetivo]
    });
}

async function cmdWarns(sock, jid, groupMetadata, senderJid, mencionados) {
    if (!esAdminOOwner(groupMetadata, senderJid)) {
        await sock.sendMessage(jid, { text: '❌ Solo los administradores pueden usar este comando.' });
        return;
    }
    const objetivo = mencionados && mencionados.length > 0 ? mencionados[0] : senderJid;
    const g = getGrupo(jid);
    const total = (g.warns && g.warns[objetivo]) || 0;
    await sock.sendMessage(jid, {
        text: `⚠️ *Advertencias de @${objetivo.split('@')[0]}* en este grupo\n🔢 Total: *${total}/${g.limiteAdvertencias || 3}*`,
        mentions: [objetivo]
    });
}

async function cmdResetwarns(sock, jid, groupMetadata, senderJid, mencionados) {
    if (!esAdminOOwner(groupMetadata, senderJid)) {
        await sock.sendMessage(jid, { text: '❌ Solo los administradores pueden usar este comando.' });
        return;
    }
    if (!mencionados || mencionados.length === 0) {
        await sock.sendMessage(jid, { text: '❌ Uso: #resetwarns @usuario' });
        return;
    }
    const objetivo = mencionados[0];
    const g = getGrupo(jid);
    if (!g.warns) g.warns = {};
    g.warns[objetivo] = 0;
    guardarGrupo(jid, g);
    registrarAccion(jid, senderJid, 'resetwarns', objetivo);
    await sock.sendMessage(jid, {
        text: `✅ Advertencias de @${objetivo.split('@')[0]} reiniciadas a *0/${g.limiteAdvertencias || 3}* en este grupo.`,
        mentions: [objetivo]
    });
}

async function cmdTempban(sock, jid, groupMetadata, senderJid, mencionados, args) {
    if (!esAdminOOwner(groupMetadata, senderJid)) {
        await sock.sendMessage(jid, { text: '❌ Solo los administradores pueden usar este comando.' });
        return;
    }
    if (!mencionados || mencionados.length === 0) {
        await sock.sendMessage(jid, { text: '❌ Uso: *#tempban @usuario <tiempo>*\nEjemplos: _#tempban @u 1h_ / _#tempban @u 30m_ / _#tempban @u 2d_' });
        return;
    }
    const objetivo = mencionados[0];
    const tiempoStr = args.filter(a => !a.startsWith('@')).join('');
    const duracionMs = parsearDuracion(tiempoStr);
    if (!duracionMs) {
        await sock.sendMessage(jid, { text: '❌ Duración inválida. Usa: *30m*, *1h*, *2d*, *1h30m*, etc.' });
        return;
    }
    if (duracionMs > 30 * 24 * 60 * 60 * 1000) {
        await sock.sendMessage(jid, { text: '❌ El tiempo máximo de tempban es *30 días*.' });
        return;
    }
    const banActivo = getBanActivo(jid, objetivo);
    if (banActivo) {
        const restante = formatearDuracion(banActivo.expiry - Date.now());
        await sock.sendMessage(jid, {
            text: `ℹ️ @${objetivo.split('@')[0]} ya tiene un tempban activo.\n⏳ Tiempo restante: *${restante}*\nUsa *#untempban @usuario* para cancelarlo.`,
            mentions: [objetivo]
        });
        return;
    }
    try {
        await sock.groupParticipantsUpdate(jid, [objetivo], 'remove');
    } catch {
        await sock.sendMessage(jid, { text: '❌ No pude expulsar al usuario. Verifica mis permisos de administrador.' });
        return;
    }
    agregarTempban(jid, objetivo, duracionMs);
    registrarAccion(jid, senderJid, 'tempban', objetivo, formatearDuracion(duracionMs));
    const durTexto = formatearDuracion(duracionMs);
    const expiry   = new Date(Date.now() + duracionMs);
    const hora     = expiry.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
    const fecha    = expiry.toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit' });
    await sock.sendMessage(jid, {
        text: `🔨 *@${objetivo.split('@')[0]}* fue baneado temporalmente por *${durTexto}*.\n📅 Reingreso automático: *${fecha} a las ${hora}*\n\n_Usa *#untempban @usuario* para cancelarlo antes._`,
        mentions: [objetivo]
    });
}

async function cmdTempbans(sock, jid, groupMetadata, senderJid, pagina = 1) {
    if (!esAdminOOwner(groupMetadata, senderJid)) {
        await sock.sendMessage(jid, { text: '❌ Solo los administradores pueden usar este comando.' });
        return;
    }
    const { paginar, piePagina } = require('./paginator');
    const { cargarTempbans } = require('./tempban');
    const ahora   = Date.now();
    const todos   = cargarTempbans().filter(b => b.groupJid === jid && b.expiry > ahora);
    if (!todos.length) {
        await sock.sendMessage(jid, { text: '✅ No hay tempbans activos en este grupo.' });
        return;
    }
    todos.sort((a, b) => a.expiry - b.expiry);
    const { items: activos, pag, totalPags } = paginar(todos, pagina, 10);
    const SEP = '─'.repeat(28);
    let texto = `╔══════════════════════════╗\n║   🔨  TEMPBANS ACTIVOS   ║\n╚══════════════════════════╝\n\n`;
    texto += `📋 Grupo: *${groupMetadata?.subject || jid}*\n${SEP}\n`;
    const menciones = [];
    activos.forEach((ban, i) => {
        const restante = formatearDuracion(ban.expiry - ahora);
        const expiry   = new Date(ban.expiry);
        const hora     = expiry.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
        const fecha    = expiry.toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit' });
        texto += `*${i + 1}.* @${ban.userJid.split('@')[0]}\n⏳ Restante: *${restante}*\n📅 Vence: *${fecha} ${hora}*\n${SEP}\n`;
        menciones.push(ban.userJid);
    });
    texto += `_Total: *${todos.length}* ban(s) activo(s)_\n_Usa *#untempban @usuario* para cancelar uno._`;
    texto += piePagina(pag, totalPags, 'tempbans');
    await sock.sendMessage(jid, { text: texto, mentions: menciones });
}

async function cmdUntempban(sock, jid, groupMetadata, senderJid, mencionados) {
    if (!esAdminOOwner(groupMetadata, senderJid)) {
        await sock.sendMessage(jid, { text: '❌ Solo los administradores pueden usar este comando.' });
        return;
    }
    if (!mencionados || mencionados.length === 0) {
        await sock.sendMessage(jid, { text: '❌ Uso: *#untempban @usuario*' });
        return;
    }
    const objetivo = mencionados[0];
    const ban = getBanActivo(jid, objetivo);
    if (!ban) {
        await sock.sendMessage(jid, { text: `ℹ️ @${objetivo.split('@')[0]} no tiene un tempban activo.`, mentions: [objetivo] });
        return;
    }
    eliminarTempban(jid, objetivo);
    registrarAccion(jid, senderJid, 'untempban', objetivo);
    try {
        await sock.groupParticipantsUpdate(jid, [objetivo], 'add');
        await sock.sendMessage(jid, {
            text: `✅ Tempban de *@${objetivo.split('@')[0]}* cancelado. Fue reincorporado al grupo.`,
            mentions: [objetivo]
        });
    } catch {
        await sock.sendMessage(jid, {
            text: `✅ Tempban de *@${objetivo.split('@')[0]}* cancelado.\n_No pude reincorporarlo automáticamente — deberá ser añadido manualmente._`,
            mentions: [objetivo]
        });
    }
}

// ── Mute-bot: helper para verificar si un usuario está muteado (respeta expiración) ──
function esMuteadoBot(g, jid) {
    if (!g || !(g.mutedUsers || []).includes(jid)) return false;
    const exp = (g.mutedExpiry || {})[jid];
    if (exp && Date.now() > exp) return false; // ya expiró
    return true;
}

// ── Mute-bot: limpieza automática de mutes expirados ────────────────────────
let _mutebotInterval = null;

function iniciarCheckMutebots(sock) {
    if (_mutebotInterval) { clearInterval(_mutebotInterval); _mutebotInterval = null; }

    _mutebotInterval = setInterval(async () => {
        const grupos = cargarGrupos();
        const ahora = Date.now();
        for (const [gjid, g] of Object.entries(grupos)) {
            if (!g.mutedUsers || !g.mutedUsers.length) continue;
            const expiry = g.mutedExpiry || {};
            const vencidos = g.mutedUsers.filter(uid => expiry[uid] && ahora > expiry[uid]);
            if (!vencidos.length) continue;

            g.mutedUsers = g.mutedUsers.filter(uid => !vencidos.includes(uid));
            for (const uid of vencidos) delete expiry[uid];
            g.mutedExpiry = expiry;
            guardarGrupo(gjid, g);

            for (const uid of vencidos) {
                try {
                    await sock.sendMessage(gjid, {
                        text: `🔊 *@${uid.split('@')[0]}* puede usar el bot de nuevo (mute expirado).`,
                        mentions: [uid]
                    });
                } catch { }
            }
        }
    }, 60 * 1000);
}

async function cmdMuteBot(sock, jid, groupMetadata, senderJid, mencionados, args) {
    if (!esAdminOOwner(groupMetadata, senderJid)) {
        await sock.sendMessage(jid, { text: '❌ Solo los administradores pueden usar este comando.' });
        return;
    }
    if (!mencionados || mencionados.length === 0) {
        await sock.sendMessage(jid, { text: '❌ Uso: *#mutebot @usuario [duración]*\nEjemplos: `#mutebot @user 1h` · `#mutebot @user 30m` · `#mutebot @user 2h30m`\nSin duración = silencio permanente.' });
        return;
    }
    const objetivo = mencionados[0];
    const g = getGrupo(jid);
    if (!g.mutedUsers)  g.mutedUsers  = [];
    if (!g.mutedExpiry) g.mutedExpiry = {};

    const durMs  = args && args.length ? parsearDuracion(args.join(' ')) : null;
    const expiry = durMs ? Date.now() + durMs : null;

    if (g.mutedUsers.includes(objetivo)) {
        // Ya estaba muteado — actualizar duración si se especificó una nueva
        if (expiry) {
            g.mutedExpiry[objetivo] = expiry;
        } else {
            delete g.mutedExpiry[objetivo];
        }
        guardarGrupo(jid, g);
        const tiempoTxt = expiry ? ` por *${formatearDuracion(durMs)}*` : ' permanentemente';
        await sock.sendMessage(jid, {
            text: `🔇 Mute de *@${objetivo.split('@')[0]}* actualizado${tiempoTxt}.`,
            mentions: [objetivo]
        });
        return;
    }

    g.mutedUsers.push(objetivo);
    if (expiry) g.mutedExpiry[objetivo] = expiry;
    else delete g.mutedExpiry[objetivo];
    guardarGrupo(jid, g);
    registrarAccion(jid, senderJid, 'mutebot', objetivo);

    const tiempoTxt = expiry
        ? ` por *${formatearDuracion(durMs)}*`
        : '\nUsa *#unmutebot @usuario* para revertirlo.';
    await sock.sendMessage(jid, {
        text: `🔇 *@${objetivo.split('@')[0]}* ha sido silenciado${tiempoTxt}\nEl bot ignorará sus comandos y no le dará XP en este grupo.`,
        mentions: [objetivo]
    });
}

async function cmdUnmuteBot(sock, jid, groupMetadata, senderJid, mencionados) {
    if (!esAdminOOwner(groupMetadata, senderJid)) {
        await sock.sendMessage(jid, { text: '❌ Solo los administradores pueden usar este comando.' });
        return;
    }
    if (!mencionados || mencionados.length === 0) {
        await sock.sendMessage(jid, { text: '❌ Uso: *#unmutebot @usuario*' });
        return;
    }
    const objetivo = mencionados[0];
    const g = getGrupo(jid);
    if (!g.mutedUsers || !g.mutedUsers.includes(objetivo)) {
        await sock.sendMessage(jid, { text: `ℹ️ @${objetivo.split('@')[0]} no estaba silenciado.`, mentions: [objetivo] });
        return;
    }
    g.mutedUsers = g.mutedUsers.filter(u => u !== objetivo);
    if (g.mutedExpiry) delete g.mutedExpiry[objetivo];
    guardarGrupo(jid, g);
    registrarAccion(jid, senderJid, 'unmutebot', objetivo);
    await sock.sendMessage(jid, {
        text: `🔊 *@${objetivo.split('@')[0]}* ya puede usar el bot de nuevo en este grupo.`,
        mentions: [objetivo]
    });
}

async function cmdMutedList(sock, jid, groupMetadata, senderJid, pagina = 1) {
    if (!esAdminOOwner(groupMetadata, senderJid)) {
        await sock.sendMessage(jid, { text: '❌ Solo los administradores pueden usar este comando.' });
        return;
    }
    const { paginar, piePagina } = require('./paginator');
    const g = getGrupo(jid);
    const todos = g.mutedUsers || [];
    if (!todos.length) {
        await sock.sendMessage(jid, { text: '✅ No hay usuarios silenciados en este grupo.' });
        return;
    }
    const { items: lista, pag, totalPags } = paginar(todos, pagina, 15);
    const ahora = Date.now();
    let texto = `╔══════════════════════════╗\n║  🔇  USUARIOS SILENCIADOS  ║\n╚══════════════════════════╝\n\n`;
    lista.forEach((ujid, i) => {
        const exp = (g.mutedExpiry || {})[ujid];
        let tiempoTxt = '*(permanente)*';
        if (exp) {
            const resta = exp - ahora;
            tiempoTxt = resta > 0 ? `*(expira en ${formatearDuracion(resta)})*` : '*(expirado)*';
        }
        texto += `*${i + 1}.* @${ujid.split('@')[0]} ${tiempoTxt}\n`;
    });
    texto += `\n_Usa *#unmutebot @usuario* para revertirlo._`;
    texto += piePagina(pag, totalPags, 'mutedlist');
    await sock.sendMessage(jid, { text: texto, mentions: lista });
}

async function cmdModlog(sock, jid, groupMetadata, senderJid, args, pagina = 1) {
    if (!esAdminOOwner(groupMetadata, senderJid)) {
        await sock.sendMessage(jid, { text: '❌ Solo los administradores pueden usar este comando.' });
        return;
    }
    const { paginar, piePagina } = require('./paginator');
    const todasEntradas = getModlog(jid, 1000);
    if (!todasEntradas.length) {
        await sock.sendMessage(jid, { text: '📋 No hay acciones de moderación registradas en este grupo todavía.' });
        return;
    }
    const { items: entradas, pag, totalPags } = paginar(todasEntradas, pagina, 10);
    const SEP = '─'.repeat(28);
    let texto = `╔══════════════════════════╗\n║   📋  LOG DE MODERACIÓN  ║\n╚══════════════════════════╝\n\n`;
    texto += `📌 Grupo: *${groupMetadata?.subject || jid}*\n🔢 Total: *${todasEntradas.length}* entradas\n${SEP}\n`;
    const menciones = [];
    entradas.forEach((e, i) => {
        const fecha  = new Date(e.ts).toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit' });
        const hora   = new Date(e.ts).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
        const admin  = e.adminJid === 'BOT' ? '🤖 BOT' : `@${e.adminJid.split('@')[0]}`;
        const target = `@${e.objetivoJid.split('@')[0]}`;
        const accion = ICONOS[e.accion] || e.accion;
        const extra  = e.extra ? ` — _${e.extra}_` : '';
        texto += `*${i + 1}.* ${accion}${extra}\n👤 ${target}  ·  🛡️ ${admin}\n🕐 ${fecha} ${hora}\n${SEP}\n`;
        if (e.adminJid !== 'BOT') menciones.push(e.adminJid);
        menciones.push(e.objetivoJid);
    });
    texto += piePagina(pag, totalPags, 'modlog');
    await sock.sendMessage(jid, { text: texto, mentions: [...new Set(menciones)] });
}

async function cmdClearmodlog(sock, jid, groupMetadata, senderJid) {
    if (!esAdminOOwner(groupMetadata, senderJid)) {
        await sock.sendMessage(jid, { text: '❌ Solo los administradores pueden usar este comando.' });
        return;
    }
    limpiarModlog(jid);
    await sock.sendMessage(jid, { text: '🗑️ Historial de moderación limpiado correctamente.' });
}

async function cmdWarnsList(sock, jid, groupMetadata, senderJid, pagina = 1) {
    if (!esAdminOOwner(groupMetadata, senderJid)) {
        await sock.sendMessage(jid, { text: '❌ Solo los administradores pueden usar este comando.' });
        return;
    }
    const { paginar, piePagina } = require('./paginator');
    const g = getGrupo(jid);
    const warns = g.warns || {};
    const limite = g.limiteAdvertencias || 3;
    const todos = Object.entries(warns).filter(([, v]) => v > 0);
    if (!todos.length) {
        await sock.sendMessage(jid, { text: '✅ Ningún usuario tiene advertencias activas en este grupo.' });
        return;
    }
    todos.sort((a, b) => b[1] - a[1]);
    const { items: activos, pag, totalPags } = paginar(todos, pagina, 15);
    const SEP = '─'.repeat(28);
    let texto = `╔════════════════════════════╗\n║  ⚠️  ADVERTENCIAS ACTIVAS  ║\n╚════════════════════════════╝\n\n`;
    texto += `📋 Grupo: *${groupMetadata?.subject || jid}*\n🔢 Límite: *${limite}*\n\n${SEP}\n`;
    const menciones = [];
    activos.forEach(([ujid, total], i) => {
        const num = ujid.split('@')[0];
        const barras = '🟥'.repeat(total) + '⬜'.repeat(Math.max(0, limite - total));
        texto += `*${i + 1}.* @${num}\n${barras} *${total}/${limite}*\n`;
        menciones.push(ujid);
    });
    texto += `${SEP}\n_Total: *${todos.length}* usuario(s) con warns_`;
    texto += piePagina(pag, totalPags, 'warnslist');
    await sock.sendMessage(jid, { text: texto, mentions: menciones });
}

async function cmdSetwarnlimit(sock, jid, groupMetadata, senderJid, args) {
    if (!esAdminOOwner(groupMetadata, senderJid)) {
        await sock.sendMessage(jid, { text: '❌ Solo los administradores pueden usar este comando.' });
        return;
    }
    const num = parseInt(args[0]);
    if (isNaN(num) || num < 1) {
        await sock.sendMessage(jid, { text: '❌ Uso: #setwarnlimit <número>' });
        return;
    }
    const g = getGrupo(jid);
    g.limiteAdvertencias = num;
    guardarGrupo(jid, g);
    await sock.sendMessage(jid, { text: `✅ Límite de advertencias establecido en *${num}* para este grupo.` });
}

async function cmdTopmensajes(sock, jid, pagina = 1) {
    const { paginar, piePagina, emblema } = require('./paginator');
    const db = cargarUsuarios();
    const todos = Object.entries(db)
        .map(([jid, u]) => ({ jid, mensajes: u.mensajes || 0 }))
        .sort((a, b) => b.mensajes - a.mensajes);
    const { items: usuarios, pag, totalPags, inicio } = paginar(todos, pagina, 10);
    let texto = '╔══════════════════╗\n║  💬 TOP MENSAJES   ║\n╚══════════════════╝\n\n';
    for (let i = 0; i < usuarios.length; i++) {
        const u = usuarios[i];
        texto += `${emblema(inicio + i)} @${u.jid.split('@')[0]} — *${u.mensajes} mensajes*\n`;
    }
    texto += piePagina(pag, totalPags, 'topmensajes');
    const mentions = usuarios.map(u => u.jid);
    await sock.sendMessage(jid, { text: texto, mentions });
}

async function cmdAlerts(sock, jid, groupMetadata, senderJid, args) {
    if (!esAdmin(groupMetadata, senderJid)) {
        await sock.sendMessage(jid, { text: '❌ Solo los administradores pueden usar este comando.' });
        return;
    }
    const opcion = args[0];
    if (!opcion || !['enable', 'disable', 'on', 'off'].includes(opcion)) {
        await sock.sendMessage(jid, { text: '❌ Uso: #alerts enable | disable' });
        return;
    }
    const g = getGrupo(jid);
    g.alertas = opcion === 'enable' || opcion === 'on';
    guardarGrupo(jid, g);
    await sock.sendMessage(jid, { text: `🔔 Alertas de promote/demote *${g.alertas ? 'activadas ✅' : 'desactivadas ❌'}*` });
}

async function cmdToggleEconomy(sock, jid, groupMetadata, senderJid, args) {
    if (!esAdmin(groupMetadata, senderJid)) {
        await sock.sendMessage(jid, { text: '❌ Solo los administradores pueden usar este comando.' });
        return;
    }
    const opcion = args[0];
    if (!opcion || !['enable', 'disable', 'on', 'off'].includes(opcion)) {
        await sock.sendMessage(jid, { text: '❌ Uso: #economy enable | disable' });
        return;
    }
    const g = getGrupo(jid);
    g.economyOn = opcion === 'enable' || opcion === 'on';
    guardarGrupo(jid, g);
    await sock.sendMessage(jid, { text: `💰 Economía *${g.economyOn ? 'activada ✅' : 'desactivada ❌'}*` });
}

async function cmdToggleGacha(sock, jid, groupMetadata, senderJid, args) {
    if (!esAdminOOwner(groupMetadata, senderJid)) {
        await sock.sendMessage(jid, { text: '❌ Solo los administradores y owners pueden usar este comando.' });
        return;
    }
    const opcion = args[0];
    if (!opcion || !['enable', 'disable', 'on', 'off'].includes(opcion)) {
        await sock.sendMessage(jid, { text: '❌ Uso: #gacha enable | disable' });
        return;
    }
    const g = getGrupo(jid);
    g.gachaOn = opcion === 'enable' || opcion === 'on';
    guardarGrupo(jid, g);
    await sock.sendMessage(jid, { text: `🎴 Gacha *${g.gachaOn ? 'activado ✅' : 'desactivado ❌'}*` });
}

async function cmdToggleNsfw(sock, jid, groupMetadata, senderJid, args) {
    if (!isOwner(senderJid) && !esAdmin(groupMetadata, senderJid)) {
        await sock.sendMessage(jid, { text: '⛔ Solo los admins o el owner del bot pueden activar/desactivar NSFW.' });
        return;
    }
    const opcion = args[0];
    if (!opcion || !['enable', 'disable', 'on', 'off'].includes(opcion)) {
        await sock.sendMessage(jid, { text: '❌ Uso: #nsfw enable | disable' });
        return;
    }
    const g = getGrupo(jid);
    g.nsfw = opcion === 'enable' || opcion === 'on';
    guardarGrupo(jid, g);
    await sock.sendMessage(jid, { text: `🔞 NSFW *${g.nsfw ? 'activado ✅' : 'desactivado ❌'}*` });
}

async function cmdGroupImage(sock, jid, groupMetadata, senderJid, msg) {
    if (!esAdmin(groupMetadata, senderJid)) {
        await sock.sendMessage(jid, { text: '❌ Solo los administradores pueden usar este comando.' });
        return;
    }
    const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    const imgMsg = msg.message?.imageMessage || quoted?.imageMessage;
    if (!imgMsg) {
        await sock.sendMessage(jid, { text: '❌ Envía o responde una imagen con *#groupimage*' });
        return;
    }
    try {
        const stream = await downloadContentFromMessage(imgMsg, 'image');
        let buffer = Buffer.from([]);
        for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk]);
        await sock.updateProfilePicture(jid, buffer);
        await sock.sendMessage(jid, { text: '✅ Imagen del grupo actualizada.' });
    } catch {
        await sock.sendMessage(jid, { text: '❌ No pude cambiar la imagen. Necesito ser administrador.' });
    }
}

async function cmdMsgCount(sock, jid, groupMetadata, senderJid, mencionados) {
    if (!esAdmin(groupMetadata, senderJid)) {
        await sock.sendMessage(jid, { text: '❌ Solo los administradores pueden usar este comando.' });
        return;
    }
    const objetivo = mencionados && mencionados.length > 0 ? mencionados[0] : senderJid;
    const u = getUsuario(objetivo);
    await sock.sendMessage(jid, {
        text: `📊 *Estadísticas de @${objetivo.split('@')[0]}*\n\n💬 Mensajes totales: *${u.mensajes || 0}*\n🎯 Nivel: *${u.nivel || 1}*\n⭐ XP: *${u.experiencia || 0}*`,
        mentions: [objetivo]
    });
}

async function cmdTopInactive(sock, jid, pagina = 1) {
    const { paginar, piePagina } = require('./paginator');
    const db = cargarUsuarios();
    const todos = Object.entries(db)
        .map(([jid, u]) => ({ jid, mensajes: u.mensajes || 0 }))
        .sort((a, b) => a.mensajes - b.mensajes);
    const { items: usuarios, pag, totalPags, inicio } = paginar(todos, pagina, 10);
    let texto = '╔══════════════════╗\n║  😴 TOP INACTIVOS  ║\n╚══════════════════╝\n\n';
    for (let i = 0; i < usuarios.length; i++) {
        const u = usuarios[i];
        texto += `${inicio + i + 1}. @${u.jid.split('@')[0]} — *${u.mensajes} mensajes*\n`;
    }
    texto += piePagina(pag, totalPags, 'topinactive');
    const mentions = usuarios.map(u => u.jid);
    await sock.sendMessage(jid, { text: texto, mentions });
}

async function cmdSetPrimary(sock, jid, groupMetadata, senderJid, mencionados) {
    if (!esAdmin(groupMetadata, senderJid)) {
        await sock.sendMessage(jid, { text: '❌ Solo los administradores pueden usar este comando.' });
        return;
    }
    if (!mencionados || mencionados.length === 0) {
        await sock.sendMessage(jid, { text: '❌ Uso: #setprimary @bot' });
        return;
    }
    const g = getGrupo(jid);
    g.botPrimario = mencionados[0];
    guardarGrupo(jid, g);
    await sock.sendMessage(jid, {
        text: `✅ Bot primario establecido: @${mencionados[0].split('@')[0]}`,
        mentions: mencionados
    });
}

// ── #setgpname / #setgpdesc / #setgpbaner ────────────────────────────────
async function cmdSetGpName(sock, jid, groupMetadata, senderJid, args) {
    if (!groupMetadata) {
        await sock.sendMessage(jid, { text: '❌ Este comando solo funciona en grupos.' });
        return;
    }
    if (!esAdmin(groupMetadata, senderJid) && !isOwner(senderJid)) {
        await sock.sendMessage(jid, { text: '❌ Solo administradores pueden cambiar el nombre del grupo.' });
        return;
    }
    const nombre = args.join(' ').trim();
    if (!nombre) {
        await sock.sendMessage(jid, { text: '❌ Uso: *#setgpname [nuevo nombre]*' });
        return;
    }
    try {
        await sock.groupUpdateSubject(jid, nombre);
        await sock.sendMessage(jid, { text: `✅ Nombre del grupo cambiado a:\n*${nombre}*` });
    } catch (err) {
        await sock.sendMessage(jid, { text: `❌ No pude cambiar el nombre: ${err.message}` });
    }
}

async function cmdSetGpDesc(sock, jid, groupMetadata, senderJid, args) {
    if (!groupMetadata) {
        await sock.sendMessage(jid, { text: '❌ Este comando solo funciona en grupos.' });
        return;
    }
    if (!esAdmin(groupMetadata, senderJid) && !isOwner(senderJid)) {
        await sock.sendMessage(jid, { text: '❌ Solo administradores pueden cambiar la descripción del grupo.' });
        return;
    }
    const desc = args.join(' ').trim();
    if (!desc) {
        await sock.sendMessage(jid, { text: '❌ Uso: *#setgpdesc [nueva descripción]*' });
        return;
    }
    try {
        await sock.groupUpdateDescription(jid, desc);
        await sock.sendMessage(jid, { text: `✅ Descripción del grupo actualizada.` });
    } catch (err) {
        await sock.sendMessage(jid, { text: `❌ No pude cambiar la descripción: ${err.message}` });
    }
}

async function cmdSetTagMode(sock, jid, groupMetadata, senderJid, args, esOwner = false) {
    if (!groupMetadata) {
        await sock.sendMessage(jid, { text: '❌ Este comando solo funciona en grupos.' });
        return;
    }
    if (!esAdmin(groupMetadata, senderJid) && !esOwner) {
        await sock.sendMessage(jid, { text: '⛔ Solo los *admins y owners* pueden cambiar el modo del #tag.' });
        return;
    }
    const opcion = (args[0] || '').toLowerCase();
    if (!['todos', 'admins', 'all', 'admin'].includes(opcion)) {
        const g = getGrupo(jid);
        const actual = (g.tagMode === 'admins') ? '🔒 Solo admins/owners' : '🌐 Todos los miembros';
        await sock.sendMessage(jid, {
            text:
`╭─── ⚙️ #SETTAG ───╮
│ Uso: *#settag todos* — cualquier miembro puede tagear
│      *#settag admins* — solo admins y owners
╰────────────────────╯

🔧 Modo actual: *${actual}*`
        });
        return;
    }
    const modo = (opcion === 'admins' || opcion === 'admin') ? 'admins' : 'todos';
    const g = getGrupo(jid);
    g.tagMode = modo;
    guardarGrupo(jid, g);
    const texto = modo === 'admins'
        ? '🔒 *#tag* ahora es solo para *admins y owners*.'
        : '🌐 *#tag* ahora puede usarlo *cualquier miembro* del grupo.';
    await sock.sendMessage(jid, { text: texto });
}

async function cmdConfig(sock, jid, groupMetadata) {
    const g = getGrupo(jid);

    const on  = '✅';
    const off = '❌';

    const bool = v => v ? on : off;

    const botOn      = bool(g.botActivo !== false);
    const soloAdm    = bool(g.soloAdmin);
    const nsfwOn     = bool(g.nsfw);
    const econOn     = bool(g.economyOn !== false);
    const gachaOn    = bool(g.gachaOn !== false);
    const antilink   = bool(g.antilink);
    const welcome    = bool(g.bienvenida);
    const goodbye    = bool(g.despedida);
    const alertas    = bool(g.alertas !== false);
    const eventosOn  = bool(g.eventosHabilitados);

    const tagMode    = g.tagMode === 'admins' ? '🔒 Solo admins' : '🌐 Todos';
    const warnLim    = g.limiteAdvertencias || 3;
    const moneda     = g.moneda || '🪙';
    const muted      = (g.mutedUsers || []).length;
    const tieneWImg  = !!(g.welcomeImagePath || g.welcomeMedia);
    const tieneGImg  = !!(g.goodbyeImagePath || g.goodbyeMedia);
    const primario   = g.botPrimario ? `@${g.botPrimario.split('@')[0]}` : 'No configurado';

    const sep = '┄'.repeat(26);

    const texto =
`╔══════════════════════════╗
║   ⚙️  CONFIG DEL GRUPO   ║
╚══════════════════════════╝

${sep}
🤖 *ESTADO DEL BOT*
${sep}
${botOn} Bot activo
${soloAdm} Solo admins (#onlyadmin)
${antilink} Anti-link (#antilink)
${alertas} Alertas del sistema (#alerts)
${eventosOn} Eventos aleatorios (#eventoson / #eventosoff)

${sep}
🔞 *CONTENIDO*
${sep}
${nsfwOn} NSFW activado (#nsfw)
${gachaOn} Gacha/Personajes (#gacha)

${sep}
💰 *ECONOMÍA*
${sep}
${econOn} Economía activada (#economy)
${moneda} Moneda del grupo

${sep}
🏷️ *TAG & MENCIONES*
${sep}
${tagMode} Modo #tag
👑 Admin primario: ${primario}

${sep}
👋 *BIENVENIDA & DESPEDIDA*
${sep}
${welcome} Mensaje de bienvenida  ${tieneWImg ? '🖼️' : ''}
${goodbye} Mensaje de despedida  ${tieneGImg ? '🖼️' : ''}

${sep}
⚠️ *MODERACIÓN*
${sep}
📊 Límite de warns: *${warnLim}*
🔇 Usuarios silenciados: *${muted}*

${sep}
_Usa #menu para ver todos los comandos_`;

    const mentions = g.botPrimario ? [g.botPrimario] : [];
    await sock.sendMessage(jid, { text: texto, mentions });
}

module.exports = {
    esAdmin, esBotAdmin, verificarAntilink,
    cmdKick, cmdPromote, cmdDemote, cmdAntilink, cmdClose,
    cmdSetwelcome, cmdSetgoodbye, cmdResetwelcome, cmdResetgoodbye, cmdWelcome, cmdGoodbye, cmdOnlyadmin,
    cmdOpen, cmdWarn, cmdDelwarn, cmdWarns, cmdResetwarns, cmdWarnsList, cmdSetwarnlimit, cmdTopmensajes,
    cmdTempban, cmdTempbans, cmdUntempban,
    cmdModlog, cmdClearmodlog,
    cmdMuteBot, cmdUnmuteBot, cmdMutedList, esMuteadoBot, iniciarCheckMutebots,
    cmdAlerts, cmdToggleEconomy, cmdToggleGacha, cmdToggleNsfw,
    cmdGroupImage, cmdMsgCount, cmdTopInactive, cmdSetPrimary,
    cmdSetWelcomeImage, cmdDelWelcomeImage, cmdSetGoodbyeImage, cmdDelGoodbyeImage,
    cmdSetMultimediaWelcome, cmdSetMultimediaGoodbye,
    cmdSetNsfwMenuMedia, cmdDelNsfwMenuMedia, cmdUploadNsfwMedia, cmdUploadSfwMedia,
    cmdLimpiarUsuarios, cmdSetGpName, cmdSetGpDesc, esAdminOOwner,
    cmdSetTagMode, cmdConfig
};
