const { getUsuario, guardarUsuario } = require('./database');
const { getGrupo, guardarGrupo } = require('./database');

// ══════════════════════════════════════════
//  ENCUESTA
// ══════════════════════════════════════════
async function cmdPoll(sock, jid, senderJid, args) {
    const full = args.join(' ');
    const partes = full.split('|').map(p => p.trim()).filter(Boolean);
    if (partes.length < 3) {
        await sock.sendMessage(jid, {
            text: '❌ Uso: *#poll [Pregunta] | [Opción1] | [Opción2] ...*\nEjemplo:\n*#poll ¿Mejor personaje? | Naruto | Goku | Luffy*\n\nPuedes agregar hasta 12 opciones separadas por *|*'
        });
        return;
    }
    const pregunta = partes[0];
    const opciones = partes.slice(1, 13);

    if (opciones.length < 2) {
        await sock.sendMessage(jid, { text: '❌ Necesitas al menos 2 opciones para crear una encuesta.' });
        return;
    }

    await sock.sendMessage(jid, {
        poll: {
            name: pregunta,
            values: opciones,
            selectableCount: 1
        }
    });
}

async function cmdPollVote(sock, jid, senderJid, args) {
    const num = parseInt(args[0]) - 1;
    const g = getGrupo(jid);
    if (!g.encuesta || !g.encuesta.opciones) {
        await sock.sendMessage(jid, { text: '❌ No hay ninguna encuesta activa. Crea una con *#poll*' });
        return;
    }
    if (isNaN(num) || num < 0 || num >= g.encuesta.opciones.length) {
        await sock.sendMessage(jid, { text: `❌ Opción inválida. Vota del 1 al ${g.encuesta.opciones.length}` });
        return;
    }
    if (g.encuesta.votos[senderJid] !== undefined) {
        await sock.sendMessage(jid, { text: '⚠️ Ya votaste en esta encuesta.' });
        return;
    }
    g.encuesta.votos[senderJid] = num;
    guardarGrupo(jid, g);
    await sock.sendMessage(jid, { text: `✅ Voto registrado: *${g.encuesta.opciones[num]}*` });
}

async function cmdPollResults(sock, jid) {
    const g = getGrupo(jid);
    if (!g.encuesta || !g.encuesta.opciones) {
        await sock.sendMessage(jid, { text: '❌ No hay ninguna encuesta activa.' });
        return;
    }
    const conteo = g.encuesta.opciones.map((_, i) =>
        Object.values(g.encuesta.votos).filter(v => v === i).length
    );
    const total = conteo.reduce((a, b) => a + b, 0);
    const nums = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣'];
    const lista = g.encuesta.opciones.map((o, i) => {
        const pct = total > 0 ? Math.round((conteo[i] / total) * 100) : 0;
        const barra = '█'.repeat(Math.round(pct / 10)) + '░'.repeat(10 - Math.round(pct / 10));
        return `${nums[i]} *${o}*\n   [${barra}] ${pct}% (${conteo[i]} votos)`;
    }).join('\n\n');
    await sock.sendMessage(jid, {
        text: `📊 *Resultados de la encuesta*\n\n❓ *${g.encuesta.pregunta}*\n\n${lista}\n\n📋 Total votos: *${total}*`
    });
}

