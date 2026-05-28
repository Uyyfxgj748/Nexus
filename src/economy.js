const { getUsuario, guardarUsuario, agregarMonedas, quitarMonedas, cargarUsuarios, getGrupo } = require('./database');
const { getInventario } = require('./items');
const { enviarMediaLocal } = require('./mediaUtils');
const fs = require('fs-extra');
const path = require('path');

function trackear(u, tipo, n = 1) {
    if (!u.contadores) u.contadores = {};
    u.contadores[tipo] = (u.contadores[tipo] || 0) + n;
}

function verificarCarcel(u) {
    if (u.encarcelado && Date.now() < u.encarcelado) {
        const min = Math.ceil((u.encarcelado - Date.now()) / 60000);
        return `⛓️ *¡Estás en la cárcel!* No puedes usar comandos de economía por *${min} minuto(s)*.\n_Paga tu fianza con *#buyitem fianza* (25.000 coins) o espera._`;
    }
    return null;
}

function fmtCooldown(ts, ms) {
    if (!ts) return '✅ ¡Listo!';
    const r = ms - (Date.now() - ts);
    if (r <= 0) return '✅ ¡Listo!';
    const h = Math.floor(r / 3600000);
    const m = Math.floor((r % 3600000) / 60000);
    return h > 0 ? `⏳ ${h}h ${m}m` : `⏳ ${m}m`;
}

async function cmdSaldo(sock, jid, senderJid) {
    const u = getUsuario(senderJid);
    await sock.sendMessage(jid, {
        text: `💰 *Tus monedas*\n\n👛 Cartera: *${u.monedas} ⓃNexCoins*\n🏦 Banco: *${u.banco || 0} ⓃNexCoins*\n💎 Total: *${u.monedas + (u.banco || 0)} ⓃNexCoins*`
    });
}

async function cmdEconomyInfo(sock, jid, senderJid) {
    const u = getUsuario(senderJid);
    const db = cargarUsuarios();
    const todos = Object.values(db).map(u2 => (u2.monedas || 0) + (u2.banco || 0)).sort((a, b) => b - a);
    const total = u.monedas + (u.banco || 0);
    const posicion = todos.indexOf(total) + 1;
    const enCarcel = u.encarcelado && Date.now() < u.encarcelado
        ? `⛓️ *En la cárcel:* ${Math.ceil((u.encarcelado - Date.now()) / 60000)} min`
        : '🆓 En libertad';
    const streakTxt = u.dailyStreak ? `🔥 Racha diaria: *${u.dailyStreak}* días` : '🔥 Racha: _Sin iniciar_';

    const texto =
`╔══════════════════════════╗
║    📊 ECONOMY INFO         ║
╚══════════════════════════╝
👛 Cartera : *${u.monedas.toLocaleString()} ⓃNC*
🏦 Banco   : *${(u.banco || 0).toLocaleString()} ⓃNC*
💎 Total   : *${total.toLocaleString()} ⓃNC*
🏆 Posición: *#${posicion}* de ${todos.length} usuarios
${streakTxt}
${enCarcel}

╭─── 💼 FUENTES DE INGRESOS ───╮
│ 🎁 #daily     — ${u.ultimoDiario && Date.now() - u.ultimoDiario < 86400000 ? '⏳ Reclamado' : '✅ ¡Disponible!'} (24h)
│ 💼 #work      — ${fmtCooldown(u.ultimoTrabajo, 30 * 60000)} (30m)
│ 🦹 #crime     — ${fmtCooldown(u.ultimoCrimen, 10 * 60000)} (10-30m)
│ 💃 #slut      — ${fmtCooldown(u.ultimoSlut, 20 * 60000)} (20m)
│ ⛏️ #minar     — ${fmtCooldown(u.ultimoMinar, 15 * 60000)} (15m)
│ 🗺️ #aventura  — ${fmtCooldown(u.ultimoAdventure, 25 * 60000)} (25m)
│ 🏹 #cazar     — ${fmtCooldown(u.ultimoCazar, 15 * 60000)} (15m)
│ 🎣 #pescar    — ${fmtCooldown(u.ultimoFish, 10 * 60000)} (10m)
│ 🏰 #mazmorra  — ${fmtCooldown(u.ultimaMazmorra, 30 * 60000)} (30m)
│ 🎰 #slots     — Sin cooldown
│ 🃏 #blackjack — Sin cooldown
│ 🪙 #coinflip  — Sin cooldown
│ 🎡 #ruleta    — Sin cooldown
╰──────────────────────────╯`;
    await sock.sendMessage(jid, { text: texto });
}

async function cmdDiario(sock, jid, senderJid) {
    const u = getUsuario(senderJid);
    const jail = verificarCarcel(u);
    if (jail) { await sock.sendMessage(jid, { text: jail }); return; }
    const ahora = Date.now();
    const un_dia = 24 * 60 * 60 * 1000;
    const dos_dias = 48 * 60 * 60 * 1000;

    if (u.ultimoDiario && ahora - u.ultimoDiario < un_dia) {
        const restante = un_dia - (ahora - u.ultimoDiario);
        const horas = Math.floor(restante / 3600000);
        const minutos = Math.floor((restante % 3600000) / 60000);
        const streakActual = u.dailyStreak || 1;
        await sock.sendMessage(jid, {
            text: `⏳ Ya recogiste tu diario. Vuelve en *${horas}h ${minutos}m*\n🔥 Racha actual: *${streakActual}* día(s)`
        });
        return;
    }

    // Calcular racha
    let streak = 1;
    if (u.ultimoDiario && (ahora - u.ultimoDiario) < dos_dias) {
        streak = (u.dailyStreak || 1) + 1;
    }
    // Cap de racha en 30 días
    streak = Math.min(streak, 30);

    // Recompensa base: 400–800 aleatoria
    let base = Math.floor(Math.random() * 401) + 400;
    // Bonus de racha: 150 × streak, máximo 3,000
    const bonus = Math.min(streak * 150, 3000);
    let ganadas = base + bonus;

    // Evento fin de semana: +50% (no ×2)
    const hoy = new Date();
    const esFinDeSemana = hoy.getDay() === 0 || hoy.getDay() === 6;
    if (esFinDeSemana) ganadas = Math.floor(ganadas * 1.5);

    // Eventos aleatorios
    const evDiario = obtenerEventoActivo(jid);
    let eventoMsgDiario = '';
    if (esFinDeSemana) {
        eventoMsgDiario = '\n🎉 *¡Fin de semana!* Recompensa ×1.5';
    } else if (evDiario?.tipo === 'lluvia_coins') {
        ganadas = Math.floor(ganadas * 2);
        eventoMsgDiario = '\n🌧️ *¡Lluvia de Coins!* Recompensa ×2';
    } else if (evDiario?.tipo === 'hora_dorada') {
        ganadas = Math.floor(ganadas * 1.25);
        eventoMsgDiario = '\n⭐ *¡Hora Dorada!* Recompensa ×1.25';
    } else if (evDiario?.tipo === 'turbo_laboral') {
        ganadas = Math.floor(ganadas * 1.5);
        eventoMsgDiario = '\n💊 *¡Turbo Laboral!* Recompensa ×1.5';
    } else if (evDiario?.tipo === 'tormenta_legendaria') {
        ganadas = Math.floor(ganadas * 4);
        eventoMsgDiario = '\n⛈️ *¡Tormenta Legendaria!* Recompensa ×4';
    } else if (evDiario?.tipo === 'vendaval_monedas') {
        ganadas = Math.floor(ganadas * 5);
        eventoMsgDiario = '\n💨 *¡Vendaval de Monedas!* Recompensa ×5';
    } else if (evDiario?.tipo === 'suerte_total') {
        ganadas = Math.floor(ganadas * 2);
        eventoMsgDiario = '\n🍀 *¡Suerte Total!* Recompensa ×2';
    } else if (evDiario?.tipo === 'cosecha_abundante') {
        ganadas = Math.floor(ganadas * 1.75);
        eventoMsgDiario = '\n🌾 *¡Cosecha Abundante!* Recompensa ×1.75';
    } else if (evDiario?.tipo === 'fiesta_nexus') {
        ganadas = Math.floor(ganadas * 2);
        eventoMsgDiario = '\n🎊 *¡Fiesta Nexus!* Recompensa ×2';
    }
    if (u.itemsActivos?.bendicion_fortuna && Date.now() < u.itemsActivos.bendicion_fortuna) {
        ganadas = Math.floor(ganadas * 1.25);
        eventoMsgDiario += '\n🔥 *¡Bendición de Fortuna! +25%*';
    }

    // Tope absoluto: 500,000
    ganadas = Math.min(ganadas, 500000);

    u.monedas += ganadas;
    u.ultimoDiario = ahora;
    u.dailyStreak = streak;
    trackear(u, 'diarios');
    guardarUsuario(senderJid, u);

    const streakEmoji = streak >= 30 ? '🌟' : streak >= 14 ? '🔥' : streak >= 7 ? '⚡' : '🔥';
    const eventoMsg = eventoMsgDiario;
    const rachaMsg = streak > 1
        ? `\n${streakEmoji} *Racha:* día *${streak}* (+${bonus} bonus)`
        : `\n🆕 _Racha iniciada — sigue reclamando cada día para obtener más_`;

    await sock.sendMessage(jid, {
        text: `🎁 *¡Recompensa Diaria!*\n\n💰 Base: *+${base} ⓃNC*\n${streak > 1 ? `🎯 Bonus racha: *+${bonus} ⓃNC*\n` : ''}💎 Total obtenido: *+${ganadas} ⓃNC*${eventoMsg}${rachaMsg}\n\n👛 Saldo: *${u.monedas.toLocaleString()} ⓃNC*`
    });
}

