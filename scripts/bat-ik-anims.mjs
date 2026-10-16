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
 *
 * 쓰는 법 (3DLECTURE-GAMES 폴더에서): node ITEMS-CHARACTERS/scripts/bat-ik-anims.mjs [동작 파일]
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
const ease = (x) => x * x * (3 - 2 * x);

// ── 콤보 키 ─────────────────────────────────────────────────────
const n = (x, y, z) => unit([x, y, z]);
const STANCE = { lx: -14, lk: 18, lf: -4, rx: 10, rk: 18, rf: -4, lad: -10, rad: -10, drop: 0.05 };
// 1 단 끝 = 2 단 시작 · 2 단 끝 = 3 단 시작
// 콘티 방향 (캐릭터가 화면을 볼 때): 1 단은 몸 오른쪽 앞 아래로 끝나고 · 2 단은 거기서 왼쪽 어깨 위로 · 3 단은 왼쪽에서 오른쪽으로
const LOW_RIGHT = { ...STANCE, yaw: -15, hipYaw: -5, pitch: 20, lx: -34, lk: 40, lf: -8, rx: 20, rk: 28, drop: 0.1, H: [-0.08, 0.86, 0.36], D: n(-0.6, -0.2, 0.77) };
const HIGH_LEFT = { ...STANCE, yaw: 35, hipYaw: 10, pitch: 0, H: [0.16, 1.42, 0.12], D: n(0.2, 0.85, -0.48) };
const RIGHT_END = { ...STANCE, yaw: -45, hipYaw: -12, H: [-0.3, 1.13, 0.2], D: n(-0.95, 0.05, -0.25) };
// 콘티 1 단 준비 — 오른 어깨 위로 방망이를 비스듬히 메고 선다
const READY = { ...STANCE, yaw: -15, hipYaw: -5, H: [-0.18, 1.25, 0.16], D: n(0.12, 0.82, -0.56) };

const CLIPS = {
  // 1 단 내려찍기 — 머리 위로 들었다가 왼발을 내디디며 앞 아래로 곧장 (타격 0.5)
  ArmedAttack1: {
    seconds: 0.62,
    keys: [
      [0, READY],
      [0.32, { ...STANCE, yaw: -5, pitch: -8, lx: -22, lk: 30, H: [-0.05, 1.56, 0.06], D: n(0.02, 0.55, -0.83) }],
      [0.55, { ...STANCE, yaw: -8, pitch: 20, lx: -34, lk: 40, lf: -8, rx: 20, rk: 28, drop: 0.09, H: [-0.05, 0.95, 0.38], D: n(-0.15, -0.75, 0.64) }],
      [0.78, LOW_RIGHT],
      [1, LOW_RIGHT],
    ],
  },
  // 2 단 올려치기 — 오른쪽 아래에서 왼쪽 어깨 위로 비스듬히 (타격 0.5)
  ArmedAttack2: {
    seconds: 0.55,
    keys: [
      [0, LOW_RIGHT],
      [0.25, { ...STANCE, yaw: -25, hipYaw: -8, pitch: 16, drop: 0.08, H: [-0.15, 0.86, 0.3], D: n(-0.6, -0.6, 0.5) }],
      [0.5, { ...STANCE, yaw: 8, pitch: 4, drop: 0.05, H: [0.03, 1.15, 0.4], D: n(0.45, 0.65, 0.6) }],
      [0.8, HIGH_LEFT],
      [1, HIGH_LEFT],
    ],
  },
  // 3 단 가로 베기 — 왼쪽 위에서 가슴 높이로 왼쪽 → 오른쪽 (타격 0.5) · 끝은 오른쪽 — 4 단 홈런 준비(오른 어깨)로 이어진다
  ArmedAttack3: {
    seconds: 0.6,
    keys: [
      [0, HIGH_LEFT],
      [0.25, { ...STANCE, yaw: 45, hipYaw: 12, H: [0.28, 1.24, -0.02], D: n(0.55, 0.12, -0.82) }],
      [0.5, { ...STANCE, yaw: -5, hipYaw: -2, drop: 0.07, H: [0, 1.15, 0.45], D: n(-0.45, 0.05, 0.89) }],
      [0.75, RIGHT_END],
      [1, RIGHT_END],
    ],
  },
};

/** 키 사이 — 숫자는 부드럽게, 방향(D)은 구면으로 */
const sample = (keys, t) => {
  if (t <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i += 1) {
    if (t > keys[i][0]) continue;
    const f = ease((t - keys[i - 1][0]) / (keys[i][0] - keys[i - 1][0] || 1));
    const a = keys[i - 1][1];
    const b = keys[i][1];
    const out = {};
    for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
      const va = a[k] ?? (Array.isArray(b[k]) ? b[k] : 0);
      const vb = b[k] ?? (Array.isArray(a[k]) ? a[k] : 0);
      out[k] = Array.isArray(va) ? va.map((v, j) => v + (vb[j] - v) * f) : va + (vb - va) * f;
    }
    out.D = unit(out.D);
    return out;
  }
  return keys[keys.length - 1][1];
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
const idleHips = Array.from(
  idle.listChannels().find((c) => c.getTargetNode().getName() === "J_Bip_C_Hips" && c.getTargetPath() === "translation").getSampler().getOutput().getArray().slice(0, 3),
);

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
    // 팔꿈치는 아래 · 바깥 · 조금 뒤
    const poleHint = [s * 0.35, -1, -0.25];
    let pole = sub(poleHint, scale(dir, dot(poleHint, dir)));
    pole = len(pole) < 1e-4 ? cross(dir, [0, 0, 1]) : unit(pole);
    const a = (L1 * L1 - L2 * L2 + dist * dist) / (2 * dist);
    const h = Math.sqrt(Math.max(0, L1 * L1 - a * a));
    const E = add(add(S, scale(dir, a)), scale(pole, h));
    const W = add(S, scale(dir, dist));
    const rest = [s, 0, 0];
    const qu = mul(fromTo(rotate(shoulder.q, rest), sub(E, S)), shoulder.q);
    const ql = mul(fromTo(rotate(qu, rest), sub(W, E)), qu);
    // 손 — +Z(엄지)가 방망이 쪽. 손가락(오른손 -X · 왼손 +X)이 감는 방향은 두 손이 같게(wrap) —
    // 실제 두 손 쥐기처럼 손가락은 같은 쪽으로 감고 손바닥은 서로 마주 본다 (따로 잡으면 손목이 X 자로 꼬였다)
    const fore = unit(sub(W, E));
    const z = unit(D);
    let fingers = wrap ?? sub(fore, scale(z, dot(fore, z)));
    fingers = len(fingers) < 1e-4 ? cross(z, [0, 1, 0]) : unit(fingers);
    const x = side === "R" ? scale(fingers, -1) : fingers;
    const y = cross(z, x);
    const qh = fromBasis(x, y, z);
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
  const poses = times.map((t) => solve(sample(clip.keys, t / clip.seconds)));
  const timeAcc = document.createAccessor().setType("SCALAR").setArray(new Float32Array(times)).setBuffer(buffer);
  for (const channel of idle.listChannels()) {
    const node = channel.getTargetNode();
    const bone = node.getName();
    const path = channel.getTargetPath();
    const base = Array.from(channel.getSampler().getOutput().getArray().slice(0, path === "rotation" ? 4 : 3));
    let values;
    if (path === "rotation" && poses[0].local[bone]) values = poses.map((p) => p.local[bone]);
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