// ══════════════════════════════════════════
//  VERDAD O RETO
// ══════════════════════════════════════════
const VERDADES = [
    // — Relaciones y sentimientos —
    '¿Quién es tu crush secreto del grupo?',
    '¿Tienes celos de alguien del grupo? ¿De quién?',
    '¿Alguna vez le has mentido a alguien del grupo?',
    '¿Has stalkedo el perfil de alguien del grupo?',
    '¿Cuántos ex tienes? ¿Con cuál te llevas mejor?',
    '¿Qué harías si tu crush te escribiera ahora mismo?',
    '¿Le tienes interés romántico a alguien del grupo?',
    '¿Cuál ha sido tu peor cita o experiencia romántica?',
    '¿Has bloqueado a alguien del grupo alguna vez?',
    '¿Le has dado like a una foto muy antigua de alguien del grupo?',
    '¿Prefieres ser rico sin amor o pobre con amor verdadero?',
    '¿Alguna vez mandaste un mensaje al destinatario equivocado? ¿Qué decía?',
    '¿Tienes capturas de pantalla de conversaciones de alguien del grupo?',
    '¿Has hablado mal de alguien del grupo con otra persona?',
    // — Personal y vergonzoso —
    '¿Cuál es tu mayor vergüenza de toda la vida?',
    '¿Cuál es tu mayor miedo que casi nadie sabe?',
    '¿Cuál fue el peor error que has cometido?',
    '¿Cuál es tu hobbie más vergonzoso?',
    '¿Qué nunca le dirías a tu familia?',
    '¿Cuál es tu película o serie favorita que te da vergüenza admitir?',
    '¿Cuántas horas al día pasas en el celular de verdad?',
    '¿Qué app nunca borrarías aunque nadie te viera usarla?',
    '¿Cuál es la cosa más rara que has buscado en Google?',
    '¿Has llorado viendo una película de animación o anime?',
    '¿Cuál es el meme más absurdo que tienes guardado?',
    '¿Has comido algo caído al piso aplicando la regla de los 5 segundos?',
    '¿Cuál es tu talento secreto que nadie sabe?',
    '¿Alguna vez has fingido estar ocupado para no contestar a alguien del grupo?',
    // — Dinero y futuro —
    '¿Qué harías con 1 millón de pesos si los tuvieras hoy?',
    '¿En qué gastas más dinero del que deberías?',
    '¿Cuál es tu mayor sueño que crees que nunca se cumplirá?',
    '¿Qué harías si supieras que mañana es el último día del mundo?',
    // — Anime, juegos y cultura —
    '¿Qué personaje de anime, serie o película te gusta de forma "especial"?',
    '¿Cuántas horas le has dedicado a un videojuego sin parar?',
    '¿Has pagado por contenido digital que te daría vergüenza admitir?',
    '¿Cuál es la canción que escuchas a escondidas porque crees que te juzgarían?',
    // — Grupo —
    '¿A quién del grupo le tendrías más confianza para un secreto importante?',
    '¿A quién del grupo le darías el rol de "el caótico"?',
    '¿Cuál es el momento más gracioso o vergonzoso que recuerdas de este grupo?',
    '¿A quién del grupo llamarías primero si estuvieras en un problema?',
    '¿Quién del grupo crees que tiene el humor más cuestionable?',
    '¿Qué opinas honestamente del nombre o foto de este grupo?',
    '¿Hay alguien en el grupo con quien nunca hayas hablado en privado?',
];

const RETOS = [
    // — Escritura en el grupo —
    'Escribe *"soy el/la más simp del grupo"* y deja que todos lo vean 😂',
    'Escribe un poema de 4 líneas dedicado al grupo ahora mismo.',
    'Escribe una historia de 3 líneas protagonizada por alguien del grupo.',
    'Manda el último mensaje de tu WhatsApp tal cual, sin contexto.',
    'Escribe el contacto más raro o gracioso que tienes guardado en tu cel.',
    'Describe tu situación romántica actual usando solo emojis.',
    'Escribe los 3 defectos de tu mejor amigo/a del grupo.',
    'Escribe cuánto del 1 al 10 te caen las personas del grupo (sin mentir).',
    'Redacta un tweet dramático sobre tu día de hoy.',
    'Escribe una confesión que nunca hayas dicho en el grupo.',
    'Escribe qué harías si te ganaras la lotería esta noche.',
    'Imita el estilo de escritura de alguien del grupo (sin decir quién es).',
    'Escribe los pasos de tu "receta" para caerle bien a la gente.',
    'Describe tu tipo ideal de persona en exactamente 10 palabras.',
    // — Fotos y multimedia —
    'Manda el último meme que guardaste en tu galería.',
    'Manda una foto de lo que tienes más cerca a la mano ahora mismo.',
    'Manda el wallpaper actual de tu celular.',
    'Manda la foto más antigua de tu galería.',
    // — Retos sociales —
    'Menciona a 3 personas del grupo que más te hacen reír.',
    'Menciona a quién del grupo invitarías a comer y por qué.',
    'Dile un cumplido sincero a alguien del grupo en este momento.',
    'Admite cuántas horas al día pasas en WhatsApp (con honestidad).',
    'Di en voz alta (o escribe) algo que siempre quisiste decir en el grupo.',
    'Menciona una cosa que admiras de alguien del grupo.',
    // — Retos divertidos —
    'Cambia tu nombre de WhatsApp a algo que el grupo elija por 30 minutos.',
    'Pon como estado de WhatsApp lo que el grupo decida por 15 minutos.',
    'Escribe un chiste tan malo que hasta tú te avergüences.',
    'Escribe el nombre de tu primer crush de la infancia.',
    'Descríbete a ti mismo/a como lo haría tu peor enemigo.',
    'Descríbete a ti mismo/a como lo haría tu mejor amigo/a.',
    'Escribe cuál sería tu nombre artístico si fueras cantante.',
    'Inventa un superpoder ridículo y explica cómo lo usarías.',
    'Escribe cómo te imaginas que el grupo te describe a tus espaldas.',
    'Escribe el titular de un periódico sobre tu vida esta semana.',
    'Explica en 3 líneas una película como si fuera la mejor del mundo, usando una mala.',
    // — Retos de personajes —
    'Escribe un diálogo de 3 líneas como si fueras un personaje de anime.',
    'Describe tu vida como si fuera el argumento de un anime shonen.',
    'Nombra 5 canciones en menos de 20 segundos (solo el nombre, sin pensarlo).',
    'Escribe el nombre de 5 pokémon sin repetir, ¡ya!',
    // — Retos grupales —
    'Propón un tema de debate para el grupo ahora mismo.',
    'Haz una pregunta incómoda (pero sin faltar el respeto) a alguien del grupo.',
    'Organiza una mini trivia para el grupo: escribe una pregunta difícil.',
];

