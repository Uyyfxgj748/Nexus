// ── Suprimir logs internos verbose de Baileys (deben ir ANTES de cualquier require) ──
const _stdoutWrite = process.stdout.write.bind(process.stdout);
process.stdout.write = (chunk, ...rest) => {
    const txt = typeof chunk === 'string' ? chunk : chunk.toString('utf8');
    if (
        txt.includes('Closing session') ||
        txt.includes('Removing old closed session') ||
        txt.includes('SessionEntry') ||
        txt.includes('ephemeralKeyPair') ||
        txt.includes('currentRatchet') ||
        txt.includes('pendingPreKey') ||
        txt.includes('remoteIdentityKey') ||
        txt.includes('baseKeyType')
    ) return true;
    return _stdoutWrite(chunk, ...rest);
};

const {
    default: makeWASocket,
    useMultiFileAuthState,
    makeCacheableSignalKeyStore,
    DisconnectReason,
    fetchLatestBaileysVersion,
    Browsers,
    isJidBroadcast
} = require('@whiskeysockets/baileys');

const pino  = require('pino');
const readline = require('readline');
const fs    = require('fs');
const path  = require('path');
const http  = require('http');

const { manejarMensaje, getBotActivo, getModoMantenimiento, getMensajeMantenimiento } = require('./src/handler');
const { isOwner } = require('./src/owners');
const { getGrupo, cargarGrupos } = require('./src/database');
const { iniciarSchedulerEventos } = require('./src/extras');
const { manejarMensajePersonajes, migracionDuplicados, validarIntegridadPersonajes } = require('./src/personajes');
const botState = require('./src/botState');
const { iniciarBackupAutomatico } = require('./src/backup');
const { logError, logInfo, logWarn } = require('./src/logger');
const { renderDashboard } = require('./src/dashboard');
const { actualizarYtdlp } = require('./src/ytdlpUpdater');

// ── Logger silencioso ────────────────────────────────────────────────────
const logger = pino({ level: 'silent' });

// ── Archivo de bloqueo: garantiza una sola instancia activa ─────────────
const PID_FILE = path.join(__dirname, '.bot.pid');

function registrarPID() {
    if (fs.existsSync(PID_FILE)) {
        const pidAnterior = parseInt(fs.readFileSync(PID_FILE, 'utf8').trim(), 10);
        if (!isNaN(pidAnterior) && pidAnterior !== process.pid) {
            try {
                process.kill(pidAnterior, 'SIGTERM');
                console.log(`🔫 Proceso anterior (PID ${pidAnterior}) terminado con SIGTERM.`);
            } catch (_) {}
            // Esperar 500ms y forzar SIGKILL si sigue vivo
            const inicio = Date.now();
            while (Date.now() - inicio < 500) {
                try { process.kill(pidAnterior, 0); } catch { break; } // ya murió
            }
            try {
                process.kill(pidAnterior, 'SIGKILL');
                console.log(`🔫 Proceso anterior (PID ${pidAnterior}) eliminado con SIGKILL.`);
            } catch (_) {} // ya estaba muerto, normal
        }
    }
    fs.writeFileSync(PID_FILE, String(process.pid));
}

function limpiarPID() {
    try {
        if (fs.existsSync(PID_FILE)) {
            const pid = parseInt(fs.readFileSync(PID_FILE, 'utf8').trim(), 10);
            if (pid === process.pid) fs.unlinkSync(PID_FILE);
        }
    } catch (_) {}
}

// Limpiar PID al salir
process.on('exit',    limpiarPID);
process.on('SIGINT',  () => { limpiarPID(); process.exit(0); });
process.on('SIGTERM', () => { limpiarPID(); process.exit(0); });

// Registrar esta instancia y matar la anterior si existe
registrarPID();

// ── Control de instancia única ───────────────────────────────────────────
let corriendo = false;
let intentosReconexion = 0;

// ── Watchdog: reconexión automática por silencio o conexión muerta ───────
let sockActivo    = null;
let watchdogTimer = null;

const WATCHDOG_INTERVALO = 2  * 60 * 1000;   // revisar cada 2 min
const WATCHDOG_UMBRAL    =  5 * 60 * 1000;   // umbral de silencio: 5 min

