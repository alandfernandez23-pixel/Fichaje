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
  doc,
  setDoc,
  query,
  where,
  onSnapshot,
  orderBy,
  limit,
  updateDoc,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import {
  getMessaging,
  getToken,
  isSupported,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging.js";

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
  if (typeof unsubscribeMisHorarios !== "undefined" && unsubscribeMisHorarios) {
    unsubscribeMisHorarios();
    unsubscribeMisHorarios = null;
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
  if (typeof escucharMisHorarios === "function") {
    escucharMisHorarios(user);
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
function mostrarConfirmacionFichaje() {
  const overlay = document.getElementById("confirmacion-fichaje");
  if (!overlay) return;
  if (navigator.vibrate) navigator.vibrate(60);
  overlay.classList.remove("oculto", "saliendo");
  // Reiniciar la animación por si se dispara dos veces seguidas.
  void overlay.offsetWidth;
  setTimeout(() => {
    overlay.classList.add("saliendo");
    setTimeout(() => overlay.classList.add("oculto"), 250);
  }, 1100);
}

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
    mostrarConfirmacionFichaje();
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
//
// Nota: el aviso por mail a los administradores ahora lo manda una
// Cloud Function del lado del servidor (avisarNuevaSolicitud), porque
// el empleado no tiene permiso para leer la lista de admins desde acá.
// ============================================================

// Clave VAPID para notificaciones push: se genera en Firebase Console
// (Configuración del proyecto → Cloud Messaging → Certificados push web).
const VAPID_KEY = "PEGAR_VAPID_KEY_ACA";

const btnActivarAvisos = document.getElementById("btn-activar-avisos");
const confirmacionAvisos = document.getElementById("confirmacion-avisos");

btnActivarAvisos?.addEventListener("click", async () => {
  const user = auth.currentUser;
  if (!user) return;

  confirmacionAvisos.classList.add("oculto");
  btnActivarAvisos.setAttribute("disabled", "true");

  try {
    if (VAPID_KEY.startsWith("PEGAR_")) {
      throw new Error("falta configurar VAPID_KEY");
    }
    if (!(await isSupported())) {
      throw new Error("no soportado en este navegador");
    }

    const permiso = await Notification.requestPermission();
    if (permiso !== "granted") {
      confirmacionAvisos.textContent = "No diste el permiso de notificaciones, así que no vamos a poder avisarte.";
      confirmacionAvisos.classList.remove("oculto");
      confirmacionAvisos.classList.add("error");
      return;
    }

    const registro = await navigator.serviceWorker.register("/firebase-messaging-sw.js");
    const messaging = getMessaging(app);
    const token = await getToken(messaging, { vapidKey: VAPID_KEY, serviceWorkerRegistration: registro });

    if (!token) throw new Error("no se pudo obtener el token");

    await setDoc(doc(db, "tokensNotificacion", token), {
      token,
      uid: user.uid,
      email: user.email,
      nombre: user.displayName || user.email,
      actualizadoEn: serverTimestamp(),
    });

    confirmacionAvisos.textContent = "¡Listo! Vas a recibir avisos en este celular si te olvidás de fichar.";
    confirmacionAvisos.classList.remove("oculto", "error");
  } catch (err) {
    console.error(err);
    confirmacionAvisos.textContent = "No se pudo activar. Probá desde el navegador (Chrome/Safari), no desde otra app.";
    confirmacionAvisos.classList.remove("oculto");
    confirmacionAvisos.classList.add("error");
  } finally {
    btnActivarAvisos.removeAttribute("disabled");
  }
});
const btnAbrirEspacio = document.getElementById("btn-abrir-espacio");
const pantallaMiEspacio = document.getElementById("pantalla-mi-espacio");
const btnCerrarEspacio = document.getElementById("btn-cerrar-espacio");

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
const listaClasesAfectadas = document.getElementById("lista-clases-afectadas");
const btnEnviarSolicitud = document.getElementById("btn-enviar-solicitud");
const confirmacionSolicitud = document.getElementById("confirmacion-solicitud");
const listaMisSolicitudes = document.getElementById("lista-mis-solicitudes");

function renderizarClasesAfectadas() {
  if (!listaClasesAfectadas) return;
  if (misHorarios.length === 0) {
    listaClasesAfectadas.innerHTML = `<p class="tabla-vacia">No tenés clases cargadas todavía.</p>`;
    return;
  }
  listaClasesAfectadas.innerHTML = misHorarios
    .map(
      (h, i) => `
      <label class="check-clase-afectada">
        <input type="checkbox" data-indice="${i}" />
        ${DIAS_SEMANA[h.diaSemana]} ${h.horaInicio}-${h.horaFin} · ${h.tipoClase}
      </label>`
    )
    .join("");
}

let tipoSolicitudActual = "vacaciones";
let unsubscribeSolicitudes = null;

// --- Abrir / cerrar "Mi espacio" (pantalla completa) ---
btnAbrirEspacio.addEventListener("click", () => {
  pantallaMiEspacio.classList.remove("oculto");
});
btnCerrarEspacio.addEventListener("click", () => {
  pantallaMiEspacio.classList.add("oculto");
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

    const clasesAfectadas = [...listaClasesAfectadas.querySelectorAll('input[type="checkbox"]:checked')].map(
      (chk) => {
        const h = misHorarios[Number(chk.dataset.indice)];
        return {
          diaSemana: h.diaSemana,
          diaTexto: DIAS_SEMANA[h.diaSemana],
          horaInicio: h.horaInicio,
          horaFin: h.horaFin,
          tipoClase: h.tipoClase,
        };
      }
    );

    const datosSolicitud = {
      uid: user.uid,
      email: user.email,
      nombre: user.displayName || user.email,
      tipo: tipoSolicitudActual,
      fechaInicio,
      fechaFin,
      comentario,
      clasesAfectadas,
      archivoBase64,
      archivoTipo,
      archivoNombre,
      estado: "pendiente",
      creadoEn: serverTimestamp(),
    };

    await addDoc(collection(db, "solicitudes"), datosSolicitud);

    fechaInicioSolicitud.value = "";
    fechaFinSolicitud.value = "";
    comentarioSolicitud.value = "";
    inputCertificadoSolicitud.value = "";
    listaClasesAfectadas.querySelectorAll('input[type="checkbox"]').forEach((chk) => (chk.checked = false));
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

// ============================================================
// Mi calendario: solo mis propias clases (vista día / mes)
// ============================================================

const DIAS_SEMANA = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const MESES_NOMBRE = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

let misHorarios = [];
let fechaCalendario = new Date();
let vistaCalendarioActual = "dia";
let unsubscribeMisHorarios = null;

function escucharMisHorarios(user) {
  const q = query(collection(db, "horarios"), where("email", "==", user.email), where("activo", "==", true));
  unsubscribeMisHorarios = onSnapshot(q, (snap) => {
    misHorarios = snap.docs.map((d) => d.data());
    renderizarCalendario();
    if (typeof actualizarSelectClases === "function") actualizarSelectClases();
  });
}

function horariosDelDia(fecha) {
  const diaSemana = fecha.getDay();
  return misHorarios
    .filter((h) => h.diaSemana === diaSemana)
    .sort((a, b) => a.horaInicio.localeCompare(b.horaInicio));
}

function renderizarCalendarioDia() {
  const titulo = document.getElementById("calendario-dia-titulo");
  const agenda = document.getElementById("calendario-dia-agenda");
  if (!titulo || !agenda) return;

  titulo.textContent = `${DIAS_SEMANA[fechaCalendario.getDay()]} ${fechaCalendario.getDate()} de ${MESES_NOMBRE[fechaCalendario.getMonth()]}`;

  const clases = horariosDelDia(fechaCalendario);
  if (clases.length === 0) {
    agenda.innerHTML = `<p class="tabla-vacia">Sin clases este día.</p>`;
    return;
  }
  agenda.innerHTML = clases
    .map(
      (h) => `
      <div class="agenda-item">
        <span class="agenda-hora">${h.horaInicio} – ${h.horaFin}</span>
        <span class="agenda-detalle">${h.tipoClase}${h.aula ? " · " + h.aula : ""}</span>
      </div>`
    )
    .join("");
}

function renderizarCalendarioMes() {
  const titulo = document.getElementById("calendario-mes-titulo");
  const grilla = document.getElementById("calendario-mes-grilla");
  if (!titulo || !grilla) return;

  titulo.textContent = `${MESES_NOMBRE[fechaCalendario.getMonth()]} ${fechaCalendario.getFullYear()}`;

  const primero = new Date(fechaCalendario.getFullYear(), fechaCalendario.getMonth(), 1);
  const ultimo = new Date(fechaCalendario.getFullYear(), fechaCalendario.getMonth() + 1, 0);
  const hoy = new Date();

  let html = ["D", "L", "M", "M", "J", "V", "S"]
    .map((d) => `<div class="grilla-encabezado">${d}</div>`)
    .join("");

  for (let i = 0; i < primero.getDay(); i++) html += `<div class="grilla-celda grilla-celda-vacia"></div>`;

  for (let dia = 1; dia <= ultimo.getDate(); dia++) {
    const fecha = new Date(fechaCalendario.getFullYear(), fechaCalendario.getMonth(), dia);
    const tieneClase = horariosDelDia(fecha).length > 0;
    const esHoy =
      fecha.getFullYear() === hoy.getFullYear() && fecha.getMonth() === hoy.getMonth() && fecha.getDate() === hoy.getDate();
    html += `
      <button type="button" class="grilla-celda ${esHoy ? "grilla-celda-hoy" : ""} ${tieneClase ? "grilla-celda-conclase" : ""}" data-dia="${dia}">
        <span class="grilla-numero">${dia}</span>
        ${tieneClase ? `<span class="grilla-punto"></span>` : ""}
      </button>`;
  }
  grilla.innerHTML = html;

  grilla.querySelectorAll("[data-dia]").forEach((boton) => {
    boton.addEventListener("click", () => {
      fechaCalendario = new Date(fechaCalendario.getFullYear(), fechaCalendario.getMonth(), Number(boton.dataset.dia));
      cambiarVistaCalendario("dia");
    });
  });
}

function renderizarCalendario() {
  if (vistaCalendarioActual === "dia") renderizarCalendarioDia();
  else renderizarCalendarioMes();
}

function cambiarVistaCalendario(vista) {
  vistaCalendarioActual = vista;
  document.getElementById("calendario-dia").classList.toggle("oculto", vista !== "dia");
  document.getElementById("calendario-mes").classList.toggle("oculto", vista !== "mes");
  document.getElementById("btn-calendario-dia").classList.toggle("tab-activa", vista === "dia");
  document.getElementById("btn-calendario-mes").classList.toggle("tab-activa", vista === "mes");
  renderizarCalendario();
}

document.getElementById("btn-calendario-dia")?.addEventListener("click", () => cambiarVistaCalendario("dia"));
document.getElementById("btn-calendario-mes")?.addEventListener("click", () => cambiarVistaCalendario("mes"));

document.getElementById("btn-cal-dia-anterior")?.addEventListener("click", () => {
  fechaCalendario.setDate(fechaCalendario.getDate() - 1);
  renderizarCalendario();
});
document.getElementById("btn-cal-dia-siguiente")?.addEventListener("click", () => {
  fechaCalendario.setDate(fechaCalendario.getDate() + 1);
  renderizarCalendario();
});
document.getElementById("btn-cal-mes-anterior")?.addEventListener("click", () => {
  fechaCalendario.setMonth(fechaCalendario.getMonth() - 1);
  renderizarCalendario();
});
document.getElementById("btn-cal-mes-siguiente")?.addEventListener("click", () => {
  fechaCalendario.setMonth(fechaCalendario.getMonth() + 1);
  renderizarCalendario();
});
// ============================================================
// Reemplazos: pedir cobertura de una clase propia, y ver/tomar
// los pedidos abiertos de otros profes.
// ============================================================

const selectClaseReemplazo = document.getElementById("select-clase-reemplazo");
const fechaReemplazo = document.getElementById("fecha-reemplazo");
const motivoReemplazo = document.getElementById("motivo-reemplazo");
const btnPedirReemplazo = document.getElementById("btn-pedir-reemplazo");
const confirmacionReemplazo = document.getElementById("confirmacion-reemplazo");
const listaReemplazosAbiertos = document.getElementById("lista-reemplazos-abiertos");

let unsubscribeReemplazosAbiertos = null;

function actualizarSelectClases() {
  if (selectClaseReemplazo) {
    if (misHorarios.length === 0) {
      selectClaseReemplazo.innerHTML = `<option value="">No tenés clases cargadas todavía</option>`;
    } else {
      selectClaseReemplazo.innerHTML = misHorarios
        .map(
          (h, i) =>
            `<option value="${i}">${DIAS_SEMANA[h.diaSemana]} ${h.horaInicio}-${h.horaFin} · ${h.tipoClase}</option>`
        )
        .join("");
    }
  }
  renderizarClasesAfectadas();
}

btnPedirReemplazo?.addEventListener("click", async () => {
  const user = auth.currentUser;
  if (!user) return;
  const indice = selectClaseReemplazo?.value;
  if (indice === "" || indice === undefined || !misHorarios[indice]) {
    confirmacionReemplazo.textContent = "Elegí primero cuál de tus clases necesita reemplazo.";
    confirmacionReemplazo.classList.remove("oculto");
    confirmacionReemplazo.classList.add("error");
    return;
  }
  if (!fechaReemplazo.value) {
    confirmacionReemplazo.textContent = "Elegí la fecha.";
    confirmacionReemplazo.classList.remove("oculto");
    confirmacionReemplazo.classList.add("error");
    return;
  }

  const clase = misHorarios[indice];
  btnPedirReemplazo.setAttribute("disabled", "true");
  confirmacionReemplazo.classList.add("oculto");

  try {
    await addDoc(collection(db, "reemplazos"), {
      uid: user.uid,
      email: user.email,
      nombre: user.displayName || user.email,
      diaSemana: clase.diaSemana,
      diaTexto: DIAS_SEMANA[clase.diaSemana],
      horaInicio: clase.horaInicio,
      horaFin: clase.horaFin,
      tipoClase: clase.tipoClase,
      aula: clase.aula || "",
      fecha: fechaReemplazo.value,
      motivo: motivoReemplazo.value.trim(),
      estado: "abierto",
      creadoEn: serverTimestamp(),
    });
    fechaReemplazo.value = "";
    motivoReemplazo.value = "";
    confirmacionReemplazo.textContent = "Listo, se les avisó a los demás profes y a los administradores.";
    confirmacionReemplazo.classList.remove("error");
    confirmacionReemplazo.classList.remove("oculto");
  } catch (err) {
    console.error(err);
    confirmacionReemplazo.textContent = "No se pudo enviar el pedido, probá de nuevo.";
    confirmacionReemplazo.classList.remove("oculto");
    confirmacionReemplazo.classList.add("error");
  } finally {
    btnPedirReemplazo.removeAttribute("disabled");
  }
});

function escucharReemplazosAbiertos() {
  const q = query(collection(db, "reemplazos"), where("estado", "==", "abierto"), orderBy("creadoEn", "desc"), limit(20));
  unsubscribeReemplazosAbiertos = onSnapshot(q, (snap) => {
    if (!listaReemplazosAbiertos) return;
    if (snap.empty) {
      listaReemplazosAbiertos.innerHTML = `<p class="tabla-vacia">No hay reemplazos pedidos por ahora.</p>`;
      return;
    }
    const user = auth.currentUser;
    listaReemplazosAbiertos.innerHTML = snap.docs
      .map((docSnap) => {
        const r = docSnap.data();
        const esPropio = user && r.email === user.email;
        return `
          <div class="tarjeta-solicitud">
            <strong>${r.nombre}</strong> necesita reemplazo
            <br />
            ${r.diaTexto} ${r.fecha} · ${r.horaInicio}-${r.horaFin} · ${r.tipoClase}${r.aula ? " · " + r.aula : ""}
            ${r.motivo ? `<br /><em>"${r.motivo}"</em>` : ""}
            ${
              esPropio
                ? `<br /><span class="estado-solicitud estado-pendiente">Tu pedido</span>`
                : `<br /><button class="boton-secundario" data-id="${docSnap.id}" data-accion="cubrir">Puedo cubrirlo</button>`
            }
          </div>`;
      })
      .join("");

    listaReemplazosAbiertos.querySelectorAll('[data-accion="cubrir"]').forEach((boton) => {
      boton.addEventListener("click", () => cubrirReemplazo(boton.dataset.id));
    });
  });
}

async function cubrirReemplazo(id) {
  const user = auth.currentUser;
  if (!user) return;
  const ok = confirm("¿Confirmás que vas a cubrir esta clase?");
  if (!ok) return;
  try {
    await updateDoc(doc(db, "reemplazos", id), {
      estado: "cubierto",
      cubiertoPorEmail: user.email,
      cubiertoPorNombre: user.displayName || user.email,
      cubiertoEn: serverTimestamp(),
    });
  } catch (err) {
    console.error(err);
    alert("No se pudo confirmar. Probá de nuevo.");
  }
}

escucharReemplazosAbiertos();

function escucharMisSolicitudes(user) {
  const solicitudesRef = collection(db, "solicitudes");
  const q = query(solicitudesRef, where("email", "==", user.email), orderBy("creadoEn", "desc"), limit(10));

  unsubscribeSolicitudes = onSnapshot(q, (snap) => {
    if (snap.empty) {
      listaMisSolicitudes.innerHTML = "";
      return;
    }
    const etiquetaEstado = { pendiente: "Pendiente", aprobada: "Aprobada", rechazada: "Rechazada", cancelada: "Cancelada" };
    listaMisSolicitudes.innerHTML = snap.docs
      .map((d) => {
        const s = d.data();
        const tipoTexto = s.tipo === "licencia" ? "Licencia" : "Vacaciones";
        return `
          <div class="tarjeta-solicitud">
            <strong>${tipoTexto}</strong>: ${s.fechaInicio} → ${s.fechaFin}
            <br />
            <span class="estado-solicitud estado-${s.estado}">${etiquetaEstado[s.estado] || s.estado}</span>
            ${
              s.estado === "rechazada" && s.motivoRechazo
                ? `<p class="texto-motivo-rechazo">Motivo: ${s.motivoRechazo}</p>`
                : ""
            }
            ${
              s.estado === "pendiente"
                ? `<br /><button class="boton-texto-chico" data-id="${d.id}" data-accion="cancelar-solicitud">Cancelar</button>`
                : ""
            }
          </div>
        `;
      })
      .join("");

    listaMisSolicitudes.querySelectorAll('[data-accion="cancelar-solicitud"]').forEach((boton) => {
      boton.addEventListener("click", async () => {
        if (!confirm("¿Cancelar esta solicitud?")) return;
        try {
          await updateDoc(doc(db, "solicitudes", boton.dataset.id), { estado: "cancelada" });
        } catch (err) {
          console.error(err);
          alert("No se pudo cancelar. Probá de nuevo.");
        }
      });
    });
  });
}
