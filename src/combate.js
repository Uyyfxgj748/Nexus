const { getUsuario, guardarUsuario } = require('./database');

function getStats(u) {
    if (!u.stats) u.stats = { fuerza: 10, defensa: 10, suerte: 10, xp: 0, nivel: 1 };
    return u.stats;
}

function subirNivel(stats) {
    let subio = false;
    while (stats.xp >= stats.nivel * 100) {
        stats.xp -= stats.nivel * 100;
        stats.nivel++;
        stats.fuerza += 2;
        stats.defensa += 2;
        stats.suerte += 1;
        subio = true;
    }
    return subio;
}

// ══════════════════════════════════════════
//  VER STATS
// ══════════════════════════════════════════
async function cmdStats(sock, jid, senderJid, mencionados) {
    const targetId = (mencionados && mencionados.length > 0) ? mencionados[0] : senderJid;
    const u = getUsuario(targetId);
    const s = getStats(u);
    const c = u.contadores || {};
    const xpNeeded = s.nivel * 100;
    const barra = '█'.repeat(Math.floor((s.xp / xpNeeded) * 10)) + '░'.repeat(10 - Math.floor((s.xp / xpNeeded) * 10));

    const txt = `⚔️ *Stats de combate*\n\n` +
        `🏅 Nivel: *${s.nivel}*\n` +
        `✨ XP: *${s.xp}/${xpNeeded}* [${barra}]\n\n` +
        `⚔️ Fuerza: *${s.fuerza}*\n` +
        `🛡️ Defensa: *${s.defensa}*\n` +
        `🍀 Suerte: *${s.suerte}*\n\n` +
        `🏆 Victorias: *${c.victorias || 0}*\n` +
        `💔 Derrotas: *${c.derrotas || 0}*\n` +
        `⚡ Combates totales: *${c.combates || 0}*`;

    await sock.sendMessage(jid, { text: txt, mentions: [targetId] });
}

// ══════════════════════════════════════════
//  ENTRENAR  (cooldown: 30 min)
// ══════════════════════════════════════════
async function cmdTrain(sock, jid, senderJid) {
    const u = getUsuario(senderJid);
    const ahora = Date.now();
    const cooldown = 30 * 60 * 1000;   // era 1h → ahora 30min
    if (!u.cooldowns) u.cooldowns = {};
    if (u.cooldowns.train && ahora - u.cooldowns.train < cooldown) {
        const restante = cooldown - (ahora - u.cooldowns.train);
        const m = Math.ceil(restante / 60000);
        await sock.sendMessage(jid, { text: `⏳ Necesitas descansar. Entrena de nuevo en *${m} minutos*` });
        return;
    }
    const s = getStats(u);
    const xpGanada = Math.floor(Math.random() * 30) + 10;
    s.xp += xpGanada;
    const subio = subirNivel(s);
    u.stats = s;
    u.cooldowns.train = ahora;
    if (!u.contadores) u.contadores = {};
    u.contadores.entrenamientos = (u.contadores.entrenamientos || 0) + 1;
    guardarUsuario(senderJid, u);

    let msg = `💪 *¡Entrenamiento completado!*\n\n✨ XP: *+${xpGanada}* → ${s.xp}/${s.nivel * 100}`;
    if (subio) msg += `\n\n🎉 *¡SUBISTE AL NIVEL ${s.nivel}!*\n⚔️ Fuerza: *${s.fuerza}* | 🛡️ Defensa: *${s.defensa}* | 🍀 Suerte: *${s.suerte}*`;
    await sock.sendMessage(jid, { text: msg });
}

