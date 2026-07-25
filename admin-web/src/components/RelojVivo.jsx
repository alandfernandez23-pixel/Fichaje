import { useEffect, useState } from 'react';

/**
 * Reloj que se actualiza cada segundo. Es el elemento visual de
 * identidad del panel: refuerza que el sistema registra tiempo
 * con precisión de segundos, no solo "más o menos a esa hora".
 */
export default function RelojVivo() {
  const [ahora, setAhora] = useState(new Date());

  useEffect(() => {
    const id = setInterval(() => setAhora(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const hh = String(ahora.getHours()).padStart(2, '0');
  const mm = String(ahora.getMinutes()).padStart(2, '0');
  const ss = String(ahora.getSeconds()).padStart(2, '0');

  return (
    <div className="reloj-vivo" aria-label="Hora actual">
      <span>{hh}</span>
      <span className="reloj-separador">:</span>
      <span>{mm}</span>
      <span className="reloj-separador">:</span>
      <span className="reloj-segundos">{ss}</span>
    </div>
  );
}