async function cmdWork(sock, jid, senderJid) {
    const u = getUsuario(senderJid);
    const jail = verificarCarcel(u);
    if (jail) { await sock.sendMessage(jid, { text: jail }); return; }
    const ahora = Date.now();
    const espera = 45 * 60 * 1000;   // 45 min cooldown
    if (u.ultimoTrabajo && ahora - u.ultimoTrabajo < espera) {
        const restante = espera - (ahora - u.ultimoTrabajo);
        const minutos = Math.ceil(restante / 60000);
        await sock.sendMessage(jid, { text: `⏳ Ya trabajaste. Descansa y vuelve en *${minutos}m*` });
        return;
    }
    const trabajos = [
        { trabajo: 'programador', ganancia: Math.floor(Math.random() * 700) + 500 },
        { trabajo: 'chef', ganancia: Math.floor(Math.random() * 700) + 400 },
        { trabajo: 'médico', ganancia: Math.floor(Math.random() * 700) + 800 },
        { trabajo: 'maestro', ganancia: Math.floor(Math.random() * 700) + 500 },
        { trabajo: 'diseñador', ganancia: Math.floor(Math.random() * 700) + 500 },
        { trabajo: 'streamer', ganancia: Math.floor(Math.random() * 1200) + 300 },
        { trabajo: 'agricultor', ganancia: Math.floor(Math.random() * 600) + 400 },
        { trabajo: 'mecánico', ganancia: Math.floor(Math.random() * 700) + 500 },
        { trabajo: 'youtuber', ganancia: Math.floor(Math.random() * 1200) + 300 },
        { trabajo: 'abogado', ganancia: Math.floor(Math.random() * 1300) + 700 },
        { trabajo: 'futbolista', ganancia: Math.floor(Math.random() * 1900) + 600 },
        { trabajo: 'carpintero', ganancia: Math.floor(Math.random() * 600) + 400 },
    ];
    const trabajo = trabajos[Math.floor(Math.random() * trabajos.length)];
    let ganancia = trabajo.ganancia;
    let boostMsg = '';
    if (u.itemsActivos?.boost_trabajo) {
        ganancia *= 2;
        delete u.itemsActivos.boost_trabajo;
        boostMsg = '\n💊 *¡Boost activo! Ganancia x2*';
    }
    const hoy = new Date();
    if (hoy.getDay() === 0 || hoy.getDay() === 6) {
        ganancia *= 2;
        boostMsg += '\n🎉 *¡Fin de semana! Ganancias x2*';
    }
    const evWork = obtenerEventoActivo(jid);
    if (evWork?.tipo === 'trabajo_extra') {
        ganancia *= 2;
        boostMsg += '\n💼 *¡Jornada Extra! ×2*';
    } else if (evWork?.tipo === 'hora_dorada') {
        ganancia = Math.floor(ganancia * 1.5);
        boostMsg += '\n⭐ *¡Hora Dorada! ×1.5*';
    } else if (evWork?.tipo === 'turbo_laboral') {
        ganancia *= 2;
        boostMsg += '\n💊 *¡Turbo Laboral! ×2*';
    } else if (evWork?.tipo === 'tormenta_legendaria') {
        ganancia *= 3;
        boostMsg += '\n⛈️ *¡Tormenta Legendaria! ×3*';
    } else if (evWork?.tipo === 'suerte_total') {
        ganancia *= 2;
        boostMsg += '\n🍀 *¡Suerte Total! ×2*';
    } else if (evWork?.tipo === 'cosecha_abundante') {
        ganancia = Math.floor(ganancia * 1.75);
        boostMsg += '\n🌾 *¡Cosecha Abundante! ×1.75*';
    } else if (evWork?.tipo === 'fiesta_nexus') {
        ganancia *= 2;
        boostMsg += '\n🎊 *¡Fiesta Nexus! ×2*';
    }
    if (u.itemsActivos?.bendicion_fortuna && Date.now() < u.itemsActivos.bendicion_fortuna) {
        ganancia = Math.floor(ganancia * 1.25);
        boostMsg += '\n🔥 *¡Bendición de Fortuna! +25%*';
    }
    u.monedas += ganancia;
    u.ultimoTrabajo = ahora;
    trackear(u, 'trabajos');
    guardarUsuario(senderJid, u);
    const textoWork = `💼 Trabajaste como *${trabajo.trabajo}* y ganaste *${ganancia} ⓃNexCoins*!${boostMsg}\n💰 Total: *${u.monedas} ⓃNexCoins*`;
    const enviado = await enviarMediaLocal(sock, jid, 'media/jobs/win', textoWork);
    if (!enviado) await sock.sendMessage(jid, { text: textoWork });
}

