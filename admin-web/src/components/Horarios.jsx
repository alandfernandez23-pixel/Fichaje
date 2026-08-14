import { useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot, orderBy, query, addDoc, updateDoc, deleteDoc, doc, writeBatch } from 'firebase/firestore';
import * as XLSX from 'xlsx';
import { db, auth } from '../firebase';
import { colorDeInstructora } from '../colorInstructora.js';

const DIAS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

const vacio = { nombre: '', email: '', diaSemana: 1, horaInicio: '09:00', horaFin: '10:00', tipoClase: '', aula: '' };

// --- Helpers de fecha (formato "YYYY-MM-DD", sin líos de huso horario) ---
function fechaAString(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const día = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${día}`;
}
function stringAFecha(s) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export default function Horarios() {
  const [horarios, setHorarios] = useState([]);
  const [form, setForm] = useState(vacio);
  const [editandoId, setEditandoId] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const [diaFiltro, setDiaFiltro] = useState('todos');
  const [modoIntercambio, setModoIntercambio] = useState(false);
  const [seleccionIntercambio, setSeleccionIntercambio] = useState([]);
  const [avisoNombreAuto, setAvisoNombreAuto] = useState(false);

  const [pestaña, setPestaña] = useState('individual'); // 'individual' | 'patron' | 'excel'

  useEffect(() => {
    const q = query(collection(db, 'horarios'), orderBy('horaInicio', 'asc'));
    const unsub = onSnapshot(q, (snap) => {
      setHorarios(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    return unsub;
  }, []);

  // --- Nombre "canónico" por email, y lista de tipos de clase ya usados ---
  const nombrePorEmail = useMemo(() => {
    const mapa = new Map();
    horarios.forEach((h) => { if (h.email && h.nombre && !mapa.has(h.email)) mapa.set(h.email, h.nombre); });
    return mapa;
  }, [horarios]);

  const tiposDeClaseUsados = useMemo(() => {
    const set = new Set();
    horarios.forEach((h) => { if (h.tipoClase) set.add(h.tipoClase); });
    return [...set].sort();
  }, [horarios]);

  const emailsConocidos = useMemo(() => [...nombrePorEmail.keys()], [nombrePorEmail]);

  const emailPorNombre = useMemo(() => {
    const mapa = new Map();
    horarios.forEach((h) => {
      if (h.nombre && h.email && !mapa.has(h.nombre.trim().toLowerCase())) {
        mapa.set(h.nombre.trim().toLowerCase(), h.email);
      }
    });
    return mapa;
  }, [horarios]);

  const nombresConocidos = useMemo(() => [...new Set(horarios.map((h) => h.nombre).filter(Boolean))], [horarios]);

  function actualizarNombre(valor) {
    const emailExistente = emailPorNombre.get(valor.trim().toLowerCase());
    if (emailExistente && !form.email) {
      setForm((f) => ({ ...f, nombre: valor, email: emailExistente }));
      setAvisoNombreAuto(true);
    } else {
      setForm((f) => ({ ...f, nombre: valor }));
    }
  }

  function actualizarEmail(valor) {
    const email = valor.trim().toLowerCase();
    const nombreExistente = nombrePorEmail.get(email);
    if (nombreExistente) {
      setForm((f) => ({ ...f, email: valor, nombre: nombreExistente }));
      setAvisoNombreAuto(true);
    } else {
      setForm((f) => ({ ...f, email: valor }));
      setAvisoNombreAuto(false);
    }
  }

  async function guardar(e) {
    e.preventDefault();
    if (!form.nombre.trim() || !form.email.trim()) return;
    setGuardando(true);
    try {
      const datos = {
        ...form,
        email: form.email.trim().toLowerCase(),
        diaSemana: Number(form.diaSemana),
        tipo: 'semanal',
        frecuenciaSemanas: 1,
        fechaBase: null,
      };
      if (editandoId) {
        await updateDoc(doc(db, 'horarios', editandoId), datos);
      } else {
        await addDoc(collection(db, 'horarios'), {
          ...datos,
          activo: true,
          creadoPor: auth.currentUser?.email || '',
        });
      }
      setForm({ ...vacio, nombre: form.nombre, email: form.email });
      setEditandoId(null);
      setAvisoNombreAuto(false);
    } catch (err) {
      console.error(err);
      alert('No se pudo guardar el horario.');
    } finally {
      setGuardando(false);
    }
  }

  function cargarParaEditar(h) {
    setEditandoId(h.id);
    setForm({
      nombre: h.nombre, email: h.email, diaSemana: h.diaSemana,
      horaInicio: h.horaInicio, horaFin: h.horaFin, tipoClase: h.tipoClase, aula: h.aula || '',
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
    setAvisoNombreAuto(false);
    setPestaña('individual');
  }

  function cancelarEdicion() {
    setEditandoId(null);
    setForm(vacio);
    setAvisoNombreAuto(false);
  }

  async function quitar(h) {
    if (!window.confirm(`¿Quitar el horario de ${h.nombre} (${DIAS[h.diaSemana]} ${h.horaInicio}-${h.horaFin})?`)) return;
    await deleteDoc(doc(db, 'horarios', h.id));
  }

  async function toggleActivo(h) {
    await updateDoc(doc(db, 'horarios', h.id), { activo: !h.activo });
  }

  function toggleModoIntercambio() {
    setModoIntercambio((v) => !v);
    setSeleccionIntercambio([]);
  }

  function elegirParaIntercambio(h) {
    setSeleccionIntercambio((prev) => {
      if (prev.some((x) => x.id === h.id)) return prev.filter((x) => x.id !== h.id);
      if (prev.length >= 2) return [prev[1], h];
      return [...prev, h];
    });
  }

  async function confirmarIntercambio() {
    if (seleccionIntercambio.length !== 2) return;
    const [a, b] = seleccionIntercambio;
    const ok = window.confirm(
      `¿Intercambiar quién dicta este horario?\n\n${DIAS[a.diaSemana]} ${a.horaInicio}-${a.horaFin}: ${a.nombre} → ${b.nombre}\n${DIAS[b.diaSemana]} ${b.horaInicio}-${b.horaFin}: ${b.nombre} → ${a.nombre}`
    );
    if (!ok) return;
    const batch = writeBatch(db);
    batch.update(doc(db, 'horarios', a.id), { nombre: b.nombre, email: b.email });
    batch.update(doc(db, 'horarios', b.id), { nombre: a.nombre, email: a.email });
    await batch.commit();
    setSeleccionIntercambio([]);
    setModoIntercambio(false);
  }

  const visibles = diaFiltro === 'todos' ? horarios : horarios.filter((h) => h.diaSemana === Number(diaFiltro) && h.tipo !== 'fechas');

  return (
    <div className="panel-secundario">
      <div className="tabs-vista" style={{ marginBottom: 16 }}>
        <button className={`tab-boton ${pestaña === 'individual' ? 'tab-activa' : ''}`} onClick={() => setPestaña('individual')}>
          Carga individual
        </button>
        <button className={`tab-boton ${pestaña === 'patron' ? 'tab-activa' : ''}`} onClick={() => setPestaña('patron')}>
          Por patrón / rango
        </button>
        <button className={`tab-boton ${pestaña === 'excel' ? 'tab-activa' : ''}`} onClick={() => setPestaña('excel')}>
          Excel (carga masiva)
        </button>
      </div>

      {pestaña === 'individual' && (
        <form onSubmit={guardar} className="form-horario">
          {editandoId && <p className="aviso-editando">Editando un horario existente</p>}
          <div className="form-horario-fila">
            <input
              placeholder="Nombre del profe"
              list="nombres-conocidos"
              value={form.nombre}
              onChange={(e) => actualizarNombre(e.target.value)}
              required
            />
            <datalist id="nombres-conocidos">
              {nombresConocidos.map((n) => <option key={n} value={n} />)}
            </datalist>
            <input
              placeholder="Email (el mismo con el que se loguea)"
              type="email"
              list="emails-conocidos"
              value={form.email}
              onChange={(e) => actualizarEmail(e.target.value)}
              required
            />
            <datalist id="emails-conocidos">
              {emailsConocidos.map((email) => <option key={email} value={email} />)}
            </datalist>
          </div>
          {avisoNombreAuto && (
            <p className="aviso-editando aviso-nombre-auto">
              Se completó solo, porque ya existe un horario con ese mismo nombre o email. Si algo está mal escrito, corregilo acá.
            </p>
          )}
          <div className="form-horario-fila">
            <select value={form.diaSemana} onChange={(e) => setForm({ ...form, diaSemana: e.target.value })}>
              {DIAS.map((d, i) => (
                <option key={d} value={i}>{d}</option>
              ))}
            </select>
            <input
              type="time"
              value={form.horaInicio}
              onChange={(e) => setForm({ ...form, horaInicio: e.target.value })}
              required
            />
            <span>a</span>
            <input
              type="time"
              value={form.horaFin}
              onChange={(e) => setForm({ ...form, horaFin: e.target.value })}
              required
            />
          </div>
          <div className="form-horario-fila">
            <input
              placeholder="Tipo de clase (ej: Eintegral, Pclasico, Localizada, En cama...)"
              list="tipos-de-clase"
              value={form.tipoClase}
              onChange={(e) => setForm({ ...form, tipoClase: e.target.value })}
              required
            />
            <datalist id="tipos-de-clase">
              {tiposDeClaseUsados.map((t) => <option key={t} value={t} />)}
            </datalist>
            <input
              placeholder="Aula (opcional)"
              value={form.aula}
              onChange={(e) => setForm({ ...form, aula: e.target.value })}
            />
            <button className="boton-primario boton-chico" disabled={guardando}>
              {editandoId ? 'Guardar cambios' : 'Agregar'}
            </button>
            {editandoId && (
              <button type="button" className="boton-secundario boton-chico" onClick={cancelarEdicion}>
                Cancelar
              </button>
            )}
          </div>
        </form>
      )}

      {pestaña === 'patron' && (
        <CargaPorPatron
          nombresConocidos={nombresConocidos}
          emailsConocidos={emailsConocidos}
          nombrePorEmail={nombrePorEmail}
          emailPorNombre={emailPorNombre}
          tiposDeClaseUsados={tiposDeClaseUsados}
        />
      )}

      {pestaña === 'excel' && <CargaPorExcel />}

      <div className="tabs-vista" style={{ marginTop: 20, marginBottom: 12 }}>
        <button className={`tab-boton ${diaFiltro === 'todos' ? 'tab-activa' : ''}`} onClick={() => setDiaFiltro('todos')}>
          Todos
        </button>
        {DIAS.map((d, i) => (
          <button
            key={d}
            className={`tab-boton ${diaFiltro === String(i) ? 'tab-activa' : ''}`}
            onClick={() => setDiaFiltro(String(i))}
          >
            {d.slice(0, 3)}
          </button>
        ))}
      </div>

      <div className="fila-modo-intercambio">
        <button className="boton-texto-chico" onClick={toggleModoIntercambio}>
          {modoIntercambio ? 'Cancelar intercambio' : '🔁 Intercambiar dos horarios'}
        </button>
        {modoIntercambio && (
          <span className="nota-analisis" style={{ marginTop: 0 }}>
            Elegí 2 tarjetas ({seleccionIntercambio.length}/2 seleccionadas)
            {seleccionIntercambio.length === 2 && (
              <button className="boton-primario boton-chico" style={{ marginLeft: 10 }} onClick={confirmarIntercambio}>
                Confirmar intercambio
              </button>
            )}
          </span>
        )}
      </div>

      {visibles.length === 0 && <p className="tabla-vacia">Sin horarios cargados todavía.</p>}

      <div className="lista-buzon">
        {visibles.map((h) => {
          const seleccionado = seleccionIntercambio.some((x) => x.id === h.id);
          const etiquetaFrecuencia =
            h.tipo === 'fechas'
              ? `${(h.fechas || []).length} fecha(s) específica(s)`
              : (h.frecuenciaSemanas || 1) > 1
              ? `Cada ${h.frecuenciaSemanas} semanas`
              : null;
          return (
            <div
              key={h.id}
              className={`tarjeta-buzon tarjeta-horario ${h.activo === false ? 'tarjeta-horario-inactiva' : ''} ${seleccionado ? 'tarjeta-horario-seleccionada' : ''}`}
              style={{ borderLeftColor: colorDeInstructora(h.email) }}
              onClick={modoIntercambio ? () => elegirParaIntercambio(h) : undefined}
            >
              <div className="tarjeta-solicitud-cabecera">
                <strong>{h.nombre}</strong>
                <span className="tarjeta-buzon-fecha">{h.tipo === 'fechas' ? 'Fechas específicas' : DIAS[h.diaSemana]}</span>
              </div>
              <p className="tarjeta-buzon-texto">
                {h.horaInicio} – {h.horaFin} · {h.tipoClase}{h.aula ? ` · ${h.aula}` : ''} · {h.email}
                {etiquetaFrecuencia && <> · <em>{etiquetaFrecuencia}</em></>}
              </p>
              {!modoIntercambio && (
                <div className="tarjeta-solicitud-acciones">
                  <button className="boton-secundario boton-chico" onClick={() => cargarParaEditar(h)}>
                    Editar
                  </button>
                  <button className="boton-secundario boton-chico" onClick={() => toggleActivo(h)}>
                    {h.activo === false ? 'Reactivar' : 'Pausar'}
                  </button>
                  <button className="boton-secundario boton-chico" onClick={() => quitar(h)}>
                    Quitar
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
      <p className="nota-analisis">
        "Pausar" deja el horario guardado pero no manda avisos ni cuenta para las alertas. "Editar" cambia día/hora/profe de ese mismo horario. "Intercambiar" cambia solo QUIÉN dicta dos horarios, sin tocar día/hora/aula.
      </p>
    </div>
  );
}

// ============================================================
// Carga por patrón: elegís día(s) + frecuencia (semanal, quincenal,
// cada N días) dentro de un rango de fechas, o marcás fechas sueltas
// a mano para patrones irregulares/aleatorios.
// ============================================================
function CargaPorPatron({ nombresConocidos, emailsConocidos, nombrePorEmail, emailPorNombre, tiposDeClaseUsados }) {
  const [nombre, setNombre] = useState('');
  const [email, setEmail] = useState('');
  const [diaSemana, setDiaSemana] = useState(1);
  const [horaInicio, setHoraInicio] = useState('09:00');
  const [horaFin, setHoraFin] = useState('10:00');
  const [tipoClase, setTipoClase] = useState('');
  const [aula, setAula] = useState('');

  const [modo, setModo] = useState('semanal'); // 'semanal' | 'quincenal' | 'cada-n-dias' | 'fechas-sueltas'
  const [cadaNDias, setCadaNDias] = useState(3);
  const [fechaInicioRango, setFechaInicioRango] = useState('');
  const [fechaFinRango, setFechaFinRango] = useState('');
  const [fechasSueltas, setFechasSueltas] = useState(''); // texto separado por comas
  const [guardando, setGuardando] = useState(false);
  const [aviso, setAviso] = useState('');

  function elegirNombre(valor) {
    const e = nombrePorEmail.get(valor.trim().toLowerCase());
    setNombre(valor);
    if (e && !email) setEmail(e);
  }
  function elegirEmail(valor) {
    const n = emailPorNombre.get(valor.trim().toLowerCase());
    setEmail(valor);
    if (n) setNombre(n);
  }

  async function guardarPatron(e) {
    e.preventDefault();
    setAviso('');
    if (!nombre.trim() || !email.trim() || !tipoClase.trim()) {
      setAviso('Completá nombre, email y tipo de clase.');
      return;
    }

    setGuardando(true);
    try {
      const base = {
        nombre: nombre.trim(),
        email: email.trim().toLowerCase(),
        horaInicio,
        horaFin,
        tipoClase: tipoClase.trim(),
        aula: aula.trim(),
        activo: true,
        creadoPor: auth.currentUser?.email || '',
      };

      if (modo === 'semanal' || modo === 'quincenal') {
        await addDoc(collection(db, 'horarios'), {
          ...base,
          tipo: 'semanal',
          diaSemana: Number(diaSemana),
          frecuenciaSemanas: modo === 'quincenal' ? 2 : 1,
          fechaBase: fechaInicioRango || null,
        });
        setAviso('Horario recurrente creado.');
      } else if (modo === 'cada-n-dias') {
        if (!fechaInicioRango || !fechaFinRango) {
          setAviso('Elegí la fecha de inicio y de fin del rango.');
          return;
        }
        const fechas = [];
        let cursor = stringAFecha(fechaInicioRango);
        const fin = stringAFecha(fechaFinRango);
        while (cursor <= fin) {
          fechas.push(fechaAString(cursor));
          cursor = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() + Number(cadaNDias));
        }
        if (fechas.length === 0) {
          setAviso('El rango no generó ninguna fecha. Revisá las fechas elegidas.');
          return;
        }
        await addDoc(collection(db, 'horarios'), {
          ...base,
          tipo: 'fechas',
          fechas,
        });
        setAviso(`Horario creado con ${fechas.length} fecha(s), cada ${cadaNDias} día(s).`);
      } else if (modo === 'fechas-sueltas') {
        const fechas = fechasSueltas
          .split(/[,\n]/)
          .map((s) => s.trim())
          .filter(Boolean);
        if (fechas.length === 0) {
          setAviso('Escribí al menos una fecha (formato AAAA-MM-DD, separadas por coma).');
          return;
        }
        const invalida = fechas.find((f) => !/^\d{4}-\d{2}-\d{2}$/.test(f));
        if (invalida) {
          setAviso(`La fecha "${invalida}" no tiene el formato AAAA-MM-DD.`);
          return;
        }
        await addDoc(collection(db, 'horarios'), {
          ...base,
          tipo: 'fechas',
          fechas,
        });
        setAviso(`Horario creado con ${fechas.length} fecha(s) sueltas.`);
      }

      setTipoClase('');
      setAula('');
      setFechasSueltas('');
    } catch (err) {
      console.error(err);
      setAviso('No se pudo guardar. Probá de nuevo.');
    } finally {
      setGuardando(false);
    }
  }

  return (
    <form onSubmit={guardarPatron} className="form-horario">
      <div className="form-horario-fila">
        <input placeholder="Nombre del profe" list="nombres-conocidos-patron" value={nombre} onChange={(e) => elegirNombre(e.target.value)} required />
        <datalist id="nombres-conocidos-patron">
          {nombresConocidos.map((n) => <option key={n} value={n} />)}
        </datalist>
        <input placeholder="Email" type="email" list="emails-conocidos-patron" value={email} onChange={(e) => elegirEmail(e.target.value)} required />
        <datalist id="emails-conocidos-patron">
          {emailsConocidos.map((e) => <option key={e} value={e} />)}
        </datalist>
      </div>

      <div className="form-horario-fila">
        <input type="time" value={horaInicio} onChange={(e) => setHoraInicio(e.target.value)} required />
        <span>a</span>
        <input type="time" value={horaFin} onChange={(e) => setHoraFin(e.target.value)} required />
        <input placeholder="Tipo de clase" list="tipos-de-clase-patron" value={tipoClase} onChange={(e) => setTipoClase(e.target.value)} required />
        <datalist id="tipos-de-clase-patron">
          {tiposDeClaseUsados.map((t) => <option key={t} value={t} />)}
        </datalist>
        <input placeholder="Aula (opcional)" value={aula} onChange={(e) => setAula(e.target.value)} />
      </div>

      <p className="etiqueta-archivo">¿Con qué frecuencia se repite?</p>
      <div className="tabs-vista" style={{ marginBottom: 12 }}>
        <button type="button" className={`tab-boton ${modo === 'semanal' ? 'tab-activa' : ''}`} onClick={() => setModo('semanal')}>Todas las semanas</button>
        <button type="button" className={`tab-boton ${modo === 'quincenal' ? 'tab-activa' : ''}`} onClick={() => setModo('quincenal')}>Quincenal</button>
        <button type="button" className={`tab-boton ${modo === 'cada-n-dias' ? 'tab-activa' : ''}`} onClick={() => setModo('cada-n-dias')}>Cada N días</button>
        <button type="button" className={`tab-boton ${modo === 'fechas-sueltas' ? 'tab-activa' : ''}`} onClick={() => setModo('fechas-sueltas')}>Fechas sueltas / aleatorio</button>
      </div>

      {(modo === 'semanal' || modo === 'quincenal') && (
        <div className="form-horario-fila">
          <select value={diaSemana} onChange={(e) => setDiaSemana(e.target.value)}>
            {DIAS.map((d, i) => <option key={d} value={i}>{d}</option>)}
          </select>
          {modo === 'quincenal' && (
            <div>
              <label>Primera fecha (para saber qué semanas cuentan)</label>
              <input type="date" className="campo-texto" value={fechaInicioRango} onChange={(e) => setFechaInicioRango(e.target.value)} required />
            </div>
          )}
        </div>
      )}

      {modo === 'cada-n-dias' && (
        <div className="form-horario-fila">
          <div>
            <label>Cada</label>
            <input type="number" min="1" className="campo-texto" style={{ width: 70 }} value={cadaNDias} onChange={(e) => setCadaNDias(e.target.value)} /> días
          </div>
          <div>
            <label>Desde</label>
            <input type="date" className="campo-texto" value={fechaInicioRango} onChange={(e) => setFechaInicioRango(e.target.value)} required />
          </div>
          <div>
            <label>Hasta</label>
            <input type="date" className="campo-texto" value={fechaFinRango} onChange={(e) => setFechaFinRango(e.target.value)} required />
          </div>
        </div>
      )}

      {modo === 'fechas-sueltas' && (
        <div>
          <p className="etiqueta-archivo">Escribí las fechas separadas por coma, formato AAAA-MM-DD (ej: 2026-08-18, 2026-08-25, 2026-09-10)</p>
          <textarea className="campo-textarea" rows={3} value={fechasSueltas} onChange={(e) => setFechasSueltas(e.target.value)} />
        </div>
      )}

      {aviso && <p className="aviso-editando">{aviso}</p>}

      <button className="boton-primario boton-chico" disabled={guardando} style={{ marginTop: 12 }}>
        Crear horario
      </button>
    </form>
  );
}

// ============================================================
// Carga por Excel: descargar plantilla y subir un archivo con
// varios horarios de una sola vez.
// ============================================================
function CargaPorExcel() {
  const [archivo, setArchivo] = useState(null);
  const [procesando, setProcesando] = useState(false);
  const [resultado, setResultado] = useState('');
  const [errores, setErrores] = useState([]);

  function descargarPlantilla() {
    const filas = [
      {
        nombre: 'Ejemplo Profe',
        email: 'profe@example.com',
        tipo: 'semanal', // 'semanal' o 'fechas'
        diaSemana: 1, // 0=Domingo … 6=Sábado (solo si tipo=semanal)
        frecuenciaSemanas: 1, // 1=todas las semanas, 2=quincenal (solo si tipo=semanal)
        fechaBase: '', // AAAA-MM-DD, opcional (solo si frecuenciaSemanas > 1)
        fechas: '', // AAAA-MM-DD separadas por coma (solo si tipo=fechas)
        horaInicio: '09:00',
        horaFin: '10:00',
        tipoClase: 'Eintegral',
        aula: '',
      },
    ];
    const hoja = XLSX.utils.json_to_sheet(filas);
    const libro = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(libro, hoja, 'Horarios');
    XLSX.writeFile(libro, 'plantilla-horarios.xlsx');
  }

  async function procesarArchivo() {
    if (!archivo) return;
    setProcesando(true);
    setResultado('');
    setErrores([]);
    try {
      const buffer = await archivo.arrayBuffer();
      const libro = XLSX.read(buffer, { type: 'array' });
      const hoja = libro.Sheets[libro.SheetNames[0]];
      const filas = XLSX.utils.sheet_to_json(hoja, { defval: '' });

      if (filas.length === 0) {
        setResultado('El archivo no tiene filas para cargar.');
        return;
      }

      const erroresLocales = [];
      const validas = [];

      filas.forEach((fila, i) => {
        const numeroFila = i + 2; // +2 porque la fila 1 es el encabezado
        const nombre = String(fila.nombre || '').trim();
        const email = String(fila.email || '').trim().toLowerCase();
        const tipo = String(fila.tipo || 'semanal').trim().toLowerCase();
        const horaInicio = String(fila.horaInicio || '').trim();
        const horaFin = String(fila.horaFin || '').trim();
        const tipoClase = String(fila.tipoClase || '').trim();
        const aula = String(fila.aula || '').trim();

        if (!nombre || !email || !horaInicio || !horaFin || !tipoClase) {
          erroresLocales.push(`Fila ${numeroFila}: faltan datos obligatorios (nombre, email, horaInicio, horaFin, tipoClase).`);
          return;
        }

        if (tipo === 'fechas') {
          const fechas = String(fila.fechas || '')
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean);
          if (fechas.length === 0) {
            erroresLocales.push(`Fila ${numeroFila}: tipo "fechas" pero no hay ninguna fecha en la columna "fechas".`);
            return;
          }
          const invalida = fechas.find((f) => !/^\d{4}-\d{2}-\d{2}$/.test(f));
          if (invalida) {
            erroresLocales.push(`Fila ${numeroFila}: la fecha "${invalida}" no tiene formato AAAA-MM-DD.`);
            return;
          }
          validas.push({ nombre, email, horaInicio, horaFin, tipoClase, aula, tipo: 'fechas', fechas, activo: true });
        } else {
          const diaSemana = Number(fila.diaSemana);
          if (Number.isNaN(diaSemana) || diaSemana < 0 || diaSemana > 6) {
            erroresLocales.push(`Fila ${numeroFila}: "diaSemana" tiene que ser un número de 0 (domingo) a 6 (sábado).`);
            return;
          }
          const frecuenciaSemanas = Number(fila.frecuenciaSemanas) || 1;
          const fechaBase = String(fila.fechaBase || '').trim() || null;
          validas.push({ nombre, email, horaInicio, horaFin, tipoClase, aula, tipo: 'semanal', diaSemana, frecuenciaSemanas, fechaBase, activo: true });
        }
      });

      setErrores(erroresLocales);

      if (validas.length > 0) {
        const batch = writeBatch(db);
        validas.forEach((datos) => {
          const ref = doc(collection(db, 'horarios'));
          batch.set(ref, { ...datos, creadoPor: auth.currentUser?.email || '' });
        });
        await batch.commit();
        setResultado(`Se cargaron ${validas.length} horario(s).${erroresLocales.length > 0 ? ` ${erroresLocales.length} fila(s) con error, no se cargaron.` : ''}`);
      } else {
        setResultado('Ninguna fila pudo cargarse. Revisá los errores.');
      }
    } catch (err) {
      console.error(err);
      setResultado('No se pudo leer el archivo. Confirmá que sea un .xlsx válido, generado desde la plantilla.');
    } finally {
      setProcesando(false);
    }
  }

  return (
    <div className="form-horario">
      <p className="bloque-descripcion">
        1) Descargá la plantilla, completala en Excel (una fila por horario) y 2) subila acá para cargar todo de una.
        Para horarios recurrentes normales, usá tipo "semanal" con el día de semana. Para patrones irregulares
        (cada 3 días, fechas salteadas), usá tipo "fechas" y escribí las fechas separadas por coma en la columna "fechas".
      </p>
      <div className="form-horario-fila">
        <button type="button" className="boton-secundario boton-chico" onClick={descargarPlantilla}>
          📥 Descargar plantilla Excel
        </button>
      </div>

      <div className="form-horario-fila" style={{ marginTop: 16 }}>
        <input type="file" accept=".xlsx,.xls" onChange={(e) => setArchivo(e.target.files[0] || null)} />
        <button type="button" className="boton-primario boton-chico" disabled={!archivo || procesando} onClick={procesarArchivo}>
          {procesando ? 'Procesando…' : 'Subir y cargar'}
        </button>
      </div>

      {resultado && <p className="aviso-editando">{resultado}</p>}
      {errores.length > 0 && (
        <div className="nota-analisis" style={{ marginTop: 8 }}>
          <strong>Filas con error:</strong>
          <ul>
            {errores.map((e, i) => <li key={i}>{e}</li>)}
          </ul>
        </div>
      )}
    </div>
  );
}
