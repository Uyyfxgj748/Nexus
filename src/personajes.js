const fs = require('fs');
const path = require('path');
const axios = require('axios');

const { cargarUsuarios, guardarUsuarios } = require('./database');
const { verificarGacha } = require('./permisos');

const personajesPath = path.join(__dirname, '../src/personajes.json');

// ── Cache en memoria para no leer JSON en cada comando ──────────────────────
let _cache = null;
function getPersonajes() {
    if (_cache) return _cache;
    if (!fs.existsSync(personajesPath)) return [];
    _cache = JSON.parse(fs.readFileSync(personajesPath)).personajes || [];
    return _cache;
}

function invalidarCache() { _cache = null; }

// ── BUG 4 FIX: Validar integridad de personajes.json al cargar ───────────
// Detecta: tags duplicados, tags vacíos, y nombres duplicados.
// Solo imprime advertencias en consola — no bloquea el arranque del bot.
function validarIntegridadPersonajes() {
    try {
        const lista = getPersonajes();
        if (!lista.length) return;

        const tagsSeen    = new Map(); // tag → primer índice
        const idsSeen     = new Map(); // id  → primer índice
        const nombresSeen = new Map(); // nombre → primer índice
        let advertencias  = 0;

        lista.forEach((p, i) => {
            // ── Tag vacío o ausente ──────────────────────────────────────────
            if (!p.tag || !String(p.tag).trim()) {
                console.warn(`[GACHA WARN] Personaje sin tag: "${p.nombre}" (índice ${i})`);
                advertencias++;
            } else {
                const tagKey = String(p.tag).toLowerCase().trim();
                if (tagsSeen.has(tagKey)) {
                    console.warn(`[GACHA WARN] Tag duplicado "${p.tag}" en "${p.nombre}" (índice ${i}) y "${lista[tagsSeen.get(tagKey)].nombre}" (índice ${tagsSeen.get(tagKey)})`);
                    advertencias++;
                } else {
                    tagsSeen.set(tagKey, i);
                }
            }

            // ── ID único ausente o duplicado ─────────────────────────────────
            if (!p.id || !String(p.id).trim()) {
                console.warn(`[GACHA WARN] Personaje sin id interno: "${p.nombre}" (índice ${i}) — ejecuta el script de migración de IDs`);
                advertencias++;
            } else {
                const idKey = String(p.id).toLowerCase().trim();
                if (idsSeen.has(idKey)) {
                    console.warn(`[GACHA WARN] ID duplicado "${p.id}" en "${p.nombre}" (índice ${i}) y "${lista[idsSeen.get(idKey)].nombre}" (índice ${idsSeen.get(idKey)})`);
                    advertencias++;
                } else {
                    idsSeen.set(idKey, i);
                }
            }

            // ── Nombre duplicado (visible, no bloquea, solo informa) ─────────
            if (p.nombre) {
                const nombreKey = String(p.nombre).toLowerCase().trim();
                if (nombresSeen.has(nombreKey)) {
                    console.warn(`[GACHA WARN] Nombre duplicado "${p.nombre}" (índice ${i}) ya existe en índice ${nombresSeen.get(nombreKey)} — considera diferenciarlo (ej: "${p.nombre} (${p.serie})")`);
                    advertencias++;
                } else {
                    nombresSeen.set(nombreKey, i);
                }
            }

            // ── Valor inválido ────────────────────────────────────────────────
            if (!p.valor || typeof p.valor !== 'number' || p.valor <= 0) {
                console.warn(`[GACHA WARN] Valor inválido en "${p.nombre}" (índice ${i}): ${p.valor}`);
                advertencias++;
            }

            // ── Serie vacía ───────────────────────────────────────────────────
            if (!p.serie || !String(p.serie).trim()) {
                console.warn(`[GACHA WARN] Serie vacía en "${p.nombre}" (índice ${i})`);
                advertencias++;
            }
        });

        if (advertencias === 0) {
            console.log(`[GACHA] ✅ ${lista.length} personajes cargados sin problemas de integridad.`);
        } else {
            console.warn(`[GACHA] ⚠️  ${lista.length} personajes cargados con ${advertencias} advertencia(s). Revisa los mensajes anteriores.`);
        }
    } catch (e) {
        console.error('[GACHA] Error al validar integridad de personajes:', e.message);
    }
}

function cargarJSON(ruta) {
    if (!fs.existsSync(ruta)) return {};
    try { return JSON.parse(fs.readFileSync(ruta, 'utf8')); } catch { return {}; }
}

// Guardado atómico: escribe en .tmp y renombra para evitar corrupción (punto 5)
function guardarJSON(ruta, data) {
    const tmp = ruta + '.tmp';
    try {
        fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
        fs.renameSync(tmp, ruta);
    } catch (e) {
        try { fs.unlinkSync(tmp); } catch { }
        throw e;
    }
}

function encodeBooruTags(tags) {
    return encodeURIComponent(String(tags || '').replace(/\+/g, ' ').replace(/\s+/g, ' ').trim());
}

function msToTime(ms) {
    const minutos = Math.floor((ms / (1000 * 60)) % 60);
    const segundos = Math.floor((ms / 1000) % 60);
    return `${minutos}m ${segundos}s`;
}

function barraCooldown(restante, total) {
    const totalBars = 10;
    const llenos = Math.round(((total - restante) / total) * totalBars);
    return '🟩'.repeat(llenos) + '⬜'.repeat(totalBars - llenos);
}

// Expiración del personaje rolleado y cooldown del claim
const ROLL_EXPIRACION = 3 * 60 * 1000;   // 3 minutos para reclamar el personaje
const CLAIM_COOLDOWN  = 3 * 60 * 1000;   // 3min de cooldown entre claims

// Ventana de protección: el roller tiene prioridad exclusiva durante 10 segundos
const CLAIM_PRIORITY_WINDOW = 10 * 1000; // 10 segundos

// ── Rolls activos por grupo (en memoria) ────────────────────────────────────
// Estructura: Map<groupId, { nombre, rollerJid, rollTime }>
// Permite validar que el claim por citación provenga de un roll reciente real
const pendingGroupRolls = new Map();

// Buscar GIF/video animado de personaje (para #cvideo)
async function buscarVideoPersonaje(tag) {
    if (!tag) return null;
    const tagLimpio = tag.trim().replace(/\s+/g, '_');
    const headers = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' };
    const filtros = ['+animated+rating:general', '+animated+rating:safe', '+animated', '+gif'];
    for (const filtro of filtros) {
        // Gelbooru animados
        try {
            const pid = Math.floor(Math.random() * 3);
            const res = await axios.get(
                `https://gelbooru.com/index.php?page=dapi&s=post&q=index&json=1&limit=60&tags=${encodeBooruTags(tagLimpio + filtro)}&pid=${pid}`,
                { timeout: 12000, headers }
            );
            const data = res.data;
            const posts = Array.isArray(data) ? data : (Array.isArray(data?.post) ? data.post : (Array.isArray(data?.posts) ? data.posts : []));
            const animados = posts.filter(p => p.file_url && /\.(gif|mp4|webm)$/i.test(p.file_url));
            if (animados.length) return animados[Math.floor(Math.random() * animados.length)].file_url;
        } catch { }
        // Safebooru animados
        try {
            const pid = Math.floor(Math.random() * 3);
            const res = await axios.get(
                `https://safebooru.org/index.php?page=dapi&s=post&q=index&json=1&limit=60&tags=${encodeBooruTags(tagLimpio + filtro)}&pid=${pid}`,
                { timeout: 12000, headers }
            );
            const rawSafe = res.data;
            const posts = Array.isArray(rawSafe) ? rawSafe : (Array.isArray(rawSafe?.post) ? rawSafe.post : (Array.isArray(rawSafe?.posts) ? rawSafe.posts : []));
            const animados = posts.filter(p => p.file_url && /\.(gif|mp4|webm)$/i.test(p.file_url));
            if (animados.length) return animados[Math.floor(Math.random() * animados.length)].file_url;
        } catch { }
    }
    // Tenor (gifs públicos) — intenta nombre limpio
    try {
        const consulta = encodeURIComponent(tagLimpio.replace(/_/g, ' ') + ' anime');
        const res = await axios.get(
            `https://g.tenor.com/v1/search?q=${consulta}&limit=20&media_filter=minimal&contentfilter=high`,
            { timeout: 10000, headers }
        );
        const results = res.data?.results || [];
        const urls = results
            .map(r => r.media?.[0]?.gif?.url || r.media?.[0]?.mp4?.url)
            .filter(Boolean);
        if (urls.length) return urls[Math.floor(Math.random() * urls.length)];
    } catch { }
    return null;
}

// Usa el JID completo como clave (ej: 123456789@s.whatsapp.net o @lid)
function asegurarUsuario(usuarios, jid) {
    if (!usuarios[jid]) {
        usuarios[jid] = { monedas: 100000, harem: [], cooldowns: {}, claimMsg: null, ventas: [], votosPersonaje: {}, haremGrupo: {}, ventasGrupo: {} };
    }
    const u = usuarios[jid];
    if (!u.harem) u.harem = [];
    if (!u.cooldowns) u.cooldowns = {};
    if (u.monedas === undefined) u.monedas = 0;
    if (!u.claimMsg) u.claimMsg = null;
    if (!u.ventas) u.ventas = [];
    if (!u.votosPersonaje) u.votosPersonaje = {};
    if (!u.haremGrupo) u.haremGrupo = {};
    if (!u.ventasGrupo) u.ventasGrupo = {};
    return u;
}

