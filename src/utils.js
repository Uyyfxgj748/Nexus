const { getGrupo } = require('./database');
const { getRiskLevel, getMediaCount, MEDIA_LIMIT_PER_MIN } = require('./antiban');
const { downloadContentFromMessage } = require('@whiskeysockets/baileys');
const fs = require('fs-extra');
const path = require('path');
const os = require('os');
const sharp = require('sharp');
const axios = require('axios');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('@ffmpeg-installer/ffmpeg').path;
ffmpeg.setFfmpegPath(ffmpegPath);
const botState = require('./botState');

// Cooldown por grupo para #tag — evita que un loop o spam lo dispare varias veces
// seguidas. 30 segundos mínimo entre tags en el mismo grupo.
const _tagCooldown = new Map();
const TAG_COOLDOWN_MS = 30_000;

function formatUptime(ms) {
    const totalSeg = Math.floor(ms / 1000);
    const dias  = Math.floor(totalSeg / 86400);
    const horas = Math.floor((totalSeg % 86400) / 3600);
    const mins  = Math.floor((totalSeg % 3600) / 60);
    const segs  = totalSeg % 60;
    if (dias > 0)  return `${dias}d ${horas}h ${mins}m`;
    if (horas > 0) return `${horas}h ${mins}m ${segs}s`;
    return `${mins}m ${segs}s`;
}

