import { useEffect, useState } from 'react';
import { collection, onSnapshot, orderBy, query, updateDoc, doc } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { avisarSolicitudResuelta } from '../emailjs.js';
import { exportarSolicitudesAZip } from './exportarSolicitudesZip.js';

const ETIQUETA_ESTADO = { pendiente: 'Pendiente', aprobada: 'Aprobada', rechazada: 'Rechazada', cancelada: 'Cancelada' };

function abrirCertificado(solicitud) {
  try {
    const binario = atob(solicitud.archivoBase64);
    const bytes = new Uint8Array(binario.length);
    for (let i = 0; i < binario.length; i++) bytes[i] = binario.charCodeAt(i);
    const blob = new Blob([bytes], { type: solicitud.archivoTipo || 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank');
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  } catch (err) {
    console.error(err);
    alert('No se pudo abrir el certificado.');
  }
}

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
    let motivoRechazo = '';
    if (nuevoEstado === 'rechazada') {
      motivoRechazo = window.prompt('Motivo del rechazo (el empleado lo va a ver):', '') || '';
      if (!motivoRechazo.trim()) {
        alert('Necesitás escribir un motivo para rechazar la solicitud.');
        return;
      }
    }
    setProcesando(solicitud.id);
    try {
      await updateDoc(doc(db, 'solicitudes', solicitud.id), {
        estado: nuevoEstado,
        resueltoPor: auth.currentUser?.email || '',
        resueltoEn: new Date(),
        ...(nuevoEstado === 'rechazada' ? { motivoRechazo } : {}),
      });
      await avisarSolicitudResuelta({
        email: solicitud.email,
        nombre: solicitud.nombre,
        tipo: solicitud.tipo,
        fechaInicio: solicitud.fechaInicio,
        fechaFin: solicitud.fechaFin,
        estado: nuevoEstado,
        motivoRechazo,
      });
    } catch (err) {
      console.error(err);
      alert('No se pudo actualizar la solicitud. Probá de nuevo.');
    } finally {
      setProcesando(null);
    }
  }

  async function exportar() {
    try {
      await exportarSolicitudesAZip(visibles);
    } catch (err) {
      console.error(err);
      alert('No se pudo generar el archivo para exportar.');
    }
  }

  return (
    <div className="panel-secundario">
      <div className="tabs-vista" style={{ marginBottom: 16, justifyContent: 'space-between' }}>
        <div style={{ display: 'flex' }}>
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
        <button className="boton-secundario boton-chico" onClick={exportar} disabled={visibles.length === 0}>
          Exportar (.zip)
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
            {Array.isArray(s.clasesAfectadas) && s.clasesAfectadas.length > 0 && (
              <p className="tarjeta-solicitud-detalle">
                Clases afectadas: {s.clasesAfectadas.map((c) => `${c.diaTexto} ${c.horaInicio}-${c.horaFin}`).join(', ')}
              </p>
            )}
            {s.comentario && <p className="tarjeta-solicitud-comentario">"{s.comentario}"</p>}
            {s.estado === 'rechazada' && s.motivoRechazo && (
              <p className="tarjeta-solicitud-comentario">Motivo del rechazo: "{s.motivoRechazo}"</p>
            )}
            {s.archivoBase64 && (
              <button
                type="button"
                className="link-certificado link-certificado-boton"
                onClick={() => abrirCertificado(s)}
              >
                Ver certificado adjunto ({s.archivoNombre || 'archivo'})
              </button>
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
