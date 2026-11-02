export type Axis = "x" | "y";

export type PlatformDef = {
  x: number;
  y: number;
  w: number;
  h: number;
  axis: Axis;
  amp: number;
  period: number;
  phase?: number;
};

export type FireDef = {
  x: number;
  y: number;
  count: number;
  gap: number;
  speed: number;
  phase?: number;
};

export type LevelDef = {
  id: string;
  world: string;
  name: string;
  blurb: string;
  time: number;
  rows: string[];
  platforms: PlatformDef[];
  fires: FireDef[];
};

function grid(w: number, h: number): string[][] {
  return Array.from({ length: h }, () => Array.from({ length: w }, () => "."));
}

function fill(g: string[][], x: number, y: number, w: number, h: number, ch: string) {
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      const yy = y + j;
      const xx = x + i;
      if (yy >= 0 && yy < g.length && xx >= 0 && xx < g[0].length) g[yy][xx] = ch;
    }
  }
}

function put(g: string[][], x: number, y: number, ch: string) {
  if (y >= 0 && y < g.length && x >= 0 && x < g[0].length) g[y][x] = ch;
}

function seal(g: string[][]): string[] {
  const w = g[0].length;
  for (const row of g) {
    if (row.length !== w) throw new Error("ragged level row");
  }
  return g.map((row) => row.join(""));
}

function ashGate(): LevelDef {
  const W = 64;
  const H = 14;
  const g = grid(W, H);
  fill(g, 0, 0, 16, 1, "%");
  fill(g, 48, 0, 16, 1, "%");
  fill(g, 0, 12, W, 2, "#");
  fill(g, 18, 12, 3, 2, "=");
  fill(g, 18, 12, 3, 1, "~");
  for (let i = 0; i < 4; i++) fill(g, 24 + i, 11 - i, 1, i + 1, "#");
  fill(g, 29, 8, 8, 1, "#");
  put(g, 32, 7, "?");
  put(g, 30, 6, "o");
  put(g, 34, 6, "o");
  put(g, 3, 11, "S");
  put(g, 8, 10, "o");
  put(g, 11, 9, "o");
  put(g, 14, 10, "o");
  put(g, 15, 8, "?");
  put(g, 21, 10, "o");
  put(g, 42, 11, "C");
  put(g, 44, 10, "o");
  fill(g, 46, 12, 8, 2, "=");
  fill(g, 46, 12, 8, 1, "~");
  put(g, 49, 8, "o");
  put(g, 51, 7, "o");
  put(g, 56, 10, "o");
  put(g, 60, 11, "F");
  return {
    id: "ash-gate",
    world: "1-1",
    name: "Ash Gate",
    blurb: "Learn the run. Brew, a lift, and one slow fire bar.",
    time: 180,
    rows: seal(g),
    platforms: [{ x: 46.2, y: 10, w: 4, h: 0.8, axis: "x", amp: 56, period: 3.4 }],
    fires: [{ x: 56.2, y: 9.2, count: 4, gap: 11, speed: 1.15, phase: 0.4 }],
  };
}