// ══════════════════════════════════════════
//  PELEAR  (cooldown: 5 min, sin cambio)
// ══════════════════════════════════════════
async function cmdFight(sock, jid, senderJid, mencionados, pushName) {
    if (!mencionados || !mencionados.length) {
        await sock.sendMessage(jid, { text: '❌ Uso: *#fight @usuario*\nReta a alguien a combate PVP.' });
        return;
    }
    const targetId = mencionados[0];
    if (targetId === senderJid) {
        await sock.sendMessage(jid, { text: '❌ No puedes pelear contigo mismo.' });
        return;
    }
    const uA = getUsuario(senderJid);
    const uD = getUsuario(targetId);
    const ahora = Date.now();
    const cooldown = 5 * 60 * 1000;
    if (!uA.cooldowns) uA.cooldowns = {};
    if (uA.cooldowns.fight && ahora - uA.cooldowns.fight < cooldown) {
        const m = Math.ceil((cooldown - (ahora - uA.cooldowns.fight)) / 60000);
        await sock.sendMessage(jid, { text: `⏳ Espera *${m} minutos* antes de otro combate.` });
        return;
    }

    const sA = getStats(uA);
    const sD = getStats(uD);

    if (!uA.itemsActivos) uA.itemsActivos = {};
    if (!uD.itemsActivos) uD.itemsActivos = {};

    // ── Ítems: Carga Pesada (atacante) ────────────────────────────────────
    let cargaPesadaMsg = '';
    let defD = sD.defensa;
    if (uA.itemsActivos.carga_pesada) {
        defD = Math.round(defD * 0.70);
        delete uA.itemsActivos.carga_pesada;
        cargaPesadaMsg = '\n💣 *¡Carga Pesada!* Defensa enemiga reducida 30%';
    }

    // ── Ítems: Lobo Guardián (reduce daño para quien lo porta) ────────────
    let loboMsgA = '';
    let loboMsgD = '';
    let defA = sA.defensa;
    if (uA.itemsActivos.lobo_guardian && Date.now() < uA.itemsActivos.lobo_guardian) {
        defA = Math.round(defA * 1.40);
        loboMsgA = '\n🐾 *¡Lobo Guardián activo!* Tu defensa es mayor';
    }
    if (uD.itemsActivos.lobo_guardian && Date.now() < uD.itemsActivos.lobo_guardian) {
        defD = Math.round(defD * 1.40);
        loboMsgD = `\n🐾 *¡Lobo Guardián de @${targetId.split('@')[0]}!* Su defensa es mayor`;
    }

    const crA = (sA.suerte / 100) * Math.random() < 0.15 ? 1.5 : 1;
    const crD = (sD.suerte / 100) * Math.random() < 0.15 ? 1.5 : 1;
    const poderA = (sA.fuerza * 2 + defA * 0.5 + Math.random() * 20) * crA;
    const poderD = (sD.fuerza * 2 + defD * 0.5 + Math.random() * 20) * crD;

    const ganoA = poderA > poderD;
    const nombreA = pushName || senderJid.split('@')[0];
    const nombreD = targetId.split('@')[0];

    // Recompensa en coins: 5,000 – 20,000
    const recompensa = Math.floor(Math.random() * 15000) + 5000;
    const xp = Math.floor(Math.random() * 70) + 50;

    if (!uA.contadores) uA.contadores = {};
    if (!uD.contadores) uD.contadores = {};
    uA.contadores.combates = (uA.contadores.combates || 0) + 1;
    uD.contadores.combates = (uD.contadores.combates || 0) + 1;

    if (ganoA) {
        uA.contadores.victorias = (uA.contadores.victorias || 0) + 1;
        uD.contadores.derrotas = (uD.contadores.derrotas || 0) + 1;
        uA.monedas = (uA.monedas || 0) + recompensa;
        sA.xp += xp;
        const subio = subirNivel(sA);
        uA.stats = sA;
        if (subio) uA._combateLvlUp = sA.nivel;
    } else {
        uD.contadores.victorias = (uD.contadores.victorias || 0) + 1;
        uA.contadores.derrotas = (uA.contadores.derrotas || 0) + 1;
        uD.monedas = (uD.monedas || 0) + recompensa;
        sD.xp += xp;
        const subio = subirNivel(sD);
        uD.stats = sD;
        if (subio) uD._combateLvlUp = sD.nivel;
    }

    uA.cooldowns.fight = ahora;
    guardarUsuario(senderJid, uA);
    guardarUsuario(targetId, uD);

    const criticoA = crA > 1 ? ' 💥 *¡CRÍTICO!*' : '';
    const criticoD = crD > 1 ? ' 💥 *¡CRÍTICO!*' : '';
    const ganador = ganoA ? `*${nombreA}*` : `*@${nombreD}*`;
    const perdedor = ganoA ? `*@${nombreD}*` : `*${nombreA}*`;

    const rondas = [
        `🗡️ *${nombreA}* ataca con ${Math.round(poderA)} de poder${criticoA}`,
        `🛡️ *@${nombreD}* defiende con ${Math.round(poderD)} de poder${criticoD}`,
    ];

    const itemsMsgs = cargaPesadaMsg + loboMsgA + loboMsgD;

    let resultado = `⚔️ *¡COMBATE PVP!*\n\n` +
        rondas.join('\n') +
        (itemsMsgs ? `\n${itemsMsgs}` : '') +
        '\n\n' +
        `━━━━━━━━━━━━━━━━\n` +
        `🏆 ¡${ganador} GANA!\n` +
        `💰 +${recompensa.toLocaleString()} ⓃNexCoins | ✨ +${xp} XP\n` +
        `💔 ${perdedor} pierde`;

    await sock.sendMessage(jid, { text: resultado, mentions: [targetId] });
}

module.exports = { cmdStats, cmdTrain, cmdFight, getStats };
