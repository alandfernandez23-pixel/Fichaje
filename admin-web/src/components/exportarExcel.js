import * as XLSX from 'xlsx';

/**
 * Genera y descarga un archivo .xlsx con los fichajes dados,
 * listo para usar en las liquidaciones.
 */
export function exportarFichajesAExcel(fichajes, nombreArchivo = 'fichajes') {
  const filas = fichajes.map((f) => ({
    Fecha: f.horaEntrada ? formatFecha(f.horaEntrada) : '',
    Nombre: f.nombre,
    Mail: f.email,
    'Hora de entrada': f.horaEntrada ? formatHora(f.horaEntrada) : '',
    'Hora de salida': f.horaSalida ? formatHora(f.horaSalida) : '',
  }));

  const hoja = XLSX.utils.json_to_sheet(filas);
  hoja['!cols'] = [
    { wch: 13 }, { wch: 22 }, { wch: 28 }, { wch: 14 }, { wch: 14 },
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


