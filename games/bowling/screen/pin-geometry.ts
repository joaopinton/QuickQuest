// Geometria procedurale del birillo e posizionamento standard USBC (docs/games/bowling.md § 2).

import * as THREE from 'three';

export const PIN_HEIGHT = 0.381; // 38.1 cm (15 pollici)
export const PIN_MAX_RADIUS = 0.0605; // 12.1 cm diametro max alla pancia
export const PIN_MASS = 1.53; // kg
export const PIN_SPACING = 0.3048; // 30.48 cm (12 pollici) tra i centri adiacenti
export const ROW_SPACING = PIN_SPACING * Math.sin(Math.PI / 3); // ~0.26396 m

/**
 * Coordinate (x, z) relative allo spot del birillo 1 (testa del triangolo).
 * Ordinamento standard USBC 1..10.
 */
export const PIN_OFFSETS: readonly { readonly id: number; readonly x: number; readonly z: number }[] = [
  // Fila 1 (birillo 1)
  { id: 1, x: 0, z: 0 },
  // Fila 2 (birilli 2, 3)
  { id: 2, x: -PIN_SPACING / 2, z: ROW_SPACING },
  { id: 3, x: PIN_SPACING / 2, z: ROW_SPACING },
  // Fila 3 (birilli 4, 5, 6)
  { id: 4, x: -PIN_SPACING, z: ROW_SPACING * 2 },
  { id: 5, x: 0, z: ROW_SPACING * 2 },
  { id: 6, x: PIN_SPACING, z: ROW_SPACING * 2 },
  // Fila 4 (birilli 7, 8, 9, 10)
  { id: 7, x: -PIN_SPACING * 1.5, z: ROW_SPACING * 3 },
  { id: 8, x: -PIN_SPACING / 2, z: ROW_SPACING * 3 },
  { id: 9, x: PIN_SPACING / 2, z: ROW_SPACING * 3 },
  { id: 10, x: PIN_SPACING * 1.5, z: ROW_SPACING * 3 },
];

/**
 * Crea la geometria del birillo tramite Three.js LatheGeometry con strisce rosse sul collo
 * modellate direttamente nei vertex color (ADR-005: procedurale, zero texture).
 */
export function createPinGeometry(segments = 24): THREE.BufferGeometry {
  // Profilo (r, y) normalizzato alle dimensioni reali (metri)
  const profilePoints: [number, number][] = [
    [0.0, 0.0],
    [0.0285, 0.0],       // Base diametro 5.7 cm
    [0.032, 0.02],
    [0.046, 0.06],
    [0.058, 0.10],
    [0.0605, 0.115],    // Pancia massima (diametro 12.1 cm)
    [0.058, 0.14],
    [0.048, 0.18],
    [0.034, 0.22],
    [0.023, 0.25],      // Collo (diametro 4.6 cm)
    [0.0225, 0.27],
    [0.026, 0.30],      // Allargamento testa
    [0.0325, 0.33],     // Testa (diametro 6.5 cm)
    [0.032, 0.355],
    [0.025, 0.375],
    [0.012, 0.381],     // Sommità
    [0.0, 0.381],
  ];

  const points = profilePoints.map(([r, y]) => new THREE.Vector2(r, y));
  const geometry = new THREE.LatheGeometry(points, segments);
  geometry.computeVertexNormals();

  // Colorazione vertici: avorio lucido con due strisce rosse sul collo
  const pos = geometry.attributes.position;
  const count = pos ? pos.count : 0;
  const colors = new Float32Array(count * 3);

  const IVORY: readonly [number, number, number] = [0.96, 0.95, 0.92];
  const RED_STRIPE: readonly [number, number, number] = [0.88, 0.12, 0.14];

  if (pos) {
    for (let i = 0; i < count; i++) {
      const y = pos.getY(i);
      // Prima striscia: y da 0.245 a 0.260 m; Seconda striscia: y da 0.272 a 0.287 m
      const isStripe = (y >= 0.245 && y <= 0.260) || (y >= 0.272 && y <= 0.287);
      const color = isStripe ? RED_STRIPE : IVORY;
      colors[i * 3] = color[0];
      colors[i * 3 + 1] = color[1];
      colors[i * 3 + 2] = color[2];
    }
  }

  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geometry;
}
