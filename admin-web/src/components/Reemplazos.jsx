import { useEffect, useState } from 'react';
import { collection, onSnapshot, orderBy, query, deleteDoc, doc } from 'firebase/firestore';
import { db } from '../firebase';

const ETIQUETA_ESTADO = { abierto: 'Abierto', cubierto: 'Cubierto' };

export default function Reemplazos() {
  const [reemplazos, setReemplazos] = useState([]);
  const [filtro, setFiltro] = useState('todos'); // 'todos' | 'abierto' | 'cubierto'

  useEffect(() => {
    const q = query(collection(db, 'reemplazos'), orderBy('creadoEn', 'desc'));
    const unsub = onSnapshot(q, (snap) => {
      setReemplazos(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    return unsub;
  }, []);

  const visibles = filtro === 'todos' ? reemplazos : reemplazos.filter((r) => r.estado === filtro);

  async function quitar(r) {
    if (!window.confirm(`¿Quitar este pedido de reemplazo de ${r.nombre}?`)) return;
    await deleteDoc(doc(db, 'reemplazos', r.id));
  }

  return (
    <div className="panel-secundario">
      <div className="tabs-vista" style={{ marginBottom: 16 }}>
        <button className={`tab-boton ${filtro === 'todos' ? 'tab-activa' : ''}`} onClick={() => setFiltro('todos')}>Todos</button>
        <button className={`tab-boton ${filtro === 'abierto' ? 'tab-activa' : ''}`} onClick={() =>
