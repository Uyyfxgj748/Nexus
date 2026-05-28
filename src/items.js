const { getUsuario, guardarUsuario } = require('./database');

// ══════════════════════════════════════════
//  CATÁLOGO DE ÍTEMS
// ══════════════════════════════════════════
const ITEMS_DB = {
    escudo: {
        nombre: '🛡️ Escudo',
        desc: 'Bloquea el próximo robo que recibas (1 uso)',
        precio: 15000,
        tipo: 'defensa'
    },
    boost_trabajo: {
        nombre: '💊 Boost de trabajo',
        desc: 'Duplica la ganancia del próximo #work',
        precio: 22000,
        tipo: 'boost'
    },
    dado_suerte: {
        nombre: '🎲 Dado de la suerte',
        desc: 'Multiplica ×1.5 la ganancia de tu próxima apuesta',
        precio: 32000,
        tipo: 'suerte'
    },
    detector: {
        nombre: '🕵️ Detector',
        desc: 'Sube el éxito del próximo #rob al 85%',
        precio: 42000,
        tipo: 'ataque'
    },
    pocion_exp: {
        nombre: '⚗️ Poción de EXP',
        desc: 'Otorga +150 XP de combate al instante',
        precio: 20000,
        tipo: 'combate'
    },
    caja_misteriosa: {
        nombre: '🎁 Caja misteriosa',
        desc: 'Contiene una recompensa aleatoria (puede ser buena... o mala 😈)',
        precio: 10000,
        tipo: 'especial'
    },
    fianza: {
        nombre: '⚖️ Fianza',
        desc: 'Sale de la cárcel inmediatamente (1 uso)',
        precio: 15000,
        tipo: 'especial'
    },

    // ── NUEVOS ÍTEMS ──────────────────────────────────────────────────────
    bendicion_fortuna: {
        nombre: '🔥 Bendición de Fortuna',
        desc: 'Aumenta +25% todas tus ganancias 30 min (work, crime, rob, daily)',
        precio: 28000,
        tipo: 'boost'
    },
    granada_aturd: {
        nombre: '🧨 Granada Aturdidora',
        desc: 'Hace fallar el próximo intento de robo que te hagan (1 uso)',
        precio: 35000,
        tipo: 'defensa'
    },
    cristal_prisma: {
        nombre: '💎 Cristal Prisma',
        desc: 'Duplica la recompensa de tu próxima caja misteriosa',
        precio: 55000,
        tipo: 'especial'
    },
    turbo_apuesta: {
        nombre: '🚀 Turbo-Apuesta',
        desc: 'Tus ganancias en apuestas son ×2 durante 1 hora (#coinflip, #ruleta)',
        precio: 40000,
        tipo: 'boost'
    },
    orbe_predictor: {
        nombre: '🔮 Orbe Predictor',
        desc: 'Revela si tu próximo #rob sería exitoso o fallaría sin ejecutarlo',
        precio: 30000,
        tipo: 'utilidad'
    },
    lobo_guardian: {
        nombre: '🐾 Lobo Guardián',
        desc: 'Reduce 40% el daño recibido en combates PVP durante 24 horas',
        precio: 70000,
        tipo: 'defensa'
    },
    contrabando: {
        nombre: '📦 Paquete de Contrabando',
        desc: 'Recompensa aleatoria: dinero, XP o ítem especial al abrirlo',
        precio: 18000,
        tipo: 'especial'
    },
    carga_pesada: {
        nombre: '💣 Carga Pesada',
        desc: 'Reduce la defensa del enemigo en tu próximo combate PVP',
        precio: 25000,
        tipo: 'ataque'
    },
    chip_energia: {
        nombre: '🧬 Chip de Energía',
        desc: 'Restablece los cooldowns de #work, #crime y #slut al instante',
        precio: 20000,
        tipo: 'utilidad'
    },
    contrato_oscuro: {
        nombre: '💼 Contrato Oscuro',
        desc: 'Los robos tienen 100% de éxito durante 10 minutos',
        precio: 90000,
        tipo: 'ataque'
    },
};

// ── Normaliza el inventario al formato objeto ────────────────────────────────
function getInventario(u) {
    if (Array.isArray(u.inventario)) {
        const nuevo = {};
        for (const key of Object.keys(u.inventario)) {
            if (isNaN(key) && u.inventario[key] > 0) {
                nuevo[key] = u.inventario[key];
            }
        }
        u.inventario = nuevo;
    } else if (!u.inventario || typeof u.inventario !== 'object') {
        u.inventario = {};
    }
    return u.inventario;
}

