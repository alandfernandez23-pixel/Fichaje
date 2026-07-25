import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

// Pegá acá la configuración que te da Firebase cuando registrás
// una "app web" en tu proyecto (Configuración del proyecto > Tus apps > Web).
// Es la misma que usa la app de celular, así que comparten los mismos datos.
const firebaseConfig = {
  apiKey: 'TU_API_KEY',
  authDomain: 'TU_PROYECTO.firebaseapp.com',
  projectId: 'TU_PROYECTO',
  storageBucket: 'TU_PROYECTO.appspot.com',
  messagingSenderId: 'TU_SENDER_ID',
  appId: 'TU_APP_ID',
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
export const db = getFirestore(app);