async function cmdCrime(sock, jid, senderJid, args) {
    const u = getUsuario(senderJid);
    const jail = verificarCarcel(u);
    if (jail) { await sock.sendMessage(jid, { text: jail }); return; }
    const ahora = Date.now();

    const nivel = (args[0] || 'simple').toLowerCase();
    const configs = {
        simple: { espera: 15 * 60 * 1000, exito: 0.60, recompensaMin: 500, recompensaMax: 1500, multaMin: 200, multaMax: 600, crimenes: ['asaltaste una tienda', 'robaste a un transeúnte', 'vendiste mercancía robada', 'estafaste a un turista', 'robaste una bicicleta'] },
        banco:  { espera: 30 * 60 * 1000, exito: 0.40, recompensaMin: 2000, recompensaMax: 5000, multaMin: 800, multaMax: 2000, crimenes: ['asaltaste un banco', 'hackeaste cuentas bancarias', 'robaste una caja fuerte', 'interceptaste transferencias bancarias'] },
        mafia:  { espera: 45 * 60 * 1000, exito: 0.25, recompensaMin: 5000, recompensaMax: 14000, multaMin: 2000, multaMax: 5000, crimenes: ['dirigiste una operación de la mafia', 'controlaste una ruta de drogas', 'ejecutaste un atraco internacional', 'hackeaste el banco central'] },
    };

    if (!configs[nivel]) {
        await sock.sendMessage(jid, { text: '❌ Nivel inválido. Usa:\n*#crime simple* — Crimen menor (60% éxito)\n*#crime banco* — Robo bancario (40% éxito)\n*#crime mafia* — Operación mafia (25% éxito)\n\nMás riesgo = más recompensa.' });
        return;
    }

    const cfg = configs[nivel];

    if (u.ultimoCrimen && ahora - u.ultimoCrimen < cfg.espera) {
        const restante = cfg.espera - (ahora - u.ultimoCrimen);
        const minutos = Math.floor(restante / 60000);
        const segundos = Math.floor((restante % 60000) / 1000);
        await sock.sendMessage(jid, { text: `⏳ La policía te sigue buscando. Espera *${minutos}m ${segundos}s*` });
        return;
    }

    let tasaExito = cfg.exito;
    const rep = u.reputacion || 0;
    if (rep >= 20) tasaExito += 0.05;
    if (rep <= -10) tasaExito -= 0.05;

    const eventoActivo = obtenerEventoActivo(jid);
    let eventoMsg = '';
    let sinCarcel = false;
    let sinMulta = false;
    if (eventoActivo?.tipo === 'redada') {
        tasaExito -= 0.20;
        eventoMsg = '\n🚔 *¡Redada policial activa!* Riesgo aumentado.';
    } else if (eventoActivo?.tipo === 'golpe_grande') {
        tasaExito += 0.15;
        eventoMsg = '\n💰 *¡El Golpe Grande!* Mayor probabilidad de éxito.';
    } else if (eventoActivo?.tipo === 'caos_criminal') {
        tasaExito += 0.25;
        eventoMsg = '\n🦹 *¡Caos Criminal!* La policía está distraída.';
    } else if (eventoActivo?.tipo === 'noche_oscura') {
        tasaExito += 0.30;
        sinCarcel = true;
        eventoMsg = '\n🌑 *¡Noche Oscura!* +30% éxito, sin riesgo de cárcel.';
    } else if (eventoActivo?.tipo === 'hora_oscura') {
        tasaExito += 0.40;
        eventoMsg = '\n😈 *¡La Hora Oscura!* +40% probabilidad de éxito.';
    } else if (eventoActivo?.tipo === 'tregua_policial') {
        sinCarcel = true;
        sinMulta = true;
        eventoMsg = '\n🕊️ *¡Tregua Policial!* Sin multa ni cárcel al fallar.';
    }

    const exito = Math.random() < tasaExito;
    u.ultimoCrimen = ahora;

    const emojis = { simple: '🦹', banco: '🏦', mafia: '🎩' };
    const emoji = emojis[nivel];

    if (exito) {
        let ganancia = Math.floor(Math.random() * (cfg.recompensaMax - cfg.recompensaMin)) + cfg.recompensaMin;
        const crimen = cfg.crimenes[Math.floor(Math.random() * cfg.crimenes.length)];
        if (u.itemsActivos?.bendicion_fortuna && Date.now() < u.itemsActivos.bendicion_fortuna) {
            ganancia = Math.floor(ganancia * 1.25);
            eventoMsg += '\n🔥 *¡Bendición de Fortuna! +25%*';
        }
        u.monedas += ganancia;
        trackear(u, 'crimenesOK');
        guardarUsuario(senderJid, u);
        const textoCrimeWin = `${emoji} ¡Éxito! *${crimen}*${eventoMsg}\n✅ Ganaste *${ganancia} ⓃNexCoins*!\n💰 Total: *${u.monedas} ⓃNexCoins*`;
        const envCrimeW = await enviarMediaLocal(sock, jid, 'media/crime/win', textoCrimeWin);
        if (!envCrimeW) await sock.sendMessage(jid, { text: textoCrimeWin });
    } else {
        const multa = Math.floor(Math.random() * (cfg.multaMax - cfg.multaMin)) + cfg.multaMin;
        const motivos = ['te atrapó la policía', 'un testigo te delató', 'fallaste en el intento', 'las cámaras te grabaron'];
        const motivo = motivos[Math.floor(Math.random() * motivos.length)];
        if (!sinMulta) u.monedas = Math.max(0, u.monedas - multa);

        let carcelMsg = '';
        if (!sinCarcel && (nivel === 'banco' || nivel === 'mafia')) {
            const tiempoCarcel = nivel === 'mafia' ? 15 : 8;
            u.encarcelado = ahora + tiempoCarcel * 60 * 1000;
            carcelMsg = `\n⛓️ *¡Estás en la cárcel por ${tiempoCarcel} minutos!*\n_Usa *#buyitem fianza* (25.000 coins) para salir antes._`;
        }

        guardarUsuario(senderJid, u);
        const multaTexto = sinMulta ? '_(sin multa por evento)_' : `❌ Perdiste *${multa} ⓃNexCoins*`;
        const textoCrimeLose = `🚨 *¡Te atraparon!* ${motivo}${eventoMsg}\n${multaTexto}\n💰 Total: *${u.monedas} ⓃNexCoins*${carcelMsg}`;
        const envCrimeL = await enviarMediaLocal(sock, jid, 'media/crime/lose', textoCrimeLose);
        if (!envCrimeL) await sock.sendMessage(jid, { text: textoCrimeLose });
    }
}

function obtenerEventoActivo(jid) {
    const EVENT_PATH = path.join(__dirname, '../data/evento_activo.json');
    try {
        if (jid && jid.endsWith('@g.us')) {
            const g = getGrupo(jid);
            if (!g.eventosHabilitados) return null;
        }
        if (fs.existsSync(EVENT_PATH)) {
            const ev = fs.readJsonSync(EVENT_PATH);
            if (ev && ev.expira && Date.now() < ev.expira) return ev;
        }
    } catch { }
    return null;
}

async function cmdSlut(sock, jid, senderJid) {
    const u = getUsuario(senderJid);
    const jail = verificarCarcel(u);
    if (jail) { await sock.sendMessage(jid, { text: jail }); return; }
    const ahora = Date.now();
    const espera = 30 * 60 * 1000;   // 30 min cooldown
    if (u.ultimoSlut && ahora - u.ultimoSlut < espera) {
        const restante = espera - (ahora - u.ultimoSlut);
        const minutos = Math.ceil(restante / 60000);
        await sock.sendMessage(jid, { text: `⏳ Necesitas descansar. Vuelve en *${minutos}m*` });
        return;
    }
    const exito = Math.random() < 0.7;
    u.ultimoSlut = ahora;
    if (exito) {
        let ganancia = Math.floor(Math.random() * 900) + 300;
        let slutBoostMsg = '';
        if (u.itemsActivos?.bendicion_fortuna && Date.now() < u.itemsActivos.bendicion_fortuna) {
            ganancia = Math.floor(ganancia * 1.25);
            slutBoostMsg = '\n🔥 *¡Bendición de Fortuna! +25%*';
        }
        const acciones = [
            `te ganaste *${ganancia} ⓃNexCoins* en una noche loca`,
            `un cliente generoso te dio *${ganancia} ⓃNexCoins* de propina`,
            `hiciste un show privado y te pagaron *${ganancia} ⓃNexCoins*`,
        ];
        const accion = acciones[Math.floor(Math.random() * acciones.length)];
        u.monedas += ganancia;
        guardarUsuario(senderJid, u);
        const textoSlutWin = `💃 ¡${accion}!${slutBoostMsg}\n💰 Total: *${u.monedas} ⓃNexCoins*`;
        const env1 = await enviarMediaLocal(sock, jid, 'media/jobs/win', textoSlutWin);
        if (!env1) await sock.sendMessage(jid, { text: textoSlutWin });
    } else {
        const perdida = Math.floor(Math.random() * 300) + 100;
        u.monedas = Math.max(0, u.monedas - perdida);
        guardarUsuario(senderJid, u);
        const textoSlutLose = `😞 No hubo clientes hoy y perdiste *${perdida.toLocaleString()} ⓃNexCoins* en gastos\n💰 Total: *${u.monedas.toLocaleString()} ⓃNexCoins*`;
        const env2 = await enviarMediaLocal(sock, jid, 'media/jobs/lose', textoSlutLose);
        if (!env2) await sock.sendMessage(jid, { text: textoSlutLose });
    }
}

