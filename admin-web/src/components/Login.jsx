import { signInWithPopup } from 'firebase/auth';
import { auth, googleProvider } from '../firebase';

export default function Login() {
  const entrar = () => signInWithPopup(auth, googleProvider);

  return (
    <div className="login-pantalla">
      <div className="login-tarjeta">
        <span className="login-eyebrow">Panel de administración</span>
        <h1>Fichaje</h1>
        <p>Iniciá sesión con tu cuenta de Google para ver los registros de entrada y salida.</p>
        <button className="boton-primario" onClick={entrar}>
          Continuar con Google
        </button>
      </div>
    </div>
  );
}
