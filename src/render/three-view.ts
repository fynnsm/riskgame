import {
  BoxGeometry,
  Color,
  DirectionalLight,
  Euler,
  Group,
  HemisphereLight,
  InstancedMesh,
  Matrix4,
  Fog,
  MeshBasicMaterial,
  MeshLambertMaterial,
  OrthographicCamera,
  Quaternion,
  Scene,
  Vector3,
  WebGLRenderer,
} from 'three';
import type { BuildingKind, GaugeKey } from '../content/schema.ts';
import type { LotModel, RenderStats, SceneInsets, SceneModel, SceneView } from '../core/scene.ts';
import type { Logger } from '../logging/logger.ts';
import type { Part } from './boxes.ts';
import { box, hash, shade } from './boxes.ts';
import type { Quality } from './director.ts';
import { decorationFor, momentFor, timeOfDay } from './director.ts';
import type { Lighting, TimeOfDay } from './palette.ts';
import { C, LIGHTING } from './palette.ts';
import { TUNING } from './tuning.ts';
import { buildCity, gridShift, lotPosition, PITCH } from './city.ts';
import type { Life } from './life.ts';
import { createLife } from './life.ts';
import { createFrameStats } from './frame-stats.ts';

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
const HANG_HEIGHT = TUNING.tower.hangHeight;

/** The bright container colours of the sketch. Every kind uses all of them, starting elsewhere. */
const VIVID = [
  C.vividRed,
  C.vividOrange,
  C.vividYellow,
  C.green,
  C.blue,
  C.purple,
  C.teal,
  C.paleBlue,
];

/** Each kind leans towards two colours, so the five towers stay recognisable in the city. */
const ACCENTS: Record<BuildingKind, [number, number]> = {
  wohnhaus: [C.vividRed, C.vividYellow],
  buero: [C.blue, C.paleBlue],
  schule: [C.vividOrange, C.green],
  spital: [C.offWhite, C.teal],
  turm: [C.purple, C.pink],
};

function paletteFor(kind: BuildingKind): number[] {
  const [first, second] = ACCENTS[kind];
  return [...VIVID, first, first, second];
}

const GLASS = C.glass;
const FRAME = C.white;
const CRANE = C.crane;
const SKIN = [C.skinA, C.skinB, C.skinC, C.skinD];

export interface ThreeViewOptions {
  logger: Logger;
  /** N-304: no wobble, no falling floors, no gliding camera. */
  reducedMotion: boolean;
  /** Pins the quality step and switches the automatic step-down off; for measurements only. */
  fixedQuality?: 0 | 1 | 2;
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

