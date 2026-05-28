const fs = require('fs-extra');
const path = require('path');
const { downloadContentFromMessage } = require('@whiskeysockets/baileys');
const { isOwner } = require('./owners');
const { getGrupo, guardarGrupo } = require('./database');

const BOT_CONFIG_PATH = path.join(__dirname, '../data/bot_config.json');

function getBotConfig() {
    if (!fs.existsSync(BOT_CONFIG_PATH)) {
        fs.writeJsonSync(BOT_CONFIG_PATH, { prefix: '#', channel: '', link: '' }, { spaces: 2 });
    }
    return fs.readJsonSync(BOT_CONFIG_PATH);
}

function saveBotConfig(cfg) {
    fs.writeJsonSync(BOT_CONFIG_PATH, cfg, { spaces: 2 });
}

async function cmdJoin(sock, jid, senderJid, args) {
    if (!isOwner(senderJid)) {
        await sock.sendMessage(jid, { text: '⛔ Solo el owner puede usar este comando.' });
        return;
    }
    const link = args[0];
    if (!link || !link.includes('chat.whatsapp.com')) {
        await sock.sendMessage(jid, { text: '❌ Uso: *#join [link del grupo]*' });
        return;
    }
    const code = link.split('/').pop();
    try {
        await sock.groupAcceptInvite(code);
        await sock.sendMessage(jid, { text: '✅ ¡Me uní al grupo correctamente!' });
    } catch {
        await sock.sendMessage(jid, { text: '❌ No pude unirme. Verifica el link.' });
    }
}

async function cmdLogout(sock, jid, senderJid) {
    if (!isOwner(senderJid)) {
        await sock.sendMessage(jid, { text: '⛔ Solo el owner puede cerrar la sesión del bot.' });
        return;
    }
    await sock.sendMessage(jid, { text: '🔒 Cerrando sesión... Tendrás que vincular de nuevo el bot.' });
    setTimeout(async () => {
        try {
            const authPath = path.join(__dirname, '../auth_info');
            await fs.remove(authPath);
        } catch {}
        process.exit(0);
    }, 1500);
}

async function cmdSetPrefix(sock, jid, senderJid, args) {
    if (!isOwner(senderJid)) {
        await sock.sendMessage(jid, { text: '⛔ Solo el owner puede cambiar el prefix.' });
        return;
    }
    const nuevo = (args[0] || '').trim();
    if (!nuevo || nuevo.length > 2) {
        await sock.sendMessage(jid, { text: '❌ Uso: *#setprefix [carácter]*\nEjemplo: *#setprefix !*\n\n_Nota: el prefix por defecto *#* siempre seguirá funcionando._' });
        return;
    }
    const cfg = getBotConfig();
    cfg.prefix = nuevo;
    saveBotConfig(cfg);
    await sock.sendMessage(jid, { text: `✅ Prefix establecido a *${nuevo}*\n_El prefix *#* sigue funcionando como respaldo._` });
}

async function cmdSetChannel(sock, jid, senderJid, args) {
    if (!isOwner(senderJid)) {
        await sock.sendMessage(jid, { text: '⛔ Solo el owner puede establecer el canal.' });
        return;
    }
    const link = (args[0] || '').trim();
    if (!link || !link.startsWith('http')) {
        await sock.sendMessage(jid, { text: '❌ Uso: *#setchannel [link]*\nEjemplo: *#setchannel https://whatsapp.com/channel/...*' });
        return;
    }
    const cfg = getBotConfig();
    cfg.channel = link;
    saveBotConfig(cfg);
    await sock.sendMessage(jid, { text: `✅ Canal del bot actualizado:\n${link}` });
}

