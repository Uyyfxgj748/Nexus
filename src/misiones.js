const { getUsuario, guardarUsuario, safeInt } = require('./database');

const POOL_MISIONES = [
    { id: 'work3',   texto: 'Trabaja 3 veces con #work',           tipo: 'trabajos',        meta: 3, premio: 25000 },
    { id: 'work5',   texto: 'Trabaja 5 veces con #work',           tipo: 'trabajos',        meta: 5, premio: 45000 },
    { id: 'rob2',    texto: 'Roba exitosamente 2 veces',           tipo: 'robosExitosos',   meta: 2, premio: 30000 },
    { id: 'bet3',    texto: 'Gana 3 apuestas (coinflip/ruleta)',   tipo: 'apuestasGanadas', meta: 3, premio: 35000 },
    { id: 'trivia3', texto: 'Responde 3 trivias correctamente',    tipo: 'ganadosTrivia',   meta: 3, premio: 20000 },
    { id: 'math3',   texto: 'Gana 3 partidas de matemáticas',      tipo: 'ganadosMath',     meta: 3, premio: 20000 },
    { id: 'fight2',  texto: 'Gana 2 combates PVP',                 tipo: 'victorias',       meta: 2, premio: 30000 },
    { id: 'train3',  texto: 'Entrena 3 veces con #train',          tipo: 'entrenamientos',  meta: 3, premio: 18000 },
    { id: 'crime3',  texto: 'Comete 3 crímenes exitosos',          tipo: 'crimenesOK',      meta: 3, premio: 28000 },
    { id: 'daily1',  texto: 'Reclama tu recompensa diaria',         tipo: 'diarios',         meta: 1, premio: 10000 },
    { id: 'bj1',     texto: 'Gana 1 partida de blackjack',         tipo: 'victoriasBJ',     meta: 1, premio: 22000 },
    { id: 'slots2',  texto: 'Juega slots 2 veces',                 tipo: 'slotsJugados',    meta: 2, premio: 15000 },
];

// ── Misiones semanales — más difíciles, mayores premios ───────────────────
const POOL_SEMANALES = [
    { id: 'sw_work15',  texto: 'Trabaja 15 veces con #work',            tipo: 'trabajos',        meta: 15, premio: 150000 },
    { id: 'sw_rob8',    texto: 'Roba exitosamente 8 veces',             tipo: 'robosExitosos',   meta: 8,  premio: 180000 },
    { id: 'sw_bet15',   texto: 'Gana 15 apuestas cualquier tipo',       tipo: 'apuestasGanadas', meta: 15, premio: 200000 },
    { id: 'sw_fight10', texto: 'Gana 10 combates PVP',                  tipo: 'victorias',       meta: 10, premio: 220000 },
    { id: 'sw_crime10', texto: 'Comete 10 crímenes exitosos',           tipo: 'crimenesOK',      meta: 10, premio: 170000 },
    { id: 'sw_trivia10',texto: 'Responde 10 trivias correctamente',     tipo: 'ganadosTrivia',   meta: 10, premio: 130000 },
    { id: 'sw_daily5',  texto: 'Reclama tu daily 5 días seguidos',      tipo: 'diarios',         meta: 5,  premio: 140000 },
    { id: 'sw_train10', texto: 'Entrena 10 veces con #train',           tipo: 'entrenamientos',  meta: 10, premio: 120000 },
    { id: 'sw_bj5',     texto: 'Gana 5 partidas de blackjack',          tipo: 'victoriasBJ',     meta: 5,  premio: 160000 },
    { id: 'sw_slots10', texto: 'Juega slots 10 veces',                  tipo: 'slotsJugados',    meta: 10, premio: 100000 },
    { id: 'sw_coinflip5', texto: 'Gana 5 coinflips',                    tipo: 'coinflipGanados', meta: 5,  premio: 130000 },
    { id: 'sw_rep5',    texto: 'Recibe 5 puntos de reputación',         tipo: 'repRecibida',     meta: 5,  premio: 110000 },
];

function getDiaNombre() {
    return Math.floor(Date.now() / 86400000);
}

function getSemanaNumero() {
    return Math.floor(Date.now() / (86400000 * 7));
}

