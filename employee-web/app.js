import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore,
  collection,
  addDoc,
  query,
  where,
  onSnapshot,
  orderBy,
  limit,
  updateDoc,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// Pegá acá la misma configuración que usás en admin-web/src/firebase.js
// (Firebase → Configuración del proyecto → Tus apps → Web)
const firebaseConfig = {
  apiKey: "AIzaSyANMkRYgy05W86lJ42KTN7GsOFUCs8CupE",
  authDomain: "fichaje-b9421.firebaseapp.com",
  projectId: "fichaje-b9421",
  storageBucket: "fichaje-b9421.firebasestorage.app",
  messagingSenderId: "634712461696",
  appId: "1:634712461696:web:3faa528b066cb90df23165",
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: "select_account" });
const db = getFirestore(app);

// --- Ubicación donde se permite fichar ---
const UBICACION_OBJETIVO = { lat: -53.79080312098218, lng: -67.69202228688869 };
const RADIO_PERMITIDO_M = 50;

// Este texto tiene que ser EXACTAMENTE igual al que genera qr.html.
// Si lo cambiás acá, cambialo también ahí (y volvé a imprimir el cartel).
const CODIGO_QR_VALIDO = "MQP-FICHAJE-INGRESO";

function distanciaMetros(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const toRad = (x) => (x * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function obtenerUbicacionActual() {
  return new Promise((resolve, reject) => {
    if (!("geolocation" in navigator)) {
      reject(new Error("sin-soporte"));
      return;
    }
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      timeout: 12000,
      maximumAge: 0,
    });
  });
}

// --- Elementos de la pantalla ---
const pantallaCarga = document.getElementById("pantalla-carga");
const pantallaLogin = document.getElementById("pantalla-login");
const pantallaFichaje = document.getElementById("pantalla-fichaje");
const btnLogin = document.getElementById("btn-login");
const errorLogin = document.getElementById("error-login");
const nombreUsuario = document.getElementById("nombre-usuario");
const btnLogout = document.getElementById("btn-logout");
const botonHuella = document.getElementById("boton-huella");
const textoEstado = document.getElementById("texto-estado");
const btnEscanear = document.getElementById("btn-escanear");

function mostrarSolo(pantalla) {
  [pantallaCarga, pantallaLogin, pantallaFichaje].forEach((p) =>
    p.classList.add("oculto")
  );
  pantalla.classList.remove("oculto");
}

// --- Login ---
btnLogin.addEventListener("click", async () => {
  errorLogin.classList.add("oculto");
  btnLogin.disabled = true;
  try {
    await signInWithPopup(auth, googleProvider);
  } catch (err) {
    console.error(err);
    errorLogin.textContent = "No se pudo iniciar sesión. Probá de nuevo.";
    errorLogin.classList.remove("oculto");
  } finally {
    btnLogin.disabled = false;
  }
});

btnLogout.addEventListener("click", () => signOut(auth));

// --- Fichaje: no se muestra nada de esto hasta confirmar el login ---
let unsubscribeEstado = null;
let estadoActual = "cargando"; // 'adentro' | 'afuera' | 'cargando'

onAuthStateChanged(auth, (user) => {
  if (unsubscribeEstado) {
    unsubscribeEstado();
    unsubscribeEstado = null;
  }
  if (typeof unsubscribeSolicitudes !== "undefined" && unsubscribeSolicitudes) {
    unsubscribeSolicitudes();
    unsubscribeSolicitudes = null;
  }

  if (!user) {
    mostrarSolo(pantallaLogin);
    return;
  }

  nombreUsuario.textContent = user.displayName || user.email;
  mostrarSolo(pantallaFichaje);
  escucharEstado(user);
  if (typeof escucharMisSolicitudes === "function") {
    escucharMisSolicitudes(user);
  }
});

function escucharEstado(user) {
  const fichajesRef = collection(db, "fichajes");
  const q = query(
    fichajesRef,
    where("email", "==", user.email),
    where("horaSalida", "==", null)
  );

  estadoActual = "cargando";
  actualizarBoton();

  unsubscribeEstado = onSnapshot(q, (snap) => {
    estadoActual = snap.empty ? "afuera" : "adentro";
    actualizarBoton();
  });
}

