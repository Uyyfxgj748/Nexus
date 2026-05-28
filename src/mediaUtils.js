const fs   = require('fs');
const path = require('path');

const EXTS_IMAGE = ['.jpg', '.jpeg', '.png', '.webp'];
const EXTS_GIF   = ['.gif'];
const EXTS_VIDEO = ['.mp4', '.mov', '.mkv', '.avi', '.webm'];

// Cache anti-repetición: recuerda los últimos N archivos por carpeta para
// evitar que el bot envíe el mismo video varias veces seguidas.
const _recentCache = new Map();

function obtenerArchivoAleatorio(carpeta) {
    const rutaAbs = path.isAbsolute(carpeta)
        ? carpeta
        : path.join(__dirname, '..', carpeta);

    if (!fs.existsSync(rutaAbs)) return null;

    const archivos = fs.readdirSync(rutaAbs).filter(f => {
        const ext = path.extname(f).toLowerCase();
        return (
            !f.startsWith('.') &&
            [...EXTS_IMAGE, ...EXTS_GIF, ...EXTS_VIDEO].includes(ext)
        );
    });

    if (!archivos.length) return null;

    // Cuántos archivos recientes bloquear: la mitad del total, mínimo 1, máximo 5
    const maxRecent = Math.min(5, Math.max(1, Math.floor(archivos.length / 2)));
    const recent    = _recentCache.get(rutaAbs) || [];

    // Candidatos = todos menos los recientes; si no queda nada, limpiar y usar todos
    let candidatos = archivos.filter(f => !recent.includes(f));
    if (!candidatos.length) {
        _recentCache.set(rutaAbs, []);
        candidatos = archivos;
    }

    const nombre = candidatos[Math.floor(Math.random() * candidatos.length)];

    // Actualizar historial
    recent.push(nombre);
    if (recent.length > maxRecent) recent.shift();
    _recentCache.set(rutaAbs, recent);

    const ext  = path.extname(nombre).toLowerCase();
    const ruta = path.join(rutaAbs, nombre);

    let tipo;
    if (EXTS_IMAGE.includes(ext))     tipo = 'image';
    else if (EXTS_GIF.includes(ext))  tipo = 'gif';
    else                               tipo = 'video';

    return { ruta, tipo };
}

async function enviarMediaLocal(sock, jid, carpeta, caption, mentions = [], gifPlayback = false) {
    const archivo = obtenerArchivoAleatorio(carpeta);
    if (!archivo) return false;

    const buffer = fs.readFileSync(archivo.ruta);
    const base   = { caption, mentions };

    try {
        if (archivo.tipo === 'image') {
            await sock.sendMessage(jid, { image: buffer, ...base });
        } else if (archivo.tipo === 'gif' || gifPlayback) {
            await sock.sendMessage(jid, { video: buffer, gifPlayback: true, ...base });
        } else {
            await sock.sendMessage(jid, { video: buffer, ...base });
        }
        return true;
    } catch {
        return false;
    }
}

module.exports = { obtenerArchivoAleatorio, enviarMediaLocal };
