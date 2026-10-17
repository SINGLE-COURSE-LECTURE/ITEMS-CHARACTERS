/**
 * 방망이 콤보 1 ~ 3 단 — 콘티(내려찍기 → 올려치기 → 가로 베기)대로 「방망이 자리」를 키로 잡고 두 팔은 IK 로 맞춘다.
 *
 * 키마다 정하는 것 (캐릭터 공간: 발 가운데 원점 · 위 +Y · 앞 +Z · 캐릭터 왼쪽 +X, 단위 m)
 *   H     오른 손목 자리
 *   D     방망이가 뻗는 방향 (손잡이 → 굵은 쪽). 게임은 방망이를 오른손 뼈 +Z(엄지 쪽)로 붙인다 (equipment.ts buildBat)
 *   몸    yaw(왼쪽 +) · pitch(앞 숙임 +) · hipYaw · drop(골반 내림) · 다리(lx · lk · lf · rx · rk · rf · lad · rad)
 * 팔: 오른팔은 손목이 H 에 닿게 두 뼈 IK(팔꿈치는 아래 · 바깥), 손은 +Z 가 D 를 보게 돌린다.
 *     왼손 주먹은 오른손 주먹(손목 + 손 회전 × GRIP_R)보다 손잡이 끝 쪽으로 GRIP_GAP 만큼, 같은 방망이 위를 쥔다 — 콘티대로 두 손 쥐기.
 * 방향은 콘티 그대로 (캐릭터가 화면을 볼 때): 내려찍기는 오른쪽 앞 아래 · 올려치기는 왼쪽 어깨 위로 · 가로 베기는 왼쪽 → 오른쪽.
 * 앞 단의 끝 키 = 다음 단의 첫 키 — 콤보가 끊기지 않게 이어진다. 4 단(홈런)은 bat-from-mocap.mjs 의 실제 스윙.
 * 타격은 0.5 · 「끝」 자세는 0.7 에 닿아 그대로 멈춘다 — 게임은 0.74 부터 다음 단을 받는다 (characterModel.ts ARMED_COMBO_OPEN).
 *
 * 쓰는 법 (3DLECTURE-GAMES 폴더에서): node ITEMS-CHARACTERS/scripts/bat-ik-anims.mjs [동작 파일]
 * 서기(IdleArmed)는 건드리지 않는다 — 원래 파일의 칼 서기 그대로.
 * BAT_DEBUG=1 을 주면 프레임 사이에 12° 넘게 도는 뼈를 찍는다 (팔꿈치 · 손목이 순간 뒤집히는 곳 찾기)
 * 순서: bat-from-mocap.mjs (4 단) → 이 스크립트 (1 ~ 3 단) → feminine-anims.mjs (_F)
 */
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const animsPath = process.argv[2] ?? join(here, "..", "..", "core", "assets", "models", "player-anims.glb");
const FPS = 60;
/** 왼손이 오른손보다 손잡이 끝 쪽으로 이만큼 (m) — 게임은 오른손을 손잡이 끝에서 0.17 m 자리에 쥐게 붙인다 (equipment.ts buildBat GRIP) */
const GRIP_GAP = 0.085;
/** 손 뼈(손목) 기준 주먹 쥔 자리 — 방망이가 지나가는 곳 (handFit.ts FALLBACK, 왼손은 좌우 반대) */
const GRIP_R = [-0.069, 0.006, -0.004];
const GRIP_L = [0.069, 0.006, -0.004];

