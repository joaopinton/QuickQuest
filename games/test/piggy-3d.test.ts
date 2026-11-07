import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  createPiggy3D,
  createPiggyBodyGeometry,
  createPiggyDetailsGeometry,
  createPiggyWingGeometry,
  PIGGY_HEAD_Y,
  piggyShoulder,
  piggySurface,
  piggyWingRotation,
} from '../shared/piggy-3d';

function box(geo: THREE.BufferGeometry): THREE.Box3 {
  geo.computeBoundingBox();
  return geo.boundingBox!;
}

describe('Piggy 3D', () => {
  it('sta in piedi su y = 0, alto circa 1, e guarda verso +z col becco', () => {
    const body = box(createPiggyBodyGeometry());
    const details = box(createPiggyDetailsGeometry());
    expect(body.min.y).toBeGreaterThanOrEqual(0);
    expect(body.max.y).toBeCloseTo(1.01, 1);
    // Il becco sporge davanti alla testolina, le zampette toccano terra
    expect(details.max.z).toBeGreaterThan(piggySurface(0, PIGGY_HEAD_Y).z + 0.05);
    expect(details.min.y).toBeCloseTo(0, 2);
  });

  it('ha i colori nei vertici in ogni parte (ADR-005)', () => {
    for (const geo of [createPiggyBodyGeometry(), createPiggyDetailsGeometry(), createPiggyWingGeometry()]) {
      const pos = geo.getAttribute('position');
      const color = geo.getAttribute('color');
      expect(color).toBeDefined();
      expect(color.count).toBe(pos.count);
    }
  });

  it("le ali ripiegate pendono sul fianco e aperte salgono sopra la spalla", () => {
    const tip = new THREE.Vector3(0, -0.36, 0);
    for (const side of [-1, 1] as const) {
      const folded = tip.clone().applyEuler(piggyWingRotation(side, 0));
      const open = tip.clone().applyEuler(piggyWingRotation(side, 1));
      expect(folded.y).toBeLessThan(-0.3);
      expect(open.y).toBeGreaterThan(0);
      expect(Math.sign(open.x)).toBe(side);
      expect(Math.sign(piggyShoulder(side).x)).toBe(side);
    }
  });

  it('cambia colore e apre una sola ala', () => {
    const piggy = createPiggy3D('#EF4E5B');
    piggy.setColor('#3C8CF0');
    expect(piggy.bodyMaterial.color.getHexString()).toBe('3c8cf0');
    piggy.setWingsOpen(1, -1);
    expect(piggy.wings.left.rotation.z).toBeLessThan(-1.5);
    expect(piggy.wings.right.rotation.z).toBeCloseTo(0.2, 5);
    piggy.dispose();
  });
});