function iniciarWatchdog() {
    if (watchdogTimer) clearInterval(watchdogTimer);
    watchdogTimer = setInterval(async () => {
        if (!corriendo || !sockActivo) return;
        const silencio = Date.now() - botState.ultimoMensaje;
        if (silencio < WATCHDOG_UMBRAL) return;

        const mins = Math.round(silencio / 60000);
        console.log(`🐕 Watchdog: ${mins} min sin actividad. Verificando conexión...`);

        try {
            await sockActivo.sendPresenceUpdate('available');
            console.log(`🐕 Watchdog: conexión OK (${mins} min sin tráfico).`);
        } catch (err) {
            console.log(`🐕 Watchdog: conexión muerta (${err.message}). Reconectando...`);
            const sockRef = sockActivo;
            corriendo  = false;
            sockActivo = null;
            try { sockRef.end(new Error('watchdog')); } catch {}
            await esperar(2000);
            iniciarBot();
        }
    }, WATCHDOG_INTERVALO);
}

function preguntarNumero() {
    return new Promise((resolve) => {
        const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
        rl.question('📱 Número (con código de país, sin + ni espacios, ej: 521234567890): ', (n) => {
            rl.close();
            resolve(n.trim());
        });
    });
}

function esperar(ms) {
    return new Promise(r => setTimeout(r, ms));
}

