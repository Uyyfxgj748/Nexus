/**
 * Utilidad de paginación centralizada para todos los comandos del bot.
 *
 * Uso básico:
 *   const { paginar, piePagina } = require('./paginator');
 *   const { items, pag, totalPags, inicio } = paginar(lista, pagina, 10);
 *   texto += piePagina(pag, totalPags, 'baltop');
 */

/**
 * Divide un array en páginas y devuelve la página solicitada.
 * @param {Array}  items      Array completo de elementos.
 * @param {number} pagina     Número de página solicitada (1-based).
 * @param {number} porPagina  Elementos por página.
 * @returns {{ items, pag, totalPags, total, inicio }}
 */
function paginar(items, pagina, porPagina) {
    const total = items.length;
    const totalPags = Math.ceil(total / porPagina) || 1;
    const pag = Math.min(Math.max(1, pagina || 1), totalPags);
    const inicio = (pag - 1) * porPagina;
    return {
        items: items.slice(inicio, inicio + porPagina),
        pag,
        totalPags,
        total,
        inicio,
    };
}

/**
 * Genera el pie de página con navegación de páginas.
 * @param {number} pag        Página actual.
 * @param {number} totalPags  Total de páginas.
 * @param {string} baseCmd    Comando base (sin #), ej: 'harem', 'baltop'.
 * @returns {string}  Cadena vacía si solo hay 1 página, texto con navegación si hay más.
 */
function piePagina(pag, totalPags, baseCmd) {
    if (totalPags <= 1) return '';
    let pie = `\n\n📄 Página *${pag}/${totalPags}*`;
    if (pag > 1)         pie += `  ← *#${baseCmd}${pag - 1}*`;
    if (pag < totalPags) pie += `  *#${baseCmd}${pag + 1}* →`;
    return pie;
}

/**
 * Devuelve el emblema posicional para un ranking.
 * Posiciones 1-10 usan medallas emoji; del 11 en adelante usan número.
 * @param {number} pos  Posición global (0-based internamente, 1-based para mostrar).
 * @returns {string}
 */
function emblema(pos) {
    const MEDALLAS = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'];
    return pos < MEDALLAS.length ? MEDALLAS[pos] : `${pos + 1}.`;
}

module.exports = { paginar, piePagina, emblema };
