/**
 * Estructura del RFC descrita por el SAT:
 * - Persona moral: 3 letras + fecha de constitución (AAMMDD) + homoclave.
 * - Persona física: 4 letras + fecha de nacimiento (AAMMDD) + homoclave.
 *
 * Esta validación comprueba únicamente el formato. No confirma que el RFC
 * exista, esté activo o corresponda a una persona ante el SAT.
 */
const FECHA_RFC = '\\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\\d|3[01])';

export const PATRON_RFC = new RegExp(
  `^(?:[A-ZÑ]{3}${FECHA_RFC}[A-Z0-9]{3}|[A-ZÑ]{4}${FECHA_RFC}[A-Z0-9]{3})$`,
);

export function esFormatoRfcValido(rfc: string): boolean {
  return PATRON_RFC.test(rfc);
}
