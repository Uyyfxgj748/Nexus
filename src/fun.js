const axios = require('axios');

// ══════════════════════════════════════════
//  SHIP
// ══════════════════════════════════════════
const mensajesShip = [
    { min: 0,  max: 5,   texto: 'Cero química. Ni el algoritmo se anima 😬' },
    { min: 6,  max: 10,  texto: 'Muy poca conexión, esto necesitaría un milagro 👀' },
    { min: 11, max: 20,  texto: 'Hmm... parece que chocan más de lo que encajan 😬' },
    { min: 21, max: 30,  texto: 'Hay curiosidad, pero todavía no despega 🤔' },
    { min: 31, max: 40,  texto: 'Se puede intentar, aunque va a costar bastante 💭' },
    { min: 41, max: 50,  texto: 'No está mal, tienen base para algo lindo ✨' },
    { min: 51, max: 60,  texto: 'La cosa va subiendo... aquí ya hay chispa 🔥' },
    { min: 61, max: 70,  texto: 'Buena compatibilidad, se entienden bastante bien 😊' },
    { min: 71, max: 80,  texto: 'Muy buen ship, hay confianza y bastante química 💞' },
    { min: 81, max: 90,  texto: 'Casi perfectos. Esto ya parece novela romántica 😳' },
    { min: 91, max: 97,  texto: '¡Demasiada conexión! Ya huele a pareja oficial 💘' },
    { min: 98, max: 100, texto: '¡SHIP SAGRADO! El destino claramente los juntó 💍✨' },
];

async function cmdShip(sock, jid, mencionados, pushName, senderJid) {
    if (!mencionados || mencionados.length < 2) {
        await sock.sendMessage(jid, {
            text: '💘 *Ship*\nNecesitas mencionar a dos personas.\nUso: *#ship @persona1 @persona2*'
        });
        return;
    }
    const a = mencionados[0];
    const b = mencionados[1];
    const numA = a.split('@')[0];
    const numB = b.split('@')[0];
    const porcentaje = Math.floor(Math.random() * 101);
    const msg = mensajesShip.find(m => porcentaje >= m.min && porcentaje <= m.max);
    const barra = generarBarra(porcentaje);

    const extra = [
        '💞 La química habla por sí sola.',
        '✨ El ship está bendecido por el universo.',
        '🔥 Aquí hay potencial real de pareja.',
        '🌙 El destino hizo lo suyo.',
        '💬 Lo importante: que se entiendan en los memes.',
    ][Math.floor(Math.random() * 5)];

    const texto = `💘 *Compatibilidad amorosa*\n\n👤 @${numA}\n❤️ + ❤️\n👤 @${numB}\n\n${barra} ${porcentaje}%\n${extra}\n\n_"${msg.texto}"_`;
    await sock.sendMessage(jid, { text: texto, mentions: [a, b] });
}

function generarBarra(porcentaje) {
    const total = 10;
    const llenas = Math.round((porcentaje / 100) * total);
    return '█'.repeat(llenas) + '░'.repeat(total - llenas);
}

// ══════════════════════════════════════════
//  MEME
// ══════════════════════════════════════════
const subreddits = {
    español:      ['me_retraso_mental', 'MemesEnEspanol', 'Memes_de_actualidad', 'SpanishMemes', 'Memes_For_Latinos', 'MemeEspañol', 'shitpostes', 'memesespanol'],
    shitpost:     ['me_retraso_mental', 'MemesEnEspanol', 'Memes_de_actualidad', 'SpanishMemes', 'shitposting', 'shitpostes', 'memesespanol'],
    dank:         ['me_retraso_mental', 'Memes_de_actualidad', 'MemesEnEspanol', 'spanishdankmemes', 'dankmemes', 'memesespanol'],
    gaming:       ['jueguitos', 'videojuegos', 'gamingespanol', 'pcmasterrace', 'GamersBeingBros', 'memesgaminges'],
    wholesome:    ['wholesomememes', 'MadeMeSmile', 'HumansBeingBros', 'aww', 'momazosbonitos', 'cosasbonitas'],
    dark:         ['darkhumor', 'dankmemes', 'offensivememes', 'dark_humor', 'humoroscuro', 'humornegroes'],
    programacion: ['ProgrammerHumor', 'programmerhumor', 'softwaregore', 'techhumor', 'linuxmasterrace', 'codigomeme', 'devmemes'],
    random:       ['me_retraso_mental', 'MemesEnEspanol', 'Memes_de_actualidad', 'SpanishMemes', 'MemeEspañol', 'dankmemes', 'memes', 'wholesomememes', 'memesespanol'],
};

