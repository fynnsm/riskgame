import type { BoxGeometry, Material } from 'three';
import {
  Color,
  Euler,
  InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
  Quaternion,
  Vector3,
} from 'three';
import type { TreeSpot } from './city.ts';
import type { Quality } from './director.ts';
import {
  cloudVisibility,
  createDecorRandom,
  decorationFor,
  nextPlaneDelay,
  planeLateralOffset,
  planeMayCrossCentre,
} from './director.ts';
import { C } from './palette.ts';
import type { TrafficGrid, Vehicle, VehicleKind } from './traffic.ts';
import { createTraffic, stepTraffic, VEHICLE_SIZE, vehiclePosition } from './traffic.ts';
import { TUNING } from './tuning.ts';

/**
 * Everything that moves for decoration only (B3): traffic, clouds, a plane, a balloon,
 * birds, pedestrians, chimney smoke, swaying trees and glints on the water.
 *
 * All of it lives in one InstancedMesh, so the whole layer costs a single draw call.
 * Each kind of thing owns a fixed range of instances; what is not shown is scaled to zero.
 * Nothing in here reads or changes the game: it gets the time, the quality step and where
 * the building stands, and draws.
 */

export interface LifeContext {
  /** Seconds since the scene started; stands still with reduced motion. */
  time: number;
  dt: number;
  night: boolean;
  deciding: boolean;
  /** Ground position of the building in focus, or null on the city view. */
  focus: { x: number; z: number } | null;
  /** Places no cloud may cover: the building in focus, or every lot on the city view. */
  keepClear: readonly { x: number; z: number }[];
}

export interface Life {
  meshes: InstancedMesh[];
  setQuality(quality: Quality): void;
  update(context: LifeContext): void;
  dispose(): void;
}

interface LifeOptions {
  unitBox: BoxGeometry;
  lit: Material;
  glow: Material;
  grid: TrafficGrid;
  swayTrees: readonly TreeSpot[];
  ponds: readonly { x: number; z: number }[];
  chimneys: readonly { x: number; y: number; z: number }[];
  /** Unit vector from the scene towards the camera. */
  viewDirection: Vector3;
  seed: number;
}

const MAX_VEHICLES = 48;
const MAX_CLOUDS = 10;
const CLOUD_BOXES = 4;
const PLANE_BOXES = 6;
const BALLOON_BOXES = 4;
const SMOKE_PUFFS = 3;
const WALKER_BOXES = 3;
const GLINTS_PER_POND = 3;

const VEHICLE_COLORS: Record<VehicleKind, readonly number[]> = {
  auto: [C.red, C.yellow, C.carBlue, C.green, C.white, C.carOrange],
  lieferwagen: [C.van, C.paleBlue],
  bus: [C.bus],
  tram: [C.tram],
};
const SHIRTS = [C.red, C.carBlue, C.yellow, C.teal, C.purple, C.white];
const SKIN = [C.skinA, C.skinB, C.skinC, C.skinD];

