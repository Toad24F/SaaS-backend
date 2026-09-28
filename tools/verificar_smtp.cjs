// Comprueba conexión/TLS/autenticación del entorno sin enviar correos ni mostrar secretos.
require('dotenv').config({ quiet: true });
const { createTransport } = require('nodemailer');
const obligatorias = ['CORREO_REMITENTE', 'SMTP_HOST', 'SMTP_USER', 'SMTP_PASS'];
const faltantes = obligatorias.filter((clave) => !process.env[clave]?.trim());
if (faltantes.length) {
  console.log(JSON.stringify({ ok: false, motivo: 'Configuración incompleta', faltantes }));
  process.exitCode = 1;
} else {
  const secure = process.env.SMTP_SECURE === 'true';
  const transporte = createTransport({
    host: process.env.SMTP_HOST, port: Number(process.env.SMTP_PORT || 587),
    secure, requireTLS: !secure, auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    logger: false, debug: false, dnsTimeout: 10000,
    connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 10000,
  });
  // Límite total además de los timeouts individuales, incluido el resolver del sistema.
  const limite = setTimeout(() => {
    console.log(JSON.stringify({ ok: false, codigo: 'TIMEOUT_TOTAL', envioReal: false }));
    transporte.close();
    process.exit(1);
  }, 20000);
  // verify no valida la recepción ni que el proveedor admita el remitente al enviar.
  transporte.verify().then(() => {
    console.log(JSON.stringify({ ok: true, google: process.env.SMTP_HOST === 'smtp.gmail.com',
      alcance: 'conexion-y-autenticacion', envioReal: false }));
  }).catch((error) => {
    console.log(JSON.stringify({ ok: false, codigo: error.code || 'FALLO_SMTP',
      respuesta: error.responseCode || null, envioReal: false }));
    process.exitCode = 1;
  }).finally(() => { clearTimeout(limite); transporte.close(); });
}