// ── 벡터 · 사원수 ────────────────────────────────────────────────
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const scale = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = (a) => Math.hypot(a[0], a[1], a[2]);
const unit = (a) => scale(a, 1 / (len(a) || 1));
const mul = (a, b) => [
  a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
  a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
  a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
  a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
];
const inv = (q) => [-q[0], -q[1], -q[2], q[3]];
const rotate = (q, v) => {
  const p = mul(mul(q, [v[0], v[1], v[2], 0]), inv(q));
  return [p[0], p[1], p[2]];
};
const qnorm = (q) => {
  const l = Math.hypot(...q) || 1;
  return q.map((v) => v / l);
};
const axis = (x, y, z, deg) => {
  const a = (deg * Math.PI) / 360;
  return [x * Math.sin(a), y * Math.sin(a), z * Math.sin(a), Math.cos(a)];
};
const X = (d) => axis(1, 0, 0, d);
const Y = (d) => axis(0, 1, 0, d);
const Z = (d) => axis(0, 0, 1, d);
/** a 방향을 b 방향으로 가장 적게 돌리는 회전 */
const fromTo = (a, b) => {
  const u = unit(a);
  const v = unit(b);
  const d = dot(u, v);
  if (d < -0.9999) {
    const ortho = Math.abs(u[0]) < 0.9 ? cross(u, [1, 0, 0]) : cross(u, [0, 1, 0]);
    const n = unit(ortho);
    return [n[0], n[1], n[2], 0];
  }
  const c = cross(u, v);
  return qnorm([c[0], c[1], c[2], 1 + d]);
};
/** 세 축(열)으로 회전 — x · y · z 는 서로 수직인 단위 벡터 */
const fromBasis = (x, y, z) => {
  const m00 = x[0], m01 = y[0], m02 = z[0];
  const m10 = x[1], m11 = y[1], m12 = z[1];
  const m20 = x[2], m21 = y[2], m22 = z[2];
  const tr = m00 + m11 + m22;
  let q;
  if (tr > 0) {
    const s = Math.sqrt(tr + 1) * 2;
    q = [(m21 - m12) / s, (m02 - m20) / s, (m10 - m01) / s, 0.25 * s];
  } else if (m00 > m11 && m00 > m22) {
    const s = Math.sqrt(1 + m00 - m11 - m22) * 2;
    q = [0.25 * s, (m01 + m10) / s, (m02 + m20) / s, (m21 - m12) / s];
  } else if (m11 > m22) {
    const s = Math.sqrt(1 + m11 - m00 - m22) * 2;
    q = [(m01 + m10) / s, 0.25 * s, (m12 + m21) / s, (m02 - m20) / s];
  } else {
    const s = Math.sqrt(1 + m22 - m00 - m11) * 2;
    q = [(m02 + m20) / s, (m12 + m21) / s, 0.25 * s, (m10 - m01) / s];
  }
  return qnorm(q);
};
/** 팔뚝 비틀림 — 앞 프레임 값 (굽는 동작마다 새로) */
const lastTwist = {};
const dot4 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];

// ── 콤보 키 ─────────────────────────────────────────────────────
const n = (x, y, z) => unit([x, y, z]);
// 콘티처럼 다리를 넓게 벌리고 무릎을 굽힌 자세
const STANCE = { lx: -16, lk: 24, lf: -6, rx: 12, rk: 24, rf: -6, lad: -14, rad: -14, drop: 0.08 };
// 1 단 끝 = 2 단 시작 · 2 단 끝 = 3 단 시작
// 콘티 방향 (캐릭터가 화면을 볼 때): 1 단은 몸 오른쪽 앞 아래로 끝나고 · 2 단은 거기서 왼쪽 어깨 위로 · 3 단은 왼쪽에서 오른쪽으로
const LOW_RIGHT = { ...STANCE, yaw: -18, hipYaw: -5, pitch: 18, lx: -30, lk: 40, lf: -8, rx: 20, rk: 30, drop: 0.11, H: [-0.16, 0.86, 0.3], D: n(-0.85, -0.3, 0.35) };
const HIGH_LEFT = { ...STANCE, yaw: 35, hipYaw: 10, pitch: 0, H: [0.16, 1.42, 0.12], D: n(0.2, 0.85, -0.48) };
const RIGHT_END = { ...STANCE, yaw: -45, hipYaw: -12, H: [-0.36, 1.15, 0.24], D: n(-0.97, 0.05, -0.15) };
// 1 단 첫 키 — 오른 어깨 위로 방망이를 비스듬히 멘다 (서기에서 여기로 섞여 들어온다)
const READY = { ...STANCE, yaw: -15, hipYaw: -5, H: [-0.18, 1.25, 0.16], D: n(0.12, 0.82, -0.56) };