function getUsuarioPersonajes(senderJid) {
    const usuarios = cargarUsuarios();
    const u = asegurarUsuario(usuarios, senderJid);
    return { usuarios, u };
}

// ── Obtener imagen de un personaje ──────────────────────────────────────────
async function buscarImagenPersonaje(tag) {
    if (!tag) return null;
    const tagLimpio = tag.trim().replace(/\s+/g, '_');
    const headers = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' };

    function parseSafebooru(raw) {
        const posts = Array.isArray(raw) ? raw
            : Array.isArray(raw?.post) ? raw.post
            : Array.isArray(raw?.posts) ? raw.posts : [];
        return posts.filter(p => {
            const url = p.file_url || (p.directory && p.image ? `https://safebooru.org//images/${p.directory}/${p.image}` : '');
            return url && /\.(jpg|jpeg|png|webp)$/i.test(url);
        }).map(p => p.file_url || `https://safebooru.org//images/${p.directory}/${p.image}`);
    }

    // 1. Safebooru — sin filtro de rating (más resultados), siempre pid=0 primero
    for (const filtro of ['', '+rating:safe']) {
        for (const pid of [0, Math.floor(Math.random() * 8) + 1]) {
            try {
                const res = await axios.get(
                    `https://safebooru.org/index.php?page=dapi&s=post&q=index&json=1&limit=60&tags=${encodeBooruTags(tagLimpio + filtro)}&pid=${pid}`,
                    { timeout: 10000, headers }
                );
                const urls = parseSafebooru(res.data);
                if (urls.length) return urls[Math.floor(Math.random() * urls.length)];
            } catch { }
        }
    }

    // 2. Yande.re — excelente cobertura de personajes anime
    for (const pid of [1, Math.floor(Math.random() * 5) + 1]) {
        try {
            const res = await axios.get(
                `https://yande.re/post.json?tags=${encodeBooruTags(tagLimpio)}&limit=40&page=${pid}`,
                { timeout: 10000, headers }
            );
            const posts = (res.data || []).filter(p => p.file_url && /\.(jpg|jpeg|png|webp)$/i.test(p.file_url));
            if (posts.length) return posts[Math.floor(Math.random() * posts.length)].file_url;
        } catch { }
    }

    // 3. Konachan
    try {
        const res = await axios.get(
            `https://konachan.net/post.json?tags=${encodeBooruTags(tagLimpio)}&limit=40`,
            { timeout: 10000, headers }
        );
        const posts = (res.data || []).filter(p => p.file_url && /\.(jpg|jpeg|png|webp)$/i.test(p.file_url));
        if (posts.length) return posts[Math.floor(Math.random() * posts.length)].file_url;
    } catch { }

    // 4. Safebooru con solo el nombre base del personaje (sin serie)
    const nombreBase = tagLimpio.split('_').slice(0, 2).join('_');
    if (nombreBase !== tagLimpio) {
        try {
            const res = await axios.get(
                `https://safebooru.org/index.php?page=dapi&s=post&q=index&json=1&limit=40&tags=${encodeBooruTags(nombreBase)}&pid=0`,
                { timeout: 10000, headers }
            );
            const urls = parseSafebooru(res.data);
            if (urls.length) return urls[Math.floor(Math.random() * urls.length)];
        } catch { }
    }

    // 5. Fallback final: Safebooru con tag genérico de anime
    try {
        const genericTags = ['1girl+solo+long_hair', '1girl+solo+short_hair', '1girl+anime+school_uniform'];
        const gTag = genericTags[Math.floor(Math.random() * genericTags.length)];
        const pid = Math.floor(Math.random() * 300);
        const res = await axios.get(
            `https://safebooru.org/index.php?page=dapi&s=post&q=index&json=1&limit=20&tags=${gTag}&pid=${pid}`,
            { timeout: 10000, headers }
        );
        const urls = parseSafebooru(res.data);
        if (urls.length) return urls[Math.floor(Math.random() * urls.length)];
    } catch { }

    return null;
}

// ── Helpers por grupo ────────────────────────────────────────────────────────
function getHaremGrupo(u, groupId) {
    if (!u.haremGrupo) u.haremGrupo = {};
    if (!u.haremGrupo[groupId]) u.haremGrupo[groupId] = [];
    return u.haremGrupo[groupId];
}

// Vista combinada para mostrar: personajes del grupo + legado global (sin duplicar)
function getHaremDisplay(u, groupId) {
    const grupoHarem = getHaremGrupo(u, groupId);
    const legacyHarem = (u.harem || []);
    const nombresGrupo = new Set(grupoHarem.map(p => (typeof p === 'string' ? p : p.nombre)?.toLowerCase()));
    const soloLegacy = legacyHarem.filter(p => {
        const n = (typeof p === 'string' ? p : p.nombre)?.toLowerCase();
        return n && !nombresGrupo.has(n);
    });
    return [...grupoHarem, ...soloLegacy];
}

function getVentasGrupo(u, groupId) {
    if (!u.ventasGrupo) u.ventasGrupo = {};
    if (!u.ventasGrupo[groupId]) u.ventasGrupo[groupId] = [];
    return u.ventasGrupo[groupId];
}

// ── Estado del personaje (Libre / Reclamado) — por grupo ────────────────────
// Acepta el objeto personaje completo (o solo nombre como fallback legacy)
function obtenerEstadoGrupo(entrada, groupId) {
    return obtenerDuenoPersonajeGrupo(entrada, groupId) ? 'Reclamado' : 'Libre';
}

/**
 * obtenerDuenoPersonajeGrupo — busca quién tiene un personaje en el grupo.
 *
 * Acepta un objeto personaje (con id) o solo un nombre (string).
 * Busca primero por id único, luego por nombre como fallback legacy.
 */
function obtenerDuenoPersonajeGrupo(entrada, groupId) {
    const entradaId     = typeof entrada === 'object' ? entrada?.id     : null;
    const entradaNombre = typeof entrada === 'object' ? entrada?.nombre : entrada;
    const n = String(entradaNombre || '').toLowerCase();

    const usuarios = cargarUsuarios();
    for (const [uid, ud] of Object.entries(usuarios)) {
        const h = getHaremGrupo(ud, groupId);
        const found = h.some(p => {
            const pId     = typeof p === 'object' ? p?.id : null;
            const pNombre = (typeof p === 'string' ? p : p?.nombre) || '';
            if (entradaId && pId) return entradaId === pId;
            return pNombre.toLowerCase() === n;
        });
        if (found) return uid;
    }
    return null;
}

// ── Migración: limpiar duplicados del harem global (u.harem) ────────────────
function migracionDuplicados() {
    try {
        const usuarios = cargarUsuarios();
        const mapa = {}; // nombre → [uid, ...]

        for (const [uid, ud] of Object.entries(usuarios)) {
            for (const p of (ud.harem || [])) {
                const nombre = (typeof p === 'string' ? p : p.nombre)?.toLowerCase?.();
                if (!nombre) continue;
                if (!mapa[nombre]) mapa[nombre] = [];
                mapa[nombre].push(uid);
            }
        }

        let cambios = 0;
        const log = [];
        for (const [nombre, uids] of Object.entries(mapa)) {
            if (uids.length < 2) continue;
            // Hay duplicados — eliminar de todos y compensar 50k cada uno
            for (const uid of uids) {
                const ud = usuarios[uid];
                if (!ud) continue;
                const antes = (ud.harem || []).length;
                ud.harem = (ud.harem || []).filter(p => {
                    const n = (typeof p === 'string' ? p : p.nombre)?.toLowerCase?.();
                    return n !== nombre;
                });
                if (ud.harem.length < antes) {
                    ud.monedas = (ud.monedas || 0) + 50000;
                    cambios++;
                    log.push(`  [+50k] ${uid.split('@')[0]} — ${nombre}`);
                }
                usuarios[uid] = ud;
            }
        }

        if (cambios > 0) {
            guardarUsuarios(usuarios);
            console.log(`[MIGRACIÓN] Se eliminaron ${cambios} personaje(s) duplicado(s) del harem global y se compensaron 50,000 ⓃNC cada uno:`);
            log.forEach(l => console.log(l));
        }
    } catch (e) {
        console.error('[MIGRACIÓN] Error en migración de duplicados:', e.message);
    }
}

function normalizarPersonajeHarem(personaje) {
    // Incluimos id y tag para que las búsquedas internas sean precisas
    // aunque el nombre tenga duplicados o variaciones ortográficas.
    // El campo 'nombre' sigue siendo el que el usuario VE.
    // El campo 'id'  es el identificador interno único (basado en el tag limpio).
    // El campo 'tag' se usa para buscar imágenes en Safebooru/Yande.re/Konachan.
    return {
        nombre:   personaje.nombre,
        serie:    personaje.serie,
        genero:   personaje.genero,
        valor:    personaje.valor,
        favorito: false,
        ...(personaje.id  ? { id:  personaje.id  } : {}),
        ...(personaje.tag ? { tag: personaje.tag } : {}),
    };
}

function obtenerNombrePersonajeValor(personaje) {
    return (typeof personaje === 'string' ? personaje : personaje?.nombre || '').trim();
}

