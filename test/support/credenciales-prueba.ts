import type { DataSource } from 'typeorm';
import { CredencialesService } from '../../src/auth/services/credenciales.service';
import { reconstruirCodigo } from './invitaciones-fase-2';

/** Simula el código recibido por correo únicamente en las fixtures de regresión. */
export async function codigoDelEnvio(db: DataSource, envioId: string) {
  const [envio] = await db.query('SELECT codigo_acceso_id FROM envios_correo WHERE id = ?', [envioId]);
  return reconstruirCodigo(db, String(envio.codigo_acceso_id));
}
export function credencialesDePrueba(db: DataSource, servicio: CredencialesService) {
  return {
    autorizarRecuperacion: async (datos: Parameters<CredencialesService['autorizarRecuperacion']>[0]) => {
      const respuesta = await servicio.autorizarRecuperacion(datos);
      return { ...respuesta, codigo: await codigoDelEnvio(db, respuesta.envioId) };
    },
    recuperarContrasena: servicio.recuperarContrasena.bind(servicio),
    cambiarContrasena: servicio.cambiarContrasena.bind(servicio),
  };
}