function actualizarBoton() {
  if (estadoActual === "cargando") {
    botonHuella.setAttribute("disabled", "true");
    textoEstado.textContent = "Cargando tu estado…";
    botonHuella.classList.remove("adentro");
    return;
  }

  botonHuella.removeAttribute("disabled");
  if (estadoActual === "adentro") {
    botonHuella.classList.add("adentro");
    textoEstado.textContent = "Estás fichado. Tocá para marcar tu salida.";
    btnEscanear.classList.add("oculto");
  } else {
    botonHuella.classList.remove("adentro");
    textoEstado.textContent = "Estás afuera. Tocá para marcar tu entrada.";
    btnEscanear.classList.remove("oculto");
  }
}

// --- Registrar el fichaje en Firestore, sea cual sea el método de
// verificación usado (ubicación GPS o código QR del local) ---
async function procesarFichaje(datosVerificacion) {
  const user = auth.currentUser;
  if (!user) return;

  botonHuella.setAttribute("disabled", "true");
  try {
    if (estadoActual === "adentro") {
      await ficharSalida(user.email, datosVerificacion);
    } else {
      await ficharEntrada(user, datosVerificacion);
    }
  } catch (err) {
    console.error(err);
    textoEstado.textContent = "Hubo un problema al fichar. Probá de nuevo.";
  } finally {
    botonHuella.removeAttribute("disabled");
  }
}

async function ficharEntrada(user, datosVerificacion) {
  await addDoc(collection(db, "fichajes"), {
    uid: user.uid,
    nombre: user.displayName || "",
    email: user.email || "",
    horaEntrada: serverTimestamp(),
    horaSalida: null,
    ...datosVerificacion,
  });
}

async function ficharSalida(email, datosVerificacion) {
  const fichajesRef = collection(db, "fichajes");
  const q = query(
    fichajesRef,
    where("email", "==", email),
    where("horaSalida", "==", null),
    orderBy("horaEntrada", "desc"),
    limit(1)
  );

  const snap = await new Promise((resolve, reject) => {
    const unsub = onSnapshot(q, (s) => { unsub(); resolve(s); }, reject);
  });

  if (snap.empty) return;
  await updateDoc(snap.docs[0].ref, {
    horaSalida: serverTimestamp(),
    verificacionSalida: datosVerificacion,
  });
}

// --- Fichar por GPS (método principal para la entrada; la salida no
// necesita volver a comprobar nada, con un toque alcanza) ---
botonHuella.addEventListener("click", async () => {
  if (!auth.currentUser || estadoActual === "cargando") return;

  // Salida: un solo toque, sin pedir ubicación de nuevo. La presencia
  // ya se comprobó al fichar la entrada (por GPS, por QR, o porque el
  // administrador la cargó directamente).
  if (estadoActual === "adentro") {
    await procesarFichaje({});
    return;
  }

  botonHuella.setAttribute("disabled", "true");
  const textoOriginal = textoEstado.textContent;
  textoEstado.textContent = "Comprobando tu ubicación…";

  try {
    let posicion;
    try {
      posicion = await obtenerUbicacionActual();
    } catch (err) {
      if (err.code === 1) {
        textoEstado.textContent =
          "Necesitamos tu ubicación para fichar. Activá el permiso de ubicación para este sitio, o escaneá el código del local (más abajo).";
      } else if (err.code === 3) {
        textoEstado.textContent =
          "No pudimos obtener tu ubicación a tiempo. Probá de nuevo, o escaneá el código del local (más abajo).";
      } else {
        textoEstado.textContent =
          "Tu dispositivo no pudo compartir la ubicación. Probá de nuevo, o escaneá el código del local (más abajo).";
      }
      return;
    }

    const distancia = distanciaMetros(
      posicion.coords.latitude,
      posicion.coords.longitude,
      UBICACION_OBJETIVO.lat,
      UBICACION_OBJETIVO.lng
    );

    if (distancia > RADIO_PERMITIDO_M) {
      const precision = Math.round(posicion.coords.accuracy || 0);
      let mensaje = `Estás a ${Math.round(
        distancia
      )} m del lugar de trabajo. Tenés que estar a menos de ${RADIO_PERMITIDO_M} m para fichar, o escanear el código del local (más abajo).`;
      if (precision > RADIO_PERMITIDO_M) {
        mensaje += ` (Tu ubicación tiene un margen de error de ~${precision} m; si el GPS sigue fallando, usá el código del local.)`;
      }
      textoEstado.textContent = mensaje;
      return;
    }

    await procesarFichaje({
      ubicacion: {
        lat: posicion.coords.latitude,
        lng: posicion.coords.longitude,
        precisionMetros: Math.round(posicion.coords.accuracy || 0),
      },
    });
  } finally {
    botonHuella.removeAttribute("disabled");
    if (textoEstado.textContent === "Comprobando tu ubicación…") {
      textoEstado.textContent = textoOriginal;
    }
  }
});