function cinderSpan(): LevelDef {
  const W = 78;
  const H = 14;
  const g = grid(W, H);
  fill(g, 0, 0, W, 1, "%");
  fill(g, 34, 1, 22, 5, "%");
  fill(g, 0, 12, W, 2, "#");
  fill(g, 15, 12, 11, 2, "=");
  fill(g, 15, 12, 11, 1, "~");
  put(g, 3, 11, "S");
  put(g, 6, 10, "o");
  put(g, 8, 9, "o");
  put(g, 11, 10, "o");
  put(g, 10, 8, "?");
  put(g, 20, 6, "o");
  put(g, 26, 5, "o");
  fill(g, 32, 9, 5, 1, "#");
  put(g, 34, 8, "o");
  put(g, 36, 7, "o");
  put(g, 40, 11, "C");
  put(g, 44, 10, "o");
  put(g, 48, 9, "o");
  put(g, 52, 10, "o");
  fill(g, 56, 8, 6, 1, "#");
  put(g, 58, 6, "o");
  put(g, 60, 7, "?");
  fill(g, 64, 12, 5, 2, "=");
  fill(g, 64, 12, 5, 1, "~");
  put(g, 66, 8, "o");
  put(g, 73, 11, "F");
  put(g, 71, 10, "o");
  return {
    id: "cinder-span",
    world: "1-2",
    name: "Cinder Span",
    blurb: "Ride the lifts, slip the fire, double-jump the last pit.",
    time: 200,
    rows: seal(g),
    platforms: [
      { x: 14.3, y: 9.15, w: 3.8, h: 0.75, axis: "y", amp: 30, period: 2.7 },
      { x: 19.4, y: 8.7, w: 7.4, h: 0.75, axis: "y", amp: 32, period: 3.15, phase: 1.3 },
    ],
    fires: [{ x: 45, y: 7.6, count: 5, gap: 13, speed: 1.25, phase: 1.1 }],
  };
}

function theKeep(): LevelDef {
  const W = 92;
  const H = 14;
  const g = grid(W, H);
  fill(g, 0, 0, W, 1, "%");
  fill(g, 8, 1, 8, 2, "%");
  fill(g, 0, 12, W, 2, "#");
  put(g, 3, 11, "S");
  put(g, 6, 10, "o");
  put(g, 8, 9, "o");
  fill(g, 8, 9, 6, 1, "#");
  put(g, 10, 9, "?");
  put(g, 12, 7, "o");
  fill(g, 18, 12, 12, 2, "=");
  fill(g, 18, 12, 12, 1, "~");
  put(g, 22, 6, "o");
  fill(g, 32, 10, 2, 2, "#");
  fill(g, 33, 12, 16, 2, "=");
  fill(g, 33, 12, 16, 1, "~");
  fill(g, 34, 9, 3, 3, "#");
  fill(g, 39, 7, 3, 5, "#");
  fill(g, 44, 9, 4, 3, "#");
  put(g, 35, 8, "o");
  put(g, 40, 6, "o");
  put(g, 46, 8, "o");
  put(g, 50, 11, "C");
  put(g, 53, 10, "o");
  put(g, 55, 9, "o");
  fill(g, 58, 12, 11, 2, "=");
  fill(g, 58, 12, 11, 1, "~");
  put(g, 63, 7, "o");
  put(g, 66, 6, "o");
  fill(g, 72, 9, 5, 1, "#");
  put(g, 74, 8, "o");
  put(g, 78, 11, "C");
  for (let i = 0; i < 3; i++) fill(g, 82 + i, 11 - i, 1, i + 1, "#");
  put(g, 86, 8, "o");
  put(g, 88, 10, "F");
  return {
    id: "the-keep",
    world: "1-3",
    name: "The Keep",
    blurb: "Towers, two lifts, and fire over the last bridge.",
    time: 240,
    rows: seal(g),
    platforms: [
      { x: 16.5, y: 9.3, w: 4, h: 0.8, axis: "y", amp: 28, period: 2.9 },
      { x: 21.2, y: 8.75, w: 10, h: 0.8, axis: "y", amp: 32, period: 3.3, phase: 1.6 },
      { x: 56.2, y: 10, w: 5.2, h: 0.8, axis: "x", amp: 150, period: 3.8, phase: 0.2 },
    ],
    fires: [
      { x: 42.2, y: 8.2, count: 4, gap: 12, speed: 1.45, phase: 0.6 },
      { x: 75.5, y: 8.1, count: 4, gap: 12, speed: -1.2, phase: 2 },
    ],
  };
}

export const LEVELS: LevelDef[] = [ashGate(), cinderSpan(), theKeep()];

for (const level of LEVELS) {
  const body = level.rows.join("");
  if (!body.includes("S") || !body.includes("F")) {
    throw new Error(`${level.id} is missing a spawn or a flag`);
  }
}