const CLIPS = {
  // 서기(IdleArmed)는 원래 칼 서기(UAL1 Sword_Idle)를 그대로 둔다 — 콘티 준비 자세로 세워 봤더니 더 엉성했다.
  // 1 단은 거기서 섞여 들어오며 오른 어깨 위로 치켜든다 (characterModel.ts 가 1 단 시작을 더 길게 섞는다)
  // 1 단 내려찍기 — 머리 위로 들었다가 왼발을 내디디며 앞 아래로 곧장 (타격 0.5)
  ArmedAttack1: {
    seconds: 0.62,
    keys: [
      [0, READY],
      // 콘티 1 단 준비 — 오른 어깨 위로 비스듬히 치켜든다 (머리 위 한가운데가 아니라)
      [0.26, { ...STANCE, yaw: -12, pitch: -6, lx: -22, lk: 30, H: [-0.2, 1.45, 0.05], D: n(-0.4, 0.7, -0.55) }],
      [0.4, { ...STANCE, yaw: -8, pitch: 8, lx: -28, lk: 35, H: [-0.12, 1.3, 0.28], D: n(-0.3, 0.55, 0.78) }],
      // 콘티 1 단 타격 — 오른발 앞 바닥까지 내려찍는다
      [0.5, { ...STANCE, yaw: -10, pitch: 24, lx: -34, lk: 44, lf: -8, rx: 20, rk: 32, drop: 0.12, H: [-0.1, 0.8, 0.34], D: n(-0.2, -0.85, 0.45) }],
      [0.7, LOW_RIGHT],
      [1, LOW_RIGHT],
    ],
  },
  // 2 단 올려치기 — 오른쪽 아래에서 왼쪽 어깨 위로 비스듬히 (타격 0.5)
  ArmedAttack2: {
    seconds: 0.55,
    keys: [
      [0, LOW_RIGHT],
      [0.22, { ...STANCE, yaw: -25, hipYaw: -8, pitch: 16, drop: 0.08, H: [-0.15, 0.86, 0.3], D: n(-0.6, -0.6, 0.5) }],
      [0.45, { ...STANCE, yaw: 8, pitch: 4, drop: 0.05, H: [0.03, 1.15, 0.4], D: n(0.45, 0.65, 0.6) }],
      [0.7, HIGH_LEFT],
      [1, HIGH_LEFT],
    ],
  },
  // 3 단 가로 베기 — 왼쪽 위에서 가슴 높이로 왼쪽 → 오른쪽 (타격 0.5) · 끝은 오른쪽 — 4 단 홈런 준비(오른 어깨)로 이어진다
  ArmedAttack3: {
    seconds: 0.6,
    keys: [
      [0, HIGH_LEFT],
      [0.22, { ...STANCE, yaw: 45, hipYaw: 12, H: [0.28, 1.24, -0.02], D: n(0.55, 0.12, -0.82) }],
      [0.36, { ...STANCE, yaw: 20, hipYaw: 5, drop: 0.06, H: [0.2, 1.2, 0.28], D: n(0.9, 0.1, 0.4) }],
      [0.5, { ...STANCE, yaw: -10, hipYaw: -4, drop: 0.09, H: [0, 1.12, 0.42], D: n(-0.75, 0.05, 0.65) }],
      [0.7, RIGHT_END],
      [1, RIGHT_END],
    ],
  },
};

/**
 * 키 사이 — 키를 지나는 곡선(에르미트, 이웃 키로 기울기)으로 잇는다. 처음 · 끝 키에서만 멈춘다.
 * 키마다 멈췄다 가면(키마다 ease) 타격 순간에도 방망이가 멈칫했다.
 * 방향(D)도 같은 곡선으로 이은 뒤 길이 1 로 — 이웃 키의 D 가 120° 넘게 벌어지면 사이가 뒤집히니 가운데 키를 넣는다.
 */
const sample = (keys, t) => {
  if (t <= keys[0][0]) return keys[0][1];
  const last = keys.length - 1;
  if (t >= keys[last][0]) return keys[last][1];
  let i = 1;
  while (keys[i][0] < t) i += 1;
  const [t0, a] = keys[i - 1];
  const [t1, b] = keys[i];
  const span = t1 - t0 || 1;
  const u = (t - t0) / span;
  const h00 = 2 * u ** 3 - 3 * u ** 2 + 1;
  const h10 = u ** 3 - 2 * u ** 2 + u;
  const h01 = -2 * u ** 3 + 3 * u ** 2;
  const h11 = u ** 3 - u ** 2;
  const value = (key, k) => {
    const v = key[k] ?? STANCE[k] ?? 0;
    return Array.isArray(v) ? v : [v];
  };
  // 키 j 에서의 기울기 (초당) — 처음 · 끝 키는 0
  const slope = (j, k) => {
    if (j === 0 || j === last) return value(keys[j][1], k).map(() => 0);
    const p = value(keys[j - 1][1], k);
    const q = value(keys[j + 1][1], k);
    const dt = keys[j + 1][0] - keys[j - 1][0] || 1;
    return p.map((v, m) => (q[m] - v) / dt);
  };
  const out = {};
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
    const pa = value(a, k);
    const pb = value(b, k);
    const ma = slope(i - 1, k);
    const mb = slope(i, k);
    const v = pa.map((x, m) => h00 * x + h10 * span * ma[m] + h01 * pb[m] + h11 * span * mb[m]);
    out[k] = Array.isArray(a[k] ?? b[k]) ? v : v[0];
  }
  out.D = unit(out.D);
  return out;
};

