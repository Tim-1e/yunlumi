// World design data (pure). Positions are in world units; y is up. Cloud sea surface ≈ y 0..30.
import { TAU, mulberry32 } from './math.js';

export const START = { pos: [0, 96, 0] };

export const CONSTELLATIONS = [
  {
    id: 'deer',
    name: '星鹿',
    glyph: '鹿',
    color: '#9ef0ff',
    kind: 0,
    angle: 0.38,
    radius: 330,
    alt: 120,
    scale: 58,
    creatureScale: 2.3,
    stars: [
      [-0.55, 0.95],
      [-0.45, 0.45],
      [-0.08, 0.02],
      [0.6, 0.12],
      [0.7, -0.68],
      [-0.2, -0.72],
    ],
    edges: [
      [0, 1],
      [1, 2],
      [2, 3],
      [3, 4],
      [2, 5],
    ],
    upgrade: { key: 'magnet', label: '鹿角感应', desc: '吸光范围 +60%' },
  },
  {
    id: 'whale',
    name: '云鲸',
    glyph: '鲸',
    color: '#8fb4ff',
    kind: 1,
    angle: 0.38 + TAU / 5,
    radius: 420,
    alt: 92,
    scale: 66,
    creatureScale: 1.9,
    stars: [
      [-0.95, 0.05],
      [-0.4, 0.38],
      [0.25, 0.26],
      [0.88, 0.58],
      [0.82, -0.22],
      [-0.3, -0.32],
    ],
    edges: [
      [0, 1],
      [1, 2],
      [2, 3],
      [2, 4],
      [0, 5],
      [5, 2],
    ],
    upgrade: { key: 'pulse', label: '鲸歌', desc: '绽光范围 +50%，消耗减半' },
  },
  {
    id: 'koi',
    name: '锦鲤',
    glyph: '鲤',
    color: '#ffa070',
    kind: 2,
    angle: 0.38 + (TAU / 5) * 2,
    radius: 370,
    alt: 172,
    scale: 56,
    creatureScale: 2.1,
    stars: [
      [-0.85, 0.0],
      [-0.22, 0.32],
      [0.35, 0.05],
      [0.92, 0.48],
      [0.92, -0.42],
    ],
    edges: [
      [0, 1],
      [1, 2],
      [2, 3],
      [2, 4],
    ],
    upgrade: { key: 'lucky', label: '锦鲤', desc: '每粒光价值翻倍' },
  },
  {
    id: 'luan',
    name: '青鸾',
    glyph: '鸾',
    color: '#8affc8',
    kind: 3,
    angle: 0.38 + (TAU / 5) * 3,
    radius: 410,
    alt: 212,
    scale: 64,
    creatureScale: 1.9,
    stars: [
      [0.0, 0.1],
      [-0.92, 0.62],
      [-0.45, 0.26],
      [0.45, 0.26],
      [0.92, 0.62],
      [0.0, -0.88],
    ],
    edges: [
      [0, 2],
      [2, 1],
      [0, 3],
      [3, 4],
      [0, 5],
    ],
    upgrade: { key: 'wing', label: '青鸾', desc: '疾飞能量 +60%，恢复更快' },
  },
  {
    id: 'bloom',
    name: '昙花',
    glyph: '昙',
    color: '#ffb4f0',
    kind: 4,
    angle: 0.38 + (TAU / 5) * 4,
    radius: 360,
    alt: 64,
    scale: 54,
    creatureScale: 1.7,
    stars: [
      [0.0, 0.92],
      [0.87, 0.27],
      [0.53, -0.76],
      [-0.53, -0.76],
      [-0.87, 0.27],
    ],
    edges: [
      [0, 1],
      [1, 2],
      [2, 3],
      [3, 4],
      [4, 0],
    ],
    upgrade: { key: 'bloom', label: '昙花一现', desc: '冲刺冷却减半，连击更持久' },
  },
];

export const NODE_RADIUS = 8; // fly within this distance of a dormant star to ignite it

