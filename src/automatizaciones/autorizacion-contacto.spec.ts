import { validarContactoReservaPublica, huellaContactoReservaPublica } from '../reservas-publicas/contacto-reserva-publica';
import { validarSeleccionManual, huellaSeleccionManual } from '../citas/seleccion-manual.entrada';

const publico = { nombre: 'Ana', telefono: '6141234567' };
const manual = { clienteId: 1, sucursalId: 2, personalId: 3, servicioId: 4,
  fechaLocal: '2026-11-24', horaInicio: '09:00' };
const secreto = 'secreto-de-prueba-de-autorizacion-123456789';

describe('M5-T070: autorización expresa por cita', () => {
  it('el portal trata ausencia como rechazo y solo acepta un booleano expreso', () => {
    expect(validarContactoReservaPublica(publico).autorizaWhatsapp).toBe(false);
    expect(validarContactoReservaPublica({ ...publico, autorizaWhatsapp: true }).autorizaWhatsapp).toBe(true);
    expect(() => validarContactoReservaPublica({ ...publico, autorizaWhatsapp: 'true' })).toThrow();
    const sin = validarContactoReservaPublica(publico);
    const con = validarContactoReservaPublica({ ...publico, autorizaWhatsapp: true });
    expect(huellaContactoReservaPublica(sin, secreto)).not.toBe(huellaContactoReservaPublica(con, secreto));
  });

  it('el alta manual registra la autorización comunicada y la ata a su clave', () => {
    expect(validarSeleccionManual(manual).autorizaWhatsapp).toBe(false);
    expect(validarSeleccionManual({ ...manual, autorizaWhatsapp: true }).autorizaWhatsapp).toBe(true);
    expect(() => validarSeleccionManual({ ...manual, autorizaWhatsapp: 1 })).toThrow();
    const sin = validarSeleccionManual(manual);
    const con = validarSeleccionManual({ ...manual, autorizaWhatsapp: true });
    expect(huellaSeleccionManual(sin, secreto)).not.toBe(huellaSeleccionManual(con, secreto));
  });
});
