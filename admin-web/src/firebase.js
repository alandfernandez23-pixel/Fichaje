import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

// Pegá acá la configuración que te da Firebase cuando registrás
// una "app web" en tu proyecto (Configuración del proyecto > Tus apps > Web).
// Es la misma que usa la app de celular, así que comparten los mismos datos.
const firebaseConfig = {
  apiKey: 'AIzaSyANMkRYgy05W86lJ42KTN7GsOFUCs8CupE',
  authDomain: 'fichaje-b9421.firebaseapp.com',
  projectId: 'fichaje-b9421',
  storageBucket: 'fichaje-b9421.firebasestorage.app',
  messagingSenderId: '634712461696',
  appId: '1:634712461696:web:3faa528b066cb90df23165',
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });
export const db = getFirestore(app);
