/** Reloj explícito para pruebas; no sustituye Date ni temporizadores globales. */
export class RelojPrueba {
  private instante = 0;

  constructor(fecha: Date) {
    this.fijar(fecha);
  }

  ahora(): Date {
    return new Date(this.instante);
  }

  fijar(fecha: Date): void {
    const instante = fecha.getTime();
    if (!Number.isFinite(instante)) throw new Error('La fecha de prueba debe ser válida.');
    this.instante = instante;
  }

  avanzar(milisegundos: number): void {
    if (!Number.isSafeInteger(milisegundos) || milisegundos < 0) {
      throw new Error('El avance debe ser un entero no negativo de milisegundos.');
    }
    this.fijar(new Date(this.instante + milisegundos));
  }
}