async function cmdCoinflip(sock, jid, senderJid, args) {
    const cantidad = parseInt(args[0]);
    const eleccion = args[1]?.toLowerCase();
    if (isNaN(cantidad) || cantidad <= 0 || !['cara', 'cruz', 'heads', 'tails'].includes(eleccion)) {
        await sock.sendMessage(jid, { text: '❌ Uso: *#coinflip [cantidad] [cara/cruz]*\nEjemplo: #coinflip 100 cara' });
        return;
    }
    const u = getUsuario(senderJid);
    const jail = verificarCarcel(u);
    if (jail) { await sock.sendMessage(jid, { text: jail }); return; }
    if (u.monedas < cantidad) {
        await sock.sendMessage(jid, { text: '❌ No tienes suficientes ⓃNexCoins.' });
        return;
    }
    const esCara = ['cara', 'heads'].includes(eleccion);
    const resultado = Math.random() < 0.5 ? 'cara' : 'cruz';
    const gano = (esCara && resultado === 'cara') || (!esCara && resultado === 'cruz');
    let dadoMsg = '';
    if (gano) {
        let ganar = cantidad;
        if (u.itemsActivos?.dado_suerte) {
            ganar = Math.floor(ganar * 1.5);
            delete u.itemsActivos.dado_suerte;
            dadoMsg = '\n🎲 *¡Dado de la suerte! ×1.5*';
        }
        if (u.itemsActivos?.turbo_apuesta && Date.now() < u.itemsActivos.turbo_apuesta) {
            ganar = ganar * 2;
            dadoMsg += '\n🚀 *¡Turbo-Apuesta! Ganancias ×2*';
        }
        u.monedas += ganar;
        trackear(u, 'apuestasGanadas');
        trackear(u, 'coinflipGanados');
        guardarUsuario(senderJid, u);
        await sock.sendMessage(jid, {
            text: `🪙 La moneda cayó en *${resultado}* ${resultado === 'cara' ? '😎' : '🔄'}\n✅ ¡Ganaste *${ganar} ⓃNexCoins*!${dadoMsg}\n💰 Total: *${u.monedas}*`
        });
    } else {
        u.monedas -= cantidad;
        guardarUsuario(senderJid, u);
        await sock.sendMessage(jid, {
            text: `🪙 La moneda cayó en *${resultado}* ${resultado === 'cara' ? '😎' : '🔄'}\n❌ Perdiste *${cantidad} ⓃNexCoins*\n💰 Total: *${u.monedas}*`
        });
    }
}

async function cmdDeposit(sock, jid, senderJid, args) {
    const u = getUsuario(senderJid);
    let cantidad;
    if (args[0] === 'all') {
        cantidad = u.monedas;
    } else {
        cantidad = parseInt(args[0]);
    }
    if (isNaN(cantidad) || cantidad <= 0) {
        await sock.sendMessage(jid, { text: '❌ Uso: #depositar [cantidad | all]' });
        return;
    }
    if (u.monedas < cantidad) {
        await sock.sendMessage(jid, { text: '❌ No tienes suficientes ⓃNexCoins en tu cartera.' });
        return;
    }
    u.monedas -= cantidad;
    u.banco = (u.banco || 0) + cantidad;
    guardarUsuario(senderJid, u);
    await sock.sendMessage(jid, { text: `🏦 Depositaste *${cantidad} ⓃNexCoins* en el banco.\n💰 Cartera: *${u.monedas}* | 🏦 Banco: *${u.banco}*` });
}

async function cmdWithdraw(sock, jid, senderJid, args) {
    const u = getUsuario(senderJid);
    let cantidad;
    if (args[0] === 'all') {
        cantidad = u.banco || 0;
    } else {
        cantidad = parseInt(args[0]);
    }
    if (isNaN(cantidad) || cantidad <= 0) {
        await sock.sendMessage(jid, { text: '❌ Uso: #retirar [cantidad | all]' });
        return;
    }
    if ((u.banco || 0) < cantidad) {
        await sock.sendMessage(jid, { text: '❌ No tienes suficientes ⓃNexCoins en el banco.' });
        return;
    }
    u.banco -= cantidad;
    u.monedas += cantidad;
    guardarUsuario(senderJid, u);
    await sock.sendMessage(jid, { text: `💸 Retiraste *${cantidad} ⓃNexCoins* del banco.\n💰 Cartera: *${u.monedas}* | 🏦 Banco: *${u.banco}*` });
}

async function cmdRoulette(sock, jid, senderJid, args) {
    const color = args[0]?.toLowerCase();
    const cantidad = parseInt(args[1]);
    if (!color || !['rojo', 'negro', 'red', 'black'].includes(color) || isNaN(cantidad) || cantidad <= 0) {
        await sock.sendMessage(jid, { text: '❌ Uso: #ruleta [rojo|negro] [cantidad]\nEjemplo: #ruleta rojo 100' });
        return;
    }
    const u = getUsuario(senderJid);
    const jail = verificarCarcel(u);
    if (jail) { await sock.sendMessage(jid, { text: jail }); return; }
    if (u.monedas < cantidad) {
        await sock.sendMessage(jid, { text: '❌ No tienes suficientes ⓃNexCoins.' });
        return;
    }
    const esRojo = ['rojo', 'red'].includes(color);
    const resultado = Math.random() < 0.5 ? 'rojo' : 'negro';
    const gano = (esRojo && resultado === 'rojo') || (!esRojo && resultado === 'negro');
    if (gano) {
        let ganar = cantidad;
        let dadoMsg = '';
        if (u.itemsActivos?.dado_suerte) {
            ganar = Math.floor(ganar * 1.5);
            delete u.itemsActivos.dado_suerte;
            dadoMsg = '\n🎲 *¡Dado de la suerte! ×1.5*';
        }
        if (u.itemsActivos?.turbo_apuesta && Date.now() < u.itemsActivos.turbo_apuesta) {
            ganar = ganar * 2;
            dadoMsg += '\n🚀 *¡Turbo-Apuesta! Ganancias ×2*';
        }
        u.monedas += ganar;
        trackear(u, 'apuestasGanadas');
        trackear(u, 'ruletasGanadas');
        guardarUsuario(senderJid, u);
        await sock.sendMessage(jid, { text: `🎰 La ruleta cayó en *${resultado}* ${resultado === 'rojo' ? '🔴' : '⚫'}\n✅ ¡Ganaste *${ganar} ⓃNexCoins*!${dadoMsg}\n💰 Total: *${u.monedas}*` });
    } else {
        u.monedas -= cantidad;
        guardarUsuario(senderJid, u);
        await sock.sendMessage(jid, { text: `🎰 La ruleta cayó en *${resultado}* ${resultado === 'rojo' ? '🔴' : '⚫'}\n❌ Perdiste *${cantidad} ⓃNexCoins*\n💰 Total: *${u.monedas}*` });
    }
}

async function cmdSteal(sock, jid, senderJid, mencionados) {
    if (!mencionados || mencionados.length === 0) {
        await sock.sendMessage(jid, { text: '❌ Uso: #robar @usuario' });
        return;
    }
    const objetivo = mencionados[0];
    if (objetivo === senderJid) {
        await sock.sendMessage(jid, { text: '❌ No puedes robarte a ti mismo.' });
        return;
    }

    const uSender = getUsuario(senderJid);
    const jail = verificarCarcel(uSender);
    if (jail) { await sock.sendMessage(jid, { text: jail }); return; }

    const ahora = Date.now();
    const cooldownSteal = 20 * 60 * 1000;   // 20 min cooldown

    if (!uSender.cooldowns) uSender.cooldowns = {};
    const ultimoRobo = uSender.cooldowns.steal || 0;
    if (ahora - ultimoRobo < cooldownSteal) {
        const restante = cooldownSteal - (ahora - ultimoRobo);
        const minutos = Math.floor(restante / 60000);
        const segundos = Math.floor((restante % 60000) / 1000);
        await sock.sendMessage(jid, {
            text: `⏳ Tienes que esperar antes de volver a robar.\nCooldown: *${minutos}m ${segundos}s*`
        });
        return;
    }

    const uObjetivo = getUsuario(objetivo);
    if (uObjetivo.monedas < 1500) {
        await sock.sendMessage(jid, { text: `❌ @${objetivo.split('@')[0]} no tiene suficientes coins para robar (mínimo 1,500 ⓃNexCoins).`, mentions: [objetivo] });
        return;
    }

    uSender.cooldowns.steal = ahora;

    if (uObjetivo.itemsActivos?.escudo) {
        delete uObjetivo.itemsActivos.escudo;
        guardarUsuario(objetivo, uObjetivo);
        await sock.sendMessage(jid, {
            text: `🛡️ *¡El escudo de @${objetivo.split('@')[0]} bloqueó tu robo!*\nNo pudiste robarle nada esta vez.`,
            mentions: [objetivo]
        });
        return;
    }

    // Granada Aturdidora — bloquea el siguiente robo entrante al objetivo
    if (uObjetivo.itemsActivos?.granada_aturd) {
        delete uObjetivo.itemsActivos.granada_aturd;
        uSender.cooldowns.steal = ahora;
        guardarUsuario(objetivo, uObjetivo);
        guardarUsuario(senderJid, uSender);
        await sock.sendMessage(jid, {
            text: `🧨 *¡BOOM!* @${objetivo.split('@')[0]} tenía una *Granada Aturdidora*.\n¡Saliste corriendo sin nada y perdiste el cooldown de robo!`,
            mentions: [objetivo]
        });
        return;
    }

    let tasaExito = 0.45;
    let detectorMsg = '';
    if (uSender.itemsActivos?.detector) {
        tasaExito = 0.85;
        delete uSender.itemsActivos.detector;
        detectorMsg = '\n🕵️ *¡Detector activo!*';
    }
    // Contrato Oscuro — 100% de éxito durante 10 min
    if (uSender.itemsActivos?.contrato_oscuro && Date.now() < uSender.itemsActivos.contrato_oscuro) {
        tasaExito = 1.0;
        detectorMsg += '\n💼 *¡Contrato Oscuro activo!* Éxito garantizado';
    }
    const evSteal = obtenerEventoActivo(jid);
    let eventoMsgSteal = '';
    if (evSteal?.tipo === 'bonus_robo') {
        tasaExito = Math.min(tasaExito + 0.20, 1.0);
        eventoMsgSteal = '\n🦊 *¡Ladrones en la Ciudad!* Bonus activo.';
    }

    const exito = Math.random() < tasaExito;

    if (exito) {
        let robado = Math.floor(Math.random() * Math.min(uObjetivo.monedas * 0.2, 8000)) + 1000;
        let bendMsg = '';
        if (uSender.itemsActivos?.bendicion_fortuna && Date.now() < uSender.itemsActivos.bendicion_fortuna) {
            robado = Math.floor(robado * 1.25);
            bendMsg = '\n🔥 *¡Bendición de Fortuna! +25%*';
        }
        uSender.monedas += robado;
        uObjetivo.monedas -= robado;
        trackear(uSender, 'robosExitosos');
        guardarUsuario(senderJid, uSender);
        guardarUsuario(objetivo, uObjetivo);
        await sock.sendMessage(jid, {
            text: `🦹 ¡Robaste *${robado.toLocaleString()} ⓃNexCoins* a @${objetivo.split('@')[0]}!${detectorMsg}${eventoMsgSteal}${bendMsg}\n💰 Tus coins: *${uSender.monedas.toLocaleString()}*\n\n⏳ Próximo robo disponible en *20 minutos*`,
            mentions: [objetivo]
        });
    } else {
        const multa = Math.floor(Math.random() * 2000) + 500;
        uSender.monedas = Math.max(0, uSender.monedas - multa);
        guardarUsuario(senderJid, uSender);
        await sock.sendMessage(jid, {
            text: `🚨 ¡Te atraparon intentando robar a @${objetivo.split('@')[0]}!\n❌ Pagaste una multa de *${multa.toLocaleString()} ⓃNexCoins*\n💰 Tus coins: *${uSender.monedas.toLocaleString()}*\n\n⏳ Próximo robo disponible en *20 minutos*`,
            mentions: [objetivo]
        });
    }
}

