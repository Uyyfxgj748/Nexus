const fs   = require('fs-extra');
const path = require('path');

const RUTA      = path.join(__dirname, '../data/modlogs.json');
const MAX_ITEMS = 100;

const ICONOS = {
    kick:       '🚫 Expulsión',
    tempban:    '🔨 Tempban',
    untempban:  '✅ Untempban',
    warn:       '⚠️ Advertencia',
    delwarn:    '🗑️ Quitar warn',
    resetwarns: '🔄 Reset warns',
    mutebot:    '🔇 Silencio bot',
    unmutebot:  '🔊 Unsilencio bot',
};

function cargarLogs() {
    if (!fs.existsSync(RUTA)) { fs.writeJsonSync(RUTA, {}); return {}; }
    try { return fs.readJsonSync(RUTA); } catch { return {}; }
}

function guardarLogs(data) {
    fs.writeJsonSync(RUTA, data, { spaces: 2 });
}

function registrarAccion(groupJid, adminJid, accion, objetivoJid, extra = '') {
    const db = cargarLogs();
    if (!db[groupJid]) db[groupJid] = [];
    db[groupJid].unshift({ ts: Date.now(), adminJid, accion, objetivoJid, extra });
    if (db[groupJid].length > MAX_ITEMS) db[groupJid] = db[groupJid].slice(0, MAX_ITEMS);
    guardarLogs(db);
}

function getModlog(groupJid, limite = 15) {
    const db = cargarLogs();
    return (db[groupJid] || []).slice(0, limite);
}

function limpiarModlog(groupJid) {
    const db = cargarLogs();
    db[groupJid] = [];
    guardarLogs(db);
}

module.exports = { registrarAccion, getModlog, limpiarModlog, ICONOS };
