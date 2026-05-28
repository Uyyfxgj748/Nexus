const { getUsuario, guardarUsuario } = require('./database');

// ══════════════════════════════════════════
//  BASE DE DATOS DE LOGROS
// ══════════════════════════════════════════
const LOGROS_DB = {
    // Economía
    primer_saldo:    { nombre: '💰 Primer NexCoin',      desc: 'Ganaste tu primera moneda',                  icono: '💰', secreto: false },
    rico:            { nombre: '🤑 Rico',                 desc: 'Acumula 10,000 NexCoins',                   icono: '🤑', secreto: false },
    millonario:      { nombre: '💎 Millonario',           desc: 'Acumula 100,000 NexCoins',                  icono: '💎', secreto: true  },
    primer_trabajo:  { nombre: '💼 Empleado',             desc: 'Trabajaste por primera vez',                icono: '💼', secreto: false },
    empleado_mes:    { nombre: '🏅 Empleado del mes',     desc: 'Trabaja 20 veces',                          icono: '🏅', secreto: false },
    primer_crimen:   { nombre: '🦹 Criminal debutante',   desc: 'Cometiste tu primer crimen',                icono: '🦹', secreto: false },
    primer_robo:     { nombre: '🧤 Ladrón',               desc: 'Robaste exitosamente por primera vez',      icono: '🧤', secreto: false },
    maestro_ladron:  { nombre: '🎭 Maestro ladrón',       desc: 'Roba 10 veces exitosamente',                icono: '🎭', secreto: false },
    apostador:       { nombre: '🎲 Apostador',            desc: 'Ganaste tu primera apuesta',                icono: '🎲', secreto: false },
    lo_perdio_todo:  { nombre: '💀 Todo o nada... nada',  desc: 'Perdiste todo en la ruleta (secreto)',      icono: '💀', secreto: true  },
    // Gacha
    primer_waifu:    { nombre: '💖 Primer Waifu',         desc: 'Conseguiste tu primer personaje',           icono: '💖', secreto: false },
    coleccionista:   { nombre: '📚 Coleccionista',        desc: 'Tiene 10 personajes en el harem',           icono: '📚', secreto: false },
    harem_master:    { nombre: '👑 Harem Master',         desc: 'Tiene 25 personajes en el harem',           icono: '👑', secreto: true  },
    // Combate
    primer_combate:  { nombre: '⚔️ Primer combate',       desc: 'Participaste en un PVP',                    icono: '⚔️', secreto: false },
    campeon:         { nombre: '🏆 Campeón',              desc: 'Gana 5 combates PVP',                       icono: '🏆', secreto: false },
    leyenda:         { nombre: '⭐ Leyenda',              desc: 'Gana 20 combates PVP',                      icono: '⭐', secreto: true  },
    // Social
    reputado:        { nombre: '🎭 Respetado',            desc: 'Alcanza 50 de reputación',                  icono: '🎭', secreto: false },
    vip:             { nombre: '👑 VIP',                  desc: 'Alcanza 200 de reputación',                 icono: '👑', secreto: true  },
    // Minijuegos
    matematico:      { nombre: '🧮 Matemático',           desc: 'Gana 5 partidas de matemáticas',            icono: '🧮', secreto: false },
    sabio:           { nombre: '📖 Sabio del trivia',     desc: 'Responde 5 trivias correctamente',          icono: '📖', secreto: false },
    // Misiones
    misionero:       { nombre: '🎯 Misionero',            desc: 'Completa 10 misiones',                      icono: '🎯', secreto: false },
    // Casino
    jackpot_win:     { nombre: '🎰 ¡JACKPOT!',           desc: 'Ganaste el jackpot en slots (secreto)',     icono: '🎰', secreto: true  },
    bj_pro:          { nombre: '🃏 Blackjack Pro',        desc: 'Gana 5 partidas de blackjack',              icono: '🃏', secreto: false },
    // Banco
    inversor:        { nombre: '📈 Inversor',             desc: 'Realizaste tu primera inversión',           icono: '📈', secreto: false },
    prestamista:     { nombre: '💸 Deudor pagado',        desc: 'Pagaste un préstamo a tiempo',              icono: '💸', secreto: false },
    // Clanes
    fundador:        { nombre: '🏰 Fundador',             desc: 'Creaste un clan',                           icono: '🏰', secreto: false },
    // Mascota
    dueño:           { nombre: '🐾 Dueño de mascota',     desc: 'Adoptaste una mascota',                     icono: '🐾', secreto: false },
    // Primero
    primer_logro:    { nombre: '🌟 ¡Primeros pasos!',     desc: 'Desbloqueaste tu primer logro',             icono: '🌟', secreto: false },
    // ── Economía avanzada ───────────────────────────────────────────────────────
    multimillonario: { nombre: '💎 Multimillonario',      desc: 'Acumula 1,000,000 NexCoins',                icono: '💎', secreto: true  },
    racha_diaria:    { nombre: '🔥 Racha de fuego',       desc: 'Reclama el diario 7 días seguidos',         icono: '🔥', secreto: false },
    racha_legendaria:{ nombre: '🌟 Racha Legendaria',     desc: 'Reclama el diario 30 días seguidos',        icono: '🌟', secreto: true  },
    trabajador_nato: { nombre: '👷 Trabajador nato',      desc: 'Trabaja 50 veces',                          icono: '👷', secreto: false },
    workaholic:      { nombre: '⚡ Workaholic',            desc: 'Trabaja 100 veces',                         icono: '⚡', secreto: true  },
    criminal_pro:    { nombre: '🕶️ Criminal pro',         desc: 'Comete 25 crímenes exitosos',               icono: '🕶️', secreto: false },
    el_padrino:      { nombre: '🎩 El Padrino',           desc: 'Comete 50 crímenes exitosos',               icono: '🎩', secreto: true  },
    banquero:        { nombre: '🏦 Banquero',              desc: 'Deposita coins en el banco',                icono: '🏦', secreto: false },
    coinflip_lucky:  { nombre: '🪙 Moneda de la suerte',  desc: 'Gana 10 coinflips',                         icono: '🪙', secreto: false },
    ruleta_master:   { nombre: '🎡 Ruleta Master',        desc: 'Gana 10 partidas de ruleta',                icono: '🎡', secreto: false },
    // ── Nivel ───────────────────────────────────────────────────────────────────
    aprendiz:        { nombre: '📘 Aprendiz',              desc: 'Alcanza el nivel 5',                        icono: '📘', secreto: false },
    veterano_nivel:  { nombre: '🧭 Veterano',              desc: 'Alcanza el nivel 15',                       icono: '🧭', secreto: false },
    experto:         { nombre: '🔥 Experto',               desc: 'Alcanza el nivel 30',                       icono: '🔥', secreto: true  },
    maestro_nivel:   { nombre: '👑 Maestro',               desc: 'Alcanza el nivel 50',                       icono: '👑', secreto: true  },
    transcendido:    { nombre: '✨ Transcendido',          desc: 'Alcanza el nivel 100',                      icono: '✨', secreto: true  },
    // ── Minijuegos ──────────────────────────────────────────────────────────────
    adivinador:      { nombre: '🎯 Adivinador',            desc: 'Gana 5 partidas de adivina el número',      icono: '🎯', secreto: false },
    ahorcador:       { nombre: '🪓 Salvavidas',            desc: 'Gana 5 partidas de ahorcado',               icono: '🪓', secreto: false },
    scramble_pro:    { nombre: '🔀 Scrambler Pro',         desc: 'Gana 5 partidas de scramble',               icono: '🔀', secreto: false },
    quien_detective: { nombre: '🕵️ Detective',             desc: 'Gana 5 partidas de ¿Quién soy?',            icono: '🕵️', secreto: false },
    ppt_master:      { nombre: '✊ Campeón PPT',           desc: 'Gana 20 partidas de piedra-papel-tijera',   icono: '✊', secreto: false },
    minijugador:     { nombre: '🎮 Minijugador Pro',       desc: 'Gana 30 minijuegos en total',               icono: '🎮', secreto: true  },
    // ── Social avanzado ─────────────────────────────────────────────────────────
    popular:         { nombre: '⭐ Popular',               desc: 'Alcanza 100 de reputación',                 icono: '⭐', secreto: false },
    estrella:        { nombre: '🌟 Estrella social',      desc: 'Alcanza 500 de reputación',                 icono: '🌟', secreto: true  },
    casado:          { nombre: '💍 Casado/a',              desc: 'Forma una pareja con alguien',              icono: '💍', secreto: false },
    comunicador:     { nombre: '💬 Comunicador',           desc: 'Envía 100 mensajes en el chat',             icono: '💬', secreto: false },
    charlatan:       { nombre: '🗣️ Charlatán',             desc: 'Envía 500 mensajes en el chat',             icono: '🗣️', secreto: true  },
    // ── Gacha avanzado ──────────────────────────────────────────────────────────
    harem_epico:     { nombre: '🌸 Harem Épico',          desc: 'Tiene 50 personajes en el harem',           icono: '🌸', secreto: true  },
    harem_legendario:{ nombre: '🔮 Harem Legendario',     desc: 'Tiene 100 personajes en el harem',          icono: '🔮', secreto: true  },
    // ── Combate avanzado ────────────────────────────────────────────────────────
    gladiador:       { nombre: '⚔️ Gladiador',             desc: 'Gana 50 combates PVP',                      icono: '⚔️', secreto: true  },
    dios_guerra:     { nombre: '🔱 Dios de la guerra',    desc: 'Gana 100 combates PVP',                     icono: '🔱', secreto: true  },
    // ── Casino avanzado ─────────────────────────────────────────────────────────
    bj_legend:       { nombre: '🃏 Leyenda del BJ',       desc: 'Gana 20 partidas de blackjack',             icono: '🃏', secreto: true  },
    // ── Clan ────────────────────────────────────────────────────────────────────
    guerrero_clan:   { nombre: '🛡️ Guerrero de clan',     desc: 'Participa en 5 guerras de clanes',          icono: '🛡️', secreto: false },
    lider_clan:      { nombre: '⚜️ Líder de clanes',      desc: 'Participa en 25 guerras de clanes',         icono: '⚜️', secreto: true  },
    // ── Pesca ────────────────────────────────────────────────────────────────
    pescador:        { nombre: '🎣 Pescador',               desc: 'Pesca 5 veces',                             icono: '🎣', secreto: false },
    master_pescador: { nombre: '🐋 Maestro Pescador',       desc: 'Pesca 25 veces',                            icono: '🐋', secreto: true  },
    // ── Minería ──────────────────────────────────────────────────────────────
    minero:          { nombre: '⛏️ Minero',                 desc: 'Pica minerales 5 veces',                    icono: '⛏️', secreto: false },
    maestro_minero:  { nombre: '💎 Maestro Minero',         desc: 'Pica minerales 25 veces',                   icono: '💎', secreto: true  },
    // ── Caza ─────────────────────────────────────────────────────────────────
    cazador:         { nombre: '🏹 Cazador',                desc: 'Caza 5 veces',                              icono: '🏹', secreto: false },
    maestro_cazador: { nombre: '🦄 Maestro Cazador',        desc: 'Caza 25 veces',                             icono: '🦄', secreto: true  },
    // ── Aventura ─────────────────────────────────────────────────────────────
    aventurero:      { nombre: '🗺️ Aventurero',             desc: 'Completa 5 aventuras exitosas',             icono: '🗺️', secreto: false },
    explorador:      { nombre: '🧭 Gran Explorador',        desc: 'Completa 20 aventuras exitosas',            icono: '🧭', secreto: true  },
    // ── Mazmorra ─────────────────────────────────────────────────────────────
    conquistador:    { nombre: '🗡️ Conquistador',           desc: 'Vence 5 mazmorras',                         icono: '🗡️', secreto: false },
    maestro_mazmorra:{ nombre: '🏰 Señor de las Mazmorras', desc: 'Vence 20 mazmorras',                        icono: '🏰', secreto: true  },
    // ── Economía extra ───────────────────────────────────────────────────────
    inversor_pro:    { nombre: '📊 Inversor Pro',           desc: 'Realiza 5 inversiones',                     icono: '📊', secreto: false },
    inversor_master: { nombre: '🏦 Magnate',                desc: 'Realiza 25 inversiones',                    icono: '🏦', secreto: true  },
    sin_deudas:      { nombre: '✅ Libre de deudas',        desc: 'Paga 5 préstamos completos',                icono: '✅', secreto: false },
    racha_centenaria:{ nombre: '🔱 Centenario',             desc: 'Reclama el diario 100 días seguidos',       icono: '🔱', secreto: true  },
    super_ladron:    { nombre: '🎭 Super Ladrón',           desc: 'Roba exitosamente 25 veces',                icono: '🎭', secreto: true  },
    criminal_legendario: { nombre: '👑 El Capo',            desc: 'Comete 100 crímenes exitosos',              icono: '👑', secreto: true  },
    // ── Casino extra ─────────────────────────────────────────────────────────
    coinflip_loco:   { nombre: '🪙 Monedero loco',          desc: 'Gana 25 coinflips',                         icono: '🪙', secreto: true  },
    ppt_leyenda:     { nombre: '✊ Leyenda del PPT',         desc: 'Gana 50 partidas de PPT',                   icono: '✊', secreto: true  },
    bj_supremo:      { nombre: '🃏 Rey del Blackjack',      desc: 'Gana 50 partidas de blackjack',             icono: '🃏', secreto: true  },
    // ── Minijuegos extra ─────────────────────────────────────────────────────
    trivia_master:   { nombre: '🧠 Maestro del Trivia',     desc: 'Gana 20 trivias',                           icono: '🧠', secreto: true  },
    // ── Clan extra ───────────────────────────────────────────────────────────
    tactica_clan:    { nombre: '⚔️ Táctico de Clan',        desc: 'Participa en 10 guerras de clanes',         icono: '⚔️', secreto: false },
    // ── Especiales secretos ─────────────────────────────────────────────────────
    madrugador:      { nombre: '🌙 Madrugador',            desc: 'Usaste el bot entre las 3am y 5am',         icono: '🌙', secreto: true  },
    nocturno:        { nombre: '🦉 Noctámbulo',             desc: 'Usaste el bot entre las 12am y 3am',        icono: '🦉', secreto: true  },
};

