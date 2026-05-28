const { downloadContentFromMessage } = require('@whiskeysockets/baileys');
const sharp = require('sharp');
const axios = require('axios');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('@ffmpeg-installer/ffmpeg').path;
const fs = require('fs-extra');
const path = require('path');
const os = require('os');
const { Sticker, StickerTypes } = require('wa-sticker-formatter');

ffmpeg.setFfmpegPath(ffmpegPath);

const CANAL_NEXUS = 'https://whatsapp.com/channel/0029Vb7MdipBqbrEwYtefB21';

// ── Caché de resultados de búsqueda (punto 9) ─────────────────────────────
const _searchCache = new Map();
const CACHE_TTL = 3 * 60 * 1000; // 3 minutos

function cacheGet(key) {
    const entry = _searchCache.get(key);
    if (!entry) return null;
    if (Date.now() - entry.ts > CACHE_TTL) { _searchCache.delete(key); return null; }
    return entry.val;
}
function cacheSet(key, val) {
    if (_searchCache.size > 200) {
        const oldest = _searchCache.keys().next().value;
        _searchCache.delete(oldest);
    }
    _searchCache.set(key, { val, ts: Date.now() });
}

// ── Retry genérico ────────────────────────────────────────────────────────
async function conReintentos(fn, intentos = 3, delayMs = 800) {
    let ultimoErr;
    for (let i = 0; i < intentos; i++) {
        try { return await fn(); } catch (e) {
            ultimoErr = e;
            if (esRateLimitError(e)) throw e;
            if (i < intentos - 1) await new Promise(r => setTimeout(r, delayMs * (i + 1)));
        }
    }
    throw ultimoErr;
}

// ══════════════════════════════════════════
//  AÑADIR METADATA EXIF AL WEBP
// ══════════════════════════════════════════
async function inyectarExif(webpBuffer, pushName) {
    try {
        const usuarioTxt = pushName || 'Anónimo';

        const ahora  = new Date();
        const fecha  = ahora.toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit', year: 'numeric' });
        const hora   = ahora.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });

        const pack   = `⚡ N E X U S  B O T ⚡\n· · · · · · · · · · · · ·\n♛ Usuario: ${usuarioTxt}`;
        const author = `📅 Fecha: ${fecha}\n🕐 Hora: ${hora}\n· · · · · · · · · · · · ·\n© powered by Alejx h`;

        const sticker = new Sticker(webpBuffer, {
            pack,
            author,
            type: StickerTypes.FULL,
            quality: 80,
        });
        return await sticker.toBuffer();
    } catch (e) {
        console.error('Fallo EXIF sticker:', e.message);
        return webpBuffer;
    }
}

// ══════════════════════════════════════════
//  CONVERSIÓN DE IMAGEN A WEBP (cuadrado 512×512 — para #ss)
// ══════════════════════════════════════════
async function imagenAWebp(buffer) {
    const meta = await sharp(buffer).metadata();
    const w = meta.width || 1;
    const h = meta.height || 1;
    const ratio = Math.max(w, h) / Math.min(w, h);

    if (ratio > 2.2) {
        return await sharp(buffer)
            .resize(512, 512, {
                fit: 'contain',
                background: { r: 0, g: 0, b: 0, alpha: 0 }
            })
            .webp({ quality: 85 })
            .toBuffer();
    }

    return await sharp(buffer)
        .resize(512, 512, {
            fit: 'cover',
            position: 'centre'
        })
        .webp({ quality: 85 })
        .toBuffer();
}

// ══════════════════════════════════════════
//  CONVERSIÓN DE IMAGEN A WEBP (tamaño completo — para #s)
//  Respeta las proporciones originales sin recortar ni añadir bordes.
//  El lado más largo queda en 512 px.
// ══════════════════════════════════════════
async function imagenAWebpFull(buffer) {
    return await sharp(buffer)
        .resize(512, 512, {
            fit: 'inside',
            withoutEnlargement: false
        })
        .webp({ quality: 85 })
        .toBuffer();
}

