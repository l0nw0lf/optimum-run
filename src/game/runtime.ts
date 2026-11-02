import { LEVELS, type LevelDef } from "./levels";

export const TILE = 16;
export const VIEW_W = 256;
export const VIEW_H = 240;
export const HUD_H = 32;
const PLAY_H = VIEW_H - HUD_H;

const PW = 10;
const PH = 16;
const MAX_RUN = 104;
const ACCEL = 1680;
const AIR_ACCEL = 1120;
const FRICTION = 2200;
const GRAV_UP = 860;
const GRAV_APEX = 430;
const GRAV_DOWN = 1580;
const TERM = 340;
const JUMP_V = 276;
const AIR_JUMP_V = 248;
const COYOTE = 0.11;
const BUFFER = 0.12;

const SAVE_KEY = "cinder-keep-v1";

export type Mode = "title" | "select" | "play" | "pause" | "dead" | "clear";

export type UiState = {
  mode: Mode;
  levelIndex: number;
  world: string;
  name: string;
  blurb: string;
  coins: number;
  score: number;
  time: number;
  bonus: number;
  cause: string;
  bestCoins: number[];
  cleared: boolean[];
  muted: boolean;
  levelCount: number;
};

type Save = {
  bestCoins: number[];
  bestScore: number[];
  cleared: boolean[];
  muted: boolean;
};

type Frame = CanvasImageSource;

type Bit = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  color: string;
  s: number;
};

const enum T {
  Empty = 0,
  Brick = 1,
  Castle = 2,
  Lava = 3,
  Deep = 4,
  Crate = 5,
  Used = 6,
}

type Coin = { x: number; y: number; key: string };
type Mark = { tx: number; ty: number; x: number; y: number };
type Plat = {
  baseX: number;
  baseY: number;
  x: number;
  y: number;
  prevX: number;
  prevY: number;
  w: number;
  h: number;
  axis: "x" | "y";
  amp: number;
  period: number;
  phase: number;
};
type Fire = { x: number; y: number; count: number; gap: number; speed: number; phase: number };
type Snap = {
  x: number;
  y: number;
  coins: number;
  score: number;
  time: number;
  got: string[];
  used: string[];
  cp: number;
};

const FONT: Record<string, string[]> = {
  " ": ["000", "000", "000", "000", "000"],
  "-": ["000", "000", "111", "000", "000"],
  X: ["000", "101", "010", "101", "000"],
  P: ["110", "101", "110", "100", "100"],
  I: ["111", "010", "010", "010", "111"],
  W: ["101", "101", "111", "111", "101"],
  O: ["010", "101", "101", "101", "010"],
  R: ["110", "101", "110", "101", "101"],
  L: ["100", "100", "100", "100", "111"],
  D: ["110", "101", "101", "101", "110"],
  T: ["111", "010", "010", "010", "010"],
  M: ["101", "111", "101", "101", "101"],
  E: ["111", "100", "110", "100", "111"],
  "0": ["111", "101", "101", "101", "111"],
  "1": ["010", "110", "010", "010", "111"],
  "2": ["110", "001", "010", "100", "111"],
  "3": ["110", "001", "110", "001", "110"],
  "4": ["101", "101", "111", "001", "001"],
  "5": ["111", "100", "110", "001", "110"],
  "6": ["011", "100", "110", "101", "011"],
  "7": ["111", "001", "010", "010", "010"],
  "8": ["111", "101", "111", "101", "111"],
  H: ["101", "101", "111", "101", "101"],
  A: ["010", "101", "111", "101", "101"],
  U: ["101", "101", "101", "101", "111"],
  N: ["101", "111", "111", "101", "101"],
  V: ["101", "101", "101", "101", "010"],
  "9": ["111", "101", "111", "001", "110"],
};

function freshSave(): Save {
  return {
    bestCoins: LEVELS.map(() => 0),
    bestScore: LEVELS.map(() => 0),
    cleared: LEVELS.map(() => false),
    muted: false,
  };
}

function loadSave(): Save {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return freshSave();
    const parsed = JSON.parse(raw) as Save;
    if (!parsed.bestCoins || parsed.bestCoins.length !== LEVELS.length) return freshSave();
    return { ...freshSave(), ...parsed, bestCoins: parsed.bestCoins, cleared: parsed.cleared };
  } catch {
    return freshSave();
  }
}

declare global {
  interface Window {
    __controlsTest?: {
      getX: () => number;
      getY: () => number;
      getVX: () => number;
      getVY: () => number;
      getFacing: () => number;
      setKeys: (codes: string[]) => void;
    };
  }
}

export type GameApi = {
  destroy: () => void;
  start: (index: number) => void;
  resume: () => void;
  pause: () => void;
  respawn: () => void;
  restart: () => void;
  next: () => void;
  toSelect: () => void;
  toTitle: () => void;
  toggleMute: () => void;
  touch: (which: "l" | "r" | "j", down: boolean) => void;
};