/**
 * estaEnHarem — comprueba si un personaje ya está en el harem del usuario.
 *
 * Estrategia de búsqueda (de más a menos precisa):
 * 1. Si la entrada buscada tiene un campo `id` y la entrada del harem también
 *    tiene `id`, se compara por ID único. Esto es inmune a nombres duplicados.
 * 2. Si no hay IDs disponibles, se compara por nombre exacto (como antes).
 *    Esto mantiene compatibilidad con harams guardados antes de la migración.
 *
 * @param {Array}  harem   Lista de personajes del usuario.
 * @param {string|object} entrada Personaje a buscar. Puede ser string (nombre)
 *                                u objeto { nombre, id, tag, ... }.
 */
function estaEnHarem(harem, entrada) {
    const entradaId = typeof entrada === 'object' ? entrada?.id : null;
    const entradaNombre = String(
        typeof entrada === 'string' ? entrada : (entrada?.nombre || '')
    ).toLowerCase();

    return (harem || []).some(h => {
        const hId     = typeof h === 'object' ? h?.id : null;
        const hNombre = obtenerNombrePersonajeValor(h).toLowerCase();

        // Preferir comparación por ID único cuando ambos lados lo tienen
        if (entradaId && hId) return entradaId === hId;

        // Fallback: comparar por nombre (compatibilidad con harams legacy)
        return hNombre === entradaNombre;
    });
}

function guardarUsuarioSeguro(senderJid, updater) {
    const usuarios = cargarUsuarios();
    const u = asegurarUsuario(usuarios, senderJid);
    updater(u, usuarios);
    usuarios[senderJid] = u;
    guardarUsuarios(usuarios);
    return { usuarios, u };
}

function extraerNombreCitado(msg) {
    const ctx = msg.message?.extendedTextMessage?.contextInfo;
    const quoted = ctx?.quotedMessage;
    const texto = quoted?.conversation
        || quoted?.extendedTextMessage?.text
        || quoted?.imageMessage?.caption
        || quoted?.videoMessage?.caption
        || '';
    if (!texto) return null;
    // SEGURIDAD: solo aceptar mensajes que son resultados de roll (#rw)
    // El formato de roll incluye "*Nombre »*" Y la instrucción "#claim"
    const esRoll = texto.includes('Nombre »') && texto.includes('#claim');
    if (!esRoll) return null;
    return texto.match(/\*Nombre »\*\s*([^\n]+)/)?.[1]?.trim() || null;
}

function cargarUsuarioActualizado(senderJid) {
    const usuarios = cargarUsuarios();
    const u = asegurarUsuario(usuarios, senderJid);
    return { usuarios, u };
}

// ── Sistema de Rareza ───────────────────────────────────────────────────────
function getRareza(valor) {
    if (valor >= 1500) return { nombre: 'Legendario', emoji: '🌟', tier: 4 };
    if (valor >= 1000) return { nombre: 'Épico',      emoji: '💜', tier: 3 };
    if (valor >= 700)  return { nombre: 'Raro',       emoji: '💙', tier: 2 };
    return                    { nombre: 'Común',      emoji: '⬜', tier: 1 };
}

// Selección ponderada por rareza para el roll
function rollPonderado(lista) {
    const comun      = lista.filter(p => p.valor < 700);
    const raro       = lista.filter(p => p.valor >= 700  && p.valor < 1000);
    const epico      = lista.filter(p => p.valor >= 1000 && p.valor < 1500);
    const legendario = lista.filter(p => p.valor >= 1500);

    // Pesos: Común 50%, Raro 30%, Épico 15%, Legendario 5%
    const rand = Math.random() * 100;
    let pool;
    if (rand < 5  && legendario.length) pool = legendario;
    else if (rand < 20 && epico.length)      pool = epico;
    else if (rand < 50 && raro.length)       pool = raro;
    else if (comun.length)                   pool = comun;
    else                                     pool = lista;

    return pool[Math.floor(Math.random() * pool.length)];
}

// ── Formato de caption como en la referencia ───────────────────────────────
function formatCaption(p, groupId) {
    const generoIcon = p.genero?.toLowerCase() === 'femenino' ? '♀' : p.genero?.toLowerCase() === 'masculino' ? '♂' : '⚧';
    const estado = obtenerEstadoGrupo(p, groupId || 'dm');
    const { nombre: rarNombre, emoji: rarEmoji } = getRareza(p.valor);
    const costo = (p.valor * CLAIM_COST_MULTIPLIER).toLocaleString();
    return `🌸 *Nombre »* ${p.nombre}\n${generoIcon} *Género »* ${p.genero}\n${rarEmoji} *Rareza »* ${rarNombre}\n☆ *Valor »* ${p.valor}\n💸 *Costo »* ${costo} coins\n♡ *Estado »* ${estado}\n❖ *Fuente »* ${p.serie}\n\n💾 Cita este mensaje y usa *#claim* · *#c* para reclamarlo`;
}

// Multiplicador: el costo de reclamar un personaje = personaje.valor × CLAIM_COST_MULTIPLIER
const CLAIM_COST_MULTIPLIER = 50;

// ── Importaciones lazy (evitar ciclos en require) ───────────────────────────
function getGrupoDB() { return require('./database').getGrupo; }
function getIsOwner()  { return require('./owners').isOwner; }

