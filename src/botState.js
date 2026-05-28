const state = {
    startTime:          Date.now(),
    ultimoMensaje:      Date.now(),
    conectado:          false,
    intentosReconexion: 0,
    eventosActivos:     false,
    healthModules: {
        core:      true,
        database:  true,
        handlers:  true,
        utilities: true,
        media:     true,
        admin:     true,
        nsfw:      true,
        dashboard: true
    },
    cmdStats:  new Map(),
    antispam:  new Map()
};

// Limpieza automática del Map antispam cada 15 minutos
// Evita fuga de memoria cuando hay miles de usuarios únicos
setInterval(() => {
    const ahora = Date.now();
    const EXPIRACION = 5 * 60 * 1000; // entradas inactivas por más de 5 min
    for (const [jid, s] of state.antispam.entries()) {
        const bloqueadoExpirado = !s.blockedUntil || ahora > s.blockedUntil;
        const inactivo = ahora - (s.start || 0) > EXPIRACION;
        if (bloqueadoExpirado && inactivo) {
            state.antispam.delete(jid);
        }
    }
}, 15 * 60 * 1000).unref();

// Resetear cmdStats semanalmente para no acumular datos infinitos
setInterval(() => {
    state.cmdStats.clear();
}, 7 * 24 * 60 * 60 * 1000).unref();

module.exports = state;
