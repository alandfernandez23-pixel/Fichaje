import { useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot, orderBy, query, addDoc, updateDoc, deleteDoc, doc, writeBatch } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { colorDeInstructora } from '../colorInstructora.js';

const DIAS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

const vacio = { nombre: '', email: '', diaSemana: 1, horaInicio: '09:00', horaFin: '10:00', tipoClase: '', aula: '' };

export default function Horarios() {
  const [horarios, setHorarios] = useState([]);
  const [form, setForm] = useState(vacio);
  const [editandoId, setEditandoId] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const [diaFiltro, setDiaFiltro] = useState('todos');
  const [modoIntercambio, setModoIntercambio] = useState(false);
  const [seleccionIntercambio, setSeleccionIntercambio] = useState([]);
  const [avisoNombreAuto, setAvisoNombreAuto] = useState(false);

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

  const visibles = diaFiltro === 'todos' ? horarios : horarios.filter((h) => h.diaSemana === Number(diaFiltro));

  return (
    <div className="panel-secundario">
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
          return (
            <div
              key={h.id}
              className={`tarjeta-buzon tarjeta-horario ${h.activo === false ? 'tarjeta-horario-inactiva' : ''} ${seleccionado ? 'tarjeta-horario-seleccionada' : ''}`}
              style={{ borderLeftColor: colorDeInstructora(h.email) }}
              onClick={modoIntercambio ? () => elegirParaIntercambio(h) : undefined}
            >
              <div className="tarjeta-solicitud-cabecera">
                <strong>{h.nombre}</strong>
                <span className="tarjeta-buzon-fecha">{DIAS[h.diaSemana]}</span>
              </div>
              <p className="tarjeta-buzon-texto">
                {h.horaInicio} – {h.horaFin} · {h.tipoClase}{h.aula ? ` · ${h.aula}` : ''} · {h.email}
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