// ══════════════════════════════════════════
//  CONVERSIÓN DE VIDEO/GIF A WEBP ANIMADO
// ══════════════════════════════════════════
async function videoAWebpAnimado(inputBuffer, extension = 'mp4') {
    const tmpDir = os.tmpdir();
    const inputPath = path.join(tmpDir, `stk_in_${Date.now()}.${extension}`);
    const outputPath = path.join(tmpDir, `stk_out_${Date.now()}.webp`);

    await fs.writeFile(inputPath, inputBuffer);

    return new Promise((resolve, reject) => {
        ffmpeg(inputPath)
            .outputOptions([
                '-vcodec', 'libwebp',
                '-vf', 'fps=15,scale=512:512:force_original_aspect_ratio=increase,crop=512:512',
                '-loop', '0',
                '-preset', 'default',
                '-an',
                '-vsync', '0',
                '-t', '00:00:05'
            ])
            .toFormat('webp')
            .on('end', async () => {
                try {
                    const result = await fs.readFile(outputPath);
                    await fs.remove(inputPath).catch(() => {});
                    await fs.remove(outputPath).catch(() => {});
                    resolve(result);
                } catch (e) { reject(e); }
            })
            .on('error', async (err) => {
                await fs.remove(inputPath).catch(() => {});
                await fs.remove(outputPath).catch(() => {});
                reject(err);
            })
            .save(outputPath);
    });
}

// ══════════════════════════════════════════
//  DESCARGAR CONTENIDO DE MENSAJE
// ══════════════════════════════════════════
async function getBuffer(msgContent, type) {
    if (!msgContent) throw new Error('Mensaje vacío');
    const stream = await downloadContentFromMessage(msgContent, type);
    let buffer = Buffer.from([]);
    for await (const chunk of stream) {
        buffer = Buffer.concat([buffer, chunk]);
    }
    return buffer;
}

function esRateLimitError(err) {
    const txt = String(err?.message || err?.response?.data || err?.stderr || err?.stdout || '').toLowerCase();
    return txt.includes('rate-overlimit') || txt.includes('429') || txt.includes('too many requests') || txt.includes('overlimit');
}

// ══════════════════════════════════════════
//  CREAR STICKER
// ══════════════════════════════════════════
async function cmdSticker(sock, jid, msg, pushName) {
    try {
        const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;

        let buffer = null;
        let esVideo = false;

        if (msg.message?.imageMessage) {
            buffer = await getBuffer(msg.message.imageMessage, 'image');
            esVideo = false;
        } else if (msg.message?.videoMessage) {
            buffer = await getBuffer(msg.message.videoMessage, 'video');
            esVideo = true;
        } else if (quoted?.imageMessage) {
            buffer = await getBuffer(quoted.imageMessage, 'image');
            esVideo = false;
        } else if (quoted?.videoMessage) {
            buffer = await getBuffer(quoted.videoMessage, 'video');
            esVideo = true;
        } else if (quoted?.stickerMessage) {
            buffer = await getBuffer(quoted.stickerMessage, 'sticker');
            esVideo = false;
        }

        if (!buffer) {
            await sock.sendMessage(jid, {
                text: '❌ Envía o responde a una *imagen* o *video* para crear el sticker.\n\n📌 Modos:\n• Envía imagen + *#sticker*\n• Responde a imagen/video con *#sticker*'
            });
            return;
        }

        await sock.sendMessage(jid, { text: '⚙️ Creando sticker...' });

        let stickerBuffer;
        if (esVideo) {
            stickerBuffer = await videoAWebpAnimado(buffer, 'mp4');
        } else {
            stickerBuffer = await imagenAWebpFull(buffer);
        }

        const finalBuf = await inyectarExif(stickerBuffer, pushName);
        await sock.sendMessage(jid, { sticker: finalBuf });

    } catch (e) {
        console.error('Error creando sticker:', e.message);
        const aviso = esRateLimitError(e)
            ? '⚠️ El servicio de stickers está saturado ahora mismo. Intenta de nuevo en un momento.'
            : '❌ Error al crear el sticker. Intenta con otra imagen.';
        await sock.sendMessage(jid, { text: aviso });
    }
}