// --- Fichar escaneando el código QR del local (respaldo cuando el
// GPS falla o el celular no da permiso de ubicación) ---
const pantallaScanner = document.getElementById("pantalla-scanner");
const videoScanner = document.getElementById("video-scanner");
const canvasScanner = document.getElementById("canvas-scanner");
const textoScanner = document.getElementById("texto-scanner");
const btnCerrarScanner = document.getElementById("btn-cerrar-scanner");

let streamCamara = null;
let animacionEscaneo = null;

async function abrirScanner() {
  textoScanner.textContent = "";
  pantallaScanner.classList.remove("oculto");

  try {
    streamCamara = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "environment" },
    });
    videoScanner.srcObject = streamCamara;
    await videoScanner.play();
    loopEscaneo();
  } catch (err) {
    console.error(err);
    textoScanner.textContent =
      "No pudimos acceder a la cámara. Revisá los permisos de cámara del navegador.";
  }
}

function cerrarScanner() {
  if (animacionEscaneo) cancelAnimationFrame(animacionEscaneo);
  if (streamCamara) {
    streamCamara.getTracks().forEach((t) => t.stop());
    streamCamara = null;
  }
  pantallaScanner.classList.add("oculto");
}

function loopEscaneo() {
  const ctx = canvasScanner.getContext("2d");

  const tick = () => {
    if (videoScanner.readyState === videoScanner.HAVE_ENOUGH_DATA) {
      canvasScanner.width = videoScanner.videoWidth;
      canvasScanner.height = videoScanner.videoHeight;
      ctx.drawImage(videoScanner, 0, 0, canvasScanner.width, canvasScanner.height);
      const imageData = ctx.getImageData(0, 0, canvasScanner.width, canvasScanner.height);
      const codigo = window.jsQR
        ? window.jsQR(imageData.data, imageData.width, imageData.height)
        : null;

      if (codigo && codigo.data === CODIGO_QR_VALIDO) {
        cerrarScanner();
        procesarFichaje({
          verificadoPorQR: true,
          codigoQR: CODIGO_QR_VALIDO,
        });
        return;
      } else if (codigo) {
        textoScanner.textContent = "Ese código no es válido para fichar acá.";
      }
    }
    animacionEscaneo = requestAnimationFrame(tick);
  };

  animacionEscaneo = requestAnimationFrame(tick);
}

btnEscanear.addEventListener("click", abrirScanner);
btnCerrarScanner.addEventListener("click", cerrarScanner);

// --- Aviso de "agregar a pantalla de inicio" ---
const avisoInstalar = document.getElementById("aviso-instalar");
const textoInstalar = document.getElementById("texto-instalar");
const btnCerrarAviso = document.getElementById("btn-cerrar-aviso");

btnCerrarAviso.addEventListener("click", () => {
  avisoInstalar.classList.add("oculto");
  localStorage.setItem("aviso-instalar-cerrado", "1");
});

function yaEstaInstalada() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    window.navigator.standalone === true
  );
}

function esIOS() {
  return /iphone|ipad|ipod/i.test(window.navigator.userAgent);
}

let promptDiferido = null;

window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  promptDiferido = e;
  mostrarAvisoInstalar();
});