function generarMisiones(userId) {
    const u = getUsuario(userId);
    if (!u.misiones) u.misiones = { dia: 0, lista: [], progreso: {}, reclamadas: [] };
    const hoy = getDiaNombre();
    if (u.misiones.dia !== hoy) {
        const shuffled = [...POOL_MISIONES].sort(() => Math.random() - 0.5);
        u.misiones.dia       = hoy;
        u.misiones.lista     = shuffled.slice(0, 3).map(m => m.id);
        u.misiones.progreso  = {};
        u.misiones.reclamadas = [];
        u.misiones.snapshot  = {};
        const c = u.contadores || {};
        POOL_MISIONES.forEach(m => { u.misiones.snapshot[m.tipo] = c[m.tipo] || 0; });
        guardarUsuario(userId, u);
    }
    return u;
}

function generarMisionesSemanales(userId) {
    const u = getUsuario(userId);
    if (!u.misionesSemanales) u.misionesSemanales = { semana: -1, lista: [], reclamadas: [], snapshot: {} };
    const semana = getSemanaNumero();
    if (u.misionesSemanales.semana !== semana) {
        const shuffled = [...POOL_SEMANALES].sort(() => Math.random() - 0.5);
        u.misionesSemanales.semana    = semana;
        u.misionesSemanales.lista     = shuffled.slice(0, 3).map(m => m.id);
        u.misionesSemanales.reclamadas = [];
        u.misionesSemanales.snapshot  = {};
        const c = u.contadores || {};
        POOL_SEMANALES.forEach(m => { u.misionesSemanales.snapshot[m.tipo] = c[m.tipo] || 0; });
        guardarUsuario(userId, u);
    }
    return u;
}

async function cmdMisiones(sock, jid, senderJid) {
    const u       = generarMisiones(senderJid);
    const c       = u.contadores || {};
    const snap    = u.misiones.snapshot || {};
    const lista   = u.misiones.lista || [];
    const reclam  = u.misiones.reclamadas || [];
    const mañana  = ((getDiaNombre() + 1) * 86400000 - Date.now()) / 3600000;

    let txt = `🎯 *Misiones del día*  ⏰ _Expiran en ${mañana.toFixed(1)}h_\n\n`;
    lista.forEach((id, i) => {
        const m = POOL_MISIONES.find(x => x.id === id);
        if (!m) return;
        const progActual = Math.max(0, (c[m.tipo] || 0) - (snap[m.tipo] || 0));
        const progreso   = Math.min(progActual, m.meta);
        const completada = progreso >= m.meta;
        const reclamada  = reclam.includes(id);
        const estado     = reclamada ? '✅ Reclamada' : completada ? '🎁 Lista para reclamar' : `[${progreso}/${m.meta}]`;
        txt += `${i + 1}. ${reclamada ? '~~' : ''}*${m.texto}*${reclamada ? '~~' : ''}\n`;
        txt += `   💰 *${m.premio.toLocaleString()} ⓃNC* — ${estado}\n\n`;
    });
    txt += `_Usa *#claimmission* para reclamar | *#weeklymissions* para ver misiones semanales_`;
    await sock.sendMessage(jid, { text: txt });
}

async function cmdClaimMision(sock, jid, senderJid) {
    const u        = generarMisiones(senderJid);
    const c        = u.contadores || {};
    const snap     = u.misiones.snapshot || {};
    const lista    = u.misiones.lista || [];
    const reclam   = u.misiones.reclamadas || [];

    let totalGanado = 0;
    const nuevas    = [];

    for (const id of lista) {
        if (reclam.includes(id)) continue;
        const m = POOL_MISIONES.find(x => x.id === id);
        if (!m) continue;
        const progActual = Math.max(0, (c[m.tipo] || 0) - (snap[m.tipo] || 0));
        if (progActual >= m.meta) {
            totalGanado += m.premio;
            reclam.push(id);
            nuevas.push(m.texto);
        }
    }

    if (!totalGanado) {
        await sock.sendMessage(jid, { text: '❌ No tienes misiones completadas para reclamar.\nUsa *#missions* para ver tu progreso.' });
        return;
    }

    u.misiones.reclamadas = reclam;
    u.monedas = safeInt(u.monedas) + totalGanado;
    if (!u.contadores) u.contadores = {};
    u.contadores.misionesOK = (u.contadores.misionesOK || 0) + nuevas.length;
    guardarUsuario(senderJid, u);

    const listaTxt = nuevas.map(t => `✅ _${t}_`).join('\n');
    await sock.sendMessage(jid, {
        text: `🎯 *¡Misiones reclamadas!*\n\n${listaTxt}\n\n💰 Total ganado: *+${totalGanado.toLocaleString()} ⓃNexCoins*\n💳 Saldo: *${u.monedas.toLocaleString()}*`
    });
}