function tieneItem(u, itemId) {
    const inv = getInventario(u);
    return (inv[itemId] || 0) > 0;
}

function consumirItem(u, itemId) {
    const inv = getInventario(u);
    if ((inv[itemId] || 0) > 0) {
        inv[itemId]--;
        u.inventario = inv;
        return true;
    }
    return false;
}

// ══════════════════════════════════════════
//  COMANDOS
// ══════════════════════════════════════════
async function cmdInventario(sock, jid, senderJid, pagina = 1) {
    const { paginar, piePagina } = require('./paginator');
    const u = getUsuario(senderJid);
    const inv = getInventario(u);
    const todos = Object.entries(inv).filter(([, qty]) => qty > 0);
    const activos = u.itemsActivos || {};
    const ahora = Date.now();

    if (!todos.length) {
        await sock.sendMessage(jid, { text: '🎒 *Inventario vacío*\n\nVisita la tienda con *#shop* y compra ítems con *#buyitem [id]*' });
        return;
    }

    const { items, pag, totalPags } = paginar(todos, pagina, 10);
    let texto = `🎒 *Tu inventario*\n\n`;
    texto += items.map(([id, qty]) => {
        const item = ITEMS_DB[id];
        if (!item) return null;
        let estadoStr = '';
        const val = activos[id];
        if (val === true) {
            estadoStr = ' _(activo ✅)_';
        } else if (typeof val === 'number' && val > ahora) {
            const mins = Math.ceil((val - ahora) / 60000);
            estadoStr = ` _(activo ✅ — ${mins} min)_`;
        }
        return `${item.nombre} ×${qty}${estadoStr}\n_${item.desc}_`;
    }).filter(Boolean).join('\n\n');
    texto += piePagina(pag, totalPags, 'inv');

    await sock.sendMessage(jid, { text: texto });
}

async function cmdShop(sock, jid, pagina = 1) {
    const { paginar, piePagina } = require('./paginator');
    const todos = Object.entries(ITEMS_DB);
    const { items, pag, totalPags } = paginar(todos, pagina, 10);
    const lista = items.map(([id, item]) =>
        `${item.nombre}\n💰 *${item.precio.toLocaleString()} ⓃNexCoins*\n_${item.desc}_\n🔑 \`${id}\``
    ).join('\n───────────\n');
    await sock.sendMessage(jid, {
        text: `🏪 *Tienda de ítems*\n\n${lista}\n\n_Compra con *#buyitem [id]* · Usa con *#useitem [id]*_${piePagina(pag, totalPags, 'shop')}`
    });
}

async function cmdBuyItem(sock, jid, senderJid, args) {
    const itemId = args[0]?.toLowerCase().replace(/[\s-]/g, '_');
    if (!itemId || !ITEMS_DB[itemId]) {
        const ids = Object.keys(ITEMS_DB).join(', ');
        await sock.sendMessage(jid, { text: `❌ Ítem no encontrado.\nIDs válidos: ${ids}\n\nUsa *#shop* para ver la tienda.` });
        return;
    }
    const item = ITEMS_DB[itemId];
    const u = getUsuario(senderJid);

    if (itemId !== 'fianza' && u.encarcelado && Date.now() < u.encarcelado) {
        const min = Math.ceil((u.encarcelado - Date.now()) / 60000);
        await sock.sendMessage(jid, { text: `⛓️ Estás en la cárcel. No puedes comprar nada por *${min} minutos*.\n_Usa *#buyitem fianza* para salir si tienes coins suficientes._` });
        return;
    }

    if (u.monedas < item.precio) {
        await sock.sendMessage(jid, { text: `❌ No tienes suficientes ⓃNexCoins.\nNecesitas *${item.precio.toLocaleString()}* y tienes *${u.monedas.toLocaleString()}*.` });
        return;
    }

    if (itemId === 'fianza') {
        if (!u.encarcelado || Date.now() >= u.encarcelado) {
            await sock.sendMessage(jid, { text: '❌ No estás en la cárcel. No necesitas una fianza.' });
            return;
        }
        u.monedas -= item.precio;
        u.encarcelado = null;
        guardarUsuario(senderJid, u);
        await sock.sendMessage(jid, { text: `⚖️ *¡Saliste de la cárcel!* Pagaste *${item.precio.toLocaleString()} ⓃNexCoins* de fianza.\n💰 Saldo restante: *${u.monedas.toLocaleString()}*` });
        return;
    }

    u.monedas -= item.precio;
    const inv = getInventario(u);
    inv[itemId] = (inv[itemId] || 0) + 1;
    u.inventario = inv;
    guardarUsuario(senderJid, u);
    await sock.sendMessage(jid, { text: `✅ Compraste *${item.nombre}* por *${item.precio.toLocaleString()} ⓃNexCoins*!\n💰 Saldo restante: *${u.monedas.toLocaleString()}*\n\n_Úsalo con *#useitem ${itemId}*_` });
}

