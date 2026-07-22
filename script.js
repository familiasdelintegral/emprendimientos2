/* ============================================================
   Directorio de Familias del Integral
   Trae los datos EN VIVO desde la planilla de Google Sheets
   (no hace falta tocar este archivo cuando se suman familias)
   ============================================================ */

// ---------- CONFIGURACIÓN ----------

// ID de la planilla (no se usa mientras la sincronización en vivo esté apagada, ver nota abajo)
const SHEET_ID = "1-A5n5hUEAdXqusFchNjJwUeR4GpPZ5T1G9IrmM3oDIY";

// Link del Google Form real, para el botón "Sumar mi emprendimiento".
const FORM_URL = "https://docs.google.com/forms/d/e/1FAIpQLScAf89f_lb6PX70B_-blleBcod6rDsryDszCLDYOpGogqpaWQ/viewform";

// Filas que sabemos que son pruebas y no deben publicarse nunca,
// aunque tengan nombre de emprendimiento cargado.
const EXCLUDED_ENTRIES = [
  { nombre: "sole prueba", email: "familias.integral@integralnuevosayres.esc.edu.ar" }
];

// ---------- CARGA DE DATOS (JSONP, sin necesidad de backend) ----------

function loadSheetData() {
  return new Promise((resolve, reject) => {
    const callbackName = "onSheetData_" + Date.now();
    const script = document.createElement("script");

    window[callbackName] = (json) => {
      resolve(json);
      delete window[callbackName];
      script.remove();
    };

    script.onerror = () => reject(new Error("No se pudo cargar la planilla."));
    script.src =
      `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:json;responseHandler:${callbackName}`;
    document.body.appendChild(script);
  });
}

// ---------- HELPERS DE NORMALIZACIÓN ----------

const norm = (v) => (v === null || v === undefined ? "" : String(v)).trim();

// Escapa HTML para que texto libre cargado en el formulario (nombre,
// descripción, rubro "Otro", etc.) nunca pueda inyectar markup/scripts.
const escapeHtml = (v) =>
  norm(v)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

const foldSearch = (s) =>
  norm(s)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");

function findHeaderIndex(headers, keywords) {
  return headers.findIndex((h) =>
    keywords.some((k) => foldSearch(h).includes(foldSearch(k)))
  );
}

const EMOJI_START = /^\p{Extended_Pictographic}/u;

function normalizeCategory(raw) {
  const text = norm(raw);
  if (!text) return "✨ Otros";
  return EMOJI_START.test(text) ? text : "✨ Otros";
}

function normalizeWhatsapp(raw) {
  const digits = norm(raw).replace(/\D/g, "");
  if (digits.length < 8) return null;
  let out = digits;
  if (!out.startsWith("54")) {
    out = "549" + out;
  } else if (!out.startsWith("549")) {
    out = "549" + out.slice(2);
  }
  return out;
}

