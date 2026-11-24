import type { Part } from './boxes.ts';
import { box, hash } from './boxes.ts';
import { C } from './palette.ts';
import { TUNING } from './tuning.ts';

/**
 * The backdrop (F-410, F-411): a grid of city blocks with houses, trees and roads.
 * Pure layout, no Three.js scene objects, so it is cheap to rebuild and easy to reason about.
 */

/** Distance from one block centre to the next: 12 of block plus 4 of road. */
export const PITCH = 16;
const BLOCK = 12;
const REACH = TUNING.city.reach;
const GROUND_TOP = 0.4;
export const CAR_COUNT = TUNING.city.cars;

const WALLS = [
  C.wallRed,
  C.wallYellow,
  C.wallBlue,
  C.wallCream,
  C.wallTerracotta,
  C.wallGreen,
  C.wallLilac,
  C.wallPink,
];
const ROOFS = [C.roofBrick, C.slate, C.roofRed, C.roofBrown, C.roofTeal];
const AWNINGS = [C.red, C.yellow, C.teal, C.orange];

/** With an even number of lots the grid shifts by half a block so lots still sit on blocks. */
function gridShift(lotCount: number): number {
  return lotCount % 2 === 0 ? PITCH / 2 : 0;
}

/** Where lot `index` of `count` stands. The lots form one row along the x axis. */
export function lotPosition(index: number, count: number): { x: number; z: number } {
  return { x: (index - (count - 1) / 2) * PITCH, z: 0 };
}

function addTree(parts: Part[], x: number, z: number, seed: number): void {
  const size = 1.1 + hash(seed) * 0.5;
  const dark = hash(seed + 1) > 0.5 ? C.treeMid : C.treeDark;
  parts.push(
    box(C.trunk, 0.36, 0.8, 0.36, x, GROUND_TOP + 0.4, z),
    box(dark, size, 0.8, size, x, GROUND_TOP + 1.1, z),
    box(C.treeLight, size * 0.72, 0.7, size * 0.72, x, GROUND_TOP + 1.8, z),
  );
}

function addHouse(
  parts: Part[],
  x: number,
  z: number,
  seed: number,
  maxHeight: number,
  detail: 'full' | 'glass' | 'none',
): void {
  const w = 3.3 + hash(seed + 1) * 1.3;
  const d = 3.3 + hash(seed + 2) * 1.3;
  const h = 2.2 + hash(seed + 3) * (maxHeight - 2.2);
  const wall = WALLS[Math.floor(hash(seed + 4) * WALLS.length)] ?? C.white;
  const roof = ROOFS[Math.floor(hash(seed + 5) * ROOFS.length)] ?? C.slate;
  const y0 = GROUND_TOP;
  parts.push(box(wall, w, h, d, x, y0 + h / 2, z));
  parts.push(box(roof, w + 0.3, 0.3, d + 0.3, x, y0 + h + 0.15, z));
  if (hash(seed + 6) > 0.55) {
    parts.push(box(roof, w * 0.55, 0.5, d * 0.55, x, y0 + h + 0.55, z));
  } else if (hash(seed + 6) > 0.3) {
    parts.push(box(C.roofUnit, 0.7, 0.4, 0.7, x + w * 0.2, y0 + h + 0.5, z - d * 0.2));
  }
  if (detail === 'none') return;

  // Windows only on the two sides the camera can see.
  const rows = Math.max(1, Math.floor((h - 0.5) / 1.25));
  const columnsX = Math.max(1, Math.floor(d / 1.35));
  const columnsZ = Math.max(1, Math.floor(w / 1.35));
  for (let r = 0; r < rows; r++) {
    const y = y0 + 0.95 + r * 1.25;
    for (let c = 0; c < columnsX; c++) {
      const offset = (c - (columnsX - 1) / 2) * 1.3;
      if (detail === 'full') parts.push(box(C.white, 0.06, 0.78, 0.7, x + w / 2, y, z + offset));
      parts.push(box(C.houseGlass, 0.1, 0.62, 0.54, x + w / 2, y, z + offset));
    }
    for (let c = 0; c < columnsZ; c++) {
      const offset = (c - (columnsZ - 1) / 2) * 1.3;
      const door = r === 0 && c === 0;
      if (detail === 'full') parts.push(box(C.white, 0.7, 0.78, 0.06, x + offset, y, z + d / 2));
      parts.push(
        box(
          door ? C.door : C.houseGlass,
          0.54,
          door ? 0.95 : 0.62,
          0.1,
          x + offset,
          door ? y - 0.2 : y,
          z + d / 2,
        ),
      );
    }
  }
  if (detail === 'full' && hash(seed + 7) > 0.5) {
    const awning = AWNINGS[Math.floor(hash(seed + 8) * AWNINGS.length)] ?? C.red;
    parts.push(box(awning, w * 0.8, 0.12, 0.7, x, y0 + 1.55, z + d / 2 + 0.3));
  }
}

