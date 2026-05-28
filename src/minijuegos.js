const { getUsuario, guardarUsuario } = require('./database');
const { verificarYNotificar } = require('./logros');

// Partidas activas por grupo: { jid: { tipo, respuesta, jugador, timeout, ... } }
const partidas = new Map();

// ══════════════════════════════════════════
//  BANCO DE PREGUNTAS TRIVIA
// ══════════════════════════════════════════
const TRIVIAS = [
    // ── Matemáticas y ciencia ──────────────────────────────────────────────
    { p: '¿Cuántos lados tiene un hexágono?',                           r: '6' },
    { p: '¿Cuántos colores tiene el arcoíris?',                         r: '7' },
    { p: '¿Cuántos segundos tiene un minuto?',                          r: '60' },
    { p: '¿Cuántos huesos tiene el cuerpo humano adulto?',              r: '206' },
    { p: '¿Cuántos lados tiene un octágono?',                           r: '8' },
    { p: '¿Cuántas horas tiene un día?',                                r: '24' },
    { p: '¿Cuántos minutos tiene una hora?',                            r: '60' },
    { p: '¿Cuál es el número pi redondeado a dos decimales?',           r: '3.14' },
    { p: '¿Cuál es el elemento químico con símbolo Au?',                r: 'oro' },
    { p: '¿Cuál es el elemento químico con símbolo Fe?',                r: 'hierro' },
    { p: '¿Cuál es el elemento químico con símbolo O?',                 r: 'oxigeno' },
    { p: '¿Cuál es el elemento químico con símbolo H?',                 r: 'hidrogeno' },
    { p: '¿Cuál es el metal más liviano?',                              r: 'litio' },
    { p: '¿Cuántas patas tiene una araña?',                             r: '8' },
    { p: '¿Cuántos cromosomas tiene una célula humana normal?',         r: '46' },
    { p: '¿A qué temperatura hierve el agua (°C)?',                     r: '100' },
    { p: '¿A qué temperatura se congela el agua (°C)?',                 r: '0' },
    { p: '¿Cuántos planetas tiene el sistema solar?',                   r: '8' },
    { p: '¿Cuál es el planeta más grande del sistema solar?',           r: 'jupiter' },
    { p: '¿Cuál es el planeta más pequeño del sistema solar?',          r: 'mercurio' },
    { p: '¿Cuál es el planeta más cercano al sol?',                     r: 'mercurio' },
    { p: '¿Cuántas lunas tiene la Tierra?',                             r: '1' },
    { p: '¿Cuál es la velocidad de la luz (km/s aprox)?',               r: '300000' },
    { p: '¿Qué órgano bombea sangre en el cuerpo humano?',              r: 'corazon' },
    { p: '¿Cuántas alas tiene una abeja?',                              r: '4' },
    { p: '¿Cuántos dientes tiene un adulto humano?',                    r: '32' },

    // ── Geografía ─────────────────────────────────────────────────────────
    { p: '¿Cuál es el país más grande del mundo?',                      r: 'rusia' },
    { p: '¿En qué año llegó el hombre a la luna?',                      r: '1969' },
    { p: '¿Cuántos continentes hay en la Tierra?',                      r: '7' },
    { p: '¿Cuál es el océano más grande del mundo?',                    r: 'pacifico' },
    { p: '¿En qué continente está Brasil?',                             r: 'america' },
    { p: '¿Cuál es la capital de Japón?',                               r: 'tokio' },
    { p: '¿Cuál es la capital de Francia?',                             r: 'paris' },
    { p: '¿Cuál es la capital de México?',                              r: 'ciudad de mexico' },
    { p: '¿Cuál es la capital de Argentina?',                           r: 'buenos aires' },
    { p: '¿Cuál es la capital de España?',                              r: 'madrid' },
    { p: '¿Cuál es la capital de Italia?',                              r: 'roma' },
    { p: '¿Cuál es el río más largo del mundo?',                        r: 'nilo' },
    { p: '¿Cuál es la montaña más alta del mundo?',                     r: 'everest' },
    { p: '¿En qué país está la Torre Eiffel?',                          r: 'francia' },
    { p: '¿En qué país está la Gran Muralla China?',                    r: 'china' },
    { p: '¿Cuál es el país más poblado del mundo?',                     r: 'india' },
    { p: '¿Cuál es el desierto más grande del mundo?',                  r: 'sahara' },
    { p: '¿En qué continente está Egipto?',                             r: 'africa' },
    { p: '¿Cuál es la capital de Brasil?',                              r: 'brasilia' },
    { p: '¿En qué país está Machu Picchu?',                             r: 'peru' },
    { p: '¿Cuál es el lago más grande del mundo?',                      r: 'caspio' },

    // ── Historia y cultura ────────────────────────────────────────────────
    { p: '¿Quién escribió "Don Quijote de la Mancha"?',                 r: 'cervantes' },
    { p: '¿En qué año comenzó la Segunda Guerra Mundial?',              r: '1939' },
    { p: '¿En qué año terminó la Segunda Guerra Mundial?',              r: '1945' },
    { p: '¿Quién fue el primer presidente de Estados Unidos?',          r: 'washington' },
    { p: '¿En qué año se descubrió América?',                           r: '1492' },
    { p: '¿Quién pintó la Mona Lisa?',                                  r: 'da vinci' },
    { p: '¿Quién inventó el teléfono?',                                 r: 'bell' },
    { p: '¿En qué año cayó el muro de Berlín?',                         r: '1989' },
    { p: '¿Quién fue el primer hombre en el espacio?',                  r: 'gagarin' },
    { p: '¿En qué año se fundó Facebook?',                              r: '2004' },
    { p: '¿En qué año salió el primer iPhone?',                         r: '2007' },
    { p: '¿Quién escribió "Romeo y Julieta"?',                          r: 'shakespeare' },
    { p: '¿Cuántos anillos tiene la bandera olímpica?',                 r: '5' },

    // ── Anime ─────────────────────────────────────────────────────────────
    { p: '¿De qué anime es el personaje Goku?',                         r: 'dragon ball' },
    { p: '¿De qué anime es Naruto Uzumaki?',                            r: 'naruto' },
    { p: '¿De qué anime es Monkey D. Luffy?',                           r: 'one piece' },
    { p: '¿De qué anime es Ichigo Kurosaki?',                           r: 'bleach' },
    { p: '¿De qué anime es Levi Ackerman?',                             r: 'attack on titan' },
    { p: '¿De qué anime es Edward Elric?',                              r: 'fullmetal alchemist' },
    { p: '¿De qué anime es Tanjiro Kamado?',                            r: 'demon slayer' },
    { p: '¿De qué anime es Saitama?',                                   r: 'one punch man' },
    { p: '¿De qué anime es Gojo Satoru?',                               r: 'jujutsu kaisen' },
    { p: '¿De qué anime es Killua Zoldyck?',                            r: 'hunter x hunter' },
    { p: '¿De qué anime es Spike Spiegel?',                             r: 'cowboy bebop' },
    { p: '¿De qué anime es Zero Two?',                                  r: 'darling in the franxx' },
    { p: '¿De qué anime es Itachi Uchiha?',                             r: 'naruto' },
    { p: '¿De qué anime es Vegeta?',                                    r: 'dragon ball' },
    { p: '¿De qué anime es Mikasa Ackerman?',                           r: 'attack on titan' },
    { p: '¿De qué anime es Light Yagami?',                              r: 'death note' },
    { p: '¿De qué anime es L Lawliet?',                                 r: 'death note' },
    { p: '¿De qué anime es Deku (Midoriya)?',                           r: 'my hero academia' },
    { p: '¿De qué anime es Bakugo Katsuki?',                            r: 'my hero academia' },
    { p: '¿De qué anime es Rimuru Tempest?',                            r: 'tensura' },
    { p: '¿En qué año se estrenó el anime original de Dragon Ball Z?',  r: '1989' },

    // ── Videojuegos ───────────────────────────────────────────────────────
    { p: '¿Cuántas esmeraldas necesitas para invocar al Wither en Minecraft?', r: 'ninguna' },
    { p: '¿Cómo se llama el protagonista de The Legend of Zelda?',      r: 'link' },
    { p: '¿De qué juego es el personaje Master Chief?',                 r: 'halo' },
    { p: '¿De qué juego es el personaje Kratos?',                       r: 'god of war' },
    { p: '¿Cuántos colores tiene el cubo de Tetris más largo (pieza I)?', r: '1' },
    { p: '¿De qué juego es el personaje Lara Croft?',                   r: 'tomb raider' },
    { p: '¿Cómo se llama la princesa de Super Mario?',                  r: 'peach' },
    { p: '¿De qué juego es el personaje Geralt de Rivia?',              r: 'the witcher' },
    { p: '¿De qué juego es el personaje Cloud Strife?',                 r: 'final fantasy' },
    { p: '¿En qué consola salió por primera vez Pokemon?',              r: 'game boy' },
    { p: '¿Cuántos pokémon iniciales hay en la primera generación?',    r: '3' },

    // ── Deportes ─────────────────────────────────────────────────────────
    { p: '¿Cuántos jugadores tiene un equipo de fútbol?',               r: '11' },
    { p: '¿Cuántos jugadores tiene un equipo de baloncesto?',           r: '5' },
    { p: '¿Cuántos sets tiene un partido de tenis al mejor de 3?',      r: '3' },
    { p: '¿En qué país se inventó el fútbol?',                          r: 'inglaterra' },
    { p: '¿Cuántas medallas olímpicas puede haber por deporte (oro, plata, bronce)?', r: '3' },
    { p: '¿Cuántos puntos vale un try en rugby?',                       r: '5' },
    { p: '¿Cada cuántos años se celebra el Mundial de fútbol?',         r: '4' },

    // ── Cine y entretenimiento ────────────────────────────────────────────
    { p: '¿En qué país se inventó el manga?',                           r: 'japon' },
    { p: '¿Cómo se llama el tiburón de la película "Buscando a Nemo"?', r: 'bruce' },
    { p: '¿De qué película es el personaje Jack Sparrow?',              r: 'piratas del caribe' },
    { p: '¿En qué película aparece el personaje Simba?',                r: 'el rey leon' },
    { p: '¿Quién interpreta a Iron Man en el MCU?',                     r: 'robert downey' },
    { p: '¿De qué saga es el personaje Hermione Granger?',              r: 'harry potter' },
    { p: '¿En qué película hay un personaje llamado Forrest Gump?',     r: 'forrest gump' },
    { p: '¿Cuántas Infinity Stones hay en Marvel?',                     r: '6' },
    { p: '¿De qué película es la frase "Hakuna Matata"?',               r: 'el rey leon' },
    { p: '¿En qué año salió la película Titanic?',                      r: '1997' },

    // ── Ciencia ampliada ──────────────────────────────────────────────────
    { p: '¿Cuántos elementos tiene la tabla periódica actualmente?',     r: '118' },
    { p: '¿Cuál es el elemento más abundante en el universo?',           r: 'hidrogeno' },
    { p: '¿Cuántas capas tiene la Tierra?',                              r: '4' },
    { p: '¿Cuántos huesos tiene el cráneo humano?',                      r: '22' },
    { p: '¿A qué velocidad viaja el sonido en el aire (m/s aprox)?',     r: '343' },
    { p: '¿Cuántas neuronas tiene el cerebro humano aproximadamente?',   r: '86 mil millones' },
    { p: '¿Qué parte del cuerpo humano nunca deja de crecer?',           r: 'orejas' },
    { p: '¿Cuánto tiempo tarda la luz del Sol en llegar a la Tierra?',   r: '8 minutos' },
    { p: '¿Cuántos corazones tiene un pulpo?',                           r: '3' },
    { p: '¿Cuál es el animal más rápido del mundo?',                     r: 'guepardo' },
    { p: '¿Qué gas produce la fotosíntesis en las plantas?',             r: 'oxigeno' },
    { p: '¿Cuál es el planeta más caliente del sistema solar?',          r: 'venus' },
    { p: '¿Cuántos años luz dura en llegar la luz de la estrella más cercana (Próxima Centauri)?', r: '4' },
    { p: '¿Cuántos pares de cromosomas tiene un ser humano?',            r: '23' },
    { p: '¿Cuál es el órgano más grande del cuerpo humano?',             r: 'piel' },
    { p: '¿Cuántos litros de sangre tiene el cuerpo humano promedio?',   r: '5' },
    { p: '¿Cuál es el metal más conductor de la electricidad?',          r: 'plata' },
    { p: '¿De qué material está hecho el diamante?',                     r: 'carbono' },
    { p: '¿Cuántas fases tiene la luna?',                                r: '8' },
    { p: '¿Cuál es el elemento con número atómico 1?',                   r: 'hidrogeno' },
    { p: '¿Qué órgano produce la insulina?',                             r: 'pancreas' },
    { p: '¿Cuántos kilómetros de diámetro tiene la Tierra aproximadamente?', r: '12742' },

    // ── Geografía ampliada ────────────────────────────────────────────────
    { p: '¿Cuál es el país más pequeño del mundo?',                      r: 'vaticano' },
    { p: '¿Cuál es la capital de Alemania?',                             r: 'berlin' },
    { p: '¿Cuál es la capital de Australia?',                            r: 'canberra' },
    { p: '¿Cuál es la capital de Canada?',                               r: 'ottawa' },
    { p: '¿Cuál es la capital de Egipto?',                               r: 'el cairo' },
    { p: '¿Cuál es la capital de China?',                                r: 'beijing' },
    { p: '¿Cuál es la capital de Rusia?',                                r: 'moscu' },
    { p: '¿Cuál es el país con más idiomas oficiales?',                  r: 'sudafrica' },
    { p: '¿En qué país está el Coliseo Romano?',                         r: 'italia' },
    { p: '¿Cuál es la cascada más alta del mundo?',                      r: 'angel' },
    { p: '¿En qué país está el Taj Mahal?',                              r: 'india' },
    { p: '¿Cuántos países conforman América del Sur?',                   r: '12' },
    { p: '¿Cuál es el continente más pequeño del mundo?',                r: 'oceania' },
    { p: '¿En qué país está la ciudad de Dubái?',                        r: 'emiratos arabes' },
    { p: '¿Cuál es el río más largo de América?',                        r: 'amazonas' },
    { p: '¿En qué continente está Madagascar?',                          r: 'africa' },
    { p: '¿Cuál es la capital de Colombia?',                             r: 'bogota' },
    { p: '¿Cuál es la capital de Chile?',                                r: 'santiago' },
    { p: '¿Cuál es la capital de Venezuela?',                            r: 'caracas' },
    { p: '¿Cuántos países hay en el mundo aproximadamente?',             r: '195' },

    // ── Historia y cultura ampliada ───────────────────────────────────────
    { p: '¿En qué año se fundó la ONU?',                                 r: '1945' },
    { p: '¿Quién fue el primer hombre en pisar la luna?',                r: 'armstrong' },
    { p: '¿En qué año comenzó la Revolución Francesa?',                  r: '1789' },
    { p: '¿Cuántos años duró la Guerra de los Cien Años?',               r: '116' },
    { p: '¿Quién inventó la bombilla eléctrica?',                        r: 'edison' },
    { p: '¿En qué año nació Jesucristo según el calendario gregoriano?', r: '0' },
    { p: '¿Quién fue el primer presidente de México?',                   r: 'guadalupe victoria' },
    { p: '¿En qué año se publicó "El Quijote" de Cervantes?',            r: '1605' },
    { p: '¿Qué civilización construyó las pirámides de Guiza?',          r: 'egipcios' },
    { p: '¿En qué año se fundó la empresa Apple?',                       r: '1976' },
    { p: '¿Quién inventó la imprenta?',                                  r: 'gutenberg' },
    { p: '¿En qué año se descubrió la penicilina?',                      r: '1928' },
    { p: '¿Quién fue Simón Bolívar?',                                    r: 'libertador' },
    { p: '¿En qué año murió Michael Jackson?',                           r: '2009' },
    { p: '¿Cuántos años vivió Leonardo da Vinci?',                       r: '67' },

    // ── Música ───────────────────────────────────────────────────────────
    { p: '¿De qué país es el reggaetón como género musical?',            r: 'puerto rico' },
    { p: '¿Cuántos integrantes tenía el grupo One Direction?',           r: '5' },
    { p: '¿Cómo se llama el grupo musical de Beyoncé que la hizo famosa?', r: 'destiny\'s child' },
    { p: '¿De qué país es el artista Bad Bunny?',                        r: 'puerto rico' },
    { p: '¿Cómo se llama el álbum debut de Billie Eilish?',              r: 'when we all fall asleep' },
    { p: '¿Cuántos integrantes tiene BTS?',                              r: '7' },
    { p: '¿Cuál fue el primer artista en llegar a 100 millones de oyentes en Spotify?', r: 'ed sheeran' },
    { p: '¿De qué país es el artista J Balvin?',                         r: 'colombia' },
    { p: '¿Quién compuso la Quinta Sinfonía?',                           r: 'beethoven' },
    { p: '¿Cuántos integrantes tenían los Beatles?',                     r: '4' },

    // ── Anime ampliado ───────────────────────────────────────────────────
    { p: '¿Cuántos capítulos tiene el anime original de Dragon Ball Z?', r: '291' },
    { p: '¿De qué anime es el personaje Nezuko Kamado?',                 r: 'demon slayer' },
    { p: '¿De qué anime es Yusuke Urameshi?',                            r: 'yu yu hakusho' },
    { p: '¿De qué anime es Inuyasha?',                                   r: 'inuyasha' },
    { p: '¿De qué anime es Usagi Tsukino?',                              r: 'sailor moon' },
    { p: '¿De qué anime es Shoyo Hinata?',                               r: 'haikyuu' },
    { p: '¿Cuántas sagas de Dragon Ball Z hay?',                         r: '5' },
    { p: '¿De qué anime es Boa Hancock?',                                r: 'one piece' },
    { p: '¿De qué anime es Tsunade?',                                    r: 'naruto' },
    { p: '¿De qué anime es Rintaro Okabe?',                              r: 'steins gate' },
    { p: '¿De qué anime es Violet Evergarden?',                          r: 'violet evergarden' },
    { p: '¿De qué anime es Hisoka?',                                     r: 'hunter x hunter' },
    { p: '¿De qué anime es Mob (Shigeo Kageyama)?',                      r: 'mob psycho 100' },
    { p: '¿De qué anime es Kaneki Ken?',                                 r: 'tokyo ghoul' },
    { p: '¿De qué anime es Makima?',                                     r: 'chainsaw man' },

    // ── Videojuegos ampliado ──────────────────────────────────────────────
    { p: '¿Cómo se llama la ciudad principal de GTA V?',                 r: 'los santos' },
    { p: '¿Cuántos jugadores soporta el Battle Royale de Fortnite?',     r: '100' },
    { p: '¿En qué juego aparece el personaje Aloy?',                     r: 'horizon' },
    { p: '¿De qué juego es el personaje Joel?',                          r: 'the last of us' },
    { p: '¿Cuántas generaciones de Pokémon hay actualmente?',            r: '9' },
    { p: '¿Cuál es el Pokémon número 1 de la Pokédex nacional?',         r: 'bulbasaur' },
    { p: '¿De qué juego es el personaje Arthur Morgan?',                 r: 'red dead redemption' },
    { p: '¿Cómo se llama la ciudad inicial de Minecraft en modo supervivencia?', r: 'no hay' },
    { p: '¿De qué juego es el personaje Ellie?',                         r: 'the last of us' },
    { p: '¿En qué juego debes construir y defender tu base con "trampas" y "guardianes"?', r: 'fortnite' },
    { p: '¿De qué juego es el personaje V?',                             r: 'cyberpunk 2077' },
    { p: '¿Cuántas estrellas necesitas para desbloquear a Yoshi en Super Mario 64?', r: '0' },
    { p: '¿Cómo se llama el villano principal de Cuphead?',              r: 'king dice' },

    // ── Cine y entretenimiento ampliado ───────────────────────────────────
    { p: '¿Quién interpreta a Thor en el MCU?',                          r: 'chris hemsworth' },
    { p: '¿Quién interpreta a Captain America en el MCU?',               r: 'chris evans' },
    { p: '¿En qué año salió la primera película de los Avengers?',       r: '2012' },
    { p: '¿Cuántas películas tiene la saga de "Fast and Furious"?',      r: '10' },
    { p: '¿De qué país es la serie "Squid Game"?',                       r: 'corea del sur' },
    { p: '¿Cómo se llama el actor que interpreta a Jack Sparrow?',       r: 'johnny depp' },
    { p: '¿En qué año se estrenó "El Padrino"?',                         r: '1972' },
    { p: '¿Quién dirige las películas de Star Wars originales?',         r: 'george lucas' },
    { p: '¿Cuántas partes tiene "El Señor de los Anillos" de Tolkien?',  r: '3' },
    { p: '¿En qué plataforma se estrenó "Stranger Things"?',             r: 'netflix' },
    { p: '¿Cuántas temporadas tiene "Breaking Bad"?',                    r: '5' },
    { p: '¿Quién interpreta a Tyrion Lannister en "Game of Thrones"?',   r: 'peter dinklage' },
    { p: '¿En qué año se estrenó "Toy Story"?',                          r: '1995' },
    { p: '¿Cuántas películas tiene el universo cinematográfico de Marvel (MCU) actualmente?', r: '33' },
    { p: '¿Cómo se llama la película de Pixar sobre el Día de Muertos?', r: 'coco' },

    // ── Películas Disney ──────────────────────────────────────────────────
    { p: '¿Cómo se llama la princesa de "La Sirenita"?',               r: 'ariel' },
    { p: '¿Cómo se llama el genio de la lámpara en "Aladdin"?',        r: 'genio' },
    { p: '¿En qué película Disney aparece el personaje Simba?',         r: 'el rey leon' },
    { p: '¿Cómo se llama el muñeco de nieve de "Frozen"?',             r: 'olaf' },
    { p: '¿Cuál es el nombre de la protagonista de "Brave/Valiente"?', r: 'merida' },
    { p: '¿Cómo se llama la protagonista de "Enredados"?',             r: 'rapunzel' },
    { p: '¿En qué película Disney aparece Maui, el semidiós?',          r: 'moana' },
    { p: '¿Cómo se llama la bruja mala de "Blancanieves"?',            r: 'reina malvada' },
    { p: '¿Cuál es el nombre del pez payaso protagonista de "Buscando a Nemo"?', r: 'nemo' },
    { p: '¿Cómo se llama la protagonista de "Cenicienta"?',            r: 'cenicienta' },
    { p: '¿De qué película Disney es la canción "Hakuna Matata"?',      r: 'el rey leon' },
    { p: '¿Cómo se llama la película de Disney sobre una niña que entra a un mundo de sus recuerdos?', r: 'inside out' },
    { p: '¿Cómo se llama el personaje principal de "Up"?',             r: 'carl' },
    { p: '¿En qué año se estrenó "El Rey León" original?',             r: '1994' },
    { p: '¿Cómo se llama la madrastra malvada de "Cenicienta"?',       r: 'lady tremaine' },
    { p: '¿Cuántos enanitos hay en "Blancanieves"?',                   r: '7' },
    { p: '¿Cómo se llama el elefante volador de Disney?',              r: 'dumbo' },
    { p: '¿Cuál es la película Disney sobre una rata chef?',           r: 'ratatouille' },
    { p: '¿Cómo se llama la protagonista de "Mulán"?',                 r: 'mulan' },
    { p: '¿Cómo se llama el robot de "Big Hero 6"?',                   r: 'baymax' },

    // ── Fútbol ───────────────────────────────────────────────────────────
    { p: '¿Cuántos mundiales de fútbol ha ganado Brasil?',             r: '5' },
    { p: '¿En qué año ganó Argentina su tercer mundial de fútbol?',    r: '2022' },
    { p: '¿Qué país organizó el Mundial de fútbol 2022?',              r: 'qatar' },
    { p: '¿Cuántos mundiales de fútbol ha ganado Alemania?',           r: '4' },
    { p: '¿Quién es el máximo goleador histórico de la Champions League?', r: 'cristiano ronaldo' },
    { p: '¿En qué club juega actualmente Lionel Messi (2024)?',        r: 'inter miami' },
    { p: '¿Cuántos jugadores hay en la cancha por equipo en fútbol?',  r: '11' },
    { p: '¿Cada cuántos años se juega el Mundial de fútbol?',          r: '4' },
    { p: '¿Cuál es el estadio con mayor capacidad del mundo?',         r: 'rungrado' },
    { p: '¿Qué selección ganó el primer Mundial de fútbol en 1930?',   r: 'uruguay' },
    { p: '¿Cuántos mundiales ha ganado Italia?',                       r: '4' },
    { p: '¿Cómo se llama el trofeo que se entrega al campeón del Mundial?', r: 'trofeo fifa' },
    { p: '¿Qué país ha ganado más Copas América de fútbol?',           r: 'uruguay' },
    { p: '¿En qué año se fundó el Real Madrid?',                       r: '1902' },
    { p: '¿Cómo se llama el estadio del FC Barcelona?',                r: 'camp nou' },
    { p: '¿Qué significa la sigla UEFA?',                              r: 'union de asociaciones europeas de futbol' },

    // ── Series de TV ─────────────────────────────────────────────────────
    { p: '¿En qué año se estrenó "Game of Thrones"?',                  r: '2011' },
    { p: '¿Cuántas temporadas tiene "Friends"?',                       r: '10' },
    { p: '¿De qué país es la serie "La Casa de Papel"?',               r: 'españa' },
    { p: '¿Cómo se llama el profesor de "La Casa de Papel"?',          r: 'el profesor' },
    { p: '¿En qué plataforma se estrenó "Squid Game"?',                r: 'netflix' },
    { p: '¿Cuántas temporadas tiene "Breaking Bad"?',                  r: '5' },
    { p: '¿Cómo se llama el personaje principal de "Breaking Bad"?',   r: 'walter white' },
    { p: '¿De qué país es la serie "Dark"?',                           r: 'alemania' },
    { p: '¿En qué ciudad ocurre "Stranger Things"?',                   r: 'hawkins' },
    { p: '¿Cuántas temporadas tiene "The Office" (versión USA)?',      r: '9' },
    { p: '¿Cómo se llama el protagonista de "Narcos"?',                r: 'pablo escobar' },
    { p: '¿En qué plataforma está "The Mandalorian"?',                 r: 'disney plus' },
    { p: '¿Cómo se llama el bebé Yoda en "The Mandalorian"?',          r: 'grogu' },
    { p: '¿Cuántos episodios tiene la primera temporada de "Squid Game"?', r: '9' },
    { p: '¿De qué ciudad es el personaje Dexter Morgan?',              r: 'miami' },

    // ── Deportes ─────────────────────────────────────────────────────────
    { p: '¿Cuántos jugadores hay en un equipo de voleibol?',           r: '6' },
    { p: '¿Cuántos sets gana un partido de voleibol al mejor de 5?',   r: '3' },
    { p: '¿Cuántos metros mide una piscina olímpica?',                 r: '50' },
    { p: '¿Cuántos puntos vale un gol en hockey sobre hielo?',         r: '1' },
    { p: '¿En qué deporte se usa el término "strike"?',                r: 'beisbol' },
    { p: '¿Cuántos jugadores hay en un equipo de béisbol?',            r: '9' },
    { p: '¿Cada cuántos años se celebran los Juegos Olímpicos de Invierno?', r: '4' },
    { p: '¿En qué deporte se compite en el Tour de France?',           r: 'ciclismo' },
    { p: '¿Cuántos metros tiene una carrera de 100 metros planos?',    r: '100' },
    { p: '¿En qué deporte se usa el término "home run"?',              r: 'beisbol' },
    { p: '¿Cuántos jugadores participan en un partido de tenis individual?', r: '2' },

    // ── Filosofía ────────────────────────────────────────────────────────
    { p: '¿Quién dijo "Pienso, luego existo"?',                        r: 'descartes' },
    { p: '¿Quién es considerado el padre de la filosofía occidental?', r: 'socrates' },
    { p: '¿Cómo se llama la obra principal de Platón sobre la justicia?', r: 'la republica' },
    { p: '¿Qué filósofo fue maestro de Alejandro Magno?',              r: 'aristoteles' },
    { p: '¿Quién escribió "Así habló Zaratustra"?',                    r: 'nietzsche' },
    { p: '¿Qué filósofo es famoso por la frase "El hombre es la medida de todas las cosas"?', r: 'protagoras' },
    { p: '¿Cómo se llama el método de enseñanza a base de preguntas de Sócrates?', r: 'mayeutica' },
    { p: '¿Quién escribió "El contrato social"?',                      r: 'rousseau' },
    { p: '¿Cuál es la obra más famosa de Immanuel Kant?',              r: 'critica de la razon pura' },
    { p: '¿Qué filósofo griego fue condenado a morir bebiendo cicuta?', r: 'socrates' },
    { p: '¿Quién desarrolló la teoría del utilitarismo?',              r: 'bentham' },
    { p: '¿Cuál es la alegoría más famosa de Platón?',                 r: 'la caverna' },

    // ── Música latina ────────────────────────────────────────────────────
    { p: '¿De qué país es la cantante Shakira?',                       r: 'colombia' },
    { p: '¿De qué país es el artista Bad Bunny?',                      r: 'puerto rico' },
    { p: '¿Cómo se llama el género musical de Daddy Yankee?',          r: 'reggaeton' },
    { p: '¿Cuántos premios Grammy Latino ha ganado Carlos Vives?',     r: '2' },
    { p: '¿De qué país es la artista Karol G?',                        r: 'colombia' },
    { p: '¿Quién es conocido como "El Cantante" en la salsa latina?',  r: 'hector lavoe' },
    { p: '¿De qué país es el artista J Balvin?',                       r: 'colombia' },
    { p: '¿Cuál fue el primer artista latino en superar 10 mil millones de streams en Spotify?', r: 'bad bunny' },
    { p: '¿De qué país es la cantante Gloria Estefan?',                r: 'cuba' },
    { p: '¿Cómo se llama el hit viral de Daddy Yankee de 2004?',       r: 'gasolina' },
    { p: '¿De qué país es el cantante Marc Anthony?',                  r: 'estados unidos' },
    { p: '¿Qué artista canta "Despacito" junto a Luis Fonsi?',         r: 'daddy yankee' },
    { p: '¿De qué país es el artista Ozuna?',                          r: 'puerto rico' },
    { p: '¿Cómo se llama el álbum debut de Karol G?',                  r: 'unstoppable' },
    { p: '¿Cuál es el apellido real de Shakira?',                      r: 'mebarak' },

    // ── Biología ─────────────────────────────────────────────────────────
    { p: '¿Cuántas células tiene el cuerpo humano aproximadamente?',   r: '37 billones' },
    { p: '¿Qué orgánulo celular se conoce como la "central energética"?', r: 'mitocondria' },
    { p: '¿Cómo se llama el proceso por el que las plantas hacen su alimento?', r: 'fotosintesis' },
    { p: '¿Qué molécula transporta el oxígeno en la sangre?',          r: 'hemoglobina' },
    { p: '¿Cuántos reinos tiene la clasificación biológica clásica?',  r: '5' },
    { p: '¿Qué tipo de reproducción no necesita de dos progenitores?', r: 'asexual' },
    { p: '¿Cómo se llama la célula sexual masculina?',                 r: 'espermatozoide' },
    { p: '¿Cuál es el animal más grande del mundo?',                   r: 'ballena azul' },
    { p: '¿Qué es el ADN?',                                            r: 'acido desoxirribonucleico' },
    { p: '¿Cómo se llaman los seres vivos que producen su propio alimento?', r: 'autotrofos' },
    { p: '¿Qué órgano produce la bilis en el cuerpo humano?',          r: 'higado' },
    { p: '¿Cuántas cámaras tiene el corazón humano?',                  r: '4' },

    // ── Medicina ─────────────────────────────────────────────────────────
    { p: '¿Cuál es la temperatura normal del cuerpo humano?',          r: '37' },
    { p: '¿Cómo se llama la ciencia que estudia las enfermedades?',    r: 'patologia' },
    { p: '¿Qué vitamina produce el cuerpo humano al exponerse al sol?', r: 'vitamina d' },
    { p: '¿Cómo se llama el médico especialista en el corazón?',       r: 'cardiologo' },
    { p: '¿Qué es la presión arterial normal en adultos?',             r: '120 80' },
    { p: '¿Cuánto tiempo tarda en cicatrizar una herida leve aproximadamente?', r: '7 dias' },
    { p: '¿Cuál es el grupo sanguíneo considerado "donante universal"?', r: 'o negativo' },
    { p: '¿Qué órgano filtra la sangre en el cuerpo humano?',          r: 'riñones' },
    { p: '¿Cómo se llama el médico especialista en niños?',            r: 'pediatra' },
    { p: '¿Cuántos huesos tiene la columna vertebral?',                r: '33' },
    { p: '¿Cómo se llama la enfermedad causada por falta de insulina?', r: 'diabetes' },
    { p: '¿Cuántas capas tiene la piel humana?',                       r: '3' },

    // ── Leyendas urbanas ─────────────────────────────────────────────────
    { p: '¿De qué país proviene la leyenda de "La Llorona"?',          r: 'mexico' },
    { p: '¿Cómo se llama el monstruo del lago Ness?',                  r: 'nessie' },
    { p: '¿En qué estado de EE.UU. se reportaron los avistamientos del "Chupacabras"?', r: 'puerto rico' },
    { p: '¿Qué criatura mitológica tiene cabeza de hombre y cuerpo de toro?', r: 'minotauro' },
    { p: '¿Cómo se llama el triángulo geográfico famoso por desapariciones de aviones y barcos?', r: 'triangulo de las bermudas' },
    { p: '¿De qué país proviene la leyenda del "Hombre del saco"?',    r: 'españa' },
    { p: '¿Cómo se llama la leyenda latinoamericana sobre una mujer que llora por sus hijos?', r: 'la llorona' },
    { p: '¿Qué personaje mitológico aparece para llevarse niños que no duermen?', r: 'el cuco' },
    { p: '¿Cómo se llama la criatura que según la leyenda aparece en los espejos al decir su nombre 3 veces?', r: 'bloody mary' },
    { p: '¿En qué país se originó la leyenda del "Slenderman"?',       r: 'estados unidos' },
    { p: '¿Cómo se llama el ser de la mitología andina que roba la grasa de las personas?', r: 'pishtaco' },
    { p: '¿Qué leyenda dice que un conejo vive en la luna?',           r: 'leyenda azteca' },

    // ── Terror y horror ──────────────────────────────────────────────────
    { p: '¿De qué película de terror es el personaje Freddy Krueger?', r: 'pesadilla en elm street' },
    { p: '¿Cómo se llama el payaso de "It" de Stephen King?',          r: 'pennywise' },
    { p: '¿En qué año se estrenó "El Exorcista"?',                     r: '1973' },
    { p: '¿De qué película es el personaje Michael Myers?',            r: 'halloween' },
    { p: '¿Quién escribió la novela original de "Frankenstein"?',      r: 'mary shelley' },
    { p: '¿De qué película de terror es el personaje Chucky?',         r: 'child\'s play' },
    { p: '¿En qué año se estrenó "El Resplandor" de Kubrick?',         r: '1980' },
    { p: '¿Cómo se llama el antagonista de la saga "Scream"?',         r: 'ghostface' },
    { p: '¿De qué película es el personaje Hannibal Lecter?',          r: 'el silencio de los inocentes' },
    { p: '¿Quién escribió la novela original de "Drácula"?',           r: 'bram stoker' },
    { p: '¿En qué año se estrenó "Get Out" de Jordan Peele?',          r: '2017' },
    { p: '¿De qué país es la película de terror "Ringu" (El Aro)?',   r: 'japon' },

    // ── Barbie ───────────────────────────────────────────────────────────
    { p: '¿En qué año fue creada la muñeca Barbie?',                   r: '1959' },
    { p: '¿Cómo se llama el novio de Barbie?',                         r: 'ken' },
    { p: '¿Quién creó a la muñeca Barbie?',                            r: 'ruth handler' },
    { p: '¿De qué empresa es la muñeca Barbie?',                       r: 'mattel' },
    { p: '¿Cómo se llama la mejor amiga de Barbie?',                   r: 'midge' },
    { p: '¿En qué año se estrenó la película live-action de Barbie con Margot Robbie?', r: '2023' },

    // ── Hello Kitty ──────────────────────────────────────────────────────
    { p: '¿De qué empresa japonesa es el personaje Hello Kitty?',      r: 'sanrio' },
    { p: '¿En qué año fue creado Hello Kitty?',                        r: '1974' },
    { p: '¿Cómo se llama el personaje principal de Sanrio con cara de gato blanco?', r: 'hello kitty' },
    { p: '¿Cómo se llama realmente Hello Kitty (su nombre completo)?', r: 'kitty white' },
    { p: '¿De qué país es el personaje Hello Kitty según su historia oficial?', r: 'reino unido' },
    { p: '¿De qué color es el moño característico de Hello Kitty?',    r: 'rojo' },

    // ── Mitología griega ──────────────────────────────────────────────────
    { p: '¿Quién es el dios del mar en la mitología griega?',           r: 'poseidon' },
    { p: '¿Quién es el dios del fuego y la forja en la mitología griega?', r: 'hefesto' },
    { p: '¿Cómo se llama el mensajero de los dioses en la mitología griega?', r: 'hermes' },
    { p: '¿Quién mató al Minotauro según la mitología griega?',         r: 'teseo' },
    { p: '¿Cómo se llama el inframundo en la mitología griega?',        r: 'hades' },
    { p: '¿Quién es la diosa del amor en la mitología griega?',         r: 'afrodita' },
    { p: '¿Cómo se llama el héroe griego que realizó los 12 trabajos?', r: 'hercules' },
    { p: '¿Quién es la diosa de la sabiduría en la mitología griega?',  r: 'atenea' },
    { p: '¿Cómo se llama el caballo alado de la mitología griega?',     r: 'pegaso' },
    { p: '¿Qué criatura tiene cuerpo de mujer y cola de serpiente en la mitología griega?', r: 'medusa' },
    { p: '¿Cómo se llama el rey de los dioses en la mitología griega?', r: 'zeus' },
    { p: '¿Quién es el dios de la guerra en la mitología griega?',      r: 'ares' },

    // ── Literatura universal ──────────────────────────────────────────────
    { p: '¿Quién escribió "Cien años de soledad"?',                     r: 'garcia marquez' },
    { p: '¿De qué país es el autor Gabriel García Márquez?',            r: 'colombia' },
    { p: '¿Quién escribió "1984"?',                                     r: 'george orwell' },
    { p: '¿Quién escribió "El principito"?',                            r: 'saint exupery' },
    { p: '¿Quién escribió "Crimen y castigo"?',                         r: 'dostoievski' },
    { p: '¿En qué año se publicó "Don Quijote de la Mancha"?',          r: '1605' },
    { p: '¿Quién escribió "La Odisea"?',                                r: 'homero' },
    { p: '¿Cómo se llama el protagonista de "El principito"?',          r: 'el principito' },
    { p: '¿Quién escribió "Frankenstein"?',                             r: 'mary shelley' },
    { p: '¿De qué país es el escritor Franz Kafka?',                    r: 'chequia' },
    { p: '¿Quién escribió "Drácula"?',                                  r: 'bram stoker' },
    { p: '¿Cómo se llama la novela de Orwell sobre una granja con animales que se rebelan?', r: 'rebelion en la granja' },

    // ── Tecnología e internet ─────────────────────────────────────────────
    { p: '¿En qué año se fundó Google?',                                r: '1998' },
    { p: '¿En qué año se fundó YouTube?',                               r: '2005' },
    { p: '¿En qué año se fundó Instagram?',                             r: '2010' },
    { p: '¿En qué año se fundó TikTok?',                               r: '2016' },
    { p: '¿Quién fundó Microsoft?',                                     r: 'bill gates' },
    { p: '¿En qué año se fundó Amazon?',                                r: '1994' },
    { p: '¿Quién fundó Tesla?',                                         r: 'elon musk' },
    { p: '¿Qué significa "HTTP" en las páginas web?',                  r: 'hypertext transfer protocol' },
    { p: '¿Cuántos bits tiene un byte?',                               r: '8' },
    { p: '¿En qué año se creó el primer iPhone?',                      r: '2007' },
    { p: '¿Quién inventó el World Wide Web?',                           r: 'tim berners-lee' },
    { p: '¿En qué año se fundó Netflix?',                              r: '1997' },
    { p: '¿Cuánto almacenamiento tiene 1 terabyte en gigabytes?',      r: '1024' },

    // ── Gastronomía ───────────────────────────────────────────────────────
    { p: '¿De qué país es la pizza?',                                   r: 'italia' },
    { p: '¿De qué país es el sushi?',                                   r: 'japon' },
    { p: '¿Cuál es el ingrediente principal del guacamole?',            r: 'aguacate' },
    { p: '¿De qué país es el platillo "Paella"?',                       r: 'españa' },
    { p: '¿Cuál es el queso más famoso de Francia?',                    r: 'brie' },
    { p: '¿De qué país es el "Ceviche"?',                               r: 'peru' },
    { p: '¿Cuál es la bebida nacional de México?',                      r: 'tequila' },
    { p: '¿De qué fruta se hace el vino?',                              r: 'uva' },
    { p: '¿Cuál es el ingrediente principal de la "Nutella"?',          r: 'avellana' },
    { p: '¿De qué país es el "Asado"?',                                 r: 'argentina' },
    { p: '¿Cuál es la comida callejera más popular de México?',         r: 'tacos' },
    { p: '¿De qué país es el platillo "Arepas"?',                       r: 'venezuela' },

    // ── Cultura japonesa ──────────────────────────────────────────────────
    { p: '¿Cómo se llama la poesía tradicional japonesa de 17 sílabas?', r: 'haiku' },
    { p: '¿Qué significa "kawaii" en japonés?',                         r: 'tierno' },
    { p: '¿Cómo se llama el arte japonés del papel doblado?',           r: 'origami' },
    { p: '¿Qué significa "Sensei" en japonés?',                         r: 'maestro' },
    { p: '¿Cómo se llama el teatro tradicional japonés con máscaras?',  r: 'kabuki' },
    { p: '¿Qué es el "Manga" en Japón?',                               r: 'comic japones' },
    { p: '¿Cómo se llama el anime de Studio Ghibli con una niña en un mundo de espíritus?', r: 'el viaje de chihiro' },
    { p: '¿Quién fundó Studio Ghibli?',                                 r: 'hayao miyazaki' },
    { p: '¿Cómo se llama el festival de los muertos en Japón?',         r: 'obon' },
    { p: '¿Qué significa "Arigatou" en japonés?',                       r: 'gracias' },

    // ── K-pop ────────────────────────────────────────────────────────────
    { p: '¿Cuántos integrantes tiene BTS?',                             r: '7' },
    { p: '¿De qué país es el K-pop?',                                   r: 'corea del sur' },
    { p: '¿Cómo se llama el fandom de BTS?',                           r: 'army' },
    { p: '¿Cuántas integrantes tiene BLACKPINK?',                       r: '4' },
    { p: '¿Cómo se llama el fandom de BLACKPINK?',                     r: 'blink' },
    { p: '¿Cuál fue el primer grupo K-pop en ganar un Grammy?',         r: 'bts' },
    { p: '¿En qué plataforma se volvió viral "Gangnam Style" de PSY?', r: 'youtube' },
    { p: '¿En qué año salió "Dynamite" de BTS?',                       r: '2020' },
    { p: '¿Cómo se llama la integrante de BLACKPINK que es solista con "Shut Down"?', r: 'jennie' },
    { p: '¿Cuántos integrantes tiene el grupo SEVENTEEN?',              r: '13' },

    // ── Historia latinoamericana ──────────────────────────────────────────
    { p: '¿En qué año se independizó México?',                          r: '1821' },
    { p: '¿En qué año se independizó Colombia?',                        r: '1810' },
    { p: '¿Quién fue el libertador de Venezuela, Colombia y Ecuador?',  r: 'simon bolivar' },
    { p: '¿En qué año se independizó Argentina?',                       r: '1816' },
    { p: '¿Cómo se llamaba el líder de la Revolución Mexicana de 1910?', r: 'francisco madero' },
    { p: '¿Qué civilización construyó Machu Picchu?',                   r: 'inca' },
    { p: '¿En qué país está la ciudad de Cartagena de Indias?',         r: 'colombia' },
    { p: '¿Quién fue el primer presidente de Argentina?',               r: 'bernardino rivadavia' },
    { p: '¿En qué país se habla quechua como lengua indígena principal?', r: 'peru' },
    { p: '¿Cómo se llamaba el Imperio azteca antes de la conquista?',   r: 'mexico-tenochtitlan' },
    { p: '¿En qué año llegó Cristóbal Colón a América?',               r: '1492' },

    // ── Arte ─────────────────────────────────────────────────────────────
    { p: '¿Quién pintó "La Noche Estrellada"?',                         r: 'van gogh' },
    { p: '¿Quién pintó "La Última Cena"?',                              r: 'da vinci' },
    { p: '¿Quién pintó "El Grito"?',                                    r: 'edvard munch' },
    { p: '¿De qué país era el pintor Salvador Dalí?',                   r: 'españa' },
    { p: '¿Quién pintó "Las Meninas"?',                                 r: 'velazquez' },
    { p: '¿Quién es la pintora mexicana famosa por sus autorretratos con flores en el cabello?', r: 'frida kahlo' },
    { p: '¿Qué movimiento artístico inició Pablo Picasso?',             r: 'cubismo' },
    { p: '¿Dónde está expuesta la Mona Lisa?',                          r: 'museo del louvre' },
    { p: '¿En qué ciudad está el museo del Louvre?',                    r: 'paris' },
    { p: '¿De qué país es el artista Banksy?',                          r: 'reino unido' },

    // ── Pokémon ───────────────────────────────────────────────────────────
    { p: '¿Cuál es el Pokémon de tipo fuego inicial de la primera generación?', r: 'charmander' },
    { p: '¿Cuál es el Pokémon de tipo agua inicial de la primera generación?', r: 'squirtle' },
    { p: '¿Cómo se llama el Pokémon legendario de la primera generación que controla el tiempo?', r: 'celebi' },
    { p: '¿Cuántas evoluciones tiene Eevee?',                           r: '8' },
    { p: '¿Cómo se llama el rival de Ash en la primera temporada del anime?', r: 'gary' },
    { p: '¿En qué generación aparece Lucario por primera vez?',         r: '4' },
    { p: '¿Cuál es el Pokémon más pesado de la primera generación?',    r: 'snorlax' },
    { p: '¿Cómo se llama el Pokémon legendario de fuego de la primera generación?', r: 'moltres' },
    { p: '¿Cuántos Pokémon hay en la primera generación?',              r: '151' },
    { p: '¿De qué tipo es el Pokémon Gengar?',                          r: 'fantasma' },

    // ── Ciencia curiosa ───────────────────────────────────────────────────
    { p: '¿Cuánto tiempo tarda la Tierra en dar una vuelta alrededor del sol?', r: '365 dias' },
    { p: '¿Qué planeta tiene los anillos más famosos del sistema solar?', r: 'saturno' },
    { p: '¿Cuántas lunas tiene Júpiter aproximadamente?',               r: '95' },
    { p: '¿A qué temperatura aproximada explota una estrella supernova?', r: 'billones de grados' },
    { p: '¿Cuánto tarda la luz del sol en llegar a la Tierra?',         r: '8 minutos' },
    { p: '¿Qué es un agujero negro?',                                   r: 'region del espacio con gravedad extrema' },
    { p: '¿Cuántos años tiene el universo aproximadamente?',            r: '13800 millones' },
    { p: '¿Cuál es el planeta más frío del sistema solar?',             r: 'urano' },
    { p: '¿Qué es la "Vía Láctea"?',                                    r: 'la galaxia donde esta la tierra' },
    { p: '¿Cuántas estrellas hay en la Vía Láctea aproximadamente?',    r: '200 mil millones' },

    // ── Marvel y DC ───────────────────────────────────────────────────────
    { p: '¿Cuál es el nombre real de Black Panther?',                   r: 'tchalla' },
    { p: '¿De qué país es el superhéroe Black Panther?',                r: 'wakanda' },
    { p: '¿Quién es el archienemigo de Batman?',                        r: 'joker' },
    { p: '¿Cómo se llama el escudo de Captain America?',                r: 'vibranium' },
    { p: '¿Cuál es el nombre real de Hulk?',                            r: 'bruce banner' },
    { p: '¿Quién creó a los X-Men en el universo Marvel?',              r: 'profesor x' },
    { p: '¿Cómo se llama la espada de Thor?',                           r: 'mjolnir' },
    { p: '¿Cuál es el nombre real de Wonder Woman?',                    r: 'diana prince' },
    { p: '¿De qué planeta viene Superman?',                             r: 'krypton' },
    { p: '¿Cómo se llama el villano principal de "Avengers: Infinity War"?', r: 'thanos' },
    { p: '¿Cuál es la debilidad de Superman?',                          r: 'kryptonita' },
    { p: '¿Cómo se llama el alter ego de Aquaman?',                     r: 'arthur curry' },
];