// ── 뼈대 ────────────────────────────────────────────────────────
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const document = await io.read(animsPath);
const root = document.getRoot();
const buffer = root.listBuffers()[0];
const nodes = new Map(root.listNodes().map((node) => [node.getName(), node]));
const parentOf = new Map();
for (const node of root.listNodes()) for (const child of node.listChildren()) parentOf.set(child.getName(), node.getName());
const restT = (name) => nodes.get(name).getTranslation();
const idle = root.listAnimations().find((a) => a.getName() === "IdleArmed");
// 서기 동작도 새로 굽기 때문에 바탕(손가락 · 채널 목록)은 지우기 전에 읽어 둔다
const baseChannels = idle.listChannels().map((channel) => ({
  node: channel.getTargetNode(),
  path: channel.getTargetPath(),
  base: Array.from(channel.getSampler().getOutput().getArray().slice(0, channel.getTargetPath() === "rotation" ? 4 : 3)),
}));
// 골반 바탕 높이 — 원래 칼 서기(IdleArmed)의 골반. 서기도 이 스크립트가 다시 구우니 파일에서 읽으면 돌릴 때마다 drop 만큼 내려간다
const idleHips = [0, 0.804, 0.004];

/** 한 자세 → 뼈마다 국소 회전 (+ 골반 위치) */
function solve(v) {
  const g = (k) => (typeof v[k] === "number" ? v[k] : 0);
  const local = {
    J_Bip_C_Hips: mul(Y(g("hipYaw")), X(g("hipPitch"))),
    J_Bip_C_Spine: mul(Y(g("yaw") * 0.3), X(g("pitch") * 0.4)),
    J_Bip_C_Chest: mul(Y(g("yaw") * 0.35), X(g("pitch") * 0.35)),
    J_Bip_C_UpperChest: mul(Y(g("yaw") * 0.35), X(g("pitch") * 0.25)),
    J_Bip_C_Neck: mul(Y(-(g("yaw") + g("hipYaw")) * 0.35), X(-g("pitch") * 0.25)),
    J_Bip_C_Head: mul(Y(-(g("yaw") + g("hipYaw")) * 0.35), X(-g("pitch") * 0.3)),
    J_Bip_L_Shoulder: [0, 0, 0, 1],
    J_Bip_R_Shoulder: [0, 0, 0, 1],
    J_Bip_L_UpperLeg: mul(Y(-g("hipYaw") * 0.6), mul(Z(-g("lad")), X(g("lx")))),
    J_Bip_L_LowerLeg: X(g("lk")),
    J_Bip_L_Foot: X(g("lf")),
    J_Bip_R_UpperLeg: mul(Y(-g("hipYaw") * 0.6), mul(Z(g("rad")), X(g("rx")))),
    J_Bip_R_LowerLeg: X(g("rk")),
    J_Bip_R_Foot: X(g("rf")),
  };
  const hipsPos = [idleHips[0], idleHips[1] - g("drop"), idleHips[2]];
  // 몸통을 따라 내려가며 세상 회전 · 자리
  const world = new Map();
  const place = (name) => {
    if (world.has(name)) return world.get(name);
    if (name === "J_Bip_C_Hips") {
      const w = { q: local[name], p: hipsPos };
      world.set(name, w);
      return w;
    }
    const parent = place(parentOf.get(name));
    const w = { q: mul(parent.q, local[name] ?? [0, 0, 0, 1]), p: add(parent.p, rotate(parent.q, restT(name))) };
    world.set(name, w);
    return w;
  };
  const arm = (side, wrist, D, wrap = null) => {
    const s = side === "R" ? -1 : 1;
    const upper = `J_Bip_${side}_UpperArm`;
    const lower = `J_Bip_${side}_LowerArm`;
    const hand = `J_Bip_${side}_Hand`;
    const shoulder = place(`J_Bip_${side}_Shoulder`);
    const S = add(shoulder.p, rotate(shoulder.q, restT(upper)));
    const L1 = len(restT(lower));
    const L2 = len(restT(hand));
    let to = sub(wrist, S);
    const dist = Math.min(Math.max(len(to), 0.08), L1 + L2 - 0.002);
    const dir = unit(to);
    // 팔꿈치는 아래 · 바깥 · 조금 뒤. 손이 그 방향(아래)과 겹치면 바깥 · 뒤 쪽 힌트가 받쳐 준다 (한쪽만 쓰면 팔꿈치가 순간 뒤집혔다)
    const off = (hint) => sub(hint, scale(dir, dot(hint, dir)));
    // 손이 어깨보다 높이 갈수록 팔꿈치는 아래 대신 바깥 · 앞으로 (머리 위로 들 때)
    const up = Math.max(0, dir[1]);
    let pole = add(off([s * 0.45, -(1 - up), -0.25 + 0.6 * up]), scale(off([s, 0, -0.6]), 0.35));
    pole = len(pole) < 1e-4 ? cross(dir, [0, 0, 1]) : unit(pole);
    const a = (L1 * L1 - L2 * L2 + dist * dist) / (2 * dist);
    const h = Math.sqrt(Math.max(0, L1 * L1 - a * a));
    const E = add(add(S, scale(dir, a)), scale(pole, h));
    const W = add(S, scale(dir, dist));
    // 위팔 · 팔뚝은 팔꿈치가 굽는 면으로 세운다 — 쉬는 자세(T)에서 뼈는 ±X, 팔꿈치가 굽는 축은 ∓Y.
    // 쉬는 방향에서 가장 적게 돌리는 식(fromTo)은 팔이 몸 반대편으로 넘어갈 때 위팔이 반 바퀴씩 꼬였다
    const bend = unit(cross(pole, dir));
    const frame = (bone) => {
      const xa = scale(unit(bone), s);
      const ya = scale(bend, -s);
      return fromBasis(xa, ya, cross(xa, ya));
    };
    const qu = frame(sub(E, S));
    let ql = frame(sub(W, E));
    // 손 — +Z(엄지)가 방망이 쪽. 손가락(오른손 -X · 왼손 +X)이 감는 방향은 두 손이 같게(wrap) —
    // 실제 두 손 쥐기처럼 손가락은 같은 쪽으로 감고 손바닥은 서로 마주 본다 (따로 잡으면 손목이 X 자로 꼬였다)
    const fore = unit(sub(W, E));
    const z = unit(D);
    let fingers = wrap ?? sub(fore, scale(z, dot(fore, z)));
    fingers = len(fingers) < 1e-4 ? cross(z, [0, 1, 0]) : unit(fingers);
    const x = side === "R" ? scale(fingers, -1) : fingers;
    const y = cross(z, x);
    const qh = fromBasis(x, y, z);
    // 손목 비틀림의 반은 팔뚝이 진다 (팔뚝 돌리기) — 손목 혼자 다 돌리면 손목 살이 꽈배기처럼 꼬인다
    const hl = mul(inv(ql), qh);
    // 비틀림 각은 앞 프레임에 가깝게 이어 붙인다 (±180° 에서 반대쪽으로 넘어가면 팔뚝이 순간 반 바퀴 돈다)
    let twist = 2 * Math.atan2(hl[0], hl[3]);
    const before = lastTwist[side];
    if (before !== undefined) while (Math.abs(twist - before) > Math.PI) twist += twist < before ? 2 * Math.PI : -2 * Math.PI;
    lastTwist[side] = twist;
    ql = mul(ql, [Math.sin(twist / 4), 0, 0, Math.cos(twist / 4)]);
    local[upper] = qnorm(mul(inv(shoulder.q), qu));
    local[lower] = qnorm(mul(inv(qu), ql));
    local[hand] = qnorm(mul(inv(ql), qh));
    return { W, qh, fingers };
  };
  // 오른손 주먹 자리 = 방망이 위의 한 점. 왼손 주먹은 그보다 손잡이 끝 쪽으로 GRIP_GAP 만큼 같은 방망이 위에
  const right = arm("R", v.H, v.D);
  const gripR = add(right.W, rotate(right.qh, GRIP_R));
  const gripL = sub(gripR, scale(v.D, GRIP_GAP));
  // 왼손 손목 = 주먹 자리 - 손 회전 × 주먹 오프셋 — 손 회전이 IK 결과에 따라 달라지니 두 번 맞춘다
  let wristL = sub(gripL, scale(v.D, 0.0));
  for (let pass = 0; pass < 3; pass += 1) {
    const left = arm("L", wristL, v.D, right.fingers);
    wristL = sub(gripL, rotate(left.qh, GRIP_L));
  }
  arm("L", wristL, v.D, right.fingers);
  // 주먹 — 네 손가락을 손바닥 쪽으로 만다 (오른손 +Z 축 · 왼손 -Z 축), 엄지는 살짝
  for (const [side, sign] of [["R", 1], ["L", -1]]) {
    for (const finger of ["Index", "Middle", "Ring", "Little"]) {
      local[`J_Bip_${side}_${finger}1`] = Z(sign * 70);
      local[`J_Bip_${side}_${finger}2`] = Z(sign * 95);
      local[`J_Bip_${side}_${finger}3`] = Z(sign * 60);
    }
    local[`J_Bip_${side}_Thumb2`] = Y(sign * -25);
    local[`J_Bip_${side}_Thumb3`] = Y(sign * -30);
  }
  return { local, hipsPos };
}

