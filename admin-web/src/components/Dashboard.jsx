import { useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot, orderBy, query } from 'firebase/firestore';
import { signOut } from 'firebase/auth';
import { auth, db } from '../firebase';
import RelojVivo from './RelojVivo.jsx';
import { exportarFichajesAExcel } from './exportarExcel.js';

export default function Dashboard({ user }) {
  const [fichajes, setFichajes] = useState([]);
  const [busqueda, setBusqueda] = useState('');

  useEffect(() => {
    const q = query(collection(db, 'fichajes'), orderBy('horaEntrada', 'desc'));
    const unsubscribe = onSnapshot(q, (snap) => {
      setFichajes(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    return unsubscribe;
  }, []);

  const filtrados = useMemo(() => {
    const texto = busqueda.trim().toLowerCase();
    if (!texto) return fichajes;
    return fichajes.filter(
      (f) =>
        f.nombre?.toLowerCase().includes(texto) ||
        f.email?.toLowerCase().includes(texto)
    );
  }, [fichajes, busqueda]);

  return (
    <div className="dashboard">
      <header className="dashboard-header">
        <div>
          <span className="eyebrow">Panel de administración</span>
          <h1>Fichajes</h1>
        </div>
        <RelojVivo />
        <div className="header-acciones">
          <span className="usuario-actual">{user.displayName}</span>
          <button className="boton-secundario" onClick={() => signOut(auth)}>
            Salir
          </button>
        </div>
      </header>

      <div className="dashboard-toolbar">
        <input
          className="input-busqueda"
          type="text"
          placeholder="Buscar por nombre o email…"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
        />
        <button
          className="boton-primario"
          onClick={() => exportarFichajesAExcel(filtrados)}
          disabled={filtrados.length === 0}
        >
          Descargar Excel
        </button>
      </div>

      <div className="tabla-contenedor">
        <table className="tabla-fichajes">
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Email</th>
              <th>Fecha entrada</th>
              <th>Hora entrada</th>
              <th>Fecha salida</th>
              <th>Hora salida</th>
              <th>Estado</th>
            </tr>
          </thead>
          <tbody>
            {filtrados.map((f) => (
              <FilaFichaje key={f.id} fichaje={f} />
            ))}
            {filtrados.length === 0 && (
              <tr>
                <td colSpan={7} className="tabla-vacia">
                  Todavía no hay fichajes registrados.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function FilaFichaje({ fichaje }) {
  const entrada = fichaje.horaEntrada?.toDate();
  const salida = fichaje.horaSalida?.toDate();
  const abierto = !salida;

  return (
    <tr>
      <td>{fichaje.nombre}</td>
      <td className="celda-email">{fichaje.email}</td>
      <td className="celda-mono">{entrada ? entrada.toLocaleDateString('es-AR') : '—'}</td>
      <td className="celda-mono">{entrada ? entrada.toLocaleTimeString('es-AR', { hour12: false }) : '—'}</td>
      <td className="celda-mono">{salida ? salida.toLocaleDateString('es-AR') : '—'}</td>
      <td className="celda-mono">{salida ? salida.toLocaleTimeString('es-AR', { hour12: false }) : '—'}</td>
      <td>
        <span className={`etiqueta ${abierto ? 'etiqueta-abierto' : 'etiqueta-cerrado'}`}>
          {abierto ? 'En curso' : 'Cerrado'}
        </span>
      </td>
    </tr>
  );
}
