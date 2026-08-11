// Completá estos datos con los que te da tu cuenta gratuita de
// emailjs.com. Son los MISMOS Public Key y Service ID que pusiste en
// employee-web/app.js; el Template ID acá es el de "solicitud resuelta"
// (uno nuevo, distinto al de "nueva solicitud").
const EMAILJS_PUBLIC_KEY = 'PEGAR_PUBLIC_KEY_ACA';
const EMAILJS_SERVICE_ID = 'PEGAR_SERVICE_ID_ACA';
const EMAILJS_TEMPLATE_SOLICITUD_RESUELTA = 'PEGAR_TEMPLATE_ID_EMPLEADO_ACA';

let listo = false;
function inicializar() {
  if (listo) return;
  if (typeof window.emailjs === 'undefined') return;
  if (EMAILJS_PUBLIC_KEY.startsWith('PEGAR_')) return;
  window.emailjs.init({ publicKey: EMAILJS_PUBLIC_KEY });
  listo = true;
}

export async function avisarSolicitudResuelta({ email, nombre, tipo, fechaInicio, fechaFin, estado }) {
  inicializar();
  if (!listo || EMAILJS_TEMPLATE_SOLICITUD_RESUELTA.startsWith('PEGAR_')) return;
  try {
    await window.emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_SOLICITUD_RESUELTA, {
      to_email: email,
      nombre_empleado: nombre,
      tipo_solicitud: tipo === 'licencia' ? 'Licencia' : 'Vacaciones',
      fecha_inicio: fechaInicio,
      fecha_fin: fechaFin,
      estado: estado === 'aprobada' ? 'Aprobada' : 'Rechazada',
    });
  } catch (err) {
    console.error('No se pudo enviar el aviso por mail:', err);
  }
}
