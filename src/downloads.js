const axios = require('axios');
const fs = require('fs-extra');
const path = require('path');
const os = require('os');
const { execFile } = require('child_process');
const { promisify } = require('util');
const followRedirects = require('follow-redirects');

const execFileAsync = promisify(execFile);
const YTDLP = path.join(__dirname, '..', 'yt-dlp');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36';
const HUMAN_HEADERS = {
    'User-Agent': UA,
    'Accept': '*/*',
    'Accept-Language': 'en-US,en;q=0.9',
    'Referer': 'https://www.google.com/'
};
const axiosOpts = { timeout: 25000, headers: HUMAN_HEADERS };
axios.defaults.headers.common = { ...axios.defaults.headers.common, ...HUMAN_HEADERS };

function logRequestError(contexto, err) {
    const txt = String(err?.message || err?.response?.data || '').toLowerCase();
    if (err?.response?.status === 429 || txt.includes('rate-overlimit') || txt.includes('too many requests') || txt.includes('overlimit')) return;
    console.error('ERROR:', contexto, err.response?.data || err.message);
}

// ── Retry para APIs externas inestables (punto 4) ────────────────────────
async function conReintentos(fn, intentos = 2, delayMs = 1000) {
    let ultimoErr;
    for (let i = 0; i < intentos; i++) {
        try { return await fn(); } catch (e) {
            ultimoErr = e;
            const txt = String(e?.message || '').toLowerCase();
            if (txt.includes('rate-overlimit') || txt.includes('429') || txt.includes('too many requests')) throw e;
            if (i < intentos - 1) await new Promise(r => setTimeout(r, delayMs * (i + 1)));
        }
    }
    throw ultimoErr;
}

// ── Mensajes de error amigables para descargas (punto 10) ────────────────
function mensajeErrorDescarga(err, plataforma = '') {
    const txt = String(err?.stderr || err?.message || err?.response?.data || '').toLowerCase();
    if (txt.includes('sign in') || txt.includes('age') || txt.includes('login')) {
        return `⚠️ ${plataforma} requiere inicio de sesión para ese contenido. Configura las cookies del bot.`;
    }
    if (txt.includes('private') || txt.includes('privad')) {
        return `⚠️ Ese contenido es privado y no se puede descargar.`;
    }
    if (txt.includes('not available') || txt.includes('unavailable') || txt.includes('no disponible')) {
        return `⚠️ ${plataforma ? plataforma + ': ' : ''}Ese contenido no está disponible en esta región o fue eliminado.`;
    }
    if (txt.includes('timeout') || txt.includes('econnreset') || txt.includes('econnrefused') || txt.includes('enotfound')) {
        return `⚠️ No se pudo conectar al servicio. Intenta de nuevo en unos segundos.`;
    }
    if (txt.includes('too long') || txt.includes('demasiado largo') || txt.includes('duration')) {
        return `⚠️ El video es demasiado largo (máx 20 min).`;
    }
    const ytdlpMsg = extraerErrorYtdlp(err);
    if (ytdlpMsg && ytdlpMsg !== 'No se pudo descargar el video.') return `❌ ${ytdlpMsg}`;
    return `❌ No se pudo descargar el contenido de ${plataforma || 'esa plataforma'}. Intenta más tarde.`;
}

async function descargarBuffer(url, headers = {}) {
    const res = await axios.get(url, {
        headers: { ...axiosOpts.headers, ...headers },
        responseType: 'arraybuffer',
        timeout: 60000,
        maxRedirects: 10
    });
    return Buffer.from(res.data);
}

async function ytdlpEjecutar(args, timeout = 60000) {
    return execFileAsync(YTDLP, args, { timeout, maxBuffer: 200 * 1024 * 1024 });
}

function ytdlpHeadersArgs(referer = 'https://www.google.com/') {
    return [
        '--add-header', `User-Agent:${UA}`,
        '--add-header', 'Accept-Language:en-US,en;q=0.9',
        '--no-cache-dir'
    ];
}

const YT_COOKIES_PATH        = path.join(__dirname, '..', 'cookies.txt');
const TIKTOK_COOKIES_PATH    = path.join(__dirname, '..', 'cookies', 'tiktok.txt');
const FB_COOKIES_PATH        = path.join(__dirname, '..', 'cookies', 'facebook.txt');
const PINTEREST_COOKIES_PATH = path.join(__dirname, '..', 'cookies', 'pinterest.txt');
const SPOTIFY_COOKIES_PATH   = path.join(__dirname, '..', 'cookies', 'spotify.txt');
const MEDIAFIRE_COOKIES_PATH = path.join(__dirname, '..', 'cookies', 'mediafire.txt');

function tieneCookiesValidas(cookiePath) {
    try {
        if (!fs.existsSync(cookiePath)) return false;
        const contenido = fs.readFileSync(cookiePath, 'utf8');
        return contenido.split('\n').some(l => l.trim() && !l.startsWith('#'));
    } catch { return false; }
}

// Convierte un archivo de cookies Netscape a string "Cookie:" para usar en headers HTTP
function parsearCookiesHeader(cookiePath) {
    try {
        if (!tieneCookiesValidas(cookiePath)) return null;
        const contenido = fs.readFileSync(cookiePath, 'utf8');
        const pares = [];
        for (const linea of contenido.split('\n')) {
            if (!linea.trim() || linea.startsWith('#')) continue;
            const partes = linea.split('\t');
            if (partes.length >= 7) {
                pares.push(`${partes[5]}=${partes[6].trim()}`);
            }
        }
        return pares.length > 0 ? pares.join('; ') : null;
    } catch { return null; }
}

function tieneCookiesReales() {
    return tieneCookiesValidas(YT_COOKIES_PATH);
}

function ytYoutubeArgs() {
    // android_vr: bypasea PO token y 403 sin necesitar cookies (videos/búsquedas generales)
    return [
        '--extractor-args', 'youtube:player_client=android,web_safari',
        '--add-header', `User-Agent:${UA}`,
        '--add-header', 'Accept-Language:en-US,en;q=0.9',
        '--no-cache-dir'
    ];
}

// Args optimizados para audio: mweb y android tienen mayor compatibilidad que android_vr
// para descargar audio — android_vr marca ciertos videos como "not available" aunque existan.
function ytYoutubeArgs() {
    return [
        '--extractor-args', 'youtube:player_client=android,web_safari',
        '--add-header', `User-Agent:${UA}`,
        '--add-header', 'Accept-Language:en-US,en;q=0.9',
        '--no-cache-dir'
    ];
}

// Args con android_vr como segundo intento para audio (algunos videos solo funcionan así)
function ytYoutubeArgs() {
    return [
        '--extractor-args', 'youtube:player_client=android,web_safari',
        '--add-header', `User-Agent:${UA}`,
        '--add-header', 'Accept-Language:en-US,en;q=0.9',
        '--no-cache-dir'
    ];
}

// Args alternativos con cookies vía cliente web — usar solo como fallback para contenido con edad restringida
function ytYoutubeArgsCookies() {
    const hayCookies = tieneCookiesReales();
    const args = [
        '--extractor-args', 'youtube:player_client=web_safari',
        '--add-header', `User-Agent:${UA}`,
        '--add-header', 'Accept-Language:en-US,en;q=0.9',
        '--no-cache-dir'
    ];
    if (hayCookies) {
        args.push('--cookies', YT_COOKIES_PATH);
    }
    return args;
}

function extraerErrorYtdlp(err) {
    const txt = (err.stderr || err.stdout || err.message || '').toString();
    const linea = txt.split('\n').find(l => l.includes('ERROR:'));
    if (linea) return linea.replace('ERROR:', '').replace(/\[.*?\]/g, '').trim();
    return 'No se pudo descargar el video.';
}

function esUrlYoutube(t) {
    return /^https?:\/\/(www\.)?(youtube\.com|youtu\.be)/.test(t);
}