// ══════════════════════════════════════════
//  BANCO DE PALABRAS — AHORCADO
// ══════════════════════════════════════════
const PALABRAS_AHORCADO = [
    // animales
    'cocodrilo','mariposa','tortuga','pingüino','delfin','jaguar','camello','cangrejo','gorila','halcon',
    // naturaleza
    'volcan','tornado','galaxia','relámpago','glaciar','tsunami','desierto','cascada','nebulosa','arrecife',
    // comida
    'albondiga','enchilada','guacamole','quesadilla','empanada','chocolate','hamburguesa','tamarindo','horchata','esquite',
    // anime / cultura pop
    'shinigami','kunai','hokage','sharingan','bankai','jutsu','katana','sensei','dattebayo','nakama',
    // videojuegos
    'dungeon','respawn','crafteo','inventario','habilidad','combate','escudo','pocion','dragón','castillo',
    // general
    'aventura','misterio','galaxia','piramide','laberinto','tesoro','fantasma','vampiro','guerrero','hechizo',
    'universo','horizonte','libertad','esperanza','fortaleza','centinela','emboscada','tormenta','brujula','leyenda',
    // más animales
    'murciélago','armadillo','colibrí','chameleon','mantarraya','serpiente','pantera','ornitorrinco','flamenco','albatros',
    'rinoceronte','hipopotamo','mapache','comadreja','salamandra','ciempies','escorpion','tarántula','medusa','pulpo',
    // más naturaleza y ciencia
    'atmosfera','magnetico','cristal','terremoto','meteoro','pentagono','ecuacion','molecula','proteina','vitamina',
    'caleidoscopio','holograma','termometro','microscopio','telescopio','supernova','agujero','dimension','particula','electrico',
    // más comida y cultura
    'panqueque','mermelada','mantequilla','aguacate','cangrejo','calamar','langosta','camarones','berenjenas','coliflor',
    'tiramisu','croissant','brigadeiro','pupusa','arepas','tamales','pozole','carnitas','enchilada','barbacoa',
    // más anime y pop
    'jutsu','chakra','shinobi','akatsuki','hollows','shinigami','quincy','arrancar','espada','bankkai',
    'quirk','vilano','heroe','titan','coloso','nomus','endeavor','plusultra','deku','shoto',
    // más videojuegos
    'calabozo','hechicero','paladín','explorador','artesania','supervivencia','conquista','galaxia','escuadron','infiltración',
    'gremio','calabaza','monstruo','defensa','habilidad','mazmorra','aldea','fortaleza','alianza','coalicion',
    // palabras largas y desafiantes
    'extraordinario','revolucionario','metamorfosis','perplejidad','excentricidad','protagonista','antagonista','melancolia',
    'bioluminiscencia','alucinacion','paralización','constelacion','civilizacion','descubrimiento','perseverancia',
];