function normalizeInstagram(raw) {
  let text = norm(raw);
  if (!text) return null;
  text = text.replace(/^https?:\/\/(www\.)?instagram\.com\//i, "");
  text = text.replace(/^@/, "").replace(/\/$/, "");
  if (!/^[A-Za-z0-9._]{2,40}$/.test(text)) return null;
  return text;
}

function normalizeWebsites(raw) {
  const text = norm(raw);
  if (!text) return [];
  const skipWords = ["construcci", "no aplica", "whatsapp", "instagram", "-"];
  return text
    .split(/::|,|\n|;/)
    .map((s) => s.trim())
    .filter((s) => s && s.length > 1)
    .filter((s) => !skipWords.some((w) => foldSearch(s).includes(w)))
    .filter((s) => /\.[a-z]{2,}/i.test(s))
    .map((s) => (/^https?:\/\//i.test(s) ? s : "https://" + s));
}

function driveDirectImage(url) {
  const m = norm(url).match(/[-\w]{25,}/);
  if (!m) return null;
  return `https://drive.google.com/thumbnail?id=${m[0]}&sz=w600`;
}

function normalizePhotos(raw) {
  const text = norm(raw);
  if (!text) return [];
  return text
    .split(/,|\n/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map(driveDirectImage)
    .filter(Boolean);
}

function extractEmoji(category) {
  const m = norm(category).match(EMOJI_START);
  return m ? m[0] : "🧡";
}

function isExcluded(nombre, email) {
  const n = foldSearch(nombre);
  const e = foldSearch(email);
  return EXCLUDED_ENTRIES.some(
    (ex) => foldSearch(ex.nombre) === n && foldSearch(ex.email) === e
  );
}

// ---------- PARSEO DE LA RESPUESTA DE GOOGLE SHEETS ----------

function parseSheetJson(json) {
  const table = json.table;
  const headers = table.cols.map((c) => norm(c.label));

  const col = {
    email: findHeaderIndex(headers, ["correo electronico"]),
    nombre: findHeaderIndex(headers, ["nombre y apellido"]),
    sala: findHeaderIndex(headers, ["sala o grado"]),
    negocio: findHeaderIndex(headers, ["emprendimiento, oficio"]),
    rubro: findHeaderIndex(headers, ["rubro"]),
    descripcion: findHeaderIndex(headers, ["describi lo que haces"]),
    whatsapp: findHeaderIndex(headers, ["whatsapp"]),
    instagram: findHeaderIndex(headers, ["instagram"]),
    web: findHeaderIndex(headers, ["sitio web"]),
    fotos: findHeaderIndex(headers, ["subir tus fotos"]),
  };

  const cell = (row, idx) =>
    idx >= 0 && row.c[idx] ? norm(row.c[idx].v) : "";

  return table.rows
    .map((row) => {
      const negocio = cell(row, col.negocio);
      const nombre = cell(row, col.nombre);
      const email = cell(row, col.email);
      return {
        negocio,
        nombre,
        email,
        sala: cell(row, col.sala),
        rubro: normalizeCategory(cell(row, col.rubro)),
        descripcion: cell(row, col.descripcion),
        whatsapp: normalizeWhatsapp(cell(row, col.whatsapp)),
        instagram: normalizeInstagram(cell(row, col.instagram)),
        webs: normalizeWebsites(cell(row, col.web)),
        fotos: normalizePhotos(cell(row, col.fotos)),
      };
    })
    .filter((r) => r.negocio) // debe tener nombre de emprendimiento cargado
    .filter((r) => !isExcluded(r.nombre, r.email));
}

// ---------- BASE DE DATOS (planilla consolidada histórico + formulario 2026) ----------
// Esta lista viene de la planilla "Emprendimientos CINA - Consolidado" que
// unifica la planilla histórica (pre-2026) con las respuestas del formulario
// actual hasta el 20/7/2026, con las fotos ya emparejadas a cada emprendimiento.
//
// El sitio dejó de sincronizar en vivo con Google Sheets: la planilla del
// formulario quedó en una cuenta corporativa del cole que no se puede
// compartir públicamente, así que por ahora esta lista es la única fuente de
// datos del sitio (se actualiza a mano).
//
// Para sumar, corregir o sacar un emprendimiento: se edita directamente este
// array. Si sumás una foto nueva, guardala en la carpeta images/ y poné la
// ruta ("images/nombre-del-archivo.jpg") en el campo fotos de esa entrada.
const CONSOLIDATED_ENTRIES = [
  {
    negocio: 'Lic. En trabajo social',
    nombre: 'Natalia Delgado',
    sala: 'Plateado, Naranja',
    rubro: '💼 Profesionales',
    descripcion: '',
    whatsapp: '5491156659428',
    instagram: null,
    webs: [],
    fotos: [],
  },
  {
    negocio: 'Correctora de textos',
    nombre: 'Milagros Schroder',
    sala: 'Turquesa, Rojo',
    rubro: '💼 Profesionales',
    descripcion: 'Soy correctora de textos y asesora lingüística con perspectiva de género y derechos. Ayudo a mejorar textos para que sean claros, correctos, inclusivos y adecuados a cada público. Trabajo con materiales educativos, institucionales, profesionales y literarios, y también acompaño procesos de escritura y edición.',
    whatsapp: '5491151785225',
    instagram: null,
    webs: [],
    fotos: [],
  },
  {
    negocio: 'Agencia de marketing especializada en salud',
    nombre: 'Alejandra Paula Mercado',
    sala: 'Celeste',
    rubro: '💼 Profesionales',
    descripcion: 'Soy fundadora y directora de ConquerBA, una agencia de marketing, diseño y comunicación especializada en salud. Ayudamos a clínicas, instituciones, hospitales y empresas del sector a comunicar mejor lo que hacen: gestionamos sus estrategias de redes sociales, campañas de publicidad,  contenidos, sitios web, diseño y prensa. Trabajamos con clientes en Argentina y otros países.',
    whatsapp: '5491124951212',
    instagram: 'conquerba.marketing',
    webs: ['https://Conquerba.com'],
    fotos: ['images/agencia-de-marketing-especializada-en-salud-alejandra-paula-mercado.jpg'],
  },
  {
    negocio: 'Lic. En Sociologia',
    nombre: 'Laura Bialoskurnik',
    sala: 'Sala 4 B, Dorado',
    rubro: '💼 Profesionales',
    descripcion: 'Soy Lic. En Sociologia de la UBA. Me especializo en el acompañamiento de trayectorias educativas y en el trabajo en organizaciones no gubernamentales. Atenta a nuevas oportunidades 🩵🧡',
    whatsapp: '5491150514331',
    instagram: 'laubialoskurnik',
    webs: [],
    fotos: [],
  },
  {
    negocio: 'Abogada Stephanie Paola Berman',
    nombre: 'Stephanie Paola Berman',
    sala: 'Sala 4 B, Magenta',
    rubro: '💼 Profesionales',
    descripcion: 'Abogada matriculada en CABA, hago divorcios de mutuo acuerdo, sucesiones, despidos',
    whatsapp: '5491162628758',
    instagram: null,
    webs: [],
    fotos: ['images/abogada-stephanie-paola-berman-stephanie-paola-berman.png'],
  },
  {
    negocio: 'pura mantequilla',
    nombre: 'Karina Skop',
    sala: 'Sala 3 B',
    rubro: '🍽️ Gastronomía y viajes',
    descripcion: 'Hacemos pastas artesanales de frutos secos, con un proceso pensado para obtener una textura que facilite atravesar la etapa de selectividad alimentaria garantizando un producto rico y nutritivo. Usamos frutos secos agroecologicos u orgánicos, según la variedad, y usamos solamente utensilios de materiales nobles para disminuir la contaminación con microplásticos',
    whatsapp: '5491124011442',
    instagram: 'puramantequilla.arg',
    webs: ['https://Puramantequilla.ar'],
    fotos: ['images/pura-mantequilla-karina-skop.jpg'],
  },
  {
    negocio: 'Psicóloga',
    nombre: 'Daniela verdecchia',
    sala: 'Celeste',
    rubro: '💼 Profesionales',
    descripcion: 'Soy psicóloga, acompaño familias, parejas y mujeres que se encuentran transitando el período perinatal (TRHA, embarazo, puerperio, crianza). Asimismo, atiendo adultos, adolescentes e infantes.',
    whatsapp: '5491130573623',
    instagram: 'lic.daniverdecchia',
    webs: [],
    fotos: ['images/psicologa-daniela-verdecchia.jpg'],
  },
  {
    negocio: 'Pilates Reformer',
    nombre: 'Ana Laura Hiquis',
    sala: 'Sala 5 A, Naranja',
    rubro: '🩺 Salud y bienestar',
    descripcion: 'Hola soy Profesora de Educación Física y tengo un centro de Pilates Reformer en el Club Ateneo Popular Versalles APV. En el que damos  distintas variantes con el reformer para adaptarnos a las necesidades que cada uno necesita, tenemos Pilates Reformer,  Pilates Hiit, Pilates Circuito y Pilates Terapeutico.  La dirección es Roma 950 Versalles.   Cualquier consulta estoy a su disposición. Muchas gracias',
    whatsapp: '5491158235147',
    instagram: 'apv.pilates',
    webs: [],
    fotos: ['images/pilates-reformer-ana-laura-hiquis.jpg'],
  },
  {
    negocio: 'Abogado',
    nombre: 'Ricardo Martinez',
    sala: 'Celeste, Amarillo',
    rubro: '💼 Profesionales',
    descripcion: 'Soy abogado. Me dedico principalmente a temas de familia (infancia y adolescencia, divorcios, alimentos, sucesiones y violencia familiar), amparos de salud y cuestiones civiles e inmobiliarias. Acompaño y asesoro a cada cliente de manera cercana, clara y personalizada',
    whatsapp: '5491166705968',
    instagram: null,
    webs: [],
    fotos: [],
  },
  {
    negocio: 'DigitoA - imprenta',
    nombre: 'LAURA LUCIANA ANSELMI',
    sala: 'Magenta',
    rubro: '🎨 Arte y creatividad',
    descripcion: 'Tengo una imprenta, hacemos todo tipo de servicio gráficos, tarjetas, carpetas, flyers, etiquetas, vinilos, carteles y muchas cosas mas, todo dentro del sector gráfico.',
    whatsapp: '5491135580934',
    instagram: null,
    webs: [],
    fotos: [],
  },
  {
    negocio: 'Krona merchandising',
    nombre: 'Gerardo Barros',
    sala: 'Naranja',
    rubro: '✨ Otros',
    descripcion: 'Regalos empresariales y merchandising corporativo',
    whatsapp: '5491164475623',
    instagram: 'kronamerchandising',
    webs: ['https://Www.krona.com.ar'],
    fotos: ['images/krona-merchandising-gerardo-barros.jpg'],
  },
  {
    negocio: 'Merienda de abuelas',
    nombre: 'Constanza Romero',
    sala: 'Sala 3 B',
    rubro: '🍽️ Gastronomía y viajes',
    descripcion: 'Soy estudiante de pastelería y estoy lanzando mi emprendimiento de productos dulces y demás para vender',
    whatsapp: '5491154011122',
    instagram: 'Meriendadeabuelas',
    webs: [],
    fotos: ['images/merienda-de-abuelas-constanza-romero.jpg'],
  },
  {
    negocio: 'Mainumby cerámica',
    nombre: 'Candela Alonso',
    sala: 'Sala 1, Turquesa',
    rubro: '🎨 Arte y creatividad',
    descripcion: 'Hola soy Cande, ceramista aficionada. Siempre me gustó crear con mis manos, produzco piezas utilitarias y esculturales. También doy clases regulares de modelado en Villa Luro y Ramos Mejía. Para l@s que quieren una experiencia con amig@s, hago eventos a domicilio!',
    whatsapp: '5491134378884',
    instagram: 'Mainumby.ceramica',
    webs: ['https://mainumbyceramica.empretienda.com.ar'],
    fotos: ['images/mainumby-ceramica-candela-alonso.jpg'],
  },
  {
    negocio: 'Productor Avícola “Granja la cholita”',
    nombre: 'Antonio Domingo',
    sala: 'Sala 4 A, Lila',
    rubro: '🍽️ Gastronomía y viajes',
    descripcion: 'Soy productor Avícola, vendo huevos por Maple  y por cajón. Llevo a domicilio, (mínimo dos Maples) o a tu local, los días martes.',
    whatsapp: '5491144345221',
    instagram: null,
    webs: [],
    fotos: [],
  },
  {
    negocio: 'FABULOSA3D',
    nombre: 'Marilú Telleria',
    sala: 'Sala 4 B, Dorado',
    rubro: '🎨 Arte y creatividad',
    descripcion: 'Soluciones en impresión 3D para todos los días y eventos especiales. Pedidos personalizados y a medida . Souvenirs, gadgets, juguetes, artículos para el Cole (identificadores personalizados) y mucho más . Todo fabuloso en Fabulosa3D',
    whatsapp: '5491158605565',
    instagram: 'FABULOSA3D',
    webs: [],
    fotos: ['images/fabulosa3d-marilu-telleria.jpg'],
  },
  {
    negocio: 'Cerrajería',
    nombre: 'Giuliano Giacobetti',
    sala: 'Sala 4 B',
    rubro: '🔨 Servicios del hogar',
    descripcion: 'Soy cerrajero de cerraduras convencionales, cerraduras electrónicas proveedor e instalador oficial de las empresas ezviz y Philips, pudiendo garantizar dos años de garantía por las mismas.',
    whatsapp: '5491135519007',
    instagram: 'Cerrajeria_ferreteria_latres',
    webs: [],
    fotos: ['images/cerrajeria-giuliano-giacobetti.jpg'],
  },
  {
    negocio: 'Productora audiovisual, comercial y de eventos',
    nombre: 'Ana Julia Bomaggio',
    sala: 'Turquesa, Celeste',
    rubro: '🎨 Arte y creatividad',
    descripcion: 'Soy productora senior, realizadora de contenidos audiovisuales y desarrollo tareas vinculadas al periodismo, prensa, streaming, y eventos sociales y corporativos',
    whatsapp: '5491164450019',
    instagram: null,
    webs: [],
    fotos: [],
  },
  {
    negocio: 'Terrum Gestión Inmobiliaria',
    nombre: 'Hernan Peñaloza',
    sala: 'Turquesa',
    rubro: '✨ Otros',
    descripcion: 'Gestión Inmobiliaria y construcción',
    whatsapp: '54911545425',
    instagram: null,
    webs: ['https://Terrum.com.ar', 'https://Landingpropiedades.com.ar'],
    fotos: ['images/terrum-gestion-inmobiliaria-hernan-penaloza.png'],
  },
  {
    negocio: 'Contador',
    nombre: 'Fabio Alessandro',
    sala: 'Sala 5 A',
    rubro: '💼 Profesionales',
    descripcion: 'Estudio contable Pymes y personas fisicas',
    whatsapp: '54911663937',
    instagram: null,
    webs: ['https://estudioalessandro.com.ar'],
    fotos: ['images/contador-fabio-alessandro.png'],
  },
  {
    negocio: 'Fletes Echeverria',
    nombre: 'Milton Echeverria',
    sala: 'Magenta',
    rubro: '🍽️ Gastronomía y viajes',
    descripcion: 'Hacemos mudanzas y traslados. \nTrabajamos de lunes a sábados',
    whatsapp: '5491168089817',
    instagram: 'fletesecheverria',
    webs: [],
    fotos: ['images/fletes-echeverria-milton-echeverria.jpg'],
  },
  {
    negocio: 'Psicóloga',
    nombre: 'Luciana slipakoff',
    sala: 'Sala 4 A, Verde',
    rubro: '🩺 Salud y bienestar',
    descripcion: 'Soy psicóloga. Atiendo pacientes jóvenes, adultxs y personas mayores tanto en mi consultorio particular en Villa del Parque como online. También coordino propuestas grupales de interés para personas +60',
    whatsapp: '5491161591473',
    instagram: null,
    webs: [],
    fotos: [],
  },
  {
    negocio: 'Kinesiología pediatrica- estimulación temprana',
    nombre: 'Yanina Bliman',
    sala: 'Sala 5 B, Verde',
    rubro: '🩺 Salud y bienestar',
    descripcion: 'Soy kinesiologa especializada en niños con dificultades en el desarrollo. Tengo consultorio en Devoto.',
    whatsapp: '5491168206924',
    instagram: 'Lic.Yanina_Bliman',
    webs: [],
    fotos: ['images/kinesiologia-pediatrica-estimulacion-temprana-yanina-bliman.png'],
  },
  {
    negocio: 'Profe de Inglés',
    nombre: 'Sol Valeri',
    sala: 'Sala 4 A',
    rubro: '📚 Educación y clases',
    descripcion: 'Doy clases de inglés para apoyo escolar, preparación de exámenes internacionales. Por otro lado doy  coaching corporativo para adultos (preparación de entrevistas entrevistas laborales, clases para elevar tu nivel de inglés en entornos laborales)',
    whatsapp: '5491156355810',
    instagram: null,
    webs: [],
    fotos: [],
  },
  {
    negocio: 'Bienestar corporativo',
    nombre: 'Sol Valeri',
    sala: 'Sala 4 A',
    rubro: '🩺 Salud y bienestar',
    descripcion: 'Creamos experiencias que transforman a las personas que trabajan en empresas e instituciones educativas. Armamos planes de bienestar a medida con nutricionistas, psicólogos, coaches, profesores de educación física y especialistas de la voz.',
    whatsapp: '5491151226997',
    instagram: 'Prima.bienestar',
    webs: ['https://www.primabienestar.com.ar'],
    fotos: ['images/bienestar-corporativo-sol-valeri.jpg'],
  },
  {
    negocio: 'Gestion ambiental',
    nombre: 'Pablo Di Alessandro',
    sala: 'Sala 5 A, Turquesa',
    rubro: '✨ Otros',
    descripcion: 'Profesional especializado en la gestión y valorización de residuos reciclables, con experiencia en el desarrollo de proyectos de economía circular orientados a la reducción, reutilización y reciclaje de materiales. Diseño e implemento soluciones de servicios industriales para todo tipo de residuos, contribuyendo a la sostenibilidad ambiental y a la optimización de procesos productivos mediante estrategias de aprovechamiento de recursos.',
    whatsapp: '5491166372101',
    instagram: null,
    webs: ['https://www.bra.com.ar'],
    fotos: ['images/gestion-ambiental-pablo-di-alessandro.svg'],
  },
  {
    negocio: 'Productora de Animación (2D, Stopmotion, digital y 3D)',
    nombre: 'Fernanda Torrera',
    sala: 'Plateado, Dorado',
    rubro: '🎨 Arte y creatividad',
    descripcion: 'Soy productora freelance, me dedico a pensar los proyectos de 0 en la técnica de animación que se requiera, y planifíco, ordeno y sistematizo todos los procesos de trabajo. Tengo ademas a cargo la comunicación entre todas las areas internas como con los clientes en la mayoría de los casos.',
    whatsapp: '5491162941830',
    instagram: 'mmmfer',
    webs: ['https://www.behance.com/fernandatorrera'],
    fotos: ['images/productora-de-animacion-2d-stopmotion-digital-y-3d-fernanda-torrera.jpeg'],
  },
  {
    negocio: 'Psicóloga Clínica y Perinatal',
    nombre: 'Lourdes',
    sala: '',
    rubro: '🩺 Salud y bienestar',
    descripcion: '',
    whatsapp: '5491167449504',
    instagram: null,
    webs: [],
    fotos: [],
  },
  {
    negocio: 'Asesor de medicina Prepaga / Asistencia al viajero OMINT',
    nombre: 'Gerardo Capanna',
    sala: '',
    rubro: '🩺 Salud y bienestar',
    descripcion: 'Consultas de cobertura y Valores de planes de salud OMINT',
    whatsapp: '5491158108008',
    instagram: null,
    webs: [],
    fotos: [],
  },
  {
    negocio: 'Equipo Corporalmente',
    nombre: 'Belen',
    sala: 'Turquesa, Bordó',
    rubro: '🩺 Salud y bienestar',
    descripcion: 'Licenciada en Psicomotricidad \nAtención niños y adolescentes de forma particular o por obra social.\n\nEs un espacio donde se brinda terapias de Psicomotricidad, psicología, psicopedagogía, fonoaudiologia y talleres de juegos y habilidades sociales.\nTrabajamos de manera interdisciplinaria tanto de forma particular como a través de obras sociales y prepagas.\nNos encontramos en el barrio de liniers. Con muchas vias de transporte cercanas.',
    whatsapp: '5491564187389',
    instagram: 'equipo_corporalmente',
    webs: [],
    fotos: ['images/equipo-corporalmente-belen.jpg'],
  },
  {
    negocio: 'Mano Verde, Slow Beauty',
    nombre: 'Samanta perez',
    sala: 'Verde, Amarillo',
    rubro: '🩺 Salud y bienestar',
    descripcion: 'Curaduria de cosmética orgánica y sustentable y limpia.\n\nCuraduría de Productos Cosméticos y de cuidados diarios conscientes. Trabajo 3 líneas: Cosmética Natural y Orgánica, Cosmética Frecuencial y Cosmética Dermatológica con fórmula Clean. Todos los productos son ecológicos, sin género y Cryelty free.',
    whatsapp: '5491169375698',
    instagram: 'manoverde.slowbeauty',
    webs: [],
    fotos: ['images/mano-verde-slow-beauty-samanta-perez.jpg'],
  },
  {
    negocio: 'Hard Core Studio Pilates',
    nombre: 'Samanta Perez',
    sala: 'Verde, Amarillo',
    rubro: '🩺 Salud y bienestar',
    descripcion: 'Estudio de Pilates boutique (Max 4 alumnxs) en Devoto. \nTrabajo corporal de movimiento y entrenamiento consciente, priorizando la salud y el bienestar.',
    whatsapp: '5491169375698',
    instagram: 'hardcore_pilatesestudio',
    webs: [],
    fotos: ['images/hard-core-studio-pilates-samanta-perez.jpg'],
  },
  {
    negocio: 'Escuela de Danzas Tiempo Jazz',
    nombre: 'Gabriela Etcheberry',
    sala: 'Turquesa, Bordó',
    rubro: '🎨 Arte y creatividad',
    descripcion: 'Escuela de Danzas Tiempo Jazz \n\nConcordia 3505 . CABA',
    whatsapp: null,
    instagram: 'tiempojazz',
    webs: [],
    fotos: ['images/escuela-de-danzas-tiempo-jazz-gabriela-etcheberry.jpg'],
  },
  {
    negocio: 'Psicóloga',
    nombre: 'Natalie Garcia Hadeler',
    sala: 'Rojo',
    rubro: '🩺 Salud y bienestar',
    descripcion: 'Psicóloga de niñxs: terapia convencional con herramientas de arteterapia y homeopatía. \nPsicóloga de adultxs: terapia alternativa como reiki, homeopatía, sonoterapia con cuencos tibetanos,aromaterapia.\nPsicóloga holistica con perspectiva en género en toda atención.',
    whatsapp: '5491125849711',
    instagram: null,
    webs: [],
    fotos: [],
  },
  {
    negocio: 'Artista Visual',
    nombre: 'Melina Saredo',
    sala: 'Magenta, Celeste',
    rubro: '🎨 Arte y creatividad',
    descripcion: 'Mi nombre es Melina Saredo, soy Artista visual emprendedora y pintó murales a pedido personalizados (infantiles, comerciales, etc)\nActualmente, además gestiono y coordino mi taller de arte que se llama @latortugapintora, funciona dentro de las instalaciones del Club GEVP en villa del parque.',
    whatsapp: '5491561030645',
    instagram: 'melinasaredo',
    webs: ['https://melinasaredo.wixsite.com/artes'],
    fotos: ['images/artista-visual-melina-saredo.jpg'],
  },
  {
    negocio: 'Contador',
    nombre: 'Mariano Russo',
    sala: 'Azul',
    rubro: '💼 Profesionales',
    descripcion: '',
    whatsapp: '5491151077528',
    instagram: null,
    webs: [],
    fotos: [],
  },
  {
    negocio: 'Medica',
    nombre: 'Maria Sol',
    sala: 'Verde, Lila',
    rubro: '🩺 Salud y bienestar',
    descripcion: 'Medica',
    whatsapp: '5491167309197',
    instagram: null,
    webs: [],
    fotos: [],
  },
  {
    negocio: 'Ingeniero en Sistemas',
    nombre: 'Dario',
    sala: 'Verde, Bordó',
    rubro: '💼 Profesionales',
    descripcion: 'Ingeniero en Sistemas',
    whatsapp: '5491558086436',
    instagram: null,
    webs: [],
    fotos: [],
  },
  {
    negocio: 'Comercio de lácteos',
    nombre: 'estebanpuyi@hotmail.com',
    sala: 'Naranja',
    rubro: '🍽️ Gastronomía y viajes',
    descripcion: 'Comercio de lácteos marca LUZ Azul',
    whatsapp: '5492254550354',
    instagram: null,
    webs: [],
    fotos: [],
  },
  {
    negocio: 'Abogado',
    nombre: 'Pablo Claverie',
    sala: 'Bordó',
    rubro: '💼 Profesionales',
    descripcion: 'Especializado en sucesiones y derecho laboral',
    whatsapp: '5491164626865',
    instagram: null,
    webs: [],
    fotos: [],
  },
  {
    negocio: 'Docente nivel terciario y asesora a instituciones educativas',
    nombre: 'Gabriela',
    sala: 'Bordó',
    rubro: '📚 Educación y clases',
    descripcion: '',
    whatsapp: null,
    instagram: null,
    webs: ['https://www.serendipiacausal.com.ar'],
    fotos: ['images/docente-nivel-terciario-y-asesora-a-instituciones-educativas-gabriela.png'],
  },
  {
    negocio: 'Consultor en finanzas, estrategia, marketing y RRHH',
    nombre: 'Gustavo Eidlin',
    sala: 'Bordó',
    rubro: '💼 Profesionales',
    descripcion: '',
    whatsapp: '5491133448527',
    instagram: 'managementenred',
    webs: ['https://www.managementenred.com.ar'],
    fotos: ['images/consultor-en-finanzas-estrategia-marketing-y-rrhh-gustavo-eidlin.png'],
  },
  {
    negocio: 'Un Pez Soluble',
    nombre: 'Nadia',
    sala: 'Rojo',
    rubro: '👗 Moda e indumentaria',
    descripcion: 'Emprendimiento de accesorios textiles ( bolsos, riñoneras, neceser, etc etc)',
    whatsapp: '5491158652682',
    instagram: 'unpezsoluble.ok',
    webs: ['https://www.unpezsoluble.com.ar'],
    fotos: ['images/un-pez-soluble-nadia.jpg'],
  },
  {
    negocio: 'Ludoteca rodante',
    nombre: 'Soledad',
    sala: 'Lila',
    rubro: '🎨 Arte y creatividad',
    descripcion: 'En este espacio de crecimiento se aprende jugando!\nSomos Sole y Flor, profesoras de nivel inicial. \nLudoteca libre son distintos sectores de juego donde cada Niño/a juega a lo que quiera a su tiempo. \nNosotras intervenimos desde lo pedagógico para complejizar el juego, sin interceder ni imponer. \nCada día hacemos un taller, creamos un ambiente cálido donde a partir de un cuento, canción o rima realizamos actividades concretas atravesadas por las artes. \nPropuestas desde bebés hasta 10 años, con o sin familias.',
    whatsapp: '5491166691690',
    instagram: 'ludotecarodante',
    webs: ['https://ludotecarodante.empretienda.com.ar/'],
    fotos: ['images/ludoteca-rodante-soledad.jpg'],
  },
  {
    negocio: 'Indiada Pijamadas',
    nombre: 'Carla',
    sala: 'Naranja',
    rubro: '✨ Otros',
    descripcion: 'Organización de eventos, pijamadas',
    whatsapp: null,
    instagram: 'indiada_pijamadas',
    webs: [],
    fotos: ['images/indiada-pijamadas-carla.jpg'],
  },
  {
    negocio: 'Pintor',
    nombre: 'Sergio Gonzalez Grutter',
    sala: 'Bordó',
    rubro: '🔨 Servicios del hogar',
    descripcion: 'Pintor de pared, terrazas, cielo raso, rejas, madera, aberturas.\nEn casas, departamento, locales.\nPoseo Monotributo y seguro de vida.',
    whatsapp: '5491151228053',
    instagram: null,
    webs: [],
    fotos: [],
  },
  {
    negocio: 'Psicóloga',
    nombre: 'Johanna Raubian',
    sala: 'Azul, Rosa',
    rubro: '🩺 Salud y bienestar',
    descripcion: 'Psicoanalista con perspectiva de género! Clínica de adultxs y adolescentes. Atención virtual y presencial.',
    whatsapp: '5491165538272',
    instagram: null,
    webs: [],
    fotos: [],
  },
  {
    negocio: 'Famiglia viajes',
    nombre: 'Ezequiel Smiriglia',
    sala: 'Azul, Rosa',
    rubro: '🍽️ Gastronomía y viajes',
    descripcion: 'Agente de viajes',
    whatsapp: '5491165538174',
    instagram: 'famigliaviajes',
    webs: [],
    fotos: ['images/famiglia-viajes-ezequiel-smiriglia.jpg'],
  },
  {
    negocio: 'The Avocado Company',
    nombre: 'Ezequiel Smiriglia',
    sala: 'Azul, Rosa',
    rubro: '🍽️ Gastronomía y viajes',
    descripcion: 'Empresario gastronómico',
    whatsapp: '5491165538174',
    instagram: 'theavocadocompany.arg',
    webs: [],
    fotos: ['images/the-avocado-company-ezequiel-smiriglia.jpg'],
  },
  {
    negocio: 'Valhalla Bar Vikingo',
    nombre: 'Ezequiel Smiriglia',
    sala: 'Azul, Rosa',
    rubro: '🍽️ Gastronomía y viajes',
    descripcion: 'Empresario gastronómico',
    whatsapp: '5491165538174',
    instagram: 'valhallabarvikingo',
    webs: [],
    fotos: ['images/valhalla-bar-vikingo-ezequiel-smiriglia.jpg'],
  },
  {
    negocio: 'Desayunos Personalizados®️',
    nombre: 'Irina',
    sala: 'Rosa',
    rubro: '🍽️ Gastronomía y viajes',
    descripcion: 'Demostrale lo que sentís, decilo con un desayuno\n Envios en CABA y GBA',
    whatsapp: '5491168547843',
    instagram: 'desayunos.personalizados',
    webs: ['https://www.desayunospersonalizados.com'],
    fotos: ['images/desayunos-personalizados-irina.jpg'],
  },
  {
    negocio: 'Artista',
    nombre: 'Araceli Chiodi',
    sala: 'Verde, Bordó',
    rubro: '🎨 Arte y creatividad',
    descripcion: 'Doy clases de dibujo y pintura figurativa',
    whatsapp: '5491161891780',
    instagram: 'ara.chiodi',
    webs: [],
    fotos: ['images/artista-araceli-chiodi.jpg'],
  },
  {
    negocio: 'Neuropsicóloga',
    nombre: 'Araceli Chiodi',
    sala: 'Verde, Bordó',
    rubro: '🩺 Salud y bienestar',
    descripcion: 'Realizo evaluaciones y tratamientos de rehabilitación neurocognitiva (adultos).',
    whatsapp: '5491161891780',
    instagram: 'ara.chiodi',
    webs: [],
    fotos: ['images/neuropsicologa-araceli-chiodi.jpg'],
  },
  {
    negocio: 'Éxodo Mapache',
    nombre: 'Brian',
    sala: 'Celeste',
    rubro: '🍽️ Gastronomía y viajes',
    descripcion: 'Nos dedicamos al traslado de pasajeros para todo tipo de eventos,  corporativo,  casamiento, cumpleaños,   paseos, viajes a la costa y al interior del país.\nLa van es de 19 pasajeros\nPero cuento con un equipo de colegas con los q cubrimos traslado de autos, camionetas de 5 pasajeros, 7 pasajeros , 13 pasajeros y micros de 45 y 66 pasajeros.',
    whatsapp: '5491131647079',
    instagram: 'exodomapache',
    webs: [],
    fotos: ['images/exodo-mapache-brian.jpg'],
  },
  {
    negocio: 'Mi tienda flor',
    nombre: 'Gisela',
    sala: 'Lila',
    rubro: '🎨 Arte y creatividad',
    descripcion: 'Mi tienda flor te ofrece velas de soja. Box de regalos. Difusores, perfume de ambiente\nSuculentas.',
    whatsapp: null,
    instagram: 'mi.tienda.flor',
    webs: [],
    fotos: ['images/mi-tienda-flor-gisela.jpg'],
  },
  {
    negocio: 'Profesora de lengua',
    nombre: 'Mariela',
    sala: 'Rojo',
    rubro: '📚 Educación y clases',
    descripcion: '👩🏻‍💻Clases particulares:\n\n🖊 Lengua y literatura\n🖊 Por Google Meet\n🖊 1 hora de duración\n🖊 Individuales\n🖊 Grupales\n🖊 Nivel secundario\n🖊 Nivel primario\n\nDoy clases de lengua y literatura en secundaria.\n\nLas clases particulares están destinadas a estudiantes de secundaria (podemos hacer tareas de la materia o estudiar temas específicos para alguna evaluación, por ejemplo). También doy acompañamiento y apoyo escolar a estudiantes de primaria (podemos enfocarnos en la comprensión de textos y en la redacción, por ejemplo).',
    whatsapp: '5491170060652',
    instagram: 'marielaprofedelengua',
    webs: ['https://marielapalacios.com.ar/idioma.html'],
    fotos: ['images/profesora-de-lengua-mariela.jpg'],
  },
  {
    negocio: 'Psicóloga',
    nombre: 'Xoana',
    sala: '',
    rubro: '🩺 Salud y bienestar',
    descripcion: 'Licenciada en Psicología Xoana Casanova\n\nAtención presencial y virtual a niños/as, adolescentes, adultos y orientación a padres. Consultorio en Villa Urquiza.',
    whatsapp: '5491169953395',
    instagram: 'hablaelalgarrobo',
    webs: [],
    fotos: ['images/psicologa-xoana.jpg'],
  },
  {
    negocio: 'Psicóloga',
    nombre: 'Maria Paula Gerardi',
    sala: '',
    rubro: '🩺 Salud y bienestar',
    descripcion: 'Cuentos para acompañar procesos\nPsicóloga \n\n En mis primeros pasos como maestra jardinera y luego como psicologa los cuentos se transformaron en un maravilloso recurso para acompañar procesos. Cómo mamá  los cuentos son mis aliados en el camino de criar.\n\nEn este espacio  reseño libros de distintos autores que resonaron en mí y que utilizo para ayudar a las familias a elaborar diversas situaciones.\n\n Tambien comparto algunos cuentos que escribí yo y otros que inventaron padres y madres en las consultas de crianza con el objetivo de que  puedan ayudar a otros niños y niñas.',
    whatsapp: '5491159899007',
    instagram: 'mariapaulagerardi',
    webs: [],
    fotos: ['images/psicologa-maria-paula-gerardi.jpg'],
  },
  {
    negocio: 'Gráficas comerciales, carpintería.',
    nombre: 'Fernando Rodriguez Palavecino',
    sala: 'Bordó',
    rubro: '🔨 Servicios del hogar',
    descripcion: 'Gráficas comerciales, carpintería.',
    whatsapp: '5491155246803',
    instagram: null,
    webs: [],
    fotos: [],
  },
  {
    negocio: 'Ayres IT',
    nombre: 'Rodrigo y Carolina',
    sala: 'Bordó',
    rubro: '💻 Tecnología',
    descripcion: 'Venta de sistemas de punto de venta. \nAyresPOP | AyresERP | AyresBoard | AyresSueldos\n⚙️Soluciones informáticas para empresas\n📌Más 15 años en el mercado\n👇Conocé AyresPOP para restaurantes',
    whatsapp: null,
    instagram: 'ayres.it',
    webs: ['https://ayresit.com.ar/'],
    fotos: ['images/ayres-it-rodrigo-y-carolina.jpg'],
  },
  {
    negocio: 'TuSolucionIT',
    nombre: 'Sebastián Ferraro',
    sala: '',
    rubro: '💻 Tecnología',
    descripcion: 'Ingeniero en Sistemas\nEmpresa que se dedica a brindar soluciones de tecnología\n# (reparación,armado) ordenadores, \n#diseño e implementacion de infraestructuras (redes,servidores) para empresas/pymes IT/OT\n#consultoria de seguridad informática\n#capacitación (sistemas operativos,redes,seguridad informática,introducción al mundo digital, entre otras cosas.',
    whatsapp: '5491126403264',
    instagram: null,
    webs: [],
    fotos: [],
  },
  {
    negocio: 'Espacio elementos',
    nombre: 'Nadia Tartalo',
    sala: 'Azul',
    rubro: '🩺 Salud y bienestar',
    descripcion: 'Arte y aprendizaje.\nTrabajo en conjunto con profesionales:\nNutrición, estimulación temprana, psicología, profe de gimnasia y danza, yoga para infancias. \n\nEspacio elementos: Arte y aprendizaje\n\n1.Psicopedagogia: evaluación neurocognitiva. Diagnostico y tratamiento.Orientación a padres. Orientación vocacional.\n2 Clases de yoga para infancias  y familias (abierta a la comunidad neurodiversas).\n3 El  cuerpo en movimiento: Clases de Gimnasia para mamás y taller de estimulación temprana para bebes (en simultaneo).\n4. Nutricion\n5.Psicologia',
    whatsapp: null,
    instagram: 'lic.nadiatartalo',
    webs: [],
    fotos: ['images/espacio-elementos-nadia-tartalo.jpg'],
  },
  {
    negocio: 'Episodio Cuatro',
    nombre: 'Rocío Ana Hilovera',
    sala: 'Azul',
    rubro: '👗 Moda e indumentaria',
    descripcion: 'Episodio Cuatro es un pequeño emprendimiento de prendas y bolsas de lienzo 100% personalizadas.',
    whatsapp: '5491170297744',
    instagram: 'episodiocuatro',
    webs: [],
    fotos: ['images/episodio-cuatro-rocio-ana-hilovera.jpg'],
  },
  {
    negocio: 'Eseyka',
    nombre: 'Nicolás Schvartzer',
    sala: '',
    rubro: '💼 Profesionales',
    descripcion: 'Consultora de Desarrollo Profesional especializada en el desarrollo de resultados y cultura a través del Liderazgo',
    whatsapp: '5491163684997',
    instagram: 'eseyka.peopleconsulting',
    webs: ['https://www.eseyka.com'],
    fotos: ['images/eseyka-nicolas-schvartzer.jpg'],
  },
  {
    negocio: 'Innova Ingeniería',
    nombre: 'Eugenia Gamband',
    sala: 'Amarillo',
    rubro: '💼 Profesionales',
    descripcion: 'Desarrollamos proyecto de ingeniería. Proporcionamos soluciones a problema civiles estructurales complejos.',
    whatsapp: '5491123349347',
    instagram: 'innova.ingenieria_civil',
    webs: ['https://www.linkedin.com/in/eugenia-gamband%C3%A9-a641041b/'],
    fotos: ['images/innova-ingenieria-eugenia-gamband.avif'],
  },
  {
    negocio: 'Motivos para Quererte',
    nombre: 'Julieta y Giselle',
    sala: 'Naranja',
    rubro: '👗 Moda e indumentaria',
    descripcion: 'Disfraces y prendas para chicos y chicas\n\nJulieta y Giselle son diseñadoras de indumentaria y textil, amigas y dueñas de MOTIVOSPARAQUERERTE.\nEn marzo de 2011 surge este emprendimiento dedicado a las infancias. \nActualmente ofrecemos productos que invitan al juego y la fantasía. En MOTIVOSPARAQUERERTE encontrarás disfraces y artículos vinculados a un universo de personajes que acompañan el día a día de los más peques.',
    whatsapp: '5491165697350',
    instagram: 'motivosparaquererte',
    webs: ['https://www.motivosparaquererte.com.ar'],
    fotos: ['images/motivos-para-quererte-julieta-y-giselle.jpg'],
  },
  {
    negocio: 'Fotógrafa',
    nombre: 'Jazmín',
    sala: 'Azul',
    rubro: '🎨 Arte y creatividad',
    descripcion: 'Retratos empresariales grupales e individuales, Retratos ejecutivos, Foto de producto, gastronomía, editoriales. Eventos empresariales.',
    whatsapp: '5491166035060',
    instagram: 'jazminarellanofotografia',
    webs: ['https://jazminsemilla.wixsite.com'],
    fotos: ['images/fotografa-jazmin.jpg'],
  },
  {
    negocio: 'Fedezm electronica',
    nombre: 'Federico Zmesones',
    sala: '',
    rubro: '💻 Tecnología',
    descripcion: 'Venta de productos apple y electronica en gral',
    whatsapp: '5491131289727',
    instagram: 'fedezm',
    webs: [],
    fotos: ['images/fedezm-electronica-federico-zmesones.png'],
  },
  {
    negocio: 'La Bodeguita de Gonzalez',
    nombre: '',
    sala: '',
    rubro: '🍽️ Gastronomía y viajes',
    descripcion: 'Tienda virtual de vinos y afines - Catas y degustaciones',
    whatsapp: '5491155785606',
    instagram: 'labodeguitadegonzalez',
    webs: [],
    fotos: ['images/la-bodeguita-de-gonzalez.jpg'],
  },
  {
    negocio: 'Coach Ejecutiva y Organizacional - Consultoria - Cursos de Habilidades Blandas',
    nombre: 'Juliana Pirozzo',
    sala: 'Amarillo',
    rubro: '💼 Profesionales',
    descripcion: 'Acompaño a Personas y Organizaciones en el Camino de Aprendizaje y el Logro de Objetivos mediante el Coaching',
    whatsapp: '5491164916800',
    instagram: 'juliana.pirozzo.coach',
    webs: [],
    fotos: ['images/coach-ejecutiva-y-organizacional-consultoria-cursos-de-habilidades-blandas-juliana-pirozzo.png'],
  },
  {
    negocio: 'Familia Palenzuela – Servicios varios',
    nombre: 'Familia Palenzuela',
    sala: '',
    rubro: '✨ Otros',
    descripcion: 'Compra/venta de divisas. Logística y transporte de mercaderías en CABA y alrededores. Havaianas y Bagunza. Petshop y veterinaria para mascotas. Galería comercial Cuenca 2840.',
    whatsapp: '5491161069705',
    instagram: null,
    webs: ['https://www.mercadolibre.com.ar/perfil/CUENCAPETSHOP'],
    fotos: [],
  },
  {
    negocio: 'Se armó Padel',
    nombre: 'Belén, Carla y Miranda',
    sala: 'Turquesa',
    rubro: '✨ Otros',
    descripcion: 'Tres mamás, tres profesionales, tres agendas explotadas y una misma necesidad: encontrar un espacio para nosotras.\n\nNuestros hijos nos cruzaron en el camino y el pádel hizo el resto.\n\nEntre partidos, charlas, risas y algún que otro tercer tiempo, descubrimos algo que nos hacía bien: desconectar un rato de las obligaciones para conectar con otras personas.\n\nAsí nació Se Armó Pádel.\n\nPorque el pádel es la excusa.\n\nLo importante es encontrarnos. 🩳🎾',
    whatsapp: '5491164187389',
    instagram: 'searmopadel',
    webs: [],
    fotos: ['images/se-armo-padel-belen-carla-y-miranda.jpg'],
  },
];

// ---------- RENDER ----------

let ALL_ENTRIES = [];
let ACTIVE_CATEGORY = "Todos";
let CURRENT_RESULTS = [];
let SORT_MODE = "random";
let RANDOM_RANK = new Map();

// Arma un orden aleatorio (una vez, al cargar) y guarda un "ranking" estable
// por entrada para poder ordenar por él cuando SORT_MODE === "random".
function computeRandomOrder(entries) {
  const idx = entries.map((_, i) => i);
  for (let i = idx.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [idx[i], idx[j]] = [idx[j], idx[i]];
  }
  RANDOM_RANK = new Map(entries.map((e, i) => [e, idx.indexOf(i)]));
}

// Reemplaza una imagen rota por el emoji de respaldo de su rubro, sin
// pisar otros elementos hermanos (como el chip de categoría superpuesto).
function handleMediaError(img, emoji) {
  const media = img.closest(".card__media, .modal__media");
  const span = document.createElement("span");
  span.className = "card__media-fallback";
  span.textContent = emoji;
  img.replaceWith(span);
  if (media) media.classList.add(media.classList.contains("modal__media") ? "modal__media--empty" : "card__media--empty");
}

function getLinks(entry) {
  const links = [];
  if (entry.whatsapp) {
    const msg = encodeURIComponent(
      `Hola! Te contacto por el Directorio de Familias del Integral 🧡`
    );
    const d = entry.whatsapp.replace(/^549/, "");
    const phoneLabel = d.length >= 10 ? `+54 9 11 ${d.slice(-8, -4)}-${d.slice(-4)}` : entry.whatsapp;
    links.push({
      type: "whatsapp",
      href: `https://wa.me/${entry.whatsapp}?text=${msg}`,
      label: phoneLabel,
      svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M12 3a9 9 0 0 0-7.75 13.54L3 21l4.6-1.22A9 9 0 1 0 12 3Z"/><path d="M8.5 8.7c-.15.9.2 1.9.9 2.9.9 1.3 2 2.2 3.3 2.9 1 .5 1.9.7 2.6.4.4-.2.9-.7 1-1.1"/></svg>`,
    });
  }
  if (entry.instagram) {
    links.push({
      type: "instagram",
      href: `https://instagram.com/${entry.instagram}`,
      label: `@${entry.instagram}`,
      svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><rect x="3.5" y="3.5" width="17" height="17" rx="5"/><circle cx="12" cy="12" r="3.6"/><circle cx="17" cy="7" r="0.6" fill="currentColor" stroke="none"/></svg>`,
    });
  }
  entry.webs.forEach((w) => {
    let label = "Sitio web";
    try { label = new URL(w).hostname.replace(/^www\./i, ""); } catch (e) {}
    links.push({
      type: "web",
      href: w,
      label,
      svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5a13 13 0 0 1 0 17M12 3.5a13 13 0 0 0 0 17"/></svg>`,
    });
  });
  return links;
}

// Tarjetas: botones de contacto como íconos circulares (el texto va en el title).
function cardLinksHtml(entry) {
  return getLinks(entry)
    .map(
      (l) => `
      <a class="card__link-icon card__link-icon--${l.type}" target="_blank" rel="noopener"
         href="${l.href}" title="${escapeHtml(l.label)}" aria-label="${escapeHtml(l.label)}"
         onclick="event.stopPropagation()">
        ${l.svg}
      </a>`
    )
    .join("");
}

// Modal: lista vertical con ícono + el dato real (teléfono, @usuario, sitio).
function modalLinksHtml(entry) {
  return getLinks(entry)
    .map(
      (l) => `
      <a class="modal__link modal__link--${l.type}" target="_blank" rel="noopener" href="${l.href}">
        ${l.svg}
        <span>${escapeHtml(l.label)}</span>
      </a>`
    )
    .join("");
}

function cardTemplate(entry, index) {
  const emoji = extractEmoji(entry.rubro);
  const rubroShort = escapeHtml(entry.rubro.replace(EMOJI_START, "").trim());
  const hasPhoto = !!entry.fotos[0];
  const media = hasPhoto
    ? `<img src="${entry.fotos[0]}" alt="${escapeHtml(entry.negocio)}" loading="lazy" onerror="handleMediaError(this,'${emoji}')">`
    : `<span class="card__media-fallback">${emoji}</span>`;

  return `
    <article class="card" data-index="${index}">
      <div class="card__media${hasPhoto ? "" : " card__media--empty"}">
        ${media}
        <span class="card__category--overlay">${rubroShort}</span>
      </div>
      <div class="card__body">
        <h3 class="card__name">${escapeHtml(entry.negocio)}</h3>
        ${entry.nombre ? `<p class="card__person">${escapeHtml(entry.nombre)}</p>` : ""}
        ${entry.sala ? `<span class="card__sala">${escapeHtml(entry.sala)}</span>` : ""}
        ${entry.descripcion ? `<p class="card__desc">${escapeHtml(entry.descripcion)}</p>` : ""}
        <div class="card__links">${cardLinksHtml(entry)}</div>
      </div>
    </article>`;
}

function renderChips() {
  const cats = Array.from(new Set(ALL_ENTRIES.map((e) => e.rubro)));
  cats.sort((a, b) => {
    if (a.includes("Otros")) return 1;
    if (b.includes("Otros")) return -1;
    return a.localeCompare(b, "es");
  });
  const all = ["Todos", ...cats];

  document.getElementById("chips").innerHTML = all
    .map(
      (c) =>
        `<button class="chip${c === ACTIVE_CATEGORY ? " active" : ""}" data-cat="${escapeHtml(c)}">${escapeHtml(c)}</button>`
    )
    .join("");
}

function applyFilters() {
  const q = foldSearch(document.getElementById("search").value);
  const results = ALL_ENTRIES.filter((e) => {
    const matchesCat = ACTIVE_CATEGORY === "Todos" || e.rubro === ACTIVE_CATEGORY;
    const haystack = foldSearch(
      [e.negocio, e.nombre, e.rubro, e.descripcion, e.sala].join(" ")
    );
    const matchesQuery = !q || haystack.includes(q);
    return matchesCat && matchesQuery;
  });
  if (SORT_MODE === "az") {
    results.sort((a, b) => foldSearch(a.negocio).localeCompare(foldSearch(b.negocio), "es"));
  } else if (SORT_MODE === "za") {
    results.sort((a, b) => foldSearch(b.negocio).localeCompare(foldSearch(a.negocio), "es"));
  } else {
    results.sort((a, b) => (RANDOM_RANK.get(a) ?? 0) - (RANDOM_RANK.get(b) ?? 0));
  }
  return results;
}

function render() {
  const results = applyFilters();
  CURRENT_RESULTS = results;
  const grid = document.getElementById("grid");
  const empty = document.getElementById("empty");
  const count = document.getElementById("count");
  const sectionTitle = document.getElementById("sectionTitle");

  sectionTitle.textContent = ACTIVE_CATEGORY === "Todos" ? "Todos los emprendimientos" : ACTIVE_CATEGORY;
  grid.innerHTML = results.map((e, i) => cardTemplate(e, i)).join("");
  empty.hidden = results.length !== 0;
  grid.hidden = results.length === 0;
  count.textContent = `${results.length} ${results.length === 1 ? "resultado" : "resultados"}`;
}

// ---------- MODAL (tarjeta ampliada) ----------

function modalTemplate(entry) {
  const emoji = extractEmoji(entry.rubro);
  const hasPhoto = !!entry.fotos[0];
  const media = hasPhoto
    ? `<img src="${entry.fotos[0]}" alt="${escapeHtml(entry.negocio)}" onerror="handleMediaError(this,'${emoji}')">`
    : `<span class="card__media-fallback">${emoji}</span>`;
  const zoomAttrs = hasPhoto ? ` onclick="openZoom('${entry.fotos[0]}')" style="cursor:zoom-in"` : "";

  return `
    <div class="modal__media${hasPhoto ? "" : " modal__media--empty"}"${zoomAttrs}>${media}</div>
    <div class="modal__body">
      <span class="card__category">${escapeHtml(entry.rubro)}</span>
      <h3 class="card__name">${escapeHtml(entry.negocio)}</h3>
      ${entry.nombre ? `<p class="card__person">${escapeHtml(entry.nombre)}</p>` : ""}
      ${entry.sala ? `<span class="card__sala">${escapeHtml(entry.sala)}</span>` : ""}
      ${entry.descripcion ? `<p class="modal__desc">${escapeHtml(entry.descripcion)}</p>` : ""}
      <div class="modal__links">${modalLinksHtml(entry)}</div>
    </div>`;
}

function openModal(entry) {
  document.getElementById("modalContent").innerHTML = modalTemplate(entry);
  document.getElementById("modalOverlay").hidden = false;
  document.body.style.overflow = "hidden";
}

function closeModal() {
  document.getElementById("modalOverlay").hidden = true;
  document.getElementById("modalContent").innerHTML = "";
  document.body.style.overflow = "";
}

// ---------- ZOOM DE FOTO (dentro del modal) ----------

function openZoom(src) {
  document.getElementById("zoomImage").style.backgroundImage = `url('${src}')`;
  document.getElementById("zoomOverlay").hidden = false;
}

function closeZoom() {
  document.getElementById("zoomOverlay").hidden = true;
  document.getElementById("zoomImage").style.backgroundImage = "";
}

// ---------- EVENTOS ----------

document.getElementById("search").addEventListener("input", render);

document.getElementById("chips").addEventListener("click", (e) => {
  const btn = e.target.closest(".chip");
  if (!btn) return;
  ACTIVE_CATEGORY = btn.dataset.cat;
  renderChips();
  render();
});

document.getElementById("sortSelect").addEventListener("change", (e) => {
  SORT_MODE = e.target.value;
  render();
});

document.getElementById("clearFilters").addEventListener("click", () => {
  ACTIVE_CATEGORY = "Todos";
  document.getElementById("search").value = "";
  renderChips();
  render();
});

document.getElementById("formLink").href = FORM_URL;
document.getElementById("formLinkTop").href = FORM_URL;

document.getElementById("grid").addEventListener("click", (e) => {
  if (e.target.closest("a")) return; // dejar que los links (WhatsApp/IG/web) funcionen normal
  const card = e.target.closest(".card");
  if (!card) return;
  const entry = CURRENT_RESULTS[Number(card.dataset.index)];
  if (entry) openModal(entry);
});

document.getElementById("modalClose").addEventListener("click", closeModal);
document.getElementById("modalOverlay").addEventListener("click", (e) => {
  if (e.target.id === "modalOverlay") closeModal();
});
document.getElementById("zoomClose").addEventListener("click", closeZoom);
document.getElementById("zoomOverlay").addEventListener("click", closeZoom);
document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  if (!document.getElementById("zoomOverlay").hidden) {
    closeZoom();
    return;
  }
  closeModal();
});

// ---------- INICIO ----------
// El sitio ya no sincroniza en vivo con Google Sheets (ver nota arriba de
// CONSOLIDATED_ENTRIES). Si en el futuro se resuelve el acceso a la planilla
// del formulario, se puede volver a activar reemplazando este bloque por el
// que usa loadSheetData()/parseSheetJson() (quedan definidos arriba, sin usar).

ALL_ENTRIES = CONSOLIDATED_ENTRIES;
computeRandomOrder(ALL_ENTRIES);
document.getElementById("loading").hidden = true;
renderChips();
render();
