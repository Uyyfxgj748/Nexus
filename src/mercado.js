const { getUsuario, guardarUsuario, safeInt } = require('./database');
const fs   = require('fs-extra');
const path = require('path');

const MERCADO_PATH    = path.join(__dirname, '../data/mercado.json');
const MAX_OFERTA_USER = 3;
const EXPIRACION_MS   = 24 * 60 * 60 * 1000; // 24 horas

// ── Ítems válidos para el mercado ─────────────────────────────────────────
const ITEMS_NOMBRES = {
    escudo:        '🛡️ Escudo',
    boost_trabajo: '💊 Boost de trabajo',
    dado_suerte:   '🎲 Dado de la suerte',
    detector:      '🕵️ Detector',
    pocion_exp:    '⚗️ Poción de EXP',
    caja_misteriosa: '🎁 Caja misteriosa',
    fianza:        '⚖️ Fianza',
};

// ── Carga/guardado del mercado ────────────────────────────────────────────
function cargarMercado() {
    fs.ensureFileSync(MERCADO_PATH);
    try {
        const data = fs.readJsonSync(MERCADO_PATH);
        if (!Array.isArray(data)) fs.writeJsonSync(MERCADO_PATH, []);
        return Array.isArray(data) ? data : [];
    } catch {
        fs.writeJsonSync(MERCADO_PATH, []);
        return [];
    }
}

function guardarMercado(lista) {
    try { fs.writeJsonSync(MERCADO_PATH, lista, { spaces: 2 }); } catch {}
}

function limpiarExpiradasYRetornar(lista) {
    const ahora  = Date.now();
    const activas = lista.filter(o => ahora - o.fecha < EXPIRACION_MS);

    // Devolver ítems de ofertas expiradas
    const expiradas = lista.filter(o => ahora - o.fecha >= EXPIRACION_MS);
    for (const oferta of expiradas) {
        try {
            const vendor = getUsuario(oferta.vendedorJid);
            if (!vendor.inventario) vendor.inventario = {};
            vendor.inventario[oferta.item] = safeInt(vendor.inventario[oferta.item]) + safeInt(oferta.cantidad);
            guardarUsuario(oferta.vendedorJid, vendor);
        } catch {}
    }

    return activas;
}

function nextId(lista) {
    if (!lista.length) return 1;
    return Math.max(...lista.map(o => o.id)) + 1;
}

// ─────────────────────────────────────────────────────────────────────────
//  COMANDOS
// ─────────────────────────────────────────────────────────────────────────

/**
 * #mercado — muestra todas las ofertas activas
 */
async function cmdMercado(sock, jid, pagina = 1) {
    const { paginar, piePagina } = require('./paginator');
    let lista = cargarMercado();
    lista = limpiarExpiradasYRetornar(lista);
    guardarMercado(lista);

    if (!lista.length) {
        await sock.sendMessage(jid, {
            text:
                `🏪 *Mercado de usuarios*\n\n` +
                `_No hay ofertas activas en este momento._\n\n` +
                `💡 Puedes poner ítems a la venta con:\n*#listar [item] [cantidad] [precio]*\n\nÍtems disponibles: ${Object.keys(ITEMS_NOMBRES).join(', ')}`
        });
        return;
    }

    const { items: pagItems, pag, totalPags } = paginar(lista, pagina, 10);
    const ahora = Date.now();
    let txt = `🏪 *Mercado de usuarios*\n${'─'.repeat(26)}\n\n`;
    pagItems.forEach(o => {
        const nombre     = ITEMS_NOMBRES[o.item] || o.item;
        const expiresIn  = Math.max(0, EXPIRACION_MS - (ahora - o.fecha));
        const horas      = Math.floor(expiresIn / 3600000);
        txt += `🆔 *#${o.id}* | ${nombre}\n`;
        txt += `   📦 x${o.cantidad} — 💰 *${safeInt(o.precio).toLocaleString()} ⓃNC* c/u\n`;
        txt += `   👤 @${o.vendedorJid.split('@')[0]} | ⏰ Expira en ${horas}h\n\n`;
    });
    txt += `💡 *#comprarof [id]* para comprar | *#listar [item] [cant] [precio]* para vender`;
    txt += piePagina(pag, totalPags, 'mercado');
    await sock.sendMessage(jid, { text: txt, mentions: pagItems.map(o => o.vendedorJid) });
}