function dibujarAhorcado(errores) {
    const etapas = [
        '╔═══╗\n║    \n║    \n║    \n╚════',
        '╔═══╗\n║   😵\n║    \n║    \n╚════',
        '╔═══╗\n║   😵\n║    |\n║    \n╚════',
        '╔═══╗\n║   😵\n║   /|\n║    \n╚════',
        '╔═══╗\n║   😵\n║   /|\\\n║    \n╚════',
        '╔═══╗\n║   😵\n║   /|\\\n║   / \n╚════',
        '╔═══╗\n║   😵\n║   /|\\\n║   / \\\n╚════',
    ];
    return etapas[Math.min(errores, 6)];
}

function mostrarPalabra(palabra, adivinadas) {
    return palabra.split('').map(l => (adivinadas.has(l) ? l.toUpperCase() : '_')).join(' ');
}

// ══════════════════════════════════════════
//  BANCO DE PALABRAS — SCRAMBLE
// ══════════════════════════════════════════
const PALABRAS_SCRAMBLE = [
    // 4 letras
    { p: 'gato', cat: '🐱' }, { p: 'luna', cat: '🌙' }, { p: 'amor', cat: '❤️' },
    { p: 'roca', cat: '🪨' }, { p: 'agua', cat: '💧' }, { p: 'nube', cat: '☁️' },
    { p: 'noche', cat: '🌙' }, { p: 'sol', cat: '☀️' }, { p: 'rey', cat: '👑' },
    // 5 letras
    { p: 'anime', cat: '⛩️' }, { p: 'ninja', cat: '🥷' }, { p: 'robot', cat: '🤖' },
    { p: 'bruja', cat: '🧙' }, { p: 'playa', cat: '🏖️' }, { p: 'tigre', cat: '🐯' },
    { p: 'fuego', cat: '🔥' }, { p: 'llave', cat: '🗝️' }, { p: 'dulce', cat: '🍬' },
    { p: 'sello', cat: '🪪' }, { p: 'mundo', cat: '🌍' }, { p: 'espia', cat: '🕵️' },
    // 6 letras
    { p: 'dragon', cat: '🐲' }, { p: 'magia', cat: '✨' }, { p: 'espada', cat: '🗡️' },
    { p: 'pirata', cat: '🏴‍☠️' }, { p: 'samurai', cat: '⚔️' }, { p: 'bosque', cat: '🌲' },
    { p: 'trueno', cat: '⚡' }, { p: 'ciudad', cat: '🏙️' }, { p: 'flama', cat: '🔥' },
    { p: 'piedra', cat: '🪨' }, { p: 'sombra', cat: '🌑' }, { p: 'portal', cat: '🌀' },
    // 7+ letras
    { p: 'castillo', cat: '🏰' }, { p: 'universo', cat: '🌌' }, { p: 'volcán', cat: '🌋' },
    { p: 'tesoro', cat: '💰' }, { p: 'galaxia', cat: '🌠' }, { p: 'misterio', cat: '🔮' },
    { p: 'fantasma', cat: '👻' }, { p: 'guerrero', cat: '🪖' }, { p: 'leyenda', cat: '📜' },
    { p: 'tormenta', cat: '🌩️' }, { p: 'laberinto', cat: '🌀' }, { p: 'aventura', cat: '🧭' },
    { p: 'destino', cat: '🎯' }, { p: 'planeta', cat: '🪐' }, { p: 'estrella', cat: '⭐' },
    { p: 'dragones', cat: '🐉' }, { p: 'guardian', cat: '🛡️' }, { p: 'revancha', cat: '⚡' },
    // Taylor Swift eras
    { p: 'swiftie', cat: '🌟' }, { p: 'folklore', cat: '🌲' }, { p: 'midnights', cat: '🌙' },
    { p: 'fearless', cat: '✨' }, { p: 'reputation', cat: '🐍' }, { p: 'evermore', cat: '🍂' },
    // animales
    { p: 'delfin', cat: '🐬' }, { p: 'canguro', cat: '🦘' }, { p: 'tortuga', cat: '🐢' },
    { p: 'pulpo', cat: '🐙' }, { p: 'avestruz', cat: '🦤' }, { p: 'mariposa', cat: '🦋' },
    { p: 'cocodrilo', cat: '🐊' }, { p: 'rinoceronte', cat: '🦏' }, { p: 'mapache', cat: '🦝' },
    // comida
    { p: 'pizza', cat: '🍕' }, { p: 'sushi', cat: '🍱' }, { p: 'tacos', cat: '🌮' },
    { p: 'ramen', cat: '🍜' }, { p: 'helado', cat: '🍦' }, { p: 'waffles', cat: '🧇' },
    { p: 'churro', cat: '🍬' }, { p: 'mango', cat: '🥭' }, { p: 'aguacate', cat: '🥑' },
    // tecnología
    { p: 'cohete', cat: '🚀' }, { p: 'satelite', cat: '🛸' }, { p: 'hacker', cat: '💻' },
    { p: 'codigo', cat: '⌨️' }, { p: 'algoritmo', cat: '🤖' }, { p: 'binario', cat: '🔢' },
    // deportes
    { p: 'olimpiadas', cat: '🏅' }, { p: 'campeon', cat: '🏆' }, { p: 'estadio', cat: '🏟️' },
    { p: 'portero', cat: '🥅' }, { p: 'corredor', cat: '🏃' }, { p: 'escalada', cat: '🧗' },
    // emociones
    { p: 'alegria', cat: '😊' }, { p: 'tristeza', cat: '😢' }, { p: 'venganza', cat: '😤' },
    { p: 'traicion', cat: '🗡️' }, { p: 'nostalgia', cat: '🌅' }, { p: 'esperanza', cat: '🌈' },
    // más fantasia
    { p: 'maldicion', cat: '🔮' }, { p: 'brujeria', cat: '🧙' }, { p: 'alquimia', cat: '⚗️' },
    { p: 'mutante', cat: '🧬' }, { p: 'cyborg', cat: '🤖' }, { p: 'fenix', cat: '🔥' },
    { p: 'quimera', cat: '🐉' }, { p: 'minotauro', cat: '🐂' }, { p: 'grifo', cat: '🦅' },
    // palabras largas desafiantes
    { p: 'metamorfosis', cat: '🦋' }, { p: 'revolucion', cat: '✊' }, { p: 'constelacion', cat: '⭐' },
    { p: 'protagonista', cat: '🎭' }, { p: 'melancolia', cat: '🌧️' }, { p: 'perseverancia', cat: '💪' },
    { p: 'civilizacion', cat: '🏛️' }, { p: 'descubrimiento', cat: '🔭' }, { p: 'extraordinario', cat: '🌟' },
];

function scrambleWord(palabra) {
    const arr = palabra.split('');
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    // Si quedó igual, forzar cambio
    if (arr.join('') === palabra && palabra.length > 1) {
        [arr[0], arr[1]] = [arr[1], arr[0]];
    }
    return arr.join('').toUpperCase();
}