async function cmdUseItem(sock, jid, senderJid, args) {
    const itemId = args[0]?.toLowerCase().replace(/[\s-]/g, '_');
    if (!itemId) {
        await sock.sendMessage(jid, { text: '❌ Uso: *#useitem [id]*\nEjemplo: *#useitem escudo*\n\nVe tu inventario con *#inv*' });
        return;
    }
    const item = ITEMS_DB[itemId];
    if (!item) {
        await sock.sendMessage(jid, { text: `❌ Ítem desconocido: *${itemId}*` });
        return;
    }
    const u = getUsuario(senderJid);
    const inv = getInventario(u);
    if ((inv[itemId] || 0) <= 0) {
        await sock.sendMessage(jid, { text: `❌ No tienes *${item.nombre}* en tu inventario.` });
        return;
    }
    if (!u.itemsActivos) u.itemsActivos = {};

    switch (itemId) {

        // ── ÍTEMS ORIGINALES ──────────────────────────────────────────────
        case 'escudo':
            inv[itemId]--;
            u.itemsActivos.escudo = true;
            u.inventario = inv;
            guardarUsuario(senderJid, u);
            await sock.sendMessage(jid, { text: `🛡️ *¡Escudo activado!*\nEl próximo robo que intenten hacerte será bloqueado automáticamente.` });
            break;

        case 'boost_trabajo':
            inv[itemId]--;
            u.itemsActivos.boost_trabajo = true;
            u.inventario = inv;
            guardarUsuario(senderJid, u);
            await sock.sendMessage(jid, { text: `💊 *¡Boost de trabajo activado!*\nTu próximo *#work* dará el doble de coins.` });
            break;

        case 'dado_suerte':
            inv[itemId]--;
            u.itemsActivos.dado_suerte = true;
            u.inventario = inv;
            guardarUsuario(senderJid, u);
            await sock.sendMessage(jid, { text: `🎲 *¡Dado de la suerte activado!*\nTu próxima apuesta (#coinflip o #ruleta) dará ×1.5 coins.` });
            break;

        case 'detector':
            inv[itemId]--;
            u.itemsActivos.detector = true;
            u.inventario = inv;
            guardarUsuario(senderJid, u);
            await sock.sendMessage(jid, { text: `🕵️ *¡Detector activado!*\nTu próximo *#rob* tendrá un 85% de éxito.` });
            break;

        case 'pocion_exp': {
            inv[itemId]--;
            u.inventario = inv;
            if (!u.stats) u.stats = { fuerza: 10, defensa: 10, suerte: 10, xp: 0, nivel: 1 };
            u.stats.xp = (u.stats.xp || 0) + 150;
            const xpNecesaria = (u.stats.nivel || 1) * 100;
            if (u.stats.xp >= xpNecesaria) {
                u.stats.xp -= xpNecesaria;
                u.stats.nivel = (u.stats.nivel || 1) + 1;
                guardarUsuario(senderJid, u);
                await sock.sendMessage(jid, { text: `⚗️ *¡Poción de EXP usada!* +150 XP de combate\n🎉 *¡Subiste al nivel de combate ${u.stats.nivel}!*` });
            } else {
                guardarUsuario(senderJid, u);
                await sock.sendMessage(jid, { text: `⚗️ *¡Poción de EXP usada!* +150 XP de combate\n📊 XP: ${u.stats.xp}/${xpNecesaria}` });
            }
            break;
        }

        case 'caja_misteriosa': {
            inv[itemId]--;
            u.inventario = inv;
            // Cristal Prisma — duplica la recompensa de la caja
            let prismaActivo = false;
            if (u.itemsActivos?.cristal_prisma) {
                delete u.itemsActivos.cristal_prisma;
                prismaActivo = true;
            }
            const randCaja = Math.random();
            let resultado;
            if (randCaja < 0.4) {
                let coins = Math.floor(Math.random() * 40000) + 10000;
                if (prismaActivo) coins *= 2;
                u.monedas += coins;
                resultado = `💰 ¡Encontraste *${coins.toLocaleString()} ⓃNexCoins*!${prismaActivo ? ' 💎 *(×2 Cristal Prisma)*' : ''}`;
            } else if (randCaja < 0.6) {
                const itemsBonus = ['escudo', 'boost_trabajo', 'dado_suerte'];
                const itemBonus = itemsBonus[Math.floor(Math.random() * itemsBonus.length)];
                const cantBonus = prismaActivo ? 2 : 1;
                inv[itemBonus] = (inv[itemBonus] || 0) + cantBonus;
                resultado = `🎁 ¡Encontraste ${prismaActivo ? '*2x*' : 'un'} *${ITEMS_DB[itemBonus].nombre}*!${prismaActivo ? ' 💎 *(×2 Cristal Prisma)*' : ''}`;
            } else if (randCaja < 0.75) {
                let xpCaja = 300;
                if (prismaActivo) xpCaja = 600;
                if (!u.stats) u.stats = { fuerza: 10, defensa: 10, suerte: 10, xp: 0, nivel: 1 };
                u.stats.xp = (u.stats.xp || 0) + xpCaja;
                resultado = `⚗️ ¡Encontraste *+${xpCaja} XP* de combate!${prismaActivo ? ' 💎 *(×2 Cristal Prisma)*' : ''}`;
            } else {
                const perdida = Math.floor(Math.random() * 10000) + 5000;
                u.monedas = Math.max(0, u.monedas - perdida);
                resultado = `💸 ¡Estaba maldita! Perdiste *${perdida.toLocaleString()} ⓃNexCoins*`;
            }
            guardarUsuario(senderJid, u);
            await sock.sendMessage(jid, { text: `🎁 *¡Abriste la caja misteriosa!*\n\n${resultado}\n💰 Coins: *${u.monedas.toLocaleString()}*` });
            break;
        }

        case 'fianza':
            if (!u.encarcelado || Date.now() >= u.encarcelado) {
                await sock.sendMessage(jid, { text: '❌ No estás en la cárcel.' });
                return;
            }
            inv[itemId]--;
            u.inventario = inv;
            u.encarcelado = null;
            guardarUsuario(senderJid, u);
            await sock.sendMessage(jid, { text: `⚖️ *¡Saliste de la cárcel usando tu fianza!*` });
            break;

        // ── NUEVOS ÍTEMS ──────────────────────────────────────────────────
        case 'bendicion_fortuna': {
            inv[itemId]--;
            const expiraBF = Date.now() + 30 * 60 * 1000;
            u.itemsActivos.bendicion_fortuna = expiraBF;
            u.inventario = inv;
            guardarUsuario(senderJid, u);
            const horaFin = new Date(expiraBF).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' });
            await sock.sendMessage(jid, { text: `🔥 *¡Bendición de Fortuna activada!*\nTodas tus ganancias aumentan *+25%* durante *30 minutos*.\n⏰ Expira a las *${horaFin}*\n\n_Aplica en: #work, #crime, #rob, #daily, #slut_` });
            break;
        }

        case 'granada_aturd':
            inv[itemId]--;
            u.itemsActivos.granada_aturd = true;
            u.inventario = inv;
            guardarUsuario(senderJid, u);
            await sock.sendMessage(jid, { text: `🧨 *¡Granada Aturdidora activada!*\nEl próximo robo que alguien te intente hacer *fallará automáticamente*.` });
            break;

        case 'cristal_prisma':
            inv[itemId]--;
            u.itemsActivos.cristal_prisma = true;
            u.inventario = inv;
            guardarUsuario(senderJid, u);
            await sock.sendMessage(jid, { text: `💎 *¡Cristal Prisma activado!*\nLa próxima *#useitem caja_misteriosa* dará el *doble* de recompensas.` });
            break;

        case 'turbo_apuesta': {
            inv[itemId]--;
            const expiraTA = Date.now() + 60 * 60 * 1000;
            u.itemsActivos.turbo_apuesta = expiraTA;
            u.inventario = inv;
            guardarUsuario(senderJid, u);
            const horaFinTA = new Date(expiraTA).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' });
            await sock.sendMessage(jid, { text: `🚀 *¡Turbo-Apuesta activado!*\nTus ganancias en *#coinflip* y *#ruleta* serán *×2* durante *1 hora*.\n⏰ Expira a las *${horaFinTA}*` });
            break;
        }

        case 'orbe_predictor': {
            inv[itemId]--;
            u.inventario = inv;
            let tasaSimulada = 0.45;
            if (u.itemsActivos?.detector) tasaSimulada = 0.85;
            if (u.itemsActivos?.contrato_oscuro && Date.now() < u.itemsActivos.contrato_oscuro) tasaSimulada = 1.0;
            const prediccionExito = Math.random() < tasaSimulada;
            const prediccionTexto = prediccionExito
                ? `✅ *Tu próximo #rob TENDRÍA ÉXITO*\n_Prob. base: ${Math.round(tasaSimulada * 100)}%_`
                : `❌ *Tu próximo #rob FALLARÍA*\n_Prob. base: ${Math.round(tasaSimulada * 100)}%_\n_Considera usar un Detector para mejorar tus chances._`;
            guardarUsuario(senderJid, u);
            await sock.sendMessage(jid, { text: `🔮 *El Orbe Predictor revela...*\n\n${prediccionTexto}\n\n_⚠️ El resultado real puede variar. El orbe fue consumido._` });
            break;
        }

        case 'lobo_guardian': {
            inv[itemId]--;
            const expiraLG = Date.now() + 24 * 60 * 60 * 1000;
            u.itemsActivos.lobo_guardian = expiraLG;
            u.inventario = inv;
            guardarUsuario(senderJid, u);
            const horaFinLG = new Date(expiraLG).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' });
            await sock.sendMessage(jid, { text: `🐾 *¡Lobo Guardián invocado!*\nReducirás el *40% del daño recibido* en combates PVP durante *24 horas*.\n⏰ Expira mañana a las *${horaFinLG}*` });
            break;
        }

        case 'contrabando': {
            inv[itemId]--;
            u.inventario = inv;
            if (!u.stats) u.stats = { fuerza: 10, defensa: 10, suerte: 10, xp: 0, nivel: 1 };
            const randCB = Math.random();
            let resultadoCB;
            if (randCB < 0.45) {
                const coinsCB = Math.floor(Math.random() * 25000) + 5000;
                u.monedas += coinsCB;
                resultadoCB = `💰 *${coinsCB.toLocaleString()} ⓃNexCoins* encontradas en el paquete.`;
            } else if (randCB < 0.70) {
                const xpCB = Math.floor(Math.random() * 200) + 100;
                u.stats.xp = (u.stats.xp || 0) + xpCB;
                resultadoCB = `⚗️ *+${xpCB} XP* de combate encontrado en el paquete.`;
            } else if (randCB < 0.87) {
                const itemsRaros = ['escudo', 'detector', 'dado_suerte', 'granada_aturd'];
                const itemR = itemsRaros[Math.floor(Math.random() * itemsRaros.length)];
                inv[itemR] = (inv[itemR] || 0) + 1;
                resultadoCB = `🎁 ¡Encontraste un *${ITEMS_DB[itemR].nombre}* en el paquete!`;
            } else {
                resultadoCB = `💨 El paquete estaba *completamente vacío*... te engañaron.`;
            }
            u.inventario = inv;
            guardarUsuario(senderJid, u);
            await sock.sendMessage(jid, { text: `📦 *¡Abriste el Paquete de Contrabando!*\n\n${resultadoCB}\n💰 Saldo: *${u.monedas.toLocaleString()} ⓃNC*` });
            break;
        }

        case 'carga_pesada':
            inv[itemId]--;
            u.itemsActivos.carga_pesada = true;
            u.inventario = inv;
            guardarUsuario(senderJid, u);
            await sock.sendMessage(jid, { text: `💣 *¡Carga Pesada preparada!*\nEn tu próximo combate con *#fight*, la defensa de tu enemigo se reducirá un *30%*.` });
            break;

        case 'chip_energia': {
            inv[itemId]--;
            u.inventario = inv;
            delete u.ultimoTrabajo;
            delete u.ultimoCrimen;
            delete u.ultimoSlut;
            guardarUsuario(senderJid, u);
            await sock.sendMessage(jid, { text: `🧬 *¡Chip de Energía instalado!*\nCooldowns reseteados:\n✅ *#work*\n✅ *#crime*\n✅ *#slut*\n\n_¡Ya puedes usar estos comandos de nuevo!_` });
            break;
        }

        case 'contrato_oscuro': {
            inv[itemId]--;
            const expiraCO = Date.now() + 10 * 60 * 1000;
            u.itemsActivos.contrato_oscuro = expiraCO;
            u.inventario = inv;
            guardarUsuario(senderJid, u);
            const horaFinCO = new Date(expiraCO).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' });
            await sock.sendMessage(jid, { text: `💼 *¡Contrato Oscuro firmado!*\nTus robos tendrán *100% de éxito* durante *10 minutos*.\n⏰ Expira a las *${horaFinCO}*\n\n⚠️ _El pago vendrá después..._` });
            break;
        }

        default:
            await sock.sendMessage(jid, { text: `❌ Este ítem no se puede usar manualmente.` });
    }
}

module.exports = { cmdInventario, cmdShop, cmdBuyItem, cmdUseItem, ITEMS_DB, getInventario, tieneItem, consumirItem };