/**
 * #listar [item] [cantidad] [precio]
 * Pon tu ítem a la venta en el mercado
 */
async function cmdListar(sock, jid, senderJid, args) {
    if (args.length < 3) {
        await sock.sendMessage(jid, {
            text:
                `❌ Uso: *#listar [item] [cantidad] [precio]*\n\n` +
                `Ejemplo: _#listar escudo 2 8000_\n\n` +
                `Ítems disponibles:\n${Object.entries(ITEMS_NOMBRES).map(([k, v]) => `• \`${k}\` → ${v}`).join('\n')}`
        });
        return;
    }

    const itemKey  = args[0].toLowerCase().replace(/-/g, '_');
    const cantidad = parseInt(args[1]);
    const precio   = parseInt(args[2]);

    if (!ITEMS_NOMBRES[itemKey]) {
        await sock.sendMessage(jid, {
            text: `❌ Ítem inválido: *${args[0]}*\n\nÍtems válidos: ${Object.keys(ITEMS_NOMBRES).join(', ')}`
        });
        return;
    }
    if (isNaN(cantidad) || cantidad <= 0 || cantidad > 99) {
        await sock.sendMessage(jid, { text: '❌ La cantidad debe ser entre 1 y 99.' });
        return;
    }
    if (isNaN(precio) || precio < 100) {
        await sock.sendMessage(jid, { text: '❌ El precio mínimo es *100 ⓃNexCoins*.' });
        return;
    }
    if (precio > 10_000_000) {
        await sock.sendMessage(jid, { text: '❌ El precio máximo por unidad es *10,000,000 ⓃNC*.' });
        return;
    }

    const u = getUsuario(senderJid);
    if (!u.inventario) u.inventario = {};
    if (Array.isArray(u.inventario)) u.inventario = {};

    const cantDisponible = safeInt(u.inventario[itemKey]);
    if (cantDisponible < cantidad) {
        await sock.sendMessage(jid, {
            text: `❌ No tienes suficientes *${ITEMS_NOMBRES[itemKey]}*.\nTienes: *${cantDisponible}* | Necesitas: *${cantidad}*`
        });
        return;
    }

    let lista = cargarMercado();
    lista = limpiarExpiradasYRetornar(lista);

    const ofertasDelUser = lista.filter(o => o.vendedorJid === senderJid);
    if (ofertasDelUser.length >= MAX_OFERTA_USER) {
        await sock.sendMessage(jid, {
            text: `❌ Ya tienes *${MAX_OFERTA_USER} ofertas activas* en el mercado.\nCancela una con *#cancelaroferta [id]* para poder publicar otra.`
        });
        return;
    }

    // Reservar ítems del inventario (escrow)
    u.inventario[itemKey] -= cantidad;
    if (u.inventario[itemKey] <= 0) delete u.inventario[itemKey];
    guardarUsuario(senderJid, u);

    const nueva = {
        id:           nextId(lista),
        vendedorJid:  senderJid,
        vendedorNombre: u.pushName || senderJid.split('@')[0],
        item:         itemKey,
        cantidad,
        precio,
        fecha:        Date.now()
    };
    lista.push(nueva);
    guardarMercado(lista);

    await sock.sendMessage(jid, {
        text:
            `✅ *¡Oferta publicada en el mercado!*\n\n` +
            `📦 Ítem: *${ITEMS_NOMBRES[itemKey]}*\n` +
            `🔢 Cantidad: *${cantidad}*\n` +
            `💰 Precio: *${precio.toLocaleString()} ⓃNC* c/u\n` +
            `🆔 ID de oferta: *#${nueva.id}*\n\n` +
            `⏰ _Expira en 24 horas. Los ítems son devueltos si no se venden._\n` +
            `_Cancela con *#cancelaroferta ${nueva.id}*_`
    });
}

/**
 * #comprarof [id]
 * Compra una oferta del mercado
 */