async function iniciarBot() {
    if (corriendo) return;
    corriendo = true;

    try {
        // ── Credenciales con cache de claves de señal ──────────────────
        const { state, saveCreds } = await useMultiFileAuthState('auth_info');
        const { version, isLatest } = await fetchLatestBaileysVersion();

        // ── Crear socket con configuración estable ─────────────────────
        const sock = makeWASocket({
            version,
            auth: {
                creds: state.creds,
                // El CacheableSignalKeyStore reduce errores de descifrado
                // que provocan desconexiones inesperadas
                keys: makeCacheableSignalKeyStore(state.keys, logger)
            },
            // Windows + Chrome es el fingerprint más común de WhatsApp Web real.
            // Ubuntu llama la atención de los filtros de Meta porque casi ningún
            // usuario real accede desde Linux.
            browser: Browsers.windows('Chrome'),
            logger,
            printQRInTerminal: false,

            // Keep-alive cada 28-32 s (aleatorio en cada instancia) — imita el
            // intervalo real de WhatsApp Web en un navegador humano.
            keepAliveIntervalMs: 28_000 + Math.floor(Math.random() * 4_000),
            connectTimeoutMs:    60_000,
            defaultQueryTimeoutMs: 60_000,

            // No cargar historial completo (reduce carga y errores)
            syncFullHistory: false,

            // Función requerida para descifrar mensajes correctamente
            getMessage: async () => ({ conversation: '' }),

            // Ignorar mensajes de broadcast para evitar errores
            shouldIgnoreJid: jid => isJidBroadcast(jid),

            // Retry con delay más humano: 1-2 segundos entre intentos
            retryRequestDelayMs: 1000 + Math.floor(Math.random() * 1000),
            maxMsgRetryCount: 3,
        });

        sock.ev.on('creds.update', saveCreds);

        // ── Solicitar código de emparejamiento si no está registrado ───
        let codigoSolicitado = false;

        sock.ev.on('connection.update', async ({ connection, lastDisconnect, qr }) => {
            if (connection === 'connecting' && !sock.authState.creds.registered && !codigoSolicitado) {
                codigoSolicitado = true;
                try {
                    await esperar(2000);
                    const numero = process.env.PHONE_NUMBER || await preguntarNumero();
                    const limpio = numero.replace(/\D/g, '');
                    const codigo = await sock.requestPairingCode(limpio);
                    console.log(`\n╔══════════════════════════════╗`);
                    console.log(`║  CÓDIGO: ${codigo.padEnd(20)}║`);
                    console.log(`╚══════════════════════════════╝`);
                    console.log('👉 WhatsApp > Dispositivos vinculados > Vincular con número\n');
                } catch (e) {
                    console.error('⚠️ Error al pedir código:', e.message);
                    codigoSolicitado = false;
                }
            }

            if (connection === 'open') {
                intentosReconexion         = 0;
                botState.intentosReconexion = 0;
                botState.conectado         = true;
                botState.ultimoMensaje     = Date.now();
                sockActivo = sock;
                iniciarWatchdog();
                const { iniciarCheckTempbans } = require('./src/tempban');
                const { iniciarCheckMutebots } = require('./src/admin');
                iniciarCheckTempbans(sock);
                iniciarCheckMutebots(sock);
                iniciarSchedulerEventos(sock, cargarGrupos);
                const { iniciarSchedulerCumpleanos } = require('./src/profile');
                iniciarSchedulerCumpleanos(sock, cargarGrupos);
                console.log('✅ Bot conectado.');
            }

            if (connection === 'close') {
                corriendo          = false;
                sockActivo         = null;
                botState.conectado = false;
                const code = lastDisconnect?.error?.output?.statusCode;

                // Sesión cerrada permanentemente → no reconectar
                if (code === DisconnectReason.loggedOut || code === 401 || code === 403) {
                    console.log('❌ Sesión cerrada definitivamente. Borra auth_info y reinicia.');
                    process.exit(1);
                }

                // Backoff progresivo: máximo 60 s para evitar reconexiones que parecen automatizadas
                intentosReconexion++;
                botState.intentosReconexion = intentosReconexion;
                const base   = code === 440 ? 8000 : 3000;
                const demora = Math.min(base * Math.min(intentosReconexion, 5), 60_000);
                const razon  = DisconnectReason[code] || `código ${code}`;
                console.log(`🔄 Desconectado (${razon}). Reconectando en ${demora / 1000}s... (intento ${intentosReconexion})`);

                await esperar(demora);
                iniciarBot();
            }
        });

        // ── Bienvenida / Despedida de grupos ──────────────────────────
        const enviarMediaBG = async (id, texto, p, media) => {
            try {
                if (!media || !media.path || !fs.existsSync(media.path)) {
                    await sock.sendMessage(id, { text: texto, mentions: [p] });
                    return;
                }
                const buf = fs.readFileSync(media.path);
                if (media.tipo === 'image') {
                    await sock.sendMessage(id, { image: buf, caption: texto, mentions: [p] });
                } else if (media.tipo === 'gif') {
                    await sock.sendMessage(id, { video: buf, caption: texto, mentions: [p], gifPlayback: true });
                } else if (media.tipo === 'video') {
                    await sock.sendMessage(id, { video: buf, caption: texto, mentions: [p] });
                } else {
                    await sock.sendMessage(id, { text: texto, mentions: [p] });
                }
            } catch (err) {
                console.error('Error enviando media BG:', err.message);
                await sock.sendMessage(id, { text: texto, mentions: [p] });
            }
        };

        const obtenerMediaBG = (g, modo) => {
            const campo = modo === 'welcome' ? 'welcomeMedia' : 'goodbyeMedia';
            const legacy = modo === 'welcome' ? 'welcomeImagePath' : 'goodbyeImagePath';
            if (g[campo] && g[campo].path) return g[campo];
            if (g[legacy]) return { tipo: 'image', path: g[legacy] };
            return null;
        };

        sock.ev.on('group-participants.update', async ({ id, participants, action }) => {
            try {
                console.log(`[GP-UPDATE] grupo=${id.slice(-10)} action=${action} participants=${JSON.stringify(participants)}`);
                const g = getGrupo(id);
                if (g.botActivo === false) {
                    console.log('[GP-UPDATE] Bot inactivo en este grupo, ignorando.');
                    return;
                }

                // Baileys 7.x puede entregar participantes como objetos { phoneNumber, lid }
                // o como strings JID directos — esta función normaliza ambos casos
                const extraerJid = (p) => {
                    if (typeof p === 'string') return p;
                    return p.phoneNumber || p.jid || p.id || String(p);
                };

                // 'add' cubre: añadido por admin, link de invitación y solicitud aprobada
                if ((action === 'add' || action === 'invite') && g.bienvenida) {
                    console.log('[GP-UPDATE] Enviando bienvenida...');
                    const media = obtenerMediaBG(g, 'welcome');
                    for (const p of participants) {
                        const jid = extraerJid(p);
                        const texto = (g.mensajeBienvenida || '╭─ 💬 Bienvenido/a ─╮\n👋 ¡Hey! @usuario, qué bueno verte por aquí\n\nSoy Nexus ⚡ tu bot compañero\npara ayudarte, entretenerte\ny sacarte de cualquier apuro 😄\n\n🎯 ¿Qué puedes hacer?\n• Juegos y diversión 🎮\n• Comandos útiles 🛠️\n• Interacción con otros 👥\n• Y varias sorpresas más ✨\n\n💡 Consejo rápido:\nEscribe #menu y explora todo lo que tengo para ti\n\n🔥 Tip:\nMientras más uses los comandos,\nmás cosas irás descubriendo 👀\n\n✨ Relájate, explora y disfruta\neste pequeño rincón digital\n\n╰─ Hecho para pasarla bien ─╯')
                            .replace(/@usuario|(?<!\w)@(?!\w)/g, `@${jid.split('@')[0]}`);
                        await enviarMediaBG(id, texto, jid, media);
                    }
                }
                if (action === 'remove' && g.despedida) {
                    console.log('[GP-UPDATE] Enviando despedida...');
                    const media = obtenerMediaBG(g, 'goodbye');
                    for (const p of participants) {
                        const jid = extraerJid(p);
                        const texto = (g.mensajeDespedida || '╭─ 💭 Despedida ─╮\n👋 @usuario, fue un gusto tenerte por aquí\n\nSoy Nexus ⚡ y espero haberte ayudado\no al menos haberte hecho pasar\nun buen rato 😄\n\n🎯 Antes de irte:\n• Guarda tus comandos favoritos ⭐\n• Invita a otros a usar el bot 👥\n• Y vuelve cuando quieras 🔄\n\n💡 Recuerda:\nSiempre habrá algo nuevo por descubrir\ncada vez que regreses 👀\n\n🔥 Dato:\nEl bot sigue activo… incluso cuando tú no estás 😏\n\n✨ Cuídate y nos vemos pronto\n\n╰─ Nexus siempre estará aquí ─╯')
                            .replace(/@usuario|(?<!\w)@(?!\w)/g, `@${jid.split('@')[0]}`);
                        await enviarMediaBG(id, texto, jid, media);
                    }
                }
            } catch (err) {
                console.error('Error group-participants.update:', err.message, err.stack);
            }
        });

        // ── Mensajes entrantes ─────────────────────────────────────────
        sock.ev.on('messages.upsert', async ({ messages, type }) => {
            if (type !== 'notify') return;

            // Registrar actividad para el watchdog
            botState.ultimoMensaje = Date.now();

            for (const msg of messages) {
                try {
                    // Ignorar mensajes de estado
                    if (msg.key.remoteJid === 'status@broadcast') continue;

                    // Permitir mensajes propios solo si son comandos (#)
                    if (msg.key.fromMe) {
                        const textoPropio = (
                            msg.message?.conversation ||
                            msg.message?.extendedTextMessage?.text || ''
                        ).trim();
                        if (!textoPropio.startsWith('#')) continue;
                    }

                    let groupMetadata = null;
                    if (msg.key.remoteJid?.endsWith('@g.us')) {
                        try {
                            groupMetadata = await sock.groupMetadata(msg.key.remoteJid);
                        } catch {}
                    }

                    const texto = (
                        msg.message?.conversation ||
                        msg.message?.extendedTextMessage?.text || ''
                    ).trim();

                    const comando = texto.startsWith('#')
                        ? texto.slice(1).split(' ')[0].toLowerCase()
                        : '';

                    // Al detectar el comando base, eliminamos el sufijo numérico
                    // para que #harem2 → base='harem', #slist3 → base='slist', etc.
                    const comandoBase = comando.replace(/\d+$/, '');

                    const comandosPersonajes = [
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
                        'claim', 'c', 'reclamar'
                    ];

                    if (comandosPersonajes.includes(comandoBase)) {
                        // ── Verificar estado global ANTES de ejecutar comandos gacha ─────
                        // Sin este bloque, comandos como #roll o #harem funcionaban incluso
                        // cuando el bot estaba en #off o #mantenimiento, porque esa lógica
                        // solo existía dentro de manejarMensaje (handler.js), no aquí.
                        const jidG    = msg.key.remoteJid;
                        const senderG = msg.key.participant || msg.key.remoteJid;
                        const esGrupoG = jidG?.endsWith('@g.us');

                        if (!getBotActivo()) {
                            await sock.sendMessage(jidG, { text: '⚠️ El bot está apagado.' });
                        } else if (getModoMantenimiento() && !isOwner(senderG)) {
                            await sock.sendMessage(jidG, { text: getMensajeMantenimiento() });
                        } else if (esGrupoG && getGrupo(jidG)?.botActivo === false && !isOwner(senderG)) {
                            await sock.sendMessage(jidG, { text: '⚠️ El bot está desactivado en este grupo. Usa *#on* para activarlo.' });
                        } else {
                            await manejarMensajePersonajes(sock, msg);
                        }
                    } else {
                        await manejarMensaje(sock, msg, groupMetadata);
                    }
                } catch (err) {
                    console.error('Error procesando mensaje:', err.message);
                }
            }
        });

    } catch (err) {
        corriendo = false;
        intentosReconexion++;
        const demora = Math.min(3000 * intentosReconexion, 30_000);
        console.error(`Error iniciando bot (intento ${intentosReconexion}):`, err.message);
        await esperar(demora);
        iniciarBot();
    }
}