async function cmdSetLink(sock, jid, senderJid, args) {
    if (!isOwner(senderJid)) {
        await sock.sendMessage(jid, { text: '⛔ Solo el owner puede establecer el link.' });
        return;
    }
    const link = (args[0] || '').trim();
    if (!link || !link.startsWith('http')) {
        await sock.sendMessage(jid, { text: '❌ Uso: *#setlink [link]*' });
        return;
    }
    const cfg = getBotConfig();
    cfg.link = link;
    saveBotConfig(cfg);
    await sock.sendMessage(jid, { text: `✅ Link del bot actualizado:\n${link}` });
}

async function cmdSetPfp(sock, jid, senderJid, msg) {
    if (!isOwner(senderJid)) {
        await sock.sendMessage(jid, { text: '⛔ Solo el owner puede cambiar la foto del bot.' });
        return;
    }
    const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    const imgMsg = msg.message?.imageMessage || quoted?.imageMessage;
    if (!imgMsg) {
        await sock.sendMessage(jid, { text: '❌ Envía o responde a una imagen con *#setpfp*' });
        return;
    }
    try {
        const stream = await downloadContentFromMessage(imgMsg, 'image');
        let buffer = Buffer.from([]);
        for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk]);
        const meId = sock.user?.id?.split(':')[0] + '@s.whatsapp.net';
        await sock.updateProfilePicture(meId, buffer);
        await sock.sendMessage(jid, { text: '✅ Foto de perfil del bot actualizada.' });
    } catch (err) {
        await sock.sendMessage(jid, { text: `❌ No pude actualizar la foto: ${err.message}` });
    }
}

async function cmdSetUsername(sock, jid, senderJid, args) {
    if (!isOwner(senderJid)) {
        await sock.sendMessage(jid, { text: '⛔ Solo el owner puede cambiar el nombre del bot.' });
        return;
    }
    const nombre = args.join(' ').trim();
    if (!nombre) {
        await sock.sendMessage(jid, { text: '❌ Uso: *#setusername [nuevo nombre]*' });
        return;
    }
    try {
        await sock.updateProfileName(nombre);
        await sock.sendMessage(jid, { text: `✅ Nombre del bot actualizado a: *${nombre}*` });
    } catch (err) {
        await sock.sendMessage(jid, { text: `❌ No pude cambiar el nombre: ${err.message}` });
    }
}

async function cmdKickBot(sock, jid, senderJid, args, groupMetadata) {
    if (!isOwner(senderJid)) {
        await sock.sendMessage(jid, { text: '⛔ Solo el owner puede usar este comando.' });
        return;
    }
    let targetJid = null;
    let targetNombre = null;

    const link = args[0];
    if (link && link.includes('chat.whatsapp.com')) {
        const code = link.split('/').pop();
        try {
            const info = await sock.groupGetInviteInfo(code);
            targetJid   = info.id;
            targetNombre = info.subject;
        } catch {
            await sock.sendMessage(jid, { text: '❌ No pude obtener info del link. Verifica que sea válido.' });
            return;
        }
    } else if (groupMetadata) {
        targetJid    = jid;
        targetNombre = groupMetadata.subject || jid;
    } else {
        await sock.sendMessage(jid, {
            text: '❌ Uso:\n• Desde un grupo: *#kickbot*\n• Desde cualquier chat: *#kickbot [link del grupo]*'
        });
        return;
    }

    try {
        await sock.sendMessage(targetJid, {
            text: `👋 El bot ha sido retirado de este grupo por el owner.`
        });
    } catch { }

    try {
        await sock.groupLeave(targetJid);
        await sock.sendMessage(jid, {
            text: `✅ El bot salió del grupo *${targetNombre}* correctamente.`
        });
    } catch {
        await sock.sendMessage(jid, { text: `❌ No pude salir del grupo *${targetNombre}*. Puede que ya no esté en él.` });
    }
}

module.exports = {
    cmdJoin, cmdLogout, cmdSetPrefix, cmdSetChannel, cmdSetLink,
    cmdSetPfp, cmdSetUsername, getBotConfig, saveBotConfig, cmdKickBot
};