async function cmdTransferir(sock, jid, senderJid, mencionados, args) {
    if (!mencionados || mencionados.length === 0) {
        await sock.sendMessage(jid, { text: '❌ Uso: #pay @usuario cantidad' });
        return;
    }
    const destinoJid = mencionados[0];
    const cantidad = parseInt(args.find(a => !isNaN(parseInt(a))));
    if (isNaN(cantidad) || cantidad <= 0) {
        await sock.sendMessage(jid, { text: '❌ Ingresa una cantidad válida.' });
        return;
    }
    if (!quitarMonedas(senderJid, cantidad)) {
        await sock.sendMessage(jid, { text: '❌ No tienes suficientes ⓃNexCoins.' });
        return;
    }
    agregarMonedas(destinoJid, cantidad);
    await sock.sendMessage(jid, {
        text: `✅ Enviaste *${cantidad} ⓃNexCoins* a @${destinoJid.split('@')[0]}`,
        mentions: [destinoJid]
    });
}

async function cmdBaltop(sock, jid, groupMetadata, pagina = 1) {
    const { getOwners } = require('./owners');
    const { paginar, piePagina, emblema } = require('./paginator');
    const ownersSet = new Set(getOwners());

    const db = cargarUsuarios();
    const todasEntries = Object.entries(db).filter(([key]) =>
        key.includes('@') && !key.endsWith('@g.us')
    );
    let entries = todasEntries.filter(([key]) => !ownersSet.has(key));

    const filtrarPorGrupo = (lista) => {
        if (!groupMetadata?.participants?.length) return lista;
        const memberIds = new Set(groupMetadata.participants.map(p => p.id));
        return lista.filter(([key]) => memberIds.has(key));
    };

    entries = filtrarPorGrupo(entries);

    if (!entries.length) {
        entries = filtrarPorGrupo(todasEntries);
    }

    if (!entries.length) {
        await sock.sendMessage(jid, { text: '❌ No hay usuarios registrados en este grupo.' });
        return;
    }

    const todos = entries
        .map(([ujid, u]) => ({ jid: ujid, total: (u.monedas || 0) + (u.banco || 0), nombre: u.pushName || ujid.split('@')[0] }))
        .sort((a, b) => b.total - a.total);

    const { items: usuarios, pag, totalPags, inicio } = paginar(todos, pagina, 10);
    let texto = '╔══════════════════════╗\n║   💰 TOP RIQUEZA     ║\n╚══════════════════════╝\n\n';
    for (let i = 0; i < usuarios.length; i++) {
        const u = usuarios[i];
        texto += `${emblema(inicio + i)} @${u.jid.split('@')[0]} — *${u.total.toLocaleString()} ⓃNC*\n`;
    }
    if (groupMetadata) texto += `\n_Solo miembros de este grupo_`;
    texto += piePagina(pag, totalPags, 'baltop');
    const mentions = usuarios.map(u => u.jid);
    await sock.sendMessage(jid, { text: texto, mentions });
}

// ── TOP RIQUEZA MUNDIAL ───────────────────────────────────────────────────────
async function cmdRichTopGlobal(sock, jid, pagina = 1) {
    const { paginar, piePagina, emblema } = require('./paginator');
    const db = cargarUsuarios();
    const todos = Object.entries(db)
        .filter(([k]) => k.includes('@') && !k.endsWith('@g.us'))
        .map(([ujid, u]) => ({ jid: ujid, total: (u.monedas || 0) + (u.banco || 0) }))
        .sort((a, b) => b.total - a.total);
    if (!todos.length) { await sock.sendMessage(jid, { text: '❌ No hay usuarios registrados.' }); return; }
    const { items: lista, pag, totalPags, inicio } = paginar(todos, pagina, 10);
    let texto = '╔════════════════════════════╗\n║  🌍 TOP RIQUEZA MUNDIAL   ║\n╚════════════════════════════╝\n\n';
    lista.forEach((u, i) => {
        texto += `${emblema(inicio + i)} @${u.jid.split('@')[0]} — *${u.total.toLocaleString()} ⓃNC*\n`;
    });
    texto += '\n_Todos los usuarios registrados en el bot_';
    texto += piePagina(pag, totalPags, 'richtop');
    await sock.sendMessage(jid, { text: texto, mentions: lista.map(u => u.jid) });
}

// ── TOP RIQUEZA GRUPO ─────────────────────────────────────────────────────────
async function cmdRichTopGroup(sock, jid, groupMetadata, pagina = 1) {
    if (!groupMetadata?.participants?.length) {
        await sock.sendMessage(jid, { text: '❌ Este comando solo funciona en grupos.' }); return;
    }
    const { paginar, piePagina, emblema } = require('./paginator');
    const db = cargarUsuarios();
    const memberIds = new Set(groupMetadata.participants.map(p => p.id));
    const todos = Object.entries(db)
        .filter(([k]) => memberIds.has(k))
        .map(([ujid, u]) => ({ jid: ujid, total: (u.monedas || 0) + (u.banco || 0) }))
        .sort((a, b) => b.total - a.total);
    if (!todos.length) { await sock.sendMessage(jid, { text: '❌ Ningún miembro de este grupo tiene datos registrados.' }); return; }
    const { items: lista, pag, totalPags, inicio } = paginar(todos, pagina, 10);
    let texto = '╔════════════════════════════╗\n║  💰 TOP RIQUEZA GRUPO    ║\n╚════════════════════════════╝\n\n';
    lista.forEach((u, i) => {
        texto += `${emblema(inicio + i)} @${u.jid.split('@')[0]} — *${u.total.toLocaleString()} ⓃNC*\n`;
    });
    texto += '\n_Solo miembros de este grupo_';
    texto += piePagina(pag, totalPags, 'richtopg');
    await sock.sendMessage(jid, { text: texto, mentions: lista.map(u => u.jid) });
}

