import { Euler, Matrix4, Quaternion, Vector3 } from 'three';

/** One coloured box, ready to become an instance of the shared unit cube. */
export interface Part {
  color: number;
  matrix: Matrix4;
}

const position = new Vector3();
const scale = new Vector3();
const quaternion = new Quaternion();
const euler = new Euler();

export function box(
  color: number,
  w: number,
  h: number,
  d: number,
  x: number,
  y: number,
  z: number,
  rotationY = 0,
): Part {
  quaternion.setFromEuler(euler.set(0, rotationY, 0));
  return {
    color,
    matrix: new Matrix4().compose(position.set(x, y, z), quaternion, scale.set(w, h, d)),
  };
}

/** Deterministic stand-in for randomness, so the city looks the same on every visit. */
export function hash(n: number): number {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

/** Darkens (factor below 1) or lightens a colour; used for trims and roofs. */
export function shade(color: number, factor: number): number {
  const channel = (shift: number) =>
    Math.min(255, Math.round(((color >> shift) & 0xff) * factor)) << shift;
  return channel(16) | channel(8) | channel(0);
}