function formatearSegundos(seg) {
    if (!seg || isNaN(seg)) return null;
    const m = Math.floor(seg / 60), s = Math.floor(seg % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
}

function formatearBytes(bytes) {
    if (!bytes || isNaN(bytes) || bytes <= 0) return null;
    if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${bytes} B`;
}

function formatearVistas(n) {
    if (!n || isNaN(n)) return null;
    if (n >= 1e9) return `${(n / 1e9).toFixed(1)}B`;
    if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
    if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
    return String(n);
}

function extraerUrlsMedia(obj) {
    const urls = [];
    const visitar = (valor) => {
        if (!valor) return;
        if (typeof valor === 'string') {
            if (/^https?:\/\/.+\.(mp4|jpg|jpeg|png|webp)(\?|$)/i.test(valor)) urls.push(valor);
            return;
        }
        if (Array.isArray(valor)) {
            valor.forEach(visitar);
            return;
        }
        if (typeof valor === 'object') {
            Object.values(valor).forEach(visitar);
        }
    };
    visitar(obj);
    return [...new Set(urls)];
}

function construirCaption(plataforma, titulo, duracion, tamano, extras = {}) {
    const emoji = { TikTok: '🎵', Instagram: '📸', Facebook: '📘', 'Twitter/X': '𝕏', YouTube: '🎬' }[plataforma] || '📹';
    let cap = `${emoji} *${titulo || plataforma}*\n`;
    const lineas = [];
    if (duracion) lineas.push(`✘ Duración: ${duracion}`);
    if (tamano) lineas.push(`📦 Tamaño: ${tamano}`);
    if (extras.canal) lineas.push(`📝 Canal: ${extras.canal}`);
    if (extras.vistas) lineas.push(`👁️ Vistas: ${extras.vistas}`);
    if (extras.autor) lineas.push(`✒️ Autor: ${extras.autor}`);
    lineas.push(`🔗 Fuente: ${plataforma}`);
    return cap + '\n' + lineas.join('\n');
}

// ── Obtener info completa del video ───────────────────────────────────────
async function ytdlpInfo(url) {
    const isYT = esUrlYoutube(url);
    const parseSalida = (stdout) => {
        const [titulo, durStr, sizeStr, autor, viewsStr, thumbnail] = stdout.trim().split('\t');
        return {
            titulo:    titulo    && titulo    !== 'NA' && titulo    !== 'None' ? titulo    : null,
            duracion:  parseInt(durStr) || 0,
            tamano:    formatearBytes(parseInt(sizeStr)),
            autor:     autor     && autor     !== 'NA' && autor     !== 'None' ? autor     : null,
            vistas:    viewsStr  && viewsStr  !== 'NA' && viewsStr  !== 'None' ? formatearVistas(parseInt(viewsStr)) : null,
            thumbnail: thumbnail && thumbnail !== 'NA' && thumbnail !== 'None' ? thumbnail.trim() : null
        };
    };
    const printArgs = ['--print', '%(title)s\t%(duration)s\t%(filesize_approx)s\t%(uploader)s\t%(view_count)s\t%(thumbnail)s', '--no-playlist', '--no-warnings', '--quiet'];
    try {
        const { stdout } = await ytdlpEjecutar([url, ...printArgs, ...(isYT ? ytYoutubeArgs() : ytdlpHeadersArgs())], 30000);
        return parseSalida(stdout);
    } catch (err) {
        // Fallback con cookies+web para contenido con restricción de edad
        if (isYT && tieneCookiesReales()) {
            const txt = String(err?.stderr || err?.message || '').toLowerCase();
            if (txt.includes('sign in') || txt.includes('age') || txt.includes('login') || txt.includes('unavailable')) {
                try {
                    const { stdout } = await ytdlpEjecutar([url, ...printArgs, ...ytYoutubeArgsCookies()], 30000);
                    return parseSalida(stdout);
                } catch { }
            }
        }
        logRequestError('ytdlpInfo', err);
        return { titulo: null, duracion: 0, tamano: null, autor: null, vistas: null, thumbnail: null };
    }
}

// ── Enviar tarjeta de info del video (thumbnail + datos) ──────────────────
async function enviarInfoCard(sock, jid, info, url, tipo = 'video') {
    const durStr = formatearSegundos(info.duracion);
    const accion = tipo === 'audio' ? '🎵 Descargando audio...' : '🎬 Descargando video...';

    const captionCard = [
        info.titulo ? `*${info.titulo}*` : '*Sin título*',
        '',
        durStr   ? `✘ Duración: ${durStr}` : null,
        info.autor ? `📝 Canal: ${info.autor}` : null,
        info.vistas ? `👁️ Vistas: ${info.vistas}` : null,
        url ? `🔗 Link: ${url}` : null,
        '',
        accion
    ].filter(l => l !== null).join('\n');

    try {
        if (info.thumbnail) {
            await sock.sendMessage(jid, {
                image: { url: info.thumbnail },
                caption: captionCard
            });
            return;
        }
    } catch { }

    await sock.sendMessage(jid, { text: captionCard });
}

// ── CORE: descargar con yt-dlp ────────────────────────────────────────────
async function ytdlpDescargarBuffer(url, { formato = null, merge = false, cookiesPath = null, ytArgs = null } = {}) {
    const id = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const tmpBase = path.join(os.tmpdir(), `ytdlp_${id}`);
    const outputTemplate = `${tmpBase}.%(ext)s`;
    const isYT = esUrlYoutube(url);

    const construirArgs = (extraYtArgs) => {
        const a = [
            url,
            '-o', outputTemplate,
            '--no-playlist',
            '--no-part',
            '--no-check-certificates',
            ...(extraYtArgs || (isYT ? ytYoutubeArgs() : ytdlpHeadersArgs()))
        ];
        if (cookiesPath && fs.existsSync(cookiesPath)) a.push('--cookies', cookiesPath);
        if (formato) {
    a.push('-f', formato);
} else {
    a.push('-f', 'bv*+ba/b');
        }
        if (merge) a.push('--merge-output-format', 'mp4');
        return a;
    };

    const leerArchivo = async () => {
        const tmpDir = os.tmpdir();
        const baseNombre = path.basename(tmpBase);
        const archivos = fs.readdirSync(tmpDir)
            .filter(f => f.startsWith(baseNombre) && !f.endsWith('.part') && !f.endsWith('.ytdl'));
        if (!archivos.length) throw new Error('No se generó ningún archivo de video.');
        const archivoFinal = path.join(tmpDir, archivos[0]);
        const stat = await fs.stat(archivoFinal);
        const buffer = await fs.readFile(archivoFinal);
        await fs.remove(archivoFinal).catch(() => {});
        return { buffer, tamano: formatearBytes(stat.size) };
    };

    const limpiarTmp = async () => {
        try {
            const base = path.basename(tmpBase);
            const archivos = fs.readdirSync(os.tmpdir()).filter(f => f.startsWith(base));
            await Promise.all(archivos.map(f => fs.remove(path.join(os.tmpdir(), f)).catch(() => {})));
        } catch { }
    };

    try {
        await ytdlpEjecutar(construirArgs(ytArgs), 150000);
        return await leerArchivo();
    } catch (err) {
        // Fallback automático con cookies+web para contenido con restricción de edad
        if (isYT && !ytArgs && tieneCookiesReales()) {
            const txt = String(err?.stderr || err?.message || '').toLowerCase();
            if (txt.includes('sign in') || txt.includes('age') || txt.includes('login') || txt.includes('unavailable')) {
                try {
                    await ytdlpEjecutar(construirArgs(ytYoutubeArgsCookies()), 150000);
                    return await leerArchivo();
                } catch (err2) {
                    await limpiarTmp();
                    throw err2;
                }
            }
        }
        await limpiarTmp();
        throw err;
    }
}

async function ytdlpDirectMedia(url, formato = 'best[ext=mp4][height<=720]/best[height<=720]/best') {
    const isYT = esUrlYoutube(url);
    const { stdout } = await ytdlpEjecutar([
        url,
        '-J',
        '-f', formato,
        '--no-playlist',
        '--no-warnings',
        '--quiet',
        ...(isYT ? ytYoutubeArgs() : ytdlpHeadersArgs())
    ], 60000);
    const info = JSON.parse(stdout);
    const formatos = Array.isArray(info.formats) ? info.formats : [];
    const conVideo = formatos
        .filter(f => f.url && f.vcodec !== 'none' && /\.(mp4|m3u8|webm)(\?|$)/i.test(f.url))
        .sort((a, b) => (b.height || 0) - (a.height || 0) || (b.tbr || 0) - (a.tbr || 0));
    const elegido = conVideo[0] || formatos.find(f => f.url && f.vcodec !== 'none') || (info.url ? info : null);
    if (!elegido?.url) throw new Error('No se encontró enlace directo de video.');
    return {
        url: elegido.url,
        titulo: info.title,
        duracion: info.duration,
        autor: info.uploader,
        vistas: formatearVistas(info.view_count),
        thumbnail: info.thumbnail
    };
}

async function descargarDirectoConYtdlp(url, plataforma) {
    const info = await ytdlpDirectMedia(url);
    const buffer = await descargarBuffer(info.url);
    return {
        buffer,
        tamano: formatearBytes(buffer.length),
        info
    };
}

// ── Resolver URL final (sigue redirects, útil para URLs cortas) ───────────
function resolverUrlFinal(url) {
    return new Promise((resolve) => {
        try {
            const lib = url.startsWith('https') ? followRedirects.https : followRedirects.http;
            const req = lib.get(url, {
                headers: { ...HUMAN_HEADERS, Accept: 'text/html,*/*' },
                timeout: { connect: 6000, socket: 6000, response: 6000 },
                maxRedirects: 10
            }, (res) => {
                resolve(res.responseUrl || url);
                res.resume();
                res.destroy();
            });
            req.on('error', () => resolve(url));
        } catch { resolve(url); }
    });
}

// ── TikTok via tikmate.app ─────────────────────────────────────────────────
async function tiktokTikmate(url) {
    const res = await axios.post(
        'https://api.tikmate.app/api/lookup',
        new URLSearchParams({ url }).toString(),
        {
            headers: {
                ...HUMAN_HEADERS,
                'Content-Type': 'application/x-www-form-urlencoded',
                'Referer': 'https://tikmate.app/',
                'Origin': 'https://tikmate.app'
            },
            timeout: 25000
        }
    );
    const { token, id, success } = res.data || {};
    if (!success || !token || !id) throw new Error(`tikmate: ${res.data?.message || 'sin token'}`);
    const videoUrl = `https://tikmate.app/download/${token}/${id}/0.mp4`;
    const buffer = await descargarBuffer(videoUrl, { Referer: 'https://tikmate.app/' });
    if (buffer.length < 5000) throw new Error('tikmate: buffer vacío');
    return {
        buffer,
        tamano: formatearBytes(buffer.length),
        info: {
            titulo: res.data?.desc || 'Video de TikTok',
            duracion: res.data?.duration || 0,
            autor: res.data?.username || null
        }
    };
}

// ── Facebook via fdown.net / getfvid.com ──────────────────────────────────
async function facebookApiDescargar(url) {
    // 1. fdown.net
    try {
        const res = await axios.post(
            'https://fdown.net/download.php',
            new URLSearchParams({ URLz: url }).toString(),
            {
                headers: {
                    ...HUMAN_HEADERS,
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Referer': 'https://fdown.net/',
                    'Origin': 'https://fdown.net'
                },
                timeout: 25000
            }
        );
        const hdMatch = res.data?.match(/href="(https?:\/\/video[^"]+\.mp4[^"]*)"/i);
        if (hdMatch) return hdMatch[1].replace(/&amp;/g, '&');
        const sdMatch = res.data?.match(/href="(https?:\/\/[^"]+\.mp4[^"]*)"/i);
        if (sdMatch) return sdMatch[1].replace(/&amp;/g, '&');
    } catch (e) { logRequestError('facebook fdown', e); }

    // 2. getfvid.com
    try {
        const res = await axios.post(
            'https://www.getfvid.com/downloader',
            new URLSearchParams({ url }).toString(),
            {
                headers: {
                    ...HUMAN_HEADERS,
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Referer': 'https://www.getfvid.com/',
                    'Origin': 'https://www.getfvid.com'
                },
                timeout: 25000
            }
        );
        const match = res.data?.match(/href="(https?:\/\/[^"]+\.mp4[^"]*)"/i);
        if (match) return match[1].replace(/&amp;/g, '&');
        const anyMp4 = res.data?.match(/(https?:\/\/[^\s"'<>]+\.mp4(?:\?[^\s"'<>]*)?)/i);
        if (anyMp4) return anyMp4[1];
    } catch (e) { logRequestError('facebook getfvid', e); }

    return null;
}

// ── Instagram via snapinsta.app ────────────────────────────────────────────
async function instagramSnapinsta(url) {
    const res = await axios.post(
        'https://api.snapinsta.app/v1/media',
        new URLSearchParams({ url }).toString(),
        {
            headers: {
                ...HUMAN_HEADERS,
                'Content-Type': 'application/x-www-form-urlencoded',
                'Referer': 'https://snapinsta.app/',
                'Origin': 'https://snapinsta.app'
            },
            timeout: 25000
        }
    );
    const data = res.data?.data;
    if (!Array.isArray(data) || !data.length) throw new Error('snapinsta: sin datos');
    const video = data.find(d => d.type === 'video') || data[0];
    if (!video?.url) throw new Error('snapinsta: sin URL');
    return video.url;
}

async function tiktokFallbackTikwm(url) {
    const res = await axios.post(
        'https://www.tikwm.com/api/',
        new URLSearchParams({ url, hd: '1' }).toString(),
        {
            headers: {
                ...HUMAN_HEADERS,
                'Content-Type': 'application/x-www-form-urlencoded',
                'Referer': 'https://www.tikwm.com/'
            },
            timeout: 25000
        }
    );
    const data = res.data?.data;
    const videoUrl = data?.hdplay || data?.play || data?.wmplay;
    if (!videoUrl) throw new Error(res.data?.msg || 'TikWM no devolvió video.');
    const buffer = await descargarBuffer(videoUrl, { Referer: 'https://www.tikwm.com/' });
    return {
        buffer,
        tamano: formatearBytes(buffer.length),
        info: {
            titulo: data.title || 'Video de TikTok',
            duracion: data.duration || 0,
            autor: data.author?.nickname || data.author?.unique_id || null
        }
    };
}

// ── Buscar video en YouTube ───────────────────────────────────────────────
async function ytdlpBuscarUrl(query) {
    const baseArgs = [
        `ytsearch1:${query}`,
        '--print', '%(webpage_url)s\t%(title)s\t%(duration)s',
        '--no-playlist', '--quiet', '--no-warnings',
    ];
    const intentos = [
        ytYoutubeArgsAudio(),   // mweb,android — más compatible para búsquedas
        ytYoutubeArgs(),        // android_vr
        ...(tieneCookiesReales() ? [ytYoutubeArgsCookies()] : []),  // web + cookies como último recurso
    ];
    let ultimoError;
    for (const ytArgs of intentos) {
        try {
            const { stdout } = await ytdlpEjecutar([...baseArgs, ...ytArgs], 30000);
            const linea = stdout.trim().split('\n')[0];
            if (!linea) throw new Error('No se encontraron resultados.');
            const [url, titulo, duracion] = linea.split('\t');
            return { url, titulo: titulo || 'Sin título', duracion: parseInt(duracion) || 0 };
        } catch (err) {
            ultimoError = err;
            const txt = String(err?.stderr || err?.message || '').toLowerCase();
            // Solo reintenta si el error es de autenticación/bot — otros errores los lanza directo
            if (!txt.includes('sign in') && !txt.includes('login') && !txt.includes('bot') && !txt.includes('confirm')) throw err;
        }
    }
    throw ultimoError;
}

// ════════════════════════════════════════════════════
//  YOUTUBE - VIDEO (link directo)
// ════════════════════════════════════════════════════
async function cmdYoutube(sock, jid, args) {
    const url = args[0];
    if (!url || !esUrlYoutube(url)) {
        await sock.sendMessage(jid, { text: '❌ Ingresa un link válido de YouTube.\n📌 Uso: *#yt <link>*' });
        return;
    }
    await sock.sendMessage(jid, { text: '⏳ Obteniendo información...' });
    try {
        const info = await ytdlpInfo(url);
        if (info.duracion > 1200) {
            await sock.sendMessage(jid, { text: '❌ El video es muy largo. Máximo 20 minutos.\nUsa *#ytv <nombre>* para buscar.' });
            return;
        }
        await enviarInfoCard(sock, jid, info, url, 'video');
        const formato = 'bestvideo[ext=mp4][height<=480]+bestaudio[ext=m4a]/bestvideo[height<=480]+bestaudio/best[height<=480]/best';
        const { buffer, tamano } = await ytdlpDescargarBuffer(url, { formato, merge: true });
        const caption = construirCaption('YouTube', info.titulo || 'Video de YouTube', formatearSegundos(info.duracion), info.tamano || tamano, { canal: info.autor, vistas: info.vistas });
        await sock.sendMessage(jid, { video: buffer, caption });
    } catch (err) {
        logRequestError('cmdYoutube', err);
        await sock.sendMessage(jid, { text: mensajeErrorDescarga(err, 'YouTube') });
    }
}

// ════════════════════════════════════════════════════
//  YOUTUBE - AUDIO (#play)
// ════════════════════════════════════════════════════
async function cmdYoutubeAudio(sock, jid, args) {
    let consulta = args.join(' ');
    if (!consulta) {
        await sock.sendMessage(jid, { text: '❌ Uso: *#play <link o canción>*' });
        return;
    }

    let urlFinal = consulta, infoFinal = null;

    if (!esUrlYoutube(consulta)) {
        await sock.sendMessage(jid, { text: `🔍 Buscando: *${consulta}*...` });
        try {
            const r = await ytdlpBuscarUrl(consulta);
            urlFinal = r.url;
        } catch (err) {
            logRequestError('cmdYoutubeAudio search', err);
            await sock.sendMessage(jid, { text: `❌ No encontré resultados para: *${consulta}*` });
            return;
        }
    }

    infoFinal = await ytdlpInfo(urlFinal);
    await enviarInfoCard(sock, jid, infoFinal, urlFinal, 'audio');

    const tmpBase = path.join(os.tmpdir(), `yta_${Date.now()}`);
    const tmpMp3 = `${tmpBase}.mp3`;
    const audioArgs = (ytArgs) => [
        urlFinal, '-x', '--audio-format', 'mp3', '--audio-quality', '5',
        '-o', `${tmpBase}.%(ext)s`, '--no-playlist', '--quiet', '--no-warnings',
        ...ytArgs
    ];
    // Cadena de clientes: mweb+android → android_vr+android → web+cookies (si hay)
    // android_vr solo falla en ciertos videos marcando "not available", mweb/android son más compatibles
    const intentos = [
        { args: ytYoutubeArgsAudio(),  label: 'mweb,android' },
        { args: ytYoutubeArgsAudioVr(), label: 'android_vr,android' },
        ...(tieneCookiesReales() ? [{ args: ytYoutubeArgsCookies(), label: 'web+cookies' }] : []),
    ];
    let ultimoError = null;
    try {
        let descargado = false;
        for (const intento of intentos) {
            try {
                await ytdlpEjecutar(audioArgs(intento.args), 120000);
                descargado = true;
                break;
            } catch (err) {
                ultimoError = err;
                // Si el error es por límite de tamaño/formato, no reintentar
                const txt = String(err?.stderr || err?.message || '').toLowerCase();
                if (txt.includes('too large') || txt.includes('format not available')) throw err;
                // Si no hay otro intento, dejar que lo capture el catch externo
            }
        }
        if (!descargado) throw ultimoError;
        const buffer = await fs.readFile(tmpMp3);
        await sock.sendMessage(jid, {
            audio: buffer,
            mimetype: 'audio/mpeg',
            ptt: false
        });
        await fs.remove(tmpMp3).catch(() => {});
    } catch (err) {
        logRequestError('cmdYoutubeAudio', ultimoError || err);
        await fs.remove(tmpMp3).catch(() => {});
        await sock.sendMessage(jid, { text: mensajeErrorDescarga(ultimoError || err, 'YouTube Audio') });
    }
}

// ════════════════════════════════════════════════════
//  YOUTUBE - BUSCAR
// ════════════════════════════════════════════════════
async function cmdYoutubeSearch(sock, jid, args) {
    const query = args.join(' ');
    if (!query) { await sock.sendMessage(jid, { text: '❌ Uso: *#ytsearch <búsqueda>*' }); return; }
    await sock.sendMessage(jid, { text: `🔍 Buscando en YouTube: *${query}*...` });
    try {
        const { stdout } = await ytdlpEjecutar([
            `ytsearch5:${query}`, '--print', '%(webpage_url)s\t%(title)s\t%(duration_string)s',
            '--no-playlist', '--quiet', '--no-warnings',
            ...ytYoutubeArgs()
        ], 30000);
        const lineas = stdout.trim().split('\n').filter(Boolean);
        if (!lineas.length) { await sock.sendMessage(jid, { text: '❌ No se encontraron resultados.' }); return; }
        let texto = `🎬 *Resultados para:* _${query}_\n\n`;
        lineas.forEach((linea, i) => {
            const [url, titulo, dur] = linea.split('\t');
            texto += `*${i + 1}.* ${titulo || 'Sin título'} _(${dur || ''})_\n🔗 ${url}\n\n`;
        });
        texto += '▶️ Video: *#yt <link>* | 🎵 Audio: *#play <link>*';
        await sock.sendMessage(jid, { text: texto });
    } catch (err) {
        logRequestError('cmdYoutubeSearch', err);
        await sock.sendMessage(jid, { text: mensajeErrorDescarga(err, 'YouTube Búsqueda') });
    }
}

// ════════════════════════════════════════════════════
//  YOUTUBE - BUSCAR Y DESCARGAR VIDEO (#ytv)
// ════════════════════════════════════════════════════
async function cmdYoutubeVideoSearch(sock, jid, args) {
    const query = args.join(' ');
    if (!query) { await sock.sendMessage(jid, { text: '❌ Uso: *#ytv <nombre del video>*' }); return; }
    await sock.sendMessage(jid, { text: `🔍 Buscando: *${query}*...` });
    try {
        const resultado = await ytdlpBuscarUrl(query);
        if (resultado.duracion > 1200) {
            await sock.sendMessage(jid, { text: `❌ El video _${resultado.titulo}_ supera los 20 minutos.\n_Intenta buscar un video más corto._` });
            return;
        }
        // Obtener info completa (thumbnail, vistas, etc.)
        const info = await ytdlpInfo(resultado.url);
        await enviarInfoCard(sock, jid, { ...info, titulo: resultado.titulo }, resultado.url, 'video');
        const formato = 'best[ext=mp4][height<=480]/best[height<=480][ext=mp4]/best[height<=480]/best[ext=mp4]/best';
        const { buffer, tamano } = await ytdlpDescargarBuffer(resultado.url, { formato, merge: false });
        const caption = construirCaption('YouTube', resultado.titulo, formatearSegundos(resultado.duracion), tamano, { canal: info.autor, vistas: info.vistas });
        await sock.sendMessage(jid, { video: buffer, caption });
    } catch (err) {
        logRequestError('cmdYoutubeVideoSearch', err);
        await sock.sendMessage(jid, { text: mensajeErrorDescarga(err, 'YouTube') });
    }
}

// ════════════════════════════════════════════════════
//  UTILIDAD — Resolver URLs cortas (vt.tiktok.com, etc.)
// ════════════════════════════════════════════════════
async function resolverUrlCorta(url) {
    try {
        // Seguimos los redirects y devolvemos la URL final
        const resp = await axios.get(url, {
            maxRedirects: 10,
            timeout: 10000,
            validateStatus: () => true,
            headers: { 'User-Agent': UA }
        });
        // axios/node guarda la URL final en responseUrl
        const final = resp.request?.res?.responseUrl || resp.config?.url || url;
        return final;
    } catch {
        return url;
    }
}

// ════════════════════════════════════════════════════
//  TIKTOK - VIDEO
// ════════════════════════════════════════════════════
function esTiktokUrl(url) {
    if (!url) return false;
    return /tiktok\.com|vt\.tiktok|vm\.tiktok|m\.tiktok\.com|www\.tiktok\.com|t\.tiktok\.com/.test(url);
}

// Detecta si un buffer es audio (MP3/AAC/OGG) en lugar de video
function esBufferAudio(buffer) {
    if (!buffer || buffer.length < 4) return false;
    // ID3 (MP3 con etiqueta)
    if (buffer[0] === 0x49 && buffer[1] === 0x44 && buffer[2] === 0x33) return true;
    // MP3 sin etiqueta (sync word)
    if (buffer[0] === 0xFF && (buffer[1] & 0xE0) === 0xE0) return true;
    // OGG
    if (buffer[0] === 0x4F && buffer[1] === 0x67 && buffer[2] === 0x67 && buffer[3] === 0x53) return true;
    return false;
}

async function cmdTiktok(sock, jid, args) {
    const url = args[0];
    if (!url || !esTiktokUrl(url)) {
        await sock.sendMessage(jid, { text: '❌ Ingresa un link válido de TikTok.\n📌 Uso: *#tt <link>*\n💡 Para solo audio usa *#ttaudio <link>*\n_Acepta links cortos (vt.tiktok.com, vm.tiktok.com) y largos_' });
        return;
    }
    await sock.sendMessage(jid, { text: '⏳ Descargando video de TikTok...' });
    try {
        let buffer, tamano, info = { titulo: 'Video de TikTok', duracion: 0, autor: null };

        // Resolver URL corta → URL completa ANTES de pasarla a las APIs
        // vt.tiktok.com y vm.tiktok.com son redirects; las APIs necesitan la URL real
        const esCorta = /vt\.tiktok|vm\.tiktok|t\.tiktok/.test(url);
        const urlFinal = esCorta ? await resolverUrlCorta(url) : url;

        // 1. TikWM (con URL resuelta)
        try {
            const tw = await tiktokFallbackTikwm(urlFinal);
            buffer = tw.buffer; tamano = tw.tamano; info = tw.info;
        } catch (twErr) {
            logRequestError('tiktok tikwm', twErr);

            // 2. Tikmate (con URL resuelta)
            try {
                const tm = await tiktokTikmate(urlFinal);
                buffer = tm.buffer; tamano = tm.tamano; info = tm.info;
            } catch (tmErr) {
                logRequestError('tiktok tikmate', tmErr);

                // 3. yt-dlp forzando formato video mp4 (con o sin cookies)
                const cookiesArgs = tieneCookiesValidas(TIKTOK_COOKIES_PATH) ? { cookiesPath: TIKTOK_COOKIES_PATH } : {};
                if (!tieneCookiesValidas(TIKTOK_COOKIES_PATH)) {
                    await sock.sendMessage(jid, {
                        text: `❌ *TikTok bloquea descargas desde la IP del servidor.*\n\n` +
                              `📋 *Solución — configura tus cookies de TikTok:*\n` +
                              `1️⃣ Instala la extensión _"Get cookies.txt LOCALLY"_ en Chrome/Firefox\n` +
                              `2️⃣ Visita *tiktok.com* con tu cuenta\n` +
                              `3️⃣ Haz clic en la extensión y exporta las cookies\n` +
                              `4️⃣ Guarda el archivo como *cookies/tiktok.txt* en la carpeta del bot\n\n` +
                              `_Solo hay que hacerlo una vez. Después el comando funcionará normalmente._`
                    });
                    return;
                }
                // Forzar formato video para evitar que yt-dlp descargue solo audio
                const dl = await ytdlpDescargarBuffer(url, {
                    ...cookiesArgs,
                    formato: 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best',
                    merge: true
                });
                buffer = dl.buffer; tamano = dl.tamano;
            }
        }

        // Si el buffer es audio en lugar de video, avisar al usuario
        if (esBufferAudio(buffer)) {
            await sock.sendMessage(jid, {
                text: `⚠️ Este TikTok parece ser de solo audio o slideshow, no contiene video.\n💡 Usa *#ttaudio ${url}* para obtener el audio.`
            });
            return;
        }

        const caption = construirCaption('TikTok',
            info.titulo || 'Video de TikTok',
            formatearSegundos(info.duracion),
            tamano,
            { autor: info.autor }
        );
        await sock.sendMessage(jid, { video: buffer, caption, mimetype: 'video/mp4' });
    } catch (err) {
        logRequestError('cmdTiktok', err);
        await sock.sendMessage(jid, { text: mensajeErrorDescarga(err, 'TikTok') });
    }
}

// ════════════════════════════════════════════════════
//  TIKTOK - AUDIO
// ════════════════════════════════════════════════════
async function cmdTiktokAudio(sock, jid, args) {
    const url = args[0];
    if (!url || !esTiktokUrl(url)) {
        await sock.sendMessage(jid, { text: '❌ Ingresa un link válido de TikTok.\n📌 Uso: *#ttplay <link>*' });
        return;
    }
    await sock.sendMessage(jid, { text: '⏳ Extrayendo audio de TikTok...' });
    const tmpBase = path.join(os.tmpdir(), `ttaudio_${Date.now()}`);
    const tmpMp3 = `${tmpBase}.mp3`;
    const hasCookies = tieneCookiesValidas(TIKTOK_COOKIES_PATH);
    const cookiesArgs = hasCookies ? ['--cookies', TIKTOK_COOKIES_PATH] : [];
    try {
        await ytdlpEjecutar([
            url, '-x', '--audio-format', 'mp3', '--audio-quality', '5',
            '-o', `${tmpBase}.%(ext)s`, '--no-playlist', '--no-part',
            '--no-check-certificates',
            ...ytdlpHeadersArgs(),
            ...cookiesArgs
        ], 90000);
        const buffer = await fs.readFile(tmpMp3);
        await sock.sendMessage(jid, { audio: buffer, mimetype: 'audio/mpeg', ptt: false });
        await fs.remove(tmpMp3).catch(() => {});
    } catch (err) {
        logRequestError('cmdTiktokAudio', err);
        await fs.remove(tmpMp3).catch(() => {});
        const bloqueado = (err.stderr || err.message || '').includes('blocked');
        if (bloqueado && !hasCookies) {
            await sock.sendMessage(jid, {
                text: `❌ *TikTok bloquea el acceso desde la IP del servidor.*\n` +
                      `Configura *cookies/tiktok.txt* para que funcione.\n` +
                      `_(usa el comando #tiktok para ver las instrucciones)_`
            });
        } else {
            await sock.sendMessage(jid, { text: mensajeErrorDescarga(err, 'TikTok Audio') });
        }
    }
}

// ════════════════════════════════════════════════════
//  FACEBOOK - VIDEO
// ════════════════════════════════════════════════════
async function cmdFacebook(sock, jid, args) {
    const url = args[0];
    if (!url || (!url.includes('facebook.com') && !url.includes('fb.watch') && !url.includes('fb.com'))) {
        await sock.sendMessage(jid, { text: '❌ Ingresa un link válido de Facebook.\n📌 Uso: *#facebook <link>*\n_El video debe ser público_' });
        return;
    }
    await sock.sendMessage(jid, { text: '⏳ Descargando video de Facebook...' });
    try {
        let buffer, tamano;

        // 1. fdown.net / getfvid.com (procesan en sus propios servidores)
        const mediaUrl = await facebookApiDescargar(url);
        if (mediaUrl) {
            buffer = await descargarBuffer(mediaUrl, { Referer: 'https://fdown.net/' });
            tamano = formatearBytes(buffer.length);
        } else {
            // 2. yt-dlp con cookies de Facebook (bypassea share/r/ y videos con login)
            if (tieneCookiesValidas(FB_COOKIES_PATH)) {
                const dl = await ytdlpDescargarBuffer(url, {
                    formato: 'best[ext=mp4]/best',
                    cookiesPath: FB_COOKIES_PATH
                });
                buffer = dl.buffer;
                tamano = dl.tamano;
            } else {
                // 3. yt-dlp sin cookies (solo funciona con URLs de videos directos públicos)
                try {
                    const dl = await ytdlpDescargarBuffer(url, { formato: 'best[ext=mp4]/best' });
                    buffer = dl.buffer;
                    tamano = dl.tamano;
                } catch {
                    await sock.sendMessage(jid, {
                        text: `❌ *No se pudo descargar este video de Facebook.*\n\n` +
                              `Las URLs de tipo \`facebook.com/share/r/\` y videos con privacidad requieren cookies.\n\n` +
                              `📋 *Solución:*\n` +
                              `1️⃣ Instala _"Get cookies.txt LOCALLY"_ en Chrome/Firefox\n` +
                              `2️⃣ Visita *facebook.com* con tu cuenta\n` +
                              `3️⃣ Exporta las cookies con la extensión\n` +
                              `4️⃣ Guarda el archivo como *cookies/facebook.txt* en la carpeta del bot\n\n` +
                              `_Con las cookies configuradas, los videos de Facebook y Reels funcionarán normalmente._`
                    });
                    return;
                }
            }
        }

        const caption = construirCaption('Facebook', 'Video de Facebook', null, tamano);
        await sock.sendMessage(jid, { video: buffer, caption });
    } catch (err) {
        logRequestError('cmdFacebook', err);
        await sock.sendMessage(jid, { text: `❌ No pude descargar este video de Facebook.\n_Verifica que el link sea válido o configura cookies/facebook.txt_` });
    }
}

// ════════════════════════════════════════════════════
//  TWITTER/X - VIDEO
// ════════════════════════════════════════════════════
async function twitterObtenerMedia(url) {
    const tweetId = url.match(/status\/(\d+)/)?.[1];
    if (!tweetId) throw new Error('URL inválida de Twitter/X.');

    // vxtwitter — detecta video Y gif
    try {
        const res = await axios.get(`https://api.vxtwitter.com/Twitter/status/${tweetId}`, { ...axiosOpts, timeout: 15000 });
        const media = res.data?.media_extended;
        if (media?.length) {
            // GIF de Twitter (almacenado como MP4)
            const gif = media.find(m => m.type === 'gif');
            if (gif?.url) return { url: gif.url, isGif: true };

            const video = media.find(m => m.type === 'video');
            if (video?.url) return { url: video.url, isGif: false };

            // variants (mejor bitrate)
            const conVariants = media.find(m => m.variants?.length);
            if (conVariants) {
                const best = conVariants.variants.sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0))[0];
                if (best?.url) return { url: best.url, isGif: false };
            }
        }
        if (res.data?.mediaURLs?.length) return { url: res.data.mediaURLs[0], isGif: false };
    } catch (err) { logRequestError('twitter vxtwitter', err); }

    // fxtwitter — fallback
    try {
        const res = await axios.get(`https://api.fxtwitter.com/i/status/${tweetId}`, { ...axiosOpts, timeout: 15000 });
        const allMedia = res.data?.tweet?.media?.all || [];
        const gif = allMedia.find(m => m.type === 'gif' && m.url);
        if (gif) return { url: gif.url, isGif: true };
        const v = res.data?.tweet?.media?.videos?.[0];
        if (v?.url) return { url: v.url, isGif: false };
        const anyVideo = allMedia.find(m => m.type === 'video' && m.url);
        if (anyVideo) return { url: anyVideo.url, isGif: false };
    } catch (err) { logRequestError('twitter fxtwitter', err); }

    return null;
}

async function cmdTwitter(sock, jid, args) {
    const url = args[0];
    if (!url || (!url.includes('twitter.com') && !url.includes('x.com'))) {
        await sock.sendMessage(jid, { text: '❌ Ingresa un link válido de Twitter/X.\n📌 Uso: *#x <link>*' });
        return;
    }
    await sock.sendMessage(jid, { text: '⏳ Descargando de Twitter/X...' });
    try {
        let buffer, tamano, isGif = false;

        // 1. APIs de Twitter (vxtwitter / fxtwitter)
        const mediaInfo = await twitterObtenerMedia(url);
        if (mediaInfo?.url) {
            buffer = await descargarBuffer(mediaInfo.url, { Referer: 'https://twitter.com/' });
            tamano = formatearBytes(buffer.length);
            isGif = mediaInfo.isGif;
        } else {
            // 2. Cobalt Tools
            try {
                const mediaUrl = await cobaltDescargar(url);
                buffer = await descargarBuffer(mediaUrl);
                tamano = formatearBytes(buffer.length);
            } catch (cobaltErr) {
                logRequestError('twitter cobalt', cobaltErr);
                // 3. yt-dlp
                const dl = await ytdlpDescargarBuffer(url);
                buffer = dl.buffer;
                tamano = dl.tamano;
            }
        }

        const caption = construirCaption('Twitter/X', isGif ? 'GIF de Twitter/X' : 'Video de Twitter/X', null, tamano);

        // Enviar siempre como video normal (sin gifPlayback) para que sea
        // guardable en la galería del celular. WhatsApp mostraría los GIFs
        // como videos cortos reproducibles, pero se pueden descargar.
        await sock.sendMessage(jid, { video: buffer, caption, mimetype: 'video/mp4' });
    } catch (err) {
        logRequestError('cmdTwitter', err);
        await sock.sendMessage(jid, { text: mensajeErrorDescarga(err, 'Twitter/X') });
    }
}

// ════════════════════════════════════════════════════
//  INSTAGRAM - VIDEO/REEL
// ════════════════════════════════════════════════════
async function instagramObtenerUrl(url) {
    try {
        const res = await axios.get(`https://api.snapinsta.app/v1/media?url=${encodeURIComponent(url)}`, { ...axiosOpts, timeout: 20000 });
        const item = res.data?.data?.find(d => d.type === 'video') || res.data?.data?.[0];
        if (item?.url) return item.url;
    } catch (err) { logRequestError('instagram snapinsta', err); }

    try {
        const res = await axios.post('https://www.saveinsta.app/action.php',
            new URLSearchParams({ url }).toString(),
            { headers: { ...HUMAN_HEADERS, 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 20000 }
        );
        const match = res.data?.match(/https?:\/\/[^"'\s]+\.mp4[^"'\s]*/);
        if (match) return match[0];
    } catch (err) { logRequestError('instagram saveinsta', err); }

    try {
        const res = await axios.get(`https://instagram.com/oembed/?url=${encodeURIComponent(url)}&format=json`, { ...axiosOpts, timeout: 10000 });
        if (res.data?.thumbnail_url) return res.data.thumbnail_url;
    } catch (err) { logRequestError('instagram oembed', err); }

    const apis = [
        `https://api.vreden.my.id/api/download/ig?url=${encodeURIComponent(url)}`,
        `https://api.vreden.my.id/api/downloader/instagram?url=${encodeURIComponent(url)}`,
        `https://api.agatz.xyz/api/instagram?url=${encodeURIComponent(url)}`,
        `https://api.agatz.xyz/api/igdl?url=${encodeURIComponent(url)}`
    ];

    for (const apiUrl of apis) {
        try {
            const res = await axios.get(apiUrl, { ...axiosOpts, timeout: 20000, validateStatus: () => true });
            if (typeof res.data === 'string' && res.data.includes('redirect_link')) {
                const redirect = res.data.match(/redirect_link = '([^']+)'/)?.[1];
                if (redirect) {
                    const r2 = await axios.get(`${redirect}fp=-7`, { ...axiosOpts, timeout: 20000, validateStatus: () => true });
                    const urls = extraerUrlsMedia(r2.data);
                    const video = urls.find(u => /\.mp4(\?|$)/i.test(u));
                    if (video || urls[0]) return video || urls[0];
                }
            } else {
                const urls = extraerUrlsMedia(res.data);
                const video = urls.find(u => /\.mp4(\?|$)/i.test(u));
                if (video || urls[0]) return video || urls[0];
            }
        } catch (err) { logRequestError('instagram api fallback', err); }
    }

    return null;
}

async function cmdInstagram(sock, jid, args) {
    const url = args[0];
    if (!url || (!url.includes('instagram.com') && !url.includes('instagr.am'))) {
        await sock.sendMessage(jid, { text: '❌ Ingresa un link válido de Instagram.\n📌 Uso: *#ig <link>*\n_El contenido debe ser público_' });
        return;
    }
    await sock.sendMessage(jid, { text: '⏳ Descargando de Instagram...' });
    try {
        let mediaUrl = null;

        // 1. snapinsta.app (API directa, funciona desde cloud)
        try {
            mediaUrl = await instagramSnapinsta(url);
        } catch (e) { logRequestError('instagram snapinsta', e); }

        // 2. yt-dlp directo
        if (!mediaUrl) {
            try {
                const direct = await ytdlpDirectMedia(url);
                mediaUrl = direct.url;
            } catch (e) { logRequestError('instagram ytdlp direct', e); }
        }

        // 3. APIs alternativas (scrapers)
        if (!mediaUrl) mediaUrl = await instagramObtenerUrl(url);

        if (!mediaUrl) {
            await sock.sendMessage(jid, { text: '❌ No pude acceder a este post de Instagram.\n_El contenido debe ser público y no requerir inicio de sesión._' });
            return;
        }

        const buffer = await descargarBuffer(mediaUrl);
        const tamano = formatearBytes(buffer.length);
        const esVideo = /\.mp4(\?|$)/i.test(mediaUrl) || buffer.length > 500 * 1024;

        if (esVideo) {
            await sock.sendMessage(jid, { video: buffer, caption: construirCaption('Instagram', 'Reel / Video de Instagram', null, tamano) });
        } else {
            await sock.sendMessage(jid, { image: buffer, caption: construirCaption('Instagram', 'Imagen de Instagram', null, tamano) });
        }
    } catch (err) {
        logRequestError('cmdInstagram', err);
        await sock.sendMessage(jid, { text: mensajeErrorDescarga(err, 'Instagram') });
    }
}

// ════════════════════════════════════════════════════
//  PINTEREST
// ════════════════════════════════════════════════════

// Intenta la API interna de Pinterest usando las cookies de sesión
async function _buscarPinterestAPI(query) {
    const cookieHeader = parsearCookiesHeader(PINTEREST_COOKIES_PATH);
    if (!cookieHeader) return null;
    const csrfMatch = cookieHeader.match(/csrftoken=([^;]+)/);
    const csrf = csrfMatch ? csrfMatch[1] : '';
    try {
        const res = await axios.get('https://www.pinterest.com/resource/BaseSearchResource/get/', {
            params: {
                source_url: `/search/pins/?q=${encodeURIComponent(query)}&rs=typed`,
                data: JSON.stringify({
                    options: { query, scope: 'pins', page_size: 25, bookmarks: [] },
                    context: {}
                }),
                _: Date.now()
            },
            headers: {
                Cookie: cookieHeader,
                ...(csrf ? { 'X-CSRFToken': csrf } : {}),
                'X-Pinterest-AppState': 'active',
                'X-Requested-With': 'XMLHttpRequest',
                Referer: `https://www.pinterest.com/search/pins/?q=${encodeURIComponent(query)}&rs=typed`,
                'User-Agent': UA,
                Accept: 'application/json, text/javascript, */*, q=0.01'
            },
            timeout: 20000
        });
        const results = res.data?.resource_response?.data?.results || [];
        const urls = results
            .map(p => p?.images?.orig?.url || p?.images?.['736x']?.url)
            .filter(u => u && u.startsWith('http'));
        if (urls.length > 0) return urls[Math.floor(Math.random() * urls.length)];
    } catch (e) { logRequestError('pinterest API', e); }
    return null;
}

// Fallback: scraping de Bing para encontrar imágenes de Pinterest
async function _buscarPinterestBing(query) {
    // Hacemos múltiples búsquedas paralelas con distintas formulaciones del query
    const consultas = [
        `${query} site:i.pinimg.com`,
        `${query} site:pinterest.com`,
        `${query} pinterest`,
        `${query} pinterest aesthetic`,
        `${query} pinimg 736x`,
    ];

    // Patrones regex para extraer URLs de pinimg.com de distintos formatos de HTML de Bing.
    // Bing alterna entre JSON embedido (&quot;) y HTML real (") según la versión de la página.
    const regexes = [
        // JSON embebido con entidades HTML (&quot;)
        /murl&quot;:&quot;(https?:\/\/i\.pinimg\.com\/[^&"<\s]+\.(?:jpg|jpeg|png|webp))/gi,
        /turl&quot;:&quot;(https?:\/\/i\.pinimg\.com\/[^&"<\s]+\.(?:jpg|jpeg|png|webp))/gi,
        // JSON real (comillas normales)
        /"murl"\s*:\s*"(https?:\/\/i\.pinimg\.com\/[^"<\s]+\.(?:jpg|jpeg|png|webp))"/gi,
        /"imgurl"\s*:\s*"(https?:\/\/i\.pinimg\.com\/[^"<\s]+\.(?:jpg|jpeg|png|webp))"/gi,
        // Atributos src de etiquetas img
        /src="(https?:\/\/i\.pinimg\.com\/[^"<\s]+\.(?:jpg|jpeg|png|webp))"/gi,
        // URLs planas en el cuerpo de la respuesta
        /(https?:\/\/i\.pinimg\.com\/(?:originals|736x|564x|474x)\/[^"&<\s]+\.(?:jpg|jpeg|png|webp))/gi,
    ];

    const candidatos = [];

    const UA_BING = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

    const tasks = consultas.map((q) => axios.get(
        `https://www.bing.com/images/search?q=${encodeURIComponent(q)}&count=30&adlt=moderate&form=HDRSC2`,
        {
            timeout: 15000,
            headers: {
                'User-Agent': UA_BING,
                'Accept-Language': 'en-US,en;q=0.9',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
            }
        }
    ).then(res => {
        const html = res.data || '';
        const localCandidatos = [];
        for (const re of regexes) {
            re.lastIndex = 0; // Reiniciar regex global
            const matches = [...html.matchAll(re)].map(m => m[1].replace(/&amp;/g, '&').replace(/\\u0026/g, '&'));
            localCandidatos.push(...matches);
        }
        // Primero añadir solo imágenes de alta resolución
        const hires = localCandidatos.filter(u => u.includes('originals') || u.includes('736x'));
        if (hires.length) {
            candidatos.push(...hires);
        } else {
            // Si no hay alta resolución, usar todas las que encontramos
            candidatos.push(...localCandidatos);
        }
    }).catch(() => {})); // Silenciar errores individuales de red

    await Promise.allSettled(tasks);

    const unicos = [...new Set(candidatos)];
    // Ordenar por resolución: originals > 736x > 564x > 474x > otros
    const ordenados = unicos.sort((a, b) => {
        const peso = (u) => u.includes('originals') ? 4 : u.includes('736x') ? 3 : u.includes('564x') ? 2 : u.includes('474x') ? 1 : 0;
        return peso(b) - peso(a);
    });
    // Selección aleatoria entre los mejores resultados (top 15)
    const pool = ordenados.slice(0, Math.min(15, ordenados.length));
    return pool.length > 0 ? pool[Math.floor(Math.random() * pool.length)] : null;
}

async function buscarImagenPinterest(query) {
    // Primero intenta con la API real de Pinterest (requiere cookies/pinterest.txt)
    const apiResult = await _buscarPinterestAPI(query);
    if (apiResult) return apiResult;
    // Fallback: scraping de Bing
    return _buscarPinterestBing(query);
}

// ════════════════════════════════════════════════════
//  IMAGEN GENERAL
// ════════════════════════════════════════════════════
async function cmdImagen(sock, jid, args) {
    const query = args.join(' ');
    if (!query) { await sock.sendMessage(jid, { text: '❌ Uso: *#img <búsqueda>*' }); return; }
    await sock.sendMessage(jid, { text: `🔍 Buscando imagen: *${query}*...` });
    try {
        const consultas = [
            query,
            `${query} image`,
            `${query} hd`,
        ];
        const candidatos = [];
        const regexes = [
            /murl&quot;:&quot;(https?:\/\/[^&"]+\.(?:jpg|jpeg|png|webp))/gi,
            /"murl":"(https?:\/\/[^"]+\.(?:jpg|jpeg|png|webp))"/gi,
        ];
        await Promise.allSettled(consultas.map(q => axios.get(
            `https://www.bing.com/images/search?q=${encodeURIComponent(q)}&count=20&adlt=moderate&form=HDRSC2`,
            { ...axiosOpts, timeout: 15000 }
        ).then(res => {
            const html = res.data || '';
            for (const re of regexes) {
                const matches = [...html.matchAll(re)].map(m => m[1].replace(/&amp;/g, '&')).filter(u => !u.includes('bing.com'));
                candidatos.push(...matches);
            }
        }).catch(err => logRequestError('cmdImagen search', err))));
        const matches = [...new Set(candidatos)];
        if (!matches.length) { await sock.sendMessage(jid, { text: '❌ No encontré imágenes.' }); return; }
        const url = matches[Math.floor(Math.random() * Math.min(matches.length, 8))];
        await sock.sendMessage(jid, { image: { url }, caption: `🖼️ *${query}*` });
    } catch (err) {
        logRequestError('cmdImagen', err);
        await sock.sendMessage(jid, { text: mensajeErrorDescarga(err, 'Pinterest') });
    }
}

async function cmdDiagnosticoDescargas(sock, jid) {
    const pruebas = [
        ['YouTube', 'https://www.youtube.com/'],
        ['TikTok', 'https://www.tiktok.com/'],
        ['Facebook', 'https://www.facebook.com/'],
        ['Instagram', 'https://www.instagram.com/'],
        ['Rule34', 'https://rule34.xxx/']
    ];
    const resultados = [];
    for (const [nombre, url] of pruebas) {
        try {
            const res = await axios.get(url, { ...axiosOpts, timeout: 10000, validateStatus: () => true });
            resultados.push(`${nombre}: ${res.status}`);
        } catch (err) {
            logRequestError(`diag ${nombre}`, err);
            resultados.push(`${nombre}: ERROR ${err.response?.status || err.message}`);
        }
    }
    await sock.sendMessage(jid, {
        text: `🧪 *Diagnóstico de descargas desde Replit*\n\n${resultados.join('\n')}\n\nSi aquí marca 403/429 y en PC/Termux funciona, el bloqueo probablemente es por IP/hosting.`
    });
}

// ════════════════════════════════════════════════════
//  MEDIAFIRE
// ════════════════════════════════════════════════════
async function cmdMediafire(sock, jid, args) {
    const url = args[0];
    if (!url || !url.includes('mediafire.com')) {
        await sock.sendMessage(jid, { text: '❌ Uso: *#mediafire <link>*\nEjemplo: #mediafire https://www.mediafire.com/file/...' });
        return;
    }
    await sock.sendMessage(jid, { text: '⏳ Procesando link de MediaFire...' });

    // Construir headers con cookies si están disponibles
    const cookieHeader = parsearCookiesHeader(MEDIAFIRE_COOKIES_PATH);
    const mfHeaders = cookieHeader
        ? { ...HUMAN_HEADERS, Cookie: cookieHeader }
        : HUMAN_HEADERS;

    // 1. Intento directo: scraping de la página de MediaFire con cookies
    try {
        const res = await axios.get(url, { headers: mfHeaders, timeout: 20000 });
        const html = res.data || '';
        const match = html.match(/href="(https:\/\/download\d*\.mediafire\.com\/[^"]+)"/);
        if (match) {
            const link = match[1];
            const nombreMatch = html.match(/<div class="dl-btn-label"[^>]*>([^<]+)<\/div>/) ||
                                html.match(/filename['":\s]+['"]([^'"]+)['"]/);
            const nombre = nombreMatch ? nombreMatch[1].trim() : 'archivo';
            await sock.sendMessage(jid, { text: `📦 *MediaFire*\n📄 ${nombre}\n🔗 ${link}` });
            try {
                await sock.sendMessage(jid, { document: { url: link }, fileName: nombre, mimetype: 'application/octet-stream' });
            } catch (e) { logRequestError('mediafire direct send', e); }
            return;
        }
    } catch (e) { logRequestError('mediafire direct scrape', e); }

    // 2. APIs de terceros como fallback
    const apis = [
        () => axios.get(`https://api.dorratz.com/mediafire?url=${encodeURIComponent(url)}`, axiosOpts).then(r => r.data),
        () => axios.get(`https://api.siputzx.my.id/api/d/mediafire?url=${encodeURIComponent(url)}`, axiosOpts).then(r => r.data),
        () => axios.get(`https://api.agatz.xyz/api/mediafire?url=${encodeURIComponent(url)}`, axiosOpts).then(r => r.data),
    ];
    for (const fn of apis) {
        try {
            const data = await fn();
            const link = data?.url || data?.download || data?.data?.url || data?.data?.download || data?.result?.download || data?.result?.url;
            const nombre = data?.filename || data?.name || data?.data?.filename || data?.result?.filename || 'archivo';
            const tamano = data?.size || data?.data?.size || data?.result?.size || '';
            if (link) {
                await sock.sendMessage(jid, { text: `📦 *MediaFire*\n📄 ${nombre}\n${tamano ? `📏 ${tamano}\n` : ''}🔗 ${link}` });
                try {
                    await sock.sendMessage(jid, { document: { url: link }, fileName: nombre, mimetype: 'application/octet-stream' });
                } catch (e) { logRequestError('mediafire send', e); }
                return;
            }
        } catch (e) { logRequestError('mediafire api', e); }
    }
    await sock.sendMessage(jid, { text: '❌ No pude procesar el link de MediaFire ahora.' });
}

// ════════════════════════════════════════════════════
//  SPOTIFY
// ════════════════════════════════════════════════════
async function cmdSpotify(sock, jid, args) {
    const url = args[0];
    if (!url || !url.includes('spotify.com')) {
        await sock.sendMessage(jid, { text: '❌ Uso: *#spotify <link de canción>*' });
        return;
    }
    await sock.sendMessage(jid, { text: '⏳ Descargando de Spotify...' });

    // 1. Intentar con yt-dlp usando cookies de Spotify (obtiene info + preview)
    if (tieneCookiesValidas(SPOTIFY_COOKIES_PATH)) {
        try {
            const tmpBase = path.join(os.tmpdir(), `sp_${Date.now()}`);
            const tmpMp3  = `${tmpBase}.mp3`;
            await ytdlpEjecutar([
                url, '-x', '--audio-format', 'mp3', '--audio-quality', '5',
                '-o', `${tmpBase}.%(ext)s`,
                '--cookies', SPOTIFY_COOKIES_PATH,
                '--no-playlist', '--quiet', '--no-warnings',
                ...ytdlpHeadersArgs()
            ], 120000);
            if (fs.existsSync(tmpMp3)) {
                const buffer = await fs.readFile(tmpMp3);
                await sock.sendMessage(jid, { audio: buffer, mimetype: 'audio/mpeg' });
                await fs.remove(tmpMp3).catch(() => {});
                return;
            }
        } catch (e) { logRequestError('spotify yt-dlp cookies', e); }
    }

    // 2. Intentar extraer info de Spotify con yt-dlp (--dump-json solo extrae metadatos, no descarga)
    // Esto nos da el título y artista para usar en la búsqueda de YouTube aunque la descarga falle
    let titulo = '', artista = '';
    try {
        const infoRaw = await ytdlpEjecutar([
            url, '--dump-json', '--no-playlist', '--quiet',
            '--no-warnings', '--skip-download',
            ...(tieneCookiesValidas(SPOTIFY_COOKIES_PATH) ? ['--cookies', SPOTIFY_COOKIES_PATH] : [])
        ], 30000);
        const info = JSON.parse(typeof infoRaw === 'string' ? infoRaw : JSON.stringify(infoRaw));
        titulo  = info?.title  || info?.track  || '';
        artista = info?.artist || info?.uploader || '';
        // Si el titulo tiene "artist - title", separarlo
        if (titulo && !artista && titulo.includes(' - ')) {
            const partes = titulo.split(' - ');
            artista = partes[0].trim();
            titulo  = partes.slice(1).join(' - ').trim();
        }
    } catch { /* yt-dlp no puede extraer info de Spotify sin auth válida */ }

    // 3. APIs de terceros para obtener título/artista y link de descarga directo
    const apis = [
        () => axios.get(`https://api.dorratz.com/v2/spotify-dl?url=${encodeURIComponent(url)}`, axiosOpts).then(r => r.data),
        () => axios.get(`https://api.siputzx.my.id/api/d/spotify?url=${encodeURIComponent(url)}`, axiosOpts).then(r => r.data),
        () => axios.get(`https://api.agatz.xyz/api/spotifydl?message=${encodeURIComponent(url)}`, axiosOpts).then(r => r.data),
    ];
    for (const fn of apis) {
        try {
            const data = await fn();
            const link = data?.data?.download || data?.data?.url || data?.result?.url || data?.url || data?.download;
            titulo  = data?.data?.title  || data?.result?.title  || data?.title  || titulo;
            artista = data?.data?.artist || data?.result?.artist || data?.artist || artista;
            if (link) {
                await sock.sendMessage(jid, { audio: { url: link }, mimetype: 'audio/mpeg' });
                await sock.sendMessage(jid, { text: `🎵 *${titulo || 'Canción'}*${artista ? `\n🎤 ${artista}` : ''}` });
                return;
            }
        } catch (e) { logRequestError('spotify api', e); }
    }

    // 4. Fallback YouTube: se ejecuta si tenemos título o artista de pasos anteriores.
    // Con la nueva extracción de metadatos (paso 2), esto corre en casi todos los casos.
    const ytQuery = titulo && artista ? `${titulo} ${artista}` : titulo || artista;
    if (ytQuery) {
        try {
            const query = ytQuery;
            const tmpBase = path.join(os.tmpdir(), `spyt_${Date.now()}`);
            const tmpMp3  = `${tmpBase}.mp3`;
            await ytdlpEjecutar([
                `ytsearch1:${query}`,
                '-x', '--audio-format', 'mp3', '--audio-quality', '5',
                '-o', `${tmpBase}.%(ext)s`,
                '--no-playlist', '--quiet', '--no-warnings',
                ...ytYoutubeArgsAudio(),
                ...(tieneCookiesReales() ? ['--cookies', YT_COOKIES_PATH] : [])
            ], 120000);
            if (fs.existsSync(tmpMp3)) {
                const buffer = await fs.readFile(tmpMp3);
                await sock.sendMessage(jid, { audio: buffer, mimetype: 'audio/mpeg' });
                await sock.sendMessage(jid, { text: `🎵 *${titulo}*${artista ? `\n🎤 ${artista}` : ''}\n_(vía YouTube)_` });
                await fs.remove(tmpMp3).catch(() => {});
                return;
            }
        } catch (e) { logRequestError('spotify yt fallback', e); }
    }

    await sock.sendMessage(jid, { text: '❌ No pude descargar de Spotify ahora.' });
}

// ════════════════════════════════════════════════════
//  SOUNDCLOUD
// ════════════════════════════════════════════════════
async function cmdSoundcloud(sock, jid, args) {
    const url = args[0];
    if (!url || !url.includes('soundcloud.com')) {
        await sock.sendMessage(jid, { text: '❌ Uso: *#soundcloud <link>*' });
        return;
    }
    await sock.sendMessage(jid, { text: '⏳ Descargando de SoundCloud...' });
    try {
        const info = await ytdlpInfo(url);
        const tmpBase = path.join(os.tmpdir(), `sc_${Date.now()}`);
        const tmpMp3 = `${tmpBase}.mp3`;
        await ytdlpEjecutar([
            url, '-x', '--audio-format', 'mp3', '--audio-quality', '5',
            '-o', `${tmpBase}.%(ext)s`, '--no-playlist', '--quiet', '--no-warnings',
            ...ytdlpHeadersArgs()
        ], 120000);
        const buffer = await fs.readFile(tmpMp3);
        await sock.sendMessage(jid, { audio: buffer, mimetype: 'audio/mpeg' });
        if (info.titulo) await sock.sendMessage(jid, { text: `🎧 *${info.titulo}*${info.autor ? `\n🎤 ${info.autor}` : ''}` });
        await fs.remove(tmpMp3).catch(() => {});
    } catch (err) {
        logRequestError('cmdSoundcloud', err);
        await sock.sendMessage(jid, { text: mensajeErrorDescarga(err, 'SoundCloud') });
    }
}

// ════════════════════════════════════════════════════
//  THREADS
// ════════════════════════════════════════════════════
async function cmdThreads(sock, jid, args) {
    const url = args[0];
    if (!url || (!url.includes('threads.net') && !url.includes('threads.com'))) {
        await sock.sendMessage(jid, { text: '❌ Uso: *#threads <link>*' });
        return;
    }
    await sock.sendMessage(jid, { text: '⏳ Descargando de Threads...' });
    const apis = [
        () => axios.get(`https://api.siputzx.my.id/api/d/threads?url=${encodeURIComponent(url)}`, axiosOpts).then(r => r.data),
        () => axios.get(`https://api.dorratz.com/threads?url=${encodeURIComponent(url)}`, axiosOpts).then(r => r.data),
    ];
    for (const fn of apis) {
        try {
            const data = await fn();
            const items = data?.data?.video_urls || data?.data?.image_urls || data?.video_urls || data?.image_urls || data?.result?.media || [];
            const lista = Array.isArray(items) ? items : (items ? [items] : []);
            if (lista.length) {
                for (const item of lista.slice(0, 4)) {
                    const u = typeof item === 'string' ? item : (item.url || item.video || item.image);
                    if (!u) continue;
                    if (/\.mp4($|\?)/i.test(u)) {
                        await sock.sendMessage(jid, { video: { url: u }, caption: '🧵 Threads' });
                    } else {
                        await sock.sendMessage(jid, { image: { url: u }, caption: '🧵 Threads' });
                    }
                }
                return;
            }
        } catch (e) { logRequestError('threads api', e); }
    }
    await sock.sendMessage(jid, { text: '❌ No pude descargar de Threads ahora.' });
}

// ════════════════════════════════════════════════════
//  APKPURE
// ════════════════════════════════════════════════════
async function cmdApkpure(sock, jid, args) {
    const query = args.join(' ');
    if (!query) {
        await sock.sendMessage(jid, { text: '❌ Uso: *#apk <nombre de la app>*' });
        return;
    }
    await sock.sendMessage(jid, { text: `⏳ Buscando *${query}* en APKPure...` });
    const apis = [
        () => axios.get(`https://api.siputzx.my.id/api/d/apkpure?search=${encodeURIComponent(query)}`, axiosOpts).then(r => r.data),
        () => axios.get(`https://api.dorratz.com/apkpure?search=${encodeURIComponent(query)}`, axiosOpts).then(r => r.data),
    ];
    for (const fn of apis) {
        try {
            const data = await fn();
            const item = data?.data?.[0] || data?.result?.[0] || data?.data || data?.result;
            const link = item?.download || item?.url || item?.dl;
            const nombre = item?.name || item?.title || query;
            if (link) {
                await sock.sendMessage(jid, { text: `📱 *${nombre}*\n🔗 ${link}` });
                try {
                    await sock.sendMessage(jid, { document: { url: link }, fileName: `${nombre}.apk`, mimetype: 'application/vnd.android.package-archive' });
                } catch (e) { logRequestError('apkpure send', e); }
                return;
            }
        } catch (e) { logRequestError('apkpure api', e); }
    }
    await sock.sendMessage(jid, { text: '❌ No encontré la app o las APIs están caídas.' });
}

// ════════════════════════════════════════════════════
//  GOOGLE DRIVE
// ════════════════════════════════════════════════════
async function cmdDrive(sock, jid, args) {
    const url = args[0];
    if (!url || !url.includes('drive.google.com')) {
        await sock.sendMessage(jid, { text: '❌ Uso: *#drive <link público>*' });
        return;
    }
    await sock.sendMessage(jid, { text: '⏳ Procesando link de Drive...' });
    const idMatch = url.match(/[-\w]{25,}/);
    if (!idMatch) {
        await sock.sendMessage(jid, { text: '❌ No pude extraer el ID del archivo del link.' });
        return;
    }
    const id = idMatch[0];
    const direct = `https://drive.google.com/uc?export=download&id=${id}`;
    try {
        await sock.sendMessage(jid, { document: { url: direct }, fileName: `drive_${id}`, mimetype: 'application/octet-stream' });
        await sock.sendMessage(jid, { text: `📁 *Google Drive*\n🔗 ${direct}` });
    } catch (e) {
        logRequestError('drive', e);
        await sock.sendMessage(jid, { text: `📁 *Google Drive*\n🔗 ${direct}\n\n_Si el archivo es muy grande o privado, descargalo del link directamente._` });
    }
}

module.exports = {
    cmdYoutube, cmdYoutubeAudio, cmdYoutubeSearch, cmdYoutubeVideoSearch,
    cmdTiktok, cmdTiktokAudio, cmdFacebook,
    cmdTwitter, cmdInstagram, cmdPinterest: async () => {}, cmdImagen,
    buscarImagenPinterest, cmdDiagnosticoDescargas,
    cmdMediafire, cmdSpotify, cmdSoundcloud, cmdThreads, cmdApkpure, cmdDrive
};
