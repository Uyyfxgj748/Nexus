const axios = require('axios');
const fs = require('fs-extra');
const path = require('path');
const os = require('os');
const AdmZip = require('adm-zip');
const { execFile } = require('child_process');
const { promisify } = require('util');

const execFileAsync = promisify(execFile);
const YTDLP = 'yt-dlp';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36';
const HUMAN_HEADERS = {
    'User-Agent': UA,
    'Accept': '*/*',
    'Accept-Language': 'en-US,en;q=0.9',
    'Referer': 'https://www.google.com/'
};
const axiosOpts = { timeout: 25000, headers: HUMAN_HEADERS };

function logRequestError(contexto, err) {
    const txt = String(err?.message || err?.response?.data || '').toLowerCase();
    if (err?.response?.status === 429 || txt.includes('rate-overlimit') || txt.includes('too many requests') || txt.includes('overlimit')) return;
    console.error('ERROR:', contexto, err.response?.status || '', err.message);
}

function ytdlpHeadersArgs() {
    return [
        '--add-header', `User-Agent:${UA}`,
        '--add-header', 'Accept-Language:en-US,en;q=0.9'
    ];
}

function extraerErrorYtdlp(err) {
    const txt = (err.stderr || err.stdout || err.message || '').toString();
    const linea = txt.split('\n').find(l => l.includes('ERROR:'));
    if (linea) return linea.replace('ERROR:', '').replace(/\[.*?\]/g, '').trim();
    return 'No se pudo descargar el contenido.';
}

async function ytdlpEjecutar(args, timeout = 180000) {
    return execFileAsync(YTDLP, args, { timeout, maxBuffer: 400 * 1024 * 1024 });
}

async function ytdlpDescargarVideo(url, prefijo) {
    const tmpBase = path.join(os.tmpdir(), `${prefijo}_${Date.now()}`);
    const tmpOut = `${tmpBase}.mp4`;
    await ytdlpEjecutar([
        url,
        '-f', 'mp4/best',
        '--merge-output-format', 'mp4',
        '-o', `${tmpBase}.%(ext)s`,
        '--no-playlist', '--quiet', '--no-warnings',
        ...ytdlpHeadersArgs()
    ]);
    let archivo = tmpOut;
    if (!await fs.pathExists(archivo)) {
        // yt-dlp pudo haber elegido otra extensión
        const dir = path.dirname(tmpBase);
        const base = path.basename(tmpBase);
        const candidatos = (await fs.readdir(dir)).filter(f => f.startsWith(base));
        if (candidatos.length) archivo = path.join(dir, candidatos[0]);
    }
    const buffer = await fs.readFile(archivo);
    await fs.remove(archivo).catch(() => {});
    return buffer;
}

async function ytdlpInfo(url) {
    try {
        const { stdout } = await ytdlpEjecutar([
            url, '--dump-single-json', '--no-warnings', '--quiet',
            '--no-playlist', ...ytdlpHeadersArgs()
        ], 60000);
        return JSON.parse(stdout);
    } catch { return {}; }
}

// ════════════════════════════════════════════════════
//  NHENTAI
// ════════════════════════════════════════════════════
const NH_EXT_MAP = { j: 'jpg', p: 'png', g: 'gif', w: 'webp' };

async function nhentaiObtenerGaleria(id) {
    const intentos = [
        async () => {
            const res = await axios.get(`https://nhentai.net/api/gallery/${id}`, axiosOpts);
            const g = res.data;
            if (!g?.media_id || !g?.images?.pages) return null;
            const titulo = g.title?.pretty || g.title?.english || g.title?.japanese || `Doujin ${id}`;
            const paginas = g.images.pages.map((p, i) => {
                const ext = NH_EXT_MAP[p.t] || 'jpg';
                return `https://i.nhentai.net/galleries/${g.media_id}/${i + 1}.${ext}`;
            });
            return { titulo, paginas, fuente: 'nhentai.net' };
        },
        async () => {
            const res = await axios.get(`https://api.siputzx.my.id/api/d/nhentai?id=${id}`, axiosOpts);
            const d = res.data?.data || res.data?.result || res.data;
            const paginas = d?.images || d?.pages || d?.image_urls || [];
            if (!paginas?.length) return null;
            return { titulo: d.title || `Doujin ${id}`, paginas, fuente: 'siputzx' };
        },
        async () => {
            const res = await axios.get(`https://nhentai.xxx/api/gallery/${id}`, axiosOpts);
            const g = res.data;
            if (!g?.images) return null;
            const paginas = (g.images.pages || []).map((p, i) => {
                const ext = NH_EXT_MAP[p.t] || 'jpg';
                return `https://cdn.nhentai.xxx/g/${g.media_id || id}/${i + 1}.${ext}`;
            });
            if (!paginas.length) return null;
            return { titulo: g.title?.pretty || `Doujin ${id}`, paginas, fuente: 'nhentai.xxx' };
        }
    ];
    for (const fn of intentos) {
        try { const g = await fn(); if (g) return g; }
        catch (e) { logRequestError('nhentai api', e); }
    }
    return null;
}

