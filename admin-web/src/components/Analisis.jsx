import { useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot, query, where, orderBy, Timestamp } from 'firebase/firestore';
import { db } from '../firebase';

const EMOJI_ANIMO = { feliz: '😊', triste: '😢', enojado: '😠', aburrido: '😴' };
const LABEL_ANIMO = { feliz: 'Feliz', triste: 'Triste', enojado: 'Enojado/a', aburrido: 'Aburrido/a' };

function mesActualISO() {
  const hoy = new Date();
  return `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}`;
}

function rangoDelMes(mesISO) {
  const [anio, mes] = mesISO.split('-').map(Number);
  const inicio = new Date(anio, mes - 1, 1, 0, 0, 0);
  const fin = new Date(anio, mes, 1, 0, 0, 0); // primer día del mes siguiente
  return {
    inicio,
    fin,
    inicioStr: mesISO + '-01',
    finStr: `${fin.getFullYear()}-${String(fin.getMonth() + 1).padStart(2, '0')}-01`,
  };
}

function horasEntre(entrada, salida) {
  if (!entrada?.toDate || !salida?.toDate) return 0;
  return (salida.toDate() - entrada.toDate()) / 1000 / 3600;
}

function formatearHoras(h) {
  const horas = Math.floor(h);
  const minutos = Math.round((h - horas) * 60);
  return `${horas}h ${minutos.toString().padStart(2, '0')}m`;
}