// ── 굽기 ────────────────────────────────────────────────────────
for (const [name, clip] of Object.entries(CLIPS)) {
  for (const old of root.listAnimations().filter((a) => a.getName() === name || a.getName() === `${name}_F`)) {
    for (const ch of old.listChannels()) ch.dispose();
    for (const s of old.listSamplers()) s.dispose();
    old.dispose();
  }
  const animation = document.createAnimation(name);
  const times = [];
  for (let t = 0; t < clip.seconds; t += 1 / FPS) times.push(t);
  times.push(clip.seconds);
  for (const key of Object.keys(lastTwist)) delete lastTwist[key];
  const poses = times.map((t) => solve(sample(clip.keys, t / clip.seconds)));
  if (process.env.BAT_DEBUG) {
    // 프레임 사이에 가장 크게 돈 뼈 — 팔꿈치 · 손이 순간 뒤집히는 곳 찾기
    for (let i = 1; i < poses.length; i += 1) {
      let worst = ["", 0];
      for (const [bone, q] of Object.entries(poses[i].local)) {
        const p = poses[i - 1].local[bone];
        const deg = (Math.acos(Math.min(1, Math.abs(dot4(p, q)))) * 360) / Math.PI;
        if (deg > worst[1]) worst = [bone, deg];
      }
      if (worst[1] > 12) console.log(name, (times[i] / clip.seconds).toFixed(2), worst[0], worst[1].toFixed(0));
    }
  }
  const timeAcc = document.createAccessor().setType("SCALAR").setArray(new Float32Array(times)).setBuffer(buffer);
  for (const { node, path, base } of baseChannels) {
    const bone = node.getName();
    let values;
    if (path === "rotation" && poses[0].local[bone]) {
      // 앞 프레임과 같은 반구로 — q 와 -q 는 같은 회전인데, 부호가 뒤집히면 게임이 그 사이를 먼 길로 돌아 손이 순간 크게 비틀렸다
      values = [];
      for (const p of poses) {
        let q = p.local[bone];
        const prev = values[values.length - 1];
        if (prev && dot4(prev, q) < 0) q = q.map((v) => -v);
        values.push(q);
      }
    }
    else if (path === "translation" && bone === "J_Bip_C_Hips") values = poses.map((p) => p.hipsPos);
    else values = times.map(() => base);
    const sampler = document
      .createAnimationSampler()
      .setInput(timeAcc)
      .setOutput(document.createAccessor().setType(path === "rotation" ? "VEC4" : "VEC3").setArray(new Float32Array(values.flat())).setBuffer(buffer))
      .setInterpolation("LINEAR");
    animation.addSampler(sampler);
    animation.addChannel(document.createAnimationChannel().setTargetNode(node).setTargetPath(path).setSampler(sampler));
  }
  console.log(`[bat-ik] ${name} — ${clip.seconds}s`);
}
for (const accessor of root.listAccessors()) if (accessor.listParents().length <= 1) accessor.dispose();
await io.write(animsPath, document);
console.log(`[bat-ik] → ${animsPath}`);
