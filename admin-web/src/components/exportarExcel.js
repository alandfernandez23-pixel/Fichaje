import * as XLSX from 'xlsx';

/**
 * Genera y descarga un archivo .xlsx con los fichajes dados,
 * listo para usar en las liquidaciones.
 */
export function exportarFichajesAExcel(fichajes, nombreArchivo = 'fichajes') {
  const filas = fichajes.map((f) => ({
    Nombre: f.nombre,
    Email: f.email,
    'Fecha entrada': f.horaEntrada ? formatFecha(f.horaEntrada) : '',
    'Hora entrada': f.horaEntrada ? formatHora(f.horaEntrada) : '',
    'Fecha salida': f.horaSalida ? formatFecha(f.horaSalida) : '',
    'Hora salida': f.horaSalida ? formatHora(f.horaSalida) : '',
    'Horas trabajadas': f.horaEntrada && f.horaSalida
      ? calcularHoras(f.horaEntrada, f.horaSalida)
      : '',
  }));

  const hoja = XLSX.utils.json_to_sheet(filas);
  hoja['!cols'] = [
    { wch: 22 }, { wch: 28 }, { wch: 13 }, { wch: 12 },
    { wch: 13 }, { wch: 12 }, { wch: 16 },
  ];

  const libro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(libro, hoja, 'Fichajes');

  const fecha = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(libro, `${nombreArchivo}-${fecha}.xlsx`);
}

function formatFecha(timestamp) {
  const d = timestamp.toDate();
  return d.toLocaleDateString('es-AR');
}

function formatHora(timestamp) {
  const d = timestamp.toDate();
  return d.toLocaleTimeString('es-AR', { hour12: false });
}

function calcularHoras(entrada, salida) {
  const ms = salida.toDate() - entrada.toDate();
  const horas = Math.floor(ms / 3600000);
  const minutos = Math.floor((ms % 3600000) / 60000);
  return `${horas}h ${minutos}m`;
}
