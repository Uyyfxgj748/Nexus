/**
 * permisos.js — Validación centralizada de toggles de módulos.
 *
 * Por qué existe este archivo:
 * Antes, cada módulo (handler.js, personajes.js) tenía su propia copia
 * del código que verifica si gacha o economía están activados en el grupo.
 * Eso significa que si mañana agregas un nuevo módulo, tendrías que acordarte
 * de poner la validación ahí también. Con este archivo centralizado, basta con
 * llamar a una función y el bloqueo es automático para todos.
 *
 * Uso:
 *   const { verificarModulo } = require('./permisos');
 *   const bloqueo = verificarModulo('gacha', g, senderJid);
 *   if (bloqueo) return sock.sendMessage(jid, { text: bloqueo }, Q);
 *
 * Retorna null si el comando está permitido, o un string con el mensaje de
 * bloqueo si debe bloquearse.
 */

const { isOwner } = require('./owners');

// Lista de comandos que pertenecen al módulo de ECONOMÍA.
// Si agregas un nuevo comando de economía, agrégalo aquí también.
const CMDS_ECONOMIA = new Set([
    'saldo', 'balance', 'bal', 'coins',
    'economyinfo', 'einfo',
    'diario', 'daily', 'work', 'w', 'trabajar',
    'crime', 'crimen', 'slut',
    'coinflip', 'flip', 'cf',
    'depositar', 'deposit', 'dep', 'd',
    'retirar', 'withdraw', 'with',
    'ruleta', 'roulette', 'rt',
    'robar', 'steal', 'rob',
    'transferir', 'givecoins', 'pay', 'coinsgive',
    'baltop', 'economyboard', 'eboard',
    'richtop', 'toprico', 'ricostop', 'globalrich', 'wealthtop',
    'richtopg', 'richtopgrupo', 'topricogrupo', 'grouptop', 'richtopgroup',
    'leveltop', 'topnivel', 'nivelestop', 'globallevel', 'levelmundo',
    'leveltopg', 'leveltopgrupo', 'topnivelgrupo', 'grouplevel', 'nivelesgroup',
    'tienda', 'shop2', 'tienda2', 'comprar', 'inventario',
    'minar', 'mine', 'adventure', 'aventura',
    'cazar', 'hunt', 'fish', 'pescar',
    'mazmorra', 'dungeon',
    'invertir', 'interest', 'prestamo', 'loan', 'pagarprestamo', 'payloan', 'bancoinfo',
    'blackjack', 'bj', 'hit', 'stand', 'slots', 'jackpot',
    'mision', 'misiones', 'missions', 'claimmision', 'claimdaily',
    'misionessemanal', 'misionessem', 'claimmisionsemanal', 'claimweekly',
    'combate', 'stats', 'train', 'entrenar', 'fight', 'pelear',
    'mercado', 'market', 'listar', 'listing', 'compraroferta', 'buyoffer', 'cancelaroferta',
    'shop', 'itemshop', 'store', 'tiendaitems',
    'inv', 'inventory', 'mochila', 'items',
    'buyitem', 'compraritem', 'useitem', 'usaritem',
    'rep', 'darep', 'reputacion', 'reputation', 'toprep', 'reptop',
    'logros', 'achievements', 'listalogros', 'achievementlist',
    'clan', 'clanes', 'crearclan', 'unirclan', 'salirclan',
    'infoclan', 'editarclan', 'guerraclanes', 'listaclanes',
    'bancoclan', 'depositarclan', 'retirarclan',
    'promoverclan', 'demotar', 'disolvclan', 'kickclan',
    'loot', 'evento', 'eventos', 'catalogo',
    'mascota', 'adoptar', 'petinfo', 'petfeed', 'petplay',
    'hack', 'rankglobal', 'topglobal',
    'misiones', 'semanal',
]);

// Lista de comandos que pertenecen al módulo de GACHA.
// Todos los comandos del sistema de personajes van aquí.
const CMDS_GACHA = new Set([
    'roll', 'rw', 'rollwaifu',
    'harem', 'waifus', 'claims',
    'deletewaifu', 'delwaifu', 'delchar',
    'givechar', 'givewaifu', 'regalar',
    'giveallharem',
    'sell', 'vender',
    'removesale', 'removerventa',
    'haremshop', 'tiendawaifus', 'wshop',
    'trade', 'intercambiar',
    'gachainfo', 'ginfo', 'infogacha',
    'charimage', 'waifuimage', 'cimage', 'wimage',
    'charinfo', 'winfo', 'waifuinfo',
    'charvideo', 'waifuvideo', 'cvideo', 'wvideo',
    'waifusboard', 'waifustop', 'topwaifus', 'wtop',
    'favoritetop', 'favtop',
    'serieinfo', 'ainfo', 'animeinfo',
    'serielist', 'slist', 'animelist',
    'vote', 'votar',
    'setclaimmsg', 'setclaim',
    'delclaimmsg',
    'buyshop', 'comprarshop', 'bshop', 'buychar', 'buyc',
    'claim', 'c', 'reclamar',
]);

/**
 * Verifica si un comando está permitido en el grupo según los toggles activos.
 *
 * @param {string} cmd        Comando base (sin #, sin número de página).
 * @param {object|null} g     Datos del grupo (de getGrupo). Null si es DM.
 * @param {string} senderJid  JID del usuario que envió el comando.
 * @returns {string|null}     Mensaje de bloqueo (string) si está bloqueado, null si está permitido.
 */
function verificarModulo(cmd, g, senderJid) {
    // En DMs (g === null) no hay restricciones de grupo
    if (!g) return null;

    // Los owners nunca son bloqueados por toggles de grupo
    if (isOwner(senderJid)) return null;

    if (g.economyOn === false && CMDS_ECONOMIA.has(cmd)) {
        return '💰 La *Economía* está desactivada en este grupo.\n_Un administrador puede activarla con *#economy enable*._';
    }

    if (g.gachaOn === false && CMDS_GACHA.has(cmd)) {
        return '🎴 El sistema *Gacha* está desactivado en este grupo.\n_Un administrador puede activarlo con *#gacha enable*._';
    }

    return null;
}

/**
 * Verifica específicamente el módulo Gacha para usarlo en personajes.js,
 * que recibe el cmd ya procesado (con número de página eliminado).
 */
function verificarGacha(cmd, g, senderJid) {
    if (!g) return null;
    if (isOwner(senderJid)) return null;
    if (g.gachaOn === false && CMDS_GACHA.has(cmd)) {
        return '🎴 El sistema *Gacha* está desactivado en este grupo.\n_Un administrador puede activarlo con *#gacha enable*._';
    }
    return null;
}

module.exports = { verificarModulo, verificarGacha, CMDS_ECONOMIA, CMDS_GACHA };
