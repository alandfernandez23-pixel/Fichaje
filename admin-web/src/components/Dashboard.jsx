import { useEffect, useMemo, useState } from 'react';
import {
  collection,
  onSnapshot,
  orderBy,
  query,
  updateDoc,
  deleteField,
  addDoc,
  Timestamp,
} from 'firebase/firestore';
import { signOut } from 'firebase/auth';
import { auth, db } from '../firebase';
import RelojVivo from './RelojVivo.jsx';
import Administradores from './Administradores.jsx';
import { exportarFichajesAExcel } from './exportarExcel.js';

function aFechaLocal(date) {
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
  const [vista, setVista] = useState('activos'); // 'activos' | 'eliminados' | 'admins'
  const [mostrarFormManual, setMostrarFormManual] = useState(false);

  useEffect(() => {
    const q = query(collection(db, 'fichajes'), orderBy('horaEntrada', 'desc'));
    const unsubscribe = onSnapshot(q, (snap) => {
      setFichajes(snap.docs.map((d) => ({ id: d.id, ref: d.ref, ...d.data() })));
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    const id = setInterval(() => setAhora(new Date()), 30000);
    return () => clearInterval(id);
  }, []);

  const activos = useMemo(() => fichajes.filter((f) => !f.eliminado), [fichajes]);
  const eliminados = useMemo(() => fichajes.filter((f) => f.eliminado), [fichajes]);
  const listaBase = vista === 'activos' ? activos : eliminados;

  const filtrados = useMemo(() => {
    const texto = busqueda.trim().toLowerCase();
    return listaBase.filter((f) => {
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
  }, [listaBase, busqueda, filtroFecha, filtroMes]);

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

  const eliminarFichaje = async (f) => {
    const entradaTexto = f.horaEntrada
      ? f.horaEntrada.toDate().toLocaleString('es-AR')
      : '';
    const ok = window.confirm(
      `¿Eliminar el fichaje de ${f.nombre} (${entradaTexto})?\n\nQueda guardado en "Papelera" y se puede restaurar.`
    );
    if (!ok) return;
    await updateDoc(f.ref, {
      eliminado: true,
      eliminadoEn: new Date(),
      eliminadoPor: user.email || '',
    });
  };

  const restaurarFichaje = async (f) => {
    await updateDoc(f.ref, {
      eliminado: deleteField(),
      eliminadoEn: deleteField(),
      eliminadoPor: deleteField(),
    });
  };

  const marcarSalidaAhora = async (f) => {
    const ok = window.confirm(
      `¿Marcar la salida de ${f.nombre} ahora mismo (${ahora.toLocaleTimeString('es-AR', { hour12: false })})?`
    );
    if (!ok) return;
    await updateDoc(f.ref, {
      horaSalida: new Date(),
      cerradoManualmentePor: user.email || '',
    });
  };

  const crearFichajeManual = async ({ nombre, email, fecha, horaEntrada, horaSalida }) => {
    const entrada = Timestamp.fromDate(new Date(`${fecha}T${horaEntrada}:00`));
    const salida = horaSalida
      ? Timestamp.fromDate(new Date(`${fecha}T${horaSalida}:00`))
      : null;

    await addDoc(collection(db, 'fichajes'), {
      uid: `manual-${email.trim().toLowerCase()}`,
      nombre: nombre.trim(),
      email: email.trim().toLowerCase(),
      horaEntrada: entrada,
      horaSalida: salida,
      cargadoManualmente: true,
      cargadoPor: user.email || '',
    });
  };

  return (
    <div className="dashboard">
      <header className="dashboard-header">
        <div>
          <div className="header-marca">
            <img src="/admin/logo.png" alt="Más Que Pilates" className="header-logo" />
            <span className="eyebrow">Panel de administración</span>
          </div>
          <h1>Fichajes</h1>
        </div>
        <RelojVivo />
        <div className="header-acciones">
          <a
            className="boton-texto"
            href="/qr.html"
            target="_blank"
            rel="noreferrer"
          >
            Ver código QR del local
          </a>
          <span className="usuario-actual">{user.displayName}</span>
          <button className="boton-secundario" onClick={() => signOut(auth)}>
            Salir
          </button>
        </div>
      </header>

      <div className="tabs-vista">
        <button
          className={`tab-boton ${vista === 'activos' ? 'tab-activa' : ''}`}
          onClick={() => setVista('activos')}
        >
          Fichajes
        </button>
        <button
          className={`tab-boton ${vista === 'eliminados' ? 'tab-activa' : ''}`}
          onClick={() => setVista('eliminados')}
        >
          Papelera
          {eliminados.length > 0 && (
            <span className="tab-contador">{eliminados.length}</span>
          )}
        </button>
        <button
          className={`tab-boton ${vista === 'admins' ? 'tab-activa' : ''}`}
          onClick={() => setVista('admins')}
        >
          Administradores
        </button>
      </div>

      {vista === 'admins' ? (
        <Administradores user={user} />
      ) : (
        <>
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
        {vista === 'activos' && (
          <>
            <button
              className="boton-secundario"
              onClick={() => setMostrarFormManual((v) => !v)}
            >
              {mostrarFormManual ? 'Cancelar' : 'Fichar por un empleado'}
            </button>
            <button
              className="boton-primario"
              onClick={() => exportarFichajesAExcel(filtrados, ahora)}
              disabled={filtrados.length === 0}
            >
              Descargar Excel
            </button>
          </>
        )}
      </div>

      {mostrarFormManual && vista === 'activos' && (
        <FormularioFichajeManual
          onCancelar={() => setMostrarFormManual(false)}
          onGuardar={async (datos) => {
            await crearFichajeManual(datos);
            setMostrarFormManual(false);
          }}
        />
      )}

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
        {vista === 'activos' && resumen.enCurso > 0 && (
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
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filtrados.map((f) => (
              <FilaFichaje
                key={f.id}
                fichaje={f}
                ahora={ahora}
                vista={vista}
                onEliminar={() => eliminarFichaje(f)}
                onRestaurar={() => restaurarFichaje(f)}
                onMarcarSalida={() => marcarSalidaAhora(f)}
              />
            ))}
            {filtrados.length === 0 && (
              <tr>
                <td colSpan={8} className="tabla-vacia">
                  {vista === 'eliminados'
                    ? 'La papelera está vacía.'
                    : hayFiltrosActivos
                    ? 'No hay fichajes que coincidan con el filtro.'
                    : 'Todavía no hay fichajes registrados.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
        </>
      )}
    </div>
  );
}

function FormularioFichajeManual({ onCancelar, onGuardar }) {
  const [nombre, setNombre] = useState('');
  const [email, setEmail] = useState('');
  const [fecha, setFecha] = useState(() => new Date().toISOString().slice(0, 10));
  const [horaEntrada, setHoraEntrada] = useState('');
  const [horaSalida, setHoraSalida] = useState('');
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);

  const enviar = async (e) => {
    e.preventDefault();
    setError('');

    if (!nombre.trim() || !email.trim() || !fecha || !horaEntrada) {
      setError('Completá al menos nombre, email, fecha y hora de entrada.');
      return;
    }
    if (horaSalida && horaSalida <= horaEntrada) {
      setError('La hora de salida tiene que ser posterior a la de entrada.');
      return;
    }

    setGuardando(true);
    try {
      await onGuardar({ nombre, email, fecha, horaEntrada, horaSalida });
    } catch (err) {
      console.error(err);
      setError('No se pudo guardar. Probá de nuevo.');
      setGuardando(false);
    }
  };

  return (
    <form className="form-manual" onSubmit={enviar}>
      <div className="form-manual-grid">
        <label>
          Nombre
          <input
            className="input-filtro"
            type="text"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
          />
        </label>
        <label>
          Email
          <input
            className="input-filtro"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        <label>
          Fecha
          <input
            className="input-filtro"
            type="date"
            value={fecha}
            onChange={(e) => setFecha(e.target.value)}
          />
        </label>
        <label>
          Hora entrada
          <input
            className="input-filtro"
            type="time"
            value={horaEntrada}
            onChange={(e) => setHoraEntrada(e.target.value)}
          />
        </label>
        <label>
          Hora salida (opcional, si sigue trabajando dejala vacía)
          <input
            className="input-filtro"
            type="time"
            value={horaSalida}
            onChange={(e) => setHoraSalida(e.target.value)}
          />
        </label>
      </div>
      {error && <p className="texto-error-admins">{error}</p>}
      <div className="form-manual-acciones">
        <button type="button" className="boton-texto" onClick={onCancelar}>
          Cancelar
        </button>
        <button type="submit" className="boton-primario" disabled={guardando}>
          Guardar fichaje
        </button>
      </div>
    </form>
  );
}

function FilaFichaje({ fichaje, ahora, vista, onEliminar, onRestaurar, onMarcarSalida }) {
  const entrada = fichaje.horaEntrada?.toDate();
  const salida = fichaje.horaSalida?.toDate();
  const abierto = !salida;
  const duracionMs = entrada ? calcularDuracionMs(entrada, salida || ahora) : 0;

  return (
    <tr>
      <td>
        {fichaje.nombre}
        {fichaje.cargadoManualmente && (
          <span className="etiqueta-manual" title={`Cargado por ${fichaje.cargadoPor || 'un admin'}`}>
            manual
          </span>
        )}
      </td>
      <td className="celda-email">{fichaje.email}</td>
      <td className="celda-mono">{entrada ? entrada.toLocaleDateString('es-AR') : '—'}</td>
      <td className="celda-mono">{entrada ? entrada.toLocaleTimeString('es-AR', { hour12: false }) : '—'}</td>
      <td className="celda-mono">{salida ? salida.toLocaleTimeString('es-AR', { hour12: false }) : '—'}</td>
      <td className="celda-mono celda-horas">
        {formatDuracion(duracionMs)}
        {abierto && vista === 'activos' && <span className="punto-en-curso" title="En curso" />}
      </td>
      <td>
        <span className={`etiqueta ${abierto ? 'etiqueta-abierto' : 'etiqueta-cerrado'}`}>
          {abierto ? 'En curso' : 'Cerrado'}
        </span>
      </td>
      <td className="celda-acciones">
        {vista === 'activos' ? (
          <div className="acciones-fila">
            {abierto && (
              <button className="boton-cerrar-turno" onClick={onMarcarSalida} title="Marcar salida ahora">
                Marcar salida
              </button>
            )}
            <button className="boton-eliminar" onClick={onEliminar} title="Eliminar">
              Eliminar
            </button>
          </div>
        ) : (
          <button className="boton-restaurar" onClick={onRestaurar} title="Restaurar">
            Restaurar
          </button>
        )}
      </td>
    </tr>
  );
}
