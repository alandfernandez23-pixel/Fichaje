import { useEffect, useState } from 'react';
import { collection, onSnapshot, orderBy, query, updateDoc, doc } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { avisarSolicitudResuelta } from '../emailjs.js';

const ETIQUETA_ESTADO = { pendiente: 'Pendiente', aprobada: 'Aprobada', rechazada: 'Rechazada' };

export default function Solicitudes() {
  const [solicitudes, setSolicitudes] = useState([]);
  const [filtro, setFiltro] = useState('pendiente'); // 'pendiente' | 'todas'
  const [procesando, setProcesando] = useState(null);

  useEffect(() => {
    const q = query(collection(db, 'solicitudes'), orderBy('creadoEn', 'desc'));
    const unsub = onSnapshot(q, (snap) => {
      setSolicitudes(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    return unsub;
  }, []);

  const visibles = filtro === 'pendiente'
    ? solicitudes.filter((s) => s.estado === 'pendiente')
    : solicitudes;

  async function resolver(solicitud, nuevoEstado) {
    setProcesando(solicitud.id);
    try {
      await updateDoc(doc(db, 'solicitudes', solicitud.id), {
        estado: nuevoEstado,
        resueltoPor: auth.currentUser?.email || '',
        resueltoEn: new Date(),
      });
      await avisarSolicitudResuelta({
        email: solicitud.email,
        nombre: solicitud.nombre,
        tipo: solicitud.tipo,
        fechaInicio: solicitud.fechaInicio,
        fechaFin: solicitud.fechaFin,
        estado: nuevoEstado,
      });
    } catch (err) {
      console.error(err);
      alert('No se pudo actualizar la solicitud. Probá de nuevo.');
    } finally {
      setProcesando(null);
    }
  }

  return (
    <div className="panel-secundario">
      <div className="tabs-vista" style={{ marginBottom: 16 }}>
        <button
          className={`tab-boton ${filtro === 'pendiente' ? 'tab-activa' : ''}`}
          onClick={() => setFiltro('pendiente')}
        >
          Pendientes
        </button>
        <button
          className={`tab-boton ${filtro === 'todas' ? 'tab-activa' : ''}`}
          onClick={() => setFiltro('todas')}
        >
          Todas
        </button>
      </div>

      {visibles.length === 0 && <p className="tabla-vacia">No hay solicitudes para mostrar.</p>}

      <div className="lista-solicitudes-admin">
        {visibles.map((s) => (
          <div key={s.id} className={`tarjeta-solicitud-admin estado-borde-${s.estado}`}>
            <div className="tarjeta-solicitud-cabecera">
              <strong>{s.nombre}</strong>
              <span className={`estado-solicitud estado-${s.estado}`}>
                {ETIQUETA_ESTADO[s.estado] || s.estado}
              </span>
            </div>
            <p className="tarjeta-solicitud-detalle">
              {s.tipo === 'licencia' ? 'Licencia' : 'Vacaciones'} · {s.fechaInicio} → {s.fechaFin}
            </p>
            {s.comentario && <p className="tarjeta-solicitud-comentario">"{s.comentario}"</p>}
            {s.archivoUrl && (
              <a href={s.archivoUrl} target="_blank" rel="noreferrer" className="link-certificado">
                Ver certificado adjunto ({s.archivoNombre || 'archivo'})
              </a>
            )}
            {s.estado === 'pendiente' && (
              <div className="tarjeta-solicitud-acciones">
                <button
                  className="boton-primario boton-chico"
                  disabled={procesando === s.id}
                  onClick={() => resolver(s, 'aprobada')}
                >
                  Aprobar
                </button>
                <button
                  className="boton-secundario boton-chico"
                  disabled={procesando === s.id}
                  onClick={() => resolver(s, 'rechazada')}
                >
                  Rechazar
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