// ── Servidor keep-alive + panel web ─────────────────────────────────────
const PORT = process.env.PORT || 3000;
const _botStart = new Date().toISOString();

const _server = http.createServer((req, res) => {
    const url = require('url').parse(req.url || '/').pathname;
    if (url === '/dashboard' || url === '/panel') {
        renderDashboard(req, res);
        return;
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
        status: 'online',
        bot: 'Nexus-Bot',
        uptime: process.uptime().toFixed(0) + 's',
        started: _botStart,
        hora: new Date().toISOString(),
        panel: '/dashboard'
    }));
});

function iniciarServidor(puerto) {
    _server.listen(puerto, () => {
        console.log(`🌐 Servidor keep-alive activo en el puerto ${puerto}`);

        // Auto-ping interno cada 4 minutos
        const urlPropia = process.env.REPLIT_DEV_DOMAIN
            ? `https://${process.env.REPLIT_DEV_DOMAIN}`
            : `http://localhost:${puerto}`;

        setInterval(() => {
            const mod = urlPropia.startsWith('https') ? require('https') : http;
            mod.get(urlPropia, (r) => {
                console.log(`🔄 Auto-ping OK [${new Date().toLocaleTimeString()}] — uptime: ${process.uptime().toFixed(0)}s`);
                r.resume();
            }).on('error', () => {});
        }, 4 * 60 * 1000);
    });

    _server.on('error', (err) => {
        if (err.code === 'EADDRINUSE') {
            console.warn(`⚠️  Puerto ${puerto} ocupado, reintentando en ${puerto + 1}...`);
            setTimeout(() => iniciarServidor(puerto + 1), 1000);
        } else {
            console.error('❌ Error servidor keep-alive:', err.message);
        }
    });
}

iniciarServidor(PORT);

// ── Backup automático cada hora ──────────────────────────────────────────
iniciarBackupAutomatico(60 * 60 * 1000);
migracionDuplicados();

// ── Manejo de errores globales para evitar caídas silenciosas ─────────────
process.on('uncaughtException', (err) => {
    logError('Error no capturado', err);
});

process.on('unhandledRejection', (reason) => {
    if (reason instanceof Error) {
        logError('Promesa rechazada', reason);
    } else if (typeof reason === 'string') {
        logWarn(`Promesa rechazada: ${reason}`);
    } else {
        console.error('❌ Promesa rechazada: [objeto interno de Baileys - ignorado]');
    }
});

logInfo('Nexus-Bot iniciando...');
// ── Validar integridad del JSON de personajes al arrancar ────────────────
// Detecta tags vacíos, duplicados y nombres repetidos. Solo muestra avisos.
validarIntegridadPersonajes();
// ── Auto-actualizar yt-dlp al arrancar (no bloquea el inicio del bot) ────
actualizarYtdlp();
iniciarBot();