// ══════════════════════════════════════════
//  BANCO DE PERSONAJES — #QUIEN
// ══════════════════════════════════════════
const PERSONAJES_QUIEN = [
    // ── Anime ─────────────────────────────────────────────────────────────
    { nombre: 'naruto', pistas: [
        'Es un ninja con marcas en las mejillas y pelo rubio alborotado.',
        'Su sueño es convertirse en el líder máximo de su aldea ninja.',
        'Su jutsu más famoso es el Rasengan y puede crear cientos de clones.',
    ]},
    { nombre: 'goku', pistas: [
        'Es un guerrero de una raza extraterrestre conocida por su poder de combate.',
        'Tiene el cabello negro pero se vuelve rubio y de pie cuando se transforma.',
        'Su técnica más icónica es el Kamehameha y ama comer sin parar.',
    ]},
    { nombre: 'luffy', pistas: [
        'Siempre lleva un sombrero de paja y quiere ser el Rey de los Piratas.',
        'Comió una fruta del diablo que convirtió su cuerpo completamente en hule.',
        'Lidera una tripulación llamada los Sombreros de Paja en "One Piece".',
    ]},
    { nombre: 'light yagami', pistas: [
        'Es un estudiante modelo que un día encuentra un cuaderno caído del cielo.',
        'Ese cuaderno le da el poder de matar a cualquier persona escribiendo su nombre.',
        'Se autodenomina Kira y su mayor enemigo es el detective conocido solo como L.',
    ]},
    { nombre: 'saitama', pistas: [
        'Entrenó tan duro que perdió todo su cabello pero ganó un poder absurdo.',
        'Es capaz de derrotar a cualquier enemigo con un único golpe.',
        'Es el protagonista calvo de "One Punch Man" y es un héroe por hobby.',
    ]},
    { nombre: 'levi ackerman', pistas: [
        'Es de baja estatura pero considerado el soldado más fuerte de la humanidad.',
        'Maneja espadas con una velocidad y precisión inigualables.',
        'Pertenece al Cuerpo de Exploración en "Attack on Titan".',
    ]},
    { nombre: 'eren yeager', pistas: [
        'Creció dentro de murallas gigantes que protegen a la humanidad de seres enormes.',
        'Descubrió que puede transformarse en uno de esos seres enormes.',
        'Es el protagonista de "Attack on Titan" y su mayor deseo es la libertad.',
    ]},
    { nombre: 'gojo satoru', pistas: [
        'Tiene el cabello blanco y ojos celestes que suele cubrir con una venda negra.',
        'Usa una técnica llamada Infinito que lo hace prácticamente intocable.',
        'Es el maestro jujutsu más poderoso en "Jujutsu Kaisen".',
    ]},
    { nombre: 'tanjiro kamado', pistas: [
        'Tiene una cicatriz en la frente y lleva una caja de madera en la espalda.',
        'Se convirtió en cazador de demonios para salvar a su hermana convertida en uno.',
        'Es el protagonista de "Demon Slayer" y usa la respiración del agua.',
    ]},
    { nombre: 'zenitsu agatsuma', pistas: [
        'Es un cazador de demonios muy cobarde que llora y grita constantemente.',
        'Su poder real aparece solo cuando se queda dormido en batalla.',
        'Usa la respiración del trueno y aparece en "Demon Slayer".',
    ]},
    { nombre: 'itachi uchiha', pistas: [
        'Es un prodigio ninja que masacró a casi todo su clan en una noche.',
        'Sus ojos rojos con tres puntos le permiten usar ilusiones y técnicas avanzadas.',
        'Es el hermano mayor de Sasuke en el universo de "Naruto".',
    ]},
    { nombre: 'vegeta', pistas: [
        'Es el príncipe orgulloso de una raza de guerreros élite casi extintos.',
        'Tiene una famosa rivalidad con el protagonista de su serie y odia perder.',
        'Aparece en "Dragon Ball Z" y su frase más famosa habla del nivel de poder.',
    ]},
    { nombre: 'edward elric', pistas: [
        'Es un alquimista muy joven con un brazo y una pierna de metal.',
        'Junto a su hermano busca la Piedra Filosofal para recuperar sus cuerpos.',
        'Es el Alquimista de Acero y protagonista de "Fullmetal Alchemist".',
    ]},
    { nombre: 'killua zoldyck', pistas: [
        'Proviene de una familia de asesinos de élite y tiene el cabello blanco.',
        'Su habilidad especial le permite controlar la electricidad con su cuerpo.',
        'Es el mejor amigo de Gon en "Hunter x Hunter".',
    ]},
    { nombre: 'deku', pistas: [
        'Nació sin poderes en un mundo donde casi todos los tienen.',
        'Recibió una habilidad legendaria de parte del héroe más grande del mundo.',
        'Su nombre real es Izuku Midoriya y es el protagonista de "My Hero Academia".',
    ]},
    { nombre: 'bakugo', pistas: [
        'Tiene el carácter más explosivo literalmente y figurativamente de su clase.',
        'Sus manos producen sudor que puede inflamarse y generar explosiones.',
        'Es el rival constante del protagonista en "My Hero Academia".',
    ]},
    { nombre: 'rimuru tempest', pistas: [
        'Fue reencarnado en otro mundo como una criatura sin forma fija de color azul.',
        'Tiene la habilidad de absorber y copiar los poderes de lo que devora.',
        'Es el protagonista de "Tensura: That Time I Got Reincarnated as a Slime".',
    ]},
    { nombre: 'spike spiegel', pistas: [
        'Es un cazarrecompensas que viaja por el espacio en una nave llamada Bebop.',
        'Tiene un pasado oscuro ligado a la mafia y practica el jeet kune do.',
        'Es el protagonista de "Cowboy Bebop" y su lema es "ver ya luego".',
    ]},
    { nombre: 'roronoa zoro', pistas: [
        'Quiere convertirse en el mejor espadachín del mundo y a veces se pierde.',
        'Combate usando tres espadas a la vez, una en cada mano y otra con la boca.',
        'Es el primer tripulante reclutado por el protagonista de "One Piece".',
    ]},
    { nombre: 'mikasa ackerman', pistas: [
        'Siempre lleva una bufanda roja y es la guerrera más hábil de su generación.',
        'Es adoptada por la familia del protagonista tras perder a sus padres.',
        'Aparece en "Attack on Titan" y tiene una lealtad inquebrantable.',
    ]},
    { nombre: 'l lawliet', pistas: [
        'Siempre está sentado en una postura extraña con las rodillas al pecho.',
        'Es el detective más brillante del mundo y nunca revela su identidad real.',
        'Su archirrival usa un cuaderno de la muerte en "Death Note".',
    ]},
    { nombre: 'ichigo kurosaki', pistas: [
        'Es un adolescente de pelo naranja que de repente adquiere poderes de un guerrero espiritual.',
        'Puede ver espíritus y protege su ciudad de criaturas llamadas Hollows.',
        'Es el protagonista de "Bleach" y su arma se llama Zangetsu.',
    ]},
    // ── Videojuegos ───────────────────────────────────────────────────────
    { nombre: 'link', pistas: [
        'Es un héroe vestido de verde que porta un escudo y una espada legendaria.',
        'Viaja por un reino de fantasía lleno de mazmorras para derrotar al mal.',
        'Aparece en "The Legend of Zelda" y lleva la Espada Maestra.',
    ]},
    { nombre: 'mario', pistas: [
        'Es un fontanero italiano con bigote rojo y un sombrero rojo con una M.',
        'Su misión más famosa es rescatar a una princesa de un rey tortuga.',
        'Salta sobre hongos y corre por los Reinos de "Super Mario".',
    ]},
    { nombre: 'kratos', pistas: [
        'Es un guerrero de cabeza rapada cubierto por cenizas blancas y tatuajes rojos.',
        'Antes era el Dios de la Guerra de la mitología griega.',
        'En sus aventuras más recientes viaja con su hijo Atreus por tierras nórdicas.',
    ]},
    { nombre: 'cloud strife', pistas: [
        'Es un mercenario de cabello rubio puntiagudo con una espada más grande que él.',
        'Fue soldado de élite de una corporación malvada que controla la energía del planeta.',
        'Es el protagonista de "Final Fantasy VII" y pertenece a AVALANCHE.',
    ]},
    { nombre: 'geralt de rivia', pistas: [
        'Tiene el cabello blanco largo y los ojos amarillos de gato.',
        'Es un cazador de monstruos profesional que cobra por sus servicios.',
        'Es el protagonista de "The Witcher" y su frase habitual es "hmm".',
    ]},
    { nombre: 'master chief', pistas: [
        'Siempre aparece cubierto de una armadura verde y dorada sin quitársela nunca.',
        'Es un supersoldado genéticamente modificado del siglo 26.',
        'Es el protagonista de la saga "Halo" y su número es 117.',
    ]},
    { nombre: 'ezio auditore', pistas: [
        'Es un noble italiano que se convierte en asesino para vengar a su familia.',
        'Vive en el Renacimiento italiano y escala edificios históricos con facilidad.',
        'Es el protagonista más conocido de "Assassin\'s Creed".',
    ]},
    { nombre: 'solid snake', pistas: [
        'Es un soldado de operaciones especiales experto en infiltración sigilosa.',
        'Su nombre en clave hace referencia a un reptil sin patas.',
        'Es el protagonista de la saga "Metal Gear Solid".',
    ]},
    { nombre: 'lara croft', pistas: [
        'Es una arqueóloga y exploradora inglesa de familia noble.',
        'Viaja al rededor del mundo buscando artefactos antiguos en lugares peligrosos.',
        'Es la protagonista de "Tomb Raider".',
    ]},
    { nombre: 'pikachu', pistas: [
        'Es una criatura pequeña y amarilla con orejas negras y mejillas rojas.',
        'Almacena electricidad en sus mejillas y puede lanzar rayos poderosos.',
        'Es la mascota oficial de Pokémon y el compañero favorito de Ash.',
    ]},
    { nombre: 'sonic', pistas: [
        'Es un erizo azul conocido por ser el más rápido del mundo.',
        'Su mayor enemigo es un científico malvado con bigote que usa robots.',
        'Aparece en la saga de "Sonic the Hedgehog" de Sega.',
    ]},
    // ── Cine y series ─────────────────────────────────────────────────────
    { nombre: 'batman', pistas: [
        'Es un millonario que de noche se disfraza para combatir el crimen.',
        'No tiene superpoderes pero es experto en artes marciales, tecnología y detective.',
        'Su alter ego es Bruce Wayne y protege la ciudad de Gotham.',
    ]},
    { nombre: 'hermione granger', pistas: [
        'Es una joven bruja de cabello rizado y cabeza muy bien puesta.',
        'Estudia en el colegio de magia más famoso de la ficción.',
        'Aparece en la saga de "Harry Potter" como la mejor amiga del protagonista.',
    ]},
    { nombre: 'iron man', pistas: [
        'Es un genio millonario que construyó una armadura dentro de una cueva.',
        'Su corazón funciona gracias a un reactor de tecnología avanzada.',
        'Su verdadero nombre es Tony Stark y es uno de los Avengers más famosos.',
    ]},
    { nombre: 'spiderman', pistas: [
        'Fue picado por una araña radiactiva de adolescente y adquirió sus poderes.',
        'Puede lanzar telarañas y tiene un sentido especial que le avisa del peligro.',
        'Su alter ego es un fotógrafo de Nueva York llamado Peter Parker.',
    ]},
    { nombre: 'darth vader', pistas: [
        'Respira de forma muy particular con un aparato en el pecho.',
        'Es el líder militar del Imperio Galáctico vestido completamente de negro.',
        'Aparece en "Star Wars" y tiene una revelación familiar muy famosa.',
    ]},
    { nombre: 'joker', pistas: [
        'Tiene la cara pintada de blanco con la boca extendida en una sonrisa roja.',
        'Es el villano más icónico de un superhéroe de Gotham.',
        'Su identidad real es desconocida y es el archienemigo de Batman.',
    ]},
    { nombre: 'jack sparrow', pistas: [
        'Es un capitán pirata excéntrico que camina de forma peculiar.',
        'Siempre está buscando su barco llamado La Perla Negra.',
        'Aparece en "Piratas del Caribe" interpretado por Johnny Depp.',
    ]},
    { nombre: 'sherlock holmes', pistas: [
        'Es un detective inglés con una capacidad de observación sobrehumana.',
        'Vive en Baker Street 221B y su mejor amigo es el Dr. Watson.',
        'Su método consiste en deducir todo a partir de pequeños detalles.',
    ]},
    { nombre: 'walter white', pistas: [
        'Es un profesor de química que se convierte en productor de drogas.',
        'Lo hace para pagar su tratamiento contra una enfermedad terminal.',
        'Es el protagonista de "Breaking Bad" y su alter ego se llama Heisenberg.',
    ]},
    { nombre: 'jon snow', pistas: [
        'Es un joven que se une a los guardianes del límite norte del reino.',
        'Tiene una relación especial con un lobo gigante y un dragón.',
        'Aparece en "Game of Thrones" y su verdadero origen es un misterio durante mucho tiempo.',
    ]},
    // ── Más anime ─────────────────────────────────────────────────────────
    { nombre: 'nezuko kamado', pistas: [
        'Es una joven que fue convertida en demonio pero mantiene su humanidad.',
        'Su hermano mayor la lleva en una caja de madera y la protege.',
        'Aparece en "Demon Slayer" y puede encoger su tamaño a voluntad.',
    ]},
    { nombre: 'kakashi hatake', pistas: [
        'Siempre lleva la mitad del rostro cubierto por una máscara.',
        'Copió más de mil jutsus con un ojo especial que obtuvo de su compañero.',
        'Es el sensei del equipo 7 en "Naruto" y es conocido como el Copiador de Ninjutsu.',
    ]},
    { nombre: 'shanks', pistas: [
        'Es un pirata de cabello rojo y uno de los cuatro más poderosos del mundo.',
        'Perdió un brazo salvando a un niño que luego se convirtió en pirata.',
        'Aparece en "One Piece" y fue el que le dio el sombrero de paja al protagonista.',
    ]},
    { nombre: 'escanor', pistas: [
        'De noche es el ser más débil y tímido; de día su poder crece con el sol.',
        'Su habilidad se llama El Único y a mediodía es absolutamente invencible.',
        'Es el León del Pecado del Orgullo de "The Seven Deadly Sins".',
    ]},
    { nombre: 'accelerator', pistas: [
        'Su poder le permite redirigir cualquier vector que toque, haciéndolo casi invulnerable.',
        'Fue el esper más fuerte de la Academia y protagonizó actos muy oscuros.',
        'Aparece en "A Certain Magical Index" y más tarde se convierte en antihéroe.',
    ]},
    { nombre: 'satoru gojo', pistas: [
        'Tiene el cabello blanco y ojos azules que esconde con una venda negra.',
        'Su técnica Infinito lo hace prácticamente intocable para cualquier ataque.',
        'Es el maestro de jujutsu más poderoso en "Jujutsu Kaisen".',
    ]},
    { nombre: 'asta', pistas: [
        'Nació sin magia en un mundo donde todos la tienen, pero no se rindió jamás.',
        'Encontró una espada negra que puede anular completamente la magia.',
        'Es el protagonista de "Black Clover" y quiere convertirse en el Rey Mago.',
    ]},
    { nombre: 'denji', pistas: [
        'Fusionó su cuerpo con un demonio perro para sobrevivir y pagar una deuda.',
        'Puede transformarse en un ser que tiene motosierras brotando de su cuerpo.',
        'Es el protagonista de "Chainsaw Man" y su sueño es simple: comer pan y tocino.',
    ]},
    { nombre: 'zero two', pistas: [
        'Tiene cuernos rojos y es mitad humana, mitad klaxosaurio.',
        'Pilota un robot gigante llamado Strelizia junto a su pareja.',
        'Aparece en "Darling in the FranXX" y llama "Darling" a su piloto favorito.',
    ]},
    { nombre: 'mob', pistas: [
        'Parece un chico normal y tímido pero tiene poderes psíquicos extremos.',
        'Cuando sus emociones llegan al 100% desencadena un poder devastador.',
        'Es el protagonista de "Mob Psycho 100" y trabaja con un falso psíquico.',
    ]},
    { nombre: 'hisoka', pistas: [
        'Es un mago payaso con naipes como arma y una personalidad impredecible.',
        'Le encanta pelear contra personas de gran potencial para verlas crecer.',
        'Aparece en "Hunter x Hunter" y su nen se llama Bungee Gum.',
    ]},
    { nombre: 'all might', pistas: [
        'Es el héroe número uno del mundo con una sonrisa siempre en el rostro.',
        'Su poder se llama One For All y puede transmitirlo a otra persona.',
        'Es el mentor del protagonista en "My Hero Academia" y su frase es "¡Estoy aquí!".',
    ]},
    // ── Más videojuegos ───────────────────────────────────────────────────
    { nombre: 'joel miller', pistas: [
        'Es un contrabandista endurecido que perdió a alguien muy cercano al inicio de un apocalipsis.',
        'Debe escoltar a través de un territorio peligroso lleno de infectados y humanos hostiles.',
        'Es el protagonista de "The Last of Us" y protege a una joven llamada Ellie.',
    ]},
    { nombre: 'aloy', pistas: [
        'Creció como una paria entre una tribu que venera antiguas máquinas como dioses.',
        'Combate criaturas mecánicas gigantes que parecen animales prehistóricos.',
        'Es la protagonista de "Horizon Zero Dawn" y busca la verdad sobre su origen.',
    ]},
    { nombre: 'arthur morgan', pistas: [
        'Es un forajido leal a su banda que poco a poco cuestiona su forma de vida.',
        'Vive en la era del Salvaje Oeste americano a finales del siglo XIX.',
        'Es el protagonista de "Red Dead Redemption 2" y tiene un diario donde dibuja.',
    ]},
    { nombre: 'ellie', pistas: [
        'Es una adolescente inmune a una infección que convierte a las personas en monstruos.',
        'Toca la guitarra y tiene un lenguaje muy colorido para su edad.',
        'Aparece en "The Last of Us" y recorre un mundo postapocalíptico junto a Joel.',
    ]},
    { nombre: 'samus aran', pistas: [
        'Es una cazarrecompensas intergaláctica que suele combatir dentro de una armadura potenciada.',
        'Combate contra piratas espaciales y criaturas llamadas Metroids.',
        'Es la protagonista de la saga "Metroid" de Nintendo.',
    ]},
    // ── Más cine y series ─────────────────────────────────────────────────
    { nombre: 'thanos', pistas: [
        'Es un titán de piel morada que busca reunir seis gemas de poder infinito.',
        'Su plan es eliminar la mitad de la vida del universo con un chasquido de dedos.',
        'Es el villano principal de "Avengers: Infinity War".',
    ]},
    { nombre: 'tyrion lannister', pistas: [
        'Es un noble enano de una de las familias más ricas de los Siete Reinos.',
        'Tiene una mente brillante y usa la política como su principal arma.',
        'Aparece en "Game of Thrones" y es interpretado por Peter Dinklage.',
    ]},
    { nombre: 'michael scott', pistas: [
        'Es el gerente de una empresa de papel en Scranton, Pensilvania.',
        'Cree que es el mejor jefe del mundo aunque sus empleados piensan diferente.',
        'Es el personaje principal de la serie "The Office" (versión americana).',
    ]},
    { nombre: 'heisenberg', pistas: [
        'Es el alter ego de un profesor de química que se vuelve criminal.',
        'Usa un sombrero fedora negro y gafas oscuras para su nueva identidad.',
        'Aparece en "Breaking Bad" y su producto tiene fama de calidad imbatible.',
    ]},
    { nombre: 'daenerys targaryen', pistas: [
        'Es la última representante de una familia de reyes que fueron derrocados.',
        'Tiene dragones que crió desde que nacieron de unos huevos de piedra.',
        'Aparece en "Game of Thrones" y su apodo es la Madre de Dragones.',
    ]},
    { nombre: 'yoda', pistas: [
        'Es un maestro de 900 años de edad, pequeño, verde y con orejas enormes.',
        'Habla con el orden de las palabras invertido en sus oraciones.',
        'Es el gran maestro jedi en "Star Wars" y entrenó a algunos de los más grandes.',
    ]},
];

// ══════════════════════════════════════════
//  SISTEMA DE RACHAS
// ══════════════════════════════════════════
function procesarRacha(u) {
    if (!u.contadores) u.contadores = {};
    u.racha    = (u.racha    || 0) + 1;
    u.rachaMax = Math.max(u.rachaMax || 0, u.racha);
    let bonus = 0, msg = '';
    if      (u.racha === 3)                        { bonus = 75;  msg = `\n\n🔥 *¡Racha de 3 victorias!* +${bonus} bonus ⓃNexCoins`; }
    else if (u.racha === 5)                        { bonus = 150; msg = `\n\n🔥🔥 *¡Racha de 5 victorias!* +${bonus} bonus ⓃNexCoins`; }
    else if (u.racha === 10)                       { bonus = 350; msg = `\n\n🏆 *¡RACHA LEGENDARIA x10!* +${bonus} bonus ⓃNexCoins`; }
    else if (u.racha > 10 && u.racha % 5 === 0)   { bonus = 200; msg = `\n\n⚡ *¡Racha imparable x${u.racha}!* +${bonus} bonus ⓃNexCoins`; }
    else if (u.racha >= 3)                         { msg = `\n\n🔥 Racha: *${u.racha} victorias seguidas*`; }
    if (bonus > 0) u.monedas = (u.monedas || 0) + bonus;
    return msg;
}

function resetRacha(u) {
    u.racha = 0;
}

// ══════════════════════════════════════════
//  TRIVIA
// ══════════════════════════════════════════
async function cmdTrivia(sock, jid, senderJid) {
    if (partidas.has(jid)) {
        await sock.sendMessage(jid, { text: '⚠️ Ya hay un minijuego activo. Respóndelo primero.' });
        return;
    }
    const TRIVIAS_TODAS = [...TRIVIAS, ...TRIVIAS_TAYLOR];
    const q = TRIVIAS_TODAS[Math.floor(Math.random() * TRIVIAS_TODAS.length)];
    const premio = Math.floor(Math.random() * 201) + 200;

    const timeout = setTimeout(async () => {
        if (partidas.get(jid)?.tipo === 'trivia') {
            partidas.delete(jid);
            // Resetear racha del iniciador: nadie respondió correctamente
            try {
                const uTO = getUsuario(senderJid);
                resetRacha(uTO);
                guardarUsuario(senderJid, uTO);
            } catch {}
            await sock.sendMessage(jid, { text: `⏰ *¡Tiempo agotado!*\nLa respuesta era: *${q.r}*` }).catch(() => {});
        }
    }, 30000);

    partidas.set(jid, { tipo: 'trivia', respuesta: q.r, premio, timeout });

    await sock.sendMessage(jid, {
        text: `🧠 *¡TRIVIA!*\n\n❓ *${q.p}*\n\n💰 Premio: *${premio} ⓃNexCoins*\n⏳ Tienes *30 segundos* para responder.`
    });
}