// ══════════════════════════════════════════
//  VERIFICAR LOGROS
// ══════════════════════════════════════════
function verificarLogros(u, filtro = null) {
    const nuevos = [];
    if (!u.logros) u.logros = [];
    if (!u.contadores) u.contadores = {};

    const check = (id) => {
        if (filtro && !filtro.includes(id)) return;
        if (!u.logros.includes(id) && LOGROS_DB[id]) {
            u.logros.push(id);
            nuevos.push(id);
        }
    };

    const total = (u.monedas || 0) + (u.banco || 0);
    const c = u.contadores;

    // ── Economía base ────────────────────────────────────────────────────────
    if (total >= 1)         check('primer_saldo');
    if (total >= 10000)     check('rico');
    if (total >= 100000)    check('millonario');
    if (total >= 1000000)   check('multimillonario');
    if (u.ultimoTrabajo)    check('primer_trabajo');
    if ((c.trabajos || 0) >= 20)    check('empleado_mes');
    if ((c.trabajos || 0) >= 50)    check('trabajador_nato');
    if ((c.trabajos || 0) >= 100)   check('workaholic');
    if ((c.crimenesOK || 0) >= 1)   check('primer_crimen');   // fix: era c.crimenes
    if ((c.crimenesOK || 0) >= 25)  check('criminal_pro');
    if ((c.crimenesOK || 0) >= 50)  check('el_padrino');
    if ((c.robosExitosos || 0) >= 1)  check('primer_robo');
    if ((c.robosExitosos || 0) >= 10) check('maestro_ladron');
    if ((c.apuestasGanadas || 0) >= 1)  check('apostador');
    if ((c.coinflipGanados || 0) >= 10) check('coinflip_lucky');
    if ((c.ruletasGanadas  || 0) >= 10) check('ruleta_master');
    if ((c.ruletaPerdidas  || 0) >= 1 && (u.monedas || 0) === 0) check('lo_perdio_todo');
    if ((u.dailyStreak || 0) >= 7)   check('racha_diaria');
    if ((u.dailyStreak || 0) >= 30)  check('racha_legendaria');
    if ((u.banco || 0) > 0)          check('banquero');

    // ── Gacha ────────────────────────────────────────────────────────────────
    if ((u.harem || []).length >= 1)   check('primer_waifu');
    if ((u.harem || []).length >= 10)  check('coleccionista');
    if ((u.harem || []).length >= 25)  check('harem_master');
    if ((u.harem || []).length >= 50)  check('harem_epico');
    if ((u.harem || []).length >= 100) check('harem_legendario');

    // ── Combate ──────────────────────────────────────────────────────────────
    if ((c.combates  || 0) >= 1)   check('primer_combate');
    if ((c.victorias || 0) >= 5)   check('campeon');
    if ((c.victorias || 0) >= 20)  check('leyenda');
    if ((c.victorias || 0) >= 50)  check('gladiador');
    if ((c.victorias || 0) >= 100) check('dios_guerra');

    // ── Social ───────────────────────────────────────────────────────────────
    if ((u.reputacion || 0) >= 50)  check('reputado');
    if ((u.reputacion || 0) >= 100) check('popular');
    if ((u.reputacion || 0) >= 200) check('vip');
    if ((u.reputacion || 0) >= 500) check('estrella');
    if (u.pareja)                   check('casado');
    if ((u.mensajes || 0) >= 100)   check('comunicador');
    if ((u.mensajes || 0) >= 500)   check('charlatan');

    // ── Nivel ────────────────────────────────────────────────────────────────
    if ((u.nivel || 1) >= 5)   check('aprendiz');
    if ((u.nivel || 1) >= 15)  check('veterano_nivel');
    if ((u.nivel || 1) >= 30)  check('experto');
    if ((u.nivel || 1) >= 50)  check('maestro_nivel');
    if ((u.nivel || 1) >= 100) check('transcendido');

    // ── Minijuegos ───────────────────────────────────────────────────────────
    if ((c.ganadosMath    || 0) >= 5)  check('matematico');
    if ((c.ganadosTrivia  || 0) >= 5)  check('sabio');
    if ((c.ganadosGuess   || 0) >= 5)  check('adivinador');
    if ((c.ganadosAhorcado|| 0) >= 5)  check('ahorcador');
    if ((c.ganadosScramble|| 0) >= 5)  check('scramble_pro');
    if ((c.ganadosQuien   || 0) >= 5)  check('quien_detective');
    if ((c.ganadosPpt     || 0) >= 20) check('ppt_master');
    const totalMini = (c.ganadosTrivia || 0) + (c.ganadosMath || 0) + (c.ganadosGuess || 0) +
        (c.ganadosAhorcado || 0) + (c.ganadosScramble || 0) + (c.ganadosQuien || 0) + (c.ganadosPpt || 0);
    if (totalMini >= 30) check('minijugador');

    // ── Misiones ─────────────────────────────────────────────────────────────
    if ((c.misionesOK || 0) >= 10) check('misionero');

    // ── Casino ───────────────────────────────────────────────────────────────
    if ((c.jackpotsGanados || 0) >= 1)  check('jackpot_win');
    if ((c.victoriasBJ     || 0) >= 5)  check('bj_pro');
    if ((c.victoriasBJ     || 0) >= 20) check('bj_legend');

    // ── Banco ────────────────────────────────────────────────────────────────
    if ((c.inversiones  || 0) >= 1) check('inversor');
    if ((c.prestamosOK  || 0) >= 1) check('prestamista');

    // ── Clan ─────────────────────────────────────────────────────────────────
    if (c.clanFundado)                  check('fundador');
    if ((c.guerrasJugadas || 0) >= 5)   check('guerrero_clan');
    if ((c.guerrasJugadas || 0) >= 10)  check('tactica_clan');
    if ((c.guerrasJugadas || 0) >= 25)  check('lider_clan');

    // ── Mascota ──────────────────────────────────────────────────────────────
    if (u.mascota) check('dueño');

    // ── Pesca ────────────────────────────────────────────────────────────────
    if ((c.pescados || 0) >= 5)  check('pescador');
    if ((c.pescados || 0) >= 25) check('master_pescador');

    // ── Minería ──────────────────────────────────────────────────────────────
    if ((c.minados || 0) >= 5)   check('minero');
    if ((c.minados || 0) >= 25)  check('maestro_minero');

    // ── Caza ─────────────────────────────────────────────────────────────────
    if ((c.cazados || 0) >= 5)   check('cazador');
    if ((c.cazados || 0) >= 25)  check('maestro_cazador');

    // ── Aventura ─────────────────────────────────────────────────────────────
    if ((c.aventurasOK || 0) >= 5)   check('aventurero');
    if ((c.aventurasOK || 0) >= 20)  check('explorador');

    // ── Mazmorra ─────────────────────────────────────────────────────────────
    if ((c.mazmorrasOK || 0) >= 5)   check('conquistador');
    if ((c.mazmorrasOK || 0) >= 20)  check('maestro_mazmorra');

    // ── Economía extra ───────────────────────────────────────────────────────
    if ((c.inversiones    || 0) >= 5)   check('inversor_pro');
    if ((c.inversiones    || 0) >= 25)  check('inversor_master');
    if ((c.prestamosOK    || 0) >= 5)   check('sin_deudas');
    if ((u.dailyStreak    || 0) >= 100) check('racha_centenaria');
    if ((c.robosExitosos  || 0) >= 25)  check('super_ladron');
    if ((c.crimenesOK     || 0) >= 100) check('criminal_legendario');

    // ── Casino extra ─────────────────────────────────────────────────────────
    if ((c.coinflipGanados || 0) >= 25) check('coinflip_loco');
    if ((c.ganadosPpt      || 0) >= 50) check('ppt_leyenda');
    if ((c.victoriasBJ     || 0) >= 50) check('bj_supremo');

    // ── Minijuegos extra ─────────────────────────────────────────────────────
    if ((c.ganadosTrivia   || 0) >= 20) check('trivia_master');

    // ── Especiales ───────────────────────────────────────────────────────────
    const hora = new Date().getHours();
    if (hora >= 3 && hora < 5)  check('madrugador');
    if (hora >= 0 && hora < 3)  check('nocturno');

    // Primer logro (siempre al final)
    if (nuevos.length > 0 && !u.logros.includes('primer_logro')) {
        u.logros.push('primer_logro');
        nuevos.push('primer_logro');
    }
    return nuevos;
}

