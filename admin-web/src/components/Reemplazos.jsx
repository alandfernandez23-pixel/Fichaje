import { useEffect, useState } from 'react';
import { collection, onSnapshot, orderBy, query, deleteDoc, doc } from 'firebase/firestore';
import { db } from '../firebase';

const ETIQUETA_ESTADO = { abierto: 'Abierto', cubierto: 'Cubierto' };

export default function Reemplazos() {
  const [reemplazos, setReemplazos] = useState([]);
  const [filtro, setFiltro] = useState('todos'); // 'todos' | 'abierto' | 'cubierto'

  useEffect(() => {
    const q = query(collection(db, 'reemplazos'), orderBy('creadoEn', 'desc'));
    const unsub = onSnapshot(q, (snap) => {
      setReemplazos(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    return unsub;
  }, []);

  const visibles = filtro === 'todos' ? reemplazos : reemplazos.filter((r) => r.estado === filtro);

  async function quitar(r) {
    if (!window.confirm(`¿Quitar este pedido de reemplazo de ${r.nombre}?`)) return;
    await deleteDoc(doc(db, 'reemplazos', r.id));
  }

  return (
    <div className="panel-secundario">
      <div className="tabs-vista" style={{ marginBottom: 16 }}>
        <button className={`tab-boton ${filtro === 'todos' ? 'tab-activa' : ''}`} onClick={() => setFiltro('todos')}>Todos</button>
        <button className={`tab-boton ${filtro === 'abierto' ? 'tab-activa' : ''}`} onClick={() => setFiltro('abierto')}>Abiertos</button>
        <button className={`tab-boton ${filtro === 'cubierto' ? 'tab-activa' : ''}`} onClick={() => setFiltro('cubierto')}>Cubiertos</button>
      </div>

      {visibles.length === 0 && <p className="tabla-vacia">No hay pedidos de reemplazo.</p>}

      <div className="lista-solicitudes-admin">
        {visibles.map((r) => (
          <div key={r.id} className={`tarjeta-solicitud-admin estado-borde-${r.estado === 'abierto' ? 'pendiente' : 'aprobada'}`}>
            <div className="tarjeta-solicitud-cabecera">
              <strong>{r.nombre}</strong>
              <span className={`estado-solicitud estado-${r.estado === 'abierto' ? 'pendiente' : 'aprobada'}`}>
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
            <div className="tarjeta-solicitud-acciones">
              <button className="boton-secundario boton-chico" onClick={() => quitar(r)}>Quitar</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