// ══════════════════════════════════════════
//  MATEMÁTICAS
// ══════════════════════════════════════════
async function cmdMath(sock, jid, senderJid, args = []) {
    if (partidas.has(jid)) {
        await sock.sendMessage(jid, { text: '⚠️ Ya hay un minijuego activo. Termínalo primero.' });
        return;
    }

    // Dificultad: #math facil | normal | dificil
    const dif = (args[0] || 'normal').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    let a, b, op, respuesta, segundos, premioBase;

    if (['facil', 'easy', 'f'].includes(dif)) {
        op = ['+', '-'][Math.floor(Math.random() * 2)];
        if (op === '+') { a = Math.floor(Math.random() * 50) + 1; b = Math.floor(Math.random() * 50) + 1; respuesta = a + b; }
        else { a = Math.floor(Math.random() * 50) + 20; b = Math.floor(Math.random() * a); respuesta = a - b; }
        segundos = 25;
        premioBase = 200;
    } else if (['dificil', 'difícil', 'hard', 'd'].includes(dif)) {
        const ops = ['+', '-', '*', '/'];
        op = ops[Math.floor(Math.random() * ops.length)];
        if (op === '+') { a = Math.floor(Math.random() * 5000) + 1000; b = Math.floor(Math.random() * 5000) + 1000; respuesta = a + b; }
        else if (op === '-') { a = Math.floor(Math.random() * 5000) + 1000; b = Math.floor(Math.random() * a); respuesta = a - b; }
        else if (op === '*') { a = Math.floor(Math.random() * 80) + 20; b = Math.floor(Math.random() * 80) + 20; respuesta = a * b; }
        else { b = Math.floor(Math.random() * 20) + 2; respuesta = Math.floor(Math.random() * 50) + 5; a = b * respuesta; }
        segundos = 25;
        premioBase = 200;
    } else {
        // normal (igual al original)
        const ops = ['+', '-', '*'];
        op = ops[Math.floor(Math.random() * ops.length)];
        if (op === '+') { a = Math.floor(Math.random() * 500) + 1; b = Math.floor(Math.random() * 500) + 1; respuesta = a + b; }
        else if (op === '-') { a = Math.floor(Math.random() * 500) + 100; b = Math.floor(Math.random() * a); respuesta = a - b; }
        else { a = Math.floor(Math.random() * 30) + 1; b = Math.floor(Math.random() * 30) + 1; respuesta = a * b; }
        segundos = 20;
        premioBase = 200;
    }

    const opSym = op === '*' ? '×' : op === '/' ? '÷' : op;
    const premio = premioBase + Math.floor(Math.random() * 201);
    const difLabel = ['facil', 'easy', 'f'].includes(dif) ? '🟢 Fácil'
        : ['dificil', 'difícil', 'hard', 'd'].includes(dif) ? '🔴 Difícil' : '🟡 Normal';

    const timeout = setTimeout(async () => {
        if (partidas.get(jid)?.tipo === 'math') {
            partidas.delete(jid);
            // Resetear racha del iniciador: el tiempo se agotó sin resolver
            try {
                const uTO = getUsuario(senderJid);
                resetRacha(uTO);
                guardarUsuario(senderJid, uTO);
            } catch {}
            await sock.sendMessage(jid, { text: `⏰ *¡Tiempo!*\nLa respuesta era: *${respuesta}*` }).catch(() => {});
        }
    }, segundos * 1000);

    partidas.set(jid, { tipo: 'math', respuesta: String(respuesta), premio, timeout });

    await sock.sendMessage(jid, {
        text: `🧮 *¡MATEMÁTICAS!* — ${difLabel}\n\n🔢 *¿Cuánto es ${a} ${opSym} ${b}?*\n\n💰 Premio: *${premio} ⓃNexCoins*\n⏳ Tienes *${segundos} segundos*\n\n_Modos: #math facil | normal | dificil_`
    });
}

