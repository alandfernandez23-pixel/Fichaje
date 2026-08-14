import { useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot, orderBy, query, deleteDoc, doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';

const ETIQUETA_ESTADO = { abierto: 'Abierto', cubierto: 'Cubierto', cancelado: 'Cancelado' };

export default function Reemplazos() {
  const [reemplazos, setReemplazos] = useState([]);
  const [fichajes, setFichajes] = useState([]);
  const [filtro, setFiltro] = useState('todos'); // 'todos' | 'abierto' | 'cubierto' | 'cancelado'
  const [seleccion, setSeleccion] = useState({}); // { [reemplazoId]: email elegido }

  useEffect(() => {
    const q = query(collection(db, 'reemplazos'), orderBy('creadoEn', 'desc'));
    const unsub = onSnapshot(q, (snap) => {
      setReemplazos(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    return unsub;
  }, []);

  // Nómina completa: cualquiera que haya fichado alguna vez.
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'fichajes'), (snap) => {
      setFichajes(snap.docs.map((d) => d.data()));
    });
    return unsub;
  }, []);

  // Lista de profes únicas (nombre + email), sacada de la nómina completa de fichajes.
  const profesDisponibles = useMemo(() => {
    const mapa = new Map();
    fichajes.forEach((f) => {
      if (f.email && f.nombre && !mapa.has(f.email)) mapa.set(f.email, f.nombre);
    });
    return [...mapa.entries()].map(([email, nombre]) => ({ email, nombre })).sort((a, b) => a.nombre.localeCompare(b.nombre));
  }, [fichajes]);

  const visibles = filtro === 'todos' ? reemplazos : reemplazos.filter((r) => r.estado === filtro);

  async function quitar(r) {
    if (!window.confirm(`¿Quitar este pedido de reemplazo de ${r.nombre}?`)) return;
    await deleteDoc(doc(db, 'reemplazos', r.id));
  }

  async function asignar(r) {
    const email = seleccion[r.id];
    if (!email) return;
    const profe = profesDisponibles.find((p) => p.email === email);
    if (!profe) return;
    if (!window.confirm(`¿Asignar a ${profe.nombre} para cubrir este reemplazo?`)) return;
    await updateDoc(doc(db, 'reemplazos', r.id), {
      estado: 'cubierto',
      cubiertoPorEmail: profe.email,
      cubiertoPorNombre: profe.nombre,
      cubiertoEn: serverTimestamp(),
      asignadoPorAdmin: true,
    });
    setSeleccion((s) => ({ ...s, [r.id]: '' }));
  }

  return (
    <div className="panel-secundario">
      <div className="tabs-vista" style={{ marginBottom: 16 }}>
        <button className={`tab-boton ${filtro === 'todos' ? 'tab-activa' : ''}`} onClick={() => setFiltro('todos')}>Todos</button>
        <button className={`tab-boton ${filtro === 'abierto' ? 'tab-activa' : ''}`} onClick={() => setFiltro('abierto')}>Abiertos</button>
        <button className={`tab-boton ${filtro === 'cubierto' ? 'tab-activa' : ''}`} onClick={() => setFiltro('cubierto')}>Cubiertos</button>
        <button className={`tab-boton ${filtro === 'cancelado' ? 'tab-activa' : ''}`} onClick={() => setFiltro('cancelado')}>Cancelados</button>
      </div>

      {visibles.length === 0 && <p className="tabla-vacia">No hay pedidos de reemplazo.</p>}

      <div className="lista-solicitudes-admin">
        {visibles.map((r) => {
          const claseEstado = r.estado === 'abierto' ? 'pendiente' : r.estado === 'cubierto' ? 'aprobada' : 'rechazada';
          return (
            <div key={r.id} className={`tarjeta-solicitud-admin estado-borde-${claseEstado}`}>
              <div className="tarjeta-solicitud-cabecera">
                <strong>{r.nombre}</strong>
                <span className={`estado-solicitud estado-${claseEstado}`}>
                  {ETIQUETA_ESTADO[r.estado] || r.estado}
                </span>
              </div>
              <p className="tarjeta-solicitud-detalle">
                {r.diaTexto} {r.fecha} · {r.horaInicio}-{r.horaFin} · {r.tipoClase}{r.aula ? ` · ${r.aula}` : ''}
              </p>
              {r.motivo && <p className="tarjeta-solicitud-comentario">"{r.motivo}"</p>}
              {r.estado === 'cubierto' && (
                <p className="tarjeta-solicitud-detalle">Lo cubre: <strong>{r.cubiertoPorNombre}</strong></p>
              )}

              {r.estado === 'abierto' && (
                <div className="tarjeta-solicitud-acciones" style={{ flexWrap: 'wrap', gap: 8 }}>
                  <select
                    className="campo-texto"
                    style={{ maxWidth: 220 }}
                    value={seleccion[r.id] || ''}
                    onChange={(e) => setSeleccion((s) => ({ ...s, [r.id]: e.target.value }))}
                  >
                    <option value="">Elegir quién cubre…</option>
                    {profesDisponibles
                      .filter((p) => p.email !== r.email)
                      .map((p) => (
                        <option key={p.email} value={p.email}>{p.nombre}</option>
                      ))}
                  </select>
                  <button
                    className="boton-primario boton-chico"
                    disabled={!seleccion[r.id]}
                    onClick={() => asignar(r)}
                  >
                    Asignar
                  </button>
                </div>
              )}

              <div className="tarjeta-solicitud-acciones">
                <button className="boton-secundario boton-chico" onClick={() => quitar(r)}>Quitar</button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
