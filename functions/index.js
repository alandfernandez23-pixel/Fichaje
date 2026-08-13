const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { setGlobalOptions } = require("firebase-functions/v2");
const { defineSecret } = require("firebase-functions/params");
const admin = require("firebase-admin");

admin.initializeApp();
const db = admin.firestore();

setGlobalOptions({ region: "southamerica-east1", maxInstances: 5 });

// La Private Key de EmailJS se guarda como secreto (NO va hardcodeada acá).
// Se carga en el paso "Parte 4" con: firebase functions:secrets:set EMAILJS_PRIVATE_KEY
const EMAILJS_PRIVATE_KEY = defineSecret("EMAILJS_PRIVATE_KEY");

// Mismos Service ID y Public Key que ya usás en employee-web/app.js y
// admin-web/src/emailjs.js. Si alguna vez los cambiás, actualizalos acá también.
const EMAILJS_SERVICE_ID = "service_7k9myip";
const EMAILJS_PUBLIC_KEY = "DenrUpVwH3era9YKa";

// Completar con los Template ID reales que crees en la Parte 2.
const EMAILJS_TEMPLATE_NUEVA_SOLICITUD = "template_lxy3qul";
const EMAILJS_TEMPLATE_REEMPLAZO = "template_hgioun7";

async function enviarEmail(templateId, params, privateKey) {
  if (templateId.startsWith("PEGAR_")) {
    console.warn("Falta configurar el Template ID:", templateId);
    return;
  }
  const resp = await fetch("https://api.emailjs.com/api/v1.0/email/send", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      service_id: EMAILJS_SERVICE_ID,
      template_id: templateId,
      user_id: EMAILJS_PUBLIC_KEY,
      accessToken: privateKey,
      template_params: params,
    }),
  });
  if (!resp.ok) {
    console.error("EmailJS respondió con error:", resp.status, await resp.text());
  }
}

async function obtenerAdmins() {
  const snap = await db.collection("admins").get();
  return snap.docs.map((d) => d.id); // el id del doc ya es el email (ver Administradores.jsx)
}

// ── Aviso a los admins cuando un profe manda una solicitud de vacaciones/licencia ──
exports.avisarNuevaSolicitud = onDocumentCreated(
  { document: "solicitudes/{id}", secrets: [EMAILJS_PRIVATE_KEY] },
  async (event) => {
    const s = event.data.data();
    const admins = await obtenerAdmins();
    if (admins.length === 0) return;

    const clasesAfectadas =
      (s.clasesAfectadas || [])
        .map((c) => `${c.diaTexto} ${c.horaInicio}-${c.horaFin} (${c.tipoClase})`)
        .join(", ") || "Todo el día";

    const privateKey = EMAILJS_PRIVATE_KEY.value();
    await Promise.all(
      admins.map((email) =>
        enviarEmail(
          EMAILJS_TEMPLATE_NUEVA_SOLICITUD,
          {
            to_email: email,
            nombre_empleado: s.nombre,
            tipo_solicitud: s.tipo === "licencia" ? "Licencia" : "Vacaciones",
            fecha_inicio: s.fechaInicio,
            fecha_fin: s.fechaFin,
            comentario: s.comentario || "(sin comentario)",
            clases_afectadas: clasesAfectadas,
          },
          privateKey
        )
      )
    );
  }
);

