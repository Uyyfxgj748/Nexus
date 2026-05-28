// ── Cofres del tesoro: #givechest / #claimchest ──────────────────────────────
// Un admin/owner crea un cofre con N coins para los primeros N que reclamen.
// Los cofres se guardan en data/chests.json y persisten en disco.

const fs = require('fs-extra');
const path = require('path');
const { agregarMonedas, getUsuario, guardarUsuario } = require('./database');
const { isOwner } = require('./owners');
const { esAdminOOwner } = require('./admin');

const CHEST_FILE = path.join(__dirname, '../data/chests.json');
const CHEST_TTL_MS = 30 * 60 * 1000; // 30 minutos

function _cargar() {
    try {
        if (fs.existsSync(CHEST_FILE)) return JSON.parse(fs.readFileSync(CHEST_FILE, 'utf8'));
    } catch {}
    return {};
}
function _guardar(data) {
    fs.ensureDirSync(path.dirname(CHEST_FILE));
    fs.writeFileSync(CHEST_FILE, JSON.stringify(data, null, 2));
}

function _limpiarExpirados(data) {
    const ahora = Date.now();
    let cambio = false;
    for (const gid of Object.keys(data)) {
        data[gid] = (data[gid] || []).filter(c => (ahora - c.creado) < CHEST_TTL_MS && c.restantes > 0);
        if (data[gid].length === 0) { delete data[gid]; cambio = true; }
    }
    return cambio;
}

async function cmdGivechest(sock, jid, groupMetadata, senderJid, args) {
    if (!groupMetadata) {
        await sock.sendMessage(jid, { text: '❌ Este comando solo funciona en grupos.' });
        return;
    }
    if (!esAdminOOwner(groupMetadata, senderJid)) {
        await sock.sendMessage(jid, { text: '❌ Solo administradores u owner del bot pueden crear cofres.' });
        return;
    }
    const cantidadGanadores = parseInt(args[0], 10);
    const monedasPorPersona = parseInt(args[1], 10);
    if (!cantidadGanadores || !monedasPorPersona || cantidadGanadores < 1 || monedasPorPersona < 1) {
        await sock.sendMessage(jid, {
            text: '❌ *Uso:* `#givechest <ganadores> <monedas_c/u>`\n\n' +
                  '_Ejemplo:_ `#givechest 5 100` crea un cofre para los *primeros 5* que usen `#claimchest` y cada uno recibe *100 ⓃNexCoins*.'
        });
        return;
    }
    if (cantidadGanadores > 50) {
        await sock.sendMessage(jid, { text: '❌ Máximo *50* ganadores por cofre.' });
        return;
    }
    if (monedasPorPersona > 100000) {
        await sock.sendMessage(jid, { text: '❌ Máximo *100,000 ⓃNexCoins* por persona.' });
        return;
    }
    const total = cantidadGanadores * monedasPorPersona;
    const creador = getUsuario(senderJid);
    if ((creador.monedas || 0) < total) {
        await sock.sendMessage(jid, {
            text: `❌ No tienes suficientes ⓃNexCoins.\n💰 Necesitas: *${total} ⓃNexCoins*\n👛 Tu saldo: *${creador.monedas || 0} ⓃNexCoins*`
        });
        return;
    }
    const data = _cargar();
    _limpiarExpirados(data);
    if (!data[jid]) data[jid] = [];
    const cofre = {
        id: 'c' + Date.now().toString(36),
        creado: Date.now(),
        creador: senderJid,
        ganadores: cantidadGanadores,
        restantes: cantidadGanadores,
        monedas: monedasPorPersona,
        reclamados: []
    };
    data[jid].push(cofre);
    creador.monedas = (creador.monedas || 0) - total;
    guardarUsuario(senderJid, creador);
    _guardar(data);
    const participantes = (groupMetadata.participants || []).map(p => p.id);
    const texto =
`🎁 *¡COFRE DEL TESORO!* 🎁

💰 Monto total: *${total} ⓃNexCoins*
🏆 Ganadores: *${cantidadGanadores}*
💎 Por persona: *${monedasPorPersona} ⓃNexCoins*
⏳ Expira en: *30 min*

✨ Los *primeros ${cantidadGanadores}* en escribir *#claimchest* se llevan el premio.

¡Suerte a todos! 🍀`;
    await sock.sendMessage(jid, { text: texto, mentions: participantes });
}

async function cmdClaimchest(sock, jid, senderJid) {
    const data = _cargar();
    _limpiarExpirados(data);
    const cofres = data[jid] || [];
    // Tomar el cofre más viejo activo donde el sender NO haya reclamado
    const cofre = cofres.find(c => c.restantes > 0 && !c.reclamados.includes(senderJid));
    if (!cofre) {
        const yaReclamado = cofres.find(c => c.reclamados.includes(senderJid));
        if (yaReclamado) {
            await sock.sendMessage(jid, {
                text: `❌ Ya reclamaste el cofre activo, @${senderJid.split('@')[0]}.`,
                mentions: [senderJid]
            });
        } else {
            await sock.sendMessage(jid, { text: '❌ No hay cofres activos en este grupo.\n_Un admin puede crear uno con *#givechest <n> <monedas>*._' });
        }
        return;
    }
    cofre.reclamados.push(senderJid);
    cofre.restantes -= 1;
    agregarMonedas(senderJid, cofre.monedas);
    _guardar(data);

    const u = getUsuario(senderJid);
    const posicion = cofre.ganadores - cofre.restantes;
    let texto =
`🎉 *¡COFRE RECLAMADO!* 🎉

🏆 @${senderJid.split('@')[0]} (puesto *#${posicion}*)
💰 Premio: *${cofre.monedas} ⓃNexCoins*
💼 Saldo: *${u.monedas} ⓃNexCoins*`;
    if (cofre.restantes === 0) {
        texto += `\n\n🔒 *El cofre se ha vaciado.*`;
        // Eliminar el cofre vaciado
        data[jid] = cofres.filter(c => c.id !== cofre.id);
        if (data[jid].length === 0) delete data[jid];
        _guardar(data);
    } else {
        texto += `\n\n📦 Quedan *${cofre.restantes}* premios disponibles.`;
    }
    await sock.sendMessage(jid, { text: texto, mentions: [senderJid] });
}

module.exports = { cmdGivechest, cmdClaimchest };
