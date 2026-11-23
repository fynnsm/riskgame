import {
  BoxGeometry,
  Color,
  DirectionalLight,
  Euler,
  Group,
  HemisphereLight,
  InstancedMesh,
  Matrix4,
  MeshLambertMaterial,
  OrthographicCamera,
  Quaternion,
  Scene,
  Vector3,
  WebGLRenderer,
} from 'three';
import type { BuildingKind } from '../content/schema.ts';
import type { LotModel, SceneInsets, SceneModel, SceneView } from '../core/scene.ts';
import type { Logger } from '../logging/logger.ts';
import type { Part } from './boxes.ts';
import { box, hash, shade } from './boxes.ts';
import { buildCity, CAR_COUNT, carPlacement, lotPosition } from './city.ts';

/**
 * Draws what core decided. No rule lives here: tilt, wobble, floor offsets and damage
 * arrive ready-made in the SceneModel (CLAUDE.md, rule 2).
 *
 * Everything is a box. All boxes of one object share one InstancedMesh with a colour
 * per instance, so a whole building or the whole city costs a single draw call (N-201).
 */

const MODULE = 2;
const FLOOR_HEIGHT = 1.5;
const PLOT_TOP = 0.42;
const HANG_HEIGHT = 3.4;

/** The bright container colours of the sketch. Every kind uses all of them, starting elsewhere. */
const VIVID = [0xe5534b, 0xf28c38, 0xf6c945, 0x7bc950, 0x3f8fd9, 0x8e6bd1, 0x2ec4b6, 0xc9d3e6];

/** Each kind leans towards two colours, so the five towers stay recognisable in the city. */
const ACCENTS: Record<BuildingKind, [number, number]> = {
  wohnhaus: [0xe5534b, 0xf6c945],
  buero: [0x3f8fd9, 0xc9d3e6],
  schule: [0xf28c38, 0x7bc950],
  spital: [0xf4f7fa, 0x2ec4b6],
  turm: [0x8e6bd1, 0xf15bb5],
};

function paletteFor(kind: BuildingKind): number[] {
  const [first, second] = ACCENTS[kind];
  return [...VIVID, first, first, second];
}

const GLASS = 0x7fd3f7;
const FRAME = 0xffffff;
const CRANE = 0xf6c026;
const SKIN = [0xf1c27d, 0xc68642, 0xe0ac69, 0x8d5524];

export interface ThreeViewOptions {
  logger: Logger;
  /** N-304: no wobble, no falling floors, no gliding camera. */
  reducedMotion: boolean;
}

type ChunkKind = 'fixed' | 'module' | 'top' | 'hang' | 'bubble';

/** A group of boxes that moves as one: a module of the tower, a crane, a warning sign. */
interface Chunk {
  kind: ChunkKind;
  home: Vector3;
  rotation: Euler;
  floor: number;
  seed: number;
}

interface TowerPart extends Part {
  chunk: number;
}

interface LotVisual {
  key: string;
  group: Group;
  pivot: Group;
  tower: InstancedMesh | null;
  parts: TowerPart[];
  chunks: Chunk[];
  baseRotX: number;
  baseRotZ: number;
  wobble: number;
  dirX: number;
  dirZ: number;
  floorCount: number;
  collapsed: boolean;
  construction: boolean;
  /** Time the top floor started dropping in, or null. */
  dropStart: number | null;
  /** Time the collapse started; -Infinity shows the rubble at once. Null while standing. */
  collapseStart: number | null;
  /** True while matrices must be recomputed every frame. */
  animated: boolean;
  dirty: boolean;
}

