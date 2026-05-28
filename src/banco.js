const { getUsuario, guardarUsuario } = require('./database');

const TASA_INTERES   = 0.05;
const TASA_PRESTAMO  = 1.5;
const MAX_INVERSION  = 5000000;
const MAX_PRESTAMO   = 300000;
const TIEMPO_INTERES = 6 * 60 * 60 * 1000;   // 6 horas
const TIEMPO_PRESTAMO = 24 * 60 * 60 * 1000; // 24 horas

// ══════════════════════════════════════════
//  INVERTIR
// ══════════════════════════════════════════
async function cmdInvertir(sock, jid, senderJid, args) {
    const cantidad = parseInt(args[0]);
    if (isNaN(cantidad) || cantidad <= 0) {
        await sock.sendMessage(jid, {
            text: `❌ Uso: *#invest [cantidad]*\nEj: *#invest 100000*\n\n📈 Tasa: *5% cada 6h* (máx 24h = 20%)\n💡 Máx inversión: *5,000,000 ⓃNexCoins*`
        });
        return;
    }
    const u = getUsuario(senderJid);
    if (!u.inversion) u.inversion = { cantidad: 0, fecha: 0 };
    if (u.inversion.cantidad > 0) {
        const periodos = Math.min(Math.floor((Date.now() - u.inversion.fecha) / TIEMPO_INTERES), 4);
        const interes = Math.floor(u.inversion.cantidad * TASA_INTERES * periodos);
        await sock.sendMessage(jid, {
            text: `⚠️ Ya tienes una inversión activa de *${u.inversion.cantidad.toLocaleString()} ⓃNexCoins*.\nIntereses acumulados: *+${interes.toLocaleString()} ⓃNexCoins*\n\nUsa *#interest* para cobrarlos.`
        });
        return;
    }
    if ((u.monedas || 0) < cantidad) {
        await sock.sendMessage(jid, { text: `❌ No tienes suficientes ⓃNexCoins. Tienes *${(u.monedas || 0).toLocaleString()}*.` });
        return;
    }
    const cant = Math.min(cantidad, MAX_INVERSION);
    u.monedas -= cant;
    u.inversion = { cantidad: cant, fecha: Date.now() };
    if (!u.contadores) u.contadores = {};
    u.contadores.inversiones = (u.contadores.inversiones || 0) + 1;
    guardarUsuario(senderJid, u);
    await sock.sendMessage(jid, {
        text: `📈 *¡Inversión realizada!*\n\n💵 Invertido: *${cant.toLocaleString()} ⓃNexCoins*\n📊 Tasa: *5% cada 6h*\n⏰ Máximo: 24 horas\n\n_Usa *#interest* para reclamar ganancias_`
    });
}

// ══════════════════════════════════════════
//  RECLAMAR INTERESES
// ══════════════════════════════════════════
async function cmdInteres(sock, jid, senderJid) {
    const u = getUsuario(senderJid);
    if (!u.inversion || u.inversion.cantidad === 0) {
        await sock.sendMessage(jid, { text: '❌ No tienes ninguna inversión activa.\n_Invierte con *#invest [cantidad]*_' });
        return;
    }
    const elapsed = Date.now() - u.inversion.fecha;
    const periodos = Math.min(Math.floor(elapsed / TIEMPO_INTERES), 4);
    if (periodos === 0) {
        const restante = TIEMPO_INTERES - elapsed;
        const h = Math.floor(restante / 3600000);
        const m = Math.floor((restante % 3600000) / 60000);
        await sock.sendMessage(jid, {
            text: `⏳ Aún no hay intereses disponibles.\n\n💵 Inversión: *${u.inversion.cantidad.toLocaleString()} ⓃNexCoins*\n⏰ Primer cobro en: *${h}h ${m}m*`
        });
        return;
    }
    const interes = Math.floor(u.inversion.cantidad * TASA_INTERES * periodos);
    const total = u.inversion.cantidad + interes;
    u.monedas = (u.monedas || 0) + total;
    u.inversion = { cantidad: 0, fecha: 0 };
    guardarUsuario(senderJid, u);
    await sock.sendMessage(jid, {
        text: `💹 *¡Intereses cobrados!*\n\n💵 Capital: *${(total - interes).toLocaleString()} ⓃNexCoins*\n📊 Ganancia (*${periodos}×5%*): *+${interes.toLocaleString()} ⓃNexCoins*\n💰 Total cobrado: *${total.toLocaleString()} ⓃNexCoins*\n\n💳 Saldo actual: *${u.monedas.toLocaleString()}*`
    });
}

