import * as XLSX from 'xlsx';

/**
 * Genera y descarga un archivo .xlsx con los fichajes dados (ya filtrados
 * por nombre/día/mes desde el panel), listo para usar en las liquidaciones.
 *
 * Incluye dos hojas:
 * - "Fichajes": el detalle de cada entrada/salida, con las horas trabajadas.
 * - "Resumen por día": las horas sumadas por persona y por día, más un
 *   total general al final. Como recibe la lista ya filtrada, si filtrás
 *   por nombre y/o mes en el panel, el resumen y el total se recalculan
 *   solos sobre justo esos fichajes.
 */
export function exportarFichajesAExcel(fichajes, ahora = new Date(), nombreArchivo = 'fichajes') {
  const filas = fichajes.map((f) => {
    const entrada = f.horaEntrada ? aFecha(f.horaEntrada) : null;
    const salida = f.horaSalida ? aFecha(f.horaSalida) : null;
    const enCurso = entrada && !salida;
    const ms = entrada ? calcularDuracionMs(entrada, salida || ahora) : 0;

    return {
      Fecha: entrada ? formatFecha(entrada) : '',
      Nombre: f.nombre,
      Mail: f.email,
      'Hora de entrada': entrada ? formatHora(entrada) : '',
      'Hora de salida': salida ? formatHora(salida) : '',
      'Horas trabajadas': entrada ? formatDuracion(ms) : '',
      Estado: enCurso ? 'En curso' : entrada ? 'Cerrado' : '',
    };
  });

  const hojaFichajes = XLSX.utils.json_to_sheet(filas);
  hojaFichajes['!cols'] = [
    { wch: 13 }, { wch: 22 }, { wch: 28 }, { wch: 14 }, { wch: 14 }, { wch: 16 }, { wch: 12 },
  ];

  const resumen = calcularResumenPorDia(fichajes, ahora);
  const hojaResumen = XLSX.utils.json_to_sheet(resumen.filas);
  hojaResumen['!cols'] = [{ wch: 13 }, { wch: 24 }, { wch: 28 }, { wch: 16 }];

  const libro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(libro, hojaFichajes, 'Fichajes');
  XLSX.utils.book_append_sheet(libro, hojaResumen, 'Resumen por día');

  const fechaArchivo = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(libro, `${nombreArchivo}-${fechaArchivo}.xlsx`);
}

/**
 * Agrupa los fichajes por día + persona, sumando sus horas trabajadas,
 * y agrega una fila de total general al final.
 */
function calcularResumenPorDia(fichajes, ahora) {
  const grupos = new Map(); // clave: "fecha|email" -> { fecha, nombre, email, ms }

  fichajes.forEach((f) => {
    if (!f.horaEntrada) return;
    const entrada = aFecha(f.horaEntrada);
    const salida = f.horaSalida ? aFecha(f.horaSalida) : null;
    const ms = calcularDuracionMs(entrada, salida || ahora);
    const fechaTexto = formatFecha(entrada);
    const clave = `${fechaTexto}|${f.email || ''}`;

    if (!grupos.has(clave)) {
      grupos.set(clave, {
        fecha: entrada,
        fechaTexto,
        nombre: f.nombre || '',
        email: f.email || '',
        ms: 0,
      });
    }
    grupos.get(clave).ms += ms;
  });

  const ordenados = Array.from(grupos.values()).sort((a, b) => {
    const porFecha = a.fecha - b.fecha;
    if (porFecha !== 0) return porFecha;
    return a.nombre.localeCompare(b.nombre);
  });

  const filas = ordenados.map((g) => ({
    Fecha: g.fechaTexto,
    Nombre: g.nombre,
    Mail: g.email,
    'Horas trabajadas': formatDuracion(g.ms),
  }));

  const totalMs = ordenados.reduce((acc, g) => acc + g.ms, 0);
  filas.push({
    Fecha: '',
    Nombre: '',
    Mail: 'TOTAL GENERAL',
    'Horas trabajadas': formatDuracion(totalMs),
  });

  return { filas, totalMs };
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

function aFecha(timestamp) {
  return timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
}

function formatFecha(d) {
  return d.toLocaleDateString('es-AR');
}

function formatHora(d) {
  return d.toLocaleTimeString('es-AR', { hour12: false });
}