async function obtenerMeme(categoria) {
    const lista = subreddits[categoria] || subreddits.random;
    // Intentar varios subreddits hasta encontrar uno que funcione
    for (const sub of lista) {
        try {
            const res = await axios.get(`https://meme-api.com/gimme/${sub}`, { timeout: 15000 });
            if (res.data?.url && !res.data.nsfw) {
                return { url: res.data.url, titulo: res.data.title, sub: res.data.subreddit };
            }
        } catch { }
    }
    // Fallback: meme totalmente random
    try {
        const res = await axios.get('https://meme-api.com/gimme', { timeout: 15000 });
        if (res.data?.url) {
            return { url: res.data.url, titulo: res.data.title, sub: res.data.subreddit };
        }
    } catch { }
    return null;
}

async function cmdMeme(sock, jid, args) {
    const cat = (args[0] || 'random').toLowerCase();
    const categorias = {
        español: 'español', esp: 'español', es: 'español',
        shitpost: 'shitpost', dank: 'dank', random: 'random',
        gaming: 'gaming', gamer: 'gaming', juegos: 'gaming',
        wholesome: 'wholesome', tierno: 'wholesome', cute: 'wholesome',
        dark: 'dark', negro: 'dark',
        programacion: 'programacion', prog: 'programacion', code: 'programacion', codigo: 'programacion',
    };
    const categoria = categorias[cat] || 'random';

    await sock.sendMessage(jid, { text: '😂 _Buscando meme..._' });

    const meme = await obtenerMeme(categoria);
    if (!meme) {
        await sock.sendMessage(jid, { text: '❌ No pude encontrar un meme. Intenta de nuevo.' });
        return;
    }

    const caption = `😂 *${meme.titulo || 'Meme'}*\n📌 r/${meme.sub || 'memes'}\n\n_#meme español | shitpost | dank | gaming | wholesome | dark | programacion | random_`;
    await sock.sendMessage(jid, { image: { url: meme.url }, caption });
}

