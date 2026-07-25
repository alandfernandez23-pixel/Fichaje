import { useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot, orderBy, query } from 'firebase/firestore';
import { signOut } from 'firebase/auth';
import { auth, db } from '../firebase';
import RelojVivo from './RelojVivo.jsx';
import { exportarFichajesAExcel } from './exportarExcel.js';

function aFechaLocal(date) {
  // yyyy-mm-dd en horario local, para comparar con inputs type="date"
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function aMesLocal(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

function calcularDuracionMs(entrada, salidaOFin) {
  if (!entrada) return 0;
  return Math.max(0, salidaOFin - entrada);
}

function formatDuracion(ms) {
  const totalMin = Math.floor(ms / 60000);
  const horas = Math.floor(totalMin / 60);
  const minutos = totalMin % 60;
  return `${horas}h ${String(minutos).padStart(2, '0')}m`;
}

export default function Dashboard({ user }) {
  const [fichajes, setFichajes] = useState([]);
  const [busqueda, setBusqueda] = useState('');
  const [filtroFecha, setFiltroFecha] = useState('');
  const [filtroMes, setFiltroMes] = useState('');
  const [ahora, setAhora] = useState(new Date());

  useEffect(() => {
    const q = query(collection(db, 'fichajes'), orderBy('horaEntrada', 'desc'));
    const unsubscribe = onSnapshot(q, (snap) => {
      setFichajes(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    return unsubscribe;
  }, []);

  // Actualiza el reloj cada 30s para que las horas de fichajes "en curso"
  // se vayan sumando sin que la persona tenga que refrescar la página.
  useEffect(() => {
    const id = setInterval(() => setAhora(new Date()), 30000);
    return () => clearInterval(id);
  }, []);

  const filtrados = useMemo(() => {
    const texto = busqueda.trim().toLowerCase();
    return fichajes.filter((f) => {
      if (texto) {
        const coincideTexto =
          f.nombre?.toLowerCase().includes(texto) ||
          f.email?.toLowerCase().includes(texto);
        if (!coincideTexto) return false;
      }

      const entrada = f.horaEntrada?.toDate();
      if (!entrada) return false;

      if (filtroFecha && aFechaLocal(entrada) !== filtroFecha) return false;
      if (filtroMes && aMesLocal(entrada) !== filtroMes) return false;

      return true;
    });
  }, [fichajes, busqueda, filtroFecha, filtroMes]);

  const resumen = useMemo(() => {
    let totalMs = 0;
    let enCurso = 0;
    filtrados.forEach((f) => {
      const entrada = f.horaEntrada?.toDate();
      const salida = f.horaSalida?.toDate();
      if (!entrada) return;
      if (salida) {
        totalMs += calcularDuracionMs(entrada, salida);
      } else {
        totalMs += calcularDuracionMs(entrada, ahora);
        enCurso += 1;
      }
    });
    return { totalMs, enCurso, cantidad: filtrados.length };
  }, [filtrados, ahora]);

  const limpiarFiltros = () => {
    setBusqueda('');
    setFiltroFecha('');
    setFiltroMes('');
  };

  const hayFiltrosActivos = busqueda || filtroFecha || filtroMes;

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
        <label className="input-filtro-etiqueta">
          Día
          <input
            className="input-filtro"
            type="date"
            value={filtroFecha}
            onChange={(e) => {
              setFiltroFecha(e.target.value);
              setFiltroMes('');
            }}
          />
        </label>
        <label className="input-filtro-etiqueta">
          Mes
          <input
            className="input-filtro"
            type="month"
            value={filtroMes}
            onChange={(e) => {
              setFiltroMes(e.target.value);
              setFiltroFecha('');
            }}
          />
        </label>
        {hayFiltrosActivos && (
          <button className="boton-texto" onClick={limpiarFiltros}>
            Limpiar filtros
          </button>
        )}
        <button
          className="boton-primario"
          onClick={() => exportarFichajesAExcel(filtrados)}
          disabled={filtrados.length === 0}
        >
          Descargar Excel
        </button>
      </div>

      <div className="resumen-barra">
        <div className="resumen-item">
          <span className="resumen-numero">{resumen.cantidad}</span>
          <span className="resumen-etiqueta">
            {resumen.cantidad === 1 ? 'fichaje' : 'fichajes'}
          </span>
        </div>
        <div className="resumen-item">
          <span className="resumen-numero">{formatDuracion(resumen.totalMs)}</span>
          <span className="resumen-etiqueta">horas totales</span>
        </div>
        {resumen.enCurso > 0 && (
          <div className="resumen-item resumen-en-curso">
            <span className="resumen-numero">{resumen.enCurso}</span>
            <span className="resumen-etiqueta">en curso ahora</span>
          </div>
        )}
      </div>

      <div className="tabla-contenedor">
        <table className="tabla-fichajes">
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Email</th>
              <th>Fecha</th>
              <th>Hora entrada</th>
              <th>Hora salida</th>
              <th>Horas</th>
              <th>Estado</th>
            </tr>
          </thead>
          <tbody>
            {filtrados.map((f) => (
              <FilaFichaje key={f.id} fichaje={f} ahora={ahora} />
            ))}
            {filtrados.length === 0 && (
              <tr>
                <td colSpan={7} className="tabla-vacia">
                  {hayFiltrosActivos
                    ? 'No hay fichajes que coincidan con el filtro.'
                    : 'Todavía no hay fichajes registrados.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function FilaFichaje({ fichaje, ahora }) {
  const entrada = fichaje.horaEntrada?.toDate();
  const salida = fichaje.horaSalida?.toDate();
  const abierto = !salida;
  const duracionMs = entrada ? calcularDuracionMs(entrada, salida || ahora) : 0;

  return (
    <tr>
      <td>{fichaje.nombre}</td>
      <td className="celda-email">{fichaje.email}</td>
      <td className="celda-mono">{entrada ? entrada.toLocaleDateString('es-AR') : '—'}</td>
      <td className="celda-mono">{entrada ? entrada.toLocaleTimeString('es-AR', { hour12: false }) : '—'}</td>
      <td className="celda-mono">{salida ? salida.toLocaleTimeString('es-AR', { hour12: false }) : '—'}</td>
      <td className="celda-mono celda-horas">
        {formatDuracion(duracionMs)}
        {abierto && <span className="punto-en-curso" title="En curso" />}
      </td>
      <td>
        <span className={`etiqueta ${abierto ? 'etiqueta-abierto' : 'etiqueta-cerrado'}`}>
          {abierto ? 'En curso' : 'Cerrado'}
        </span>
      </td>
    </tr>
  );
}