function addBlock(
  parts: Part[],
  cx: number,
  cz: number,
  column: number,
  row: number,
  isLot: boolean,
): void {
  const seed = (column + 50) * 131 + (row + 50) * 17;
  parts.push(box(C.pavement, BLOCK, 0.3, BLOCK, cx, 0.15, cz));
  parts.push(box(C.grass, BLOCK - 1.2, 0.1, BLOCK - 1.2, cx, 0.35, cz));

  if (isLot) {
    // Only a few trees at the back corners, so nothing hides the tower.
    addTree(parts, cx - 5, cz - 5, seed);
    addTree(parts, cx - 5, cz - 2.4, seed + 1);
    addTree(parts, cx - 2.4, cz - 5, seed + 2);
    return;
  }

  const distance = Math.max(Math.abs(column), Math.abs(row));
  const detail = distance <= 2 ? 'full' : distance <= 5 ? 'glass' : 'none';
  // Blocks in front of the lots stay low; the camera looks across them at the towers.
  const maxHeight = row >= 1 ? 3.6 : row === 0 ? 5 : 5 + hash(seed + 9) * 5;

  if (hash(seed) < 0.14) {
    parts.push(box(C.water, 4.6, 0.08, 3.4, cx + 0.6, GROUND_TOP + 0.04, cz + 0.4));
    for (let t = 0; t < 9; t++) {
      addTree(
        parts,
        cx + (hash(seed + t * 3) - 0.5) * 9.6,
        cz + (hash(seed + t * 3 + 1) - 0.5) * 9.6,
        seed + t,
      );
    }
    return;
  }

  for (let q = 0; q < 4; q++) {
    const qx = cx + (q % 2 === 0 ? -2.75 : 2.75);
    const qz = cz + (q < 2 ? -2.75 : 2.75);
    if (hash(seed + q * 11) < 0.84) {
      addHouse(parts, qx, qz, seed + q * 11, maxHeight, detail);
    } else {
      addTree(parts, qx, qz, seed + q);
      addTree(parts, qx + 1.4, qz - 1.2, seed + q + 20);
    }
  }
  // Street trees along the two kerbs that face the camera.
  for (let t = 0; t < 3; t++) {
    if (hash(seed + 30 + t) > 0.35)
      addTree(parts, cx + 5.1, cz - 4 + t * 4 + hash(seed + t), seed + 40 + t);
    if (hash(seed + 60 + t) > 0.35)
      addTree(parts, cx - 4 + t * 4 + hash(seed + t + 5), cz + 5.1, seed + 70 + t);
  }
}

export function buildCity(lotCount: number): Part[] {
  const parts: Part[] = [];
  const shift = gridShift(lotCount);
  const span = (REACH * 2 + 1) * PITCH;
  // Asphalt under everything; the blocks sit on top and leave the roads showing.
  parts.push(box(C.asphalt, span + 4, 0.2, span + 4, shift, -0.1, 0));

  const firstLot = -Math.floor(lotCount / 2);
  for (let column = -REACH; column <= REACH; column++) {
    for (let row = -REACH; row <= REACH; row++) {
      const isLot = row === 0 && column >= firstLot && column < firstLot + lotCount;
      addBlock(parts, column * PITCH + shift, row * PITCH, column, row, isLot);
    }
  }

  // Dashed centre lines, left out where two roads cross.
  const half = span / 2;
  for (let line = -REACH; line < REACH; line++) {
    const across = (line + 0.5) * PITCH;
    for (let along = -half; along <= half; along += 3.2) {
      const cell = (((along - PITCH / 2) % PITCH) + PITCH) % PITCH;
      if (cell < 2.4 || cell > PITCH - 2.4) continue;
      parts.push(box(C.roadMark, 1.3, 0.02, 0.16, along + shift, 0.02, across));
      parts.push(box(C.roadMark, 0.16, 0.02, 1.3, across + shift, 0.02, along));
    }
  }
  return parts;
}

/** Position of car `index` at `time`. Cars keep to the right of the dashed line. */
export function carPlacement(
  index: number,
  time: number,
  lotCount: number,
): { x: number; z: number; rotation: number } {
  const shift = gridShift(lotCount);
  const range = (REACH * 2 + 1) * PITCH;
  const forward = index % 4 < 2;
  const speed = 3.5 + hash(index + 500) * 3;
  const travelled = (hash(index + 510) * range + time * speed) % range;
  const along = (forward ? travelled : range - travelled) - range / 2;
  const line = (Math.floor(hash(index + 520) * 7) - 3.5) * PITCH;
  const lane = forward ? 0.95 : -0.95;
  return index % 2 === 0
    ? { x: along + shift, z: line + lane, rotation: forward ? 0 : Math.PI }
    : { x: line + shift - lane, z: along, rotation: forward ? -Math.PI / 2 : Math.PI / 2 };
}
