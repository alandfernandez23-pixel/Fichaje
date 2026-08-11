import { useEffect, useState } from 'react';
import { collection, onSnapshot, orderBy, query, limit } from 'firebase/firestore';
import { db } from '../firebase';

const EMOJI_ANIMO = { feliz: '😊', triste: '😢', enojado: '😠', aburrido: '😴' };
const LABEL_ANIMO = { feliz: 'Feliz', triste: 'Triste', enojado: 'Enojado/a', aburrido: 'Aburrido/a' };

function formatearFecha(ts) {
  if (!ts?.toDate) return '';
  return ts.toDate().toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' });
}

export default function Buzon() {
  const [notas, setNotas] = useState([]);
  const [filtro, setFiltro] = useState('todas'); // 'todas' | 'animo' | 'comentario'

  useEffect(() => {
    const q = query(collection(db, 'notasEmpleado'), orderBy('creadoEn', 'desc'), limit(200));
    const unsub = onSnapshot(q, (snap) => {
      setNotas(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    return unsub;
  }, []);

  const visibles = filtro === 'todas' ? notas : notas.filter((n) => n.tipo === filtro);

  return (
    <div className="panel-secundario">
      <div className="tabs-vista" style={{ marginBottom: 16 }}>
        <button className={`tab-boton ${filtro === 'todas' ? 'tab-activa' : ''}`} onClick={() => setFiltro('todas')}>
          Todas
        </button>
        <button className={`tab-boton ${filtro === 'animo' ? 'tab-activa' : ''}`} onClick={() => setFiltro('animo')}>
          Ánimo
        </button>
        <button
          className={`tab-boton ${filtro === 'comentario' ? 'tab-activa' : ''}`}
          onClick={() => setFiltro('comentario')}
        >
          Comentarios
        </button>
      </div>

      {visibles.length === 0 && <p className="tabla-vacia">Todavía no hay nada acá.</p>}

      <div className="lista-buzon">
        {visibles.map((n) => (
          <div key={n.id} className="tarjeta-buzon">
            <div className="tarjeta-buzon-cabecera">
              <strong>{n.nombre}</strong>
              <span className="tarjeta-buzon-fecha">{formatearFecha(n.creadoEn)}</span>
            </div>
            {n.tipo === 'animo' ? (
              <p className="tarjeta-buzon-animo">
                {EMOJI_ANIMO[n.animo] || ''} {LABEL_ANIMO[n.animo] || n.animo}
              </p>
            ) : (
              <p className="tarjeta-buzon-texto">{n.texto}</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
