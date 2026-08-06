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

  if (!user) {
    mostrarSolo(pantallaLogin);
    return;
  }

  nombreUsuario.textContent = user.displayName || user.email;
  mostrarSolo(pantallaFichaje);
  escucharEstado(user);
});

function escucharEstado(user) {
  const fichajesRef = collection(db, "fichajes");
  const q = query(
    fichajesRef,
    where("uid", "==", user.uid),
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
  } else {
    botonHuella.classList.remove("adentro");
    textoEstado.textContent = "Estás afuera. Tocá para marcar tu entrada.";
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
      await ficharSalida(user.uid, datosVerificacion);
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

async function ficharSalida(uid, datosVerificacion) {
  const fichajesRef = collection(db, "fichajes");
  const q = query(
    fichajesRef,
    where("uid", "==", uid),
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

// --- Fichar por GPS (método principal) ---
botonHuella.addEventListener("click", async () => {
  if (!auth.currentUser || estadoActual === "cargando") return;

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