async function descargarPaginas(urls, max = 60) {
    const lista = urls.slice(0, max);
    const buffers = [];
    for (const u of lista) {
        try {
            const res = await axios.get(u, {
                responseType: 'arraybuffer',
                timeout: 25000,
                headers: { ...HUMAN_HEADERS, Referer: new URL(u).origin + '/' }
            });
            buffers.push({ url: u, data: Buffer.from(res.data) });
        } catch (e) { logRequestError('descargar pag', e); }
    }
    return buffers;
}

function empaquetarZip(paginas, nombre) {
    const zip = new AdmZip();
    paginas.forEach((p, i) => {
        const ext = (p.url.match(/\.([a-z0-9]+)(?:\?|$)/i)?.[1] || 'jpg').toLowerCase();
        const num = String(i + 1).padStart(3, '0');
        zip.addFile(`${num}.${ext}`, p.data);
    });
    return zip.toBuffer();
}

async function cmdNhentai(sock, jid, args) {
    const id = (args[0] || '').replace(/[^\d]/g, '');
    if (!id) {
        await sock.sendMessage(jid, { text: '❌ Uso: *#nhentai <ID>*\nEjemplo: *#nh 177013*' });
        return;
    }
    await sock.sendMessage(jid, { text: `🔞 Descargando doujin *#${id}* de nhentai... ⏳` });
    const gal = await nhentaiObtenerGaleria(id);
    if (!gal) {
        await sock.sendMessage(jid, { text: `❌ No pude obtener el doujin *#${id}*. Puede no existir o las APIs estar caídas.` });
        return;
    }
    await sock.sendMessage(jid, {
        text: `📚 *${gal.titulo}*\n📄 ${gal.paginas.length} páginas — descargando...`
    });
    const buffers = await descargarPaginas(gal.paginas, 80);
    if (!buffers.length) {
        await sock.sendMessage(jid, { text: `❌ No pude bajar las imágenes del doujin (puede haber bloqueo de IP).` });
        return;
    }
    try {
        const zipBuf = empaquetarZip(buffers, `${id}`);
        const limpioTitulo = gal.titulo.replace(/[^\w\s\-]/g, '').slice(0, 60).trim() || `nhentai_${id}`;
        await sock.sendMessage(jid, {
            document: zipBuf,
            fileName: `${limpioTitulo}_${id}.zip`,
            mimetype: 'application/zip',
            caption: `🔞 *nhentai #${id}*\n📚 ${gal.titulo}\n📄 ${buffers.length}/${gal.paginas.length} páginas\n🌐 ${gal.fuente}`
        });
    } catch (e) {
        logRequestError('nhentai zip', e);
        await sock.sendMessage(jid, { text: `❌ Error empaquetando el doujin: ${e.message}` });
    }
}

// ════════════════════════════════════════════════════
//  HITOMI.LA
// ════════════════════════════════════════════════════
async function hitomiObtenerGaleria(input) {
    const id = (input.match(/(\d{5,})/) || [])[1];
    if (!id) return null;
    const intentos = [
        async () => {
            const res = await axios.get(`https://api.siputzx.my.id/api/d/hitomi?id=${id}`, axiosOpts);
            const d = res.data?.data || res.data?.result || res.data;
            const paginas = d?.images || d?.pages || d?.urls || [];
            if (!paginas?.length) return null;
            return { titulo: d.title || `Hitomi ${id}`, paginas, fuente: 'siputzx' };
        },
        async () => {
            const res = await axios.get(`https://api.dorratz.com/hitomi?id=${id}`, axiosOpts);
            const d = res.data?.data || res.data?.result || res.data;
            const paginas = d?.images || d?.pages || d?.urls || [];
            if (!paginas?.length) return null;
            return { titulo: d.title || `Hitomi ${id}`, paginas, fuente: 'dorratz' };
        },
        async () => {
            // Hitomi galleryblock como fallback (sin imágenes pero confirma existencia)
            const res = await axios.get(`https://ltn.hitomi.la/galleries/${id}.js`, axiosOpts);
            const m = res.data.match(/var galleryinfo = (\{.*?\});?\s*$/s);
            if (!m) return null;
            const info = JSON.parse(m[1]);
            const paginas = (info.files || []).map(f => `https://ltn.hitomi.la/galleries/${id}/${f.name}`);
            if (!paginas.length) return null;
            return { titulo: info.title || `Hitomi ${id}`, paginas, fuente: 'hitomi.la' };
        }
    ];
    for (const fn of intentos) {
        try { const g = await fn(); if (g) return g; }
        catch (e) { logRequestError('hitomi api', e); }
    }
    return null;
}

