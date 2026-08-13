import JSZip from 'jszip';
import * as XLSX from 'xlsx';

function base64ABytes(base64) {
  const binario = atob(base64);
  const bytes = new Uint8Array(binario.length);
  for (let i = 0; i < binario.length; i++) bytes[i] = binario.charCodeAt(i);
  return bytes;
}

function extensionDe(tipo, nombreOriginal) {
  if (tipo === 'application/pdf') return 'pdf';
  if (tipo === 'image/jpeg') return 'jpg';
  const partes = (nombreOriginal || '').split('.');
  return partes.length > 1 ? partes.pop() : 'bin';
}

export async function exportarSolicitudesAZip(solicitudes) {
  const zip = new JSZip();

  // --- Hoja de cálculo con el listado ---
  const filas = solicitudes.map((s) => ({
    Nombre: s.nombre,
    Email: s.email,
    Tipo: s.tipo === 'licencia' ? 'Licencia' : 'Vacaciones',
    'Fecha inicio': s.fechaInicio,
    'Fecha fin': s.fechaFin,
    Estado: s.estado,
    'Clases afectadas': Array.isArray(s.clasesAfectadas) && s.clasesAfectadas.length > 0
      ? s.clasesAfectadas.map((c) => `${c.diaTexto} ${c.horaInicio}-${c.horaFin}`).join(' / ')
      : 'Todo el día',
    Comentario: s.comentario || '',
    'Motivo de rechazo': s.motivoRechazo || '',
    'Tiene certificado': s.archivoBase64 ? 'Sí' : 'No',
  }));
  const hoja = XLSX.utils.json_to_sheet(filas);
  const libro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(libro, hoja, 'Solicitudes');
  const excelArrayBuffer = XLSX.write(libro, { type: 'array', bookType: 'xlsx' });
  zip.file('solicitudes.xlsx', excelArrayBuffer);

  // --- Certificados adjuntos, uno por archivo ---
  const carpetaCertificados = zip.folder('certificados');
  const nombresUsados = new Map();
  solicitudes.forEach((s) => {
    if (!s.archivoBase64) return;
    const base = `${(s.nombre || s.email || 'sin-nombre').replace(/[^a-zA-Z0-9]+/g, '_')}_${s.fechaInicio || ''}`;
    const usos = nombresUsados.get(base) || 0;
    nombresUsados.set(base, usos + 1);
    const sufijo = usos > 0 ? `_${usos}` : '';
    const nombreArchivo = `${base}${sufijo}.${extensionDe(s.archivoTipo, s.archivoNombre)}`;
    carpetaCertificados.file(nombreArchivo, base64ABytes(s.archivoBase64));
  });

  const blob = await zip.generateAsync({ type: 'blob' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `solicitudes_${new Date().toISOString().slice(0, 10)}.zip`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