// ══════════════════════════════════════════
//  PIEDRA · PAPEL · TIJERA (#ppt)
// ══════════════════════════════════════════
async function cmdPpt(sock, jid, senderJid, args = []) {
    const eleccion = (args[0] || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const opciones = {
        piedra: '🪨', roca: '🪨', rock: '🪨', r: '🪨',
        papel: '📄', paper: '📄', p: '📄',
        tijera: '✂️', tijeras: '✂️', scissors: '✂️', t: '✂️', s: '✂️'
    };
    if (!opciones[eleccion]) {
        await sock.sendMessage(jid, {
            text: '❌ Uso: *#ppt [piedra | papel | tijera]*\nEjemplo: *#ppt piedra*'
        });
        return;
    }

    const normalizar = e => {
        if (['piedra', 'roca', 'rock', 'r'].includes(e)) return 'piedra';
        if (['papel', 'paper', 'p'].includes(e)) return 'papel';
        return 'tijera';
    };
    const eleccionUsuario = normalizar(eleccion);
    const elecciones = ['piedra', 'papel', 'tijera'];
    const eleccionBot = elecciones[Math.floor(Math.random() * 3)];
    const emojiUser = opciones[eleccion];
    const emojiBot = opciones[eleccionBot];

    const u = getUsuario(senderJid);
    let resultado, premio = 0, rachaPpt = '';

    if (eleccionUsuario === eleccionBot) {
        resultado = '🤝 *¡EMPATE!*';
    } else if (
        (eleccionUsuario === 'piedra' && eleccionBot === 'tijera') ||
        (eleccionUsuario === 'papel' && eleccionBot === 'piedra') ||
        (eleccionUsuario === 'tijera' && eleccionBot === 'papel')
    ) {
        premio = Math.floor(Math.random() * 201) + 200;
        u.monedas = (u.monedas || 0) + premio;
        if (!u.contadores) u.contadores = {};
        u.contadores.ganadosPpt = (u.contadores.ganadosPpt || 0) + 1;
        rachaPpt = procesarRacha(u);
        guardarUsuario(senderJid, u);
        resultado = `🎉 *¡GANASTE!* +*${premio} ⓃNexCoins*`;
    } else {
        const perdida = Math.floor(Math.random() * 50) + 20;
        const real = Math.min(perdida, u.monedas || 0);
        u.monedas = (u.monedas || 0) - real;
        resetRacha(u);
        guardarUsuario(senderJid, u);
        resultado = `😢 *Perdiste* —*${real} ⓃNexCoins*\n_Racha reiniciada._`;
    }

    await sock.sendMessage(jid, {
        text: `✊✋✌️ *PIEDRA · PAPEL · TIJERA*\n\n👤 Tú: ${emojiUser} _${eleccionUsuario}_\n🤖 Bot: ${emojiBot} _${eleccionBot}_\n\n${resultado}\n💰 Saldo: *${u.monedas} ⓃNexCoins*${rachaPpt}`
    });
}

// ══════════════════════════════════════════
//  ADIVINAR NÚMERO
// ══════════════════════════════════════════
async function cmdGuess(sock, jid, senderJid) {
    if (partidas.has(jid)) {
        await sock.sendMessage(jid, { text: '⚠️ Ya hay un minijuego activo.' });
        return;
    }
    const numero = Math.floor(Math.random() * 100) + 1;
    const premio = Math.floor(Math.random() * 201) + 200;

    const timeout = setTimeout(async () => {
        if (partidas.get(jid)?.tipo === 'guess') {
            partidas.delete(jid);
            // Resetear racha del iniciador: el tiempo se agotó sin adivinar
            try {
                const uTO = getUsuario(senderJid);
                resetRacha(uTO);
                guardarUsuario(senderJid, uTO);
            } catch {}
            await sock.sendMessage(jid, { text: `⏰ *¡Tiempo!*\nEl número era: *${numero}*` }).catch(() => {});
        }
    }, 60000);

    partidas.set(jid, { tipo: 'guess', numero, intentos: 0, premio, timeout });

    await sock.sendMessage(jid, {
        text: `🎯 *¡ADIVINA EL NÚMERO!*\n\nPienso en un número del *1 al 100*.\n¡Tienes *5 intentos* para adivinarlo!\n\n💰 Premio: *${premio} ⓃNexCoins*\n⏳ Tiempo: *60 segundos*\n\n_Escribe solo el número._`
    });
}

// ══════════════════════════════════════════
//  CADENA DE PALABRAS
// ══════════════════════════════════════════
async function cmdWordchain(sock, jid, senderJid) {
    if (partidas.has(jid)) {
        await sock.sendMessage(jid, { text: '⚠️ Ya hay un minijuego activo.' });
        return;
    }
    const palabrasInicio = ['gato', 'amor', 'roca', 'luna', 'cielo', 'plato', 'naranja', 'anime', 'espada', 'dragon'];
    const primera = palabrasInicio[Math.floor(Math.random() * palabrasInicio.length)];
    const usadas = new Set([primera]);
    const ultima = primera.slice(-1);

    partidas.set(jid, {
        tipo: 'wordchain',
        ultimaLetra: ultima,
        usadas,
        participantes: new Map(),
        ronda: 1,
    });

    await sock.sendMessage(jid, {
        text: `🔤 *¡CADENA DE PALABRAS!*\n\nRegla: la siguiente palabra debe comenzar con la última letra de la anterior.\n\n🟢 Palabra inicial: *${primera.toUpperCase()}*\n➡️ Siguiente debe empezar con: *${ultima.toUpperCase()}*\n\n💰 Cada palabra vale *50 ⓃNexCoins*\n_Escribe una palabra para jugar. Usa #stopgame para terminar._`
    });
}

// ══════════════════════════════════════════
//  AHORCADO
// ══════════════════════════════════════════
async function cmdAhorcado(sock, jid, senderJid) {
    if (partidas.has(jid)) {
        await sock.sendMessage(jid, { text: '⚠️ Ya hay un minijuego activo. Usa *#stopgame* para terminarlo.' });
        return;
    }
    const palabra = PALABRAS_AHORCADO[Math.floor(Math.random() * PALABRAS_AHORCADO.length)];
    const premio  = Math.floor(Math.random() * 201) + 200;

    const timeout = setTimeout(async () => {
        if (partidas.get(jid)?.tipo === 'ahorcado') {
            partidas.delete(jid);
            await sock.sendMessage(jid, { text: `⏰ *¡Tiempo agotado!*\nLa palabra era: *${palabra.toUpperCase()}*` }).catch(() => {});
        }
    }, 120000);

    partidas.set(jid, { tipo: 'ahorcado', palabra, adivinadas: new Set(), erroneas: new Set(), premio, timeout });

    const display = mostrarPalabra(palabra, new Set());
    await sock.sendMessage(jid, {
        text: `🪓 *¡AHORCADO!*\n\n${dibujarAhorcado(0)}\n\n📝 Palabra: *${display}*\n🔤 Letras: ${palabra.length}\n\n💰 Premio: *${premio} ⓃNexCoins*\n⏳ Tiempo: *2 minutos*\n\n_Escribe una letra para adivinar. También puedes escribir la palabra completa._`
    });
}

// ══════════════════════════════════════════
//  SCRAMBLE
// ══════════════════════════════════════════
async function cmdScramble(sock, jid, senderJid) {
    if (partidas.has(jid)) {
        await sock.sendMessage(jid, { text: '⚠️ Ya hay un minijuego activo. Usa *#stopgame* para terminarlo.' });
        return;
    }
    const entrada  = PALABRAS_SCRAMBLE[Math.floor(Math.random() * PALABRAS_SCRAMBLE.length)];
    const revuelta = scrambleWord(entrada.p);
    const premio   = Math.floor(Math.random() * 201) + 200;

    const timeout = setTimeout(async () => {
        if (partidas.get(jid)?.tipo === 'scramble') {
            partidas.delete(jid);
            await sock.sendMessage(jid, { text: `⏰ *¡Tiempo!*\nLa palabra era: *${entrada.p.toUpperCase()}* ${entrada.cat}` }).catch(() => {});
        }
    }, 30000);

    partidas.set(jid, { tipo: 'scramble', palabra: entrada.p, emoji: entrada.cat, revuelta, premio, timeout });

    await sock.sendMessage(jid, {
        text: `🔀 *¡DESCIFRA LA PALABRA!*\n\n🔤 Letras revueltas: *${revuelta}*\n\n💰 Premio: *${premio} ⓃNexCoins*\n⏳ Tienes *30 segundos*\n\n_Escribe la palabra correcta para ganar._`
    });
}

// ══════════════════════════════════════════
//  ¿QUIÉN SOY? (adivina el personaje)
// ══════════════════════════════════════════
async function cmdQuien(sock, jid, senderJid) {
    if (partidas.has(jid)) {
        await sock.sendMessage(jid, { text: '⚠️ Ya hay un minijuego activo. Usa *#stopgame* para terminarlo.' });
        return;
    }
    const p      = PERSONAJES_QUIEN[Math.floor(Math.random() * PERSONAJES_QUIEN.length)];
    const premio = [400, 300, 200]; // por pista 1, 2, 3

    await sock.sendMessage(jid, {
        text: `🕵️ *¿QUIÉN SOY?*\n\n🟡 *Pista 1:* _${p.pistas[0]}_\n\n💰 Acertar ahora: *${premio[0]} ⓃNexCoins*\n⏳ Segunda pista en *15 segundos*...\n\n_Escribe el nombre del personaje._`
    });

    const t2 = setTimeout(async () => {
        if (partidas.get(jid)?.tipo !== 'quien') return;
        partidas.get(jid).pista = 1;
        await sock.sendMessage(jid, {
            text: `🟠 *Pista 2:* _${p.pistas[1]}_\n\n💰 Acertar ahora: *${premio[1]} ⓃNexCoins*\n⏳ Última pista en *15 segundos*...`
        }).catch(() => {});
    }, 15000);

    const t3 = setTimeout(async () => {
        if (partidas.get(jid)?.tipo !== 'quien') return;
        partidas.get(jid).pista = 2;
        await sock.sendMessage(jid, {
            text: `🔴 *Pista 3 (última):* _${p.pistas[2]}_\n\n💰 Acertar ahora: *${premio[2]} ⓃNexCoins*\n⏳ Se acaba en *15 segundos*...`
        }).catch(() => {});
    }, 30000);

    const timeout = setTimeout(async () => {
        if (partidas.get(jid)?.tipo === 'quien') {
            partidas.delete(jid);
            await sock.sendMessage(jid, { text: `⏰ *¡Nadie lo adivinó!*\nEl personaje era: *${p.nombre.toUpperCase()}*` }).catch(() => {});
        }
    }, 45000);

    partidas.set(jid, { tipo: 'quien', nombre: p.nombre, pista: 0, premio, t2, t3, timeout });
}

// ══════════════════════════════════════════
//  PROCESAR RESPUESTAS (llamar desde handler)
// ══════════════════════════════════════════
async function procesarRespuesta(sock, jid, senderJid, texto, pushName) {
    const partida = partidas.get(jid);
    if (!partida) return false;

    const respuestaLimpia = texto.trim().toLowerCase();

    // AHORCADO
    if (partida.tipo === 'ahorcado') {
        const letra = respuestaLimpia.replace(/\s/g, '');
        const norm  = s => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
        // Intento de palabra completa
        if (letra.length > 1) {
            if (norm(letra) === norm(partida.palabra)) {
                clearTimeout(partida.timeout);
                partidas.delete(jid);
                const u = getUsuario(senderJid);
                u.monedas = (u.monedas || 0) + partida.premio;
                if (!u.contadores) u.contadores = {};
                u.contadores.ganadosAhorcado = (u.contadores.ganadosAhorcado || 0) + 1;
                const rachaMsg = procesarRacha(u);
                guardarUsuario(senderJid, u);
                await sock.sendMessage(jid, {
                    text: `🎉 *¡@${senderJid.split('@')[0]} adivinó la palabra completa!*\n\n✅ Era: *${partida.palabra.toUpperCase()}*\n💰 Ganaste *${partida.premio} ⓃNexCoins*!${rachaMsg}`,
                    mentions: [senderJid]
                });
                return true;
            }
            return false;
        }
        if (!letra || !/^[a-záéíóúüñ]$/i.test(letra)) return false;
        const l = norm(letra);
        if (partida.adivinadas.has(l) || partida.erroneas.has(l)) {
            await sock.sendMessage(jid, { text: `⚠️ La letra *${l.toUpperCase()}* ya fue usada.` });
            return true;
        }
        const palabraNorm = norm(partida.palabra);
        if (palabraNorm.includes(l)) {
            partida.adivinadas.add(l);
            // Marcar letras adivinadas considerando tildes
            const display = partida.palabra.split('').map(c => partida.adivinadas.has(norm(c)) ? c.toUpperCase() : '_').join(' ');
            const gano    = norm(partida.palabra).split('').every(c => partida.adivinadas.has(c));
            if (gano) {
                clearTimeout(partida.timeout);
                partidas.delete(jid);
                const u = getUsuario(senderJid);
                u.monedas = (u.monedas || 0) + partida.premio;
                if (!u.contadores) u.contadores = {};
                u.contadores.ganadosAhorcado = (u.contadores.ganadosAhorcado || 0) + 1;
                const rachaMsg = procesarRacha(u);
                guardarUsuario(senderJid, u);
                await sock.sendMessage(jid, {
                    text: `🎉 *¡@${senderJid.split('@')[0]} completó la palabra!*\n\n✅ *${partida.palabra.toUpperCase()}*\n💰 Ganaste *${partida.premio} ⓃNexCoins*!${rachaMsg}`,
                    mentions: [senderJid]
                });
            } else {
                await sock.sendMessage(jid, {
                    text: `✅ *¡Letra correcta!*\n\n${dibujarAhorcado(partida.erroneas.size)}\n\n📝 *${display}*\n❌ Letras erróneas: ${[...partida.erroneas].map(x => x.toUpperCase()).join(' ') || '—'}`
                });
            }
        } else {
            partida.erroneas.add(l);
            const display = partida.palabra.split('').map(c => partida.adivinadas.has(norm(c)) ? c.toUpperCase() : '_').join(' ');
            if (partida.erroneas.size >= 6) {
                clearTimeout(partida.timeout);
                partidas.delete(jid);
                const uL = getUsuario(senderJid);
                resetRacha(uL);
                guardarUsuario(senderJid, uL);
                await sock.sendMessage(jid, {
                    text: `💀 *¡Se acabaron los intentos!*\n\n${dibujarAhorcado(6)}\n\nLa palabra era: *${partida.palabra.toUpperCase()}*\n_Racha reiniciada._`
                });
            } else {
                await sock.sendMessage(jid, {
                    text: `❌ *Letra incorrecta* (${partida.erroneas.size}/6)\n\n${dibujarAhorcado(partida.erroneas.size)}\n\n📝 *${display}*\n❌ Erróneas: ${[...partida.erroneas].map(x => x.toUpperCase()).join(' ')}`
                });
            }
        }
        return true;
    }

    // SCRAMBLE
    if (partida.tipo === 'scramble') {
        const norm = s => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
        if (norm(respuestaLimpia) === norm(partida.palabra)) {
            clearTimeout(partida.timeout);
            partidas.delete(jid);
            const u = getUsuario(senderJid);
            u.monedas = (u.monedas || 0) + partida.premio;
            if (!u.contadores) u.contadores = {};
            u.contadores.ganadosScramble = (u.contadores.ganadosScramble || 0) + 1;
            const rachaScramble = procesarRacha(u);
            guardarUsuario(senderJid, u);
            await sock.sendMessage(jid, {
                text: `🔀 *¡CORRECTO, @${senderJid.split('@')[0]}!*\n\n✅ La palabra era: *${partida.palabra.toUpperCase()}* ${partida.emoji}\n💰 Ganaste *${partida.premio} ⓃNexCoins*!${rachaScramble}`,
                mentions: [senderJid]
            });
            return true;
        }
        return false;
    }

    // QUIEN SOY
    if (partida.tipo === 'quien') {
        const norm = s => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
        if (norm(respuestaLimpia).includes(norm(partida.nombre)) || norm(partida.nombre).includes(norm(respuestaLimpia))) {
            const premioPista = partida.premio[Math.min(partida.pista, 2)];
            clearTimeout(partida.timeout);
            clearTimeout(partida.t2);
            clearTimeout(partida.t3);
            partidas.delete(jid);
            const u = getUsuario(senderJid);
            u.monedas = (u.monedas || 0) + premioPista;
            if (!u.contadores) u.contadores = {};
            u.contadores.ganadosQuien = (u.contadores.ganadosQuien || 0) + 1;
            const rachaQuien = procesarRacha(u);
            guardarUsuario(senderJid, u);
            await sock.sendMessage(jid, {
                text: `🕵️ *¡@${senderJid.split('@')[0]} lo adivinó!*\n\n✅ Era: *${partida.nombre.toUpperCase()}*\n💰 Ganaste *${premioPista} ⓃNexCoins*! (pista ${partida.pista + 1}/3)${rachaQuien}`,
                mentions: [senderJid]
            });
            return true;
        }
        return false;
    }

    // WORDCHAIN - cooldown por usuario
    if (partida.tipo === 'wordchain') {
        const ahora = Date.now();
        const cooldownWC = 3000; // 3 segundos entre palabras por usuario
        const ultimoWC = partida.ultimosUsuarios?.get(senderJid) || 0;
        if (ahora - ultimoWC < cooldownWC) return false; // silencioso, ignorar
    }

    // TRIVIA
    if (partida.tipo === 'trivia') {
        const normalize = s => s.toLowerCase().trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ');
        if (normalize(respuestaLimpia).includes(normalize(partida.respuesta))) {
            clearTimeout(partida.timeout);
            partidas.delete(jid);
            const u = getUsuario(senderJid);
            u.monedas = (u.monedas || 0) + partida.premio;
            if (!u.contadores) u.contadores = {};
            u.contadores.ganadosTrivia = (u.contadores.ganadosTrivia || 0) + 1;
            const rachaTrivia = procesarRacha(u);
            guardarUsuario(senderJid, u);
            verificarYNotificar(sock, jid, senderJid, u, 'minigame').catch(() => {});
            await sock.sendMessage(jid, {
                text: `✅ *¡CORRECTO, @${senderJid.split('@')[0]}!*\n\n🎉 Respuesta: *${partida.respuesta}*\n💰 Ganaste *${partida.premio} ⓃNexCoins*!${rachaTrivia}`,
                mentions: [senderJid]
            });
            return true;
        }
        // Respuesta incorrecta: resetear racha del que respondió mal
        try {
            const uWrong = getUsuario(senderJid);
            resetRacha(uWrong);
            guardarUsuario(senderJid, uWrong);
        } catch {}
        return false;
    }

    // MATH
    if (partida.tipo === 'math') {
        if (respuestaLimpia === partida.respuesta) {
            clearTimeout(partida.timeout);
            partidas.delete(jid);
            const u = getUsuario(senderJid);
            u.monedas = (u.monedas || 0) + partida.premio;
            if (!u.contadores) u.contadores = {};
            u.contadores.ganadosMath = (u.contadores.ganadosMath || 0) + 1;
            const rachaMath = procesarRacha(u);
            guardarUsuario(senderJid, u);
            verificarYNotificar(sock, jid, senderJid, u, 'minigame').catch(() => {});
            await sock.sendMessage(jid, {
                text: `✅ *¡CORRECTO, @${senderJid.split('@')[0]}!*\n\n💰 Ganaste *${partida.premio} ⓃNexCoins*!${rachaMath}`,
                mentions: [senderJid]
            });
            return true;
        }
        // Respuesta incorrecta: resetear racha del que respondió mal
        try {
            const uWrong = getUsuario(senderJid);
            resetRacha(uWrong);
            guardarUsuario(senderJid, uWrong);
        } catch {}
        return false;
    }

    // GUESS
    if (partida.tipo === 'guess') {
        const num = parseInt(respuestaLimpia);
        if (isNaN(num) || num < 1 || num > 100) return false;
        partida.intentos++;
        if (num === partida.numero) {
            clearTimeout(partida.timeout);
            partidas.delete(jid);
            const u = getUsuario(senderJid);
            u.monedas = (u.monedas || 0) + partida.premio;
            if (!u.contadores) u.contadores = {};
            u.contadores.ganadosGuess = (u.contadores.ganadosGuess || 0) + 1;
            const rachaGuess = procesarRacha(u);
            guardarUsuario(senderJid, u);
            verificarYNotificar(sock, jid, senderJid, u, 'minigame').catch(() => {});
            await sock.sendMessage(jid, {
                text: `🎯 *¡ADIVINASTE, @${senderJid.split('@')[0]}!*\n\nEl número era *${num}* ✅\n💰 Ganaste *${partida.premio} ⓃNexCoins*!${rachaGuess}`,
                mentions: [senderJid]
            });
            return true;
        }
        if (partida.intentos >= 5) {
            clearTimeout(partida.timeout);
            partidas.delete(jid);
            const uG = getUsuario(senderJid);
            resetRacha(uG);
            guardarUsuario(senderJid, uG);
            await sock.sendMessage(jid, { text: `❌ Sin más intentos. El número era *${partida.numero}*\n_Racha reiniciada._` });
            return true;
        }
        const pista = num < partida.numero ? '📈 ¡Más alto!' : '📉 ¡Más bajo!';
        await sock.sendMessage(jid, {
            text: `${pista} Intento *${partida.intentos}/5*`
        });
        return true;
    }

    // WORDCHAIN
    if (partida.tipo === 'wordchain') {
        const ahora = Date.now();
        const palabra = respuestaLimpia.replace(/[^a-záéíóúüñ]/gi, '').toLowerCase();
        if (!palabra || palabra.length < 2) return false;
        if (!palabra.startsWith(partida.ultimaLetra)) return false;
        if (partida.usadas.has(palabra)) {
            await sock.sendMessage(jid, { text: `❌ "*${palabra}*" ya fue usada. Elige otra.` });
            return true;
        }
        // Registrar cooldown del usuario
        if (!partida.ultimosUsuarios) partida.ultimosUsuarios = new Map();
        partida.ultimosUsuarios.set(senderJid, ahora);
        partida.usadas.add(palabra);
        partida.ultimaLetra = palabra.slice(-1);
        partida.ronda++;
        const u = getUsuario(senderJid);
        u.monedas = (u.monedas || 0) + 50;
        guardarUsuario(senderJid, u);
        if (!partida.participantes) partida.participantes = new Map();
        partida.participantes.set(senderJid, (partida.participantes.get(senderJid) || 0) + 1);
        // Máximo 150 palabras por sesión
        const MAX_PALABRAS = 150;
        if (partida.ronda > MAX_PALABRAS) {
            clearTimeout(partida.timeout);
            partidas.delete(jid);
            let top = `🏆 *¡Cadena de ${MAX_PALABRAS} palabras completada!*\n\n`;
            partida.participantes.forEach((puntos, uid) => {
                top += `@${uid.split('@')[0]}: *${puntos}* palabras (+${puntos * 50} ⓃNC)\n`;
            });
            await sock.sendMessage(jid, { text: top, mentions: [...partida.participantes.keys()] });
            return true;
        }
        await sock.sendMessage(jid, {
            text: `✅ *${palabra.toUpperCase()}* — +50 ⓃNC a @${senderJid.split('@')[0]}\n➡️ Siguiente: empieza con *${partida.ultimaLetra.toUpperCase()}* | Ronda *${partida.ronda}/${MAX_PALABRAS}*`,
            mentions: [senderJid]
        });
        return true;
    }

    // TAYLOR SWIFT QUIZ
    if (partida.tipo === 'tsquiz') {
        const normalize = s => s.toLowerCase().trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ');
        const normRespTs = normalize(respuestaLimpia);
        const normAnsTs  = normalize(partida.respuesta);
        if (!normRespTs || normRespTs.length < 2) return false;
        if (normRespTs.includes(normAnsTs) || normAnsTs.includes(normRespTs)) {
            clearTimeout(partida.timeout);
            partidas.delete(jid);
            const u = getUsuario(senderJid);
            u.monedas = (u.monedas || 0) + partida.premio;
            if (!u.contadores) u.contadores = {};
            u.contadores.ganadosTsQuiz = (u.contadores.ganadosTsQuiz || 0) + 1;
            const rachaMsg = procesarRacha(u);
            guardarUsuario(senderJid, u);
            await sock.sendMessage(jid, {
                text: `🌟 *¡CORRECTO, @${senderJid.split('@')[0]}!*\n\n✅ Respuesta: *${partida.respuesta}*\n💰 Ganaste *${partida.premio} ⓃNexCoins*!\n\n_🎤 ¡Un verdadero Swiftie!_${rachaMsg}`,
                mentions: [senderJid]
            });
            return true;
        }
        return false;
    }

    // COMPLETA LA LETRA
    if (partida.tipo === 'completa') {
        const normalize = s => s.toLowerCase().trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ');
        const normResp = normalize(respuestaLimpia);
        const normAns  = normalize(partida.respuesta);
        if (!normResp || normResp.length < 2) return false;
        if (normResp === normAns || normResp.includes(normAns) || normAns.includes(normResp)) {
            clearTimeout(partida.timeout);
            partidas.delete(jid);
            const u = getUsuario(senderJid);
            u.monedas = (u.monedas || 0) + partida.premio;
            if (!u.contadores) u.contadores = {};
            u.contadores.ganadosCompleta = (u.contadores.ganadosCompleta || 0) + 1;
            const rachaMsg = procesarRacha(u);
            guardarUsuario(senderJid, u);
            await sock.sendMessage(jid, {
                text: `🎵 *¡CORRECTO, @${senderJid.split('@')[0]}!*\n\n✅ _"${partida.respuesta}"_\n🎤 ${partida.artista}\n💰 Ganaste *${partida.premio} ⓃNexCoins*!${rachaMsg}`,
                mentions: [senderJid]
            });
            return true;
        }
        return false;
    }

    // VERDADERO O FALSO
    if (partida.tipo === 'vof') {
        const normalize = s => s.toLowerCase().trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        const resp = normalize(respuestaLimpia);
        const esVerdadero = ['verdadero', 'v', 'true', 'si', 'sí', 'correcto', '✅'].includes(resp);
        const esFalso     = ['falso', 'f', 'false', 'no', 'incorrecto', '❌'].includes(resp);
        if (!esVerdadero && !esFalso) return false;
        const acerto = (esVerdadero && partida.esVerdadero) || (esFalso && !partida.esVerdadero);
        clearTimeout(partida.timeout);
        partidas.delete(jid);
        const u = getUsuario(senderJid);
        if (acerto) {
            u.monedas = (u.monedas || 0) + partida.premio;
            if (!u.contadores) u.contadores = {};
            u.contadores.ganadosVof = (u.contadores.ganadosVof || 0) + 1;
            const rachaMsg = procesarRacha(u);
            guardarUsuario(senderJid, u);
            await sock.sendMessage(jid, {
                text: `✅ *¡CORRECTO, @${senderJid.split('@')[0]}!*\n\nEra *${partida.respuesta.toUpperCase()}*\n💰 Ganaste *${partida.premio} ⓃNexCoins*!${rachaMsg}`,
                mentions: [senderJid]
            });
        } else {
            resetRacha(u);
            guardarUsuario(senderJid, u);
            await sock.sendMessage(jid, {
                text: `❌ *¡Incorrecto, @${senderJid.split('@')[0]}!*\n\nLa respuesta era *${partida.respuesta.toUpperCase()}* ${partida.esVerdadero ? '✅' : '❌'}\n_Racha reiniciada._`,
                mentions: [senderJid]
            });
        }
        return true;
    }

    // ADIVINA EL EMOJI
    if (partida.tipo === 'emojiadivina') {
        const normalize = s => s.toLowerCase().trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ');
        const normResp = normalize(respuestaLimpia);
        const normAns  = normalize(partida.respuesta);
        if (!normResp || normResp.length < 2) return false;
        if (normResp === normAns || normResp.includes(normAns) || normAns.includes(normResp)) {
            clearTimeout(partida.timeout);
            partidas.delete(jid);
            const u = getUsuario(senderJid);
            u.monedas = (u.monedas || 0) + partida.premio;
            if (!u.contadores) u.contadores = {};
            u.contadores.ganadosEmoji = (u.contadores.ganadosEmoji || 0) + 1;
            const rachaMsg = procesarRacha(u);
            guardarUsuario(senderJid, u);
            await sock.sendMessage(jid, {
                text: `🎭 *¡CORRECTO, @${senderJid.split('@')[0]}!*\n\n✅ Era: *${partida.respuesta.toUpperCase()}*\n🏷️ ${partida.categoria}\n💰 Ganaste *${partida.premio} ⓃNexCoins*!${rachaMsg}`,
                mentions: [senderJid]
            });
            return true;
        }
        return false;
    }

    return false;
}

async function cmdStopGame(sock, jid, senderJid) {
    const partida = partidas.get(jid);
    if (!partida) {
        await sock.sendMessage(jid, { text: '❌ No hay ningún minijuego activo.' });
        return;
    }
    if (partida.timeout) clearTimeout(partida.timeout);
    if (partida.tipo === 'wordchain' && partida.participantes?.size > 0) {
        let top = '🏆 *Resultados de la cadena:*\n';
        partida.participantes.forEach((puntos, uid) => {
            top += `\n@${uid.split('@')[0]}: *${puntos}* palabras (+${puntos * 50} ⓃNexCoins)`;
        });
        partidas.delete(jid);
        await sock.sendMessage(jid, { text: top, mentions: [...partida.participantes.keys()] });
        return;
    }
    partidas.delete(jid);
    await sock.sendMessage(jid, { text: '🛑 Minijuego terminado.' });
}

// ══════════════════════════════════════════
//  BANCO: TRIVIA TAYLOR SWIFT
// ══════════════════════════════════════════
const TRIVIAS_TAYLOR = [
    { p: '¿Cuál fue el primer álbum de Taylor Swift, lanzado en 2006?', r: 'taylor swift' },
    { p: '¿Cómo se llama el álbum de Taylor Swift lanzado en 2008 que incluye "Love Story"?', r: 'fearless' },
    { p: '¿En qué año se lanzó el álbum "Speak Now" de Taylor Swift?', r: '2010' },
    { p: '¿Qué álbum de Taylor Swift incluye la canción "We Are Never Ever Getting Back Together"?', r: 'red' },
    { p: '¿Cómo se llama el álbum de Taylor Swift lanzado en 2014 con "Shake It Off"?', r: '1989' },
    { p: '¿Cuál es el álbum de Taylor Swift que fue lanzado en 2017 y tiene estética oscura?', r: 'reputation' },
    { p: '¿Qué álbum de Taylor Swift incluye "You Need To Calm Down" y "ME!"?', r: 'lover' },
    { p: '¿Cómo se llama el álbum sorpresa de Taylor Swift lanzado en julio de 2020?', r: 'folklore' },
    { p: '¿Qué álbum sorpresa de Taylor lanzó en diciembre de 2020, hermano de folklore?', r: 'evermore' },
    { p: '¿Cómo se llama el álbum de Taylor Swift lanzado en octubre de 2022?', r: 'midnights' },
    { p: '¿Cuál es el álbum más reciente de Taylor Swift, lanzado en 2024?', r: 'the tortured poets department' },
    { p: '¿Cómo se llama la canción más larga de Taylor Swift, de 10 minutos en Red (TV)?', r: 'all too well' },
    { p: '¿En qué estado de EE.UU. nació Taylor Swift?', r: 'pensilvania' },
    { p: '¿Qué instrumento toca principalmente Taylor Swift en sus actuaciones?', r: 'guitarra' },
    { p: '¿Cómo se llama el gato favorito de Taylor Swift de color blanco y negro?', r: 'meredith' },
    { p: '¿Cuántos Grammys al Álbum del Año ha ganado Taylor Swift (récord)?', r: '4' },
    { p: '¿Cuál era el nombre de la gira mundial de Taylor Swift en 2023-2024?', r: 'the eras tour' },
    { p: '¿En qué ciudad comenzó el Eras Tour en 2023?', r: 'glendale' },
    { p: '¿Cuál es el nombre de la canción de Taylor Swift que habla de Romeo y Julieta?', r: 'love story' },
    { p: '¿Cómo se llama el personaje que interpreta Taylor Swift en la pista "The Man"?', r: 'the man' },
    { p: '¿En qué año Taylor Swift ganó su primer Grammy al Álbum del Año con "Fearless"?', r: '2010' },
    { p: '¿Cuál es el apodo de los fanáticos de Taylor Swift?', r: 'swifties' },
    { p: '¿Qué canción de Taylor Swift menciona el número 13 en su letra?', r: 'the lucky one' },
    { p: '¿Cuál es el número favorito de Taylor Swift, que considera su número de la suerte?', r: '13' },
    { p: '¿En qué año comenzó Taylor Swift su carrera musical profesionalmente?', r: '2006' },
    { p: '¿Cómo se llama el ex novio que inspiró la canción "Style" del álbum 1989?', r: 'harry styles' },
    { p: '¿Qué canción de Taylor Swift fue la más larga en el número uno de Billboard Hot 100?', r: 'anti-hero' },
    { p: '¿Cuántos gatos tiene Taylor Swift?', r: '3' },
    { p: '¿Cuál es el nombre del gato escocés de pelaje gris de Taylor Swift?', r: 'olivia benson' },
    { p: '¿Qué álbum de Taylor Swift fue originalmente lanzado bajo la disquera Big Machine Records?', r: 'taylor swift' },
    { p: '¿Cómo se llama el documental de Netflix sobre Taylor Swift de 2020?', r: 'miss americana' },
    { p: '¿Cuál es la canción de apertura del álbum "folklore"?', r: 'the 1' },
    { p: '¿En qué colaboración de Taylor Swift con Bon Iver del álbum "evermore" el dúo grabó juntos?', r: 'exile' },
    { p: '¿Cuál fue la primera canción de Taylor Swift en alcanzar el número 1 en el Hot 100?', r: 'we are never ever getting back together' },
    { p: '¿En qué año Taylor Swift comenzó a re-grabar sus álbumes anteriores para recuperar sus masters?', r: '2021' },
    { p: '¿Cómo se llama la versión regrabada de "Fearless"?', r: 'fearless (taylors version)' },
    { p: '¿Cuál es el tema central del álbum "Lover" de Taylor Swift?', r: 'amor' },
    { p: '¿En qué película animada de 2012 actuó vocalmente Taylor Swift?', r: 'el lorax' },
    { p: '¿Cuál es el nombre de la amiga de Taylor Swift que es actriz y protagonista de Gossip Girl?', r: 'blake lively' },
    { p: '¿Qué canción de Midnights tiene a Lana Del Rey como colaboradora?', r: 'snow on the beach' },
    { p: '¿En qué canción de Taylor Swift ella menciona "hummingbird heartbeat" y escaleras?', r: 'fearless' },
    { p: '¿Cuál es el color asociado al era de "reputation"?', r: 'negro' },
    { p: '¿Qué era de Taylor Swift tiene como color característico el lavanda/morado?', r: 'midnights' },
    { p: '¿Cuál es el nombre del productor con el que Taylor Swift colaboró en folklore y evermore?', r: 'aaron dessner' },
    { p: '¿Quién es el principal productor y coescritor de Taylor Swift desde "1989"?', r: 'jack antonoff' },
    { p: '¿En qué canción de "Red" Taylor Swift menciona el otoño y las hojas?', r: 'all too well' },
    { p: '¿Cuántos tracks tiene el álbum "Midnights (3am Edition)"?', r: '23' },
    { p: '¿Cómo se llama la canción de Taylor Swift que narra una historia de amor en un tren?', r: 'the last great american dynasty' },
    { p: '¿Cuál es el apellido del personaje ficticio que Taylor menciona en "Betty"?', r: 'james' },
    { p: '¿Qué álbum de Taylor Swift ganó el Grammy al Álbum del Año en 2021?', r: 'folklore' },
    { p: '¿Cuál es la canción secreta más comentada del Eras Tour que ella tocó al piano?', r: 'the lakes' },
    { p: '¿En qué ciudad nació Taylor Swift?', r: 'west reading' },
    { p: '¿Cuántos álbumes de estudio tiene Taylor Swift (incluyendo TTPD)?', r: '11' },
    { p: '¿Cuál es el nombre completo de Taylor Swift?', r: 'taylor alison swift' },
    // más preguntas Taylor Swift
    { p: '¿Qué canción de Taylor Swift tiene el videoclip con una lista de ex novios?', r: 'blank space' },
    { p: '¿Cómo se llama la gira de Taylor Swift de 2018 que acompañó a "reputation"?', r: 'reputation stadium tour' },
    { p: '¿Qué colaboración de Taylor Swift con Ed Sheeran salió en 2021?', r: 'the joker and the queen' },
    { p: '¿En qué álbum de Taylor Swift aparece la canción "Don\'t Blame Me"?', r: 'reputation' },
    { p: '¿Cómo se llama la canción de Taylor Swift que tiene la frase "Romeo save me"?', r: 'love story' },
    { p: '¿Qué canción de Taylor Swift habla de un vestido rojo y baile bajo las estrellas?', r: 'speak now' },
    { p: '¿Cuál es la primera canción del álbum "Midnights"?', r: 'lavender haze' },
    { p: '¿En qué álbum está la canción "Death By A Thousand Cuts"?', r: 'lover' },
    { p: '¿Cómo se llama el interlude de Taylor Swift entre "evermore" y la siguiente era?', r: 'the lakes' },
    { p: '¿Qué canción de Taylor Swift fue coescrita con Imogen Heap?', r: 'clean' },
    { p: '¿Cuál es la canción número 5 del álbum "1989" (famosa por su intensidad)?', r: 'clean' },
    { p: '¿En qué película del MCU sonó una canción de Taylor Swift?', r: 'no official' },
    { p: '¿Cómo se llama el ex de Taylor Swift que fue protagonista de "Mad Men"?', r: 'jake gyllenhaal' },
    { p: '¿Qué álbum de Taylor Swift tiene la canción "Delicate"?', r: 'reputation' },
    { p: '¿En qué álbum de Taylor Swift está la canción "The Archer"?', r: 'lover' },
    { p: '¿Cuál fue el primer álbum de Taylor Swift en obtener la certificación diamante?', r: 'fearless' },
    { p: '¿Con cuántos días de anticipación anunció Taylor Swift el álbum "folklore"?', r: '0' },
    { p: '¿Qué canción de Taylor Swift usa las palabras "james", "betty" e "inez"?', r: 'august' },
    { p: '¿Cómo se llama la trilogía de canciones de folklore sobre un triángulo amoroso?', r: 'teenage love triangle' },
    { p: '¿Qué artista colaboró con Taylor Swift en la canción "Highway Don\'t Care"?', r: 'tim mcgraw' },
    { p: '¿Cuántos tracks tiene el álbum estándar de "The Tortured Poets Department"?', r: '16' },
    { p: '¿Qué canción de Taylor Swift fue escrita sobre su ruptura con Jake Gyllenhaal?', r: 'all too well' },
    { p: '¿Cuál es el nombre del novio actual de Taylor Swift (jugador de la NFL)?', r: 'travis kelce' },
    { p: '¿En qué equipo de la NFL juega el novio de Taylor Swift?', r: 'kansas city chiefs' },
    { p: '¿Qué canción de "Midnights" habla de inseguridades a las 3 de la mañana?', r: 'anti-hero' },
    { p: '¿Cómo se llama la canción de Taylor Swift donde menciona "tan lines" y "margaritas"?', r: 'cornelia street' },
    { p: '¿Qué instrumento aparece prominentemente en el videoclip de "Cardigan"?', r: 'piano' },
    { p: '¿En qué año Taylor Swift fue nombrada Persona del Año por la revista Time?', r: '2023' },
    { p: '¿Cómo se llama el festival virtual donde Taylor Swift tocó en Fortnite?', r: 'no tocó en fortnite' },
    { p: '¿Qué canción de Taylor Swift tiene la frase "I had the best day with you today"?', r: 'the best day' },
    { p: '¿Con qué artista colaboró Taylor Swift en "Both Of Us"?', r: 'b.o.b' },
    { p: '¿Qué álbum de Taylor Swift incluye la canción "Mean"?', r: 'speak now' },
    { p: '¿Cuántos VMAs ha ganado Taylor Swift en total?', r: '14' },
    { p: '¿Qué canción de Taylor Swift fue un dueto con Gary Lightbody de Snow Patrol?', r: 'the last time' },
    { p: '¿En qué año ganó Taylor Swift su primer AMA?', r: '2008' },
];

// ══════════════════════════════════════════
//  BANCO: COMPLETA LA LETRA
// ══════════════════════════════════════════
const LETRAS_COMPLETA = [
    // Taylor Swift
    { pista: '🎤 Taylor Swift — "Shake It Off"\n\n_"Cause the players gonna play, play, play, play, play\nAnd the haters gonna hate, hate, hate, hate, hate\nBaby, I\'m just gonna ___"_', r: 'shake it off', artista: 'Taylor Swift — Shake It Off' },
    { pista: '🎤 Taylor Swift — "Love Story"\n\n_"Romeo, save me, they\'re trying to tell me how to feel\nThis love is difficult but it\'s ___"_', r: 'real', artista: 'Taylor Swift — Love Story' },
    { pista: '🎤 Taylor Swift — "Anti-Hero"\n\n_"It\'s me, hi, I\'m the problem, ___"_', r: "it's me", artista: 'Taylor Swift — Anti-Hero' },
    { pista: '🎤 Taylor Swift — "All Too Well"\n\n_"And I know it\'s long gone and\nThat magic\'s not here no more\nAnd I might be okay but I\'m ___"_', r: 'not fine at all', artista: 'Taylor Swift — All Too Well' },
    { pista: '🎤 Taylor Swift — "Blank Space"\n\n_"So it\'s gonna be forever\nOr it\'s gonna go down in flames\nYou can tell me when it\'s over\nIf the high was worth ___"_', r: 'the pain', artista: 'Taylor Swift — Blank Space' },
    { pista: '🎤 Taylor Swift — "Cruel Summer"\n\n_"I\'m drunk in the back of the car\nAnd I cried like a baby coming home from ___"_', r: 'the bar', artista: 'Taylor Swift — Cruel Summer' },
    { pista: '🎤 Taylor Swift — "Style"\n\n_"You got that James Dean daydream look in your eye\nAnd I got that red lip, classic ___"_', r: 'thing that you like', artista: 'Taylor Swift — Style' },
    { pista: '🎤 Taylor Swift — "cardigan"\n\n_"A friend to all is a friend to none\nChase two girls, lose ___"_', r: 'the one', artista: 'Taylor Swift — cardigan' },
    { pista: '🎤 Taylor Swift — "august"\n\n_"August slipped away into a moment in time\n\'Cause it was never mine\nAnd I can see you ___"_', r: 'staring honey', artista: 'Taylor Swift — august' },
    { pista: '🎤 Taylor Swift — "champagne problems"\n\n_"Your mom\'s ring in your pocket,\nMy picture in your wallet\nYour heart was glass, I ___"_', r: 'dropped it', artista: 'Taylor Swift — champagne problems' },
    { pista: '🎤 Taylor Swift — "willow"\n\n_"I\'m like the water when your ship rolled in that night\nRough on the surface but you ___"_', r: 'cut through like a knife', artista: 'Taylor Swift — willow' },
    { pista: '🎤 Taylor Swift — "Lavender Haze"\n\n_"I find it dizzying\nThey\'re bringing up my baby\nMeet me at midnight\nI\'m damned if I ___"_', r: 'do give a damn what they say', artista: 'Taylor Swift — Lavender Haze' },
    { pista: '🎤 Taylor Swift — "Fearless"\n\n_"And I don\'t know how it gets better than this\nYou take my hand and drag me head first, ___"_', r: 'fearless', artista: 'Taylor Swift — Fearless' },
    { pista: '🎤 Taylor Swift — "The 1"\n\n_"I had the time of my life fighting dragons with you\nI was always the ___"_', r: 'one', artista: 'Taylor Swift — The 1' },
    { pista: '🎤 Taylor Swift — "You Belong With Me"\n\n_"You\'re on the phone with your girlfriend, she\'s upset,\nShe\'s going off about something that you said\n\'Cause she doesn\'t ___"_', r: 'get your humor', artista: 'Taylor Swift — You Belong With Me' },
    // General (en español / internacionales)
    { pista: '🎤 Bad Bunny — "Tití Me Preguntó"\n\n_"Si yo fuera tú yo me enamoraba de mí\nMe la paso de viaje y me quiero morir\nTití me preguntó que cuándo me ___"_', r: 'voy a casar', artista: 'Bad Bunny — Tití Me Preguntó' },
    { pista: '🎤 Adele — "Someone Like You"\n\n_"Never mind, I\'ll find someone like you\nI wish nothing but the best for ___"_', r: 'you too', artista: 'Adele — Someone Like You' },
    { pista: '🎤 Shakira & Bizarrap — BZRP Session #53\n\n_"Las mujeres ya no lloran, las mujeres ___"_', r: 'facturan', artista: 'Shakira — BZRP Music Sessions #53' },
    { pista: '🎤 Olivia Rodrigo — "drivers license"\n\n_"I got my driver\'s license last week\nJust like we always talked about\n\'Cause you were so excited for me\nTo finally drive away ___"_', r: 'from this town', artista: 'Olivia Rodrigo — drivers license' },
    { pista: '🎤 Dua Lipa — "Levitating"\n\n_"I got you, moonlight, you\'re my starlight\nI need you all night, come on, dance with me\nI\'m levitating\nThe Milky Way, we\'re renegading,\nYeah, yeah, yeah, yeah, ___"_', r: 'yeah', artista: 'Dua Lipa — Levitating' },
    { pista: '🎤 Harry Styles — "Watermelon Sugar"\n\n_"Tastes like strawberries on a summer evening\nAnd it sounds just like a song\nI want more ___"_', r: 'berries and that summer feeling', artista: 'Harry Styles — Watermelon Sugar' },
    { pista: '🎤 The Weeknd — "Blinding Lights"\n\n_"I\'ve been trying to call\nI\'ve been on my own for long enough\nMaybe you can show me how to love, ___"_', r: 'maybe', artista: 'The Weeknd — Blinding Lights' },
    { pista: '🎤 Billie Eilish — "bad guy"\n\n_"So you\'re a tough guy,\nLike it really rough guy,\nJust can\'t get enough guy,\nChest always so puffed guy,\nI\'m that ___"_', r: 'bad type', artista: 'Billie Eilish — bad guy' },
    { pista: '🎤 Karol G — "PROVENZA"\n\n_"Me tomé el verano que necesitaba\nMe liberé de todo lo que me amarraba\nY en mi tierra, hay una costa que se llama ___"_', r: 'provenza', artista: 'Karol G — PROVENZA' },
    { pista: '🎤 Taylor Swift — "Enchanted"\n\n_"Please don\'t be in love with someone else\nPlease don\'t have somebody waiting on you\nPlease don\'t be in love with someone else\n___"_', r: "please don't have somebody waiting on you", artista: 'Taylor Swift — Enchanted' },
    // más Taylor Swift
    { pista: '🎤 Taylor Swift — "Delicate"\n\n_"Is it cool that I said all that?\nIs it chill that you\'re in my head?\n\'Cause I know that it\'s ___"_', r: 'delicate', artista: 'Taylor Swift — Delicate' },
    { pista: '🎤 Taylor Swift — "Don\'t Blame Me"\n\n_"I\'ve been breakin\' hearts a long time\nAnd toyin\' with them older guys\nJust playthings for me to use\nSomething happened for ___"_', r: 'the first time', artista: 'Taylor Swift — Don\'t Blame Me' },
    { pista: '🎤 Taylor Swift — "Bejeweled"\n\n_"Baby love, I think I\'ve been a little too kind\nDidn\'t notice you walking all over my ___"_', r: 'peace of mind', artista: 'Taylor Swift — Bejeweled' },
    { pista: '🎤 Taylor Swift — "The Archer"\n\n_"I\'ve been the archer\nI\'ve been the prey\nWho could ever leave me, darling?\nBut who could ___"_', r: 'stay', artista: 'Taylor Swift — The Archer' },
    { pista: '🎤 Taylor Swift — "Exile" ft. Bon Iver\n\n_"I can see you standing, honey\nWith his arms around your body\nLaughin\' but the joke\'s not ___"_', r: 'funny', artista: 'Taylor Swift — Exile ft. Bon Iver' },
    { pista: '🎤 Taylor Swift — "Getaway Car"\n\n_"It was the best of times, the worst of crimes\nI struck a match and blew your ___"_', r: 'mind', artista: 'Taylor Swift — Getaway Car' },
    { pista: '🎤 Taylor Swift — "22"\n\n_"I don\'t know about you, but I\'m feeling ___"_', r: '22', artista: 'Taylor Swift — 22' },
    { pista: '🎤 Taylor Swift — "Look What You Made Me Do"\n\n_"I\'m sorry, the old Taylor can\'t come to the phone right now.\nOh, why?\n\'Cause ___"_', r: "she's dead", artista: 'Taylor Swift — Look What You Made Me Do' },
    { pista: '🎤 Taylor Swift — "New Romantics"\n\n_"\'Cause we\'re the new romantics\nCome on, come along with me\nHeartbreak is the national ___"_', r: 'anthem', artista: 'Taylor Swift — New Romantics' },
    { pista: '🎤 Taylor Swift — "ivy"\n\n_"Oh, I\'d be a fearless fool\nWho\'d dance a dangerous jig\nHold me for fear ___"_', r: "i'd be the one you'd leave", artista: 'Taylor Swift — ivy' },
    // más artistas latinos
    { pista: '🎤 Karol G — "MAMIII"\n\n_"Antes de ti mi vida era un desastre\nY ahora que no estás me estoy recuperando\nY si alguien me pregunta cómo me siento\nLe digo que ___"_', r: 'de maravilla', artista: 'Karol G — MAMIII' },
    { pista: '🎤 Bad Bunny — "Callaíta"\n\n_"Ella no es callaíta, ella no es callaíta\nElla se despierta tarde\nDuerme de día, de noche ___"_', r: 'baila', artista: 'Bad Bunny — Callaíta' },
    { pista: '🎤 J Balvin — "Mi Gente"\n\n_"Muévete, muévete, la gente\nBaila que baila sin parar\nEsta noche me bebo la ___"_', r: 'ciudad', artista: 'J Balvin ft. Willy William — Mi Gente' },
    { pista: '🎤 Rosalía — "MALAMENTE"\n\n_"Me lo dijo el reló\nQue las horas que pasamos juntos\nSe acaban de ___"_', r: 'acabar', artista: 'Rosalía — MALAMENTE' },
    { pista: '🎤 Peso Pluma — "LADY GAGA"\n\n_"Tus fotos en bikini, tus fotos en bikini\nMe tienen loco, me tienen loco\nEres mi ___"_', r: 'lady gaga', artista: 'Peso Pluma — LADY GAGA' },
    { pista: '🎤 Feid — "CHORRITO PA LAS ANIMAS"\n\n_"Se me olvidó lo que te iba a decir\nEs que tú me pones bien loco\nCon ese cuerpo que me vuelve ___"_', r: 'loco', artista: 'Feid — CHORRITO PA LAS ANIMAS' },
    // pop internacional
    { pista: '🎤 Olivia Rodrigo — "good 4 u"\n\n_"Well, good for you, I guess you moved on really easily\nYou found a new girl and it only took ___"_', r: 'a couple weeks', artista: 'Olivia Rodrigo — good 4 u' },
    { pista: '🎤 Ariana Grande — "thank u, next"\n\n_"One taught me love, one taught me patience\nAnd one taught me pain\nNow I\'m so amazing\nSay thank u, ___"_', r: 'next', artista: 'Ariana Grande — thank u, next' },
    { pista: '🎤 Sabrina Carpenter — "Espresso"\n\n_"I can\'t relate to desperation\nNo, my love, I\'m an ___"_', r: 'expresso', artista: 'Sabrina Carpenter — Espresso' },
    { pista: '🎤 SZA — "Kill Bill"\n\n_"I might kill my ex, not the best idea\nHis new girlfriend\'s next, how\'d I get ___"_', r: 'here', artista: 'SZA — Kill Bill' },
    { pista: '🎤 Beyoncé — "Crazy In Love"\n\n_"Got me looking so crazy right now\nYour love\'s got me looking so crazy right now\n(In love)\nGot me looking so crazy right now\nYour touch got me looking so crazy right ___"_', r: 'now', artista: 'Beyoncé — Crazy In Love' },
    { pista: '🎤 Lady Gaga — "Bad Romance"\n\n_"I want your ugly, I want your disease\nI want your everything as long as it\'s ___"_', r: 'free', artista: 'Lady Gaga — Bad Romance' },
];

// ══════════════════════════════════════════
//  BANCO: VERDADERO O FALSO
// ══════════════════════════════════════════
const VOF_PREGUNTAS = [
    // Taylor Swift
    { p: 'Taylor Swift nació en Pennsylvania, Estados Unidos.', r: true },
    { p: 'Taylor Swift escribió "Shake It Off" para el álbum "Red".', r: false },
    { p: 'El álbum "folklore" fue grabado durante la pandemia de COVID-19.', r: true },
    { p: 'Taylor Swift ha ganado 4 premios Grammy al Álbum del Año.', r: true },
    { p: 'El color favorito de Taylor Swift es el verde.', r: false },
    { p: 'Taylor Swift tiene 3 gatos: Meredith, Olivia y Benjamin.', r: true },
    { p: '"Cruel Summer" fue un sencillo principal del álbum "Lover".', r: false },
    { p: 'Taylor Swift empezó su carrera en la música country.', r: true },
    { p: '"Midnights" fue el álbum más vendido de 2022 a nivel mundial.', r: true },
    { p: 'Taylor Swift escribió la canción "Bad Blood" sobre Katy Perry.', r: true },
    { p: '"Blank Space" está en el álbum "reputation".', r: false },
    { p: 'Taylor Swift estudió en la universidad de Nueva York antes de su carrera.', r: false },
    { p: 'El Eras Tour de Taylor Swift comenzó en 2023 en Estados Unidos.', r: true },
    { p: 'La canción "exile" de "evermore" cuenta con la colaboración de Ed Sheeran.', r: false },
    { p: '"The Tortured Poets Department" fue lanzado en 2024.', r: true },
    { p: '"cardigan" fue el primer sencillo del álbum "folklore".', r: true },
    { p: 'Taylor Swift tiene el record de más álbumes número 1 simultáneos en la historia.', r: true },
    { p: '"You Belong With Me" está en el álbum "Speak Now".', r: false },
    { p: 'Taylor Swift fue la primera artista en tener todos los Top 10 del Billboard Hot 100 al mismo tiempo.', r: true },
    { p: '"evermore" tiene una colaboración con Bon Iver en la canción "exile".', r: false },
    // General
    { p: 'La Torre Eiffel fue construida para la Exposición Universal de París de 1889.', r: true },
    { p: 'El océano Pacífico es más pequeño que el Atlántico.', r: false },
    { p: 'El colibrí es el único pájaro que puede volar hacia atrás.', r: true },
    { p: 'La Gran Muralla China es visible desde el espacio a simple vista.', r: false },
    { p: 'El español es el segundo idioma más hablado del mundo por número de hablantes nativos.', r: true },
    { p: 'Los delfines son los únicos animales además de los humanos que se dan nombres entre sí.', r: true },
    { p: 'El Monte Everest es el punto más alejado del centro de la Tierra.', r: false },
    { p: 'La miel nunca caduca, pueden encontrarse muestras comestibles de más de 3000 años.', r: true },
    { p: 'El Sol es una estrella tipo gigante roja.', r: false },
    { p: 'El pulpo tiene tres corazones.', r: true },
    { p: 'Argentina ganó la Copa del Mundo 2022 en Qatar.', r: true },
    { p: 'El cerebro humano usa el 100% de su capacidad todo el tiempo.', r: false },
    { p: 'Venus gira en dirección opuesta a la mayoría de los planetas del sistema solar.', r: true },
    { p: 'El bambú es en realidad una hierba, no un árbol.', r: true },
    { p: 'Los camellos almacenan agua en sus jorobas.', r: false },
    { p: 'Napoleón Bonaparte medía aproximadamente 1.68 metros, una altura promedio para su época.', r: true },
    { p: 'El ADN humano comparte un 98% de similitud con el de los chimpancés.', r: true },
    { p: 'La luna tiene su propia luz propia, independiente del Sol.', r: false },
    { p: 'El país con más biodiversidad del mundo es Brasil.', r: true },
    { p: 'La velocidad de la luz es de aproximadamente 300,000 km/s.', r: true },
    // más Taylor Swift
    { p: '"folklore" y "evermore" fueron grabados durante la pandemia de 2020.', r: true },
    { p: 'Travis Kelce es jugador de béisbol y novio de Taylor Swift.', r: false },
    { p: 'Taylor Swift escribió la canción "This Love" para la película "Diveregent".', r: false },
    { p: '"Blank Space" está en el álbum "1989".', r: true },
    { p: '"Delicate" está en el álbum "Lover".', r: false },
    { p: 'Taylor Swift tiene 3 gatos llamados Meredith, Olivia y Benjamin.', r: true },
    { p: 'El Eras Tour fue el primer tour de Taylor Swift en superar los 1000 millones de dólares en ingresos.', r: true },
    { p: '"Clean" es la pista número 5 del álbum "1989".', r: false },
    { p: 'Taylor Swift anunció "folklore" con solo horas de anticipación, sin previo aviso.', r: true },
    { p: 'Taylor Swift colaboró con Bon Iver en la canción "exile" del álbum "evermore".', r: true },
    { p: '"The Tortured Poets Department" tiene un álbum doble llamado "The Anthology".', r: true },
    { p: 'Taylor Swift grabó "evermore" antes que "folklore".', r: false },
    { p: '"Anti-Hero" fue el sencillo más largo en el número 1 del Hot 100 de la historia de Taylor Swift.', r: true },
    { p: 'Taylor Swift es la primera artista en tener todos sus álbumes certificados platino en EE.UU.', r: true },
    // más general
    { p: 'El colibrí puede batir sus alas hasta 80 veces por segundo.', r: true },
    { p: 'Plutón sigue siendo considerado un planeta en el sistema solar.', r: false },
    { p: 'La ciudad de Nueva York fue la primera capital de Estados Unidos.', r: true },
    { p: 'El tiburón ballena es el pez más grande del mundo.', r: true },
    { p: 'Los peces no tienen memoria de corto plazo.', r: false },
    { p: 'El chocolate negro puede ser tóxico para los perros.', r: true },
    { p: 'Los humanos usan solo el 10% de su cerebro.', r: false },
    { p: 'La Muralla China fue construida de una sola vez.', r: false },
    { p: 'El café es la bebida más consumida en el mundo después del agua.', r: true },
    { p: 'Los flamencos son rosados por naturaleza desde que nacen.', r: false },
    { p: 'El lenguaje más hablado en internet es el inglés.', r: true },
    { p: 'Brazil es el único país de América del Sur donde se habla portugués.', r: true },
    { p: 'El Monte Everest crece cada año debido a la actividad geológica.', r: true },
    { p: 'Los pingüinos viven solo en el hemisferio sur.', r: true },
    { p: 'La Gran Barrera de Coral de Australia es el ecosistema más grande del mundo.', r: true },
    { p: 'Los humanos comparten el 50% de su ADN con los plátanos.', r: true },
    { p: 'El sol tiene aproximadamente 5 mil millones de años de edad.', r: true },
    { p: 'La luna se aleja de la Tierra unos 3.8 cm cada año.', r: true },
    { p: 'El agua caliente se congela más rápido que el agua fría (efecto Mpemba).', r: true },
    { p: 'Todos los continentes estuvieron unidos en un supercontinente llamado Pangea.', r: true },
    { p: 'El corazón de una ballena azul es tan grande que un humano puede entrar gateando.', r: true },
    // pop culture
    { p: 'Squid Game es una serie surcoreana de Netflix.', r: true },
    { p: 'El anime "One Piece" tiene más de 1000 episodios.', r: true },
    { p: 'BTS es un grupo de k-pop compuesto por 7 integrantes.', r: true },
    { p: 'Minecraft fue creado originalmente por la empresa Microsoft.', r: false },
    { p: 'Fortnite es un battle royale que puede soportar hasta 100 jugadores.', r: true },
    { p: 'El Joker es el villano más icónico de Superman.', r: false },
    { p: '"Avengers: Endgame" es la película más taquillera de la historia.', r: true },
    { p: 'Dragon Ball Z se basa en el manga de Masashi Kishimoto.', r: false },
    { p: 'El personaje de Naruto es un ninja que quiere ser Hokage.', r: true },
    { p: 'Attack on Titan terminó su manga en 2021.', r: true },
];

// ══════════════════════════════════════════
//  BANCO: ADIVINA EL EMOJI
// ══════════════════════════════════════════
const EMOJI_ADIVINA = [
    // Álbumes Taylor Swift
    { emojis: '🤠🌟🎸', r: 'taylor swift', categoria: 'Álbum de Taylor Swift' },
    { emojis: '😱🏆🌟', r: 'fearless', categoria: 'Álbum de Taylor Swift' },
    { emojis: '🗣️🔊📅', r: 'speak now', categoria: 'Álbum de Taylor Swift' },
    { emojis: '❤️🔴🍂', r: 'red', categoria: 'Álbum de Taylor Swift' },
    { emojis: '📅1️⃣9️⃣8️⃣9️⃣', r: '1989', categoria: 'Álbum de Taylor Swift' },
    { emojis: '🐍💀⚡', r: 'reputation', categoria: 'Álbum de Taylor Swift' },
    { emojis: '💘🌈🦋', r: 'lover', categoria: 'Álbum de Taylor Swift' },
    { emojis: '🌲🌫️📖', r: 'folklore', categoria: 'Álbum de Taylor Swift' },
    { emojis: '🍂🌿🌙', r: 'evermore', categoria: 'Álbum de Taylor Swift' },
    { emojis: '🌙🕛💜', r: 'midnights', categoria: 'Álbum de Taylor Swift' },
    // Canciones Taylor Swift
    { emojis: '💘📖🎉', r: 'love story', categoria: 'Canción de Taylor Swift' },
    { emojis: '🤝❌💔', r: 'we are never ever getting back together', categoria: 'Canción de Taylor Swift' },
    { emojis: '👾🦸‍♂️😈', r: 'anti-hero', categoria: 'Canción de Taylor Swift' },
    { emojis: '🌊🏄‍♀️🎶', r: 'shake it off', categoria: 'Canción de Taylor Swift' },
    { emojis: '😎🌞😤', r: 'you need to calm down', categoria: 'Canción de Taylor Swift' },
    { emojis: '🃏🔫💋', r: 'blank space', categoria: 'Canción de Taylor Swift' },
    { emojis: '☀️😈🌈', r: 'cruel summer', categoria: 'Canción de Taylor Swift' },
    // Películas / series
    { emojis: '🦁👑🌅', r: 'el rey leon', categoria: 'Película' },
    { emojis: '🧊👸⛄', r: 'frozen', categoria: 'Película' },
    { emojis: '🤿🐠🌊', r: 'buscando a nemo', categoria: 'Película' },
    { emojis: '🦸‍♂️🕷️🏙️', r: 'spiderman', categoria: 'Película' },
    { emojis: '⚗️🚗🕰️', r: 'volver al futuro', categoria: 'Película' },
    { emojis: '🧙‍♂️💍🌋', r: 'el señor de los anillos', categoria: 'Película' },
    { emojis: '🦈🌊😱', r: 'tiburon', categoria: 'Película' },
    { emojis: '🚂⚡🧙', r: 'harry potter', categoria: 'Película/Saga' },
    { emojis: '🤖🌍⚔️', r: 'transformers', categoria: 'Película' },
    { emojis: '🐼🥋🏆', r: 'kung fu panda', categoria: 'Película' },
    { emojis: '👸💃🥿🕛', r: 'cenicienta', categoria: 'Película' },
    // Anime
    { emojis: '🍜🍥🌀', r: 'naruto', categoria: 'Anime' },
    { emojis: '🔮👁️🧿', r: 'demon slayer', categoria: 'Anime' },
    { emojis: '🌙⚔️🏴', r: 'bleach', categoria: 'Anime' },
    { emojis: '⚓🍖👒', r: 'one piece', categoria: 'Anime' },
    { emojis: '⚡🐾🎮', r: 'pokemon', categoria: 'Anime' },
    { emojis: '🤺⚙️💥', r: 'fullmetal alchemist', categoria: 'Anime' },
    { emojis: '🗡️👁️🧱', r: 'attack on titan', categoria: 'Anime' },
    // más anime
    { emojis: '🐲⚡🔴', r: 'dragon ball', categoria: 'Anime' },
    { emojis: '💀📓🍎', r: 'death note', categoria: 'Anime' },
    { emojis: '🦸💪🌀', r: 'my hero academia', categoria: 'Anime' },
    { emojis: '🕵️🎪🃏', r: 'hunter x hunter', categoria: 'Anime' },
    { emojis: '🔵💧⚗️', r: 'fullmetal alchemist', categoria: 'Anime' },
    { emojis: '🕶️☕🍩', r: 'death note', categoria: 'Anime' },
    { emojis: '🌸🏫💘', r: 'kaguya-sama', categoria: 'Anime' },
    { emojis: '🔪🌊🩸', r: 'demon slayer', categoria: 'Anime' },
    { emojis: '👁️🌿🔮', r: 'jujutsu kaisen', categoria: 'Anime' },
    { emojis: '🧲⚙️💀', r: 'chainsaw man', categoria: 'Anime' },
    { emojis: '🏐🧢🏆', r: 'haikyuu', categoria: 'Anime' },
    { emojis: '🎻🌹👦', r: 'your lie in april', categoria: 'Anime' },
    { emojis: '🗺️⛵🌊', r: 'one piece', categoria: 'Anime' },
    { emojis: '🕷️🌐📞', r: 'sword art online', categoria: 'Anime' },
    { emojis: '🌸🌊💙', r: 'violet evergarden', categoria: 'Anime' },
    // más canciones TS
    { emojis: '🎉🥳🎂', r: 'the birthday party', categoria: 'Canción de Taylor Swift' },
    { emojis: '🌙🎸💜', r: 'lavender haze', categoria: 'Canción de Taylor Swift' },
    { emojis: '🚗🌙💨', r: 'getaway car', categoria: 'Canción de Taylor Swift' },
    { emojis: '🔮👻🎭', r: 'look what you made me do', categoria: 'Canción de Taylor Swift' },
    { emojis: '🌈💐🦋', r: 'me', categoria: 'Canción de Taylor Swift' },
    { emojis: '📜🎻🕰️', r: 'long live', categoria: 'Canción de Taylor Swift' },
    { emojis: '🌙⭐😴', r: 'the 1', categoria: 'Canción de Taylor Swift' },
    { emojis: '🚪🚶‍♀️💔', r: 'champagne problems', categoria: 'Canción de Taylor Swift' },
    // más películas
    { emojis: '🎭🎪🃏', r: 'joker', categoria: 'Película' },
    { emojis: '🦇🌃💰', r: 'batman', categoria: 'Película' },
    { emojis: '🧊☀️🦁', r: 'the lion witch and the wardrobe', categoria: 'Película' },
    { emojis: '🤖❤️🌎', r: 'wall-e', categoria: 'Película' },
    { emojis: '🏎️💨🏁', r: 'cars', categoria: 'Película' },
    { emojis: '🐟💙🌊', r: 'buscando a dory', categoria: 'Película' },
    { emojis: '🍄🏎️🍄', r: 'super mario bros', categoria: 'Película' },
    { emojis: '👻🎃🕯️', r: 'coco', categoria: 'Película' },
    { emojis: '🔬🧫👾', r: 'ant man', categoria: 'Película' },
    { emojis: '⚡🌩️🪁', r: 'thor', categoria: 'Película' },
    { emojis: '❄️🌹🕰️', r: 'la bella y la bestia', categoria: 'Película' },
    { emojis: '💃🌹🇦🇷', r: 'tango', categoria: 'Baile/Cultura' },
    { emojis: '🐉🏔️🧝', r: 'dragon age', categoria: 'Videojuego' },
    { emojis: '🌺👸🏝️', r: 'moana', categoria: 'Película' },
    { emojis: '🪐🔭⭐', r: 'interestellar', categoria: 'Película' },
    { emojis: '🃏🔴🕹️', r: 'among us', categoria: 'Videojuego' },
    { emojis: '⛏️🌳🌙', r: 'minecraft', categoria: 'Videojuego' },
    { emojis: '🔫🌊🏝️', r: 'fortnite', categoria: 'Videojuego' },
    { emojis: '🐉🗡️⚔️', r: 'the witcher', categoria: 'Videojuego' },
    { emojis: '🦁🐘🌿', r: 'the lion king', categoria: 'Película' },
    { emojis: '🎤🎙️🌟', r: 'la voz', categoria: 'Serie/Reality' },
    { emojis: '🐚🧜‍♀️🌊', r: 'la sirenita', categoria: 'Película' },
];

// ══════════════════════════════════════════
//  TAYLOR SWIFT QUIZ
// ══════════════════════════════════════════
async function cmdTsQuiz(sock, jid, senderJid) {
    if (partidas.has(jid)) {
        await sock.sendMessage(jid, { text: '⚠️ Ya hay un minijuego activo. Respóndelo primero o usa *#stopgame*.' });
        return;
    }
    const q = TRIVIAS_TAYLOR[Math.floor(Math.random() * TRIVIAS_TAYLOR.length)];
    const premio = Math.floor(Math.random() * 250) + 150;

    const timeout = setTimeout(async () => {
        if (partidas.get(jid)?.tipo === 'tsquiz') {
            partidas.delete(jid);
            await sock.sendMessage(jid, { text: `⏰ *¡Tiempo agotado!*\nLa respuesta era: *${q.r}*` }).catch(() => {});
        }
    }, 30000);

    partidas.set(jid, { tipo: 'tsquiz', respuesta: q.r, premio, timeout });

    await sock.sendMessage(jid, {
        text: `🌟✨ *¡TRIVIA TAYLOR SWIFT!* ✨🌟\n\n❓ *${q.p}*\n\n💰 Premio: *${premio} ⓃNexCoins*\n⏳ Tienes *30 segundos* para responder.\n\n_¿Eres un Swiftie de verdad?_ 🎤`
    });
}

// ══════════════════════════════════════════
//  COMPLETA LA LETRA
// ══════════════════════════════════════════
async function cmdCompleta(sock, jid, senderJid) {
    if (partidas.has(jid)) {
        await sock.sendMessage(jid, { text: '⚠️ Ya hay un minijuego activo. Respóndelo primero o usa *#stopgame*.' });
        return;
    }
    const entrada = LETRAS_COMPLETA[Math.floor(Math.random() * LETRAS_COMPLETA.length)];
    const premio = Math.floor(Math.random() * 200) + 100;

    const timeout = setTimeout(async () => {
        if (partidas.get(jid)?.tipo === 'completa') {
            partidas.delete(jid);
            await sock.sendMessage(jid, { text: `⏰ *¡Tiempo agotado!*\nLa respuesta era: *"${entrada.r}"*\n🎵 ${entrada.artista}` }).catch(() => {});
        }
    }, 40000);

    partidas.set(jid, { tipo: 'completa', respuesta: entrada.r, artista: entrada.artista, premio, timeout });

    await sock.sendMessage(jid, {
        text: `🎵 *¡COMPLETA LA LETRA!*\n\n${entrada.pista}\n\n💰 Premio: *${premio} ⓃNexCoins*\n⏳ Tienes *40 segundos* para completar la frase.\n\n_Escribe solo la parte que falta (donde están los ___)_`
    });
}

// ══════════════════════════════════════════
//  VERDADERO O FALSO
// ══════════════════════════════════════════
async function cmdVof(sock, jid, senderJid) {
    if (partidas.has(jid)) {
        await sock.sendMessage(jid, { text: '⚠️ Ya hay un minijuego activo. Respóndelo primero o usa *#stopgame*.' });
        return;
    }
    const q = VOF_PREGUNTAS[Math.floor(Math.random() * VOF_PREGUNTAS.length)];
    const premio = Math.floor(Math.random() * 120) + 60;
    const respuestaTexto = q.r ? 'verdadero' : 'falso';

    const timeout = setTimeout(async () => {
        if (partidas.get(jid)?.tipo === 'vof') {
            partidas.delete(jid);
            await sock.sendMessage(jid, { text: `⏰ *¡Tiempo!*\nLa respuesta era: *${respuestaTexto.toUpperCase()}* ${q.r ? '✅' : '❌'}` }).catch(() => {});
        }
    }, 25000);

    partidas.set(jid, { tipo: 'vof', esVerdadero: q.r, respuesta: respuestaTexto, premio, timeout });

    await sock.sendMessage(jid, {
        text: `✅❌ *¡VERDADERO O FALSO!*\n\n📋 *${q.p}*\n\n💰 Premio: *${premio} ⓃNexCoins*\n⏳ Tienes *25 segundos*\n\n_Responde con:_ *verdadero* _/_ *v* _o_ *falso* _/_ *f*`
    });
}

// ══════════════════════════════════════════
//  ADIVINA EL EMOJI
// ══════════════════════════════════════════
async function cmdEmojiAdivina(sock, jid, senderJid) {
    if (partidas.has(jid)) {
        await sock.sendMessage(jid, { text: '⚠️ Ya hay un minijuego activo. Respóndelo primero o usa *#stopgame*.' });
        return;
    }
    const entrada = EMOJI_ADIVINA[Math.floor(Math.random() * EMOJI_ADIVINA.length)];
    const premio = Math.floor(Math.random() * 200) + 120;

    const timeout = setTimeout(async () => {
        if (partidas.get(jid)?.tipo === 'emojiadivina') {
            partidas.delete(jid);
            await sock.sendMessage(jid, { text: `⏰ *¡Tiempo agotado!*\nLa respuesta era: *${entrada.r.toUpperCase()}* (${entrada.categoria})` }).catch(() => {});
        }
    }, 35000);

    partidas.set(jid, { tipo: 'emojiadivina', respuesta: entrada.r, categoria: entrada.categoria, premio, timeout });

    await sock.sendMessage(jid, {
        text: `🎭 *¡ADIVINA EL EMOJI!*\n\n${entrada.emojis}\n\n🏷️ Categoría: _${entrada.categoria}_\n\n💰 Premio: *${premio} ⓃNexCoins*\n⏳ Tienes *35 segundos*\n\n_¿Qué ${entrada.categoria.toLowerCase()} representan estos emojis?_`
    });
}

// ══════════════════════════════════════════
//  BOLA 8 — ORÁCULO ALEATORIO
// ══════════════════════════════════════════
const BOLA8_RESPUESTAS = [
    // Positivas
    '🎱 *Sí, definitivamente.*',
    '🎱 *Todo apunta a que sí.*',
    '🎱 *Sin duda alguna.*',
    '🎱 *Puedes contar con ello.*',
    '🎱 *Las señales dicen que sí.*',
    '🎱 *Así es, con toda seguridad.*',
    '🎱 *Los astros dicen que sí.*',
    // Negativas
    '🎱 *No.*',
    '🎱 *Mis fuentes dicen que no.*',
    '🎱 *No lo creo.*',
    '🎱 *Las perspectivas no son buenas.*',
    '🎱 *Definitivamente no.*',
    '🎱 *Olvídalo, no va a pasar.*',
    '🎱 *Ni en tus sueños más locos.*',
    // Neutras / inciertas
    '🎱 *Tal vez...*',
    '🎱 *Pregunta más tarde.*',
    '🎱 *No puedo predecirlo ahora.*',
    '🎱 *Concéntrate y vuelve a preguntar.*',
    '🎱 *La respuesta no está clara, inténtalo de nuevo.*',
    '🎱 *Mejor no te lo digo...*',
    '🎱 *El universo aún no lo decide.*',
    '🎱 *Depende de ti, no de mí.*',
    // Graciosas
    '🎱 *Jajaja... sí.*',
    '🎱 *Jajaja... no.*',
    '🎱 *La bola 8 se niega a responder esa pregunta.*',
    '🎱 *Solo si le rezas a la bola 8 primero.*',
    '🎱 *Pregúntale a tu abuela, yo no sé.*',
    '🎱 *Mi abogado me recomienda no responder eso.*',
    '🎱 *¿De verdad necesitas preguntarme eso? ...Sí.*',
    '🎱 *¿De verdad necesitas preguntarme eso? ...No.*',
];

async function cmdBola8(sock, jid, senderJid, args) {
    const pregunta = args.trim();
    if (!pregunta) {
        await sock.sendMessage(jid, {
            text: '🎱 *La Bola 8*\n\nHazme una pregunta de sí o no y la bola revelará tu destino.\n\n_Uso:_ `#8ball ¿tu pregunta aquí?`'
        });
        return;
    }
    const respuesta = BOLA8_RESPUESTAS[Math.floor(Math.random() * BOLA8_RESPUESTAS.length)];
    await sock.sendMessage(jid, {
        text: `🎱 *LA BOLA 8 HABLA*\n\n❓ _${pregunta}_\n\n${respuesta}`
    });
}

module.exports = { cmdTrivia, cmdMath, cmdGuess, cmdWordchain, cmdStopGame, cmdPpt, cmdAhorcado, cmdScramble, cmdQuien, procesarRespuesta, cmdTsQuiz, cmdCompleta, cmdVof, cmdEmojiAdivina, cmdBola8 };
