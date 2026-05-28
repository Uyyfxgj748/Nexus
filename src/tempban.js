const fs   = require('fs-extra');
const path = require('path');

const RUTA = path.join(__dirname, '../data/tempbans.json');

function cargarTempbans() {
    if (!fs.existsSync(RUTA)) { fs.writeJsonSync(RUTA, []); return []; }
    try { return fs.readJsonSync(RUTA); } catch { return []; }
}

function guardarTempbans(data) {
    fs.writeJsonSync(RUTA, data, { spaces: 2 });
}

function parsearDuracion(str) {
    if (!str) return null;
    const regex = /(\d+)\s*(d|h|m|s)/gi;
    let total = 0;
    let match;
    const unidades = { d: 86400000, h: 3600000, m: 60000, s: 1000 };
    while ((match = regex.exec(str)) !== null) {
        total += parseInt(match[1]) * (unidades[match[2].toLowerCase()] || 0);
    }
    return total > 0 ? total : null;
}

function formatearDuracion(ms) {
    const s = Math.floor(ms / 1000);
    const d = Math.floor(s / 86400);
    const h = Math.floor((s % 86400) / 3600);
    const m = Math.floor((s % 3600) / 60);
    const parts = [];
    if (d) parts.push(`${d}d`);
    if (h) parts.push(`${h}h`);
    if (m) parts.push(`${m}m`);
    if (!parts.length) parts.push(`${s}s`);
    return parts.join(' ');
}

function agregarTempban(groupJid, userJid, duracionMs) {
    const bans = cargarTempbans().filter(b => !(b.groupJid === groupJid && b.userJid === userJid));
    bans.push({ groupJid, userJid, expiry: Date.now() + duracionMs });
    guardarTempbans(bans);
}

function eliminarTempban(groupJid, userJid) {
    const bans = cargarTempbans().filter(b => !(b.groupJid === groupJid && b.userJid === userJid));
    guardarTempbans(bans);
}

function getBanActivo(groupJid, userJid) {
    return cargarTempbans().find(b => b.groupJid === groupJid && b.userJid === userJid && b.expiry > Date.now()) || null;
}

let _tempbanInterval = null;

function iniciarCheckTempbans(sock) {
    if (_tempbanInterval) {
        clearInterval(_tempbanInterval);
        _tempbanInterval = null;
    }

    async function verificar() {
        const ahora   = Date.now();
        const bans    = cargarTempbans();
        const activos = [];
        for (const ban of bans) {
            if (ban.expiry <= ahora) {
                try {
                    await sock.groupParticipantsUpdate(ban.groupJid, [ban.userJid], 'add');
                    await sock.sendMessage(ban.groupJid, {
                        text: `✅ @${ban.userJid.split('@')[0]} cumplió su ban temporal y fue reincorporado al grupo.`,
                        mentions: [ban.userJid]
                    });
                } catch { }
            } else {
                activos.push(ban);
            }
        }
        guardarTempbans(activos);
    }

    verificar();
    // Revisar cada 2 minutos en lugar de cada 30s — menos actividad automática
    // en los servidores de WhatsApp (add/remove en grupos)
    _tempbanInterval = setInterval(verificar, 2 * 60 * 1000);
    return _tempbanInterval;
}

module.exports = { parsearDuracion, formatearDuracion, agregarTempban, eliminarTempban, getBanActivo, iniciarCheckTempbans, cargarTempbans };
