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