function mostrarAvisoInstalar() {
  if (yaEstaInstalada()) return;
  if (localStorage.getItem("aviso-instalar-cerrado")) return;

  if (esIOS()) {
    textoInstalar.textContent =
      "Para un acceso más rápido: tocá el botón Compartir y elegí 'Agregar a pantalla de inicio'.";
    avisoInstalar.classList.remove("oculto");
  } else if (promptDiferido) {
    textoInstalar.innerHTML =
      'Instalá Fichaje en tu celular para un acceso más rápido. <button id="btn-instalar-ahora" style="border:none;background:var(--acento);color:#fff;border-radius:999px;padding:6px 14px;font-weight:700;cursor:pointer;">Instalar</button>';
    avisoInstalar.classList.remove("oculto");
    document
      .getElementById("btn-instalar-ahora")
      .addEventListener("click", async () => {
        avisoInstalar.classList.add("oculto");
        if (promptDiferido) {
          promptDiferido.prompt();
          promptDiferido = null;
        }
      });
  }
}

if (esIOS()) {
  window.addEventListener("load", () => setTimeout(mostrarAvisoInstalar, 1500));
}

// --- Service worker (necesario en Android para que el navegador
// ofrezca instalar la web como app) ---
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  });
}

// ============================================================
// Mi espacio: ánimo del día, comentarios/ideas y solicitudes
// de vacaciones o licencia (con certificado si es licencia).
// ============================================================

// --- Configuración de EmailJS (avisos por correo) ---
// Completá estos 4 datos con los que te da tu cuenta gratuita de
// emailjs.com (Account → General, y Email Templates).
const EMAILJS_PUBLIC_KEY = "PEGAR_PUBLIC_KEY_ACA";
const EMAILJS_SERVICE_ID = "PEGAR_SERVICE_ID_ACA";
const EMAILJS_TEMPLATE_NUEVA_SOLICITUD = "PEGAR_TEMPLATE_ID_ADMIN_ACA";
const EMAIL_ADMIN_NOTIFICACIONES = "alan.d.fernandez23@gmail.com";

let emailjsListo = false;
function inicializarEmailJS() {
  if (typeof window.emailjs === "undefined") return;
  if (EMAILJS_PUBLIC_KEY.startsWith("PEGAR_")) return;
  window.emailjs.init({ publicKey: EMAILJS_PUBLIC_KEY });
  emailjsListo = true;
}
window.addEventListener("load", inicializarEmailJS);

async function avisarNuevaSolicitudPorMail(datos) {
  if (!emailjsListo || EMAILJS_TEMPLATE_NUEVA_SOLICITUD.startsWith("PEGAR_")) return;
  try {
    await window.emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_NUEVA_SOLICITUD, {
      to_email: EMAIL_ADMIN_NOTIFICACIONES,
      nombre_empleado: datos.nombre,
      email_empleado: datos.email,
      tipo_solicitud: datos.tipo === "licencia" ? "Licencia" : "Vacaciones",
      fecha_inicio: datos.fechaInicio,
      fecha_fin: datos.fechaFin,
      comentario: datos.comentario || "(sin comentario)",
    });
  } catch (err) {
    console.error("No se pudo enviar el aviso por mail:", err);
  }
}

// --- Elementos del DOM ---
const btnToggleEspacio = document.getElementById("btn-toggle-espacio");
const miEspacioContenido = document.getElementById("mi-espacio-contenido");
const iconoToggleEspacio = document.getElementById("icono-toggle-espacio");

const botonesAnimo = document.querySelectorAll(".boton-animo");
const confirmacionAnimo = document.getElementById("confirmacion-animo");

const textoComentario = document.getElementById("texto-comentario");
const btnEnviarComentario = document.getElementById("btn-enviar-comentario");
const confirmacionComentario = document.getElementById("confirmacion-comentario");

const botonesTipoSolicitud = document.querySelectorAll(".boton-tipo-solicitud");
const adjuntarCertificadoDiv = document.getElementById("adjuntar-certificado-solicitud");
const inputCertificadoSolicitud = document.getElementById("input-certificado-solicitud");
const fechaInicioSolicitud = document.getElementById("fecha-inicio-solicitud");
const fechaFinSolicitud = document.getElementById("fecha-fin-solicitud");
const comentarioSolicitud = document.getElementById("comentario-solicitud");
const btnEnviarSolicitud = document.getElementById("btn-enviar-solicitud");
const confirmacionSolicitud = document.getElementById("confirmacion-solicitud");
const listaMisSolicitudes = document.getElementById("lista-mis-solicitudes");

let tipoSolicitudActual = "vacaciones";
let unsubscribeSolicitudes = null;