// Mapa de contextos a los logros que se deben verificar
const CONTEXTO_LOGROS = {
    work:        ['primer_trabajo', 'empleado_mes', 'trabajador_nato', 'workaholic',
                  'primer_saldo', 'rico', 'millonario', 'multimillonario',
                  'aprendiz', 'veterano_nivel', 'experto', 'maestro_nivel', 'transcendido',
                  'comunicador', 'charlatan', 'madrugador', 'nocturno'],
    crime:       ['primer_crimen', 'criminal_pro', 'el_padrino', 'criminal_legendario',
                  'primer_saldo', 'rico', 'millonario', 'multimillonario'],
    steal:       ['primer_robo', 'maestro_ladron', 'super_ladron'],
    coinflip:    ['apostador', 'coinflip_lucky', 'coinflip_loco'],
    roulette:    ['apostador', 'lo_perdio_todo', 'ruleta_master'],
    fight:       ['primer_combate', 'campeon', 'leyenda', 'gladiador', 'dios_guerra'],
    train:       ['aprendiz', 'veterano_nivel', 'experto', 'maestro_nivel', 'transcendido'],
    rep:         ['reputado', 'popular', 'vip', 'estrella'],
    missions:    [],
    claimmission:['misionero'],
    blackjack:   ['bj_pro', 'bj_legend', 'bj_supremo'],
    slots:       ['jackpot_win'],
    invest:      ['inversor', 'inversor_pro', 'inversor_master'],
    gacha:       ['primer_waifu', 'coleccionista', 'harem_master', 'harem_epico', 'harem_legendario'],
    pet:         ['dueño'],
    clan:        ['fundador', 'guerrero_clan', 'tactica_clan', 'lider_clan'],
    daily:       ['primer_saldo', 'rico', 'millonario', 'multimillonario',
                  'racha_diaria', 'racha_legendaria', 'racha_centenaria', 'aprendiz', 'veterano_nivel'],
    deposit:     ['banquero'],
    social:      ['casado', 'comunicador', 'charlatan'],
    minigame:    ['matematico', 'sabio', 'trivia_master', 'adivinador', 'ahorcador', 'scramble_pro',
                  'quien_detective', 'ppt_master', 'ppt_leyenda', 'minijugador'],
    payloan:     ['prestamista', 'sin_deudas'],
    fish:        ['pescador', 'master_pescador'],
    mine:        ['minero', 'maestro_minero'],
    hunt:        ['cazador', 'maestro_cazador'],
    adventure:   ['aventurero', 'explorador'],
    mazmorra:    ['conquistador', 'maestro_mazmorra'],
    general:     Object.keys(LOGROS_DB),
};