// ══════════════════════════════════════════
//  PRÉSTAMO
// ══════════════════════════════════════════
async function cmdPrestamo(sock, jid, senderJid, args) {
    const cantidad = parseInt(args[0]);
    if (isNaN(cantidad) || cantidad <= 0) {
        await sock.sendMessage(jid, {
            text: `❌ Uso: *#loan [cantidad]*\nEj: *#loan 50000*\n\n⚠️ Deberás pagar *×1.5* en 24h o perderás monedas automáticamente.\n💡 Máximo: *${MAX_PRESTAMO.toLocaleString()} ⓃNexCoins*`
        });
        return;
    }
    const u = getUsuario(senderJid);
    if (!u.prestamo) u.prestamo = { cantidad: 0, deuda: 0, fecha: 0 };
    if (u.prestamo.cantidad > 0) {
        const restante = Math.max(0, TIEMPO_PRESTAMO - (Date.now() - u.prestamo.fecha));
        const h = Math.floor(restante / 3600000);
        const m = Math.floor((restante % 3600000) / 60000);
        await sock.sendMessage(jid, {
            text: `❌ Ya tienes un préstamo de *${u.prestamo.cantidad.toLocaleString()} ⓃNexCoins*.\n💸 Deuda: *${u.prestamo.deuda.toLocaleString()} ⓃNexCoins*\n⏳ Paga en: *${h}h ${m}m*\n\nUsa *#payloan* para pagar.`
        });
        return;
    }
    const cant = Math.min(cantidad, MAX_PRESTAMO);
    const deuda = Math.floor(cant * TASA_PRESTAMO);
    u.monedas = (u.monedas || 0) + cant;
    u.prestamo = { cantidad: cant, deuda, fecha: Date.now() };
    guardarUsuario(senderJid, u);
    await sock.sendMessage(jid, {
        text: `🏦 *¡Préstamo aprobado!*\n\n💵 Recibiste: *${cant.toLocaleString()} ⓃNexCoins*\n💸 Deuda total (×1.5): *${deuda.toLocaleString()} ⓃNexCoins*\n⏳ Plazo: *24 horas*\n\n⚠️ Usa *#payloan* para pagar.\n😈 Si no pagas, perderás *${deuda.toLocaleString()} ⓃNexCoins* automáticamente.`
    });
}

async function cmdPagarPrestamo(sock, jid, senderJid) {
    const u = getUsuario(senderJid);
    if (!u.prestamo || u.prestamo.cantidad === 0) {
        await sock.sendMessage(jid, { text: '✅ No tienes préstamos pendientes.' });
        return;
    }
    if ((u.monedas || 0) < u.prestamo.deuda) {
        await sock.sendMessage(jid, {
            text: `❌ No tienes suficientes ⓃNexCoins.\n💸 Deuda: *${u.prestamo.deuda.toLocaleString()}* | Tienes: *${u.monedas.toLocaleString()}*`
        });
        return;
    }
    const deuda = u.prestamo.deuda;
    u.monedas -= deuda;
    if (!u.contadores) u.contadores = {};
    u.contadores.prestamosOK = (u.contadores.prestamosOK || 0) + 1;
    u.prestamo = { cantidad: 0, deuda: 0, fecha: 0 };
    guardarUsuario(senderJid, u);
    await sock.sendMessage(jid, { text: `✅ *¡Préstamo pagado!*\n\n💸 Pagaste *${deuda.toLocaleString()} ⓃNexCoins*\n💰 Saldo: *${u.monedas.toLocaleString()}*` });
}

// ══════════════════════════════════════════
//  VER INFO BANCO
// ══════════════════════════════════════════
async function cmdBancoInfo(sock, jid, senderJid) {
    const u = getUsuario(senderJid);
    const inv = u.inversion || { cantidad: 0, fecha: 0 };
    const prest = u.prestamo || { cantidad: 0, deuda: 0, fecha: 0 };

    let txt = `🏦 *Banco Avanzado Nexus*\n\n`;
    txt += `💳 Cartera: *${(u.monedas || 0).toLocaleString()} ⓃNexCoins*\n`;
    txt += `🏦 Banco: *${(u.banco || 0).toLocaleString()} ⓃNexCoins*\n\n`;

    if (inv.cantidad > 0) {
        const p = Math.min(Math.floor((Date.now() - inv.fecha) / TIEMPO_INTERES), 4);
        const intAcum = Math.floor(inv.cantidad * TASA_INTERES * p);
        txt += `📈 *Inversión activa:* ${inv.cantidad.toLocaleString()} ⓃNexCoins\n`;
        txt += `💹 Intereses acumulados: *+${intAcum.toLocaleString()} ⓃNexCoins* (${p} período${p !== 1 ? 's' : ''})\n\n`;
    } else {
        txt += `📈 Sin inversión activa _(#invest)_\n\n`;
    }

    if (prest.cantidad > 0) {
        const restante = Math.max(0, TIEMPO_PRESTAMO - (Date.now() - prest.fecha));
        const h = Math.floor(restante / 3600000);
        const m = Math.floor((restante % 3600000) / 60000);
        txt += `💸 *Préstamo pendiente:* ${prest.deuda.toLocaleString()} ⓃNexCoins\n`;
        txt += `⏳ Tiempo para pagar: *${h}h ${m}m*\n`;
    } else {
        txt += `💸 Sin préstamos pendientes _(#loan)_`;
    }
    await sock.sendMessage(jid, { text: txt });
}

// ══════════════════════════════════════════
//  VERIFICAR DEUDAS VENCIDAS (llamar en cada mensaje)
// ══════════════════════════════════════════
function verificarDeudaVencida(userId) {
    try {
        const { getUsuario, guardarUsuario } = require('./database');
        const u = getUsuario(userId);
        if (!u.prestamo || u.prestamo.cantidad === 0) return null;
        if (Date.now() - u.prestamo.fecha > TIEMPO_PRESTAMO) {
            const deuda = u.prestamo.deuda;
            u.monedas = Math.max(0, (u.monedas || 0) - deuda);
            u.prestamo = { cantidad: 0, deuda: 0, fecha: 0 };
            guardarUsuario(userId, u);
            return `💀 *¡Deuda vencida!* Perdiste *${deuda.toLocaleString()} ⓃNexCoins* por no pagar tu préstamo a tiempo.`;
        }
    } catch { }
    return null;
}

module.exports = { cmdInvertir, cmdInteres, cmdPrestamo, cmdPagarPrestamo, cmdBancoInfo, verificarDeudaVencida };
