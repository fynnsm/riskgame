import {
  BoxGeometry,
  Color,
  DirectionalLight,
  Group,
  HemisphereLight,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshLambertMaterial,
  PerspectiveCamera,
  Quaternion,
  Scene,
  Vector3,
  WebGLRenderer,
} from 'three';
import type { BuildingKind } from '../content/schema.ts';
import type { LotModel, SceneModel, SceneView } from '../core/scene.ts';
import type { Logger } from '../logging/logger.ts';

/**
 * Draws what core decided. No rule lives here: tilt, wobble and floor offsets arrive
 * ready-made in the SceneModel (CLAUDE.md, rule 2).
 */

const LOT_SPACING = 7;
const FLOOR_WIDTH = 2.6;
const FLOOR_HEIGHT = 1;
const SLAB_TOP = 0.25;
const ROAD_Z = 5.4;
const CAR_COUNT = 6;
const CAR_RANGE = 90;

const PALETTE: Record<BuildingKind, { body: number; roof: number }> = {
  wohnhaus: { body: 0xe9c46a, roof: 0xb5543c },
  buero: { body: 0x8ecae6, roof: 0x4f6d7a },
  schule: { body: 0xf4a261, roof: 0x7a4b2a },
  spital: { body: 0xf3f5f0, roof: 0x2a9d8f },
  turm: { body: 0xb9a7e6, roof: 0x5b4a8a },
};
const SCENERY_COLORS = [0xd9d2c5, 0xc8b6a6, 0xa9bcd0, 0xe6ccb2, 0xb7c9a8, 0xd4a5a5];
const CAR_COLORS = [0xd1495b, 0x00798c, 0xedae49, 0x30638e, 0xffffff, 0x66a182];

export interface ThreeViewOptions {
  logger: Logger;
  /** N-304: no wobble, no falling floors, no gliding camera. */
  reducedMotion: boolean;
}

interface LotVisual {
  key: string;
  group: Group;
  pivot: Group | null;
  floors: Mesh[];
  floorHomes: Vector3[];
  windows: InstancedMesh | null;
  baseRotX: number;
  baseRotZ: number;
  wobble: number;
  dirX: number;
  dirZ: number;
  /** Time the top floor started dropping in, or null. */
  dropStart: number | null;
  /** Time the collapse started; -Infinity shows the rubble at once. Null while standing. */
  collapseStart: number | null;
  floorCount: number;
  collapsed: boolean;
}