async function cmdTruth(sock, jid, senderJid, mencionados, pushName) {
    const target  = mencionados?.length ? mencionados[0] : senderJid;
    const nombre  = target === senderJid ? (pushName || senderJid.split('@')[0]) : `@${target.split('@')[0]}`;
    const q       = VERDADES[Math.floor(Math.random() * VERDADES.length)];
    await sock.sendMessage(jid, {
        text: `╔══════════════════════╗\n║  🟢  V E R D A D  🟢  ║\n╚══════════════════════╝\n\n👤 Le toca a: *${nombre}*\n\n❓ _"${q}"_\n\n_Contesta con honestidad... si te atreves 👀_`,
        mentions: [target]
    });
}

async function cmdDare(sock, jid, senderJid, mencionados, pushName) {
    const target  = mencionados?.length ? mencionados[0] : senderJid;
    const nombre  = target === senderJid ? (pushName || senderJid.split('@')[0]) : `@${target.split('@')[0]}`;
    const d       = RETOS[Math.floor(Math.random() * RETOS.length)];
    await sock.sendMessage(jid, {
        text: `╔═══════════════════╗\n║  🔴  R E T O  🔴  ║\n╚═══════════════════╝\n\n👤 Le toca a: *${nombre}*\n\n🎯 _"${d}"_\n\n_¿Lo cumples o prefieres una verdad? 😏_`,
        mentions: [target]
    });
}

async function cmdTruthOrDare(sock, jid, senderJid, mencionados, pushName) {
    const target  = mencionados?.length ? mencionados[0] : senderJid;
    const nombre  = target === senderJid ? (pushName || senderJid.split('@')[0]) : `@${target.split('@')[0]}`;
    const esVerdad = Math.random() < 0.5;
    if (esVerdad) {
        const q = VERDADES[Math.floor(Math.random() * VERDADES.length)];
        await sock.sendMessage(jid, {
            text: `🎲 *¡Verdad o Reto!*\n\n👤 Le tocó a: *${nombre}*\n🎰 La ruleta dice: *¡VERDAD!* 🟢\n\n❓ _"${q}"_\n\n_Contesta con honestidad... si te atreves 👀_`,
            mentions: [target]
        });
    } else {
        const d = RETOS[Math.floor(Math.random() * RETOS.length)];
        await sock.sendMessage(jid, {
            text: `🎲 *¡Verdad o Reto!*\n\n👤 Le tocó a: *${nombre}*\n🎰 La ruleta dice: *¡RETO!* 🔴\n\n🎯 _"${d}"_\n\n_¿Lo cumples o prefieres una verdad? 😏_`,
            mentions: [target]
        });
    }
}

module.exports = { cmdPoll, cmdPollVote, cmdPollResults, cmdTruth, cmdDare, cmdTruthOrDare };
