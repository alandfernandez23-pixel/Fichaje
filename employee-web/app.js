import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithRedirect,
  getRedirectResult,
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
  apiKey: "TU_API_KEY",
  authDomain: "TU_PROYECTO.firebaseapp.com",
  projectId: "TU_PROYECTO",
  storageBucket: "TU_PROYECTO.appspot.com",
  messagingSenderId: "TU_SENDER_ID",
  appId: "TU_APP_ID",
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const googleProvider = new GoogleAuthProvider();
const db = getFirestore(app);

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

function mostrarSolo(pantalla) {
  [pantallaCarga, pantallaLogin, pantallaFichaje].forEach((p) =>
    p.classList.add("oculto")
  );
  pantalla.classList.remove("oculto");
}

// --- Login ---
btnLogin.addEventListener("click", () => {
  errorLogin.classList.add("oculto");
  signInWithRedirect(auth, googleProvider);
});

btnLogout.addEventListener("click", () => signOut(auth));

getRedirectResult(auth).catch((err) => {
  errorLogin.textContent = "No se pudo iniciar sesión. Probá de nuevo.";
  errorLogin.classList.remove("oculto");
  console.error(err);
});

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

botonHuella.addEventListener("click", async () => {
  const user = auth.currentUser;
  if (!user || estadoActual === "cargando") return;

  botonHuella.setAttribute("disabled", "true");
  try {
    if (estadoActual === "adentro") {
      await ficharSalida(user.uid);
    } else {
      await ficharEntrada(user);
    }
  } catch (err) {
    console.error(err);
    textoEstado.textContent = "Hubo un problema al fichar. Probá de nuevo.";
  } finally {
    botonHuella.removeAttribute("disabled");
  }
});

async function ficharEntrada(user) {
  await addDoc(collection(db, "fichajes"), {
    uid: user.uid,
    nombre: user.displayName || "",
    email: user.email || "",
    horaEntrada: serverTimestamp(),
    horaSalida: null,
  });
}

async function ficharSalida(uid) {
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
  await updateDoc(snap.docs[0].ref, { horaSalida: serverTimestamp() });
}

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
      'Instalá Fichaje en tu celular para un acceso más rápido. <button id="btn-instalar-ahora" style="border:none;background:var(--rosa-acento);color:#fff;border-radius:999px;padding:6px 14px;font-weight:700;cursor:pointer;">Instalar</button>';
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
