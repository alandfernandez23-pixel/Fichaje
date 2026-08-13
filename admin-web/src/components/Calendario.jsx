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
    horarios.forEach((h) => { if (h.email
