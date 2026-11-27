/** Los datos mexicanos históricos siguen en diez dígitos; los nuevos destinos extranjeros usan E.164. */
export function destinoWhatsapp(telefono: string | null): string | null {
  if (telefono && /^\d{10}$/.test(telefono)) return `+52${telefono}`;
  if (telefono && /^\+[1-9]\d{6,14}$/.test(telefono)) return telefono;
  return null;
}
