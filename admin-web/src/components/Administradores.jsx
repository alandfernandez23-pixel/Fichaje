import { useEffect, useState } from 'react';
import {
  collection,
  onSnapshot,
  doc,
  setDoc,
  deleteDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '../firebase';

function normalizarEmail(email) {
  return email.trim().toLowerCase();
}

export default function Administradores({ user }) {
  const [admins, setAdmins] = useState([]);
  const [nuevoEmail, setNuevoEmail] = useState('');
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, 'admins'), (snap) => {
      setAdmins(
        snap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .sort((a, b) => (a.email || '').localeCompare(b.email || ''))
      );
    });
    return unsubscribe;
  }, []);

  const agregarAdmin = async (e) => {
    e.preventDefault();
    setError('');
    const email = normalizarEmail(nuevoEmail);

    if (!email || !email.includes('@')) {
      setError('Ingresá un email válido.');
      return;
    }
    if (admins.some((a) => a.id === email)) {
      setError('Ese email ya es administrador.');
      return;
    }

    setGuardando(true);
    try {
      await setDoc(doc(db, 'admins', email), {
        email,
        agregadoPor: user.email || '',
        agregadoEn: serverTimestamp(),
      });
      setNuevoEmail('');
    } catch (err) {
      console.error(err);
      setError('No se pudo agregar. Probá de nuevo.');
    } finally {
      setGuardando(false);
    }
  };

  const quitarAdmin = async (admin) => {
    if (admin.id === normalizarEmail(user.email || '')) {
      const ok = window.confirm(
        'Te estás por quitar el acceso de administrador a vos mismo. ' +
          'Si sos el único admin, nadie va a poder gestionar esto después. ¿Continuar?'
      );
      if (!ok) return;
    } else {
      const ok = window.confirm(`¿Quitar a ${admin.email} como administrador?`);
      if (!ok) return;
    }
    await deleteDoc(doc(db, 'admins', admin.id));
  };

  return (
    <div className="admins-panel">
      <p className="admins-intro">
        Las personas de esta lista pueden entrar a este panel y ver los
        fichajes de todos. Agregalas por su email de Google.
      </p>

      <form className="admins-form" onSubmit={agregarAdmin}>
        <input
          className="input-busqueda"
          type="email"
          placeholder="email@ejemplo.com"
          value={nuevoEmail}
          onChange={(e) => setNuevoEmail(e.target.value)}
        />
        <button className="boton-primario" type="submit" disabled={guardando}>
          Agregar administrador
        </button>
      </form>
      {error && <p className="texto-error-admins">{error}</p>}

      <div className="tabla-contenedor">
        <table className="tabla-fichajes">
          <thead>
            <tr>
              <th>Email</th>
              <th>Agregado por</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {admins.map((admin) => (
              <tr key={admin.id}>
                <td>
                  {admin.email}
                  {admin.id === normalizarEmail(user.email || '') && (
                    <span className="etiqueta-vos">vos</span>
                  )}
                </td>
                <td className="celda-email">{admin.agregadoPor || '—'}</td>
                <td className="celda-acciones">
                  <button
                    className="boton-eliminar"
                    onClick={() => quitarAdmin(admin)}
                  >
                    Quitar
                  </button>
                </td>
              </tr>
            ))}
            {admins.length === 0 && (
              <tr>
                <td colSpan={3} className="tabla-vacia">
                  Todavía no hay administradores cargados.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