// ══════════════════════════════════════════
//  MAPAS para #again y #ss
//  ssMap: messageId → { query, tipo }
//  lastSearch: jid → { query, tipo }   (fallback para #again sin reply exacto)
// ══════════════════════════════════════════
const ssMap = new Map();
const lastSearch = new Map(); // por grupo jid
// ══════════════════════════════════════════
//  SISTEMA 1: Giphy + Tenor (en paralelo)
// ══════════════════════════════════════════
async function buscarSistema1(query, buscarAnimado) {
    const offsetPage  = Math.floor(Math.random() * 5);
    const offsetTenor = Math.floor(Math.random() * 50);
    const candidatos  = [];

    const tareas = [];

    if (buscarAnimado) {
        // Giphy GIFs
        tareas.push(axios.get(
            `https://api.giphy.com/v1/gifs/search?api_key=dc6zaTOxFJmzC&q=${encodeURIComponent(query)}&limit=50&offset=${offsetPage * 25}&rating=pg-13`,
            { timeout: 10000 }
        ).then(res => {
            for (const r of (res.data?.data || [])) {
                const u = r.images?.original?.url || r.images?.fixed_height?.url;
                if (u) candidatos.push(u);
            }
        }).catch(() => {}));

        // Tenor v2
        tareas.push(axios.get(
            `https://tenor.googleapis.com/v2/search?q=${encodeURIComponent(query)}&key=AIzaSyAyimkuYQYF_FXVALexPuGQctUWRURdCYQ&limit=50&pos=${offsetTenor}`,
            { timeout: 10000 }
        ).then(res => {
            for (const r of (res.data?.results || [])) {
                const u = r.media_formats?.gif?.url || r.media_formats?.mediumgif?.url || r.media_formats?.tinygif?.url;
                if (u) candidatos.push(u);
            }
        }).catch(() => {}));

        // Tenor v1 (fallback)
        tareas.push(axios.get(
            `https://g.tenor.com/v1/search?q=${encodeURIComponent(query)}&key=LIVDSRZULELA&limit=50&pos=${offsetTenor}&media_filter=minimal`,
            { timeout: 10000 }
        ).then(res => {
            for (const r of (res.data?.results || [])) {
                const u = r.media?.[0]?.gif?.url;
                if (u) candidatos.push(u);
            }
        }).catch(() => {}));

        // nekos.best (anime)
        const terminosAnime = ['hug','kiss','pat','slap','dance','cry','laugh','wave','blush','bite','bored','cuddle','feed','happy','highfive','lurk','nod','nope','peck','poke','pout','punch','shoot','shrug','smile','smug','stare','think','thumbsup','tickle','wink','yawn','yeet'];
        const matchAnime = terminosAnime.find(t => query.toLowerCase().includes(t));
        if (matchAnime) {
            for (let i = 0; i < 3; i++) {
                tareas.push(axios.get(`https://nekos.best/api/v2/${matchAnime}`, { timeout: 8000 })
                    .then(res => { const u = res.data?.results?.[0]?.url; if (u) candidatos.push(u); })
                    .catch(() => {}));
            }
        }

        // waifu.pics SFW (anime)
        const wfTerms = { hug:'hug', kiss:'kiss', pat:'pat', slap:'slap', cry:'cry', dance:'dance', smile:'smile', wave:'wave', wink:'wink', cuddle:'cuddle', poke:'poke', highfive:'highfive', bonk:'bonk', happy:'happy', glomp:'glomp', yeet:'yeet', kill:'kill' };
        const k = Object.keys(wfTerms).find(t => query.toLowerCase().includes(t));
        if (k) {
            for (let i = 0; i < 2; i++) {
                tareas.push(axios.get(`https://api.waifu.pics/sfw/${wfTerms[k]}`, { timeout: 8000 })
                    .then(res => { if (res.data?.url) candidatos.push(res.data.url); })
                    .catch(() => {}));
            }
        }
    } else {
        // ESTÁTICOS — Giphy Stickers
        tareas.push(axios.get(
            `https://api.giphy.com/v1/stickers/search?api_key=dc6zaTOxFJmzC&q=${encodeURIComponent(query)}&limit=50&offset=${offsetPage * 25}&rating=pg-13`,
            { timeout: 10000 }
        ).then(res => {
            for (const r of (res.data?.data || [])) {
                const u = r.images?.fixed_height_still?.url || r.images?.original_still?.url || r.images?.fixed_height?.url;
                if (u) candidatos.push(u);
            }
        }).catch(() => {}));

        // Tenor v2 estático
        tareas.push(axios.get(
            `https://tenor.googleapis.com/v2/search?q=${encodeURIComponent(query)}&key=AIzaSyAyimkuYQYF_FXVALexPuGQctUWRURdCYQ&limit=50&pos=${offsetTenor}`,
            { timeout: 10000 }
        ).then(res => {
            for (const r of (res.data?.results || [])) {
                const u = r.media_formats?.gifpreview?.url || r.media_formats?.tinygifpreview?.url || r.media_formats?.gif?.url;
                if (u) candidatos.push(u);
            }
        }).catch(() => {}));

        // Tenor v1 estático
        tareas.push(axios.get(
            `https://g.tenor.com/v1/search?q=${encodeURIComponent(query)}&key=LIVDSRZULELA&limit=50&pos=${offsetTenor}&media_filter=minimal`,
            { timeout: 10000 }
        ).then(res => {
            for (const r of (res.data?.results || [])) {
                const u = r.media?.[0]?.tinygif?.url || r.media?.[0]?.gif?.url;
                if (u) candidatos.push(u);
            }
        }).catch(() => {}));
    }

    await Promise.allSettled(tareas);
    return candidatos;
}