// ══════════════════════════════════════════
//  FRASES RANDOM
// ══════════════════════════════════════════
const frases = {
    motivacional: [
        'No importa lo que los demás piensen, tú solo sigue adelante. 💪',
        'Cada día es una nueva oportunidad para ser mejor que ayer.',
        'Los sueños no tienen fecha de vencimiento. Nunca es tarde para empezar.',
        'La diferencia entre lo imposible y lo posible reside en la determinación.',
        'Cae siete veces, levántate ocho. Eso es todo lo que se necesita.',
        'No esperes el momento perfecto, toma el momento y hazlo perfecto.',
        'Tu único límite eres tú mismo. Rompe las barreras que te impones.',
        'El éxito no es el destino, es el camino que recorres cada día.',
        'Nunca subestimes el poder de creer en ti mismo.',
        'Haz hoy lo que otros no hacen, para mañana tener lo que otros no tienen.',
        'El fracaso es solo la oportunidad de comenzar de nuevo, esta vez con más inteligencia.',
        'No te rindas. Las grandes cosas llevan tiempo.',
        'Convierte tus heridas en sabiduría.',
        'La vida no te dará lo que deseas, sino lo que te mereces por tu esfuerzo.',
        'Si puedes soñarlo, puedes lograrlo. La mente es el límite.',
        'La persistencia es el camino del éxito. — Charles Chaplin',
        'No cuentes los días, haz que los días cuenten. — Muhammad Ali',
        'El único modo de hacer un gran trabajo es amar lo que haces. — Steve Jobs',
        'Primero duerme con tus sueños, luego despierta y trabaja por ellos.',
        'Lo que no te mata, te hace más fuerte. — Friedrich Nietzsche',
        'Empieza donde estás. Usa lo que tienes. Haz lo que puedes.',
        'La motivación te pone en marcha, el hábito te mantiene en movimiento.',
        'No esperes. El tiempo nunca será el adecuado.',
        'Cada experto fue alguna vez un principiante. Sigue intentando.',
        'Tu actitud determina tu dirección.',
        'El camino se hace al andar. — Antonio Machado',
        'Si hoy fue difícil, mañana puedes hacerlo un poco mejor.',
        'La disciplina supera al talento cuando el talento no se disciplina.',
        'Un pequeño paso todos los días vale más que un gran salto una vez al año.',
        'No necesitas ser perfecto, necesitas ser constante.',
        'Lo imposible solo tarda un poco más.',
        'Tus resultados hablan más fuerte que tus excusas.',
        'No te compares, compite contigo mismo.',
        'La constancia transforma lo ordinario en extraordinario.',
        'Hazlo con miedo, pero hazlo.',
        'No dejes que un mal día te convenza de tener una mala vida.',
        'Tu progreso no tiene que verse perfecto para ser real.',
        'La versión de ti que quieres ver empieza hoy.',
        'Pequeñas victorias también son victorias.',
        'No necesitas permiso para empezar de nuevo.',
        'El esfuerzo de hoy es la tranquilidad de mañana.',
        'No abandones lo que quieres por lo que quieres ahora.',
        'Sigue. Aun cuando sea lento, sigue.',
        'Si fuera fácil, cualquiera lo haría.',
        'La paciencia también es una forma de fuerza.',
    ],
    sarcastica: [
        'Claro que tienes razón... y yo soy el Papa. 🙄',
        'Oh, ¡qué idea tan original! Como si nadie hubiera pensado en eso antes.',
        'Tranquilo, todos nacemos sin saber nada. Tú solo tardas más en aprenderlo.',
        'No te preocupes, el mundo gira más rápido cuando tú intentas pensar.',
        'Eres tan brillante que a veces apago el sol de lo innecesario que resulta.',
        'Sigo esperando que digas algo inteligente. No me voy a ningún lado.',
        'Gracias por tu opinión, la pondré justo aquí... con el resto de las que no pedí.',
        'Claro, porque tú siempre sabes más que Google y la Wikipedia juntos.',
        'Eso que dijiste fue tan profundo como un charco en verano.',
        'No te preocupes, algún día encontrarás tu cerebro. Ya llegará.',
        'Oh sí, eso tiene tanto sentido como bañarse con paraguas.',
        'Qué perspectiva tan fresca... para alguien que vive en el pasado.',
        'Sigue así y algún día serás mediocre. ¡Sí se puede!',
        'Claro, el universo conspiró para que dijeras eso. Qué desperdicio cósmico.',
        'Tu sabiduría me deja sin palabras. Lamentablemente, solo por un segundo.',
        'Qué afortunado soy de tenerte para recordarme lo obvio.',
        'Me alegra que lo hayas aclarado. Sin ti, quizás lo hubiera entendido solo.',
        'Claro, porque tu lógica nunca ha fallado... oh espera.',
        'No, no, dime más. Me encantan los cuentos de hadas.',
        'Tu aportación al mundo es... bueno, seguro que algo hay.',
        'Admirable. Conseguiste decir mucho diciendo absolutamente nada.',
        '¿Estudiaste para ser así o es un don natural?',
        'Claro que sí, campeón. Lo que tú digas.',
        'Fascinante. No había oído esa idea desde... nunca.',
        'Sigues sorprendiéndome. Hoy más que ayer, que ya fue memorable.',
        'Tu claridad mental debe estar en mantenimiento.',
        'Agradezco tu comentario. Lo ignoraré con estilo.',
        'Qué bien opinas. Lástima que nadie haya pedido auditoría.',
        'Si la intención era aportar caos, felicidades.',
        'Tu argumento tiene más huecos que una red sin internet.',
        'Hay gente que nace para brillar. Tú naciste para interrumpir.',
        'Tu lógica acaba de salir por la ventana.',
        'Casi me convenciste. Casi.',
        'Me encanta tu seguridad al equivocarte.',
        'Tu opinión llegó tarde, igual que tu sentido común.',
        'Qué valiente: hablar con tanta confianza y tan poca base.',
        'Tu comentario me inspiró a ignorarlo con más ganas.',
        'Eso fue tan útil como un paraguas en el desierto.',
        'Te aplaudo. Pero solo porque no quiero llorar.',
        'Tu razonamiento merece un documental de ficción.',
        'Eres el tipo de persona que apaga una conversación con solo entrar.',
        'Con cada mensaje tuyo, la paciencia se jubila.',
        'Sí, claro. Y el agua es seca.',
        'Tu coherencia se perdió hace rato y no volvió.',
    ],
    filosofica: [
        'No tememos a la muerte, sino a no haber vivido lo suficiente.',
        'Somos polvo de estrellas que se pregunta a sí mismo qué es el universo.',
        'La vida no es el tiempo que tienes, sino lo que haces con él.',
        'El único absoluto es que no hay absolutos.',
        'Conocerse a uno mismo es el principio de toda sabiduría. — Aristóteles',
        'La existencia precede a la esencia. Tú defines lo que eres.',
        'No busques la felicidad, conviértete en alguien digno de ser feliz.',
        'El mayor enemigo del conocimiento no es la ignorancia, sino la ilusión del conocimiento.',
        'Todo lo que vemos podría ser de otra manera. Todo lo que describimos podría ser diferente.',
        'El hombre es la medida de todas las cosas. — Protágoras',
        'Pienso, luego existo. Pero ¿existe todo lo que pienso?',
        'La vida tiene el significado que tú decides darle.',
        'Actúa como si cada acto tuyo fuera a convertirse en ley universal. — Kant',
        'El tiempo es un río que fluye hacia la nada. Navégalo con propósito.',
        'No hay camino hacia la paz. La paz es el camino. — Gandhi',
        'La felicidad no está en las cosas, sino en nosotros mismos.',
        'Todo fluye, nada permanece. — Heráclito',
        'Lo que sabemos es una gota; lo que ignoramos es un océano. — Newton',
        'No llores porque terminó, sonríe porque sucedió. — Gabriel García Márquez',
        'El hombre que mueve montañas comienza cargando piedras pequeñas. — Confucio',
        'Prefiero morir de pie que vivir de rodillas. — Emiliano Zapata',
        'La duda es el origen de la sabiduría.',
        'El que conoce a los demás es sabio; el que se conoce a sí mismo es iluminado. — Lao-Tse',
        'Ser es percibir o ser percibido. — George Berkeley',
        'La libertad es la posibilidad de dudar, de equivocarse. — Ignazio Silone',
        'El universo no tiene obligación de tener sentido para ti.',
        'A veces el silencio es la respuesta más honesta.',
        'No todo lo que pesa se ve.',
        'La mente es un espejo: de tanto pensar, también se empaña.',
        'El presente es el único punto donde el tiempo no miente.',
        'La verdad sin compasión también puede ser crueldad.',
        'Vivir es aceptar que toda certeza es provisional.',
        'La serenidad no es ausencia de tormenta, es aprender a navegarla.',
        'Somos más breves que nuestros recuerdos.',
        'Pensar demasiado también es una forma de caer.',
        'La mente inventa problemas cuando el corazón se queda callado.',
        'No siempre entendemos el dolor, pero siempre lo habitamos.',
        'La calma también puede ser una decisión.',
        'A veces crecer se siente como perder.',
        'Todo lo que termina deja una lección o una cicatriz.',
        'La vida cambia cuando dejas de pelear con lo inevitable.',
        'No todo vacío está vacío; algunos solo esperan sentido.',
        'La pregunta correcta vale más que una respuesta rápida.',
        'El alma también necesita descanso.',
    ],
    humor: [
        'Soy muy maduro para mi edad... de no hacer nada.',
        'Mi cama y yo nos llevamos bien. Ella me apoya en todo.',
        'Dieta de hoy: comer con culpa pero con gusto.',
        'No procrastino, simplemente opero en un modo paralelo de prioridades.',
        'Mi nivel de sarcasmo depende de tu nivel de estupidez.',
        'El optimista ve el vaso medio lleno. El realista ve que alguien tomó la mitad.',
        'Soy fan del silencio. Sobre todo el de los demás.',
        'No soy vago, soy eficiente energéticamente.',
        'Mis neuronas trabajan a media jornada los fines de semana.',
        'Amo la naturaleza, a pesar de lo que le hizo a mis planes.',
        'La vida es corta. Sonríe mientras aún tienes dientes.',
        'Si la vida te da limones, añade sal y tequila.',
        'Soy multitarea: puedo perder el tiempo, procrastinar y no hacer nada a la vez.',
        'Mi superhéroe favorito: el de tomar siesta cuando más se necesita.',
        'Siempre llego a tiempo. El problema es que el evento terminó ayer.',
        'Mi motivación y yo tenemos una relación complicada.',
        'El gym me llama todos los días. Yo no contesto.',
        'No estoy dormido, estoy cargando energía como los celulares.',
        'Mi único talento: convertir snacks en ansiedad existencial.',
        'El café no es una bebida, es un abrazo caliente de emergencia.',
        'Mi productividad empieza mañana, o pasado, según el clima.',
        'Hoy sí iba a ser responsable, pero me distraje siendo yo.',
        'Vengo de una larga línea de gente que aplaza todo.',
        'La gente que madruga debe tener acuerdos ocultos con el caos.',
        'El autocontrol se me fue, pero dejó saludos.',
        'Mis planes favoritos son los que incluyen no hacer planes.',
        'Si me ves quieto, probablemente estoy negociando con mi pereza.',
        'La motivación llegó, vio la escena y se fue.',
        'Tengo más excusas que batería en un celular viejo.',
        'Me gusta el dinero, pero el dinero no me corresponde.',
    ],
    amor: [
        'Amar es encontrar en la felicidad de otro tu propia felicidad.',
        'El amor no se ve con los ojos, sino con el alma.',
        'El verdadero amor no tiene un final feliz porque el verdadero amor nunca termina.',
        'Amar no es mirarse el uno al otro, es mirar juntos en la misma dirección. — Antoine de Saint-Exupéry',
        'Quien bien te quiere, te hará llorar. Pero de alegría.',
        'El amor es la única fuerza capaz de transformar a un enemigo en un amigo. — MLK',
        'Donde hay amor, hay vida. — Gandhi',
        'El amor es amistad que ha prendido fuego.',
        'No amas a alguien por su apariencia, sino por lo que te hace sentir.',
        'El amor verdadero no es otro que el amor a la vida misma.',
        'Amar es poner nuestra felicidad en la felicidad de otro.',
        'El amor no te hace débil, te hace valiente.',
        'La distancia más corta entre dos personas es una sonrisa.',
        'Amar es conocer a alguien tan bien que sus defectos te parecen encantadores.',
        'El amor no busca lo suyo, no se irrita, no piensa el mal.',
        'Lo más grande que puedes hacer por alguien es amarlo sin condiciones.',
        'Hay personas que llegan a tu vida y te cambian para siempre.',
        'El amor no se mide en tiempo, sino en momentos.',
        'Cuando amas, el mundo entero tiene más sentido.',
        'Prefiero tener momentos contigo que años sin ti.',
        'No hace falta prometer eternidades, basta con quedarse.',
        'Tu voz tiene el efecto de calmar mis tormentas.',
        'Si me faltas, hasta el día se me siente raro.',
        'Amarte es de las pocas cosas que no me cansan.',
        'A tu lado el silencio también se siente bonito.',
        'No necesito un final perfecto, solo seguir contigo.',
        'Hay amores que no hacen ruido, pero llenan todo.',
        'Te pienso y hasta el caos se me ordena.',
        'Eres de esas personas que hacen que el mundo valga un poco más.',
        'Si el cariño pesara, contigo ya no caminaría.',
    ],
    dark: [
        'La vida es corta... para algunas personas más que para otras.',
        'Optimismo: el arte de ver el lado bueno del problema que tú mismo causaste.',
        'Somos todos mortales hasta el primer beso y el segundo vaso de vino.',
        'Al final todos terminamos igual. La diferencia está en el camino.',
        'El universo es indiferente a tu sufrimiento. Buen provecho.',
        'La esperanza es lo último que se pierde. Por eso duele tanto.',
        'Todos sonreímos en las fotos. Nadie pregunta por qué.',
        'La vida no tiene sentido. Tú tampoco. Y así estamos.',
        'Existe la luz al final del túnel, pero también trenes.',
        'El tiempo cura todo, dicen. El tiempo también mata todo, dicen menos.',
        'Somos polvo de estrellas con ansiedad y deudas.',
        'Nada como una buena crisis existencial para empezar el lunes.',
        'La oscuridad no es ausencia de luz, es presencia de demasiada realidad.',
        'Cada día que pasa es uno menos. Aprovéchalo o no, el resultado es el mismo.',
        'La soledad no duele. Lo que duele es el silencio de quienes ya no están.',
        'A veces sobrevivir es el acto más ruidoso de todos.',
        'La tristeza también sabe quedarse callada.',
        'El problema con tocar fondo es que siempre hay más abajo.',
        'No todo monstruo vive afuera; algunos aprenden a vivir dentro.',
        'A veces la sombra llega antes que la persona.',
        'La ironía de vivir es que nadie sale ileso.',
        'Las cicatrices también cuentan historias.',
        'La noche solo parece eterna cuando estás despierto por dentro.',
        'No es dramatismo si el vacío realmente pesa.',
    ],
};