export function mountGame(canvas: HTMLCanvasElement, onUi: (ui: UiState) => void): GameApi {
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas unavailable");
  const g = ctx;
  canvas.width = VIEW_W;
  canvas.height = VIEW_H;

  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  let save = loadSave();
  let mode: Mode = "title";
  let levelIndex = 0;
  let cause = "The brew caught you.";
  let bonus = 0;
  let muted = save.muted;
  let audio: AudioContext | null = null;
  let bgm: AudioBufferSourceNode | null = null;

  let mapW = 0;
  let mapH = 0;
  let tiles = new Uint8Array();
  let template = new Uint8Array();
  let coins: Coin[] = [];
  let coinAll: Coin[] = [];
  let checkpoints: Mark[] = [];
  let flag: Mark = { tx: 0, ty: 0, x: 0, y: 0 };
  let plats: Plat[] = [];
  let fires: Fire[] = [];
  let got = new Set<string>();
  let used = new Set<string>();
  let lit = new Set<number>();

  const player = { x: 32, y: 32, vx: 0, vy: 0, facing: 1, grounded: false };
  let coyote = 0;
  let airJumps = 1;
  let buffer = 0;
  let jumpWas = false;
  let cut = false;
  let ride: number | null = null;
  let invuln = 0;
  let coinsN = 0;
  let score = 0;
  let time = 180;
  let snap: Snap = { x: 0, y: 0, coins: 0, score: 0, time: 180, got: [], used: [], cp: -1 };
  let anim = 0;
  let vis = 0;
  let camX = 0;
  let camY = 0;
  let shake = 0;
  let squash = 0;
  const bits: Bit[] = [];
  const pumpkinFlash = new Map<string, number>();

  const keys = new Set<string>();
  const keyAt = new Map<string, number>();
  let qaOverride: Set<string> | null = null;
  let touchL = false;
  let touchR = false;
  let touchJ = false;

  const sprites: Record<string, Frame | null> = {};
  const wanted = [
    "idle-1", "idle-2", "idle-3", "idle-4",
    "run-1", "run-2", "run-3", "run-4",
    "jump-1", "jump-2", "jump-3", "jump-4",
    "coin-1", "coin-2", "coin-3", "coin-4",
    "fire-1", "fire-2", "fire-3", "fire-4",
    "flag", "checkpoint", "platform",
  ];
  for (const name of wanted) {
    const img = new Image();
    img.crossOrigin = "anonymous";
    sprites[name] = null;
    img.onload = () => {
      if (!name.startsWith("coin")) {
        sprites[name] = img;
        return;
      }
      if (name !== "coin-1") return;
      const finish = () => {
        const baked = document.createElement("canvas");
        baked.width = 52;
        baked.height = 28;
        const bg = baked.getContext("2d");
        if (!bg) return;
        bg.imageSmoothingEnabled = true;
        bg.imageSmoothingQuality = "high";
        bg.drawImage(img, 0, 0, 52, 28);
        sprites["coin-1"] = baked;
        sprites["coin-2"] = baked;
        sprites["coin-3"] = baked;
        sprites["coin-4"] = baked;
      };
      if (typeof img.decode === "function") void img.decode().then(finish).catch(finish);
      else finish();
    };
    img.src = `/game/${name}.png`;
  }

  function down(code: string) {
    if (qaOverride) return qaOverride.has(code);
    if (!keys.has(code)) return false;
    // Key repeat refreshes this. If it goes quiet, keyup was lost and the
    // character would run forever.
    const at = keyAt.get(code) ?? 0;
    if (performance.now() - at > 1500) {
      keys.delete(code);
      keyAt.delete(code);
      return false;
    }
    return true;
  }

  function axis() {
    let a = 0;
    if (down("ArrowLeft") || down("KeyA") || touchL) a -= 1;
    if (down("ArrowRight") || down("KeyD") || touchR) a += 1;
    return a;
  }

  function jumpHeld() {
    return down("Space") || down("ArrowUp") || down("KeyW") || down("KeyK") || touchJ;
  }

  function emit() {
    const def = LEVELS[levelIndex];
    onUi({
      mode,
      levelIndex,
      world: def.world,
      name: def.name,
      blurb: def.blurb,
      coins: coinsN,
      score,
      time,
      bonus,
      cause,
      bestCoins: save.bestCoins.slice(),
      cleared: save.cleared.slice(),
      muted,
      levelCount: LEVELS.length,
    });
  }

  function persist() {
    save.muted = muted;
    localStorage.setItem(SAVE_KEY, JSON.stringify(save));
  }

  function unlock() {
    if (!audio) audio = new AudioContext();
    if (audio.state === "suspended") void audio.resume();
    if (!muted) startBgm();
  }

  function stopBgm() {
    if (!bgm) return;
    try {
      bgm.stop();
    } catch {
      /* already stopped */
    }
    bgm.disconnect();
    bgm = null;
  }

  function startBgm() {
    if (!audio || muted || bgm) return;
    const sr = audio.sampleRate;
    const seconds = 6.4;
    const buf = audio.createBuffer(1, Math.floor(sr * seconds), sr);
    const data = buf.getChannelData(0);
    const melody = [220, 246.94, 261.63, 196, 174.61, 196, 220, 164.81];
    const step = seconds / melody.length;
    for (let i = 0; i < data.length; i++) {
      const t = i / sr;
      const f = melody[Math.min(melody.length - 1, Math.floor(t / step))] ?? 220;
      const local = (t % step) / step;
      const env = Math.sin(Math.PI * local) * (local < 0.08 ? local / 0.08 : 1);
      const lead = (Math.sin(Math.PI * 2 * f * t) > 0 ? 1 : -1) * 0.12 * env;
      const bass = (Math.sin(Math.PI * 2 * (f / 2) * t) > 0 ? 1 : -1) * 0.06;
      data[i] = lead + bass;
    }
    const src = audio.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const gain = audio.createGain();
    gain.gain.value = 0.16;
    src.connect(gain);
    gain.connect(audio.destination);
    src.start();
    bgm = src;
  }

  function noise(dur: number, vol: number, freq: number) {
    if (muted || !audio) return;
    const sr = audio.sampleRate;
    const len = Math.max(1, Math.floor(sr * dur));
    const buf = audio.createBuffer(1, len, sr);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) {
      const env = 1 - i / len;
      data[i] = (Math.random() * 2 - 1) * env * env;
    }
    const src = audio.createBufferSource();
    src.buffer = buf;
    const filter = audio.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = freq;
    const gain = audio.createGain();
    gain.gain.value = vol;
    src.connect(filter);
    filter.connect(gain);
    gain.connect(audio.destination);
    src.start();
  }

  function tone(freq: number, dur: number, type: OscillatorType, vol: number, slide?: number) {
    if (muted || !audio) return;
    const t0 = audio.currentTime;
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(48, slide), t0 + dur);
    gain.gain.setValueAtTime(vol, t0);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(gain);
    gain.connect(audio.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  function sfx(kind: "jump" | "air" | "coin" | "die" | "lamp" | "win" | "bump" | "splash") {
    unlock();
    if (kind === "jump") tone(640, 0.1, "square", 0.045, 240);
    if (kind === "air") tone(820, 0.1, "square", 0.04, 380);
    if (kind === "coin") {
      tone(988, 0.14, "sine", 0.05);
      tone(1480, 0.2, "sine", 0.03);
    }
    if (kind === "bump") {
      tone(160, 0.14, "triangle", 0.05, 70);
      tone(90, 0.18, "sawtooth", 0.02, 48);
    }
    if (kind === "lamp") {
      tone(523, 0.08, "square", 0.04);
      tone(659, 0.1, "square", 0.035);
      tone(784, 0.14, "square", 0.03);
    }
    if (kind === "win") {
      tone(523, 0.1, "square", 0.04);
      tone(659, 0.12, "square", 0.04);
      tone(784, 0.14, "square", 0.04);
      tone(1046, 0.2, "square", 0.035);
    }
    if (kind === "die") tone(180, 0.28, "sawtooth", 0.05, 50);
    if (kind === "splash") noise(0.28, 0.22, 700);
  }

  function burst(x: number, y: number, color: string, n = 6) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = 20 + Math.random() * 50;
      bits.push({
        x,
        y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s - 20,
        life: 0.35 + Math.random() * 0.2,
        max: 0.5,
        color,
        s: 2,
      });
    }
  }

  function stand(tx: number, ty: number) {
    return { x: tx * TILE + (TILE - PW) / 2, y: (ty + 1) * TILE - PH };
  }

  function build(def: LevelDef) {
    mapH = def.rows.length;
    mapW = def.rows[0].length;
    template = new Uint8Array(mapW * mapH);
    coinAll = [];
    checkpoints = [];
    plats = def.platforms.map((p) => {
      const baseX = p.x * TILE;
      const baseY = p.y * TILE;
      return {
        baseX,
        baseY,
        x: baseX,
        y: baseY,
        prevX: baseX,
        prevY: baseY,
        w: p.w * TILE,
        h: p.h * TILE,
        axis: p.axis,
        amp: p.amp,
        period: p.period,
        phase: p.phase ?? 0,
      };
    });
    fires = def.fires.map((f) => ({
      x: f.x * TILE,
      y: f.y * TILE,
      count: f.count,
      gap: f.gap,
      speed: f.speed,
      phase: f.phase ?? 0,
    }));
    let spawn = stand(2, 10);
    for (let ty = 0; ty < mapH; ty++) {
      const row = def.rows[ty];
      for (let tx = 0; tx < mapW; tx++) {
        const ch = row[tx] ?? ".";
        const i = ty * mapW + tx;
        if (ch === "#") template[i] = T.Brick;
        else if (ch === "%") template[i] = T.Castle;
        else if (ch === "~") template[i] = T.Lava;
        else if (ch === "=") template[i] = T.Deep;
        else if (ch === "?") template[i] = T.Crate;
        else template[i] = T.Empty;
        if (ch === "o") coinAll.push({ x: tx * TILE + TILE / 2, y: ty * TILE + TILE / 2, key: `${tx},${ty}` });
        if (ch === "C") checkpoints.push({ tx, ty, ...stand(tx, ty) });
        if (ch === "F") flag = { tx, ty, ...stand(tx, ty) };
        if (ch === "S") spawn = stand(tx, ty);
      }
    }
    return spawn;
  }

  function applyUsed() {
    tiles = template.slice();
    for (const key of used) {
      const [xs, ys] = key.split(",");
      const tx = Number(xs);
      const ty = Number(ys);
      const i = ty * mapW + tx;
      if (tiles[i] === T.Crate) tiles[i] = T.Used;
    }
    coins = coinAll.filter((c) => !got.has(c.key));
  }

  function capture(x: number, y: number, cp: number) {
    snap = { x, y, coins: coinsN, score, time, got: [...got], used: [...used], cp };
  }

  function restore() {
    coinsN = snap.coins;
    score = snap.score;
    time = snap.time;
    got = new Set(snap.got);
    used = new Set(snap.used);
    applyUsed();
    player.x = snap.x;
    player.y = snap.y;
    player.vx = 0;
    player.vy = 0;
    player.grounded = false;
    coyote = COYOTE;
    airJumps = 1;
    buffer = 0;
    ride = null;
    invuln = 0.85;
  }

  function loadLevel(index: number) {
    levelIndex = index;
    const def = LEVELS[index];
    got = new Set();
    used = new Set();
    lit = new Set();
    bits.length = 0;
    pumpkinFlash.clear();
    const spawn = build(def);
    coinsN = 0;
    score = 0;
    time = def.time;
    bonus = 0;
    applyUsed();
    player.x = spawn.x;
    player.y = spawn.y;
    player.vx = 0;
    player.vy = 0;
    player.facing = 1;
    player.grounded = true;
    invuln = 0.7;
    capture(spawn.x, spawn.y, -1);
    camX = Math.max(0, spawn.x - 40);
    camY = 0;
    shake = 0;
    vis = 0;
  }

  function solid(tx: number, ty: number) {
    if (tx < 0 || tx >= mapW || ty < 0) return true;
    if (ty >= mapH) return false;
    const t = tiles[ty * mapW + tx];
    return t === T.Brick || t === T.Castle || t === T.Crate || t === T.Used;
  }

  function touching(x: number, y: number, feet = false) {
    const x0 = Math.floor(x / TILE);
    const y0 = Math.floor(y / TILE);
    const x1 = Math.floor((x + PW - 0.001) / TILE);
    const y1 = Math.floor((y + PH - 0.001) / TILE);
    const hits: { tx: number; ty: number }[] = [];
    for (let ty = y0; ty <= y1; ty++) {
      for (let tx = x0; tx <= x1; tx++) {
        if (!solid(tx, ty)) continue;
        if (feet) {
          const top = ty * TILE;
          if (y + PH > top && y + PH - top < 6) continue;
        }
        hits.push({ tx, ty });
      }
    }
    return hits;
  }

  function kill(why: string) {
    if (mode !== "play" || invuln > 0) return;
    mode = "dead";
    cause = why;
    shake = reduce ? 0 : 6;
    if (why.includes("brew") || why.includes("fell")) sfx("splash");
    else sfx("die");
    emit();
  }

  function groundJump() {
    player.vy = -JUMP_V;
    player.grounded = false;
    coyote = 0;
    cut = false;
    squash = 0.08;
    sfx("jump");
    burst(player.x + PW / 2, player.y + PH, "#d5d8df", 4);
  }

  function airJump() {
    player.vy = -AIR_JUMP_V;
    airJumps -= 1;
    cut = false;
    squash = 0.08;
    sfx("air");
    burst(player.x + PW / 2, player.y + PH, "#ffb020", 5);
  }

  function collectCoin(c: Coin) {
    got.add(c.key);
    coins = coins.filter((o) => o.key !== c.key);
    coinsN += 1;
    score += 100;
    sfx("coin");
    burst(c.x, c.y, "#eafff4", 7);
  }

  function sim(dt: number) {
    const held = jumpHeld();
    const pressed = held && !jumpWas;
    jumpWas = held;

    if (pressed) {
      if (player.grounded || coyote > 0) groundJump();
      else if (airJumps > 0) airJump();
      else buffer = BUFFER;
    } else if (buffer > 0) {
      if (player.grounded || coyote > 0) {
        groundJump();
        buffer = 0;
      } else buffer -= dt;
    }

    if (!held && player.vy < 0 && !cut) {
      player.vy *= 0.46;
      cut = true;
    }

    const dir = axis();
    if (dir !== 0) {
      player.vx += dir * (player.grounded ? ACCEL : AIR_ACCEL) * dt;
      player.facing = dir > 0 ? 1 : -1;
    } else if (player.grounded) {
      const s = Math.sign(player.vx);
      if (s !== 0) {
        player.vx -= s * FRICTION * dt;
        if (Math.sign(player.vx) !== s) player.vx = 0;
      }
    } else {
      player.vx *= Math.max(0, 1 - 1.4 * dt);
    }
    player.vx = Math.max(-MAX_RUN, Math.min(MAX_RUN, player.vx));

    const rising = player.vy < 0;
    const apex = Math.abs(player.vy) < 48;
    const grav = apex && !player.grounded ? GRAV_APEX : rising ? GRAV_UP : GRAV_DOWN;
    player.vy = Math.min(TERM, player.vy + grav * dt);

    for (const p of plats) {
      p.prevX = p.x;
      p.prevY = p.y;
      const s = Math.sin((vis * Math.PI * 2) / p.period + p.phase);
      p.x = p.baseX + (p.axis === "x" ? s * p.amp : 0);
      p.y = p.baseY + (p.axis === "y" ? s * p.amp : 0);
    }
    if (ride !== null) {
      const p = plats[ride];
      player.x += p.x - p.prevX;
      player.y += p.y - p.prevY;
    }
    ride = null;

    const prevX = player.x;
    player.x += player.vx * dt;
    if (player.vx !== 0) {
      const hits = touching(player.x, player.y, true);
      if (player.vx > 0) {
        let wall = Infinity;
        for (const h of hits) {
          const left = h.tx * TILE;
          if (prevX + PW <= left + 0.75) wall = Math.min(wall, left - PW);
        }
        if (wall !== Infinity) {
          player.x = wall;
          player.vx = 0;
        }
      } else {
        let wall = -Infinity;
        for (const h of hits) {
          const right = (h.tx + 1) * TILE;
          if (prevX >= right - 0.75) wall = Math.max(wall, right);
        }
        if (wall !== -Infinity) {
          player.x = wall;
          player.vx = 0;
        }
      }
    }

    const prevY = player.y;
    player.grounded = false;
    player.y += player.vy * dt;
    const yHits = touching(player.x, player.y);
    if (player.vy > 0) {
      let floor = Infinity;
      for (const h of yHits) {
        const top = h.ty * TILE;
        if (prevY + PH <= top + 1) floor = Math.min(floor, top - PH);
      }
      if (floor !== Infinity) {
        const landed = !player.grounded && player.vy > 80;
        player.y = floor;
        player.vy = 0;
        player.grounded = true;
        if (landed) {
          squash = -0.06;
          burst(player.x + PW / 2, player.y + PH, "#9aa1ac", 3);
        }
      }
    } else if (player.vy < 0) {
      let ceil = -Infinity;
      let crateKey: string | null = null;
      for (const h of yHits) {
        const bottom = (h.ty + 1) * TILE;
        if (prevY >= bottom - 1) {
          if (bottom > ceil) {
            ceil = bottom;
            const id = tiles[h.ty * mapW + h.tx];
            crateKey = id === T.Crate ? `${h.tx},${h.ty}` : null;
          }
        }
      }
      if (ceil !== -Infinity) {
        player.y = ceil;
        player.vy = 30;
        if (crateKey && !used.has(crateKey)) {
          used.add(crateKey);
          const [xs, ys] = crateKey.split(",");
          tiles[Number(ys) * mapW + Number(xs)] = T.Used;
          coinsN += 1;
          score += 100;
          sfx("bump");
          sfx("coin");
          pumpkinFlash.set(crateKey, vis);
          burst(Number(xs) * TILE + 8, Number(ys) * TILE, "#ffe08a", 7);
          shake = Math.max(shake, reduce ? 0 : 2);
        }
      }
    }

    if (player.vy >= 0) {
      for (let i = 0; i < plats.length; i++) {
        const p = plats[i];
        const top = p.y;
        const prevBottom = prevY + PH;
        const overlapX = player.x + PW > p.x + 3 && player.x < p.x + p.w - 3;
        if (overlapX && prevBottom <= top + 2 && player.y + PH >= top) {
          player.y = top - PH;
          player.vy = 0;
          player.grounded = true;
          ride = i;
        }
      }
    }

    if (player.grounded) {
      coyote = COYOTE;
      airJumps = 1;
    } else coyote = Math.max(0, coyote - dt);

    if (invuln > 0) invuln -= dt;
    else {
      const feetL = player.x + 2;
      const feetR = player.x + PW - 2;
      const feetY = player.y + PH - 1;
      const samples = [
        [feetL, feetY],
        [feetR, feetY],
      ];
      for (const [sx, sy] of samples) {
        const tx = Math.floor(sx / TILE);
        const ty = Math.floor(sy / TILE);
        if (ty >= 0 && ty < mapH && tx >= 0 && tx < mapW) {
          const t = tiles[ty * mapW + tx];
          if (t === T.Lava || t === T.Deep) {
            kill("The brew caught you.");
            return;
          }
        }
      }
      if (player.y > mapH * TILE + 8) {
        kill("You fell out of the keep.");
        return;
      }
      for (const f of fires) {
        const ang = vis * f.speed + f.phase;
        for (let i = 1; i <= f.count; i++) {
          const ox = f.x + Math.cos(ang) * f.gap * i;
          const oy = f.y + Math.sin(ang) * f.gap * i;
          if (circleHits(ox, oy, 5.5, player.x, player.y, PW, PH)) {
            kill("A fire bar caught you.");
            return;
          }
        }
      }
    }

    for (const c of coins) {
      const dx = player.x + PW / 2 - c.x;
      const dy = player.y + PH / 2 - c.y;
      if (dx * dx + dy * dy < 13 * 13) {
        collectCoin(c);
        break;
      }
    }

    checkpoints.forEach((cp, i) => {
      if (i <= snap.cp) return;
      if (overlap(player.x, player.y, PW, PH, cp.tx * TILE, cp.ty * TILE, TILE, TILE)) {
        lit.add(i);
        capture(cp.x, cp.y, i);
        player.x = cp.x;
        sfx("lamp");
        burst(cp.x + PW / 2, cp.y, "#ffb020", 8);
      }
    });

    const poleX = flag.tx * TILE + 5;
    const poleY = flag.ty * TILE - TILE * 3;
    if (overlap(player.x, player.y, PW, PH, poleX, poleY, 8, TILE * 4.2)) {
      bonus = Math.max(0, Math.ceil(time)) * 10;
      score += bonus;
      mode = "clear";
      if (coinsN > save.bestCoins[levelIndex]) save.bestCoins[levelIndex] = coinsN;
      if (score > save.bestScore[levelIndex]) save.bestScore[levelIndex] = score;
      save.cleared[levelIndex] = true;
      persist();
      sfx("win");
      emit();
      return;
    }

    time -= dt;
    if (time <= 0) {
      time = 0;
      kill("The clock ran out.");
      return;
    }

    const look = player.x + PW / 2 + player.facing * 22 - VIEW_W / 2;
    const maxX = Math.max(0, mapW * TILE - VIEW_W);
    const tx = Math.max(0, Math.min(maxX, look));
    camX += (tx - camX) * Math.min(1, dt * 7);
    const ty = player.y + PH / 2 - PLAY_H / 2;
    const maxY = Math.max(0, mapH * TILE - PLAY_H);
    const targetY = Math.max(0, Math.min(maxY, ty));
    camY += (targetY - camY) * Math.min(1, dt * 6);

    anim += dt;
    squash = Math.max(0, squash - dt);
    if (shake > 0) shake = Math.max(0, shake - dt * 14);
    for (let i = bits.length - 1; i >= 0; i--) {
      const b = bits[i];
      b.life -= dt;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.vy += 280 * dt;
      if (b.life <= 0) bits.splice(i, 1);
    }
  }

  function text(str: string, x: number, y: number, color: string, scale = 2) {
    g.fillStyle = color;
    let cx = x;
    for (const ch of str) {
      const rows = FONT[ch] ?? FONT[" "];
      for (let r = 0; r < rows.length; r++) {
        for (let c = 0; c < 3; c++) {
          if (rows[r][c] === "1") g.fillRect(cx + c * scale, y + r * scale, scale, scale);
        }
      }
      cx += 4 * scale;
    }
  }

  function drawBrick(x: number, y: number, tx: number, ty: number, dark: boolean) {
    const soil = !dark && (tx + ty) % 5 === 0;
    if (soil) {
      g.fillStyle = "#24160f";
      g.fillRect(x, y, TILE, TILE);
      g.fillStyle = "#3a2618";
      g.fillRect(x + 1, y + 3, 14, 5);
      g.fillStyle = "#1d4a28";
      g.fillRect(x + 2, y + 1, 5, 2);
      if ((tx * 3 + ty) % 7 === 0) {
        g.fillStyle = "#e8e0d0";
        g.fillRect(x + 10, y + 9, 3, 1);
        g.fillRect(x + 11, y + 8, 1, 3);
      }
      return;
    }
    g.fillStyle = dark ? "#16121c" : "#3c3a46";
    g.fillRect(x, y, TILE, TILE);
    g.fillStyle = dark ? "#262232" : "#524e5c";
    g.fillRect(x + 1, y + 1, 14, 6);
    g.fillRect(x + 1, y + 9, 14, 6);
    g.fillStyle = "#120e16";
    if ((tx + ty * 2) % 3 === 0) {
      g.fillRect(x + 6, y + 2, 1, 5);
      g.fillRect(x + 7, y + 6, 1, 4);
    }
    if ((tx * 5 + ty) % 4 === 0) {
      g.fillStyle = "#1e4a28";
      g.fillRect(x + 1, y + 1, 4, 2);
    }
    if ((tx + ty) % 6 === 0) {
      g.fillStyle = "#d4d0c6";
      g.fillRect(x + 12, y + 1, 3, 1);
      g.fillRect(x + 14, y + 2, 1, 2);
    }
    if ((tx * 7 + ty) % 11 === 0) {
      g.fillStyle = "#e6dcc8";
      g.fillRect(x + 4, y + 10, 4, 3);
      g.fillStyle = "#120e16";
      g.fillRect(x + 5, y + 11, 1, 1);
      g.fillRect(x + 7, y + 11, 1, 1);
    }
  }

  function drawLava(x: number, y: number, surface: boolean) {
    g.fillStyle = surface ? "#102418" : "#08140e";
    g.fillRect(x, y, TILE, TILE);
    if (!surface) {
      g.fillStyle = "#143022";
      g.fillRect(x + 2, y + 4, 3, 2);
      return;
    }
    const wob = Math.sin(vis * 5 + x * 0.35);
    g.fillStyle = "#2a1048";
    g.fillRect(x, y + 2, TILE, 5);
    g.fillStyle = "#1f8a3c";
    g.fillRect(x, y + 6, TILE, TILE - 6);
    g.globalAlpha = 0.45 + wob * 0.1;
    g.fillStyle = "#b8ff6a";
    g.fillRect(x, y, TILE, 2);
    g.globalAlpha = 1;
    const phase = (vis * 14 + x * 0.4) % 12;
    g.fillStyle = "#d6ff8a";
    g.fillRect(x + 3, y + 9 - (phase % 6), 2, 2);
    g.fillStyle = "#c9a0ff";
    g.fillRect(x + 10, y + 11 - ((phase + 4) % 6), 2, 2);
  }

  function drawCrate(x: number, y: number, usedCrate: boolean, tx: number, ty: number) {
    const age = vis - (pumpkinFlash.get(`${tx},${ty}`) ?? -10);
    const flash = age >= 0 && age < 0.16;
    const flick = flash ? 1 : 0.72 + Math.sin(vis * 8 + x * 0.2) * 0.28;
    g.fillStyle = usedCrate ? "#3a220e" : "#e07018";
    g.fillRect(x, y, TILE, TILE);
    g.fillStyle = usedCrate ? "#241408" : flash ? "#ffe7a8" : "#ff9a22";
    g.fillRect(x + 2, y + 3, 12, 11);
    g.fillStyle = "#245024";
    g.fillRect(x + 7, y + 1, 2, 3);
    if (!usedCrate) {
      g.fillStyle = flash ? "#fff6d0" : `rgba(40, 8, 0, ${0.75 + flick * 0.2})`;
      g.fillRect(x + 4, y + 6, 2, 2);
      g.fillRect(x + 10, y + 6, 2, 2);
      g.fillRect(x + 5, y + 10, 6, 2);
      g.fillRect(x + 6, y + 12, 4, 1);
      g.globalAlpha = 0.35 * flick;
      g.fillStyle = "#fff1a8";
      g.fillRect(x + 5, y + 7, 1, 1);
      g.fillRect(x + 10, y + 7, 1, 1);
      g.globalAlpha = 1;
    } else {
      g.fillStyle = "#140c08";
      g.fillRect(x + 4, y + 7, 8, 4);
    }
  }

  function drawPlanks(x: number, y: number, w: number, h: number) {
    g.fillStyle = "#2a1c12";
    g.fillRect(x, y, w, h);
    g.fillStyle = "#6a5034";
    g.fillRect(x, y, w, 1);
    for (let i = 0; i < w; i += 8) {
      g.fillStyle = i % 16 === 0 ? "#5a4030" : "#4a3424";
      g.fillRect(x + i, y + 1, 7, Math.max(1, h - 2));
      g.fillStyle = "#1a100c";
      g.fillRect(x + i + 7, y, 1, h);
    }
  }

  function blit(img: Frame | null, x: number, y: number, w: number, h: number, flip = false, smooth = false) {
    if (!img) return false;
    g.imageSmoothingEnabled = smooth;
    if (!flip) {
      g.drawImage(img, x, y, w, h);
      g.imageSmoothingEnabled = false;
      return true;
    }
    g.save();
    g.translate(Math.round(x + w), Math.round(y));
    g.scale(-1, 1);
    g.drawImage(img, 0, 0, w, h);
    g.restore();
    g.imageSmoothingEnabled = false;
    return true;
  }

  function drawNight(cam: number) {
    const sky = g.createLinearGradient(0, HUD_H, 0, VIEW_H);
    sky.addColorStop(0, "#100818");
    sky.addColorStop(0.62, "#1a1030");
    sky.addColorStop(1, "#241428");
    g.fillStyle = sky;
    g.fillRect(0, HUD_H, VIEW_W, PLAY_H);

    g.fillStyle = "#f4efe4";
    for (let i = 0; i < 26; i++) {
      const x = (i * 97 + 13) % VIEW_W;
      const y = HUD_H + 4 + ((i * 53) % 78);
      if (reduce || Math.sin(vis * 2 + i) > -0.2) g.fillRect(x, y, 1, 1);
    }

    g.fillStyle = "#f3efe2";
    g.beginPath();
    g.arc(198, HUD_H + 28, 14, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = "#120a1c";
    g.beginPath();
    g.arc(204, HUD_H + 26, 11, 0, Math.PI * 2);
    g.fill();

    if (!reduce) {
      g.fillStyle = "rgba(22, 12, 40, 0.9)";
      const drift = (vis * 8) % (VIEW_W + 60);
      g.fillRect(drift - 50, HUD_H + 16, 36, 6);
      g.fillRect(drift - 42, HUD_H + 12, 18, 5);
      g.fillRect((drift * 0.7 + 90) % (VIEW_W + 70) - 30, HUD_H + 34, 44, 6);
    }

    const far = -Math.round(cam * 0.18);
    g.fillStyle = "#0c0614";
    g.beginPath();
    g.moveTo(far - 30, HUD_H + 148);
    g.lineTo(far + 24, HUD_H + 118);
    g.lineTo(far + 86, HUD_H + 136);
    g.lineTo(far + 150, HUD_H + 104);
    g.lineTo(far + 230, HUD_H + 138);
    g.lineTo(far + 340, HUD_H + 112);
    g.lineTo(far + 430, HUD_H + 148);
    g.closePath();
    g.fill();
    const trees = [18, 64, 112, 250, 310, 370];
    for (const tx of trees) {
      const x = far + tx;
      g.fillRect(x, HUD_H + 100, 3, 26);
      g.beginPath();
      g.moveTo(x - 8, HUD_H + 112);
      g.lineTo(x + 1, HUD_H + 88);
      g.lineTo(x + 11, HUD_H + 114);
      g.fill();
    }
    const hx = far + 158;
    g.fillRect(hx, HUD_H + 98, 26, 26);
    g.beginPath();
    g.moveTo(hx - 3, HUD_H + 100);
    g.lineTo(hx + 13, HUD_H + 82);
    g.lineTo(hx + 29, HUD_H + 100);
    g.fill();
    g.fillRect(hx + 16, HUD_H + 72, 4, 12);
    g.fillStyle = "#1a1028";
    g.fillRect(hx + 5, HUD_H + 110, 5, 8);
    g.fillRect(hx + 15, HUD_H + 106, 4, 4);

    const near = -Math.round(cam * 0.42);
    g.fillStyle = "#120818";
    for (let i = 0; i < 7; i++) {
      const x = near + 12 + i * 64;
      const h = 8 + (i % 3) * 4;
      g.fillRect(x, HUD_H + 158 - h, 8, h);
      g.fillRect(x - 2, HUD_H + 158 - h, 12, 2);
      g.fillRect(x + 22, HUD_H + 148, 2, 14);
      g.fillRect(x + 22, HUD_H + 152, 14, 2);
      g.fillRect(x + 22, HUD_H + 158, 14, 2);
    }
  }

  function drawMist() {
    if (reduce) return;
    const fog = Math.sin(vis * 0.45) * 10;
    g.fillStyle = "rgba(186, 206, 196, 0.08)";
    g.fillRect(fog - 12, VIEW_H - 34, VIEW_W + 24, 12);
    g.fillStyle = "rgba(170, 190, 180, 0.12)";
    g.fillRect(-fog, VIEW_H - 20, VIEW_W + 12, 20);
    for (let i = 0; i < 3; i++) {
      const span = 8 + i * 2.5;
      const t = (vis * 0.35 + i * 3.1) % span;
      if (t > 2.4) continue;
      const x = ((t / 2.4) * (VIEW_W + 24) - 12) | 0;
      const y = HUD_H + 36 + i * 16 + Math.sin(vis * 6 + i) * 2;
      const flap = Math.sin(vis * 16 + i) > 0;
      g.fillStyle = "#0a0610";
      g.fillRect(x, y, 2, 1);
      g.fillRect(x - (flap ? 3 : 1), y - 1, flap ? 3 : 2, 1);
      g.fillRect(x + 2, y - 1, flap ? 3 : 2, 1);
    }
    g.globalAlpha = 0.55;
    for (let i = 0; i < 8; i++) {
      const x = (i * 53 + vis * (6 + (i % 3))) % VIEW_W;
      const y = HUD_H + ((i * 37 + vis * 10) % (PLAY_H - 24));
      g.fillStyle = i % 2 === 0 ? "#ff9a3c" : "#8dff6a";
      g.fillRect(x, y, 1, 1);
    }
    g.globalAlpha = 1;
  }

  function drawCostume(dx: number, dy: number, facing: number, moving: boolean) {
    const dir = facing < 0 ? -1 : 1;
    const hx = dx + 12;
    const hy = dy + 1;
    g.fillStyle = "#140c1c";
    g.fillRect(hx - 6, hy + 4, 12, 2);
    g.fillRect(hx - 2, hy - 3, 4, 7);
    g.fillRect(hx - 1, hy - 6, 2, 3);
    g.fillStyle = "#e07020";
    g.fillRect(hx - 2, hy + 1, 4, 1);
    if (!moving) return;
    const wave = reduce ? 0 : Math.sin(vis * 12) * 2;
    const cx = hx - dir * 6;
    g.fillStyle = "#120816";
    g.fillRect(cx, hy + 8, 3, 7);
    g.fillRect(cx - dir * 2, hy + 12 + wave, 2, 5);
  }

  function render() {
    g.imageSmoothingEnabled = false;
    g.fillStyle = "#07060c";
    g.fillRect(0, 0, VIEW_W, VIEW_H);

    const sx = reduce ? 0 : Math.round(Math.sin(vis * 40) * shake);
    const sy = reduce ? 0 : Math.round(Math.cos(vis * 33) * shake * 0.6);
    const cx = Math.round(camX);
    const cy = Math.round(camY);

    g.save();
    g.beginPath();
    g.rect(0, HUD_H, VIEW_W, PLAY_H);
    g.clip();
    drawNight(cx);
    g.save();
    g.translate(-cx + sx, HUD_H - cy + sy);

    for (let ty = 0; ty < mapH; ty++) {
      for (let tx = 0; tx < mapW; tx++) {
        const t = tiles[ty * mapW + tx];
        if (t === T.Empty) continue;
        const x = tx * TILE;
        const y = ty * TILE;
        if (t === T.Brick) drawBrick(x, y, tx, ty, false);
        else if (t === T.Castle) drawBrick(x, y, tx, ty, true);
        else if (t === T.Lava) drawLava(x, y, true);
        else if (t === T.Deep) drawLava(x, y, false);
        else if (t === T.Crate || t === T.Used) drawCrate(x, y, t === T.Used, tx, ty);
      }
    }

    for (const p of plats) drawPlanks(p.x, p.y, p.w, p.h);

    const coinFrame = sprites[`coin-${(Math.floor(vis * 8) % 4) + 1}`];
    for (const c of coins) {
      if (!coinFrame) continue;
      const bob = reduce ? 0 : Math.sin(vis * 2.4 + c.x * 0.08) * 1.2;
      g.fillStyle = "rgba(190, 255, 220, 0.22)";
      g.beginPath();
      g.ellipse(c.x, c.y + bob, 12, 6, 0, 0, Math.PI * 2);
      g.fill();
      blit(coinFrame, c.x - 13, c.y - 7 + bob, 26, 14, false, true);
    }

    checkpoints.forEach((cp, i) => {
      const x = cp.tx * TILE - 6;
      const y = cp.ty * TILE - 8;
      const on = lit.has(i) || i <= snap.cp;
      if (on) {
        g.fillStyle = "rgba(255,176,32,0.28)";
        g.beginPath();
        g.arc(cp.tx * TILE + 8, cp.ty * TILE + 8, 12, 0, Math.PI * 2);
        g.fill();
      }
      if (!blit(sprites.checkpoint, x, y, 28, 28)) {
        g.fillStyle = on ? "#ffb020" : "#8a7040";
        g.fillRect(cp.tx * TILE + 6, cp.ty * TILE + 4, 4, 12);
        g.fillRect(cp.tx * TILE + 3, cp.ty * TILE + 2, 10, 6);
      }
    });

    const flagImg = sprites.flag;
    if (flagImg) blit(flagImg, flag.tx * TILE - 10, flag.ty * TILE - 52, 36, 68);
    else {
      g.fillStyle = "#c9853a";
      g.fillRect(flag.tx * TILE + 6, flag.ty * TILE - 48, 3, 64);
      g.fillStyle = "#ffb020";
      g.beginPath();
      g.moveTo(flag.tx * TILE + 9, flag.ty * TILE - 46);
      g.lineTo(flag.tx * TILE + 24, flag.ty * TILE - 38);
      g.lineTo(flag.tx * TILE + 9, flag.ty * TILE - 30);
      g.fill();
    }

    for (const f of fires) {
      const ang = vis * f.speed + f.phase;
      g.strokeStyle = "#3a1860";
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(f.x, f.y);
      const endX = f.x + Math.cos(ang) * f.gap * f.count;
      const endY = f.y + Math.sin(ang) * f.gap * f.count;
      g.lineTo(endX, endY);
      g.stroke();
      for (let i = 1; i <= f.count; i++) {
        const ox = f.x + Math.cos(ang) * f.gap * i;
        const oy = f.y + Math.sin(ang) * f.gap * i;
        g.fillStyle = "rgba(120, 255, 90, 0.28)";
        g.beginPath();
        g.arc(ox, oy, 6, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = "#6dff4a";
        g.beginPath();
        g.arc(ox, oy, 3.5, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = "#f4ffe4";
        g.fillRect(ox - 1, oy - 1, 2, 2);
      }
    }

    for (const b of bits) {
      g.globalAlpha = Math.max(0, b.life / b.max);
      g.fillStyle = b.color;
      g.fillRect(b.x, b.y, b.s, b.s);
      g.globalAlpha = 1;
    }

    if (!(invuln > 0 && Math.floor(vis * 14) % 2 === 0)) {
      const airborne = mode === "play" && !player.grounded;
      let sheet = "idle";
      let fps = 4;
      if (airborne) {
        sheet = "jump";
        fps = 6;
      } else if (Math.abs(player.vx) > 12) {
        sheet = "run";
        fps = 10;
      }
      let frame = (Math.floor(anim * fps) % 4) + 1;
      if (airborne) {
        if (player.vy < -40) frame = 2;
        else if (player.vy < 40) frame = 3;
        else frame = 4;
      }
      const img = sprites[`${sheet}-${frame}`];
      const dw = 24;
      const dh = 28;
      const squashX = 1 + (squash < 0 ? 0.18 : squash > 0 ? -0.12 : 0);
      const squashY = 1 + (squash < 0 ? -0.16 : squash > 0 ? 0.14 : 0);
      const dx = player.x + PW / 2 - (dw * squashX) / 2;
      const dy = player.y + PH - dh * squashY;
      if (!blit(img, dx, dy, dw * squashX, dh * squashY, player.facing < 0)) {
        g.fillStyle = "#141820";
        g.fillRect(player.x, player.y + 4, PW, PH - 4);
        g.fillStyle = "#1c2438";
        g.fillRect(player.x, player.y + 7, PW, 6);
        g.fillStyle = "#ffb020";
        g.fillRect(player.x + 1, player.y + 8, PW - 2, 2);
        g.fillStyle = "#070708";
        g.fillRect(player.x + 1, player.y, PW - 2, 6);
        g.fillStyle = "#ffb020";
        g.fillRect(player.x + 3, player.y + 2, 4, 3);
        g.fillStyle = "#f3efe6";
        g.fillRect(player.x + 1, player.y + PH - 3, 3, 3);
        g.fillRect(player.x + PW - 4, player.y + PH - 3, 3, 3);
      }
      drawCostume(dx, dy, player.facing, airborne || Math.abs(player.vx) > 12);
      if (!player.grounded && airJumps > 0) {
        g.fillStyle = "#ff8a1e";
        g.fillRect(player.x + PW / 2 - 1, player.y - 5, 2, 2);
      }
    }

    g.restore();
    drawMist();
    g.restore();

    const flick = reduce ? 0 : Math.sin(vis * 2.4) * 0.015 + Math.sin(vis * 9) * 0.008;
    g.fillStyle = `rgba(255, 120, 30, ${0.035 + flick})`;
    g.fillRect(0, HUD_H, VIEW_W, PLAY_H);
    g.fillStyle = "rgba(6, 0, 14, 0.55)";
    g.fillRect(0, HUD_H, 8, PLAY_H);
    g.fillRect(VIEW_W - 8, HUD_H, 8, PLAY_H);
    g.fillRect(0, HUD_H, VIEW_W, 6);
    g.fillRect(0, VIEW_H - 6, VIEW_W, 6);

    g.fillStyle = "#0c0812";
    g.fillRect(0, 0, VIEW_W, HUD_H);
    g.fillStyle = "#ff8a1e";
    g.fillRect(0, HUD_H - 1, VIEW_W, 1);
    const def = LEVELS[levelIndex];
    text("PIP", 8, 4, "#f3efe6");
    text(String(Math.floor(score)).padStart(6, "0"), 8, 18, "#f3efe6");
    const coinHud = sprites["coin-1"];
    if (coinHud) blit(coinHud, 74, 5, 18, 10, false, true);
    text(`X${String(coinsN).padStart(2, "0")}`, 94, 6, "#ff8a1e");
    text(`WORLD ${def.world}`, 146, 5, "#f3efe6", 1);
    text("HAUNTED HOLLOW", 146, 16, "#ff8a1e", 1);
    text("TIME", 206, 4, "#f3efe6");
    const timeColor = time < 30 ? "#ff8a1e" : "#f3efe6";
    text(String(Math.max(0, Math.ceil(time))).padStart(3, "0"), 210, 18, timeColor);
  }

  function fit() {
    const parent = canvas.parentElement;
    if (!parent) return;
    const rect = parent.getBoundingClientRect();
    const s = Math.min(rect.width / VIEW_W, rect.height / VIEW_H);
    const crisp = s >= 2 ? Math.floor(s) : s;
    canvas.style.width = `${Math.max(1, Math.floor(VIEW_W * crisp))}px`;
    canvas.style.height = `${Math.max(1, Math.floor(VIEW_H * crisp))}px`;
  }

  function frame(now: number) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    acc += dt;
    let steps = 0;
    while (acc >= 1 / 60 && steps < 5) {
      if (mode === "play" || mode === "title" || mode === "select") vis += 1 / 60;
      if (mode === "play") sim(1 / 60);
      else anim += 1 / 60;
      acc -= 1 / 60;
      steps += 1;
    }
    render();
    raf = requestAnimationFrame(frame);
  }

  function onKeyDown(e: KeyboardEvent) {
    if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Space"].includes(e.code)) e.preventDefault();
    const el = document.activeElement;
    if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || (el as HTMLElement).isContentEditable)) return;
    keyAt.set(e.code, performance.now());
    keys.add(e.code);
    if (e.repeat) return;
    unlock();
    if (e.code === "Escape") {
      if (mode === "play") {
        dropMove();
        mode = "pause";
        emit();
      } else if (mode === "pause") {
        mode = "play";
        emit();
      }
    } else if (e.code === "Enter") {
      if (mode === "title") {
        loadLevel(0);
        dropMove();
        mode = "play";
        emit();
      } else if (mode === "dead") {
        restore();
        dropMove();
        mode = "play";
        emit();
      } else if (mode === "clear") {
        if (levelIndex < LEVELS.length - 1) {
          loadLevel(levelIndex + 1);
          dropMove();
          mode = "play";
        } else mode = "select";
        emit();
      } else if (mode === "pause") {
        dropMove();
        mode = "play";
        emit();
      }
    } else if (e.code === "KeyR" && (mode === "dead" || mode === "pause")) {
      loadLevel(levelIndex);
      dropMove();
      mode = "play";
      emit();
    } else if (e.code === "KeyM") {
      muted = !muted;
      save.muted = muted;
      persist();
      emit();
    }
  }

  function onKeyUp(e: KeyboardEvent) {
    keys.delete(e.code);
    keyAt.delete(e.code);
  }

  function releaseTouch() {
    touchL = false;
    touchR = false;
    touchJ = false;
  }

  function dropMove() {
    for (const code of ["ArrowLeft", "ArrowRight", "KeyA", "KeyD"]) {
      keys.delete(code);
      keyAt.delete(code);
    }
    releaseTouch();
    player.vx = 0;
  }

  function onTouchEnd(e: TouchEvent) {
    if (e.touches.length === 0) releaseTouch();
  }

  function onBlur() {
    keys.clear();
    keyAt.clear();
    releaseTouch();
  }

  function onVis() {
    if (document.hidden) onBlur();
  }

  loadLevel(0);
  mode = "title";
  emit();
  fit();

  let last = performance.now();
  let acc = 0;
  let raf = requestAnimationFrame(frame);
  const ro = new ResizeObserver(fit);
  if (canvas.parentElement) ro.observe(canvas.parentElement);
  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);
  window.addEventListener("blur", onBlur);
  window.addEventListener("touchend", onTouchEnd);
  window.addEventListener("touchcancel", releaseTouch);
  document.addEventListener("visibilitychange", onVis);
  window.addEventListener("pointerdown", unlock, { passive: true });

  window.__controlsTest = {
    getX: () => player.x,
    getY: () => player.y,
    getVX: () => player.vx,
    getVY: () => player.vy,
    getFacing: () => player.facing,
    setKeys: (codes: string[]) => {
      qaOverride = new Set(codes);
    },
  };

  return {
    destroy() {
      cancelAnimationFrame(raf);
      ro.disconnect();
      stopBgm();
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("touchend", onTouchEnd);
      window.removeEventListener("touchcancel", releaseTouch);
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("pointerdown", unlock);
      if (window.__controlsTest) delete window.__controlsTest;
    },
    start(index: number) {
      unlock();
      loadLevel(index);
      dropMove();
      mode = "play";
      emit();
    },
    resume() {
      if (mode === "pause") {
        dropMove();
        mode = "play";
        emit();
      }
    },
    pause() {
      if (mode === "play") {
        dropMove();
        mode = "pause";
        emit();
      }
    },
    respawn() {
      if (mode !== "dead") return;
      restore();
      dropMove();
      mode = "play";
      emit();
    },
    restart() {
      loadLevel(levelIndex);
      dropMove();
      mode = "play";
      emit();
    },
    next() {
      if (levelIndex < LEVELS.length - 1) {
        loadLevel(levelIndex + 1);
        dropMove();
        mode = "play";
      } else mode = "select";
      emit();
    },
    toSelect() {
      mode = "select";
      emit();
    },
    toTitle() {
      mode = "title";
      emit();
    },
    toggleMute() {
      muted = !muted;
      save.muted = muted;
      persist();
      if (muted) stopBgm();
      else unlock();
      emit();
    },
    touch(which, pressed) {
      unlock();
      if (which === "l") touchL = pressed;
      if (which === "r") touchR = pressed;
      if (which === "j") touchJ = pressed;
    },
  };
}

function overlap(ax: number, ay: number, aw: number, ah: number, bx: number, by: number, bw: number, bh: number) {
  return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
}

function circleHits(cx: number, cy: number, r: number, x: number, y: number, w: number, h: number) {
  const nx = Math.max(x, Math.min(cx, x + w));
  const ny = Math.max(y, Math.min(cy, y + h));
  const dx = cx - nx;
  const dy = cy - ny;
  return dx * dx + dy * dy < r * r;
}
