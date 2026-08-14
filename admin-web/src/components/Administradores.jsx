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

  const [telefonoContacto, setTelefonoContacto] = useState('');
  const [telefonoGuardado, setTelefonoGuardado] = useState('');
  const [guardandoTelefono, setGuardandoTelefono] = useState(false);
  const [avisoTelefono, setAvisoTelefono] = useState('');

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

  // Teléfono de contacto (WhatsApp), guardado en configuracion/contacto.
  useEffect(() => {
    const unsubscribe = onSnapshot(doc(db, 'configuracion', 'contacto'), (snap) => {
      const tel = snap.exists() ? snap.data().telefonoWhatsapp || '' : '';
      setTelefonoContacto(tel);
      setTelefonoGuardado(tel);
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

  const guardarTelefono = async (e) => {
    e.preventDefault();
    setAvisoTelefono('');
    // Solo dígitos, con código de país incluido (ej: 5491158621155).
    const limpio = telefonoContacto.replace(/[^\d]/g, '');
    if (limpio.length < 8) {
      setAvisoTelefono('Ingresá un teléfono válido, con código de país y área (ej: 5491158621155).');
      return;
    }
    setGuardandoTelefono(true);
    try {
      await setDoc(doc(db, 'configuracion', 'contacto'), {
        telefonoWhatsapp: limpio,
        actualizadoPor: user.email || '',
        actualizadoEn: serverTimestamp(),
      });
      setTelefonoContacto(limpio);
      setTelefonoGuardado(limpio);
      setAvisoTelefono('Guardado.');
    } catch (err) {
      console.error(err);
      setAvisoTelefono('No se pudo guardar. Probá de nuevo.');
    } finally {
      setGuardandoTelefono(false);
    }
  };

  return (
    <div className="admins-panel">
      <div className="bloque-espacio" style={{ marginBottom: 24 }}>
        <p className="bloque-titulo">Teléfono de contacto (WhatsApp)</p>
        <p className="admins-intro">
          Este es el número al que se conectan las profes cuando tocan el botón de WhatsApp en su app.
          Escribilo con código de país y área, sin espacios ni guiones (ej: 5491158621155).
        </p>
        <form className="admins-form" onSubmit={guardarTelefono}>
          <input
            className="input-busqueda"
            type="tel"
            placeholder="5491158621155"
            value={telefonoContacto}
            onChange={(e) => setTelefonoContacto(e.target.value)}
          />
          <button
            className="boton-primario"
            type="submit"
            disabled={guardandoTelefono || telefonoContacto.replace(/[^\d]/g, '') === telefonoGuardado}
          >
            Guardar teléfono
          </button>
        </form>
        {avisoTelefono && <p className="texto-error-admins">{avisoTelefono}</p>}
      </div>

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