async function cmdFrase(sock, jid, args) {
    const alias = {
        motivacional: 'motivacional', motivacion: 'motivacional', motiva: 'motivacional', mot: 'motivacional',
        sarcastica: 'sarcastica', sarcasmo: 'sarcastica', sarcastic: 'sarcastica', sar: 'sarcastica',
        filosofica: 'filosofica', filosofia: 'filosofica', filo: 'filosofica',
        humor: 'humor', gracioso: 'humor', comico: 'humor', funny: 'humor',
        amor: 'amor', love: 'amor', romantica: 'amor', romantico: 'amor',
        dark: 'dark', oscura: 'dark', negro: 'dark', oscuro: 'dark',
    };
    const tipo = alias[(args[0] || '').toLowerCase()] || 'motivacional';
    const lista = frases[tipo] || frases.motivacional;
    const frase = lista[Math.floor(Math.random() * lista.length)];

    const emojis  = { motivacional: '✨', sarcastica: '😏', filosofica: '🧠', humor: '😂', amor: '❤️', dark: '🖤' };
    const nombres = { motivacional: 'Motivacional', sarcastica: 'Sarcástica', filosofica: 'Filosófica', humor: 'de Humor', amor: 'de Amor', dark: 'Dark' };
    const emoji  = emojis[tipo]  || '✨';
    const nombre = nombres[tipo] || 'Motivacional';

    await sock.sendMessage(jid, {
        text: `${emoji} *Frase ${nombre}*\n\n_"${frase}"_\n\n_Usa: #frase motivacional | sarcastica | filosofica | humor | amor | dark_`
    });
}

module.exports = { cmdShip, cmdMeme, cmdFrase };