async function cmdHitomi(sock, jid, args) {
    const input = (args[0] || '').trim();
    if (!input) {
        await sock.sendMessage(jid, { text: '❌ Uso: *#hitomi <ID o link>*\nEjemplo: *#hitomi 1234567* o *#hitomila https://hitomi.la/galleries/1234567.html*' });
        return;
    }
    await sock.sendMessage(jid, { text: `🔞 Buscando galería en *Hitomi.la*... ⏳` });
    const gal = await hitomiObtenerGaleria(input);
    if (!gal) {
        await sock.sendMessage(jid, { text: '❌ No pude obtener esa galería de Hitomi (las APIs públicas pueden estar caídas).' });
        return;
    }
    await sock.sendMessage(jid, { text: `📚 *${gal.titulo}*\n📄 ${gal.paginas.length} páginas — descargando...` });
    const buffers = await descargarPaginas(gal.paginas, 60);
    if (!buffers.length) {
        await sock.sendMessage(jid, { text: '❌ No pude descargar las imágenes (Hitomi suele bloquear hostings).' });
        return;
    }
    const zipBuf = empaquetarZip(buffers, 'hitomi');
    const titulo = gal.titulo.replace(/[^\w\s\-]/g, '').slice(0, 60).trim() || 'hitomi';
    await sock.sendMessage(jid, {
        document: zipBuf,
        fileName: `${titulo}.zip`,
        mimetype: 'application/zip',
        caption: `🔞 *Hitomi.la*\n📚 ${gal.titulo}\n📄 ${buffers.length}/${gal.paginas.length} páginas\n🌐 ${gal.fuente}`
    });
}

// ════════════════════════════════════════════════════
//  VERMANGASPORNO
// ════════════════════════════════════════════════════
async function vmpObtenerGaleria(input) {
    const url = input.startsWith('http') ? input : `https://vermangasporno.com/${input}`;
    const intentos = [
        async () => {
            const res = await axios.get(`https://api.siputzx.my.id/api/d/vermangasporno?url=${encodeURIComponent(url)}`, axiosOpts);
            const d = res.data?.data || res.data?.result || res.data;
            const paginas = d?.images || d?.pages || d?.urls || [];
            if (!paginas?.length) return null;
            return { titulo: d.title || 'VerMangasPorno', paginas, fuente: 'siputzx' };
        },
        async () => {
            const res = await axios.get(`https://api.dorratz.com/vermangasporno?url=${encodeURIComponent(url)}`, axiosOpts);
            const d = res.data?.data || res.data?.result || res.data;
            const paginas = d?.images || d?.pages || d?.urls || [];
            if (!paginas?.length) return null;
            return { titulo: d.title || 'VerMangasPorno', paginas, fuente: 'dorratz' };
        },
        async () => {
            // Scraping directo: vermangasporno usa <img class="img-responsive"... data-src="...">
            const res = await axios.get(url, axiosOpts);
            const html = res.data;
            const titulo = (html.match(/<title>([^<]+)<\/title>/) || [])[1]?.trim() || 'VerMangasPorno';
            const regex = /(?:data-src|src)="(https?:\/\/[^"]+\.(?:jpg|jpeg|png|webp))"/gi;
            const paginas = [...html.matchAll(regex)].map(m => m[1])
                .filter(u => /vermangasporno|wp-content|uploads|cdn/i.test(u));
            if (!paginas.length) return null;
            return { titulo: titulo.replace(/\s*-\s*Ver Mangas Porno.*$/i, ''), paginas, fuente: 'scrape' };
        }
    ];
    for (const fn of intentos) {
        try { const g = await fn(); if (g) return g; }
        catch (e) { logRequestError('vmp api', e); }
    }
    return null;
}

