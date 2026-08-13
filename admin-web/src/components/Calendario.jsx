import { useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../firebase';
import { colorDeInstructora } from '../colorInstructora.js';

const DIAS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const DIAS_CORTO = ['D', 'L', 'M', 'M', 'J', 'V', 'S'];
const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

function mismoDia(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export default function Calendario() {
  const [horarios, setHorarios] = useState([]);
  const [vista, setVista] = useState('dia'); // 'dia' | 'mes'
  const [fecha, setFecha] = useState(new Date());

  useEffect(() => {
    const q = query(collection(db, 'horarios'), where('activo', '==', true));
    const unsub = onSnapshot(q, (snap) => {
      setHorarios(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    return unsub;
  }, []);

  const instructoras = useMemo(() => {
    const mapa = new Map();
    horarios.forEach((h) => { if (h.email && !mapa.has(h.email)) mapa.set(h.email, h.nombre); });
    return [...mapa.entries()].map(([email, nombre]) => ({ email, nombre }));
  }, [horarios]);

  const horariosDelDia = (d) => {
    const diaSemana = d.getDay();
    return horarios
      .filter((h) => h.diaSemana === diaSemana)
      .sort((a, b) => a.horaInicio.localeCompare(b.horaInicio));
  };

  function cambiarDia(delta) {
    const nueva = new Date(fecha);
    nueva.setDate(nueva.getDate() + delta);
    setFecha(nueva);
  }

  function cambiarMes(delta) {
    const nueva = new Date(fecha);
    nueva.setMonth(nueva.getMonth() + delta);
    setFecha(nueva);
  }

  // --- Grilla del mes (empieza domingo) ---
  const celdasMes = useMemo(() => {
    const primero = new Date(fecha.getFullYear(), fecha.getMonth(), 1);
    const ultimo = new Date(fecha.getFullYear(), fecha.getMonth() + 1, 0);
    const celdas = [];
    for (let i = 0; i < primero.getDay(); i++) celdas.push(null);
    for (let dia = 1; dia <= ultimo.getDate(); dia++) {
      celdas.push(new Date(fecha.getFullYear(), fecha.getMonth(), dia));
    }
    return celdas;
  }, [fecha]);

  const hoy = new Date();

  return (
    <div className="panel-secundario">
      <div className="tabs-vista" style={{ marginBottom: 16 }}>
        <button className={`tab-boton ${vista === 'dia' ? 'tab-activa' : ''}`} onClick={() => setVista('dia')}>Día</button>
        <button className={`tab-boton ${vista === 'mes' ? 'tab-activa' : ''}`} onClick={() => setVista('mes')}>Mes</button>
      </div>

      {instructoras.length > 0 && (
        <div className="leyenda-instructoras">
          {instructoras.map((i) => (
            <span key={i.email} className="leyenda-item">
              <span className="leyenda-punto" style={{ background: colorDeInstructora(i.email) }} />
              {i.nombre}
            </span>
          ))}
        </div>
      )}

      {vista === 'dia' && (
        <div>
          <div className="nav-calendario">
            <button className="boton-texto-chico" onClick={() => cambiarDia(-1)}>← Anterior</button>
            <strong>{DIAS[fecha.getDay()]} {fecha.getDate()} de {MESES[fecha.getMonth()]}</strong>
            <button className="boton-texto-chico" onClick={() => cambiarDia(1)}>Siguiente →</button>
          </div>
          <button className="boton-texto-chico" onClick={() => setFecha(new Date())} style={{ marginBottom: 12 }}>
            Ir a hoy
          </button>

          <div className="agenda-dia">
            {horariosDelDia(fecha).length === 0 && <p className="tabla-vacia">Sin clases este día.</p>}
            {horariosDelDia(fecha).map((h) => (
              <div key={h.id} className="agenda-item" style={{ borderLeftColor: colorDeInstructora(h.email) }}>
                <span className="agenda-hora">{h.horaInicio} – {h.horaFin}</span>
                <span className="agenda-detalle">
                  <strong>{h.nombre}</strong> · {h.tipoClase}{h.aula ? ` · ${h.aula}` : ''}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {vista === 'mes' && (
        <div>
          <div className="nav-calendario">
            <button className="boton-texto-chico" onClick={() => cambiarMes(-1)}>← Anterior</button>
            <strong>{MESES[fecha.getMonth()]} {fecha.getFullYear()}</strong>
            <button className="boton-texto-chico" onClick={() => cambiarMes(1)}>Siguiente →</button>
          </div>

          <div className="grilla-mes">
            {DIAS_CORTO.map((d, i) => <div key={i} className="grilla-encabezado">{d}</div>)}
            {celdasMes.map((d, i) => {
              if (!d) return <div key={i} className="grilla-celda grilla-celda-vacia" />;
              const clases = horariosDelDia(d);
              const emailsUnicos = [...new Set(clases.map((c) => c.email))];
              return (
                <button
                  key={i}
                  className={`grilla-celda ${mismoDia(d, hoy) ? 'grilla-celda-hoy' : ''} ${mismoDia(d, fecha) ? 'grilla-celda-elegida' : ''}`}
                  onClick={() => { setFecha(d); setVista('dia'); }}
                >
                  <span className="grilla-numero">{d.getDate()}</span>
                  <span className="grilla-puntos">
                    {emailsUnicos.slice(0, 5).map((email) => (
                      <span key={email} className="grilla-punto" style={{ background: colorDeInstructora(email) }} />
                    ))}
                  </span>
                </button>
              );
            })}
          </div>
          <p className="nota-analisis">Tocá un día para ver el detalle de las clases.</p>
        </div>
      )}
    </div>
  );
}
