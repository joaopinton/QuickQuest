import { describe, expect, test } from 'vitest';
import { createComplementaryFilter } from '../src/filter';
import { G, qAngle, qFromRotationVector, qRotate, type Vector3 } from '../src/math';

describe('filtro complementare di orientamento (forma di Mahony)', () => {
  test('inizializzazione immediata con orientamento coerente con la gravità', () => {
    const filter = createComplementaryFilter();
    // Telefono piatto sul tavolo: gravità sul dispositivo lungo +Z
    const q = filter.update([0, 0, 0], [0, 0, G], 0.016);
    // [0, 0, G] corrisponde già a WORLD_UP [0, 0, 1]
    const up = qRotate(q, [0, 0, 1]);
    expect(up[0]).toBeCloseTo(0, 3);
    expect(up[1]).toBeCloseTo(0, 3);
    expect(up[2]).toBeCloseTo(1, 3);
  });

  test('integrazione giroscopio durante rotazione rapida', () => {
    const filter = createComplementaryFilter({ kp: 0.5 });
    filter.update([0, 0, 0], [0, 0, G], 0.016);

    // Rotazione di 90 gradi attorno all'asse X in 1 secondo (pi/2 rad/s)
    const dt = 0.01;
    const rate = Math.PI / 2; // rad/s
    const steps = 100; // 100 * 0.01 = 1s

    for (let i = 0; i < steps; i++) {
      // Mentre ruota, il vettore gravità percepito ruota attorno a X
      const angle = rate * (i * dt);
      const accG: Vector3 = [0, G * Math.sin(angle), G * Math.cos(angle)];
      filter.update([rate, 0, 0], accG, dt);
    }

    const finalQ = filter.q;
    expect(finalQ).not.toBeNull();
    if (finalQ) {
      // L'angolo totale integrato deve essere circa 90° (pi/2)
      expect(qAngle(finalQ)).toBeCloseTo(Math.PI / 2, 2);
    }
  });

  test('cancello di accelerazione (gating) protegge dalla gravità durante accelerazioni violente', () => {
    const filter = createComplementaryFilter({ kp: 2.0, gate: 0.25 });
    filter.update([0, 0, 0], [0, 0, G], 0.016);

    // Forte accelerazione lineare: |a| = 3G (molto lontana da 1G)
    // Il filtro deve azzerare il guadagno trust e non farsi ingannare dall'accelerazione
    const initialQ = filter.q!;
    for (let i = 0; i < 20; i++) {
      filter.update([0, 0, 0], [0, 3 * G, 0], 0.016);
    }

    // Orientamento non deve essere distorto
    expect(filter.q![0]).toBeCloseTo(initialQ[0], 2);
    expect(filter.q![1]).toBeCloseTo(initialQ[1], 2);
  });
});