async function cmdMisionesSemanales(sock, jid, senderJid) {
    const u      = generarMisionesSemanales(senderJid);
    const c      = u.contadores || {};
    const snap   = u.misionesSemanales.snapshot || {};
    const lista  = u.misionesSemanales.lista || [];
    const reclam = u.misionesSemanales.reclamadas || [];
    const semana = getSemanaNumero();
    const msRestante = ((semana + 1) * 7 * 86400000) - Date.now();
    const diasRestantes = (msRestante / 86400000).toFixed(1);

    let txt = `📅 *Misiones Semanales*  ⏰ _Expiran en ${diasRestantes} días_\n`;
    txt += `_Son más difíciles pero los premios son mayores_ 💎\n\n`;

    lista.forEach((id, i) => {
        const m = POOL_SEMANALES.find(x => x.id === id);
        if (!m) return;
        const progActual = Math.max(0, (c[m.tipo] || 0) - (snap[m.tipo] || 0));
        const progreso   = Math.min(progActual, m.meta);
        const completada = progreso >= m.meta;
        const reclamada  = reclam.includes(id);
        const pct        = Math.round(progreso / m.meta * 10);
        const barra      = '█'.repeat(pct) + '░'.repeat(10 - pct);
        const estado     = reclamada ? '✅ Reclamada' : completada ? '🎁 Lista para reclamar' : `[${barra}] ${progreso}/${m.meta}`;
        txt += `${i + 1}. ${reclamada ? '~~' : ''}*${m.texto}*${reclamada ? '~~' : ''}\n`;
        txt += `   💰 *${m.premio.toLocaleString()} ⓃNC* — ${estado}\n\n`;
    });
    txt += `_Usa *#claimweekly* para reclamar misiones semanales completadas._`;
    await sock.sendMessage(jid, { text: txt });
}

async function cmdClaimMisionSemanal(sock, jid, senderJid) {
    const u      = generarMisionesSemanales(senderJid);
    const c      = u.contadores || {};
    const snap   = u.misionesSemanales.snapshot || {};
    const lista  = u.misionesSemanales.lista || [];
    const reclam = u.misionesSemanales.reclamadas || [];

    let totalGanado = 0;
    const nuevas    = [];

    for (const id of lista) {
        if (reclam.includes(id)) continue;
        const m = POOL_SEMANALES.find(x => x.id === id);
        if (!m) continue;
        const progActual = Math.max(0, (c[m.tipo] || 0) - (snap[m.tipo] || 0));
        if (progActual >= m.meta) {
            totalGanado += m.premio;
            reclam.push(id);
            nuevas.push(m.texto);
        }
    }

    if (!totalGanado) {
        await sock.sendMessage(jid, { text: '❌ No tienes misiones semanales completadas para reclamar.\nUsa *#weeklymissions* para ver tu progreso.' });
        return;
    }

    u.misionesSemanales.reclamadas = reclam;
    u.monedas = safeInt(u.monedas) + totalGanado;
    if (!u.contadores) u.contadores = {};
    u.contadores.misionesSemanalesOK = (u.contadores.misionesSemanalesOK || 0) + nuevas.length;
    guardarUsuario(senderJid, u);

    const listaTxt = nuevas.map(t => `✅ _${t}_`).join('\n');
    await sock.sendMessage(jid, {
        text:
            `📅 *¡Misiones semanales reclamadas!*\n\n${listaTxt}\n\n` +
            `💰 Total ganado: *+${totalGanado.toLocaleString()} ⓃNexCoins*\n` +
            `💳 Saldo: *${u.monedas.toLocaleString()}*\n\n` +
            `_¡Buen trabajo! Las misiones se renuevan cada lunes._`
    });
}

function trackearMision(userId, tipo, cantidad = 1) {
    try {
        const u = getUsuario(userId);
        if (!u.contadores) u.contadores = {};
        u.contadores[tipo] = (u.contadores[tipo] || 0) + cantidad;
        guardarUsuario(userId, u);
    } catch { }
}

module.exports = {
    cmdMisiones, cmdClaimMision,
    cmdMisionesSemanales, cmdClaimMisionSemanal,
    trackearMision, generarMisiones, generarMisionesSemanales
};