function formatSilencio(ms) {
    const segs = Math.floor(ms / 1000);
    if (segs < 60)  return `${segs}s`;
    const mins = Math.floor(segs / 60);
    if (mins < 60)  return `${mins}m ${segs % 60}s`;
    return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

async function cmdPing(sock, jid) {
    const inicio = Date.now();
    await sock.sendMessage(jid, { text: '🏓 Pong!' });
    const ms = Date.now() - inicio;

    const silencio = formatSilencio(Date.now() - botState.ultimoMensaje);
    const uptime   = formatUptime(Date.now() - botState.startTime);

    await sock.sendMessage(jid, {
        text: `⚡ *Latencia:* ${ms}ms\n` +
              `⏱️ *Uptime:* ${uptime}\n` +
              `💬 *Último mensaje:* hace ${silencio}\n` +
              `🟢 *Estado:* ${botState.conectado ? 'Conectado' : 'Reconectando...'}`
    });
}

async function cmdStatus(sock, jid) {
    const mem    = process.memoryUsage();
    const uptime = formatUptime(Date.now() - botState.startTime);
    const silencio = formatSilencio(Date.now() - botState.ultimoMensaje);
    const ramUsed  = Math.round(mem.heapUsed  / 1024 / 1024);
    const ramTotal = Math.round(mem.heapTotal / 1024 / 1024);
    const estado   = botState.conectado ? '🟢 Online' : '🔴 Reconectando';

    const riesgo      = getRiskLevel();
    const riesgoBar   = riesgo >= 12 ? '🔴 Alto' : riesgo >= 6 ? '🟡 Medio' : '🟢 Bajo';
    const mediaActual = getMediaCount();

    const texto =
`╔══════════════════╗
║    🤖 ESTADO BOT    ║
╚══════════════════╝
${estado}
⏱️ *Uptime:* ${uptime}
💬 *Último mensaje:* hace ${silencio}
💾 *RAM:* ${ramUsed}MB / ${ramTotal}MB
🔄 *Reconexiones:* ${botState.intentosReconexion}
🐕 *Watchdog:* activo (revisa c/5 min)
─────────────────────
🛡️ *Nivel de riesgo:* ${riesgoBar} (${riesgo})
📦 *Media este minuto:* ${mediaActual}/${MEDIA_LIMIT_PER_MIN}`;

    await sock.sendMessage(jid, { text: texto });
}

async function cmdEliminar(sock, jid, msg, groupMetadata) {
    const quoted = msg.message?.extendedTextMessage?.contextInfo;
    if (!quoted || !quoted.stanzaId) {
        await sock.sendMessage(jid, { text: '❌ Responde al mensaje que quieres eliminar.' });
        return;
    }

    // Normalizar JID del bot eliminando sufijo de dispositivo (:67, etc.)
    const botJid = (sock.user?.id || '').replace(/:.*@/, '@');

    // Normalizar el autor del mensaje citado de la misma forma
    const autorRaw = quoted.participant || quoted.remoteJid || '';
    const autorNorm = autorRaw.replace(/:.*@/, '@');
    const esMensajePropio = autorNorm === botJid;

    const esGrupo = jid.endsWith('@g.us');

    // Nota: no se hace pre-chequeo de admin del bot aquí porque WhatsApp ahora
    // usa formato @lid para participantes de grupo, lo que hace imposible comparar
    // con el JID del bot en formato @s.whatsapp.net. WhatsApp rechazará el delete
    // automáticamente si el bot no tiene los permisos necesarios.

    try {
        // Pequeño delay aleatorio para no parecer eliminación instantánea automática
        await new Promise(r => setTimeout(r, 500 + Math.floor(Math.random() * 800)));

        const deleteKey = {
            remoteJid: jid,
            fromMe: esMensajePropio,
            id: quoted.stanzaId,
        };

        // En grupos siempre se necesita el participant en la key
        // - Mensajes propios del bot: usar botJid normalizado
        // - Mensajes ajenos: usar el participant original del quoted (sin normalizar)
        if (esGrupo) {
            deleteKey.participant = esMensajePropio ? botJid : autorRaw;
        }

        await sock.sendMessage(jid, { delete: deleteKey });
    } catch (err) {
        console.error('[DEL] Error al eliminar mensaje:', err.message);
        await sock.sendMessage(jid, { text: '❌ No pude eliminar ese mensaje. Verifica que soy administrador del grupo.' });
    }
}

async function cmdFotoPerfil(sock, jid, senderJid, mencionados) {
    const objetivo = mencionados && mencionados.length > 0 ? mencionados[0] : senderJid;
    try {
        const url = await Promise.race([
            sock.profilePictureUrl(objetivo, 'image'),
            new Promise((_, reject) =>
                setTimeout(() => reject(new Error('timeout')), 8000)
            )
        ]);
        await sock.sendMessage(jid, {
            image: { url },
            caption: `🖼️ Foto de perfil de @${objetivo.split('@')[0]}`,
            mentions: [objetivo]
        });
    } catch {
        await sock.sendMessage(jid, {
            text: '❌ No pude obtener la foto de perfil. Puede que el usuario la tenga privada o que no tenga foto de perfil.'
        });
    }
}

// ── #tag / #tagall / #hidetag / #tagsay ──────────────────────────────────
// El texto va siempre en MAYÚSCULAS.
// Las menciones son completamente invisibles: WhatsApp notifica a todos los
// JIDs del campo `mentions` aunque el texto NO contenga ningún @número.
async function cmdTagAll(sock, jid, groupMetadata, args, senderJid, g, esOwner) {
    if (!groupMetadata) {
        await sock.sendMessage(jid, { text: '❌ Este comando solo funciona en grupos.' });
        return;
    }

    // ── Cooldown por grupo — bloquea loops o spam accidental ──────────────
    const ahora = Date.now();
    const ultimoTag = _tagCooldown.get(jid) || 0;
    if (ahora - ultimoTag < TAG_COOLDOWN_MS) {
        const restante = Math.ceil((TAG_COOLDOWN_MS - (ahora - ultimoTag)) / 1000);
        await sock.sendMessage(jid, { text: `⏳ *#tag* tiene cooldown de grupo. Espera *${restante}s*.` });
        return;
    }
    _tagCooldown.set(jid, ahora);

    // ── Control de permisos según tagMode del grupo ────────────────────────
    const tagMode = (g && g.tagMode) ? g.tagMode : 'todos';
    if (tagMode === 'admins') {
        const esAdminSender = groupMetadata.participants.some(
            p => p.id === senderJid && (p.admin === 'admin' || p.admin === 'superadmin')
        );
        if (!esAdminSender && !esOwner) {
            await sock.sendMessage(jid, {
                text: '⛔ Solo los *admins y owners* pueden usar el #tag en este grupo.\n_Un admin puede cambiarlo con *#settag todos*_'
            });
            return;
        }
    }

    // Excluir el JID del propio bot para que no se notifique a sí mismo
    // y no genere un eco que podría re-disparar el comando
    const botJid = (sock.user?.id || '').replace(/:\d+@/, '@');
    const participantes = groupMetadata.participants
        .map(p => p.id)
        .filter(id => id.replace(/:\d+@/, '@') !== botJid);

    const mensaje = args.join(' ').toUpperCase().trim() || '📢 ¡ATENCIÓN A TODOS!';

    // Enviar un único mensaje con todas las menciones.
    // El enfoque anterior (lotes con \u200e) causaba que los mensajes invisibles
    // rebotaran como eventos messages.upsert, pudiendo re-disparar el comando
    // y generar un loop infinito de mensajes en blanco.
    await sock.sendMessage(jid, { text: mensaje, mentions: participantes });
}

// ── Helper: descargar buffer desde un message content ──────────────────────
async function descargarBuffer(mediaMsg, tipo) {
    const stream = await downloadContentFromMessage(mediaMsg, tipo);
    const chunks = [];
    for await (const chunk of stream) chunks.push(chunk);
    return Buffer.concat(chunks);
}

// ── Convertir sticker / imagen de una vista / imagen citada a imagen/video ─
async function cmdStickerAImagen(sock, jid, msg) {
    const contextInfo = msg.message?.extendedTextMessage?.contextInfo;
    const quoted = contextInfo?.quotedMessage;

    if (!quoted) {
        await sock.sendMessage(jid, {
            text: '❌ Responde a un sticker, imagen o foto de una vista con *#toimg*.'
        });
        return;
    }

    // Desenvuelve viewOnce si aplica
    const viewOnce = quoted.viewOnceMessage || quoted.viewOnceMessageV2 || quoted.viewOnceMessageV2Extension;
    const msgContent = viewOnce?.message || quoted;

    const sticker = msgContent.stickerMessage;
    const imagen  = msgContent.imageMessage;
    const video   = msgContent.videoMessage;

    if (!sticker && !imagen && !video) {
        await sock.sendMessage(jid, {
            text: '❌ Responde a un sticker, imagen o foto de una vista con *#toimg*.'
        });
        return;
    }

    try {
        // Sticker animado → enviar como video/GIF
        if (sticker) {
            const esAnimado = sticker.isAnimated === true;
            const buffer = await descargarBuffer(sticker, 'sticker');
            if (!buffer || !buffer.length) throw new Error('buffer vacío');

            if (esAnimado) {
                // Sticker animado (webp animado) → video con gifPlayback
                await sock.sendMessage(jid, {
                    video: buffer,
                    caption: '🎬 Sticker animado convertido',
                    gifPlayback: true,
                    mimetype: 'video/mp4'
                }).catch(async () => {
                    // Fallback: enviar como imagen si video falla
                    await sock.sendMessage(jid, {
                        image: buffer,
                        caption: '🖼️ Sticker (frame estático)'
                    });
                });
            } else {
                await sock.sendMessage(jid, {
                    image: buffer,
                    caption: '🖼️ Sticker convertido a imagen'
                });
            }
            return;
        }

        let buffer;
        if (imagen) buffer = await descargarBuffer(imagen, 'image');
        else if (video) buffer = await descargarBuffer(video, 'video');

        if (!buffer || !buffer.length) throw new Error('buffer vacío');

        if (video) {
            await sock.sendMessage(jid, {
                video: buffer,
                caption: '🎬 Video extraído',
                gifPlayback: video.gifPlayback || false
            });
        } else {
            await sock.sendMessage(jid, {
                image: buffer,
                caption: '🖼️ ¡Aquí tienes la imagen!'
            });
        }
    } catch (err) {
        console.error('toimg error:', err.message);
        await sock.sendMessage(jid, {
            text: '❌ No pude convertir. Responde directamente al sticker o imagen e inténtalo de nuevo.'
        });
    }
}

async function cmdSuggest(sock, jid, senderJid, args) {
    const nombre = args.join(' ');
    if (!nombre) {
        await sock.sendMessage(jid, { text: '❌ Uso: *#suggest [texto]* o *#sug [texto]*\nEjemplo: #suggest agregar comando música' });
        return;
    }
    const logPath = path.join(__dirname, '../data/sugerencias.json');
    let log = [];
    try { if (fs.existsSync(logPath)) log = fs.readJsonSync(logPath); } catch {}
    log.push({ usuario: senderJid, texto: nombre, fecha: new Date().toISOString() });
    try { fs.writeJsonSync(logPath, log, { spaces: 2 }); } catch {}
    await sock.sendMessage(jid, {
        text: `✅ *Sugerencia registrada:* _${nombre}_\n\n¡Gracias por tu aporte! El owner la revisará pronto. 📋`
    });
}

async function cmdReport(sock, jid, senderJid, args) {
    const texto = args.join(' ');
    if (!texto) {
        await sock.sendMessage(jid, { text: '❌ Uso: *#report [descripción del problema]*' });
        return;
    }
    const logPath = path.join(__dirname, '../data/reportes.json');
    let log = [];
    try { if (fs.existsSync(logPath)) log = fs.readJsonSync(logPath); } catch {}
    log.push({ usuario: senderJid, texto, fecha: new Date().toISOString() });
    try { fs.writeJsonSync(logPath, log, { spaces: 2 }); } catch {}
    await sock.sendMessage(jid, {
        text: `🚨 *Reporte enviado:* _${texto}_\n\nGracias por reportar. El owner lo revisará lo antes posible.`
    });
}

async function cmdBots(sock, jid, groupMetadata) {
    if (!groupMetadata) {
        await sock.sendMessage(jid, { text: '❌ Este comando solo funciona en grupos.' });
        return;
    }
    const bots = groupMetadata.participants.filter(p =>
        p.id.endsWith('@s.whatsapp.net') && (p.id.includes('bot') || p.isBot)
    );
    await sock.sendMessage(jid, {
        text: `🤖 *Bots activos en el grupo:* ${bots.length > 0 ? bots.map(b => `@${b.id.split('@')[0]}`).join(', ') : 'No se detectaron bots'}\n👥 Total de miembros: ${groupMetadata.participants.length}`
    });
}

async function cmdInvite(sock, jid, groupMetadata) {
    if (!groupMetadata) {
        await sock.sendMessage(jid, { text: '❌ Este comando solo funciona en grupos.' });
        return;
    }
    try {
        const code = await sock.groupInviteCode(jid);
        await sock.sendMessage(jid, {
            text: `🔗 *Link de invitación del grupo:*\nhttps://chat.whatsapp.com/${code}\n\n_Comparte este link para invitar al bot o a otros usuarios._`
        });
    } catch {
        await sock.sendMessage(jid, { text: '❌ No pude obtener el link de invitación. Necesito ser administrador.' });
    }
}

// ── #testwelcome / #testgoodbye ──────────────────────────────────────────
// Envía el flujo REAL (texto + imagen si está configurada), no solo preview.
async function cmdTestWelcome(sock, jid, groupMetadata, senderJid, tipo) {
    if (!groupMetadata) {
        await sock.sendMessage(jid, { text: '❌ Este comando solo funciona en grupos.' });
        return;
    }
    const g = getGrupo(jid);
    const nombre = `@${senderJid.split('@')[0]}`;

    const obtenerMedia = (modo) => {
        const campo = modo === 'welcome' ? 'welcomeMedia' : 'goodbyeMedia';
        const legacy = modo === 'welcome' ? 'welcomeImagePath' : 'goodbyeImagePath';
        if (g[campo] && g[campo].path) return g[campo];
        if (g[legacy]) return { tipo: 'image', path: g[legacy] };
        return null;
    };

    const enviarPrueba = async (caption, media) => {
        if (media && media.path && fs.existsSync(media.path)) {
            try {
                const buf = fs.readFileSync(media.path);
                if (media.tipo === 'image') {
                    await sock.sendMessage(jid, { image: buf, caption, mentions: [senderJid] });
                } else if (media.tipo === 'gif') {
                    await sock.sendMessage(jid, { video: buf, caption, mentions: [senderJid], gifPlayback: true });
                } else {
                    await sock.sendMessage(jid, { video: buf, caption, mentions: [senderJid] });
                }
                return true;
            } catch {}
        }
        return false;
    };

    if (tipo === 'welcome') {
        const texto = (g.mensajeBienvenida || '╭─ 💬 Bienvenido/a ─╮\n👋 ¡Hey! @usuario, qué bueno verte por aquí\n\nSoy Nexus ⚡ tu bot compañero\npara ayudarte, entretenerte\ny sacarte de cualquier apuro 😄\n\n🎯 ¿Qué puedes hacer?\n• Juegos y diversión 🎮\n• Comandos útiles 🛠️\n• Interacción con otros 👥\n• Y varias sorpresas más ✨\n\n💡 Consejo rápido:\nEscribe #menu y explora todo lo que tengo para ti\n\n🔥 Tip:\nMientras más uses los comandos,\nmás cosas irás descubriendo 👀\n\n✨ Relájate, explora y disfruta\neste pequeño rincón digital\n\n╰─ Hecho para pasarla bien ─╯').replace(/@usuario|(?<!\w)@(?!\w)/g, nombre);
        const media = obtenerMedia('welcome');
        const ok = await enviarPrueba(`🧪 _(Test bienvenida)_\n\n${texto}`, media);
        if (!ok) {
            await sock.sendMessage(jid, {
                text: `🧪 _(Test bienvenida)_\n\n${texto}\n\n_💡 Usa *#setwelcomeimage* (imagen) o *#setmultimediawelcome* (gif/video, máx 1 min)._`,
                mentions: [senderJid]
            });
        }
    } else {
        const texto = (g.mensajeDespedida || '╭─ 💭 Despedida ─╮\n👋 @usuario, fue un gusto tenerte por aquí\n\nSoy Nexus ⚡ y espero haberte ayudado\no al menos haberte hecho pasar\nun buen rato 😄\n\n🎯 Antes de irte:\n• Guarda tus comandos favoritos ⭐\n• Invita a otros a usar el bot 👥\n• Y vuelve cuando quieras 🔄\n\n💡 Recuerda:\nSiempre habrá algo nuevo por descubrir\ncada vez que regreses 👀\n\n🔥 Dato:\nEl bot sigue activo… incluso cuando tú no estás 😏\n\n✨ Cuídate y nos vemos pronto\n\n╰─ Nexus siempre estará aquí ─╯').replace(/@usuario|(?<!\w)@(?!\w)/g, nombre);
        const media = obtenerMedia('goodbye');
        const ok = await enviarPrueba(`🧪 _(Test despedida)_\n\n${texto}`, media);
        if (!ok) {
            await sock.sendMessage(jid, {
                text: `🧪 _(Test despedida)_\n\n${texto}\n\n_💡 Usa *#setgoodbyeimage* (imagen) o *#setmultimediagoodbye* (gif/video, máx 1 min)._`,
                mentions: [senderJid]
            });
        }
    }
}

async function cmdLeave(sock, jid, groupMetadata, senderJid) {
    if (!groupMetadata) {
        await sock.sendMessage(jid, { text: '❌ Este comando solo funciona en grupos.' });
        return;
    }
    const esMiembro = (groupMetadata.participants || []).some(p => p.id === senderJid);
    if (!esMiembro) {
        await sock.sendMessage(jid, { text: '⛔ Solo miembros del grupo pueden usar este comando.' });
        return;
    }
    const botJid = sock.user?.id?.replace(/:.*@/, '@') || '';
    const botEsAdmin = (groupMetadata.participants || []).some(
        p => (p.id === botJid || p.id?.split(':')[0] + '@s.whatsapp.net' === botJid) && (p.admin === 'admin' || p.admin === 'superadmin')
    );
    if (!botEsAdmin) {
        await sock.sendMessage(jid, {
            text: '⚠️ Necesito ser administrador del grupo para poder sacarte.\n_Pídele a un admin que me promueva e intenta de nuevo._'
        });
        return;
    }
    await sock.sendMessage(jid, {
        text: `👋 Hasta luego @${senderJid.split('@')[0]}! Fuiste sacado del grupo a tu petición.`,
        mentions: [senderJid]
    });
    try {
        await sock.groupParticipantsUpdate(jid, [senderJid], 'remove');
    } catch (e) {
        await sock.sendMessage(jid, { text: '❌ No pude sacarte del grupo. Verifica mis permisos de administrador.' });
    }
}

// ── #hd / #enhance / #remini — mejorar resolución de una imagen ──────────
// Usa sharp para upscale 2x + sharpen. Es local y gratis (sin API externa).
async function cmdHd(sock, jid, msg) {
    const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    const imgMsg = msg.message?.imageMessage || quoted?.imageMessage
        || quoted?.viewOnceMessage?.message?.imageMessage
        || quoted?.viewOnceMessageV2?.message?.imageMessage;
    if (!imgMsg) {
        await sock.sendMessage(jid, { text: '❌ Envía o responde a una imagen con *#hd*\nAlias: *#enhance*, *#remini*' });
        return;
    }
    await sock.sendMessage(jid, { text: '⚙️ Mejorando imagen...' });
    try {
        const buffer = await descargarBuffer(imgMsg, 'image');
        const meta = await sharp(buffer).metadata();
        const w = meta.width || 512;
        const h = meta.height || 512;
        const factor = w < 1024 ? 2 : 1.5;
        const targetW = Math.min(Math.round(w * factor), 2048);
        const targetH = Math.min(Math.round(h * factor), 2048);

        const out = await sharp(buffer)
            .resize(targetW, targetH, { kernel: 'lanczos3', fit: 'fill' })
            .sharpen({ sigma: 1.2, m1: 1.5, m2: 0.7 })
            .modulate({ saturation: 1.1, brightness: 1.02 })
            .jpeg({ quality: 95 })
            .toBuffer();

        await sock.sendMessage(jid, {
            image: out,
            caption: `✅ *Imagen mejorada* (${w}×${h} → ${targetW}×${targetH})`
        });
    } catch (err) {
        console.error('cmdHd error:', err.message);
        await sock.sendMessage(jid, { text: `❌ No pude mejorar la imagen: ${err.message}` });
    }
}

// ── #gif — convertir video corto a GIF (MP4 con gifPlayback) ─────────────
// WhatsApp no reproduce archivos .gif nativos — los GIFs son videos MP4 con
// gifPlayback:true. Se recodifica el video a MP4 comprimido y se envía así.
async function cmdVideoAGif(sock, jid, msg) {
    const contextInfo = msg.message?.extendedTextMessage?.contextInfo;
    const quoted = contextInfo?.quotedMessage;

    // Detectar videoMessage en el propio mensaje o en el citado
    const vidMsg =
        msg.message?.videoMessage ||
        quoted?.videoMessage ||
        quoted?.viewOnceMessage?.message?.videoMessage ||
        quoted?.viewOnceMessageV2?.message?.videoMessage;

    if (!vidMsg) {
        await sock.sendMessage(jid, {
            text: '❌ Responde a un *video corto* (máx 30 seg) con *#gif*\nAlias: *#togif* · *#mp4togif* · *#videogif*'
        });
        return;
    }

    const duracion = vidMsg.seconds || vidMsg.duration || 0;
    if (duracion > 30) {
        await sock.sendMessage(jid, {
            text: `❌ El video es demasiado largo (*${duracion}s*). Solo acepto videos de hasta *30 segundos*.`
        });
        return;
    }

    await sock.sendMessage(jid, { text: '⚙️ _Procesando GIF..._' });

    const id = Date.now();
    const tmpDir    = os.tmpdir();
    const inputPath = path.join(tmpDir, `gif_in_${id}.mp4`);
    const outPath   = path.join(tmpDir, `gif_out_${id}.mp4`);

    try {
        // 1) Descargar el video
        const buffer = await descargarBuffer(vidMsg, 'video');
        if (!buffer || !buffer.length) throw new Error('buffer vacío');
        await fs.writeFile(inputPath, buffer);

        // 2) Recodificar a MP4 comprimido (max 480px ancho, sin audio)
        await new Promise((resolve, reject) => {
            ffmpeg(inputPath)
                .outputOptions([
                    '-vf', 'scale=480:-2',
                    '-c:v', 'libx264',
                    '-preset', 'fast',
                    '-crf', '28',
                    '-an',              // sin audio → comportamiento GIF
                    '-movflags', '+faststart',
                    '-pix_fmt', 'yuv420p'
                ])
                .output(outPath)
                .on('end', resolve)
                .on('error', reject)
                .run();
        });

        const outBuffer = await fs.readFile(outPath);
        const tamaño = (outBuffer.length / 1024).toFixed(1);

        // 3) Enviar como video con gifPlayback:true — así WhatsApp lo trata como GIF
        await sock.sendMessage(jid, {
            video:       outBuffer,
            gifPlayback: true,
            caption:     `🎞️ *GIF* · ${duracion > 0 ? `${duracion}s` : ''} · ${tamaño} KB`,
            mimetype:    'video/mp4'
        });

    } catch (err) {
        console.error('cmdVideoAGif error:', err.message);
        await sock.sendMessage(jid, {
            text: `❌ No pude procesar el GIF.\n_Error: ${err.message}_`
        });
    } finally {
        for (const f of [inputPath, outPath]) {
            try { await fs.remove(f); } catch {}
        }
    }
}

// ── #read / #readviewonce — revelar mensaje de vista única ───────────────
async function cmdRead(sock, jid, msg) {
    const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    if (!quoted) {
        await sock.sendMessage(jid, { text: '❌ Responde al mensaje de *vista única* con *#read*' });
        return;
    }
    const vo = quoted.viewOnceMessage || quoted.viewOnceMessageV2 || quoted.viewOnceMessageV2Extension;
    const inner = vo?.message || quoted;
    const imgMsg = inner.imageMessage;
    const vidMsg = inner.videoMessage;
    const audMsg = inner.audioMessage;

    if (!imgMsg && !vidMsg && !audMsg) {
        await sock.sendMessage(jid, { text: '❌ El mensaje citado no es de vista única (imagen/video/audio).' });
        return;
    }
    try {
        // Delay aleatorio antes de responder — simula que un humano abrió y reenvió
        // el contenido manualmente en lugar de hacerlo de forma instantánea automática
        await new Promise(r => setTimeout(r, 1200 + Math.floor(Math.random() * 2400)));

        if (imgMsg) {
            const buf = await descargarBuffer(imgMsg, 'image');
            await sock.sendMessage(jid, { image: buf, caption: imgMsg.caption || '👁️' });
        } else if (vidMsg) {
            const buf = await descargarBuffer(vidMsg, 'video');
            await sock.sendMessage(jid, { video: buf, caption: vidMsg.caption || '👁️' });
        } else if (audMsg) {
            const buf = await descargarBuffer(audMsg, 'audio');
            await sock.sendMessage(jid, { audio: buf, mimetype: 'audio/mp4', ptt: !!audMsg.ptt });
        }
    } catch (err) {
        await sock.sendMessage(jid, { text: `❌ No pude revelar el mensaje: ${err.message}` });
    }
}

// ══════════════════════════════════════════
//  CONVERTIR WEBP ANIMADO → MP4
// ══════════════════════════════════════════
async function webpAMp4(buffer) {
    const tmpDir = os.tmpdir();
    const gifPath    = path.join(tmpDir, `tov_mid_${Date.now()}.gif`);
    const outputPath = path.join(tmpDir, `tov_out_${Date.now()}.mp4`);

    // Paso 1: webp animado → gif (sharp lo maneja nativamente)
    const gifBuffer = await sharp(buffer, { animated: true })
        .gif()
        .toBuffer();
    await fs.writeFile(gifPath, gifBuffer);

    // Paso 2: gif → mp4 (ffmpeg maneja gif sin problemas)
    return new Promise((resolve, reject) => {
        ffmpeg(gifPath)
            .outputOptions([
                '-vf', 'fps=15,scale=trunc(iw/2)*2:trunc(ih/2)*2,format=yuv420p',
                '-c:v', 'libx264',
                '-movflags', '+faststart',
                '-an'
            ])
            .toFormat('mp4')
            .on('end', async () => {
                try {
                    const result = await fs.readFile(outputPath);
                    await fs.remove(gifPath).catch(() => {});
                    await fs.remove(outputPath).catch(() => {});
                    resolve(result);
                } catch (e) { reject(e); }
            })
            .on('error', async (err) => {
                await fs.remove(gifPath).catch(() => {});
                await fs.remove(outputPath).catch(() => {});
                reject(err);
            })
            .save(outputPath);
    });
}

// ══════════════════════════════════════════
//  #TOVIDEO — STICKER/WEBP → VIDEO MP4
// ══════════════════════════════════════════
async function cmdStickerAVideo(sock, jid, msg) {
    const contextInfo = msg.message?.extendedTextMessage?.contextInfo;
    const quoted = contextInfo?.quotedMessage;

    if (!quoted) {
        await sock.sendMessage(jid, {
            text: '❌ Responde a un sticker animado o video con *#tovideo*.'
        });
        return;
    }

    const viewOnce = quoted.viewOnceMessage || quoted.viewOnceMessageV2 || quoted.viewOnceMessageV2Extension;
    const msgContent = viewOnce?.message || quoted;

    const sticker = msgContent.stickerMessage;
    const video   = msgContent.videoMessage;

    if (!sticker && !video) {
        await sock.sendMessage(jid, {
            text: '❌ Solo puedo convertir *stickers animados* o *videos* a MP4.\nPara imágenes usa *#toimage*.'
        });
        return;
    }

    try {
        await sock.sendMessage(jid, { text: '⚙️ Convirtiendo a video...' });

        if (video) {
            const buffer = await descargarBuffer(video, 'video');
            if (!buffer || !buffer.length) throw new Error('buffer vacío');
            await sock.sendMessage(jid, {
                video: buffer,
                caption: '🎬 ¡Aquí tienes el video!',
                mimetype: 'video/mp4'
            });
            return;
        }

        // Sticker
        const buffer = await descargarBuffer(sticker, 'sticker');
        if (!buffer || !buffer.length) throw new Error('buffer vacío');

        if (!sticker.isAnimated) {
            // Estático: mandar como imagen (no tiene frames de video)
            await sock.sendMessage(jid, {
                image: buffer,
                caption: '🖼️ Este sticker es estático, se envía como imagen.'
            });
            return;
        }

        // Animado: convertir webp → mp4
        const mp4Buffer = await webpAMp4(buffer);
        await sock.sendMessage(jid, {
            video: mp4Buffer,
            caption: '🎬 Sticker animado convertido a video',
            mimetype: 'video/mp4'
        });

    } catch (err) {
        console.error('tovideo error:', err.message);
        await sock.sendMessage(jid, {
            text: '❌ No pude convertir a video. Asegúrate de responder a un sticker animado.'
        });
    }
}

module.exports = {
    cmdPing, cmdStatus, cmdEliminar, cmdFotoPerfil, cmdTagAll,
    cmdStickerAImagen, cmdStickerAVideo, cmdSuggest, cmdReport, cmdBots, cmdInvite,
    cmdTestWelcome, cmdLeave, cmdHd, cmdRead, cmdVideoAGif
};