export function createLife(options: LifeOptions): Life {
  const { grid } = options;
  const random = createDecorRandom(options.seed);
  const walkers = TUNING.decoration.pedestrians;
  const birds = TUNING.decoration.birds;

  // Fixed ranges of instances, one after the other.
  let cursor = 0;
  const range = (size: number): number => {
    const start = cursor;
    cursor += size;
    return start;
  };
  const AT = {
    vehicles: range(MAX_VEHICLES * 2),
    clouds: range(MAX_CLOUDS * CLOUD_BOXES),
    plane: range(PLANE_BOXES),
    balloon: range(BALLOON_BOXES),
    birds: range(birds),
    smoke: range(options.chimneys.length * SMOKE_PUFFS),
    walkers: range(walkers * WALKER_BOXES),
    trees: range(options.swayTrees.length * 2),
    glints: range(options.ponds.length * GLINTS_PER_POND),
  };

  const mesh = new InstancedMesh(options.unitBox, options.lit, cursor);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.frustumCulled = false;

  // Soft patches under clouds, plane and balloon where there are no real shadows.
  const shade = new MeshBasicMaterial({
    color: 0x000000,
    transparent: true,
    opacity: TUNING.decoration.shadowOpacity,
    depthWrite: false,
  });
  const shadows = new InstancedMesh(options.unitBox, shade, MAX_CLOUDS + 2);
  shadows.frustumCulled = false;
  shadows.renderOrder = 1;

  const headlights = new InstancedMesh(options.unitBox, options.glow, MAX_VEHICLES);
  headlights.frustumCulled = false;

  const matrix = new Matrix4();
  const position = new Vector3();
  const scale = new Vector3();
  const quaternion = new Quaternion();
  const euler = new Euler();
  const tint = new Color();

  function put(
    target: InstancedMesh,
    index: number,
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    d: number,
    rotY = 0,
    rotZ = 0,
  ): void {
    quaternion.setFromEuler(euler.set(0, rotY, rotZ));
    matrix.compose(position.set(x, y, z), quaternion, scale.set(w, h, d));
    target.setMatrixAt(index, matrix);
  }
  const hide = (target: InstancedMesh, index: number): void =>
    put(target, index, 0, -50, 0, 0, 0, 0);
  const paint = (index: number, color: number): void => {
    mesh.setColorAt(index, tint.setHex(color));
  };

  // --- Things that keep their place in the list for good ---
  const half = ((grid.reach * 2 + 1) * grid.pitch) / 2;
  const clouds = Array.from({ length: MAX_CLOUDS }, (_, i) => ({
    x: (random() - 0.5) * TUNING.decoration.cloud.range,
    z: (random() - 0.5) * TUNING.decoration.cloud.range,
    y: TUNING.decoration.cloud.heights[i % 2] ?? 17,
    size: 2.6 + random() * 2.2,
    speed: TUNING.decoration.cloud.speed * (0.7 + random() * 0.6),
  }));
  const walkerList = Array.from({ length: walkers }, (_, i) => ({
    // Blocks around the centre; each walker circles one of them on the pavement.
    blockX: (Math.floor(random() * 5) - 2) * grid.pitch + grid.shift,
    blockZ: (Math.floor(random() * 4) - 2) * grid.pitch + (i % 2 === 0 ? grid.pitch : 0),
    offset: random(),
    speed: (0.7 + random() * 0.5) * (random() < 0.5 ? 1 : -1),
    shirt: SHIRTS[i % SHIRTS.length] ?? C.white,
    skin: SKIN[i % SKIN.length] ?? C.skinA,
  }));
  const plane = { nextAt: nextPlaneDelay(random()) * 0.3, startedAt: -1, offset: 0 };

  // Colours never change, so they are set once.
  clouds.forEach((_, i) => {
    for (let b = 0; b < CLOUD_BOXES; b++)
      paint(AT.clouds + i * CLOUD_BOXES + b, b === 3 ? C.cloudShade : C.cloud);
  });
  [C.white, C.white, C.white, C.red, C.red, C.carGlass].forEach((color, b) =>
    paint(AT.plane + b, color),
  );
  [C.balloon, C.yellow, C.balloon, C.wood].forEach((color, b) => paint(AT.balloon + b, color));
  for (let b = 0; b < birds; b++) paint(AT.birds + b, C.bird);
  for (let b = 0; b < options.chimneys.length * SMOKE_PUFFS; b++) paint(AT.smoke + b, C.smoke);
  walkerList.forEach((walker, i) => {
    paint(AT.walkers + i * WALKER_BOXES, C.trousers);
    paint(AT.walkers + i * WALKER_BOXES + 1, walker.shirt);
    paint(AT.walkers + i * WALKER_BOXES + 2, walker.skin);
  });
  options.swayTrees.forEach((tree, i) => {
    paint(AT.trees + i * 2, tree.color);
    paint(AT.trees + i * 2 + 1, C.treeLight);
  });
  for (let b = 0; b < options.ponds.length * GLINTS_PER_POND; b++) paint(AT.glints + b, C.white);
  for (let i = 0; i < MAX_VEHICLES; i++) headlights.setColorAt(i, tint.setHex(C.headlight));
  for (let i = 0; i < MAX_CLOUDS + 2; i++) shadows.setColorAt(i, tint.setHex(0x000000));

  let quality: Quality = 2;
  let decoration = decorationFor(quality);
  let vehicles: Vehicle[] = [];

  function placeVehicles(): void {
    vehicles = createTraffic(
      createDecorRandom(options.seed + 1),
      grid,
      decoration.richTraffic,
    ).slice(0, MAX_VEHICLES);
    vehicles.forEach((vehicle, i) => {
      const palette = VEHICLE_COLORS[vehicle.kind];
      paint(AT.vehicles + i * 2, palette[i % palette.length] ?? C.white);
      paint(AT.vehicles + i * 2 + 1, C.carGlass);
    });
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }

  /** Distance on the ground from the spot a thing in the sky covers on screen to the nearest place to keep clear. */
  function coveredDistance(
    x: number,
    y: number,
    z: number,
    keepClear: LifeContext['keepClear'],
  ): number | null {
    if (keepClear.length === 0) return null;
    const along = y / options.viewDirection.y;
    const gx = x - options.viewDirection.x * along;
    const gz = z - options.viewDirection.z * along;
    return Math.min(...keepClear.map((place) => Math.hypot(gx - place.x, gz - place.z)));
  }

  function update(context: LifeContext): void {
    const { time, dt } = context;

    // Traffic
    stepTraffic(vehicles, time, dt, grid);
    for (let i = 0; i < MAX_VEHICLES; i++) {
      const vehicle = vehicles[i];
      const at = AT.vehicles + i * 2;
      if (!vehicle) {
        hide(mesh, at);
        hide(mesh, at + 1);
        hide(headlights, i);
        continue;
      }
      const size = VEHICLE_SIZE[vehicle.kind];
      const { x, z } = vehiclePosition(vehicle, grid);
      const turn = vehicle.axis === 'x' ? 0 : Math.PI / 2;
      const tall = vehicle.kind === 'auto' ? 0.42 : 0.3;
      put(mesh, at, x, 0.22 + size.height / 2, z, size.length, size.height, size.width, turn);
      // Cars carry a cabin; the long vehicles a strip of windows along the roof line.
      const cabin = vehicle.kind === 'auto' ? size.length * 0.52 : size.length * 0.9;
      put(
        mesh,
        at + 1,
        x,
        0.22 + size.height + tall / 2 - 0.02,
        z,
        cabin,
        tall,
        size.width * 0.84,
        turn,
      );
      const ahead = size.length / 2 + 0.04;
      put(
        headlights,
        i,
        x + (vehicle.axis === 'x' ? vehicle.dir * ahead : 0),
        0.22 + size.height * 0.5,
        z + (vehicle.axis === 'z' ? vehicle.dir * ahead : 0),
        vehicle.axis === 'x' ? 0.1 : size.width * 0.8,
        0.16,
        vehicle.axis === 'x' ? size.width * 0.8 : 0.1,
      );
    }

    // Clouds, in two heights, drifting along x and wrapping around
    const cloudRange = TUNING.decoration.cloud.range;
    for (let i = 0; i < MAX_CLOUDS; i++) {
      const cloud = clouds[i] as (typeof clouds)[number];
      const at = AT.clouds + i * CLOUD_BOXES;
      const x =
        ((((cloud.x + time * cloud.speed + cloudRange / 2) % cloudRange) + cloudRange) %
          cloudRange) -
        cloudRange / 2;
      const shown =
        i < decoration.clouds
          ? cloudVisibility(coveredDistance(x, cloud.y, cloud.z, context.keepClear))
          : 0;
      if (shown <= 0.001) {
        for (let b = 0; b < CLOUD_BOXES; b++) hide(mesh, at + b);
        hide(shadows, i);
        continue;
      }
      const s = cloud.size * shown;
      put(mesh, at, x, cloud.y, cloud.z, s * 1.6, s * 0.5, s);
      put(
        mesh,
        at + 1,
        x - s * 0.45,
        cloud.y + s * 0.3,
        cloud.z + s * 0.1,
        s * 0.8,
        s * 0.5,
        s * 0.75,
      );
      put(
        mesh,
        at + 2,
        x + s * 0.4,
        cloud.y + s * 0.22,
        cloud.z - s * 0.1,
        s * 0.75,
        s * 0.4,
        s * 0.7,
      );
      put(mesh, at + 3, x + s * 0.1, cloud.y - s * 0.2, cloud.z, s * 1.2, s * 0.2, s * 0.8);
      if (decoration.softShadows) hide(shadows, i);
      else put(shadows, i, x - 3, 0.5, cloud.z - 1, s * 1.7, 0.02, s * 1.1);
    }

    // Plane: now and then, and never over the building while a level is played
    const planeShadow = MAX_CLOUDS;
    if (decoration.planes && plane.startedAt < 0 && time >= plane.nextAt) {
      plane.startedAt = time;
      plane.offset = planeLateralOffset(
        random(),
        context.focus === null && planeMayCrossCentre(context.deciding ? 'situation' : null),
      );
    }
    const flight = TUNING.decoration.plane;
    const flown = plane.startedAt < 0 ? -1 : (time - plane.startedAt) / flight.seconds;
    if (!decoration.planes || flown < 0 || flown > 1) {
      for (let b = 0; b < PLANE_BOXES; b++) hide(mesh, AT.plane + b);
      hide(shadows, planeShadow);
      if (flown > 1) {
        plane.startedAt = -1;
        plane.nextAt = time + nextPlaneDelay(random());
      }
    } else {
      // The offset is measured on screen, so the path is shifted along the ground under the camera.
      const along = flight.height / options.viewDirection.y;
      const centreX = (context.focus?.x ?? 0) + options.viewDirection.x * along;
      const centreZ = (context.focus?.z ?? 0) + options.viewDirection.z * along;
      const x = centreX + (flown - 0.5) * flight.range;
      const z = centreZ + plane.offset;
      const y = flight.height;
      put(mesh, AT.plane, x, y, z, 4.2, 0.7, 0.7);
      put(mesh, AT.plane + 1, x + 0.2, y, z, 1, 0.14, 4.6);
      put(mesh, AT.plane + 2, x - 1.8, y + 0.1, z, 0.6, 0.12, 1.8);
      put(mesh, AT.plane + 3, x - 1.9, y + 0.55, z, 0.7, 0.8, 0.12);
      put(mesh, AT.plane + 4, x + 2.2, y, z, 0.3, 0.5, 0.5);
      put(mesh, AT.plane + 5, x + 1.3, y + 0.2, z, 0.9, 0.36, 0.72);
      if (decoration.softShadows) hide(shadows, planeShadow);
      else put(shadows, planeShadow, x - 5, 0.5, z - 1.5, 4, 0.02, 4);
    }

    // Balloon, drifting very slowly near the edge
    const balloonShadow = MAX_CLOUDS + 1;
    if (decoration.balloon) {
      const x = -half * 0.55 + Math.sin(time * 0.05) * 9;
      const z = -half * 0.35 + Math.cos(time * 0.04) * 7;
      const y = 15 + Math.sin(time * 0.3) * 0.5;
      put(mesh, AT.balloon, x, y, z, 2.6, 2.8, 2.6);
      put(mesh, AT.balloon + 1, x, y, z, 2.7, 0.7, 2.7);
      put(mesh, AT.balloon + 2, x, y - 1.7, z, 1.6, 0.7, 1.6);
      put(mesh, AT.balloon + 3, x, y - 2.9, z, 0.7, 0.6, 0.7);
      hide(shadows, balloonShadow);
    } else {
      for (let b = 0; b < BALLOON_BOXES; b++) hide(mesh, AT.balloon + b);
      hide(shadows, balloonShadow);
    }

    // Birds: a small flock that passes rarely
    const flock = (time % 80) / 26;
    for (let b = 0; b < birds; b++) {
      if (!decoration.birds || flock > 1) {
        hide(mesh, AT.birds + b);
        continue;
      }
      const row = Math.ceil(b / 2);
      const side = b % 2 === 0 ? 1 : -1;
      const x = -70 + flock * 140 - row * 0.9;
      const z = 30 - flock * 55 + side * row * 0.8;
      put(mesh, AT.birds + b, x, 13 + Math.sin(time * 9 + b) * 0.18, z, 0.34, 0.1, 0.5);
    }

    // Smoke from a few chimneys
    options.chimneys.forEach((chimney, c) => {
      for (let p = 0; p < SMOKE_PUFFS; p++) {
        const at = AT.smoke + c * SMOKE_PUFFS + p;
        if (!decoration.ambience) {
          hide(mesh, at);
          continue;
        }
        const life = (time * 0.35 + p / SMOKE_PUFFS + c * 0.37) % 1;
        const size = 0.25 + life * 0.5;
        put(mesh, at, chimney.x + life * 0.6, chimney.y + life * 2.6, chimney.z, size, size, size);
      }
    });

    // Pedestrians circling a block on the pavement
    walkerList.forEach((walker, i) => {
      const at = AT.walkers + i * WALKER_BOXES;
      if (!decoration.pedestrians) {
        for (let b = 0; b < WALKER_BOXES; b++) hide(mesh, at + b);
        return;
      }
      const side = 5.72;
      const around = (((walker.offset + (time * walker.speed) / (side * 8)) % 1) + 1) % 1;
      const leg = Math.floor(around * 4);
      const t = (around * 4 - leg) * 2 * side - side;
      const x = walker.blockX + (leg === 0 ? t : leg === 1 ? side : leg === 2 ? -t : -side);
      const z = walker.blockZ + (leg === 0 ? -side : leg === 1 ? t : leg === 2 ? side : -t);
      const bob = Math.abs(Math.sin(time * 9 + i)) * 0.05;
      put(mesh, at, x, 0.3 + 0.17, z, 0.22, 0.34, 0.2);
      put(mesh, at + 1, x, 0.3 + 0.52 + bob, z, 0.3, 0.38, 0.24);
      put(mesh, at + 2, x, 0.3 + 0.82 + bob, z, 0.22, 0.22, 0.22);
    });

    // Tree crowns near the centre: they sway a little where ambience is on
    options.swayTrees.forEach((tree, i) => {
      const lean = decoration.ambience ? Math.sin(time * 1.3 + tree.x * 0.7 + tree.z) * 0.045 : 0;
      put(
        mesh,
        AT.trees + i * 2,
        tree.x + lean * 1.1,
        1.5,
        tree.z,
        tree.size,
        0.8,
        tree.size,
        0,
        -lean,
      );
      put(
        mesh,
        AT.trees + i * 2 + 1,
        tree.x + lean * 2,
        2.2,
        tree.z,
        tree.size * 0.72,
        0.7,
        tree.size * 0.72,
        0,
        -lean,
      );
    });

    // Glints on the water
    options.ponds.forEach((pond, i) => {
      for (let g = 0; g < GLINTS_PER_POND; g++) {
        const at = AT.glints + i * GLINTS_PER_POND + g;
        const on = decoration.ambience && Math.sin(time * 1.7 + g * 2.1 + i) > 0.3;
        if (!on) hide(mesh, at);
        else
          put(
            mesh,
            at,
            pond.x - 1.4 + g * 1.3,
            0.49,
            pond.z - 0.8 + ((g * 7) % 3) * 0.7,
            0.7,
            0.02,
            0.12,
          );
      }
    });

    headlights.visible = context.night && decoration.nightLights;
    shadows.visible = !decoration.softShadows;
    mesh.instanceMatrix.needsUpdate = true;
    shadows.instanceMatrix.needsUpdate = true;
    headlights.instanceMatrix.needsUpdate = true;
  }

  placeVehicles();

  return {
    meshes: [mesh, shadows, headlights],
    setQuality(next: Quality): void {
      const richBefore = decoration.richTraffic;
      quality = next;
      decoration = decorationFor(quality);
      if (decoration.richTraffic !== richBefore) placeVehicles();
    },
    update,
    dispose(): void {
      mesh.dispose();
      shadows.dispose();
      headlights.dispose();
      shade.dispose();
    },
  };
}