// --- Abrir / cerrar "Mi espacio" ---
btnToggleEspacio.addEventListener("click", () => {
  const abierto = miEspacioContenido.classList.toggle("oculto") === false;
  btnToggleEspacio.dataset.abierto = abierto ? "true" : "false";
  btnToggleEspacio.classList.toggle("abierto", abierto);
});

// --- Ánimo del día ---
botonesAnimo.forEach((boton) => {
  boton.addEventListener("click", async () => {
    const user = auth.currentUser;
    if (!user) return;
    botonesAnimo.forEach((b) => b.classList.remove("seleccionado"));
    boton.classList.add("seleccionado");
    try {
      await addDoc(collection(db, "notasEmpleado"), {
        uid: user.uid,
        email: user.email,
        nombre: user.displayName || user.email,
        tipo: "animo",
        animo: boton.dataset.animo,
        creadoEn: serverTimestamp(),
      });
      confirmacionAnimo.textContent = `Gracias por contarnos cómo estás (${boton.dataset.label}).`;
      confirmacionAnimo.classList.remove("oculto", "error");
    } catch (err) {
      console.error(err);
      confirmacionAnimo.textContent = "No se pudo guardar, probá de nuevo.";
      confirmacionAnimo.classList.remove("oculto");
      confirmacionAnimo.classList.add("error");
    }
  });
});

// --- Comentario o idea ---
btnEnviarComentario.addEventListener("click", async () => {
  const user = auth.currentUser;
  const texto = textoComentario.value.trim();
  if (!user || !texto) return;

  btnEnviarComentario.setAttribute("disabled", "true");
  try {
    await addDoc(collection(db, "notasEmpleado"), {
      uid: user.uid,
      email: user.email,
      nombre: user.displayName || user.email,
      tipo: "comentario",
      texto,
      creadoEn: serverTimestamp(),
    });
    textoComentario.value = "";
    confirmacionComentario.textContent = "Comentario enviado. ¡Gracias!";
    confirmacionComentario.classList.remove("oculto", "error");
  } catch (err) {
    console.error(err);
    confirmacionComentario.textContent = "No se pudo enviar, probá de nuevo.";
    confirmacionComentario.classList.remove("oculto");
    confirmacionComentario.classList.add("error");
  } finally {
    btnEnviarComentario.removeAttribute("disabled");
  }
});

// --- Selector de tipo de solicitud (vacaciones / licencia) ---
botonesTipoSolicitud.forEach((boton) => {
  boton.addEventListener("click", () => {
    tipoSolicitudActual = boton.dataset.tipo;
    botonesTipoSolicitud.forEach((b) => b.classList.remove("activo"));
    boton.classList.add("activo");
    if (tipoSolicitudActual === "licencia") {
      adjuntarCertificadoDiv.classList.remove("oculto");
    } else {
      adjuntarCertificadoDiv.classList.add("oculto");
    }
  });
});

// --- Convierte una imagen a JPG comprimido y la achica hasta entrar
// cómoda en un documento de Firestore (límite duro: 1 MB por doc). ---
async function comprimirImagen(archivo, maxAncho = 1400, calidadInicial = 0.82) {
  const bitmap = await createImageBitmap(archivo);
  let ancho = bitmap.width;
  let alto = bitmap.height;
  if (ancho > maxAncho) {
    alto = Math.round((alto * maxAncho) / ancho);
    ancho = maxAncho;
  }
  const canvas = document.createElement("canvas");
  canvas.width = ancho;
  canvas.height = alto;
  canvas.getContext("2d").drawImage(bitmap, 0, 0, ancho, alto);

  let calidad = calidadInicial;
  let blob = await new Promise((res) => canvas.toBlob(res, "image/jpeg", calidad));
  // Si sigue pesando mucho, bajamos la calidad un par de veces más.
  while (blob && blob.size > 650 * 1024 && calidad > 0.4) {
    calidad -= 0.15;
    blob = await new Promise((res) => canvas.toBlob(res, "image/jpeg", calidad));
  }
  return blob;
}

function blobABase64(blob) {
  return new Promise((resolve, reject) => {
    const lector = new FileReader();
    lector.onload = () => resolve(lector.result.split(",")[1]); // sin el prefijo "data:...;base64,"
    lector.onerror = reject;
    lector.readAsDataURL(blob);
  });
}