  // Transparent canvas: beyond the meadow the sky of the page shows through (B2).
  const renderer = new WebGLRenderer({
    antialias: true,
    alpha: true,
    powerPreference: 'high-performance',
  });
  renderer.setClearColor(0x000000, 0);
  // N-205: more than 2 costs fill rate on phones without a visible gain.
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, TUNING.quality.maxPixelRatio));
  const canvas = renderer.domElement;
  host.append(canvas);

  const scene = new Scene();
  // Haze: what lies far from the camera fades into the colour of the horizon.
  const fog = new Fog(LIGHTING.mittag.haze, TUNING.haze.near, TUNING.haze.far);
  scene.fog = fog;

  // Orthographic and from a fixed diagonal: this is what gives the blocky, isometric look.
  const camera = new OrthographicCamera(-10, 10, 10, -10, 1, 600);
  const viewDirection = new Vector3(1, 0.82, 1).normalize();
  const elevationSin = viewDirection.y;
  const elevationCos = Math.sqrt(1 - elevationSin * elevationSin);

  const unitBox = new BoxGeometry(1, 1, 1);
  const material = new MeshLambertMaterial({ color: C.white });
  const meshes = new Set<InstancedMesh>();
  const tint = new Color();

  function buildMesh(
    parts: readonly Part[],
    surface: MeshLambertMaterial | MeshBasicMaterial = material,
  ): InstancedMesh {
    const mesh = new InstancedMesh(unitBox, surface, Math.max(1, parts.length));
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

  let time: TimeOfDay = 'mittag';
  let light: Lighting = LIGHTING[time];
  const hemisphere = new HemisphereLight(
    light.ambientSky,
    light.ambientGround,
    light.ambientIntensity,
  );
  const sun = new DirectionalLight(light.sun, light.sunIntensity);
  sun.shadow.mapSize.set(TUNING.quality.shadowMapSize, TUNING.quality.shadowMapSize);
  sun.shadow.camera.left = -55;
  sun.shadow.camera.right = 55;
  sun.shadow.camera.top = 55;
  sun.shadow.camera.bottom = -55;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 220;
  sun.shadow.bias = -0.0008;
  // The box set above only takes effect once the shadow camera recomputes its projection.
  sun.shadow.camera.updateProjectionMatrix();
  scene.add(hemisphere, sun, sun.target);

  const goalColor = new Color();

  /** Sky behind the canvas: a gradient from the zenith to the colour the city fades into. */
  function paintSky(): void {
    const top = `#${new Color(light.skyTop).getHexString()}`;
    const bottom = `#${new Color(light.haze).getHexString()}`;
    host.style.background = `linear-gradient(${top} 0%, ${bottom} 55%)`;
    host.dataset.timeOfDay = time;
  }

  /** Moves light and haze towards the current time of day; `ease` 1 jumps there at once. */
  function easeLight(ease: number): void {
    hemisphere.color.lerp(goalColor.setHex(light.ambientSky), ease);
    hemisphere.groundColor.lerp(goalColor.setHex(light.ambientGround), ease);
    hemisphere.intensity += (light.ambientIntensity - hemisphere.intensity) * ease;
    sun.color.lerp(goalColor.setHex(light.sun), ease);
    sun.intensity += (light.sunIntensity - sun.intensity) * ease;
    fog.color.lerp(goalColor.setHex(light.haze), ease);
  }

  // --- City (F-410): built once, never touched again ---
  let lotCount = 5;
  let cityMesh: InstancedMesh | null = null;
  let life: Life | null = null;
  let lightsMesh: InstancedMesh | null = null;
  let blobsMesh: InstancedMesh | null = null;
  // Unlit, so lamps and windows glow however dark the night is.
  const glow = new MeshBasicMaterial({ color: C.white });
  function rebuildCity(): void {
    if (cityMesh) dropMesh(cityMesh);
    if (lightsMesh) dropMesh(lightsMesh);
    if (blobsMesh) dropMesh(blobsMesh);
    if (life) {
      for (const mesh of life.meshes) mesh.removeFromParent();
      life.dispose();
    }
    const city = buildCity(lotCount);
    cityMesh = buildMesh(city.parts);
    lightsMesh = buildMesh(city.lights, glow);
    lightsMesh.castShadow = false;
    lightsMesh.receiveShadow = false;
    blobsMesh = buildMesh(city.blobs);
    blobsMesh.castShadow = false;
    life = createLife({
      unitBox,
      lit: material,
      glow,
      grid: { pitch: PITCH, reach: TUNING.city.reach, shift: gridShift(lotCount) },
      swayTrees: city.swayTrees,
      ponds: city.ponds,
      chimneys: city.chimneys,
      viewDirection,
      seed: 20261124,
    });
    scene.add(cityMesh, lightsMesh, blobsMesh, ...life.meshes);
    applyDecoration();
  }

  // --- Lots and towers ---
  /** True while lights are on; towers are rebuilt when this flips, because their windows change. */
  let night = false;
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
      // At night some windows of the tower are lit, like those of the houses around it.
      const lit = night && hash(seed + 11 + s) < TUNING.litWindowShare + 0.2;
      const glass = door ? C.door : lit ? C.nightGlass : GLASS;
      if (mx === 1) {
        if (s === broken) {
          push(box(C.hole, 0.1, 0.56, 0.7, face, y, slot));
        } else {
          push(box(FRAME, 0.08, height + 0.14, 0.62, face, y, slot));
          push(box(glass, 0.12, height, 0.46, face + 0.01, y, slot));
        }
      }
      if (mz === 1) {
        if (s === broken) {
          push(box(C.hole, 0.7, 0.56, 0.1, slot, y, face));
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
    push(box(C.red, 0.42, 0.34, 0.42, x, 1.9, z));
    push(box(CRANE, 2.6, 0.16, 0.16, x + flip * 0.7, 2.25, z));
    push(box(C.slate, 0.36, 0.3, 0.3, x - flip * 0.5, 2.1, z));
    push(box(C.cable, 0.05, 0.9, 0.05, x + flip * 1.8, 1.75, z));
    push(box(C.crane, 0.18, 0.14, 0.18, x + flip * 1.8, 1.25, z));
  }

  function addRoof(parts: TowerPart[], chunk: number, kind: BuildingKind): void {
    const push = (part: Part) => parts.push({ ...part, chunk });
    const accent = ACCENTS[kind][0];
    push(box(C.roofSlab, MODULE * 2 + 0.1, 0.16, MODULE * 2 + 0.1, 0, 0.08, 0));
    switch (kind) {
      case 'wohnhaus':
        push(box(C.roofRed, MODULE * 2 + 0.3, 0.4, MODULE * 2 + 0.3, 0, 0.36, 0));
        push(box(C.roofRed, MODULE * 2 + 0.3, 0.4, MODULE * 1.3, 0, 0.76, 0));
        push(box(C.roofRed, MODULE * 2 + 0.3, 0.4, MODULE * 0.6, 0, 1.16, 0));
        push(box(C.chimney, 0.4, 0.9, 0.4, -1.1, 1.2, -0.6));
        break;
      case 'buero':
        push(box(C.metal, 1, 0.5, 0.8, 0.9, 0.41, -0.9));
        push(box(C.metal, 0.8, 0.4, 0.8, -0.8, 0.36, 0.7));
        push(box(C.steel, 0.1, 2, 0.1, -1.2, 1.16, -1.2));
        break;
      case 'schule':
        push(box(shade(accent, 0.9), 1.1, 1.2, 1.1, 0, 0.76, 0));
        push(box(C.wood, 1.4, 0.24, 1.4, 0, 1.48, 0));
        push(box(C.steel, 0.08, 1.8, 0.08, 1.5, 1.06, 1.5));
        push(box(C.red, 0.7, 0.42, 0.06, 1.85, 1.7, 1.5));
        break;
      case 'spital':
        push(box(C.white, 2.4, 0.1, 2.4, 0, 0.21, 0));
        // A plain plus sign in the building's accent colour; deliberately not a red cross.
        push(box(C.teal, 1.6, 0.06, 0.44, 0, 0.29, 0));
        push(box(C.teal, 0.44, 0.06, 1.6, 0, 0.29, 0));
        break;
      case 'turm':
        push(box(shade(accent, 0.8), 2.2, 0.9, 2.2, 0, 0.61, 0));
        push(box(shade(accent, 0.65), 1.2, 0.7, 1.2, 0, 1.41, 0));
        push(box(C.steel, 0.12, 2.4, 0.12, 0, 2.96, 0));
        push(box(C.red, 0.22, 0.22, 0.22, 0, 4.2, 0));
        break;
    }
  }

  /** A red plate with a symbol for what is running out: a coin, a clock or a cracked wall. */
  function addWarningSign(parts: TowerPart[], chunk: number, gauge: GaugeKey): void {
    const push = (part: Part) => parts.push({ ...part, chunk });
    push(box(C.red, 1.2, 1.2, 0.16, 0, 0, 0));
    push(box(C.red, 0.3, 0.3, 0.16, -0.36, -0.7, 0));
    const front = 0.1;
    if (gauge === 'budget') {
      push(box(C.yellow, 0.78, 0.78, 0.1, 0, 0, front));
      push(box(C.coinDark, 0.16, 0.5, 0.12, 0, 0, front + 0.02));
    } else if (gauge === 'zeit') {
      push(box(C.white, 0.82, 0.82, 0.1, 0, 0, front));
      push(box(C.ink, 0.1, 0.34, 0.12, 0, 0.13, front + 0.02));
      push(box(C.ink, 0.3, 0.1, 0.12, 0.12, 0, front + 0.02));
    } else {
      push(box(C.paleBlue, 0.82, 0.82, 0.1, 0, 0, front));
      push(box(C.ink, 0.12, 0.3, 0.12, 0.14, 0.24, front + 0.02));
      push(box(C.ink, 0.3, 0.12, 0.12, 0, 0.06, front + 0.02));
      push(box(C.ink, 0.12, 0.34, 0.12, -0.14, -0.2, front + 0.02));
    }
  }

  function addWorker(parts: Part[], x: number, z: number, seed: number): void {
    const vest = seed % 2 === 0 ? C.orange : C.amber;
    const helmet = seed % 2 === 0 ? C.amber : C.orange;
    const skin = SKIN[seed % SKIN.length] ?? C.skinA;
    const y = PLOT_TOP;
    parts.push(
      box(C.trousers, 0.34, 0.42, 0.24, x, y + 0.21, z),
      box(vest, 0.42, 0.44, 0.28, x, y + 0.64, z),
      box(skin, 0.3, 0.28, 0.28, x, y + 1, z),
      box(helmet, 0.36, 0.14, 0.34, x, y + 1.2, z),
    );
  }

  function lotKey(lot: LotModel): string {
    return `${night ? 'n' : 'd'}${JSON.stringify(lot)}`;
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
    base.push(box(locked ? C.plotLocked : C.plot, 8.4, 0.14, 8.4, 0, PLOT_TOP - 0.07, 0));
    if (locked) {
      for (let k = -2; k <= 2; k++) {
        for (const side of [-1, 1]) {
          base.push(box(C.fence, 0.2, 0.9, 0.2, k * 2, PLOT_TOP + 0.45, side * 4));
          base.push(box(C.fence, 0.2, 0.9, 0.2, side * 4, PLOT_TOP + 0.45, k * 2));
        }
      }
      for (const side of [-1, 1]) {
        base.push(box(C.yellow, 8, 0.14, 0.08, 0, PLOT_TOP + 0.7, side * 4));
        base.push(box(C.yellow, 0.08, 0.14, 8, side * 4, PLOT_TOP + 0.7, 0));
      }
    } else if (lot.status !== 'done') {
      addWorker(base, 3.2, 3.4, index);
      addWorker(base, 3.8, 2.6, index + 1);
      addWorker(base, -3.3, 3.5, index + 2);
      addWorker(base, 3.4, -3.2, index + 3);
      base.push(box(C.crate, 0.9, 0.5, 0.9, -3.2, PLOT_TOP + 0.25, 2.2));
      base.push(box(C.crateLight, 0.7, 0.4, 0.7, -3.1, PLOT_TOP + 0.7, 2.3));
      for (const [cx, cz] of [
        [-3.9, -3.9],
        [3.9, -3.9],
        [-3.9, 3.9],
        [3.9, 3.9],
      ] as const) {
        base.push(box(C.orange, 0.3, 0.5, 0.3, cx, PLOT_TOP + 0.25, cz));
      }
    }
    if (lot.status === 'done') {
      for (const [cx, cz] of [
        [-3.5, 3.5],
        [3.5, 3.4],
        [3.4, -3.5],
      ] as const) {
        base.push(box(C.bush, 0.9, 0.7, 0.9, cx, PLOT_TOP + 0.35, cz));
      }
    }
    const baseMesh = buildMesh(base);
    group.add(baseMesh);

    const visual: LotVisual = {
      key: lotKey(lot),
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
        const color = palette[Math.floor(hash(seed) * palette.length)] ?? C.white;
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
      const color = palette[(building.floors.length + index) % palette.length] ?? C.white;
      addModule(parts, hang, color, 1, 1, false, 0, 99);
      parts.push({
        ...box(C.cable, 0.07, 60, 0.07, 0, 30 + FLOOR_HEIGHT / 2 + 0.3, 0),
        chunk: hang,
      });
      parts.push({ ...box(C.amber, 0.5, 0.3, 0.5, 0, FLOOR_HEIGHT / 2 + 0.15, 0), chunk: hang });
    }

    // One sign per gauge that core reports as critical, each with its own symbol (A6).
    // No sign without such a cause, and none on a finished building.
    if (lot.construction && building.warnings.length > 0) {
      building.warnings.forEach((gauge, b) => {
        const sign = chunks.length;
        const side = b % 2 === 0 ? 1 : -1;
        chunks.push({
          kind: 'bubble',
          floor: 0,
          seed: b,
          home: new Vector3(
            side * 3.5,
            Math.max(1.6, topY * (0.3 + 0.25 * b)) + 0.6,
            2.7 - side * 0.7,
          ),
          rotation: new Euler(0, Math.PI / 4, 0),
        });
        addWarningSign(parts, sign, gauge);
      });
      for (let d = 0; d < 6; d++) {
        const fixed = chunks.length;
        chunks.push({
          kind: 'fixed',
          floor: 0,
          seed: d,
          home: new Vector3((hash(d + 40) - 0.5) * 6.4, 0.14, (hash(d + 50) - 0.5) * 6.4 + 1),
          rotation: new Euler(0, hash(d + 60) * 3, 0),
        });
        parts.push({ ...box(C.debris, 0.36, 0.28, 0.36, 0, 0, 0), chunk: fixed });
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
    const fallTime = collapsing
      ? Math.min(time - (visual.collapseStart as number), TUNING.tower.collapseMaxSeconds)
      : 0;
    let drop = 0;
    if (visual.dropStart !== null) {
      const progress = Math.min(1, (time - visual.dropStart) / TUNING.tower.dropSeconds);
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
          const gravity = TUNING.tower.collapseGravity;
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
      const amplitude = visual.wobble * TUNING.tower.wobbleAmplitude;
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
    camera.position.copy(target).addScaledVector(viewDirection, TUNING.haze.cameraDistance);
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
  let quality: number =
    options.fixedQuality ?? (window.matchMedia('(pointer: coarse)').matches ? 1 : 2);

  /** B3, G-09: what the current quality step and time of day show. */
  function applyDecoration(): void {
    const decoration = decorationFor(quality as Quality);
    if (lightsMesh) lightsMesh.visible = light.lightsOn && decoration.nightLights;
    // Simple dark patches stand in for shadows wherever the real ones are switched off.
    if (blobsMesh) blobsMesh.visible = !decoration.softShadows;
    life?.setQuality(quality as Quality);
  }

  function applyQuality(): void {
    const shadows = quality >= 2;
    renderer.shadowMap.enabled = shadows;
    sun.castShadow = shadows;
    material.needsUpdate = true;
    if (quality === 0) renderer.setPixelRatio(1);
    renderer.setSize(width, height, false);
    applyDecoration();
  }

  // --- Loop ---
  let frame = 0;
  let lastTime: number | null = null;
  let sampleStart = 0;
  let sampleFrames = 0;
  const frameStats = createFrameStats(30);
  let disposed = false;

  function tick(now: number): void {
    if (disposed) return;
    frame = requestAnimationFrame(tick);
    const seconds = now / 1000;
    const dt = lastTime === null ? 0 : Math.min(0.1, seconds - lastTime);
    if (lastTime === null) sampleStart = seconds;
    lastTime = seconds;
    clock += dt;

    const focusLot = model && model.focus !== null ? lotPosition(model.focus, lotCount) : null;
    // With reduced motion the decoration stands still instead of drifting (B0.6).
    life?.update({
      time: reducedMotion ? 0 : clock,
      dt: reducedMotion ? 0 : dt,
      night,
      deciding: model?.deciding ?? false,
      focus: focusLot,
      keepClear: focusLot
        ? [focusLot]
        : Array.from({ length: lotCount }, (_, i) => lotPosition(i, lotCount)),
    });
    for (const visual of visuals) {
      const moving = visual.animated || visual.dropStart !== null || visual.collapseStart !== null;
      if (visual.dirty || moving) {
        updateTower(visual, clock);
        visual.dirty = false;
      }
    }

    const ease = reducedMotion || !cameraSnapped ? 1 : 1 - Math.exp(-dt * TUNING.camera.easeRate);
    // Reduced motion: light changes at once instead of gliding (B0.6).
    easeLight(reducedMotion ? 1 : 1 - Math.exp(-dt * TUNING.camera.lightEaseRate));
    target.lerp(targetGoal, ease);
    view.unit += (viewGoal.unit - view.unit) * ease;
    view.cx += (viewGoal.cx - view.cx) * ease;
    view.cy += (viewGoal.cy - view.cy) * ease;
    cameraSnapped = true;
    applyCamera();

    renderer.render(scene, camera);

    sampleFrames += 1;
    frameStats.frame(seconds);
    if (seconds - sampleStart >= TUNING.quality.sampleSeconds) {
      const fps = sampleFrames / (seconds - sampleStart);
      if (fps < TUNING.quality.minFps && quality > 0 && options.fixedQuality === undefined) {
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
    frameStats.reset();
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
  paintSky();
  easeLight(1);
  resize();
  applyQuality();
  if (!document.hidden) start();
  logger.info('render.init', { quality, reducedMotion });

  return {
    render(next: SceneModel): void {
      const nextTime = timeOfDay(momentFor(next));
      if (nextTime !== time) {
        time = nextTime;
        light = LIGHTING[time];
        night = light.lightsOn;
        paintSky();
        applyDecoration();
        logger.info('render.time', { time });
      }
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
        if (previous && previous.key === lotKey(lot)) {
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

    stats(): RenderStats {
      const frames = frameStats.snapshot();
      return {
        fps: frames.current,
        fpsAverage: frames.average,
        fpsMinimum: frames.minimum,
        drawCalls: renderer.info.render.calls,
        triangles: renderer.info.render.triangles,
        quality,
      };
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
      life?.dispose();
      unitBox.dispose();
      material.dispose();
      glow.dispose();
      renderer.dispose();
      canvas.remove();
      logger.info('render.disposed');
    },
  };
}