async function cmdComprarOferta(sock, jid, senderJid, args) {
    const idBuscar = parseInt(args[0]);
    if (isNaN(idBuscar) || idBuscar <= 0) {
        await sock.sendMessage(jid, { text: '❌ Uso: *#comprarof [id de la oferta]*\nVer ofertas con *#mercado*' });
        return;
    }

    let lista = cargarMercado();
    lista = limpiarExpiradasYRetornar(lista);

    const idx = lista.findIndex(o => o.id === idBuscar);
    if (idx === -1) {
        await sock.sendMessage(jid, { text: `❌ La oferta *#${idBuscar}* no existe o ya expiró.` });
        return;
    }

    const oferta = lista[idx];
    if (oferta.vendedorJid === senderJid) {
        await sock.sendMessage(jid, { text: '❌ No puedes comprar tu propia oferta.' });
        return;
    }

    const precioTotal = safeInt(oferta.precio) * safeInt(oferta.cantidad);
    const comprador   = getUsuario(senderJid);

    if (safeInt(comprador.monedas) < precioTotal) {
        await sock.sendMessage(jid, {
            text: `❌ No tienes suficientes ⓃNexCoins.\n💰 Necesitas: *${precioTotal.toLocaleString()}* | Tienes: *${safeInt(comprador.monedas).toLocaleString()}*`
        });
        return;
    }

    // Transferir coins al vendedor
    comprador.monedas = safeInt(comprador.monedas) - precioTotal;
    if (!comprador.inventario || Array.isArray(comprador.inventario)) comprador.inventario = {};
    comprador.inventario[oferta.item] = safeInt(comprador.inventario[oferta.item]) + safeInt(oferta.cantidad);
    guardarUsuario(senderJid, comprador);

    const vendedor = getUsuario(oferta.vendedorJid);
    vendedor.monedas = safeInt(vendedor.monedas) + precioTotal;
    guardarUsuario(oferta.vendedorJid, vendedor);

    // Eliminar oferta del mercado
    lista.splice(idx, 1);
    guardarMercado(lista);

    const nombreItem = ITEMS_NOMBRES[oferta.item] || oferta.item;
    await sock.sendMessage(jid, {
        text:
            `🛒 *¡Compra exitosa!*\n\n` +
            `📦 Ítem: *${nombreItem} x${oferta.cantidad}*\n` +
            `💰 Pagado: *${precioTotal.toLocaleString()} ⓃNC*\n` +
            `👤 Vendedor: @${oferta.vendedorJid.split('@')[0]}\n\n` +
            `💳 Tu saldo: *${safeInt(comprador.monedas).toLocaleString()} ⓃNC*`,
        mentions: [oferta.vendedorJid]
    });
}

/**
 * #cancelaroferta [id]
 * Cancela tu propia oferta y devuelve los ítems
 */
async function cmdCancelarOferta(sock, jid, senderJid, args) {
    const idBuscar = parseInt(args[0]);
    if (isNaN(idBuscar) || idBuscar <= 0) {
        await sock.sendMessage(jid, { text: '❌ Uso: *#cancelaroferta [id de la oferta]*' });
        return;
    }

    let lista = cargarMercado();
    lista = limpiarExpiradasYRetornar(lista);

    const idx = lista.findIndex(o => o.id === idBuscar);
    if (idx === -1) {
        await sock.sendMessage(jid, { text: `❌ La oferta *#${idBuscar}* no existe o ya expiró.` });
        return;
    }

    const oferta = lista[idx];
    if (oferta.vendedorJid !== senderJid) {
        await sock.sendMessage(jid, { text: '❌ Solo puedes cancelar *tus propias* ofertas.' });
        return;
    }

    // Devolver ítems
    const u = getUsuario(senderJid);
    if (!u.inventario || Array.isArray(u.inventario)) u.inventario = {};
    u.inventario[oferta.item] = safeInt(u.inventario[oferta.item]) + safeInt(oferta.cantidad);
    guardarUsuario(senderJid, u);

    lista.splice(idx, 1);
    guardarMercado(lista);

    await sock.sendMessage(jid, {
        text:
            `✅ *Oferta cancelada.*\n\n` +
            `📦 Devuelto: *${ITEMS_NOMBRES[oferta.item] || oferta.item} x${oferta.cantidad}*\n` +
            `_Puedes ver tu inventario con *#inv*_`
    });
}

/**
 * Exportar ofertas activas para el dashboard
 */
function getOfertasActivas() {
    let lista = cargarMercado();
    const ahora = Date.now();
    return lista.filter(o => ahora - o.fecha < EXPIRACION_MS);
}

module.exports = { cmdMercado, cmdListar, cmdComprarOferta, cmdCancelarOferta, getOfertasActivas };