// ── TOP NIVEL MUNDIAL ─────────────────────────────────────────────────────────
async function cmdLevelTopGlobal(sock, jid, pagina = 1) {
    const { paginar, piePagina, emblema } = require('./paginator');
    const db = cargarUsuarios();
    const todos = Object.entries(db)
        .filter(([k]) => k.includes('@') && !k.endsWith('@g.us'))
        .map(([ujid, u]) => ({ jid: ujid, nivel: u.nivel || 1, exp: u.experiencia || 0 }))
        .sort((a, b) => b.nivel !== a.nivel ? b.nivel - a.nivel : b.exp - a.exp);
    if (!todos.length) { await sock.sendMessage(jid, { text: '❌ No hay usuarios registrados.' }); return; }
    const { items: lista, pag, totalPags, inicio } = paginar(todos, pagina, 10);
    let texto = '╔════════════════════════════╗\n║  🌍 TOP NIVEL MUNDIAL    ║\n╚════════════════════════════╝\n\n';
    lista.forEach((u, i) => {
        texto += `${emblema(inicio + i)} @${u.jid.split('@')[0]} — Nv.*${u.nivel}* _(${u.exp} XP)_\n`;
    });
    texto += '\n_Todos los usuarios registrados en el bot_';
    texto += piePagina(pag, totalPags, 'leveltop');
    await sock.sendMessage(jid, { text: texto, mentions: lista.map(u => u.jid) });
}

// ── TOP NIVEL GRUPO ───────────────────────────────────────────────────────────
async function cmdLevelTopGroup(sock, jid, groupMetadata, pagina = 1) {
    if (!groupMetadata?.participants?.length) {
        await sock.sendMessage(jid, { text: '❌ Este comando solo funciona en grupos.' }); return;
    }
    const { paginar, piePagina, emblema } = require('./paginator');
    const db = cargarUsuarios();
    const memberIds = new Set(groupMetadata.participants.map(p => p.id));
    const todos = Object.entries(db)
        .filter(([k]) => memberIds.has(k))
        .map(([ujid, u]) => ({ jid: ujid, nivel: u.nivel || 1, exp: u.experiencia || 0 }))
        .sort((a, b) => b.nivel !== a.nivel ? b.nivel - a.nivel : b.exp - a.exp);
    if (!todos.length) { await sock.sendMessage(jid, { text: '❌ Ningún miembro de este grupo tiene datos registrados.' }); return; }
    const { items: lista, pag, totalPags, inicio } = paginar(todos, pagina, 10);
    let texto = '╔════════════════════════════╗\n║  ⭐ TOP NIVEL GRUPO      ║\n╚════════════════════════════╝\n\n';
    lista.forEach((u, i) => {
        texto += `${emblema(inicio + i)} @${u.jid.split('@')[0]} — Nv.*${u.nivel}* _(${u.exp} XP)_\n`;
    });
    texto += '\n_Solo miembros de este grupo_';
    texto += piePagina(pag, totalPags, 'leveltopg');
    await sock.sendMessage(jid, { text: texto, mentions: lista.map(u => u.jid) });
}

// ── TIENDA LEGACY (data/tienda.json) ─────────────────────────────────────────
const TIENDA_PATH = path.join(__dirname, '../data/tienda.json');
function getTienda() { return fs.readJsonSync(TIENDA_PATH); }

async function cmdTienda(sock, jid) {
    const items = getTienda();
    const { ITEMS_DB } = require('./items');
    let texto = '╔══════════════════╗\n║      🛒 TIENDA      ║\n╚══════════════════╝\n\n';
    texto += '*── Artículos Especiales ──*\n';
    for (const item of items) {
        texto += `${item.emoji} *${item.nombre}* (ID: ${item.id})\n`;
        texto += `   📝 ${item.descripcion}\n`;
        texto += `   💰 Precio: ${item.precio} coins\n\n`;
    }
    texto += '*── Ítems con Efectos (#shop) ──*\n';
    for (const [id, item] of Object.entries(ITEMS_DB)) {
        texto += `${item.nombre}\n`;
        texto += `   📝 ${item.desc}\n`;
        texto += `   💰 Precio: ${item.precio} coins • \`#buyitem ${id}\`\n\n`;
    }
    texto += '👉 Usa *#comprar <id>* para artículos especiales\n👉 Usa *#buyitem <nombre>* para ítems con efectos';
    await sock.sendMessage(jid, { text: texto });
}

async function cmdComprar(sock, jid, senderJid, args) {
    const id = parseInt(args[0]);
    const items = getTienda();
    const item = items.find(i => i.id === id);
    if (!item) {
        await sock.sendMessage(jid, { text: '❌ Artículo no encontrado. Usa *#tienda* para ver los artículos disponibles.' });
        return;
    }
    const u = getUsuario(senderJid);
    if (u.monedas < item.precio) {
        await sock.sendMessage(jid, { text: `❌ No tienes suficientes ⓃNexCoins. Necesitas *${item.precio}* y tienes *${u.monedas}*` });
        return;
    }
    if (!Array.isArray(u.inventarioTienda)) u.inventarioTienda = [];
    if (u.inventarioTienda.find(i => i.id === id)) {
        await sock.sendMessage(jid, { text: '❌ Ya tienes este artículo en tu inventario.' });
        return;
    }
    u.monedas -= item.precio;
    u.inventarioTienda.push({ id: item.id, nombre: item.nombre, emoji: item.emoji, tipo: item.tipo });
    guardarUsuario(senderJid, u);
    await sock.sendMessage(jid, { text: `✅ ¡Compraste *${item.emoji} ${item.nombre}* por *${item.precio} ⓃNexCoins*!\n💰 Saldo restante: *${u.monedas} ⓃNexCoins*` });
}

async function cmdInventario(sock, jid, senderJid) {
    const u = getUsuario(senderJid);
    const tiendaInv = u.inventarioTienda || [];
    if (tiendaInv.length === 0) {
        await sock.sendMessage(jid, { text: '🎒 Tu inventario de tienda está vacío. Usa *#tienda* para comprar artículos.\n\n_Para ítems con efectos usa *#inv*_' });
        return;
    }
    let texto = '╔══════════════════╗\n║    🎒 INVENTARIO    ║\n╚══════════════════╝\n\n';
    for (const item of tiendaInv) {
        texto += `${item.emoji} *${item.nombre}* (${item.tipo})\n`;
    }
    await sock.sendMessage(jid, { text: texto });
}

// ══════════════════════════════════════════
//  ⛏️  MINAR (#minar / #mine)
// ══════════════════════════════════════════
async function cmdMinar(sock, jid, senderJid) {
    const u = getUsuario(senderJid);
    const jail = verificarCarcel(u);
    if (jail) { await sock.sendMessage(jid, { text: jail }); return; }
    const ahora = Date.now();
    const espera = 25 * 60 * 1000;   // 25 min cooldown
    if (u.ultimoMinar && ahora - u.ultimoMinar < espera) {
        const r = espera - (ahora - u.ultimoMinar);
        await sock.sendMessage(jid, { text: `⏳ Tu pico está roto. Espera *${Math.ceil(r / 60000)} min*` });
        return;
    }
    const minerales = [
        { nombre: '🪨 Piedra',           valor: 800,   prob: 0.45 },
        { nombre: '🔩 Hierro',           valor: 2200,  prob: 0.25 },
        { nombre: '🪙 Oro',              valor: 5500,  prob: 0.15 },
        { nombre: '💎 Diamante',         valor: 13000, prob: 0.10 },
        { nombre: '✨ Esmeralda',        valor: 25000, prob: 0.04 },
        { nombre: '🌟 Mineral Cósmico', valor: 50000, prob: 0.01 },
    ];
    const r = Math.random();
    let acc = 0, mineral;
    for (const m of minerales) { acc += m.prob; if (r <= acc) { mineral = m; break; } }
    if (!mineral) mineral = minerales[0];
    const evMinar = obtenerEventoActivo();
    let valorMinar = mineral.valor;
    let msgEventoMinar = '';
    if (evMinar?.tipo === 'veta_oro') {
        valorMinar *= 2;
        msgEventoMinar = '\n⛏️ *¡Veta de Oro!* Ganancias ×2';
    } else if (evMinar?.tipo === 'racha_suerte') {
        valorMinar = Math.floor(valorMinar * 1.5);
        msgEventoMinar = '\n🌟 *¡Racha de Suerte!* Ganancias ×1.5';
    } else if (evMinar?.tipo === 'luna_llena') {
        valorMinar = Math.floor(valorMinar * 2.5);
        msgEventoMinar = '\n🌕 *¡Luna Llena!* Ganancias ×2.5';
    } else if (evMinar?.tipo === 'suerte_total') {
        valorMinar *= 2;
        msgEventoMinar = '\n🍀 *¡Suerte Total!* Ganancias ×2';
    } else if (evMinar?.tipo === 'cosecha_abundante') {
        valorMinar = Math.floor(valorMinar * 1.75);
        msgEventoMinar = '\n🌾 *¡Cosecha Abundante!* Ganancias ×1.75';
    }
    u.monedas += valorMinar;
    u.ultimoMinar = ahora;
    trackear(u, 'minados');
    guardarUsuario(senderJid, u);
    const textoMinar = `⛏️ *¡A picar la roca!*\n\nEncontraste *${mineral.nombre}*\n💰 +*${valorMinar} ⓃNexCoins*${msgEventoMinar}\n\n💎 Saldo: *${u.monedas} ⓃNexCoins*`;
    const envMinar = await enviarMediaLocal(sock, jid, 'media/jobs/win', textoMinar);
    if (!envMinar) await sock.sendMessage(jid, { text: textoMinar });
}