export default function Analisis() {
  const [mes, setMes] = useState(mesActualISO());
  const [subVista, setSubVista] = useState('presentes'); // presentes | horas | animo | ausencias

  const [fichajesMes, setFichajesMes] = useState([]);
  const [fichajesAbiertos, setFichajesAbiertos] = useState([]);
  const [notasAnimoMes, setNotasAnimoMes] = useState([]);
  const [licenciasMes, setLicenciasMes] = useState([]);

  const [seleccionados, setSeleccionados] = useState(null); // null = todavía no inicializado (selecciona todos)

  // --- Fichajes del mes elegido (para "Horas") ---
  useEffect(() => {
    const { inicio, fin } = rangoDelMes(mes);
    const q = query(
      collection(db, 'fichajes'),
      where('horaEntrada', '>=', Timestamp.fromDate(inicio)),
      where('horaEntrada', '<', Timestamp.fromDate(fin)),
      orderBy('horaEntrada', 'asc')
    );
    const unsub = onSnapshot(q, (snap) => {
      setFichajesMes(snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((f) => !f.eliminado));
    });
    return unsub;
  }, [mes]);

  // --- Fichajes actualmente abiertos (para "Presentes", no depende del mes) ---
  useEffect(() => {
    const q = query(collection(db, 'fichajes'), where('horaSalida', '==', null));
    const unsub = onSnapshot(q, (snap) => {
      setFichajesAbiertos(snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((f) => !f.eliminado));
    });
    return unsub;
  }, []);

  // --- Notas de ánimo del mes (para "Ánimo") ---
  useEffect(() => {
    const { inicio, fin } = rangoDelMes(mes);
    const q = query(
      collection(db, 'notasEmpleado'),
      where('tipo', '==', 'animo'),
      where('creadoEn', '>=', Timestamp.fromDate(inicio)),
      where('creadoEn', '<', Timestamp.fromDate(fin))
    );
    const unsub = onSnapshot(q, (snap) => {
      setNotasAnimoMes(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    return unsub;
  }, [mes]);

  // --- Licencias/vacaciones aprobadas que arrancan en el mes (para "Ausencias") ---
  useEffect(() => {
    const { inicioStr, finStr } = rangoDelMes(mes);
    const q = query(
      collection(db, 'solicitudes'),
      where('estado', '==', 'aprobada'),
      where('fechaInicio', '>=', inicioStr),
      where('fechaInicio', '<', finStr)
    );
    const unsub = onSnapshot(q, (snap) => {
      setLicenciasMes(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    return unsub;
  }, [mes]);

  // --- Nombre "canónico" por email ---
  // El admin a veces carga fichajes a mano con solo el nombre o solo el
  // apellido; el login real de Google siempre trae el nombre completo.
  // Para que en Análisis todo se agrupe de forma prolija por persona,
  // preferimos el nombre que vino de un login real (o de una nota/
  // solicitud, que siempre las manda el propio empleado logueado) y
  // solo usamos el que escribió el admin a mano como último recurso.
  const nombrePorEmail = useMemo(() => {
    const confiable = new Map();
    const respaldo = new Map();
    [...fichajesMes, ...fichajesAbiertos, ...notasAnimoMes, ...licenciasMes].forEach((registro) => {
      if (!registro.email || !registro.nombre) return;
      if (registro.cargadoManualmente) {
        if (!respaldo.has(registro.email)) respaldo.set(registro.email, registro.nombre);
      } else if (!confiable.has(registro.email)) {
        confiable.set(registro.email, registro.nombre);
      }
    });
    const combinado = new Map(respaldo);
    confiable.forEach((nombre, email) => combinado.set(email, nombre));
    return combinado;
  }, [fichajesMes, fichajesAbiertos, notasAnimoMes, licenciasMes]);

  function nombreDe(registro) {
    return nombrePorEmail.get(registro.email) || registro.nombre || registro.email;
  }

  // --- Lista de empleados conocidos, combinando todas las fuentes ---
  const empleados = useMemo(() => {
    const emails = new Set();
    [...fichajesMes, ...fichajesAbiertos, ...notasAnimoMes, ...licenciasMes].forEach((registro) => {
      if (registro.email) emails.add(registro.email);
    });
    return [...emails]
      .map((email) => ({ email, nombre: nombrePorEmail.get(email) || email }))
      .sort((a, b) => a.nombre.localeCompare(b.nombre));
  }, [fichajesMes, fichajesAbiertos, notasAnimoMes, licenciasMes, nombrePorEmail]);

  // La primera vez que aparecen empleados, quedan todos seleccionados por defecto.
  useEffect(() => {
    setSeleccionados((prev) => (prev === null ? new Set(empleados.map((e) => e.email)) : prev));
  }, [empleados]);

  const seleccionadosSet = seleccionados || new Set(empleados.map((e) => e.email));

  function toggleEmpleado(email) {
    setSeleccionados((prev) => {
      const actualizado = new Set(prev || empleados.map((e) => e.email));
      if (actualizado.has(email)) actualizado.delete(email);
      else actualizado.add(email);
      return actualizado;
    });
  }

  function seleccionarTodos() {
    setSeleccionados(new Set(empleados.map((e) => e.email)));
  }

  function quitarTodos() {
    setSeleccionados(new Set());
  }

  // --- Datos filtrados por selección para cada sub-pestaña ---
  const presentesFiltrados = fichajesAbiertos.filter((f) => seleccionadosSet.has(f.email));

  const horasPorEmpleado = useMemo(() => {
    const acumulado = new Map();
    fichajesMes
      .filter((f) => seleccionadosSet.has(f.email) && f.horaSalida)
      .forEach((f) => {
        const h = horasEntre(f.horaEntrada, f.horaSalida);
        const actual = acumulado.get(f.email) || { email: f.email, nombre: nombreDe(f), horas: 0, turnos: 0 };
        actual.horas += h;
        actual.turnos += 1;
        acumulado.set(f.email, actual);
      });
    return [...acumulado.values()].sort((a, b) => b.horas - a.horas);
  }, [fichajesMes, seleccionadosSet, nombrePorEmail]);

  const animosFiltrados = notasAnimoMes.filter((n) => seleccionadosSet.has(n.email));
  const conteoAnimos = useMemo(() => {
    const conteo = { feliz: 0, triste: 0, enojado: 0, aburrido: 0 };
    animosFiltrados.forEach((n) => {
      if (conteo[n.animo] !== undefined) conteo[n.animo] += 1;
    });
    return conteo;
  }, [animosFiltrados]);
  const maxAnimo = Math.max(1, ...Object.values(conteoAnimos));

  const licenciasFiltradas = licenciasMes.filter((l) => seleccionadosSet.has(l.email));

  const maxHoras = Math.max(1, ...horasPorEmpleado.map((h) => h.horas));

  const [desplegableAbierto, setDesplegableAbierto] = useState(false);

  const textoDesplegable = (() => {
    if (empleados.length === 0) return 'Sin empleados';
    if (seleccionadosSet.size === empleados.length) return 'Todos los empleados';
    if (seleccionadosSet.size === 0) return 'Ningún empleado seleccionado';
    if (seleccionadosSet.size === 1) {
      const unico = empleados.find((e) => seleccionadosSet.has(e.email));
      return unico?.nombre || '1 seleccionado';
    }
    return `${seleccionadosSet.size} empleados seleccionados`;
  })();

  return (
    <div className="panel-secundario">
      <div className="analisis-filtros">
        <label className="input-filtro-etiqueta">
          Mes
          <input type="month" value={mes} onChange={(e) => setMes(e.target.value)} />
        </label>

        <div className="desplegable-empleados">
          <button
            type="button"
            className="desplegable-boton"
            onClick={() => setDesplegableAbierto((v) => !v)}
          >
            <span>{textoDesplegable}</span>
            <span className={`desplegable-flecha ${desplegableAbierto ? 'abierta' : ''}`}>▾</span>
          </button>

          {desplegableAbierto && (
            <>
              <div className="desplegable-fondo" onClick={() => setDesplegableAbierto(false)} />
              <div className="desplegable-panel">
                <label className="check-empleado check-empleado-todos">
                  <input
                    type="checkbox"
                    checked={empleados.length > 0 && seleccionadosSet.size === empleados.length}
                    onChange={(e) => (e.target.checked ? seleccionarTodos() : quitarTodos())}
                  />
                  Todos los empleados
                </label>
                <div className="desplegable-separador" />
                {empleados.length === 0 && <p className="tabla-vacia">Sin datos todavía.</p>}
                {empleados.map((e) => (
                  <label key={e.email} className="check-empleado">
                    <input
                      type="checkbox"
                      checked={seleccionadosSet.has(e.email)}
                      onChange={() => toggleEmpleado(e.email)}
                    />
                    {e.nombre}
                  </label>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      <div className="tabs-vista" style={{ marginBottom: 16 }}>
        <button className={`tab-boton ${subVista === 'presentes' ? 'tab-activa' : ''}`} onClick={() => setSubVista('presentes')}>
          Presentes
        </button>
        <button className={`tab-boton ${subVista === 'horas' ? 'tab-activa' : ''}`} onClick={() => setSubVista('horas')}>
          Horas
        </button>
        <button className={`tab-boton ${subVista === 'animo' ? 'tab-activa' : ''}`} onClick={() => setSubVista('animo')}>
          Ánimo
        </button>
        <button className={`tab-boton ${subVista === 'ausencias' ? 'tab-activa' : ''}`} onClick={() => setSubVista('ausencias')}>
          Ausencias
        </button>
      </div>

      {subVista === 'presentes' && (
        <div className="lista-buzon">
          {presentesFiltrados.length === 0 && (
            <p className="tabla-vacia">Nadie fichado ahora mismo (entre los seleccionados).</p>
          )}
          {presentesFiltrados.map((f) => (
            <div key={f.id} className="tarjeta-buzon">
              <strong>{nombreDe(f)}</strong>
              <p className="tarjeta-buzon-texto">
                Entró a las{' '}
                {f.horaEntrada?.toDate?.().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}
              </p>
            </div>
          ))}
        </div>
      )}

      {subVista === 'horas' && (
        <div>
          {horasPorEmpleado.length === 0 ? (
            <p className="tabla-vacia">Sin turnos cerrados este mes (entre los seleccionados).</p>
          ) : (
            <div className="grafico-barras-empleados">
              {horasPorEmpleado.map((h) => (
                <div key={h.email} className="columna-barra-empleado">
                  <span className="columna-barra-valor">{formatearHoras(h.horas)}</span>
                  <div className="columna-barra-pista">
                    <div
                      className="columna-barra-relleno"
                      style={{ height: `${(h.horas / maxHoras) * 100}%` }}
                    />
                  </div>
                  <span className="columna-barra-nombre">{h.nombre}</span>
                </div>
              ))}
            </div>
          )}

          <div className="tabla-contenedor" style={{ marginTop: 20 }}>
            <table className="tabla-fichajes">
              <thead>
                <tr><th>Nombre</th><th>Turnos cerrados</th><th>Horas totales</th></tr>
              </thead>
              <tbody>
                {horasPorEmpleado.map((h) => (
                  <tr key={h.email}>
                    <td>{h.nombre}</td>
                    <td>{h.turnos}</td>
                    <td>{formatearHoras(h.horas)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="nota-analisis">No incluye turnos todavía en curso.</p>
        </div>
      )}

      {subVista === 'animo' && (
        <div>
          <div className="barras-animo">
            {Object.entries(conteoAnimos).map(([tipo, cantidad]) => (
              <div key={tipo} className="fila-barra-animo">
                <span className="barra-animo-etiqueta">{EMOJI_ANIMO[tipo]} {LABEL_ANIMO[tipo]}</span>
                <div className="barra-animo-fondo">
                  <div className="barra-animo-relleno" style={{ width: `${(cantidad / maxAnimo) * 100}%` }} />
                </div>
                <span className="barra-animo-numero">{cantidad}</span>
              </div>
            ))}
          </div>
          <p className="nota-analisis">{animosFiltrados.length} registros de ánimo este mes (entre los seleccionados).</p>
        </div>
      )}

      {subVista === 'ausencias' && (
        <div className="lista-buzon">
          {licenciasFiltradas.length === 0 && (
            <p className="tabla-vacia">
              Sin licencias ni vacaciones aprobadas que arranquen este mes (entre los seleccionados).
            </p>
          )}
          {licenciasFiltradas.map((l) => (
            <div key={l.id} className="tarjeta-buzon">
              <strong>{nombreDe(l)}</strong>
              <p className="tarjeta-buzon-texto">
                {l.tipo === 'licencia' ? 'Licencia' : 'Vacaciones'} · {l.fechaInicio} → {l.fechaFin}
              </p>
            </div>
          ))}
          <p className="nota-analisis">Se muestran las que empiezan dentro del mes elegido.</p>
        </div>
      )}
    </div>
  );
}
