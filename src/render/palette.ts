/**
 * Every colour of the 3D scene (B0.9). Flat colours only, no textures.
 * The HTML interface has its own colours in src/ui/styles.css.
 */

/** Colours of objects. They stay the same at every time of day; the light changes around them. */
export const C = {
  lampLight: 0xffd98a,
  lampHead: 0xdfe5ea,
  blobOnGrass: 0x6fa653,
  nightGlass: 0xffd166,
  amber: 0xfcbf49,
  asphalt: 0x565c66,
  blue: 0x3f8fd9,
  bush: 0x4f9d5d,
  cable: 0x2b2f36,
  carBlue: 0x4ea5d9,
  carGlass: 0xd7ecf7,
  carOrange: 0xf7b267,
  chimney: 0x8a8f98,
  coinDark: 0xb8860b,
  crane: 0xf6c026,
  crate: 0xb08968,
  crateLight: 0xddb892,
  debris: 0x9c7a5b,
  door: 0x7a4a2b,
  fence: 0x7d8894,
  glass: 0x7fd3f7,
  grass: 0x8fd16a,
  green: 0x7bc950,
  hemisphereGround: 0x9fb7c9,
  hole: 0x4a2c1a,
  houseGlass: 0x8fd3f4,
  ink: 0x26334d,
  metal: 0xaeb7c2,
  offWhite: 0xf4f7fa,
  orange: 0xf77f00,
  paleBlue: 0xc9d3e6,
  pavement: 0xcfd6dd,
  pink: 0xf15bb5,
  plot: 0xe9e4d6,
  plotLocked: 0xaab4bf,
  purple: 0x8e6bd1,
  red: 0xe63946,
  roadMark: 0xf2f2f2,
  roofBrick: 0x8d4a3b,
  roofBrown: 0x7a5c3e,
  roofRed: 0xb5443a,
  roofSlab: 0xdde3ea,
  roofTeal: 0x4f6d7a,
  roofUnit: 0xc9d1d9,
  skinA: 0xf1c27d,
  skinB: 0xc68642,
  skinC: 0xe0ac69,
  skinD: 0x8d5524,
  slate: 0x5b6470,
  steel: 0x4a5361,
  sunlight: 0xfff4dc,
  teal: 0x2ec4b6,
  treeDark: 0x2f7d46,
  treeLight: 0x57b05f,
  treeMid: 0x3f8f4f,
  trousers: 0x34558b,
  trunk: 0x7a5a3a,
  vividOrange: 0xf28c38,
  vividRed: 0xe5534b,
  vividYellow: 0xf6c945,
  wallBlue: 0x6fa8dc,
  wallCream: 0xf2e2c4,
  wallGreen: 0x9ccc65,
  wallLilac: 0xb39ddb,
  wallPink: 0xf7a8b8,
  wallRed: 0xd9534f,
  wallTerracotta: 0xe58a5e,
  wallYellow: 0xf0c05a,
  water: 0x6ec6f5,
  white: 0xffffff,
  wood: 0x7a4b2a,
  yellow: 0xffd23f,
} as const;

export type TimeOfDay = 'morgen' | 'mittag' | 'nachmittag' | 'abend' | 'nacht';

/** Sky and light of one time of day (B2). */
export interface Lighting {
  /** Sky gradient from the top of the picture to the horizon. */
  skyTop: number;
  skyBottom: number;
  /** Colour the far edge of the city fades into. */
  haze: number;
  sun: number;
  sunIntensity: number;
  ambientSky: number;
  ambientGround: number;
  ambientIntensity: number;
  /** At night windows and street lamps glow. */
  lightsOn: boolean;
  windowLit: number;
}

export const LIGHTING: Record<TimeOfDay, Lighting> = {
  morgen: {
    skyTop: 0x9fd4f2,
    skyBottom: 0xffe3c2,
    haze: 0xf3e6d2,
    sun: 0xffe2b8,
    sunIntensity: 1.9,
    ambientSky: 0xfff3e0,
    ambientGround: 0x9fb7c9,
    ambientIntensity: 1.5,
    lightsOn: false,
    windowLit: 0xffe08a,
  },
  mittag: {
    skyTop: 0x6fc3f0,
    skyBottom: 0xcdeeff,
    haze: 0xd9eef7,
    sun: C.sunlight,
    sunIntensity: 2.1,
    ambientSky: C.white,
    ambientGround: C.hemisphereGround,
    ambientIntensity: 1.7,
    lightsOn: false,
    windowLit: 0xffe08a,
  },
  nachmittag: {
    skyTop: 0x74b9e8,
    skyBottom: 0xf6e7c8,
    haze: 0xeadfc6,
    sun: 0xffdca0,
    sunIntensity: 2.0,
    ambientSky: 0xfff1d6,
    ambientGround: 0xa3b3c0,
    ambientIntensity: 1.55,
    lightsOn: false,
    windowLit: 0xffe08a,
  },
  abend: {
    skyTop: 0x5d6fb3,
    skyBottom: 0xffb27a,
    haze: 0xe9a98a,
    sun: 0xff9d5c,
    sunIntensity: 1.7,
    ambientSky: 0xffd2b0,
    ambientGround: 0x7d86a8,
    ambientIntensity: 1.25,
    lightsOn: false,
    windowLit: 0xffd166,
  },
  nacht: {
    skyTop: 0x101a3a,
    skyBottom: 0x2b3a67,
    haze: 0x1f2b4f,
    sun: 0x9db4ff,
    sunIntensity: 0.75,
    ambientSky: 0x6f86c9,
    ambientGround: 0x1b2440,
    ambientIntensity: 0.95,
    lightsOn: true,
    windowLit: 0xffd166,
  },
};