async function cmdVermangasporno(sock, jid, args) {
    const input = (args[0] || '').trim();
    if (!input) {
        await sock.sendMessage(jid, { text: '❌ Uso: *#vmp <URL del manga>*\nEjemplo: *#vermangasporno https://vermangasporno.com/manga-xx*' });
        return;
    }
    await sock.sendMessage(jid, { text: '🔞 Procesando manga de *VerMangasPorno*... ⏳' });
    const gal = await vmpObtenerGaleria(input);
    if (!gal) {
        await sock.sendMessage(jid, { text: '❌ No pude obtener el manga (las APIs/sitio pueden estar caídos).' });
        return;
    }
    await sock.sendMessage(jid, { text: `📚 *${gal.titulo}*\n📄 ${gal.paginas.length} páginas — descargando...` });
    const buffers = await descargarPaginas(gal.paginas, 80);
    if (!buffers.length) {
        await sock.sendMessage(jid, { text: '❌ No pude descargar las imágenes.' });
        return;
    }
    const zipBuf = empaquetarZip(buffers, 'vmp');
    const titulo = gal.titulo.replace(/[^\w\s\-]/g, '').slice(0, 60).trim() || 'vermangasporno';
    await sock.sendMessage(jid, {
        document: zipBuf,
        fileName: `${titulo}.zip`,
        mimetype: 'application/zip',
        caption: `🔞 *VerMangasPorno*\n📚 ${gal.titulo}\n📄 ${buffers.length}/${gal.paginas.length} páginas\n🌐 ${gal.fuente}`
    });
}

// ════════════════════════════════════════════════════
//  XNXX
// ════════════════════════════════════════════════════
async function cmdXnxx(sock, jid, args) {
    const url = (args[0] || '').trim();
    if (!url || !/xnxx\.com/.test(url)) {
        await sock.sendMessage(jid, { text: '❌ Uso: *#xnxx <link>*\nEjemplo: *#xnxx https://www.xnxx.com/video-xxxxxxx/...*' });
        return;
    }
    await sock.sendMessage(jid, { text: '🔞 Descargando vídeo de *XNXX*... ⏳' });
    try {
        const info = await ytdlpInfo(url);
        const buffer = await ytdlpDescargarVideo(url, 'xnxx');
        const titulo = info.title ? `🔞 *XNXX*\n🎬 ${info.title}` : '🔞 *XNXX*';
        await sock.sendMessage(jid, { video: buffer, mimetype: 'video/mp4', caption: titulo });
    } catch (err) {
        logRequestError('cmdXnxx', err);
        await sock.sendMessage(jid, { text: `❌ Error XNXX: ${extraerErrorYtdlp(err)}` });
    }
}

// ════════════════════════════════════════════════════
//  PORNHUB
// ════════════════════════════════════════════════════
async function cmdPornhub(sock, jid, args) {
    const url = (args[0] || '').trim();
    if (!url || !/pornhub\.com/.test(url)) {
        await sock.sendMessage(jid, { text: '❌ Uso: *#pornhub <link>*\nEjemplo: *#ph https://www.pornhub.com/view_video.php?viewkey=xxxxx*' });
        return;
    }
    await sock.sendMessage(jid, { text: '🔞 Descargando vídeo de *Pornhub*... ⏳' });
    try {
        const info = await ytdlpInfo(url);
        const buffer = await ytdlpDescargarVideo(url, 'ph');
        const titulo = info.title ? `🔞 *Pornhub*\n🎬 ${info.title}` : '🔞 *Pornhub*';
        await sock.sendMessage(jid, { video: buffer, mimetype: 'video/mp4', caption: titulo });
    } catch (err) {
        logRequestError('cmdPornhub', err);
        await sock.sendMessage(jid, { text: `❌ Error Pornhub: ${extraerErrorYtdlp(err)}` });
    }
}

const TODO_NSFW_DOWNLOADS = ['hitomila', 'hitomi', 'nhentai', 'nh', 'nhdl', 'vermangasporno', 'vmp', 'xnxx', 'pornhub', 'ph'];

module.exports = {
    cmdHitomi, cmdNhentai, cmdVermangasporno, cmdXnxx, cmdPornhub,
    TODO_NSFW_DOWNLOADS
};