// --- Enviar solicitud de vacaciones / licencia ---
btnEnviarSolicitud.addEventListener("click", async () => {
  const user = auth.currentUser;
  if (!user) return;

  const fechaInicio = fechaInicioSolicitud.value;
  const fechaFin = fechaFinSolicitud.value;
  const comentario = comentarioSolicitud.value.trim();
  const archivo = inputCertificadoSolicitud.files[0] || null;

  if (!fechaInicio || !fechaFin) {
    confirmacionSolicitud.textContent = "Completá la fecha de inicio y de fin.";
    confirmacionSolicitud.classList.remove("oculto");
    confirmacionSolicitud.classList.add("error");
    return;
  }

  btnEnviarSolicitud.setAttribute("disabled", "true");
  confirmacionSolicitud.classList.add("oculto");

  try {
    let archivoBase64 = null;
    let archivoTipo = null;
    let archivoNombre = null;

    if (tipoSolicitudActual === "licencia" && archivo) {
      if (archivo.type === "application/pdf") {
        if (archivo.size > 700 * 1024) {
          confirmacionSolicitud.textContent =
            "El PDF pesa mucho (máximo ~700 KB). Probá sacarle una foto en vez de adjuntar el PDF, o comprimilo antes.";
          confirmacionSolicitud.classList.remove("oculto");
          confirmacionSolicitud.classList.add("error");
          return;
        }
        archivoTipo = "application/pdf";
        archivoBase64 = await blobABase64(archivo);
      } else {
        const comprimido = await comprimirImagen(archivo);
        archivoTipo = "image/jpeg";
        archivoBase64 = await blobABase64(comprimido);
      }
      archivoNombre = archivo.name;
    }

    const datosSolicitud = {
      uid: user.uid,
      email: user.email,
      nombre: user.displayName || user.email,
      tipo: tipoSolicitudActual,
      fechaInicio,
      fechaFin,
      comentario,
      archivoBase64,
      archivoTipo,
      archivoNombre,
      estado: "pendiente",
      creadoEn: serverTimestamp(),
    };

    await addDoc(collection(db, "solicitudes"), datosSolicitud);
    await avisarNuevaSolicitudPorMail(datosSolicitud);

    fechaInicioSolicitud.value = "";
    fechaFinSolicitud.value = "";
    comentarioSolicitud.value = "";
    inputCertificadoSolicitud.value = "";
    confirmacionSolicitud.textContent = "Solicitud enviada. Te vamos a avisar cuando la revisemos.";
    confirmacionSolicitud.classList.remove("error");
    confirmacionSolicitud.classList.remove("oculto");
  } catch (err) {
    console.error(err);
    if (err?.code === "invalid-argument" || /longer than/i.test(err?.message || "")) {
      confirmacionSolicitud.textContent =
        "El certificado sigue siendo muy pesado para guardarlo. Probá con una foto más chica o menos detallada.";
    } else {
      confirmacionSolicitud.textContent = "No se pudo enviar la solicitud, probá de nuevo.";
    }
    confirmacionSolicitud.classList.remove("oculto");
    confirmacionSolicitud.classList.add("error");
  } finally {
    btnEnviarSolicitud.removeAttribute("disabled");
  }
});

// --- Listado de "mis solicitudes" con su estado en vivo ---
function escucharMisSolicitudes(user) {
  const solicitudesRef = collection(db, "solicitudes");
  const q = query(solicitudesRef, where("email", "==", user.email), orderBy("creadoEn", "desc"), limit(10));

  unsubscribeSolicitudes = onSnapshot(q, (snap) => {
    if (snap.empty) {
      listaMisSolicitudes.innerHTML = "";
      return;
    }
    const etiquetaEstado = { pendiente: "Pendiente", aprobada: "Aprobada", rechazada: "Rechazada" };
    listaMisSolicitudes.innerHTML = snap.docs
      .map((d) => {
        const s = d.data();
        const tipoTexto = s.tipo === "licencia" ? "Licencia" : "Vacaciones";
        return `
          <div class="tarjeta-solicitud">
            <strong>${tipoTexto}</strong>: ${s.fechaInicio} → ${s.fechaFin}
            <br />
            <span class="estado-solicitud estado-${s.estado}">${etiquetaEstado[s.estado] || s.estado}</span>
          </div>
        `;
      })
      .join("");
  });
}