// ══════════════════════════════════════════
//  SISTEMA 2: Reddit (API pública, sin clave)
// ══════════════════════════════════════════
async function buscarSistema2(query, buscarAnimado) {
    const candidatos = [];
    const subreddits = buscarAnimado
        ? ['gifs', 'AnimatedEmoji', 'animegifs', 'reactiongifs', 'HighQualityGifs']
        : ['stickers', 'memes', 'aww', 'pics', 'me_irl'];

    const sub = subreddits[Math.floor(Math.random() * subreddits.length)];
    const sort = ['relevance', 'top', 'new'][Math.floor(Math.random() * 3)];

    const tareas = subreddits.map(s =>
        axios.get(
            `https://www.reddit.com/r/${s}/search.json?q=${encodeURIComponent(query)}&restrict_sr=1&sort=${sort}&limit=25&t=all`,
            { timeout: 10000, headers: { 'User-Agent': 'NexusBot/2.0' } }
        ).then(res => {
            for (const post of (res.data?.data?.children || [])) {
                const d = post.data;
                if (d.url && (d.url.endsWith('.gif') || d.url.endsWith('.gifv') || d.url.includes('i.imgur.com') || d.url.includes('i.redd.it'))) {
                    const u = d.url.replace('.gifv', '.gif');
                    candidatos.push(u);
                }
                const preview = d.preview?.images?.[0]?.source?.url;
                if (!buscarAnimado && preview) {
                    candidatos.push(preview.replace(/&amp;/g, '&'));
                }
            }
        }).catch(() => {})
    );

    await Promise.allSettled(tareas);
    return candidatos;
}

// ══════════════════════════════════════════
//  BUSCAR URL: lanza ambos sistemas en paralelo + caché
// ══════════════════════════════════════════
async function buscarGifUrl(query, buscarAnimado) {
    const cacheKey = `${buscarAnimado ? 'A' : 'F'}:${query.toLowerCase()}`;
    const cached = cacheGet(cacheKey);
    if (cached && cached.length) {
        return cached[Math.floor(Math.random() * cached.length)];
    }

    const [lista1, lista2] = await Promise.all([
        buscarSistema1(query, buscarAnimado),
        buscarSistema2(query, buscarAnimado),
    ]);

    const candidatos = [...lista1, ...lista2];
    if (candidatos.length) cacheSet(cacheKey, candidatos);
    if (!candidatos.length) return null;
    return candidatos[Math.floor(Math.random() * candidatos.length)];
}

// ══════════════════════════════════════════
//  ENVIAR UN STICKER A PARTIR DE URL (con reintentos)
// ══════════════════════════════════════════
async function enviarStickerDesdeUrl(sock, jid, gifUrl, buscarAnimado) {
    return conReintentos(async () => {
        const gifRes = await axios.get(gifUrl, { responseType: 'arraybuffer', timeout: 30000 });
        const buffer = Buffer.from(gifRes.data);
        if (buffer.length < 500) throw new Error('Buffer de imagen vacío o inválido');
        const contentType = gifRes.headers['content-type'] || '';
        const esGif = gifUrl.toLowerCase().includes('.gif') || contentType.includes('gif');

        if (buscarAnimado && esGif) {
            return await videoAWebpAnimado(buffer, 'gif');
        } else {
            return await imagenAWebp(buffer);
        }
    }, 2, 600);
}