// ── Aviso a los admins y a los demás profes cuando alguien pide un reemplazo ──
exports.avisarNuevoReemplazo = onDocumentCreated(
  { document: "reemplazos/{id}", secrets: [EMAILJS_PRIVATE_KEY] },
  async (event) => {
    const r = event.data.data();
    const admins = await obtenerAdmins();

    // "Padrón" de profes: se deduce de quién tiene horarios activos cargados.
    const horariosSnap = await db.collection("horarios").where("activo", "==", true).get();
    const destinatarios = new Map();
    horariosSnap.docs.forEach((doc) => {
      const h = doc.data();
      if (h.email && h.email !== r.email) destinatarios.set(h.email, true);
    });
    admins.forEach((email) => destinatarios.set(email, true));

    if (destinatarios.size === 0) return;
    const privateKey = EMAILJS_PRIVATE_KEY.value();
    await Promise.all(
      [...destinatarios.keys()].map((email) =>
        enviarEmail(
          EMAILJS_TEMPLATE_REEMPLAZO,
          {
            to_email: email,
            nombre_profe: r.nombre,
            dia_texto: r.diaTexto,
            fecha: r.fecha,
            hora_inicio: r.horaInicio,
            hora_fin: r.horaFin,
            tipo_clase: r.tipoClase,
            aula: r.aula || "(sin aula)",
            motivo: r.motivo || "(sin motivo)",
          },
          privateKey
        )
      )
    );
  }
);

// ── Recordatorio de fichaje: corre cada 5 minutos, revisa los horarios de
//    hoy y si pasaron 10 min de la hora de entrada o salida sin el fichaje
//    correspondiente, manda un push a esa persona. Requiere plan Blaze. ──
function toMinutos(hhmm) {
  const [hh, mm] = (hhmm || "0:0").split(":").map(Number);
  return hh * 60 + mm;
}

async function tieneFichajeEntradaHoy(email, inicioHoy) {
  const snap = await db
    .collection("fichajes")
    .where("email", "==", email)
    .where("horaEntrada", ">=", admin.firestore.Timestamp.fromDate(inicioHoy))
    .limit(1)
    .get();
  return !snap.empty;
}

async function tieneFichajeSalidaHoy(email, inicioHoy) {
  const snap = await db
    .collection("fichajes")
    .where("email", "==", email)
    .where("horaEntrada", ">=", admin.firestore.Timestamp.fromDate(inicioHoy))
    .get();
  return snap.docs.some((d) => d.data().horaSalida != null);
}

async function enviarPush(email, titulo, cuerpo) {
  const tokensSnap = await db.collection("tokensNotificacion").where("email", "==", email).get();
  if (tokensSnap.empty) return;
  const tokens = tokensSnap.docs.map((d) => d.id);
  try {
    await admin.messaging().sendEachForMulticast({
      tokens,
      notification: { title: titulo, body: cuerpo },
    });
  } catch (err) {
    console.error("Error enviando push a", email, err);
  }
}

exports.recordatorioFichaje = onSchedule(
  { schedule: "every 5 minutes", timeZone: "America/Argentina/Buenos_Aires" },
  async () => {
    const ahora = new Date();
    const diaSemana = ahora.getDay();
    const horaActual = ahora.getHours() * 60 + ahora.getMinutes();
    const inicioHoy = new Date(ahora);
    inicioHoy.setHours(0, 0, 0, 0);

    const horariosSnap = await db
      .collection("horarios")
      .where("activo", "==", true)
      .where("diaSemana", "==", diaSemana)
      .get();

    for (const doc of horariosSnap.docs) {
      const h = doc.data();
      const minInicio = toMinutos(h.horaInicio);
      const minFin = toMinutos(h.horaFin);

      // Ventana de 10 a 20 min tarde para no repetir el aviso cada 5 min.
      if (horaActual >= minInicio + 10 && horaActual < minInicio + 20) {
        const yaFicho = await tieneFichajeEntradaHoy(h.email, inicioHoy);
        if (!yaFicho) {
          await enviarPush(
            h.email,
            "Te olvidaste de fichar la entrada",
            `Tu clase de las ${h.horaInicio} ya empezó.`
          );
        }
      }
      if (horaActual >= minFin + 10 && horaActual < minFin + 20) {
        const yaFicho = await tieneFichajeSalidaHoy(h.email, inicioHoy);
        if (!yaFicho) {
          await enviarPush(
            h.email,
            "Te olvidaste de fichar la salida",
            `Tu clase de las ${h.horaFin} ya terminó.`
          );
        }
      }
    }
  }
);
