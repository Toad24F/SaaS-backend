import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ordenarRecursosBloqueo, RecursoBloqueo } from './orden-bloqueos';

describe('M1-T010: orden transversal de bloqueos', () => {
  it('ordena identidad, negocio, licencia y perfiles con IDs ascendentes', () => {
    const recursos: RecursoBloqueo[] = [
      { tipo: 'perfil', id: 9 }, { tipo: 'licencia', id: 3 },
      { tipo: 'negocio', id: 8 }, { tipo: 'perfil', id: 2 },
      { tipo: 'codigo', id: 4 }, { tipo: 'usuario', id: 7 },
      { tipo: 'alta', id: 5 }, { tipo: 'correo', clave: ' Z@Example.Test ' },
      { tipo: 'correo', clave: 'a@example.test' }, { tipo: 'sucursal', id: 6 },
      { tipo: 'servicio', id: 1 }, { tipo: 'negocio', id: 2 },
    ];
    expect(ordenarRecursosBloqueo(recursos)).toEqual([
      { tipo: 'correo', clave: 'a@example.test' },
      { tipo: 'correo', clave: 'z@example.test' },
      { tipo: 'alta', id: 5 }, { tipo: 'usuario', id: 7 },
      { tipo: 'codigo', id: 4 }, { tipo: 'negocio', id: 2 },
      { tipo: 'negocio', id: 8 }, { tipo: 'licencia', id: 3 },
      { tipo: 'sucursal', id: 6 }, { tipo: 'servicio', id: 1 },
      { tipo: 'perfil', id: 2 }, { tipo: 'perfil', id: 9 },
    ]);
  });

  it('deduplica recursos y no modifica la lista recibida', () => {
    const entrada: RecursoBloqueo[] = [
      { tipo: 'perfil', id: 3 }, { tipo: 'negocio', id: 1 }, { tipo: 'perfil', id: 3 },
    ];
    expect(ordenarRecursosBloqueo(entrada)).toEqual([
      { tipo: 'negocio', id: 1 }, { tipo: 'perfil', id: 3 },
    ]);
    expect(entrada[0]).toEqual({ tipo: 'perfil', id: 3 });
  });

  it.each([0, -1, 1.5, Number.NaN])('rechaza ID inválido %s', (id) => {
    expect(() => ordenarRecursosBloqueo([{ tipo: 'negocio', id }])).toThrow();
  });

  it('conserva el mismo orden relativo en activación, suspensión y calendario', () => {
    // Estos recorridos son futuros; comprueban que un cruce no invierta recursos compartidos.
    const recorridos: RecursoBloqueo[][] = [
      [{ tipo: 'licencia', id: 1 }, { tipo: 'negocio', id: 1 }, { tipo: 'codigo', id: 1 },
        { tipo: 'alta', id: 1 }, { tipo: 'correo', clave: 'a@example.test' }],
      [{ tipo: 'licencia', id: 1 }, { tipo: 'negocio', id: 1 }],
      [{ tipo: 'codigo', id: 1 }, { tipo: 'alta', id: 1 }, { tipo: 'correo', clave: 'a@example.test' }],
      [{ tipo: 'perfil', id: 2 }, { tipo: 'sucursal', id: 3 }, { tipo: 'negocio', id: 1 }],
      [{ tipo: 'sucursal', id: 3 }, { tipo: 'perfil', id: 2 }, { tipo: 'negocio', id: 1 }],
    ];
    const ordenados = recorridos.map((camino) => ordenarRecursosBloqueo(camino));
    for (const primero of ordenados) for (const segundo of ordenados) {
      const comunes = primero.filter((recurso) => segundo.some((otro) =>
        JSON.stringify(recurso) === JSON.stringify(otro)));
      expect(comunes).toEqual(segundo.filter((recurso) => comunes.some((otro) =>
        JSON.stringify(recurso) === JSON.stringify(otro))));
    }
  });

  it('documenta el orden, la revalidación y los cruces en el plan', () => {
    const plan = readFileSync(resolve(process.cwd(), 'docs/fase-2-modulo-1/plan-modulo-1.md'), 'utf8');
    const bloque = plan.split('### 5.0 Orden común de bloqueos — M1-T010')[1]?.split('### 5.1')[0];
    expect(bloque).toBeDefined();
    for (const clave of ['correo', 'alta', 'usuario', 'codigo', 'negocio', 'licencia',
      'sucursal', 'servicio', 'perfil', 'ID ascendente', 'revalidar', 'activación',
      'suspensión', 'reactivación', 'horario']) {
      expect(bloque).toContain(clave);
    }
  });
});