async function verificarYNotificar(sock, jid, userId, u, contexto = 'general') {
    const filtro = CONTEXTO_LOGROS[contexto] || CONTEXTO_LOGROS.general;
    const nuevos = verificarLogros(u, filtro);
    if (nuevos.length) {
        guardarUsuario(userId, u);
        const textos = nuevos.map(id => `${LOGROS_DB[id].icono} *${LOGROS_DB[id].nombre}*\n_${LOGROS_DB[id].desc}_`).join('\n\n');
        await sock.sendMessage(jid, { text: `🏆 *¡LOGRO DESBLOQUEADO!*\n\n${textos}` });
    }
}

// ══════════════════════════════════════════
//  COMANDOS
// ══════════════════════════════════════════
async function cmdLogros(sock, jid, senderJid) {
    const u = getUsuario(senderJid);
    const logros = u.logros || [];
    const total = Object.keys(LOGROS_DB).length;
    if (!logros.length) {
        await sock.sendMessage(jid, { text: `🏆 *Mis logros (0/${total})*\n\nAún no tienes logros.\n_¡Juega, trabaja, roba y combate para desbloquearlos!_` });
        return;
    }
    const texto = logros.map(id => {
        const l = LOGROS_DB[id];
        return l ? `${l.icono} *${l.nombre}*` : null;
    }).filter(Boolean).join('\n');
    await sock.sendMessage(jid, { text: `🏆 *Mis logros (${logros.length}/${total})*\n\n${texto}` });
}

async function cmdListaLogros(sock, jid, pagina = 1) {
    const { paginar, piePagina } = require('./paginator');
    const publicos = Object.entries(LOGROS_DB).filter(([, l]) => !l.secreto);
    const secretos = Object.entries(LOGROS_DB).filter(([, l]) => l.secreto);
    const { items: pagina_items, pag, totalPags } = paginar(publicos, pagina, 15);
    const texto = pagina_items.map(([, l]) => `${l.icono} *${l.nombre}* — _${l.desc}_`).join('\n');
    const pie = pag === totalPags
        ? `\n\n🔒 *${secretos.length} logros secretos* — Descúbrelos tú mismo...`
        : '';
    await sock.sendMessage(jid, {
        text: `🏆 *Logros visibles (${publicos.length} totales)*\n\n${texto}${pie}${piePagina(pag, totalPags, 'achievementlist')}`
    });
}

module.exports = { verificarYNotificar, verificarLogros, cmdLogros, cmdListaLogros, LOGROS_DB };