// ── Handler principal ──────────────────────────────────────────────────────
async function manejarMensajePersonajes(sock, msg) {
    const texto = (msg.message?.conversation || msg.message?.extendedTextMessage?.text || '').trim();
    if (!texto.startsWith('#')) return;

    const jid = msg.key.remoteJid;
    const senderJid = msg.key.participant || msg.key.remoteJid;
    const pushName = msg.pushName || senderJid.split('@')[0];
    const groupId = jid.endsWith('@g.us') ? jid : 'dm';

    const parts = texto.slice(1).trim().split(/\s+/);
    let cmd = parts[0]?.toLowerCase();
    const args = parts.slice(1);

    // Detectar sufijo numérico para paginación: #harem2 → cmd='harem', pagina=2
    const PAGINABLE_PERSONAJES = new Set(['harem', 'waifus', 'claims', 'slist', 'animelist', 'serielist', 'ainfo', 'serieinfo', 'animeinfo']);
    let _paginaP = 1;
    const _pmP = cmd?.match(/^(.+?)(\d+)$/);
    if (_pmP && PAGINABLE_PERSONAJES.has(_pmP[1])) {
        cmd = _pmP[1];
        _paginaP = Math.max(1, parseInt(_pmP[2]));
    }

    // Opciones de quoted para todas las respuestas del gacha
    const Q = { quoted: msg };

    // Verificar toggle de gacha usando el módulo centralizado de permisos.
    // verificarGacha devuelve null si está permitido, o un string con el
    // mensaje de bloqueo si el gacha está desactivado en este grupo.
    if (groupId !== 'dm') {
        const gData = getGrupoDB()(jid);
        const bloqueo = verificarGacha(cmd, gData, senderJid);
        if (bloqueo) return sock.sendMessage(jid, { text: bloqueo }, Q);
    }

    const lista = getPersonajes();
    const cooldownTiempo = 5 * 60 * 1000;
    const ahora = Date.now();
    const { usuarios, u } = getUsuarioPersonajes(senderJid);

    try {
    switch (cmd) {

        // 🎲 ROLL WAIFU
        case 'rw':
        case 'roll':
        case 'rollwaifu': {
            const ultimo = u.cooldowns.rw || 0;
            if (ahora - ultimo < cooldownTiempo) {
                const restante = cooldownTiempo - (ahora - ultimo);
                return sock.sendMessage(jid, {
                    text: `⏳ Espera *${msToTime(restante)}*\n${barraCooldown(restante, cooldownTiempo)}`
                }, Q);
            }

            if (!lista.length) return sock.sendMessage(jid, { text: '❌ No hay personajes disponibles.' }, Q);

            const personaje = rollPonderado(lista);

            // Guardar cooldown ya, pero el lastRoll SOLO después de enviar la carta
            guardarUsuarioSeguro(senderJid, (uGuardado) => {
                uGuardado.cooldowns.rw = ahora;
                uGuardado.lastRoll = null;
                uGuardado.lastRollTime = null;
                uGuardado.lastRollGroupId = null;
            });

            const caption = formatCaption(personaje, groupId);

            // Helper para fijar el roll activo (usuario + grupo)
            const fijarRollActivo = () => {
                guardarUsuarioSeguro(senderJid, (uGuardado) => {
                    uGuardado.lastRoll = personaje.nombre;
                    uGuardado.lastRollTime = ahora;
                    uGuardado.lastRollGroupId = groupId;
                });
                // Registrar roll activo en el Map del grupo para validar claims por citación
                pendingGroupRolls.set(groupId, { nombre: personaje.nombre, rollerJid: senderJid, rollTime: ahora });
                // Auto-limpiar tras expiración para no acumular entradas obsoletas
                setTimeout(() => {
                    const cur = pendingGroupRolls.get(groupId);
                    if (cur && cur.rollTime === ahora) pendingGroupRolls.delete(groupId);
                }, ROLL_EXPIRACION + 10_000);
            };

            // Intentar imagen local primero
            const imgPath = path.join(__dirname, 'img', personaje.imagen || '');
            if (personaje.imagen && fs.existsSync(imgPath)) {
                fijarRollActivo();
                return sock.sendMessage(jid, { image: fs.readFileSync(imgPath), caption }, Q);
            }

            // Intentar imagen por API
            await sock.sendMessage(jid, { text: '🎴 Buscando personaje...' }, Q);
            const imgUrl = await buscarImagenPersonaje(personaje.tag);

            fijarRollActivo();

            if (imgUrl) {
                return sock.sendMessage(jid, { image: { url: imgUrl }, caption }, Q);
            }

            return sock.sendMessage(jid, { text: caption }, Q);
        }

        // 🎯 CLAIM
        case 'claim':
        case 'c':
        case 'reclamar': {
            // Releer usuario fresco para evitar race condition en claims simultáneos
            const { usuarios: usuariosC, u: uFresco } = getUsuarioPersonajes(senderJid);
            const ultimoClaim = uFresco.cooldowns.claim || 0;
            if (ahora - ultimoClaim < CLAIM_COOLDOWN) {
                const restante = CLAIM_COOLDOWN - (ahora - ultimoClaim);
                return sock.sendMessage(jid, {
                    text: `⏳ Debes esperar *${msToTime(restante)}* para reclamar otro personaje.\n${barraCooldown(restante, CLAIM_COOLDOWN)}`
                }, Q);
            }
            Object.assign(u, uFresco);
            Object.assign(usuarios, usuariosC);

            // ── Determinar personaje a reclamar ──────────────────────────────
            if (!u.lastRoll) {
                // Path de citación: SOLO aceptar si hay un roll activo en este grupo
                const nombreCitado = extraerNombreCitado(msg);
                if (!nombreCitado) {
                    return sock.sendMessage(jid, {
                        text: '🎴 No tienes ningún personaje pendiente.\nUsa *#rw* para rollear uno o cita la carta de un roll activo con *#claim*.'
                    }, Q);
                }
                // Validar que el personaje citado corresponde al roll activo del grupo
                const pendingRoll = pendingGroupRolls.get(groupId);
                if (!pendingRoll) {
                    return sock.sendMessage(jid, {
                        text: `❌ No hay ningún roll activo en este grupo.\nEspera que alguien use *#rw* para rollear.`
                    }, Q);
                }
                if (pendingRoll.nombre.toLowerCase() !== nombreCitado.toLowerCase()) {
                    return sock.sendMessage(jid, {
                        text: `❌ El roll activo en este grupo es *${pendingRoll.nombre}*, no *${nombreCitado}*.\nCita la carta correcta o espera el próximo *#rw*.`
                    }, Q);
                }
                if (ahora - pendingRoll.rollTime > ROLL_EXPIRACION) {
                    pendingGroupRolls.delete(groupId);
                    return sock.sendMessage(jid, {
                        text: `⌛ El roll de *${nombreCitado}* ya expiró. Espera el próximo *#rw*.`
                    }, Q);
                }

                // ── Protección de 10 segundos: el roller tiene prioridad ────
                // Si quien intenta reclamar NO es quien hizo el roll Y no han pasado 10s → bloquear
                if (senderJid !== pendingRoll.rollerJid && ahora - pendingRoll.rollTime < CLAIM_PRIORITY_WINDOW) {
                    const esperaMs = CLAIM_PRIORITY_WINDOW - (ahora - pendingRoll.rollTime);
                    const esperaS = Math.ceil(esperaMs / 1000);
                    return sock.sendMessage(jid, {
                        text: `⏳ Debes esperar *${esperaS} segundo(s)* antes de reclamar un personaje ajeno o solicitado por otro usuario.`
                    }, Q);
                }

                // Citación válida — asignar sesión al reclamante
                u.lastRoll = nombreCitado;
                u.lastRollTime = pendingRoll.rollTime;
                u.lastRollGroupId = groupId;
                // Limpiar lastRoll del roller si aún lo tiene (evita doble claim)
                for (const [uid, ud] of Object.entries(usuarios)) {
                    if (uid !== senderJid
                        && ud.lastRoll?.toLowerCase() === nombreCitado.toLowerCase()
                        && (ud.lastRollGroupId === groupId || !ud.lastRollGroupId)) {
                        ud.lastRoll = null;
                        ud.lastRollTime = null;
                        ud.lastRollGroupId = null;
                        usuarios[uid] = ud;
                    }
                }
                usuarios[senderJid] = u;
                guardarUsuarios(usuarios);
            }

            // ── Validación de grupo (el claim debe hacerse donde se rolleó) ──
            if (u.lastRollGroupId && u.lastRollGroupId !== groupId) {
                return sock.sendMessage(jid, {
                    text: '❌ Debes reclamar el personaje en el mismo grupo donde lo rolleaste.'
                }, Q);
            }

            // ── Validación de expiración (siempre, sin excepciones) ──────────
            if (u.lastRollTime && (ahora - u.lastRollTime) > ROLL_EXPIRACION) {
                u.lastRoll = null;
                u.lastRollTime = null;
                u.lastRollGroupId = null;
                usuarios[senderJid] = u;
                guardarUsuarios(usuarios);
                return sock.sendMessage(jid, { text: `⌛ El personaje expiró. Usa *#rw* para rollear otro.` }, Q);
            }

            // ── Buscar personaje en la lista ─────────────────────────────────
            // BUG 3 FIX: Solo coincidencia EXACTA en el claim.
            // Antes se usaba .includes() como respaldo, lo que hacía que "Chika"
            // encontrara a "Ichika" (porque "Chika" está dentro de "Ichika").
            // Ahora se exige que el nombre sea idéntico (sin distinción de mayúsculas).
            const nombre = u.lastRoll;
            const personaje = lista.find(p =>
                p.nombre.toLowerCase() === nombre.toLowerCase()
            );
            if (!personaje) {
                u.lastRoll = null; u.lastRollTime = null; u.lastRollGroupId = null;
                usuarios[senderJid] = u;
                guardarUsuarios(usuarios);
                return sock.sendMessage(jid, { text: `❌ Personaje *${nombre}* no encontrado en la lista.` }, Q);
            }

            // ── Verificar ownership ──────────────────────────────────────────
            // Pasamos el objeto completo del personaje (no solo el nombre) para
            // que la comparación use el campo 'id' si está disponible.
            const dueno = obtenerDuenoPersonajeGrupo(personaje, groupId);
            if (dueno && dueno !== senderJid) {
                u.lastRoll = null; u.lastRollTime = null; u.lastRollGroupId = null;
                usuarios[senderJid] = u;
                guardarUsuarios(usuarios);
                return sock.sendMessage(jid, {
                    text: `⚠️ *${personaje.nombre}* ya fue reclamado en este grupo por @${dueno.split('@')[0]}. Usa *#rw* para intentar con otro.`,
                    mentions: [dueno]
                }, Q);
            }
            if (estaEnHarem(getHaremGrupo(u, groupId), personaje) || estaEnHarem(u.harem || [], personaje)) {
                u.lastRoll = null; u.lastRollTime = null; u.lastRollGroupId = null;
                usuarios[senderJid] = u;
                guardarUsuarios(usuarios);
                return sock.sendMessage(jid, { text: `⚠️ Ya tienes a *${personaje.nombre}* en tu harem.` }, Q);
            }

            // ── Verificar coins ──────────────────────────────────────────────
            const costoReclamar = personaje.valor * CLAIM_COST_MULTIPLIER;
            if (u.monedas < costoReclamar) {
                return sock.sendMessage(jid, {
                    text: `💸 Necesitas *${costoReclamar.toLocaleString()} coins* y tienes *${u.monedas.toLocaleString()}*.\n💡 Gana coins con *#diario*, *#work* o *#crime*.`
                }, Q);
            }

            // Calcular balance correcto ANTES de la deducción para el mensaje
            const nuevoBalance = u.monedas - costoReclamar;

            // ── Transacción atómica ──────────────────────────────────────────
            guardarUsuarioSeguro(senderJid, (uGuardado) => {
                uGuardado.monedas -= costoReclamar;
                getHaremGrupo(uGuardado, groupId).push(normalizarPersonajeHarem(personaje));
                uGuardado.cooldowns.claim = ahora;
                uGuardado.lastRoll = null;
                uGuardado.lastRollTime = null;
                uGuardado.lastRollGroupId = null;
            });

            // Limpiar roll activo del grupo si corresponde a este personaje
            const pendingPostClaim = pendingGroupRolls.get(groupId);
            if (pendingPostClaim && pendingPostClaim.nombre.toLowerCase() === personaje.nombre.toLowerCase()) {
                pendingGroupRolls.delete(groupId);
            }

            const claimMsg = u.claimMsg
                ? u.claimMsg.replace('{nombre}', personaje.nombre)
                : `✅ Reclamaste a *${personaje.nombre}* por *${costoReclamar.toLocaleString()} coins*.\n💰 Te quedan: *${nuevoBalance.toLocaleString()} coins*`;
            return sock.sendMessage(jid, { text: claimMsg }, Q);
        }

        // 🎴 VER HAREM
        case 'harem':
        case 'waifus':
        case 'claims': {
            const { paginar, piePagina } = require('./paginator');
            const mencionados = msg.message.extendedTextMessage?.contextInfo?.mentionedJid || [];
            const objetivoJid = mencionados[0] || senderJid;
            const { u: objetivo } = getUsuarioPersonajes(objetivoJid);
            const harem = getHaremDisplay(objetivo, groupId);
            const nombreMostrar = objetivoJid === senderJid ? pushName : `@${objetivoJid.split('@')[0]}`;
            if (!harem || harem.length === 0) {
                return sock.sendMessage(jid, { text: objetivoJid === senderJid ? '💔 No tienes personajes... usa *#rw* para obtener uno 😏' : `💔 ${nombreMostrar} no tiene personajes.`, mentions: mencionados }, Q);
            }
            const grupoCount = getHaremGrupo(objetivo, groupId).length;
            const legacyCount = harem.length - grupoCount;
            const { items: pagItems, pag, totalPags, inicio } = paginar(harem, _paginaP, 20);
            let textoHarem = `🎴 *HAREM DE ${nombreMostrar.toUpperCase()}*\n\n`;
            pagItems.forEach((p, i) => {
                const nombre = typeof p === 'string' ? p : p.nombre;
                const fav = typeof p === 'object' && p.favorito ? ' ⭐' : '';
                const serie = typeof p === 'object' ? ` _(${p.serie || '?'})_` : '';
                textoHarem += `${inicio + i + 1}. *${nombre}*${fav}${serie}\n`;
            });
            textoHarem += `\n💎 Total: *${harem.length}* personajes`;
            if (legacyCount > 0) textoHarem += ` _(${grupoCount} grupo · ${legacyCount} global)_`;
            textoHarem += piePagina(pag, totalPags, 'harem');
            await sock.sendMessage(jid, { text: textoHarem, mentions: mencionados }, Q);
            break;
        }

        // 🗑️ ELIMINAR PERSONAJE
        case 'deletewaifu':
        case 'delwaifu':
        case 'delchar': {
            const nombre = args.join(' ');
            if (!nombre) return sock.sendMessage(jid, { text: '❌ Uso: #delchar [nombre]' }, Q);
            const haremDel = getHaremGrupo(u, groupId);
            let idxDel = haremDel.findIndex(h => (typeof h === 'string' ? h : h.nombre)?.toLowerCase() === nombre.toLowerCase());
            let delFromLegacy = false;
            if (idxDel === -1) {
                idxDel = (u.harem || []).findIndex(h => (typeof h === 'string' ? h : h.nombre)?.toLowerCase() === nombre.toLowerCase());
                delFromLegacy = true;
            }
            if (idxDel === -1) return sock.sendMessage(jid, { text: `❌ No tienes a *${nombre}* en tu harem.` }, Q);
            if (delFromLegacy) u.harem.splice(idxDel, 1);
            else haremDel.splice(idxDel, 1);
            usuarios[senderJid] = u;
            guardarUsuarios(usuarios);
            await sock.sendMessage(jid, { text: `✅ *${nombre}* fue eliminado de tu harem.` }, Q);
            break;
        }

        // 🎁 REGALAR PERSONAJE
        case 'givechar':
        case 'givewaifu':
        case 'regalar': {
            const mencionados = msg.message.extendedTextMessage?.contextInfo?.mentionedJid || [];
            if (!mencionados.length || !args.length) {
                return sock.sendMessage(jid, { text: '❌ Uso: #givechar @usuario [nombre]' }, Q);
            }
            const objetivoJid = mencionados[0];
            const nombre = args.filter(a => !a.startsWith('@')).join(' ');
            const haremGive = getHaremGrupo(u, groupId);
            let idxGive = haremGive.findIndex(h => (typeof h === 'string' ? h : h.nombre)?.toLowerCase() === nombre.toLowerCase());
            let giveFromLegacy = false;
            if (idxGive === -1) {
                idxGive = (u.harem || []).findIndex(h => (typeof h === 'string' ? h : h.nombre)?.toLowerCase() === nombre.toLowerCase());
                giveFromLegacy = true;
            }
            if (idxGive === -1) return sock.sendMessage(jid, { text: `❌ No tienes a *${nombre}* en tu harem.` }, Q);

            const personajeData = giveFromLegacy ? u.harem.splice(idxGive, 1)[0] : haremGive.splice(idxGive, 1)[0];
            const u2 = asegurarUsuario(usuarios, objetivoJid);
            const haremDestino = getHaremGrupo(u2, groupId);
            if (!estaEnHarem(haremDestino, obtenerNombrePersonajeValor(personajeData))) haremDestino.push(personajeData);
            usuarios[senderJid] = u;
            usuarios[objetivoJid] = u2;
            guardarUsuarios(usuarios);
            await sock.sendMessage(jid, {
                text: `🎁 *${pushName}* regaló a *${nombre}* a *@${objetivoJid.split('@')[0]}*! 💝`,
                mentions: mencionados
            }, Q);
            break;
        }

        // 🎁 REGALAR TODO EL HAREM
        case 'giveallharem': {
            const mencionados = msg.message.extendedTextMessage?.contextInfo?.mentionedJid || [];
            if (!mencionados.length) return sock.sendMessage(jid, { text: '❌ Uso: #giveallharem @usuario' }, Q);
            const haremGiveAll = getHaremGrupo(u, groupId);
            const legacyGiveAll = (u.harem || []);
            if (!haremGiveAll.length && !legacyGiveAll.length) return sock.sendMessage(jid, { text: '❌ Tu harem está vacío.' }, Q);

            const objetivoJid = mencionados[0];
            const u2 = asegurarUsuario(usuarios, objetivoJid);
            const haremDest = getHaremGrupo(u2, groupId);
            for (const p of [...haremGiveAll, ...legacyGiveAll]) {
                const nombreP = obtenerNombrePersonajeValor(p);
                if (!estaEnHarem(haremDest, nombreP)) haremDest.push(p);
            }
            const total = haremGiveAll.length + legacyGiveAll.length;
            u.haremGrupo[groupId] = [];
            u.harem = [];
            usuarios[senderJid] = u;
            usuarios[objetivoJid] = u2;
            guardarUsuarios(usuarios);
            await sock.sendMessage(jid, {
                text: `🎁 *${pushName}* regaló todos sus personajes (${total}) a *@${objetivoJid.split('@')[0]}*! 💝`,
                mentions: mencionados
            }, Q);
            break;
        }

        // 💰 PONER A LA VENTA
        case 'sell':
        case 'vender': {
            const precio = parseInt(args[0]);
            const nombre = args.slice(1).join(' ');
            if (isNaN(precio) || precio <= 0 || !nombre) {
                return sock.sendMessage(jid, { text: '❌ Uso: #sell [precio] [nombre]\nEjemplo: #sell 500 Rem' }, Q);
            }
            const haremSell = getHaremGrupo(u, groupId);
            let idxSell = haremSell.findIndex(h => (typeof h === 'string' ? h : h.nombre)?.toLowerCase() === nombre.toLowerCase());
            let sellFromLegacy = false;
            if (idxSell === -1) {
                idxSell = (u.harem || []).findIndex(h => (typeof h === 'string' ? h : h.nombre)?.toLowerCase() === nombre.toLowerCase());
                sellFromLegacy = true;
            }
            if (idxSell === -1) return sock.sendMessage(jid, { text: `❌ No tienes a *${nombre}* en tu harem.` }, Q);
            const personajeData = sellFromLegacy ? u.harem.splice(idxSell, 1)[0] : haremSell.splice(idxSell, 1)[0];
            getVentasGrupo(u, groupId).push({ personaje: personajeData, precio, vendedor: senderJid });
            usuarios[senderJid] = u;
            guardarUsuarios(usuarios);
            const pNombre = typeof personajeData === 'string' ? personajeData : personajeData.nombre;
            await sock.sendMessage(jid, { text: `🏪 *${pNombre}* fue puesto a la venta por *${precio} coins*!\n\nUsa *#haremshop* para ver la tienda y *#buyshop [n]* para comprarlo.` }, Q);
            break;
        }

        // ❌ RETIRAR DE VENTA
        case 'removesale':
        case 'removerventa': {
            const nombre = args.join(' ');
            if (!nombre) return sock.sendMessage(jid, { text: '❌ Uso: #removesale [nombre]' }, Q);
            const ventasRemove = getVentasGrupo(u, groupId);
            if (!ventasRemove.length) return sock.sendMessage(jid, { text: '❌ No tienes personajes en venta en este grupo.' }, Q);
            const idx = ventasRemove.findIndex(v => (typeof v.personaje === 'string' ? v.personaje : v.personaje?.nombre)?.toLowerCase() === nombre.toLowerCase());
            if (idx === -1) return sock.sendMessage(jid, { text: `❌ No tienes *${nombre}* en venta.` }, Q);
            const venta = ventasRemove.splice(idx, 1)[0];
            const haremRv = getHaremGrupo(u, groupId);
            if (!estaEnHarem(haremRv, obtenerNombrePersonajeValor(venta.personaje))) haremRv.push(venta.personaje);
            usuarios[senderJid] = u;
            guardarUsuarios(usuarios);
            await sock.sendMessage(jid, { text: `✅ *${nombre}* fue retirado de la venta y devuelto a tu harem.` }, Q);
            break;
        }

        // 🏪 TIENDA DE PERSONAJES
        case 'haremshop':
        case 'tiendawaifus':
        case 'wshop': {
            const todos = cargarUsuarios();
            const ventas = [];
            for (const [uid, ud] of Object.entries(todos)) {
                const vg = ud.ventasGrupo?.[groupId] || [];
                for (const v of vg) {
                    ventas.push({ ...v, vendedorId: uid });
                }
            }
            if (!ventas.length) return sock.sendMessage(jid, { text: '🏪 La tienda de personajes de este grupo está vacía.\n\nUsa *#sell [precio] [nombre]* para vender tus personajes.' }, Q);

            const POR_PAGINA = 10;
            const pagina = Math.max(1, parseInt(args[0]) || 1);
            const totalPaginas = Math.ceil(ventas.length / POR_PAGINA);
            const paginaReal = Math.min(pagina, totalPaginas);
            const inicio = (paginaReal - 1) * POR_PAGINA;
            const ventasPagina = ventas.slice(inicio, inicio + POR_PAGINA);

            let texto = `╔══════════════════╗\n║  🏪 TIENDA WAIFUS  ║\n╚══════════════════╝\n\n`;
            ventasPagina.forEach((v, i) => {
                const nombre = typeof v.personaje === 'string' ? v.personaje : v.personaje?.nombre || '?';
                const serie = typeof v.personaje === 'object' ? v.personaje.serie || '?' : '?';
                const vendedorId = v.vendedor || v.vendedorId;
                const vendedorData = vendedorId ? todos[vendedorId] : null;
                const vendedorNombre = vendedorData?.pushName || vendedorData?.nombre || (vendedorId ? vendedorId.split('@')[0] : '?');
                texto += `${inicio + i + 1}. *${nombre}* _(${serie})_\n   💰 *${v.precio} coins* — ${vendedorNombre}\n\n`;
            });
            texto += `📄 Página *${paginaReal}/${totalPaginas}* · Total: *${ventas.length}* personajes\n`;
            if (totalPaginas > 1) texto += `_Usa *#haremshop [página]* para navegar_\n`;
            texto += `\n👉 Usa *#buyshop [número]* para comprar directamente`;
            await sock.sendMessage(jid, { text: texto }, Q);
            break;
        }

        // 🔄 INTERCAMBIAR
        case 'trade':
        case 'intercambiar': {
            const mencionados = msg.message.extendedTextMessage?.contextInfo?.mentionedJid || [];
            const partes = args.join(' ').split('/').map(s => s.trim());
            if (!mencionados.length || partes.length < 2 || !partes[0] || !partes[1]) {
                return sock.sendMessage(jid, { text: '❌ Uso: #trade @usuario [tu personaje] / [personaje que quieres]\nEjemplo: #trade @amigo Rem / Nezuko' }, Q);
            }
            const miPersonaje = partes[0];
            const suPersonaje = partes[1];
            const objetivoJid = mencionados[0];

            // Función de búsqueda flexible: primero por nombre exacto, luego por inicio, luego parcial
            const buscarEnHarem = (harem, nombre) => {
                const q = nombre.toLowerCase().trim();
                // 1. Coincidencia exacta
                let idx = harem.findIndex(h => (typeof h === 'string' ? h : h.nombre)?.toLowerCase() === q);
                if (idx !== -1) return idx;
                // 2. Empieza por ese nombre
                idx = harem.findIndex(h => (typeof h === 'string' ? h : h.nombre)?.toLowerCase().startsWith(q));
                if (idx !== -1) return idx;
                // 3. Contiene ese nombre (solo si el query tiene 3+ caracteres para evitar falsos positivos)
                if (q.length >= 3) {
                    idx = harem.findIndex(h => (typeof h === 'string' ? h : h.nombre)?.toLowerCase().includes(q));
                }
                return idx;
            };

            const miHarem = getHaremGrupo(u, groupId);
            let miIdx = buscarEnHarem(miHarem, miPersonaje);
            let miFromLegacy = false;
            if (miIdx === -1) {
                miIdx = buscarEnHarem(u.harem || [], miPersonaje);
                miFromLegacy = true;
            }
            if (miIdx === -1) return sock.sendMessage(jid, { text: `❌ No tienes a *${miPersonaje}* en tu harem.\n_Tip: usa parte del nombre, por ejemplo "Rem" en lugar de "Rem (Re:Zero)"_` }, Q);

            const u2 = asegurarUsuario(usuarios, objetivoJid);
            const suHarem = getHaremGrupo(u2, groupId);
            let suIdx = buscarEnHarem(suHarem, suPersonaje);
            let suFromLegacy = false;
            if (suIdx === -1) {
                suIdx = buscarEnHarem(u2.harem || [], suPersonaje);
                suFromLegacy = true;
            }
            if (suIdx === -1) return sock.sendMessage(jid, { text: `❌ *@${objetivoJid.split('@')[0]}* no tiene a *${suPersonaje}*.\n_Tip: usa parte del nombre para buscar_`, mentions: mencionados }, Q);

            // Verificar que ninguno ya posee el personaje que va a recibir
            if (estaEnHarem(getHaremGrupo(u, groupId), suPersonaje) || estaEnHarem(u.harem || [], suPersonaje)) {
                return sock.sendMessage(jid, { text: `⚠️ Ya tienes a *${suPersonaje}* en tu harem. No puedes recibirlo dos veces.` }, Q);
            }
            if (estaEnHarem(getHaremGrupo(u2, groupId), miPersonaje) || estaEnHarem(u2.harem || [], miPersonaje)) {
                return sock.sendMessage(jid, {
                    text: `⚠️ *@${objetivoJid.split('@')[0]}* ya tiene a *${miPersonaje}* en su harem. No puede recibirlo dos veces.`,
                    mentions: mencionados
                }, Q);
            }

            const miData = miFromLegacy ? u.harem.splice(miIdx, 1)[0] : miHarem.splice(miIdx, 1)[0];
            const suData = suFromLegacy ? u2.harem.splice(suIdx, 1)[0] : suHarem.splice(suIdx, 1)[0];
            getHaremGrupo(u, groupId).push(suData);
            getHaremGrupo(u2, groupId).push(miData);
            usuarios[senderJid] = u;
            usuarios[objetivoJid] = u2;
            guardarUsuarios(usuarios);
            await sock.sendMessage(jid, {
                text: `🔄 ¡Intercambio completado!\n*${pushName}* dio *${miPersonaje}* y recibió *${suPersonaje}* de @${objetivoJid.split('@')[0]} 🎉`,
                mentions: mencionados
            }, Q);
            break;
        }

        // 📊 GACHA INFO
        case 'gachainfo':
        case 'ginfo':
        case 'infogacha': {
            const todosGacha = cargarUsuarios();
            const enVenta = Object.values(todosGacha).reduce((acc, ud) => acc + (ud.ventasGrupo?.[groupId]?.length || 0), 0);
            const miHaremInfo = getHaremDisplay(u, groupId);
            const grupoInfoCount = getHaremGrupo(u, groupId).length;
            const legacyInfoCount = miHaremInfo.length - grupoInfoCount;
            const totalStr = legacyInfoCount > 0
                ? `*${miHaremInfo.length}* (${grupoInfoCount} grupo · ${legacyInfoCount} global)`
                : `*${miHaremInfo.length}*`;
            await sock.sendMessage(jid, {
                text: `╔══════════════════╗\n║   🎴 GACHA INFO    ║\n╚══════════════════╝\n\n🎴 Personajes en el bot: *${lista.length}*\n💰 Tus monedas: *${u.monedas}*\n🃏 Tu harem: ${totalStr} personajes\n🏪 En tienda (grupo): *${enVenta}*\n⏳ Roll cooldown: ${ahora - (u.cooldowns.rw || 0) < cooldownTiempo ? msToTime(cooldownTiempo - (ahora - (u.cooldowns.rw || 0))) : '¡Listo!'}`
            }, Q);
            break;
        }

        // 🖼️ VER IMAGEN DE PERSONAJE
        case 'charimage':
        case 'waifuimage':
        case 'cimage':
        case 'wimage': {
            const nombre = args.join(' ');
            if (!nombre) return sock.sendMessage(jid, { text: '❌ Uso: #charimage [nombre]' }, Q);
            // BUG 3 FIX: intentar coincidencia exacta primero para evitar confusiones
            // (ej: buscar "Ino" no debería devolver "Hinata" ni "Rem")
            const personaje = lista.find(p => p.nombre.toLowerCase() === nombre.toLowerCase())
                           || lista.find(p => p.nombre.toLowerCase().includes(nombre.toLowerCase()));
            if (!personaje) return sock.sendMessage(jid, { text: `❌ Personaje *${nombre}* no encontrado` }, Q);

            const imgPath = path.join(__dirname, 'img', personaje.imagen || '');
            if (personaje.imagen && fs.existsSync(imgPath)) {
                return sock.sendMessage(jid, { image: fs.readFileSync(imgPath), caption: `🖼️ *${personaje.nombre}* — ${personaje.serie}` }, Q);
            }

            await sock.sendMessage(jid, { text: `🔍 Buscando imagen de *${personaje.nombre}*...` }, Q);
            const imgUrl = await buscarImagenPersonaje(personaje.tag);
            if (imgUrl) return sock.sendMessage(jid, { image: { url: imgUrl }, caption: `🖼️ *${personaje.nombre}* — ${personaje.serie}` }, Q);
            await sock.sendMessage(jid, { text: `❌ No encontré imagen para *${personaje.nombre}*` }, Q);
            break;
        }

        // ℹ️ INFO DE PERSONAJE
        case 'charinfo':
        case 'winfo':
        case 'waifuinfo': {
            const nombre = args.join(' ');
            if (!nombre) return sock.sendMessage(jid, { text: '❌ Uso: #charinfo [nombre]' }, Q);
            // BUG 3 FIX: coincidencia exacta primero, luego parcial como fallback de búsqueda
            const personaje = lista.find(p => p.nombre.toLowerCase() === nombre.toLowerCase())
                           || lista.find(p => p.nombre.toLowerCase().includes(nombre.toLowerCase()));
            if (!personaje) return sock.sendMessage(jid, { text: `❌ Personaje *${nombre}* no encontrado` }, Q);
            const duenoJid = obtenerDuenoPersonajeGrupo(personaje, groupId);
            let duenoTxt = 'Nadie';
            if (duenoJid) {
                const todosCI = cargarUsuarios();
                const ud = todosCI[duenoJid];
                const nombreDueno = ud?.pushName || ud?.nombre || duenoJid.split('@')[0];
                duenoTxt = `@${duenoJid.split('@')[0]} (${nombreDueno})`;
            }
            const generoIcon = personaje.genero?.toLowerCase() === 'femenino' ? '♀' : '♂';
            const { nombre: rarNombreC, emoji: rarEmojiC } = getRareza(personaje.valor);
            const captionInfo = `╔══════════════════╗\n║  📋 CHAR INFO      ║\n╚══════════════════╝\n\n🌸 Nombre: *${personaje.nombre}*\n${generoIcon} Género: *${personaje.genero}*\n${rarEmojiC} Rareza: *${rarNombreC}*\n❖ Serie: *${personaje.serie}*\n☆ Valor: *${personaje.valor} coins*\n♡ Estado: *${duenoJid ? 'Reclamado' : 'Libre'}*\n👤 Dueño (grupo): ${duenoTxt}`;
            const mentions = duenoJid ? [duenoJid] : [];

            // Intentar imagen local primero
            const imgPath = path.join(__dirname, 'img', personaje.imagen || '');
            if (personaje.imagen && fs.existsSync(imgPath)) {
                return sock.sendMessage(jid, { image: fs.readFileSync(imgPath), caption: captionInfo, mentions }, Q);
            }
            // Buscar imagen via API
            const imgUrl = await buscarImagenPersonaje(personaje.tag);
            if (imgUrl) {
                return sock.sendMessage(jid, { image: { url: imgUrl }, caption: captionInfo, mentions }, Q);
            }
            await sock.sendMessage(jid, { text: captionInfo, mentions }, Q);
            break;
        }

        // 🏆 TOP PERSONAJES POR VALOR
        case 'waifusboard':
        case 'waifustop':
        case 'topwaifus':
        case 'wtop': {
            const top = [...lista].sort((a, b) => (b.valor || 0) - (a.valor || 0)).slice(0, 15);
            let texto = '╔══════════════════╗\n║  🏆 TOP PERSONAJES ║\n╚══════════════════╝\n\n';
            top.forEach((p, i) => {
                const genIco = p.genero?.toLowerCase() === 'femenino' ? '♀' : '♂';
                const { emoji: rEmoji } = getRareza(p.valor);
                texto += `${i + 1}. ${rEmoji} *${p.nombre}* ${genIco} _(${p.serie})_ — ☆ ${p.valor} | 💸 ${(p.valor * CLAIM_COST_MULTIPLIER).toLocaleString()} coins\n`;
            });
            await sock.sendMessage(jid, { text: texto }, Q);
            break;
        }

        // 🏪 COMPRAR DESDE HAREMSHOP POR NÚMERO
        case 'buyshop':
        case 'comprarshop':
        case 'bshop':
        case 'buychar':
        case 'buyc': {
            const num = parseInt(args[0]);
            if (!args[0] || isNaN(num) || num < 1) {
                return sock.sendMessage(jid, {
                    text: '❌ Uso: *#buyshop [número]*\n\nEjemplo: `#buyshop 3` para comprar el personaje #3 del *#haremshop*.'
                }, Q);
            }
            const todosShop = cargarUsuarios();
            const ventasShop = [];
            for (const [uid, ud] of Object.entries(todosShop)) {
                const vg = ud.ventasGrupo?.[groupId] || [];
                for (const v of vg) {
                    ventasShop.push({ ...v, vendedorId: uid });
                }
            }
            if (!ventasShop.length) {
                return sock.sendMessage(jid, { text: '🏪 La tienda de personajes de este grupo está vacía actualmente.' }, Q);
            }
            if (num > ventasShop.length) {
                return sock.sendMessage(jid, {
                    text: `❌ Solo hay *${ventasShop.length}* personaje(s) en la tienda. Usa *#haremshop* para ver la lista.`
                }, Q);
            }
            const entrada = ventasShop[num - 1];
            const nombreCompra = typeof entrada.personaje === 'string' ? entrada.personaje : entrada.personaje?.nombre;
            const vendedorId = entrada.vendedorId;

            if (vendedorId === senderJid) {
                return sock.sendMessage(jid, { text: '❌ No puedes comprarte tu propio personaje.' }, Q);
            }
            // Pasar el objeto de la lista si existe para comparación por ID
            const personajeCompraObj = lista.find(p => p.nombre.toLowerCase() === (nombreCompra || '').toLowerCase()) || nombreCompra;
            if (estaEnHarem(getHaremGrupo(u, groupId), personajeCompraObj) || estaEnHarem(u.harem || [], personajeCompraObj)) {
                return sock.sendMessage(jid, { text: `⚠️ Ya tienes a *${nombreCompra}* en tu harem.` }, Q);
            }
            if (u.monedas < entrada.precio) {
                return sock.sendMessage(jid, {
                    text: `💸 Necesitas *${entrada.precio.toLocaleString()} coins* para comprar a *${nombreCompra}*.\n\nTienes: *${u.monedas.toLocaleString()} coins*\n💡 Gana coins con *#diario*, *#work* o *#crime*.`
                }, Q);
            }

            // Transacción: descontar al comprador, acreditar al vendedor, remover de ventas
            const usuariosT = cargarUsuarios();
            const comprador = asegurarUsuario(usuariosT, senderJid);
            const vendedor  = asegurarUsuario(usuariosT, vendedorId);

            // Verificar que el personaje sigue en venta (race condition)
            const ventasVendedor = getVentasGrupo(vendedor, groupId);
            const idxVenta = ventasVendedor.findIndex(v => {
                const n = typeof v.personaje === 'string' ? v.personaje : v.personaje?.nombre;
                return n?.toLowerCase() === nombreCompra?.toLowerCase();
            });
            if (idxVenta === -1) {
                return sock.sendMessage(jid, { text: `⚠️ *${nombreCompra}* ya fue comprado por alguien más.` }, Q);
            }

            const ventaReal = ventasVendedor.splice(idxVenta, 1)[0];
            comprador.monedas -= entrada.precio;
            vendedor.monedas  = (vendedor.monedas || 0) + entrada.precio;
            const haremComprador = getHaremGrupo(comprador, groupId);
            haremComprador.push(normalizarPersonajeHarem(typeof ventaReal.personaje === 'string'
                ? lista.find(p => p.nombre.toLowerCase() === ventaReal.personaje.toLowerCase()) || { nombre: ventaReal.personaje, valor: 0, serie: '?' }
                : ventaReal.personaje));

            usuariosT[senderJid]  = comprador;
            usuariosT[vendedorId] = vendedor;
            guardarUsuarios(usuariosT);

            const personajeDataB = lista.find(p => p.nombre.toLowerCase() === nombreCompra?.toLowerCase());
            const rareza = personajeDataB ? getRareza(personajeDataB.valor) : { emoji: '🃏', nombre: 'Desconocida' };
            const vendedorNombre = vendedor.pushName || vendedor.nombre || vendedorId.split('@')[0];

            return sock.sendMessage(jid, {
                text: `🏪 ¡Compra exitosa!\n\n${rareza.emoji} *${nombreCompra}*\n❖ ${personajeDataB?.serie || '?'}\n\n💸 Pagaste: *${entrada.precio.toLocaleString()} coins* a ${vendedorNombre}\n💰 Te quedan: *${comprador.monedas.toLocaleString()} coins*`
            }, Q);
        }

        // ❤️ TOP FAVORITOS
        case 'favoritetop':
        case 'favtop': {
            const nombreFav = args.join(' ').trim();
            if (nombreFav) {
                // BUG 3 FIX: coincidencia exacta primero, luego parcial como fallback
                const personaje = lista.find(p => p.nombre.toLowerCase() === nombreFav.toLowerCase())
                               || lista.find(p => p.nombre.toLowerCase().includes(nombreFav.toLowerCase()));
                if (!personaje) return sock.sendMessage(jid, { text: `❌ Personaje *${nombreFav}* no encontrado.` }, Q);
                u.favorito = personaje.nombre;
                usuarios[senderJid] = u;
                guardarUsuarios(usuarios);
                return sock.sendMessage(jid, { text: `❤️ Tu personaje favorito ahora es *${personaje.nombre}*.` }, Q);
            }
            const todos = cargarUsuarios();
            const conteo = {};
            for (const ud of Object.values(todos)) {
                if (ud.favorito) conteo[ud.favorito] = (conteo[ud.favorito] || 0) + 1;
            }
            const top = Object.entries(conteo).sort((a, b) => b[1] - a[1]).slice(0, 10);
            if (!top.length) return sock.sendMessage(jid, { text: '❌ Nadie ha establecido un favorito aún.' }, Q);
            let texto = '╔══════════════════╗\n║  ❤️ TOP FAVORITOS  ║\n╚══════════════════╝\n\n';
            top.forEach(([nombre, votos], i) => {
                texto += `${i + 1}. *${nombre}* — ❤️ ${votos} votos\n`;
            });
            await sock.sendMessage(jid, { text: texto }, Q);
            break;
        }

        // 📺 INFO DE SERIE
        case 'serieinfo':
        case 'ainfo':
        case 'animeinfo': {
            const { paginar } = require('./paginator');
            const nombre = args.join(' ');
            if (!nombre) return sock.sendMessage(jid, { text: '❌ Uso: #ainfo [nombre de la serie]' }, Q);
            const personajesSerie = lista.filter(p => p.serie.toLowerCase().includes(nombre.toLowerCase()));
            if (!personajesSerie.length) return sock.sendMessage(jid, { text: `❌ No se encontraron personajes de *${nombre}*` }, Q);
            const serie = personajesSerie[0].serie;
            const POR_PAG = 25;
            const { items: pagPersonajes, pag, totalPags, inicio } = paginar(personajesSerie, _paginaP, POR_PAG);
            let texto = `╔══════════════════╗\n║  📺 SERIE INFO     ║\n╚══════════════════╝\n\n📺 *${serie}*\n👥 Personajes: *${personajesSerie.length}*\n\n`;
            pagPersonajes.forEach(p => {
                const genIco = p.genero?.toLowerCase() === 'femenino' ? '♀' : '♂';
                texto += `${genIco} *${p.nombre}* — ☆ ${p.valor}\n`;
            });
            if (totalPags > 1) {
                texto += `\n📄 Página *${pag}/${totalPags}*`;
                if (pag > 1)         texto += `  ← *#${cmd}${pag - 1} ${nombre}*`;
                if (pag < totalPags) texto += `  *#${cmd}${pag + 1} ${nombre}* →`;
            }
            await sock.sendMessage(jid, { text: texto }, Q);
            break;
        }

        // 📋 LISTA DE SERIES
        case 'serielist':
        case 'slist':
        case 'animelist': {
            const { paginar, piePagina } = require('./paginator');
            const series = [...new Set(lista.map(p => p.serie))].sort();
            const { items: seriesPag, pag, totalPags, inicio } = paginar(series, _paginaP, 30);
            let texto = `╔══════════════════╗\n║  📋 LISTA SERIES   ║\n╚══════════════════╝\n\n`;
            seriesPag.forEach((s, idx) => {
                const count = lista.filter(p => p.serie === s).length;
                texto += `${inicio + idx + 1}. *${s}* (${count})\n`;
            });
            texto += `\n📊 Total: *${lista.length}* personajes en *${series.length}* series`;
            texto += piePagina(pag, totalPags, 'slist');
            await sock.sendMessage(jid, { text: texto }, Q);
            break;
        }

        // 🗳️ VOTAR POR PERSONAJE
        case 'vote':
        case 'votar': {
            const nombre = args.join(' ');
            if (!nombre) return sock.sendMessage(jid, { text: '❌ Uso: #vote [nombre]' }, Q);
            const data = JSON.parse(fs.readFileSync(personajesPath));
            // BUG 3 FIX: coincidencia exacta primero, luego parcial como fallback
            const personaje = data.personajes.find(p => p.nombre.toLowerCase() === nombre.toLowerCase())
                           || data.personajes.find(p => p.nombre.toLowerCase().includes(nombre.toLowerCase()));
            if (!personaje) return sock.sendMessage(jid, { text: `❌ Personaje *${nombre}* no encontrado` }, Q);
            if (!u.votosPersonaje) u.votosPersonaje = {};
            const ultimoVoto = u.votosPersonaje[personaje.nombre] || 0;
            if (ahora - ultimoVoto < 24 * 60 * 60 * 1000) {
                return sock.sendMessage(jid, { text: `⏳ Ya votaste por *${personaje.nombre}* hoy. Vuelve mañana.` }, Q);
            }
            personaje.valor = (personaje.valor || 0) + 10;
            u.votosPersonaje[personaje.nombre] = ahora;
            usuarios[senderJid] = u;
            guardarUsuarios(usuarios);
            guardarJSON(personajesPath, data);
            invalidarCache();
            await sock.sendMessage(jid, { text: `🗳️ ¡Votaste por *${personaje.nombre}*! Su valor aumentó a *${personaje.valor} coins*` }, Q);
            break;
        }

        // 💬 SETEAR MENSAJE DE CLAIM
        case 'setclaimmsg':
        case 'setclaim': {
            const mensaje = args.join(' ');
            if (!mensaje) return sock.sendMessage(jid, { text: '❌ Uso: #setclaim [mensaje]\nUsa {nombre} para el nombre del personaje' }, Q);
            u.claimMsg = mensaje;
            usuarios[senderJid] = u;
            guardarUsuarios(usuarios);
            await sock.sendMessage(jid, { text: `✅ Mensaje de claim establecido:\n_${mensaje}_` }, Q);
            break;
        }

        // 🔄 RESETEAR MENSAJE DE CLAIM
        case 'delclaimmsg': {
            u.claimMsg = null;
            usuarios[senderJid] = u;
            guardarUsuarios(usuarios);
            await sock.sendMessage(jid, { text: '✅ Mensaje de claim restablecido al predeterminado.' }, Q);
            break;
        }

        // 🎬 VIDEO DE PERSONAJE
        case 'charvideo':
        case 'waifuvideo':
        case 'cvideo':
        case 'wvideo': {
            const nombre = args.join(' ');
            if (!nombre) return sock.sendMessage(jid, { text: '❌ Uso: #charvideo [nombre]' }, Q);
            // BUG 3 FIX: coincidencia exacta primero, luego parcial como fallback
            const personaje = lista.find(p => p.nombre.toLowerCase() === nombre.toLowerCase())
                           || lista.find(p => p.nombre.toLowerCase().includes(nombre.toLowerCase()));
            if (!personaje) return sock.sendMessage(jid, { text: `❌ Personaje *${nombre}* no encontrado` }, Q);

            await sock.sendMessage(jid, { text: `🎬 Buscando video/gif de *${personaje.nombre}*...` }, Q);
            const mediaUrl = await buscarVideoPersonaje(personaje.tag);
            if (!mediaUrl) {
                return sock.sendMessage(jid, {
                    text: `❌ No encontré video/gif para *${personaje.nombre}* (${personaje.serie}).`
                }, Q);
            }
            const captionVideo = `🎬 *${personaje.nombre}*\n❖ Serie: ${personaje.serie}`;
            const esVideoNativo = /\.(mp4|webm)$/i.test(mediaUrl);
            if (esVideoNativo) {
                // Videos MP4/WebM: enviar como video con reproducción de gif
                await sock.sendMessage(jid, { video: { url: mediaUrl }, caption: captionVideo, gifPlayback: true }, Q);
            } else {
                // GIFs: WhatsApp requiere tipo image con gifPlayback:true para reproducirlos correctamente
                // Enviar como video causa que lleguen borrosos o sin reproducción automática
                await sock.sendMessage(jid, { image: { url: mediaUrl }, caption: captionVideo, gifPlayback: true }, Q)
                    .catch(async () => {
                        // Si gifPlayback falla, enviar como imagen estática
                        await sock.sendMessage(jid, { image: { url: mediaUrl }, caption: captionVideo }, Q);
                    });
            }
            break;
        }
        // 🔧 FIXDUPE — Solo owners. Muestra personajes con nombre duplicado
        // con el nombre sugerido corregido, en páginas, directo en WhatsApp.
        case 'fixdupe': {
            if (!getIsOwner()(senderJid)) {
                return sock.sendMessage(jid, { text: '⛔ Este comando es solo para owners.' }, Q);
            }

            // Detectar duplicados en tiempo real sobre la lista actual
            const nombresSeen = new Map(); // nombre_lower → primer índice
            const duplicados  = [];        // { personaje, sugerencia, indice }

            lista.forEach((p, i) => {
                const key = p.nombre.toLowerCase().trim();
                if (nombresSeen.has(key)) {
                    // Es duplicado — sugerir nombre corregido con la serie
                    const serie = (p.serie || '?').replace(/[()]/g, '').trim();
                    const nombreLimpio = p.nombre.trim();
                    const sugerencia = `${nombreLimpio} (${serie})`;
                    duplicados.push({ personaje: p, sugerencia, indice: i });
                } else {
                    nombresSeen.set(key, i);
                }
            });

            if (!duplicados.length) {
                return sock.sendMessage(jid, {
                    text: '✅ ¡No hay personajes con nombre duplicado! Todo está en orden.'
                }, Q);
            }

            // Paginar resultados (10 por página)
            const { paginar, piePagina } = require('./paginator');
            const POR_PAG = 10;
            const { items: pag, paginaActual, totalPags } = paginar(duplicados, _paginaP, POR_PAG);

            let texto = `╔══════════════════════╗\n║  🔧 NOMBRES DUPLICADOS  ║\n╚══════════════════════╝\n`;
            texto += `_Total: ${duplicados.length} personajes con nombre duplicado_\n`;
            texto += `_Edita personajes.json y cambia el nombre por la sugerencia._\n\n`;

            pag.forEach(({ personaje: p, sugerencia, indice }, i) => {
                const num = (paginaActual - 1) * POR_PAG + i + 1;
                texto += `*${num}.* Índice *${indice}* — *${p.nombre}*\n`;
                texto += `   Serie: _${p.serie}_\n`;
                texto += `   ID: \`${p.id || 'sin_id'}\`\n`;
                texto += `   📝 Sugerencia: *${sugerencia}*\n\n`;
            });

            if (totalPags > 1) {
                texto += piePagina(paginaActual, totalPags, 'fixdupe');
            }

            await sock.sendMessage(jid, { text: texto }, Q);
            break;
        }

    }
    } catch (e) {
        console.error(`[PERSONAJES] Error en cmd "${cmd}":`, e.message, e.stack?.split('\n')[1] || '');
        try {
            await sock.sendMessage(jid, { text: '⚠️ Ocurrió un error procesando el comando. Intenta de nuevo.' }, Q);
        } catch {}
    }
}

module.exports = { manejarMensajePersonajes, migracionDuplicados, validarIntegridadPersonajes };