// ══════════════════════════════════════════
//  🗺️ AVENTURA (#adventure / #aventura)
// ══════════════════════════════════════════
async function cmdAdventure(sock, jid, senderJid) {
    const u = getUsuario(senderJid);
    const jail = verificarCarcel(u);
    if (jail) { await sock.sendMessage(jid, { text: jail }); return; }
    const ahora = Date.now();
    const espera = 50 * 60 * 1000;   // 50 min cooldown
    if (u.ultimoAdventure && ahora - u.ultimoAdventure < espera) {
        const r = espera - (ahora - u.ultimoAdventure);
        await sock.sendMessage(jid, { text: `🛌 Aún descansas de tu última aventura. Espera *${Math.ceil(r / 60000)} min*` });
        return;
    }
    const aventuras = [
        { txt: 'Exploraste un castillo abandonado y encontraste un cofre.', min: 3000, max: 12000 },
        { txt: 'Salvaste a una aldea de bandidos. Te recompensaron con monedas.',  min: 4000, max: 15000 },
        { txt: 'Cruzaste el desierto y descubriste un oasis con tesoros.',          min: 3500, max: 13000 },
        { txt: 'Resolviste el acertijo de una esfinge. Te dejó pasar con un premio.', min: 5000, max: 15000 },
        { txt: 'Encontraste una caja mágica flotando en el río.',                   min: 2500, max: 14000 },
    ];
    const ev = aventuras[Math.floor(Math.random() * aventuras.length)];
    const exito = Math.random() < 0.75;
    if (exito) {
        const gananciaBase = Math.floor(Math.random() * (ev.max - ev.min)) + ev.min;
        const evAdv = obtenerEventoActivo();
        let ganancia = gananciaBase;
        let msgEventoAdv = '';
        if (evAdv?.tipo === 'racha_suerte') {
            ganancia = Math.floor(ganancia * 1.5);
            msgEventoAdv = '\n🌟 *¡Racha de Suerte!* Ganancias ×1.5';
        } else if (evAdv?.tipo === 'fiebre_aventura') {
            ganancia *= 2;
            msgEventoAdv = '\n🗺️ *¡Fiebre de Aventura!* Ganancias ×2';
        } else if (evAdv?.tipo === 'suerte_total') {
            ganancia *= 2;
            msgEventoAdv = '\n🍀 *¡Suerte Total!* Ganancias ×2';
        } else if (evAdv?.tipo === 'cosecha_abundante') {
            ganancia = Math.floor(ganancia * 1.75);
            msgEventoAdv = '\n🌾 *¡Cosecha Abundante!* Ganancias ×1.75';
        } else if (evAdv?.tipo === 'fiesta_nexus') {
            ganancia *= 2;
            msgEventoAdv = '\n🎊 *¡Fiesta Nexus!* Ganancias ×2';
        }
        u.monedas += ganancia;
        trackear(u, 'aventurasOK');
        u.ultimoAdventure = ahora;
        guardarUsuario(senderJid, u);
        const textoAdvWin = `🗺️ *¡AVENTURA EXITOSA!*\n\n${ev.txt}\n💰 Ganaste *${ganancia} ⓃNexCoins*!${msgEventoAdv}\n\n💎 Saldo: *${u.monedas} ⓃNexCoins*`;
        const envAdvW = await enviarMediaLocal(sock, jid, 'media/jobs/win', textoAdvWin);
        if (!envAdvW) await sock.sendMessage(jid, { text: textoAdvWin });
    } else {
        const perdida = Math.floor(Math.random() * 1500) + 1000;
        u.monedas = Math.max(0, u.monedas - perdida);
        u.ultimoAdventure = ahora;
        guardarUsuario(senderJid, u);
        const textoAdvLose = `💥 *¡Aventura fallida!*\n\nTe emboscaron y perdiste *${perdida.toLocaleString()} ⓃNexCoins*.\n💰 Saldo: *${u.monedas.toLocaleString()} ⓃNexCoins*`;
        const envAdvL = await enviarMediaLocal(sock, jid, 'media/jobs/lose', textoAdvLose);
        if (!envAdvL) await sock.sendMessage(jid, { text: textoAdvLose });
    }
}

// ══════════════════════════════════════════
//  🏹 CAZAR (#cazar / #hunt)
// ══════════════════════════════════════════
async function cmdCazar(sock, jid, senderJid) {
    const u = getUsuario(senderJid);
    const jail = verificarCarcel(u);
    if (jail) { await sock.sendMessage(jid, { text: jail }); return; }
    const ahora = Date.now();
    const espera = 25 * 60 * 1000;   // 25 min cooldown
    if (u.ultimoCazar && ahora - u.ultimoCazar < espera) {
        const r = espera - (ahora - u.ultimoCazar);
        await sock.sendMessage(jid, { text: `🏹 Tu arco se enfría. Espera *${Math.ceil(r / 60000)} min*` });
        return;
    }
    const presas = [
        { nombre: '🐰 Conejo',              valor: 1200,  prob: 0.40 },
        { nombre: '🦌 Ciervo',              valor: 4000,  prob: 0.25 },
        { nombre: '🐗 Jabalí',              valor: 7000,  prob: 0.15 },
        { nombre: '🐺 Lobo',               valor: 11000, prob: 0.10 },
        { nombre: '🐻 Oso',                valor: 20000, prob: 0.07 },
        { nombre: '🦄 Unicornio legendario', valor: 45000, prob: 0.03 },
    ];
    const r = Math.random();
    let acc = 0, presa;
    for (const p of presas) { acc += p.prob; if (r <= acc) { presa = p; break; } }
    if (!presa) presa = presas[0];
    const evCazar = obtenerEventoActivo();
    let valorPresa = presa.valor;
    let msgEventoCazar = '';
    if (evCazar?.tipo === 'temporada_caza') {
        valorPresa *= 2;
        msgEventoCazar = '\n🏹 *¡Temporada de Caza!* Ganancias ×2';
    } else if (evCazar?.tipo === 'racha_suerte') {
        valorPresa = Math.floor(valorPresa * 1.5);
        msgEventoCazar = '\n🌟 *¡Racha de Suerte!* Ganancias ×1.5';
    } else if (evCazar?.tipo === 'luna_llena') {
        valorPresa = Math.floor(valorPresa * 2.5);
        msgEventoCazar = '\n🌕 *¡Luna Llena!* Ganancias ×2.5';
    } else if (evCazar?.tipo === 'suerte_total') {
        valorPresa *= 2;
        msgEventoCazar = '\n🍀 *¡Suerte Total!* Ganancias ×2';
    } else if (evCazar?.tipo === 'cosecha_abundante') {
        valorPresa = Math.floor(valorPresa * 1.75);
        msgEventoCazar = '\n🌾 *¡Cosecha Abundante!* Ganancias ×1.75';
    }
    u.monedas += valorPresa;
    u.ultimoCazar = ahora;
    trackear(u, 'cazados');
    guardarUsuario(senderJid, u);
    const textoCazar = `🏹 *¡Cacería!*\n\nCazaste un *${presa.nombre}*\n💰 +*${valorPresa} ⓃNexCoins*${msgEventoCazar}\n\n💎 Saldo: *${u.monedas} ⓃNexCoins*`;
    const envCazar = await enviarMediaLocal(sock, jid, 'media/jobs/win', textoCazar);
    if (!envCazar) await sock.sendMessage(jid, { text: textoCazar });
}