export function createThreeView(host: HTMLElement, options: ThreeViewOptions): SceneView {
  const { logger, reducedMotion } = options;

  const renderer = new WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  // N-205: more than 2 costs fill rate on phones without a visible gain.
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  const canvas = renderer.domElement;
  host.append(canvas);

  const scene = new Scene();
  scene.background = new Color(0x8fd16a);

  // Orthographic and from a fixed diagonal: this is what gives the blocky, isometric look.
  const camera = new OrthographicCamera(-10, 10, 10, -10, 1, 600);
  const viewDirection = new Vector3(1, 0.82, 1).normalize();
  const elevationSin = viewDirection.y;
  const elevationCos = Math.sqrt(1 - elevationSin * elevationSin);

  const unitBox = new BoxGeometry(1, 1, 1);
  const material = new MeshLambertMaterial({ color: 0xffffff });
  const meshes = new Set<InstancedMesh>();
  const tint = new Color();

  function buildMesh(parts: readonly Part[]): InstancedMesh {
    const mesh = new InstancedMesh(unitBox, material, Math.max(1, parts.length));
    mesh.count = parts.length;
    parts.forEach((part, i) => {
      mesh.setMatrixAt(i, part.matrix);
      mesh.setColorAt(i, tint.setHex(part.color));
    });
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    // Instances are spread over the whole mesh; the default bounding sphere of one box would cull them.
    mesh.frustumCulled = false;
    meshes.add(mesh);
    return mesh;
  }

  function dropMesh(mesh: InstancedMesh): void {
    meshes.delete(mesh);
    mesh.removeFromParent();
    mesh.dispose();
  }

  const hemisphere = new HemisphereLight(0xffffff, 0x9fb7c9, 1.7);
  const sun = new DirectionalLight(0xfff4dc, 2.1);
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -55;
  sun.shadow.camera.right = 55;
  sun.shadow.camera.top = 55;
  sun.shadow.camera.bottom = -55;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 220;
  sun.shadow.bias = -0.0008;
  scene.add(hemisphere, sun, sun.target);

  // --- City (F-410): built once, never touched again ---
  let lotCount = 5;
  let cityMesh: InstancedMesh | null = null;
  let carsMesh: InstancedMesh | null = null;
  const carMatrix = new Matrix4();
  const carBody = new Matrix4();
  const carCabin = new Matrix4();
  const carQuaternion = new Quaternion();
  const carEuler = new Euler();
  const carPosition = new Vector3();
  const one = new Vector3(1, 1, 1);

  function rebuildCity(): void {
    if (cityMesh) dropMesh(cityMesh);
    if (carsMesh) dropMesh(carsMesh);
    cityMesh = buildMesh(buildCity(lotCount));
    scene.add(cityMesh);
    const carParts: Part[] = [];
    for (let i = 0; i < CAR_COUNT; i++) {
      const color = [0xe63946, 0xffd23f, 0x4ea5d9, 0x7bc950, 0xffffff, 0xf7b267][i % 6] ?? 0xffffff;
      carParts.push(box(color, 1.9, 0.55, 1, 0, 0, 0), box(0xd7ecf7, 1, 0.42, 0.86, 0, 0, 0));
    }
    carsMesh = buildMesh(carParts);
    carsMesh.castShadow = false;
    scene.add(carsMesh);
    carBody.makeScale(1.9, 0.55, 1).setPosition(0, 0.5, 0);
    carCabin.makeScale(1, 0.42, 0.86).setPosition(-0.1, 0.95, 0);
  }

  function moveCars(time: number): void {
    if (!carsMesh) return;
    for (let i = 0; i < CAR_COUNT; i++) {
      const placement = carPlacement(i, time, lotCount);
      carQuaternion.setFromEuler(carEuler.set(0, placement.rotation, 0));
      carMatrix.compose(carPosition.set(placement.x, 0, placement.z), carQuaternion, one);
      carsMesh.setMatrixAt(i * 2, new Matrix4().multiplyMatrices(carMatrix, carBody));
      carsMesh.setMatrixAt(i * 2 + 1, new Matrix4().multiplyMatrices(carMatrix, carCabin));
    }
    carsMesh.instanceMatrix.needsUpdate = true;
  }

  // --- Lots and towers ---
  const lotsGroup = new Group();
  scene.add(lotsGroup);
  let visuals: LotVisual[] = [];
  let model: SceneModel | null = null;
  let clock = 0;

  /** One container of the tower, seen from the two sides the camera faces. */
  function addModule(
    parts: TowerPart[],
    chunk: number,
    color: number,
    mx: number,
    mz: number,
    ground: boolean,
    damage: number,
    seed: number,
  ): void {
    const push = (part: Part) => parts.push({ ...part, chunk });
    push(box(color, MODULE - 0.06, FLOOR_HEIGHT - 0.22, MODULE - 0.06, 0, -0.11, 0));
    push(
      box(shade(color, 0.68), MODULE + 0.04, 0.22, MODULE + 0.04, 0, FLOOR_HEIGHT / 2 - 0.11, 0),
    );
    const face = MODULE / 2 - 0.03;
    const slots = [-0.46, 0.46];
    // A badly built module is missing a window and shows a hole instead.
    const broken = damage >= 1 ? Math.floor(hash(seed + 7) * 2) : -1;
    slots.forEach((slot, s) => {
      const door = ground && s === 0;
      const height = door ? 0.98 : 0.74;
      const y = door ? -0.38 : -0.08;
      const glass = door ? 0x7a4a2b : GLASS;
      if (mx === 1) {
        if (s === broken) {
          push(box(0x4a2c1a, 0.1, 0.56, 0.7, face, y, slot));
        } else {
          push(box(FRAME, 0.08, height + 0.14, 0.62, face, y, slot));
          push(box(glass, 0.12, height, 0.46, face + 0.01, y, slot));
        }
      }
      if (mz === 1) {
        if (s === broken) {
          push(box(0x4a2c1a, 0.7, 0.56, 0.1, slot, y, face));
        } else {
          push(box(FRAME, 0.62, height + 0.14, 0.08, slot, y, face));
          push(box(glass, 0.46, height, 0.12, slot, y, face + 0.01));
        }
      }
    });
  }

  function addCrane(parts: TowerPart[], chunk: number, x: number, z: number, flip: number): void {
    const push = (part: Part) => parts.push({ ...part, chunk });
    push(box(CRANE, 0.22, 2.2, 0.22, x, 1.1, z));
    push(box(0xe63946, 0.42, 0.34, 0.42, x, 1.9, z));
    push(box(CRANE, 2.6, 0.16, 0.16, x + flip * 0.7, 2.25, z));
    push(box(0x5b6470, 0.36, 0.3, 0.3, x - flip * 0.5, 2.1, z));
    push(box(0x2b2f36, 0.05, 0.9, 0.05, x + flip * 1.8, 1.75, z));
    push(box(0xf6c026, 0.18, 0.14, 0.18, x + flip * 1.8, 1.25, z));
  }

  function addRoof(parts: TowerPart[], chunk: number, kind: BuildingKind): void {
    const push = (part: Part) => parts.push({ ...part, chunk });
    const accent = ACCENTS[kind][0];
    push(box(0xdde3ea, MODULE * 2 + 0.1, 0.16, MODULE * 2 + 0.1, 0, 0.08, 0));
    switch (kind) {
      case 'wohnhaus':
        push(box(0xb5443a, MODULE * 2 + 0.3, 0.4, MODULE * 2 + 0.3, 0, 0.36, 0));
        push(box(0xb5443a, MODULE * 2 + 0.3, 0.4, MODULE * 1.3, 0, 0.76, 0));
        push(box(0xb5443a, MODULE * 2 + 0.3, 0.4, MODULE * 0.6, 0, 1.16, 0));
        push(box(0x8a8f98, 0.4, 0.9, 0.4, -1.1, 1.2, -0.6));
        break;
      case 'buero':
        push(box(0xaeb7c2, 1, 0.5, 0.8, 0.9, 0.41, -0.9));
        push(box(0xaeb7c2, 0.8, 0.4, 0.8, -0.8, 0.36, 0.7));
        push(box(0x4a5361, 0.1, 2, 0.1, -1.2, 1.16, -1.2));
        break;
      case 'schule':
        push(box(shade(accent, 0.9), 1.1, 1.2, 1.1, 0, 0.76, 0));
        push(box(0x7a4b2a, 1.4, 0.24, 1.4, 0, 1.48, 0));
        push(box(0x4a5361, 0.08, 1.8, 0.08, 1.5, 1.06, 1.5));
        push(box(0xe63946, 0.7, 0.42, 0.06, 1.85, 1.7, 1.5));
        break;
      case 'spital':
        push(box(0xffffff, 2.4, 0.1, 2.4, 0, 0.21, 0));
        // A plain plus sign in the building's accent colour; deliberately not a red cross.
        push(box(0x2ec4b6, 1.6, 0.06, 0.44, 0, 0.29, 0));
        push(box(0x2ec4b6, 0.44, 0.06, 1.6, 0, 0.29, 0));
        break;
      case 'turm':
        push(box(shade(accent, 0.8), 2.2, 0.9, 2.2, 0, 0.61, 0));
        push(box(shade(accent, 0.65), 1.2, 0.7, 1.2, 0, 1.41, 0));
        push(box(0x4a5361, 0.12, 2.4, 0.12, 0, 2.96, 0));
        push(box(0xe63946, 0.22, 0.22, 0.22, 0, 4.2, 0));
        break;
    }
  }

  function addWorker(parts: Part[], x: number, z: number, seed: number): void {
    const vest = seed % 2 === 0 ? 0xf77f00 : 0xfcbf49;
    const helmet = seed % 2 === 0 ? 0xfcbf49 : 0xf77f00;
    const skin = SKIN[seed % SKIN.length] ?? 0xf1c27d;
    const y = PLOT_TOP;
    parts.push(
      box(0x34558b, 0.34, 0.42, 0.24, x, y + 0.21, z),
      box(vest, 0.42, 0.44, 0.28, x, y + 0.64, z),
      box(skin, 0.3, 0.28, 0.28, x, y + 1, z),
      box(helmet, 0.36, 0.14, 0.34, x, y + 1.2, z),
    );
  }

  function buildLot(
    lot: LotModel,
    index: number,
    count: number,
    previous: LotVisual | undefined,
  ): LotVisual {
    const group = new Group();
    const position = lotPosition(index, count);
    group.position.set(position.x, 0, position.z);
    const pivot = new Group();
    pivot.position.y = PLOT_TOP;
    group.add(pivot);

    // Things that stand on the ground and do not lean with the tower.
    const base: Part[] = [];
    const locked = lot.status === 'locked';
    base.push(box(locked ? 0xaab4bf : 0xe9e4d6, 8.4, 0.14, 8.4, 0, PLOT_TOP - 0.07, 0));
    if (locked) {
      for (let k = -2; k <= 2; k++) {
        for (const side of [-1, 1]) {
          base.push(box(0x7d8894, 0.2, 0.9, 0.2, k * 2, PLOT_TOP + 0.45, side * 4));
          base.push(box(0x7d8894, 0.2, 0.9, 0.2, side * 4, PLOT_TOP + 0.45, k * 2));
        }
      }
      for (const side of [-1, 1]) {
        base.push(box(0xffd23f, 8, 0.14, 0.08, 0, PLOT_TOP + 0.7, side * 4));
        base.push(box(0xffd23f, 0.08, 0.14, 8, side * 4, PLOT_TOP + 0.7, 0));
      }
    } else if (lot.status !== 'done') {
      addWorker(base, 3.2, 3.4, index);
      addWorker(base, 3.8, 2.6, index + 1);
      addWorker(base, -3.3, 3.5, index + 2);
      addWorker(base, 3.4, -3.2, index + 3);
      base.push(box(0xb08968, 0.9, 0.5, 0.9, -3.2, PLOT_TOP + 0.25, 2.2));
      base.push(box(0xddb892, 0.7, 0.4, 0.7, -3.1, PLOT_TOP + 0.7, 2.3));
      for (const [cx, cz] of [
        [-3.9, -3.9],
        [3.9, -3.9],
        [-3.9, 3.9],
        [3.9, 3.9],
      ] as const) {
        base.push(box(0xf77f00, 0.3, 0.5, 0.3, cx, PLOT_TOP + 0.25, cz));
      }
    }
    if (lot.status === 'done') {
      for (const [cx, cz] of [
        [-3.5, 3.5],
        [3.5, 3.4],
        [3.4, -3.5],
      ] as const) {
        base.push(box(0x4f9d5d, 0.9, 0.7, 0.9, cx, PLOT_TOP + 0.35, cz));
      }
    }
    const baseMesh = buildMesh(base);
    group.add(baseMesh);

    const visual: LotVisual = {
      key: JSON.stringify(lot),
      group,
      pivot,
      tower: null,
      parts: [],
      chunks: [],
      baseRotX: 0,
      baseRotZ: 0,
      wobble: 0,
      dirX: 0,
      dirZ: 0,
      floorCount: 0,
      collapsed: lot.collapsed,
      construction: lot.construction,
      dropStart: null,
      collapseStart: null,
      animated: false,
      dirty: true,
    };

    const building = lot.building;
    if (!building) return visual;

    const tilt = (building.tiltDegrees * Math.PI) / 180;
    // Leaning towards +x means rotating around z in the negative sense, towards +z around x.
    visual.baseRotZ = -building.dirX * tilt;
    visual.baseRotX = building.dirZ * tilt;
    visual.wobble = building.wobble * (lot.status === 'active' ? 1 : 0.3);
    visual.dirX = building.dirX;
    visual.dirZ = building.dirZ;
    visual.floorCount = building.floors.length;
    pivot.rotation.set(visual.baseRotX, 0, visual.baseRotZ);

    const palette = paletteFor(building.kind);
    const parts = visual.parts;
    const chunks = visual.chunks;
    const footprint = MODULE * 2;

    building.floors.forEach((floor, f) => {
      for (let m = 0; m < 4; m++) {
        const mx = m % 2;
        const mz = m >> 1;
        const seed = index * 1000 + f * 10 + m;
        const jitter = floor.damage;
        const chunk = chunks.length;
        chunks.push({
          kind: 'module',
          floor: f,
          seed,
          home: new Vector3(
            floor.offsetX * footprint +
              (mx - 0.5) * MODULE +
              (hash(seed + 1) - 0.5) * 0.34 * jitter,
            f * FLOOR_HEIGHT + FLOOR_HEIGHT / 2,
            floor.offsetZ * footprint +
              (mz - 0.5) * MODULE +
              (hash(seed + 2) - 0.5) * 0.34 * jitter,
          ),
          rotation: new Euler(
            (hash(seed + 3) - 0.5) * 0.14 * jitter,
            (hash(seed + 4) - 0.5) * 0.5 * jitter,
            (hash(seed + 5) - 0.5) * 0.14 * jitter,
          ),
        });
        const color = palette[Math.floor(hash(seed) * palette.length)] ?? 0xffffff;
        addModule(parts, chunk, color, mx, mz, f === 0, jitter, seed);
      }
    });

    const top = building.floors[building.floors.length - 1];
    const topX = (top?.offsetX ?? 0) * footprint;
    const topZ = (top?.offsetZ ?? 0) * footprint;
    const topY = building.floors.length * FLOOR_HEIGHT;
    const topChunk = chunks.length;
    chunks.push({
      kind: 'top',
      floor: building.floors.length - 1,
      seed: 0,
      home: new Vector3(topX, topY, topZ),
      rotation: new Euler(),
    });
    if (lot.status === 'done') {
      addRoof(parts, topChunk, building.kind);
    } else if (lot.construction) {
      addCrane(parts, topChunk, -1, -1, 1);
      addCrane(parts, topChunk, 1, -1, -1);
    }

    if (lot.construction) {
      // The next module hangs from a cable that runs out of the picture, as on a real site.
      const hang = chunks.length;
      chunks.push({
        kind: 'hang',
        floor: 0,
        seed: 0,
        home: new Vector3(topX, topY + HANG_HEIGHT, topZ),
        rotation: new Euler(0, 0.3, 0),
      });
      const color = palette[(building.floors.length + index) % palette.length] ?? 0xffffff;
      addModule(parts, hang, color, 1, 1, false, 0, 99);
      parts.push({
        ...box(0x2b2f36, 0.07, 60, 0.07, 0, 30 + FLOOR_HEIGHT / 2 + 0.3, 0),
        chunk: hang,
      });
      parts.push({ ...box(0xfcbf49, 0.5, 0.3, 0.5, 0, FLOOR_HEIGHT / 2 + 0.15, 0), chunk: hang });
    }

    // Only while the level is being played: a finished building needs no alarm.
    if (building.wobble > 0 && lot.construction) {
      // Warning signs: decoration only, the gauges above carry the actual information (N-303).
      const count = building.wobble > 0.5 ? 3 : 2;
      for (let b = 0; b < count; b++) {
        const bubble = chunks.length;
        const side = b % 2 === 0 ? 1 : -1;
        chunks.push({
          kind: 'bubble',
          floor: 0,
          seed: b,
          home: new Vector3(side * 3.4, topY * (0.35 + 0.3 * b) + 1.2, -side * 0.6 + 2.6),
          rotation: new Euler(0, Math.PI / 4, 0),
        });
        parts.push(
          { ...box(0xe63946, 0.95, 0.95, 0.16, 0, 0, 0), chunk: bubble },
          { ...box(0xffffff, 0.16, 0.42, 0.2, 0, 0.12, 0.02), chunk: bubble },
          { ...box(0xffffff, 0.16, 0.16, 0.2, 0, -0.28, 0.02), chunk: bubble },
          { ...box(0xe63946, 0.26, 0.26, 0.16, -0.3, -0.56, 0), chunk: bubble },
        );
      }
      for (let d = 0; d < 6; d++) {
        const fixed = chunks.length;
        chunks.push({
          kind: 'fixed',
          floor: 0,
          seed: d,
          home: new Vector3((hash(d + 40) - 0.5) * 6.4, 0.14, (hash(d + 50) - 0.5) * 6.4 + 1),
          rotation: new Euler(0, hash(d + 60) * 3, 0),
        });
        parts.push({ ...box(0x9c7a5b, 0.36, 0.28, 0.36, 0, 0, 0), chunk: fixed });
      }
    }

    const tower = buildMesh(parts);
    pivot.add(tower);
    visual.tower = tower;

    if (lot.collapsed) {
      // Animate only the moment it happens; after a reload the rubble is simply there.
      const justHappened = previous !== undefined && !previous.collapsed;
      visual.collapseStart = justHappened && !reducedMotion ? clock : -Infinity;
    } else if (
      lot.status === 'active' &&
      previous &&
      building.floors.length === previous.floorCount + 1 &&
      !reducedMotion
    ) {
      visual.dropStart = clock;
    }
    visual.animated = lot.status === 'active' && !reducedMotion;
    return visual;
  }

  function removeLot(visual: LotVisual): void {
    lotsGroup.remove(visual.group);
    visual.group.traverse((child) => {
      if (child instanceof InstancedMesh) {
        meshes.delete(child);
        child.dispose();
      }
    });
  }

  const chunkMatrix = new Matrix4();
  const partMatrix = new Matrix4();
  const chunkPosition = new Vector3();
  const chunkQuaternion = new Quaternion();
  const chunkEuler = new Euler();
  const chunkScale = new Vector3();
  const chunkMatrices: Matrix4[] = [];

  function updateTower(visual: LotVisual, time: number): void {
    const tower = visual.tower;
    if (!tower) return;

    const collapsing = visual.collapseStart !== null;
    const fallTime = collapsing ? Math.min(time - (visual.collapseStart as number), 12) : 0;
    let drop = 0;
    if (visual.dropStart !== null) {
      const progress = Math.min(1, (time - visual.dropStart) / 0.45);
      drop = (1 - progress) * (1 - progress) * HANG_HEIGHT;
      if (progress >= 1) visual.dropStart = null;
    }
    const topFloor = visual.floorCount - 1;

    visual.chunks.forEach((chunk, i) => {
      chunkPosition.copy(chunk.home);
      chunkEuler.copy(chunk.rotation);
      chunkScale.set(1, 1, 1);
      if (chunk.kind === 'module') {
        if (collapsing) {
          const s = chunk.seed;
          const gravity = 15;
          const vx = visual.dirX * (1.4 + 0.45 * chunk.floor) + (hash(s + 600) - 0.5) * 3.2;
          const vz = visual.dirZ * (1.4 + 0.45 * chunk.floor) + (hash(s + 610) - 0.5) * 3.2;
          const vy = 1 + hash(s + 620) * 2.4;
          const rest = MODULE * 0.45 + hash(s + 650) * 0.9;
          const height = Math.max(0, chunk.home.y - rest);
          const landing = (vy + Math.sqrt(vy * vy + 2 * gravity * height)) / gravity;
          const t = Math.min(fallTime, landing);
          chunkPosition.x += vx * t;
          chunkPosition.z += vz * t;
          chunkPosition.y = Math.max(rest, chunk.home.y + vy * t - (gravity / 2) * t * t);
          chunkEuler.x += t * (hash(s + 630) - 0.5) * 3.4;
          chunkEuler.z += t * (hash(s + 640) - 0.5) * 3.4;
        } else if (chunk.floor === topFloor) {
          chunkPosition.y += drop;
        }
      } else if (chunk.kind === 'top') {
        if (collapsing) chunkScale.set(0, 0, 0);
        else chunkPosition.y += drop;
      } else if (chunk.kind === 'hang') {
        if (collapsing) chunkScale.set(0, 0, 0);
        else if (!reducedMotion) {
          chunkPosition.y += Math.sin(time * 1.6) * 0.12 + drop * 0.35;
          chunkEuler.y += Math.sin(time * 0.7) * 0.12;
        }
      } else if (chunk.kind === 'bubble') {
        if (collapsing) chunkScale.set(0, 0, 0);
        else if (!reducedMotion) chunkPosition.y += Math.sin(time * 4 + chunk.seed * 2) * 0.16;
      }
      const target = chunkMatrices[i] ?? (chunkMatrices[i] = new Matrix4());
      target.compose(chunkPosition, chunkQuaternion.setFromEuler(chunkEuler), chunkScale);
    });

    visual.parts.forEach((part, i) => {
      partMatrix.multiplyMatrices(chunkMatrices[part.chunk] ?? chunkMatrix, part.matrix);
      tower.setMatrixAt(i, partMatrix);
    });
    tower.instanceMatrix.needsUpdate = true;

    if (visual.wobble > 0 && !reducedMotion && !collapsing) {
      const amplitude = visual.wobble * 0.02;
      visual.pivot.rotation.z = visual.baseRotZ + Math.sin(time * 9) * amplitude;
      visual.pivot.rotation.x = visual.baseRotX + Math.cos(time * 7.3) * amplitude * 0.6;
    }
  }

  // --- Camera ---
  let insets: SceneInsets = { top: 0, right: 0, bottom: 0, left: 0 };
  const view = { unit: 0.1, cx: 0, cy: 0 };
  const viewGoal = { unit: 0.1, cx: 0, cy: 0 };
  const target = new Vector3();
  const targetGoal = new Vector3();
  let cameraSnapped = false;
  let width = 1;
  let height = 1;

  /** Chooses zoom and aim so the subject fills the part of the canvas no panel covers. */
  function updateCameraGoal(): void {
    const freeWidth = Math.max(120, width - insets.left - insets.right);
    const freeHeight = Math.max(120, height - insets.top - insets.bottom);
    viewGoal.cx = insets.left + freeWidth / 2;
    viewGoal.cy = insets.top + freeHeight / 2;

    let spanX: number;
    let spanY: number;
    if (!model || model.mode === 'city' || model.focus === null) {
      // The row of lots runs diagonally across the picture; its length sets both spans.
      const row = (lotCount - 1) * lotPosition(1, 2).x * 2 + 16;
      const tallest = 9 * FLOOR_HEIGHT;
      spanX = row * Math.SQRT1_2 + 12;
      spanY = row * Math.SQRT1_2 * elevationSin + tallest * elevationCos + 10;
      targetGoal.set(0, 3, 0);
    } else {
      const lot = model.lots[model.focus];
      const floors = lot?.building?.floors.length ?? 0;
      const tall = floors * FLOOR_HEIGHT + (lot?.construction ? HANG_HEIGHT + 3 : 4.5);
      const position = lotPosition(model.focus, lotCount);
      spanX = 13.5;
      spanY = tall * elevationCos + 10 * elevationSin + 1.5;
      targetGoal.set(position.x, tall * 0.45, position.z);
    }
    viewGoal.unit = Math.max(spanX / freeWidth, spanY / freeHeight);
  }

  function applyCamera(): void {
    camera.left = -view.cx * view.unit;
    camera.right = (width - view.cx) * view.unit;
    camera.top = view.cy * view.unit;
    camera.bottom = -(height - view.cy) * view.unit;
    camera.updateProjectionMatrix();
    camera.position.copy(target).addScaledVector(viewDirection, 200);
    camera.lookAt(target);
    // The shadow box travels with the camera so shadows stay sharp wherever it looks.
    sun.target.position.copy(target);
    sun.position.set(target.x + 40, 80, target.z + 14);
  }

  function resize(): void {
    width = Math.max(1, host.clientWidth);
    height = Math.max(1, host.clientHeight);
    renderer.setSize(width, height, false);
    updateCameraGoal();
  }

  // --- Quality steps (N-203): 2 = shadows, 1 = no shadows, 0 = also half the resolution ---
  let quality = window.matchMedia('(pointer: coarse)').matches ? 1 : 2;

  function applyQuality(): void {
    const shadows = quality >= 2;
    renderer.shadowMap.enabled = shadows;
    sun.castShadow = shadows;
    material.needsUpdate = true;
    if (quality === 0) renderer.setPixelRatio(1);
    renderer.setSize(width, height, false);
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

    moveCars(reducedMotion ? 0 : clock);
    for (const visual of visuals) {
      const moving = visual.animated || visual.dropStart !== null || visual.collapseStart !== null;
      if (visual.dirty || moving) {
        updateTower(visual, clock);
        visual.dirty = false;
      }
    }

    const ease = reducedMotion || !cameraSnapped ? 1 : 1 - Math.exp(-dt * 4);
    target.lerp(targetGoal, ease);
    view.unit += (viewGoal.unit - view.unit) * ease;
    view.cx += (viewGoal.cx - view.cx) * ease;
    view.cy += (viewGoal.cy - view.cy) * ease;
    cameraSnapped = true;
    applyCamera();

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

  rebuildCity();
  resize();
  applyQuality();
  if (!document.hidden) start();
  logger.info('render.init', { quality, reducedMotion });

  return {
    render(next: SceneModel): void {
      const count = next.lots.length;
      if (count !== lotCount) {
        lotCount = count;
        rebuildCity();
        visuals.forEach(removeLot);
        visuals = [];
      }
      const updated: LotVisual[] = [];
      next.lots.forEach((lot, index) => {
        const previous = visuals[index];
        if (previous && previous.key === JSON.stringify(lot)) {
          updated.push(previous);
          return;
        }
        const visual = buildLot(lot, index, count, previous);
        if (previous) removeLot(previous);
        lotsGroup.add(visual.group);
        updated.push(visual);
      });
      visuals = updated;
      model = next;
      updateCameraGoal();
    },

    setInsets(next: SceneInsets): void {
      insets = next;
      updateCameraGoal();
    },

    dispose(): void {
      disposed = true;
      stop();
      observer.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
      canvas.removeEventListener('webglcontextlost', onContextLost);
      canvas.removeEventListener('webglcontextrestored', onContextRestored);
      for (const mesh of meshes) mesh.dispose();
      unitBox.dispose();
      material.dispose();
      renderer.dispose();
      canvas.remove();
      logger.info('render.disposed');
    },
  };
}
