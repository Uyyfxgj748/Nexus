// ═══════════════════════════════════════════════════════════════
//  ANTI-BAN — Nexus Bot
//  Tres sistemas: clasificación de comandos, riesgo dinámico,
//  y limitador de media global.
// ═══════════════════════════════════════════════════════════════

// ──────────────────────────────────────────────────────────────
//  1. CLASIFICACIÓN DE COMANDOS POR PESO
//     LIGHT  → informativos, sin media, sin acciones masivas
//     MEDIUM → economía, minijuegos, interacción normal
//     HEAVY  → descargas, NSFW, imageboards, acciones masivas
// ──────────────────────────────────────────────────────────────
const LIGHT_CMDS = new Set([
    'menu', 'ayuda', 'help', 'commands', 'comandos',
    'ping', 'p', 'status', 'botinfo', 'infobot',
    'searchcmd', 'buscarcmd', 'findcmd', 'busc',
    'saldo', 'balance', 'wallet',
    'perfil', 'profile', 'rank', 'nivel', 'xp',
    'baltop', 'top', 'inventario', 'inv', 'tienda', 'shop',
    'harem', 'waifus', 'mywaifu', 'miswaifus',
    'myjid', 'activatebot', 'desactivatebot', 'enablebot', 'disablebot',
    'on', 'off', 'maintenance', 'mantenimiento',
    'info', 'about', 'clanes', 'infoclan', 'clan',
    'logros', 'achievements', 'misiones', 'quests',
    'rep', 'reputacion', 'toprep',
    'afk', 'afklist',
    'poll', 'verdad', 'reto', 'tod',
]);

const HEAVY_CMDS = new Set([
    // Descargas de video/audio
    'yt', 'mp4', 'ytmp4', 'play', 'ytaudio', 'mp3',
    'ytsearch', 'search', 'buscarvideo', 'ytv', 'ytvideo', 'ytdescargar',
    'tiktok', 'tt', 'ttplay', 'tiktokmp3', 'ttaudio',
    'facebook', 'fb', 'fvideo', 'twitter', 'x',
    'instagram', 'ig', 'reel', 'pin', 'pinterest',
    'mediafire', 'mf', 'soundcloud', 'sc', 'spotify', 'sptfy',
    // Media / conversión
    'img', 'hd', 'enhance', 'remini',
    'sticker', 'ss', 'toimage', 'toimg',
    'tovideo', 'tov', 'tomp4', 'gif', 'togif',
    'tovoice', 'read', 'readviewonce', 'rvo',
    // NSFW e imageboards
    'rule34', 'r34', 'gelbooru', 'gel', 'danbooru', 'dan',
    'xbooru', 'xb', 'safebooru', 'sb', 'yandere', 'konachan',
    'nhentai', 'nh', 'e621',
    // Gacha con media
    'roll', 'gacha', 'waifu', 'husbando',
    // Acciones masivas
    'tagall', 'tag', 'hidetag', 'tagsay', 'broadcast',
    // Diagnóstico (hace muchas peticiones)
    'downloaddiag', 'diagdescargas',
]);

function getCommandWeight(cmd) {
    if (HEAVY_CMDS.has(cmd)) return 'HEAVY';
    if (LIGHT_CMDS.has(cmd)) return 'LIGHT';
    return 'MEDIUM';
}

// ──────────────────────────────────────────────────────────────
//  2. SISTEMA DE RIESGO DINÁMICO
//     Cada comando pesado sube el nivel. Si se acumula mucha
//     actividad, el bot añade delays antes de comandos pesados,
//     simulando que "va despacio" como un humano ocupado.
//     El nivel decae automáticamente cada 8 segundos.
// ──────────────────────────────────────────────────────────────
let riskLevel = 0;

// Decaimiento automático: -1 cada 8 s
setInterval(() => {
    if (riskLevel > 0) riskLevel = Math.max(0, riskLevel - 1);
}, 8000);

function increaseRisk(weight) {
    if (weight === 'HEAVY')       riskLevel += 2;
    else if (weight === 'MEDIUM') riskLevel += 1;
    // LIGHT no acumula riesgo
}

function getRiskDelay() {
    if (riskLevel >= 12) return 6000 + Math.floor(Math.random() * 6000);  // 6–12 s
    if (riskLevel >= 6)  return 2000 + Math.floor(Math.random() * 4000);  // 2–6 s
    return 0;  // Nivel normal: sin delay adicional
}

async function applyRiskDelay() {
    const ms = getRiskDelay();
    if (ms > 0) await new Promise(r => setTimeout(r, ms));
}

function getRiskLevel() { return riskLevel; }

// ──────────────────────────────────────────────────────────────
//  3. LIMITADOR DE MEDIA GLOBAL
//     Máximo 20 envíos de media pesada por minuto en todo el bot.
//     Previene ráfagas que WhatsApp detecta como spam automatizado.
// ──────────────────────────────────────────────────────────────
const MEDIA_LIMIT_PER_MIN = 20;
let mediaCount = 0;

// Reset cada 60 s
setInterval(() => { mediaCount = 0; }, 60 * 1000);

function isMediaLimited() {
    if (mediaCount >= MEDIA_LIMIT_PER_MIN) return true;
    mediaCount++;
    return false;
}

function getMediaCount() { return mediaCount; }

module.exports = {
    getCommandWeight,
    increaseRisk,
    applyRiskDelay,
    getRiskLevel,
    isMediaLimited,
    getMediaCount,
    MEDIA_LIMIT_PER_MIN,
};