// ══════════════════════════════════════════
//  BUSCAR STICKER (con tipo: foto | animado)
//  Soporta cantidad: #ss A3 gato | #ss F2 cat | #ss 5 anime
// ══════════════════════════════════════════
async function cmdStickerSearch(sock, jid, args, repliedMsgId = null) {
    let query, tipo;
    let cantidad = 1;

    // Modo #again: recuperar búsqueda anterior
    if (repliedMsgId) {
        const prev = ssMap.get(repliedMsgId) || lastSearch.get(jid);
        if (!prev) {
            await sock.sendMessage(jid, { text: '❌ No encontré una búsqueda previa. Usa *#ss [búsqueda]* primero.' });
            return;
        }
        query = prev.query;
        tipo = prev.tipo;
        cantidad = 1;
    } else {
        // Parsear prefijo de tipo y cantidad: A3, F2, E1, etc.
        const primero = (args[0] || '').toUpperCase();
        const matchTipoCant = primero.match(/^([AFE])(\d+)?$/);
        const matchSoloCant = primero.match(/^(\d+)$/);

        if (matchTipoCant) {
            const t = matchTipoCant[1];
            tipo = t === 'F' ? 'foto' : 'animado';
            cantidad = Math.min(parseInt(matchTipoCant[2] || '1'), 5);
            query = args.slice(1).join(' ');
        } else if (matchSoloCant) {
            tipo = 'animado';
            cantidad = Math.min(parseInt(matchSoloCant[1]), 5);
            query = args.slice(1).join(' ');
        } else {
            // Compatibilidad con formato antiguo: primer arg puede ser 'foto'/'animado'
            const primeroLC = (args[0] || '').toLowerCase();
            if (primeroLC === 'foto' || primeroLC === 'animado') {
                tipo = primeroLC;
                query = args.slice(1).join(' ');
            } else {
                tipo = 'animado';
                query = args.join(' ');
            }
        }

        if (!query) {
            await sock.sendMessage(jid, {
                text: '❌ Uso:\n' +
                    '• *#ss [búsqueda]* — 1 sticker animado\n' +
                    '• *#ss A[n] [búsqueda]* — n stickers animados (máx 5)\n' +
                    '• *#ss F[n] [búsqueda]* — n stickers estáticos (máx 5)\n' +
                    '• *#ss foto [búsqueda]* — Sticker estático\n\n' +
                    'Ejemplo: *#ss A3 gato* · *#ss F2 anime* · *#ss 5 perro*\n\n' +
                    '_Responde cualquier sticker con *#again* para obtener uno diferente._'
            });
            return;
        }
    }

    const buscarAnimado = tipo !== 'foto';
    const tipoLabel = buscarAnimado ? 'animado' : 'estático';
    await sock.sendMessage(jid, { text: `🔍 Buscando *${cantidad}* sticker${cantidad > 1 ? 's' : ''} ${tipoLabel}: *${query}*...` });

    // Guardar búsqueda como última (para #again sin reply exacto)
    lastSearch.set(jid, { query, tipo });

    let enviados = 0;
    for (let i = 0; i < cantidad; i++) {
        try {
            const gifUrl = await buscarGifUrl(query, buscarAnimado);
            if (!gifUrl) {
                if (i === 0) await sock.sendMessage(jid, { text: `❌ No encontré stickers para: *${query}*` });
                break;
            }
            const stickerBuffer = await enviarStickerDesdeUrl(sock, jid, gifUrl, buscarAnimado);
            const finalBuf = await inyectarExif(stickerBuffer, query);
            const sentMsg = await sock.sendMessage(jid, { sticker: finalBuf });

            // Guardar en ssMap por ID del mensaje enviado
            if (sentMsg?.key?.id) {
                ssMap.set(sentMsg.key.id, { query, tipo });
                if (ssMap.size > 300) {
                    const first = ssMap.keys().next().value;
                    ssMap.delete(first);
                }
            }
            enviados++;
        } catch (e) {
            console.error('Error convirtiendo sticker:', e.message);
            const aviso = esRateLimitError(e)
                ? '⚠️ El buscador de stickers está limitado por ahora. Prueba otra vez en unos minutos.'
                : '❌ No pude convertir el sticker. Intenta con otra búsqueda.';
            if (i === 0) await sock.sendMessage(jid, { text: aviso });
            break;
        }
    }

    if (enviados > 0) {
        await sock.sendMessage(jid, {
            text: `_Responde cualquier sticker con *#again* para obtener otro de: *${query}*_`
        });
    }
}

module.exports = { cmdSticker, cmdStickerSearch, ssMap, lastSearch };