// ══════════════════════════════════════════
//  🎣 PESCAR (#fish / #pescar)
// ══════════════════════════════════════════
async function cmdFish(sock, jid, senderJid) {
    const u = getUsuario(senderJid);
    const jail = verificarCarcel(u);
    if (jail) { await sock.sendMessage(jid, { text: jail }); return; }
    const ahora = Date.now();
    const espera = 20 * 60 * 1000;   // 20 min cooldown
    if (u.ultimoFish && ahora - u.ultimoFish < espera) {
        const r = espera - (ahora - u.ultimoFish);
        await sock.sendMessage(jid, { text: `🎣 Aún hay peces que se escapan. Espera *${Math.ceil(r / 60000)} min*` });
        return;
    }
    const peces = [
        { nombre: '🐟 Sardina',       valor: 600,   prob: 0.40 },
        { nombre: '🐠 Pez tropical',  valor: 2000,  prob: 0.25 },
        { nombre: '🐡 Pez globo',     valor: 4000,  prob: 0.15 },
        { nombre: '🦑 Calamar gigante', valor: 8000, prob: 0.10 },
        { nombre: '🦈 Tiburón',       valor: 16000, prob: 0.07 },
        { nombre: '🐋 Ballena dorada', valor: 40000, prob: 0.03 },
    ];
    const r = Math.random();
    let acc = 0, pez;
    for (const p of peces) { acc += p.prob; if (r <= acc) { pez = p; break; } }
    if (!pez) pez = peces[0];
    const evFish = obtenerEventoActivo();
    let valorPez = pez.valor;
    let msgEventoFish = '';
    if (evFish?.tipo === 'dia_pesca') {
        valorPez *= 2;
        msgEventoFish = '\n🎣 *¡Día de Pesca!* Ganancias ×2';
    } else if (evFish?.tipo === 'racha_suerte') {
        valorPez = Math.floor(valorPez * 1.5);
        msgEventoFish = '\n🌟 *¡Racha de Suerte!* Ganancias ×1.5';
    } else if (evFish?.tipo === 'luna_llena') {
        valorPez = Math.floor(valorPez * 2.5);
        msgEventoFish = '\n🌕 *¡Luna Llena!* Ganancias ×2.5';
    } else if (evFish?.tipo === 'suerte_total') {
        valorPez *= 2;
        msgEventoFish = '\n🍀 *¡Suerte Total!* Ganancias ×2';
    } else if (evFish?.tipo === 'cosecha_abundante') {
        valorPez = Math.floor(valorPez * 1.75);
        msgEventoFish = '\n🌾 *¡Cosecha Abundante!* Ganancias ×1.75';
    }
    u.monedas += valorPez;
    u.ultimoFish = ahora;
    trackear(u, 'pescados');
    guardarUsuario(senderJid, u);
    const textoFish = `🎣 *¡Pesca exitosa!*\n\nAtrapaste un *${pez.nombre}*\n💰 +*${valorPez} ⓃNexCoins*${msgEventoFish}\n\n💎 Saldo: *${u.monedas} ⓃNexCoins*`;
    const envFish = await enviarMediaLocal(sock, jid, 'media/jobs/win', textoFish);
    if (!envFish) await sock.sendMessage(jid, { text: textoFish });
}

// ══════════════════════════════════════════
//  🏰 MAZMORRA (#mazmorra / #dungeon)
// ══════════════════════════════════════════
async function cmdMazmorra(sock, jid, senderJid) {
    const u = getUsuario(senderJid);
    const jail = verificarCarcel(u);
    if (jail) { await sock.sendMessage(jid, { text: jail }); return; }
    const ahora = Date.now();
    const espera = 60 * 60 * 1000;   // 60 min cooldown
    if (u.ultimaMazmorra && ahora - u.ultimaMazmorra < espera) {
        const r = espera - (ahora - u.ultimaMazmorra);
        await sock.sendMessage(jid, { text: `⚔️ Aún te recuperas. Espera *${Math.ceil(r / 60000)} min*` });
        return;
    }
    const pisos = [
        { nombre: 'Cripta de los muertos', enemigo: '💀 Esqueleto',      min: 6000,  max: 14000, exito: 0.70 },
        { nombre: 'Caverna del dragón',    enemigo: '🐉 Dragón joven',   min: 12000, max: 28000, exito: 0.55 },
        { nombre: 'Torre oscura',          enemigo: '🧙 Mago oscuro',    min: 9000,  max: 20000, exito: 0.60 },
        { nombre: 'Pantano venenoso',      enemigo: '🐍 Hidra',          min: 7000,  max: 18000, exito: 0.65 },
        { nombre: 'Castillo maldito',      enemigo: '🧛 Vampiro anciano', min: 16000, max: 40000, exito: 0.45 },
    ];
    const piso = pisos[Math.floor(Math.random() * pisos.length)];
    const _evMazPre = obtenerEventoActivo();
    const _tasaMaz = _evMazPre?.tipo === 'invasion_mazmorra' ? 0.90 : piso.exito;
    const exito = Math.random() < _tasaMaz;
    u.ultimaMazmorra = ahora;
    if (exito) {
        const gananciaBaseMaz = Math.floor(Math.random() * (piso.max - piso.min)) + piso.min;
        const evMaz = obtenerEventoActivo();
        let ganancia = gananciaBaseMaz;
        let msgEventoMaz = '';
        if (evMaz?.tipo === 'asedio') {
            ganancia *= 2;
            msgEventoMaz = '\n🏰 *¡Asedio Épico!* Ganancias ×2';
        } else if (evMaz?.tipo === 'racha_suerte') {
            ganancia = Math.floor(ganancia * 1.5);
            msgEventoMaz = '\n🌟 *¡Racha de Suerte!* Ganancias ×1.5';
        } else if (evMaz?.tipo === 'suerte_total') {
            ganancia *= 2;
            msgEventoMaz = '\n🍀 *¡Suerte Total!* Ganancias ×2';
        } else if (evMaz?.tipo === 'fiesta_nexus') {
            ganancia *= 2;
            msgEventoMaz = '\n🎊 *¡Fiesta Nexus!* Ganancias ×2';
        }
        u.monedas += ganancia;
        trackear(u, 'mazmorrasOK');
        guardarUsuario(senderJid, u);
        const textoMazWin = `⚔️ *¡MAZMORRA: ${piso.nombre}!*\n\nVenciste a *${piso.enemigo}*\n💰 Botín: *+${ganancia} ⓃNC*${msgEventoMaz}\n\n💎 Saldo: *${u.monedas} ⓃNC*`;
        const envMazW = await enviarMediaLocal(sock, jid, 'media/jobs/win', textoMazWin);
        if (!envMazW) await sock.sendMessage(jid, { text: textoMazWin });
    } else {
        const perdida = Math.floor(Math.random() * 5000) + 3000;
        u.monedas = Math.max(0, u.monedas - perdida);
        guardarUsuario(senderJid, u);
        const textoMazLose = `💀 *¡Derrotado en ${piso.nombre}!*\n\n${piso.enemigo} te venció.\n❌ Perdiste *${perdida.toLocaleString()} ⓃNC*\n💰 Saldo: *${u.monedas.toLocaleString()} ⓃNC*`;
        const envMazL = await enviarMediaLocal(sock, jid, 'media/jobs/lose', textoMazLose);
        if (!envMazL) await sock.sendMessage(jid, { text: textoMazLose });
    }
}

module.exports = {
    cmdSaldo, cmdEconomyInfo, cmdDiario, cmdWork, cmdCrime, cmdSlut, cmdCoinflip,
    cmdDeposit, cmdWithdraw, cmdRoulette, cmdSteal, cmdTransferir,
    cmdBaltop, cmdRichTopGlobal, cmdRichTopGroup, cmdLevelTopGlobal, cmdLevelTopGroup,
    cmdTienda, cmdComprar, cmdInventario,
    cmdMinar, cmdAdventure, cmdCazar, cmdFish, cmdMazmorra
};