/** Compute 3D layout for every constellation (deterministic). */
export function layoutConstellations(seed = 7) {
  const rng = mulberry32(seed);
  return CONSTELLATIONS.map((c) => {
    const cx = Math.cos(c.angle) * c.radius;
    const cz = Math.sin(c.angle) * c.radius;
    const cy = c.alt;
    const dl = Math.hypot(cx, cz);
    const d = [cx / dl, 0, cz / dl]; // from world centre towards constellation
    const right = [-d[2], 0, d[0]];
    const nodes = c.stars.map(([x, y]) => {
      const depth = (rng() * 2 - 1) * 10;
      return [
        cx + right[0] * x * c.scale + d[0] * depth,
        cy + y * c.scale,
        cz + right[2] * x * c.scale + d[2] * depth,
      ];
    });
    return { center: [cx, cy, cz], dir: d, right, nodes };
  });
}

/** Control points for the "cloud roads" (云路): golden rivers of light linking the sky. */
export function roadControlPoints(layout, seed = 11) {
  const rng = mulberry32(seed);
  const roads = [];
  const wob = (s) => (rng() * 2 - 1) * s;
  // Spokes from the start towards the front of every constellation.
  layout.forEach((L, i) => {
    const s = START.pos;
    const endP = [L.center[0] - L.dir[0] * 75, L.center[1] - 10, L.center[2] - L.dir[2] * 75];
    const pts = [s.slice()];
    for (let k = 1; k <= 3; k++) {
      const t = k / 4;
      pts.push([
        s[0] + (endP[0] - s[0]) * t + wob(45) + L.right[0] * Math.sin(t * Math.PI) * 50 * (i % 2 ? 1 : -1),
        s[1] + (endP[1] - s[1]) * t + Math.sin(t * Math.PI) * (20 + wob(30)),
        s[2] + (endP[2] - s[2]) * t + wob(45) + L.right[2] * Math.sin(t * Math.PI) * 50 * (i % 2 ? 1 : -1),
      ]);
    }
    pts.push(endP);
    roads.push({ pts, kind: 'spoke', target: i });
  });
  // Outer ring between neighbouring constellations.
  layout.forEach((L, i) => {
    const N = layout[(i + 1) % layout.length];
    const a = [L.center[0] + L.right[0] * 80, L.center[1] + 5, L.center[2] + L.right[2] * 80];
    const b = [N.center[0] - N.right[0] * 80, N.center[1] + 5, N.center[2] - N.right[2] * 80];
    const mid = [(a[0] + b[0]) * 0.5, (a[1] + b[1]) * 0.5, (a[2] + b[2]) * 0.5];
    const mr = Math.hypot(mid[0], mid[2]) || 1;
    const out = 1.25;
    const pts = [
      a,
      [mid[0] * 0.5 + a[0] * 0.5 + wob(30), mid[1] + wob(30) + 20, mid[2] * 0.5 + a[2] * 0.5 + wob(30)],
      [(mid[0] / mr) * mr * out, mid[1] - 25 + wob(30), (mid[2] / mr) * mr * out],
      [mid[0] * 0.5 + b[0] * 0.5 + wob(30), mid[1] + wob(30) + 15, mid[2] * 0.5 + b[2] * 0.5 + wob(30)],
      b,
    ];
    roads.push({ pts, kind: 'ring', target: -1 });
  });
  return roads;
}

/** Cumulus towers (landmarks); some hide moon lanterns at their crowns. */
export function cloudTowers(seed = 23) {
  const rng = mulberry32(seed);
  const towers = [];
  for (let i = 0; i < 10; i++) {
    const a = 0.38 + TAU / 10 + (i / 10) * TAU + (rng() - 0.5) * 0.25;
    const r = i % 2 === 0 ? 220 + rng() * 60 : 480 + rng() * 80;
    towers.push({
      x: Math.cos(a) * r,
      z: Math.sin(a) * r,
      height: 130 + rng() * 120,
      radius: 38 + rng() * 22,
    });
  }
  return towers;
}

/** Hidden moon lanterns (exploration secrets). */
export function lanternSpots(towers, seed = 31) {
  const rng = mulberry32(seed);
  const spots = [];
  // inside 5 tower crowns
  for (let i = 0; i < towers.length; i += 2) {
    const t = towers[i];
    spots.push([t.x + (rng() - 0.5) * 10, t.height * 0.8, t.z + (rng() - 0.5) * 10]);
  }
  // one under the cloud sea, one very high above the centre
  spots.push([-140, 10, 200]);
  spots.push([0, 300, 0]);
  return spots;
}