/** Deterministic stand-in for randomness, so the city looks the same on every visit. */
function hash(n: number): number {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

export function createThreeView(host: HTMLElement, options: ThreeViewOptions): SceneView {
  const { logger, reducedMotion } = options;

  const renderer = new WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  // N-205: more than 2 costs fill rate on phones without a visible gain.
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  const canvas = renderer.domElement;
  host.append(canvas);

  const scene = new Scene();
  scene.background = new Color(0xbfe3f5);
  const camera = new PerspectiveCamera(40, 1, 0.5, 400);

  const unitBox = new BoxGeometry(1, 1, 1);
  const materials = new Map<number, MeshLambertMaterial>();
  const instanced: InstancedMesh[] = [];

  function material(color: number): MeshLambertMaterial {
    let found = materials.get(color);
    if (!found) {
      found = new MeshLambertMaterial({ color });
      materials.set(color, found);
    }
    return found;
  }

  function box(
    color: number,
    w: number,
    h: number,
    d: number,
    x: number,
    y: number,
    z: number,
  ): Mesh {
    const mesh = new Mesh(unitBox, material(color));
    mesh.scale.set(w, h, d);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  }

  const hemisphere = new HemisphereLight(0xffffff, 0x8a9aaa, 1.5);
  const sun = new DirectionalLight(0xffffff, 1.9);
  sun.position.set(14, 24, 16);
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.left = -30;
  sun.shadow.camera.right = 30;
  sun.shadow.camera.top = 30;
  sun.shadow.camera.bottom = -30;
  sun.shadow.camera.far = 90;
  scene.add(hemisphere, sun);

  // --- Static scenery (F-410): one draw call per kind of object (N-201). ---
  const scenery = new Group();
  const extras = new Group();
  scene.add(scenery, extras);

  const ground = box(0x8fc97a, 400, 0.2, 400, 0, -0.1, 0);
  ground.castShadow = false;
  const road = box(0x4a4f57, 400, 0.06, 3.4, 0, 0.03, ROAD_Z);
  road.castShadow = false;
  scenery.add(ground, road);

  const matrix = new Matrix4();
  const position = new Vector3();
  const scale = new Vector3();
  const noRotation = new Quaternion();

  function placeInstance(
    mesh: InstancedMesh,
    i: number,
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    d: number,
  ): void {
    matrix.compose(position.set(x, y, z), noRotation, scale.set(w, h, d));
    mesh.setMatrixAt(i, matrix);
  }

  function instancedBoxes(count: number, color: number, parent: Group): InstancedMesh {
    const mesh = new InstancedMesh(unitBox, material(color), count);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    instanced.push(mesh);
    parent.add(mesh);
    return mesh;
  }

  const markings = instancedBoxes(60, 0xf2f2f2, scenery);
  markings.castShadow = false;
  for (let i = 0; i < 60; i++)
    placeInstance(markings, i, (i - 30) * 3, 0.07, ROAD_Z, 1, 0.02, 0.14);

  // Houses behind the building lots only: in front they would block the view of the level.
  const HOUSE_COUNT = 54;
  const houses = instancedBoxes(HOUSE_COUNT, 0xffffff, scenery);
  const tint = new Color();
  for (let i = 0; i < HOUSE_COUNT; i++) {
    const row = i % 3;
    const column = Math.floor(i / 3) - HOUSE_COUNT / 6;
    const w = 2.2 + hash(i) * 1.8;
    const h = 1.6 + hash(i + 50) * (2.5 + row * 2.2);
    const d = 2.2 + hash(i + 100) * 1.6;
    const x = column * 5.2 + (hash(i + 150) - 0.5) * 1.4;
    const z = -8 - row * 6 - hash(i + 200) * 1.5;
    placeInstance(houses, i, x, h / 2, z, w, h, d);
    houses.setColorAt(i, tint.setHex(SCENERY_COLORS[i % SCENERY_COLORS.length] ?? 0xffffff));
  }

  const TREE_COUNT = 30;
  const trunks = instancedBoxes(TREE_COUNT, 0x7a5a3a, extras);
  const crowns = instancedBoxes(TREE_COUNT, 0x4f9d5d, extras);
  for (let i = 0; i < TREE_COUNT; i++) {
    const behind = i % 2 === 0;
    const x = (i - TREE_COUNT / 2) * 3.1 + (hash(i + 300) - 0.5) * 1.2;
    const z = behind ? -4.6 - hash(i + 350) : ROAD_Z + 2.6 + hash(i + 350) * 0.6;
    const size = 0.9 + hash(i + 400) * 0.5;
    placeInstance(trunks, i, x, 0.4, z, 0.25, 0.8, 0.25);
    placeInstance(crowns, i, x, 0.8 + size / 2, z, size, size, size);
  }

  const carBodies = instancedBoxes(CAR_COUNT, 0xffffff, extras);
  const carCabins = instancedBoxes(CAR_COUNT, 0xdfe7ee, extras);
  for (let i = 0; i < CAR_COUNT; i++) {
    carBodies.setColorAt(i, tint.setHex(CAR_COLORS[i % CAR_COLORS.length] ?? 0xffffff));
  }

  function moveCars(time: number): void {
    for (let i = 0; i < CAR_COUNT; i++) {
      const forward = i % 2 === 0;
      const speed = 3 + hash(i + 500) * 2;
      const travelled = (i * (CAR_RANGE / CAR_COUNT) + time * speed) % CAR_RANGE;
      const x = forward ? travelled - CAR_RANGE / 2 : CAR_RANGE / 2 - travelled;
      const z = ROAD_Z + (forward ? 0.8 : -0.8);
      placeInstance(carBodies, i, x, 0.36, z, 1.5, 0.45, 0.75);
      placeInstance(carCabins, i, x - (forward ? 0.1 : -0.1), 0.75, z, 0.75, 0.35, 0.65);
    }
    carBodies.instanceMatrix.needsUpdate = true;
    carCabins.instanceMatrix.needsUpdate = true;
  }

  // --- Lots and buildings ---
  const lotsGroup = new Group();
  scene.add(lotsGroup);
  let visuals: LotVisual[] = [];
  let model: SceneModel | null = null;
  let clock = 0;

  function lotX(index: number, count: number): number {
    return (index - (count - 1) / 2) * LOT_SPACING;
  }

  function addRoof(pivot: Group, kind: BuildingKind, x: number, y: number, z: number): void {
    const color = PALETTE[kind].roof;
    const w = FLOOR_WIDTH;
    switch (kind) {
      case 'wohnhaus':
        pivot.add(box(color, w + 0.3, 0.3, w + 0.3, x, y + 0.15, z));
        pivot.add(box(color, w * 0.7, 0.3, w + 0.3, x, y + 0.45, z));
        pivot.add(box(color, w * 0.35, 0.3, w + 0.3, x, y + 0.75, z));
        break;
      case 'buero':
        pivot.add(box(color, w + 0.2, 0.2, w + 0.2, x, y + 0.1, z));
        pivot.add(box(0xcfd8dc, 0.8, 0.4, 0.6, x + 0.5, y + 0.4, z - 0.4));
        break;
      case 'schule':
        pivot.add(box(color, w + 0.3, 0.25, w + 0.3, x, y + 0.12, z));
        pivot.add(box(PALETTE.schule.body, 0.7, 0.9, 0.7, x, y + 0.7, z));
        pivot.add(box(color, 0.9, 0.2, 0.9, x, y + 1.25, z));
        break;
      case 'spital':
        pivot.add(box(0xdfe5e8, w + 0.2, 0.2, w + 0.2, x, y + 0.1, z));
        // A plain plus sign in the building's accent colour, visible from the front.
        pivot.add(box(color, 0.3, 1, 0.12, x, y + 0.75, z + w / 2));
        pivot.add(box(color, 1, 0.3, 0.12, x, y + 0.75, z + w / 2));
        break;
      case 'turm':
        pivot.add(box(color, w * 0.7, 0.6, w * 0.7, x, y + 0.3, z));
        pivot.add(box(0x444b57, 0.12, 1.6, 0.12, x, y + 1.4, z));
        break;
    }
  }

  function buildLot(
    lot: LotModel,
    index: number,
    count: number,
    previous: LotVisual | undefined,
  ): LotVisual {
    const group = new Group();
    group.position.set(lotX(index, count), 0, 0);
    const slabColor = lot.status === 'locked' ? 0x9aa3ad : 0xd9cfb8;
    const slab = box(slabColor, 3.8, SLAB_TOP, 3.8, 0, SLAB_TOP / 2, 0);
    slab.castShadow = false;
    group.add(slab);

    const visual: LotVisual = {
      key: JSON.stringify(lot),
      group,
      pivot: null,
      floors: [],
      floorHomes: [],
      windows: null,
      baseRotX: 0,
      baseRotZ: 0,
      wobble: 0,
      dirX: 0,
      dirZ: 0,
      dropStart: null,
      collapseStart: null,
      floorCount: 0,
      collapsed: lot.collapsed,
    };

    if (lot.status === 'open') {
      // Corner posts mark a construction site that is ready to be built on.
      for (const [sx, sz] of [
        [-1, -1],
        [1, -1],
        [-1, 1],
        [1, 1],
      ] as const) {
        group.add(box(0xf28c28, 0.18, 0.8, 0.18, sx * 1.7, SLAB_TOP + 0.4, sz * 1.7));
      }
    }

    const building = lot.building;
    if (building) {
      const pivot = new Group();
      pivot.position.y = SLAB_TOP;
      const tilt = (building.tiltDegrees * Math.PI) / 180;
      // Leaning towards +x means rotating around z in the negative sense, towards +z around x.
      visual.baseRotZ = -building.dirX * tilt;
      visual.baseRotX = building.dirZ * tilt;
      visual.wobble = building.wobble * (lot.status === 'active' ? 1 : 0.35);
      visual.dirX = building.dirX;
      visual.dirZ = building.dirZ;
      pivot.rotation.set(visual.baseRotX, 0, visual.baseRotZ);

      const colors = PALETTE[building.kind];
      const windowsPerFloor = 8;
      const windows =
        building.floors.length > 0
          ? new InstancedMesh(unitBox, material(0x2b4a6f), building.floors.length * windowsPerFloor)
          : null;
      building.floors.forEach((floor, i) => {
        const x = floor.offsetX * FLOOR_WIDTH;
        const z = floor.offsetZ * FLOOR_WIDTH;
        const y = i * FLOOR_HEIGHT + FLOOR_HEIGHT / 2;
        const body = box(colors.body, FLOOR_WIDTH, FLOOR_HEIGHT * 0.9, FLOOR_WIDTH, x, y, z);
        const ledge = box(colors.roof, 1.06, 0.1 / 0.9, 1.06, 0, 0.5, 0);
        body.add(ledge);
        pivot.add(body);
        visual.floors.push(body);
        visual.floorHomes.push(new Vector3(x, y, z));
        if (windows) {
          const half = FLOOR_WIDTH / 2 + 0.01;
          for (let k = 0; k < windowsPerFloor; k++) {
            const side = k >> 1;
            const along = (k % 2 === 0 ? -1 : 1) * 0.6;
            const wx = side === 0 ? along : side === 1 ? along : side === 2 ? -half : half;
            const wz = side === 0 ? half : side === 1 ? -half : along;
            const thinX = side >= 2;
            placeInstance(
              windows,
              i * windowsPerFloor + k,
              x + wx,
              y,
              z + wz,
              thinX ? 0.04 : 0.5,
              0.45,
              thinX ? 0.5 : 0.04,
            );
          }
        }
      });
      if (windows) {
        instanced.push(windows);
        pivot.add(windows);
        visual.windows = windows;
      }
      const top = building.floors[building.floors.length - 1];
      if (lot.status === 'done' && top) {
        addRoof(
          pivot,
          building.kind,
          top.offsetX * FLOOR_WIDTH,
          building.floors.length * FLOOR_HEIGHT,
          top.offsetZ * FLOOR_WIDTH,
        );
      }
      group.add(pivot);
      visual.pivot = pivot;
      visual.floorCount = building.floors.length;

      if (lot.collapsed) {
        // Animate only the moment it happens; after a reload the rubble is simply there.
        const justHappened = previous !== undefined && !previous.collapsed;
        visual.collapseStart = justHappened && !reducedMotion ? clock : -Infinity;
        if (windows) windows.visible = false;
      } else if (
        lot.status === 'active' &&
        previous &&
        building.floors.length === previous.floorCount + 1 &&
        !reducedMotion
      ) {
        visual.dropStart = clock;
      }
    }
    return visual;
  }

  function removeLot(visual: LotVisual): void {
    lotsGroup.remove(visual.group);
    if (visual.windows) {
      instanced.splice(instanced.indexOf(visual.windows), 1);
      visual.windows.dispose();
    }
  }

  function animateLot(visual: LotVisual, time: number): void {
    const pivot = visual.pivot;
    if (!pivot) return;

    if (visual.collapseStart !== null) {
      const t = Math.min(time - visual.collapseStart, 10);
      const gravity = 14;
      visual.floors.forEach((floor, i) => {
        const home = visual.floorHomes[i] as Vector3;
        const vx = visual.dirX * (1.2 + 0.5 * i) + (hash(i + 600) - 0.5) * 1.6;
        const vz = visual.dirZ * (1.2 + 0.5 * i) + (hash(i + 610) - 0.5) * 1.6;
        const vy = 1.2 + hash(i + 620) * 1.6;
        const rest = FLOOR_HEIGHT * 0.45 + (i % 2) * 0.25;
        const landing =
          (vy + Math.sqrt(vy * vy + 2 * gravity * Math.max(0, home.y - rest))) / gravity;
        const te = Math.min(t, landing);
        floor.position.set(
          home.x + vx * te,
          Math.max(rest, home.y + vy * te - (gravity / 2) * te * te),
          home.z + vz * te,
        );
        floor.rotation.set(te * (hash(i + 630) - 0.5) * 3, 0, te * (hash(i + 640) - 0.5) * 3);
      });
      return;
    }

    if (visual.dropStart !== null) {
      const progress = Math.min(1, (time - visual.dropStart) / 0.4);
      const top = visual.floors[visual.floors.length - 1];
      const home = visual.floorHomes[visual.floorHomes.length - 1];
      if (top && home) top.position.y = home.y + (1 - progress) * (1 - progress) * 3.5;
      if (progress >= 1) visual.dropStart = null;
    }

    if (visual.wobble > 0 && !reducedMotion) {
      const amplitude = visual.wobble * 0.022;
      pivot.rotation.z = visual.baseRotZ + Math.sin(time * 9) * amplitude;
      pivot.rotation.x = visual.baseRotX + Math.cos(time * 7.3) * amplitude * 0.6;
    }
  }

  // --- Camera ---
  const cameraGoal = new Vector3();
  const targetGoal = new Vector3();
  const target = new Vector3();
  let cameraSnapped = false;

  function updateCameraGoal(): void {
    const vertical = (camera.fov * Math.PI) / 180;
    const horizontal = 2 * Math.atan(Math.tan(vertical / 2) * camera.aspect);
    const count = model?.lots.length ?? 5;
    if (!model || model.mode === 'city' || model.focus === null) {
      const width = count * LOT_SPACING + 3;
      const distance = Math.max(20, width / 2 / Math.tan(horizontal / 2));
      targetGoal.set(0, 2.4, 0);
      cameraGoal.set(0, 2.4 + distance * 0.42, distance * 0.92);
      return;
    }
    const floors = model.lots[model.focus]?.building?.floors.length ?? 0;
    const height = Math.max(4, floors * FLOOR_HEIGHT + 3);
    const distance = Math.max(
      height / 2 / Math.tan(vertical / 2) + 3,
      4.2 / Math.tan(horizontal / 2),
    );
    const x = lotX(model.focus, count);
    targetGoal.set(x, height * 0.42, 0);
    cameraGoal.set(x + distance * 0.34, height * 0.42 + distance * 0.3, distance * 0.9);
  }

  function resize(): void {
    const width = Math.max(1, host.clientWidth);
    const height = Math.max(1, host.clientHeight);
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    updateCameraGoal();
  }

  // --- Quality steps (N-203): 2 = shadows, 1 = no shadows, 0 = also no trees and cars ---
  let quality = window.matchMedia('(pointer: coarse)').matches ? 1 : 2;

  function applyQuality(): void {
    const shadows = quality >= 2;
    renderer.shadowMap.enabled = shadows;
    sun.castShadow = shadows;
    extras.visible = quality >= 1;
    for (const m of materials.values()) m.needsUpdate = true;
  }

  // --- Loop ---
  let frame = 0;
  let lastTime: number | null = null;
  let sampleStart = 0;
  let sampleFrames = 0;
  let disposed = false;

  function tick(now: number): void {
    if (disposed) return;
    frame = requestAnimationFrame(tick);
    const seconds = now / 1000;
    const dt = lastTime === null ? 0 : Math.min(0.1, seconds - lastTime);
    if (lastTime === null) sampleStart = seconds;
    lastTime = seconds;
    clock += dt;

    if (quality >= 1) moveCars(reducedMotion ? 0 : clock);
    for (const visual of visuals) animateLot(visual, clock);

    const ease = reducedMotion || !cameraSnapped ? 1 : 1 - Math.exp(-dt * 3.5);
    camera.position.lerp(cameraGoal, ease);
    target.lerp(targetGoal, ease);
    camera.lookAt(target);
    cameraSnapped = true;

    renderer.render(scene, camera);

    sampleFrames += 1;
    if (seconds - sampleStart >= 3) {
      const fps = sampleFrames / (seconds - sampleStart);
      if (fps < 28 && quality > 0) {
        quality -= 1;
        applyQuality();
        logger.warn('render.fps.low', { fps: Math.round(fps), quality });
      }
      sampleStart = seconds;
      sampleFrames = 0;
    }
  }

  function start(): void {
    if (disposed || frame !== 0) return;
    lastTime = null;
    sampleFrames = 0;
    frame = requestAnimationFrame(tick);
  }

  function stop(): void {
    cancelAnimationFrame(frame);
    frame = 0;
  }

  // N-205: a hidden tab gets no frames, and the pause must not count as a frame-rate drop.
  function onVisibility(): void {
    if (document.hidden) stop();
    else start();
  }

  function onContextLost(event: Event): void {
    event.preventDefault();
    stop();
    logger.warn('render.context.lost');
  }

  function onContextRestored(): void {
    logger.info('render.context.restored');
    applyQuality();
    start();
  }

  const observer = new ResizeObserver(resize);
  observer.observe(host);
  document.addEventListener('visibilitychange', onVisibility);
  canvas.addEventListener('webglcontextlost', onContextLost);
  canvas.addEventListener('webglcontextrestored', onContextRestored);

  applyQuality();
  resize();
  if (!document.hidden) start();
  logger.info('render.init', { quality, reducedMotion });

  return {
    render(next: SceneModel): void {
      const count = next.lots.length;
      const updated: LotVisual[] = [];
      next.lots.forEach((lot, index) => {
        const previous = visuals[index];
        const key = JSON.stringify(lot);
        if (previous && previous.key === key && visuals.length === count) {
          updated.push(previous);
          return;
        }
        const visual = buildLot(lot, index, count, previous);
        if (previous) removeLot(previous);
        lotsGroup.add(visual.group);
        updated.push(visual);
      });
      visuals.slice(count).forEach(removeLot);
      visuals = updated;
      model = next;
      updateCameraGoal();
    },

    dispose(): void {
      disposed = true;
      stop();
      observer.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
      canvas.removeEventListener('webglcontextlost', onContextLost);
      canvas.removeEventListener('webglcontextrestored', onContextRestored);
      for (const mesh of instanced) mesh.dispose();
      unitBox.dispose();
      for (const m of materials.values()) m.dispose();
      renderer.dispose();
      canvas.remove();
      logger.info('render.disposed');
    },
  };
}
