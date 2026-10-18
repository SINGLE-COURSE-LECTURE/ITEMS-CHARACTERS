/**
 * 두 손 쥐기 — 방망이 동작(서기 · 콤보 1~4 단)에서 왼손 주먹을 방망이 손잡이 위, 오른손 주먹 바로 아래에 붙인다.
 *
 * 모션캡처를 VRoid 몸에 옮기면 팔 길이 · 어깨 폭이 달라 왼손이 손잡이에서 5~15 cm 떠 보였다. 오른손 · 몸통 · 다리는
 * 원본 그대로 두고 왼팔만 두 뼈 IK 로 다시 푼다. 팔꿈치는 원본 팔꿈치가 있던 쪽으로(원본의 느낌을 살린다),
 * 손은 원본 손 회전에서 가장 적게 돌려 손바닥 가로축(±Z)을 방망이 축에 맞춘다. 왼손 손가락은 주먹.
 *
 * 방망이: 오른손 뼈 국소 +Z 로 뻗고, 오른손 주먹 자리(GRIP_R)에서 손잡이 끝 쪽으로 GRIP_GAP 만큼이 왼손 주먹 자리 (equipment.ts · meleeWeapons.ts).
 *
 * 쓰는 법 (3DLECTURE-GAMES 폴더에서): node ITEMS-CHARACTERS/scripts/two-hand-grip.mjs [동작 파일] [동작 이름 ...]
 * 기본 동작: IdleArmed ArmedAttack1~4. 순서: bat-from-mocap.mjs 다음 · feminine-anims.mjs 앞 (여성형은 거기서 다시 만든다).
 */
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const animsPath = args[0] ?? join(here, "..", "..", "core", "assets", "models", "player-anims.glb");
const CLIPS = args.length > 1 ? args.slice(1) : ["IdleArmed", "ArmedAttack1", "ArmedAttack2", "ArmedAttack3", "ArmedAttack4"];
/** 왼손 주먹이 오른손 주먹보다 손잡이 끝 쪽으로 (m) — 오른손이 손잡이 끝에서 0.09 m 를 쥐니 왼손은 걸림쇠 바로 위 */
const GRIP_GAP = 0.085;
/** 손 뼈(손목) 기준 주먹 가운데 (handFit.ts FALLBACK · 왼손은 좌우 반대) */
const GRIP_R = [-0.069, 0.006, -0.004];
const GRIP_L = [0.069, 0.006, -0.004];
/**
 * 창 쥐기(TWO_HAND_MODE=spear) — 창 · 깃대처럼 긴 자루는 두 손을 붙여 쥐지 않는다. 오른손이 뒤, 왼손이 앞에서 자루를 받친다.
 * 원본 동작(총검 · 찌르기)의 왼손 자리 쪽으로 자루가 향하게 오른손을 가장 적게 돌리고, 왼손은 그 자루 위 SPEAR_GAP 만큼 앞에 붙인다.
 * 방망이 쥐기로는 깃대가 어깨 뒤로 넘어가고 왼손이 오른손에 붙어 어색했다(사용자).
 */
const SPEAR = process.env.TWO_HAND_MODE === "spear";
/**
 * 한 손 창(TWO_HAND_MODE=spear-one) — 원본이 한 손 무기 동작(Thrust Slash · Upward Thrust)이라 왼손이 무기를 잡지 않을 때.
 * 자루를 팔뚝 방향(팔꿈치 → 손목, 찌르면 앞)으로 뻗게 오른손만 돌리고 왼손은 원본 그대로 둔다.
 * 왼손 쪽으로 돌렸더니 창끝이 몸 뒤로 향했다(앞 방향 성분 -0.9).
 */
const SPEAR_ONE = process.env.TWO_HAND_MODE === "spear-one";
const SPEAR_GAP = [0.3, 0.55];
const FPS = 60;

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
/** a 방향을 b 방향으로 가장 적게 돌리는 회전 */
const fromTo = (a, b) => {
  const u = unit(a);
  const v = unit(b);
  const d = dot(u, v);
  if (d < -0.9999) {
    const n = unit(Math.abs(u[0]) < 0.9 ? cross(u, [1, 0, 0]) : cross(u, [0, 1, 0]));
    return [n[0], n[1], n[2], 0];
  }
  const c = cross(u, v);
  return qnorm([c[0], c[1], c[2], 1 + d]);
};
const slerp = (a, b, t) => {
  let d = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
  const bb = d < 0 ? b.map((v) => -v) : b;
  d = Math.abs(d);
  if (d > 0.9995) return qnorm(a.map((v, i) => v + (bb[i] - v) * t));
  const th = Math.acos(d);
  const s = Math.sin(th);
  return a.map((v, i) => (v * Math.sin((1 - t) * th) + bb[i] * Math.sin(t * th)) / s);
};
/** 채널 → 시간 t 의 값 (선형 · 회전은 구면) */
const samplerOf = (channel) => {
  const times = channel.getSampler().getInput().getArray();
  const values = channel.getSampler().getOutput().getArray();
  const size = channel.getTargetPath() === "rotation" ? 4 : 3;
  return (t) => {
    let i = 0;
    while (i < times.length - 1 && times[i + 1] < t) i += 1;
    if (i >= times.length - 1) return Array.from(values.slice((times.length - 1) * size, times.length * size));
    const f = Math.min(1, Math.max(0, (t - times[i]) / (times[i + 1] - times[i] || 1)));
    const a = Array.from(values.slice(i * size, i * size + size));
    const b = Array.from(values.slice((i + 1) * size, (i + 2) * size));
    return size === 4 ? slerp(a, b, f) : a.map((v, k) => v + (b[k] - v) * f);
  };
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
const restR = (name) => nodes.get(name).getRotation();

const L_UPPER = "J_Bip_L_UpperArm";
const L_LOWER = "J_Bip_L_LowerArm";
const L_HAND = "J_Bip_L_Hand";
const L_FIST = {};
for (const finger of ["Index", "Middle", "Ring", "Little"]) {
  L_FIST[`J_Bip_L_${finger}1`] = axis(0, 0, 1, -70);
  L_FIST[`J_Bip_L_${finger}2`] = axis(0, 0, 1, -95);
  L_FIST[`J_Bip_L_${finger}3`] = axis(0, 0, 1, -60);
}
L_FIST.J_Bip_L_Thumb2 = axis(0, 1, 0, 25);
L_FIST.J_Bip_L_Thumb3 = axis(0, 1, 0, 30);

for (const name of CLIPS) {
  const animation = root.listAnimations().find((a) => a.getName() === name);
  if (!animation) {
    console.warn(`[two-hand] ${name} 동작이 없습니다`);
    continue;
  }
  const channels = animation.listChannels();
  const rotOf = new Map();
  let hipsPos = null;
  let duration = 0;
  for (const channel of channels) {
    const bone = channel.getTargetNode().getName();
    duration = Math.max(duration, channel.getSampler().getInput().getMax([])[0]);
    if (channel.getTargetPath() === "rotation") rotOf.set(bone, samplerOf(channel));
    else if (channel.getTargetPath() === "translation" && bone === "J_Bip_C_Hips") hipsPos = samplerOf(channel);
  }
  const times = [];
  for (let t = 0; t < duration; t += 1 / FPS) times.push(t);
  times.push(duration);

  const results = { [L_UPPER]: [], [L_LOWER]: [], [L_HAND]: [] };
  if (SPEAR || SPEAR_ONE) results["J_Bip_R_Hand"] = [];
  let worstBefore = 0;
  let worstAfter = 0;
  for (const t of times) {
    const localQ = (bone) => (rotOf.get(bone) ?? (() => restR(bone)))(t);
    // 세상 회전 · 자리 (골반부터)
    const world = new Map();
    const place = (bone) => {
      if (world.has(bone)) return world.get(bone);
      let w;
      if (bone === "J_Bip_C_Hips") w = { q: localQ(bone), p: hipsPos ? hipsPos(t) : restT(bone) };
      else {
        const parent = place(parentOf.get(bone));
        w = { q: qnorm(mul(parent.q, localQ(bone))), p: add(parent.p, rotate(parent.q, restT(bone))) };
      }
      world.set(bone, w);
      return w;
    };
    let right = place("J_Bip_R_Hand");
    let D = unit(rotate(right.q, [0, 0, 1]));
    let gripR = add(right.p, rotate(right.q, GRIP_R));
    let gripL = sub(gripR, scale(D, GRIP_GAP));
    if (SPEAR_ONE) {
      const forearm = place("J_Bip_R_LowerArm");
      const want = unit(sub(right.p, forearm.p));
      const qr = qnorm(mul(fromTo(D, want), right.q));
      right = { q: qr, p: right.p };
      D = want;
      gripR = add(right.p, rotate(qr, GRIP_R));
      gripL = sub(gripR, scale(D, GRIP_GAP));
      results["J_Bip_R_Hand"].push(qnorm(mul(inv(forearm.q), qr)));
    }
    if (SPEAR) {
      // 원본 왼손 주먹 자리 쪽으로 자루를 돌린다
      const handL0 = place(L_HAND);
      const pL = add(handL0.p, rotate(handL0.q, GRIP_L));
      const toL = sub(pL, gripR);
      const want = unit(toL);
      const qr = qnorm(mul(fromTo(D, want), right.q));
      right = { q: qr, p: right.p };
      D = want;
      gripR = add(right.p, rotate(qr, GRIP_R));
      const gap = Math.min(SPEAR_GAP[1], Math.max(SPEAR_GAP[0], len(toL)));
      gripL = add(gripR, scale(D, gap));
      const forearm = place("J_Bip_R_LowerArm");
      results["J_Bip_R_Hand"].push(qnorm(mul(inv(forearm.q), qr)));
    }

    const shoulder = place("J_Bip_L_Shoulder");
    const S = add(shoulder.p, rotate(shoulder.q, restT(L_UPPER)));
    const upper0 = place(L_UPPER);
    const elbow0 = add(S, rotate(upper0.q, restT(L_LOWER)));
    const lower0 = place(L_LOWER);
    const hand0 = place(L_HAND);
    const L1 = len(restT(L_LOWER));
    const L2 = len(restT(L_HAND));
    worstBefore = Math.max(worstBefore, (() => {
      const d = sub(add(hand0.p, rotate(hand0.q, GRIP_L)), gripR);
      const along = dot(d, D);
      return len(sub(d, scale(D, along)));
    })());

    // 손 회전 — 원본에서 가장 적게 돌려 ±Z(손바닥 가로축)를 방망이 축에
    const z0 = rotate(hand0.q, [0, 0, 1]);
    const sign = dot(z0, D) >= 0 ? 1 : -1;
    let qh = qnorm(mul(fromTo(scale(z0, sign), D), hand0.q));

    let wrist = gripL;
    let E = elbow0;
    for (let pass = 0; pass < 3; pass += 1) {
      wrist = sub(gripL, rotate(qh, GRIP_L));
      const to = sub(wrist, S);
      const dist = Math.min(Math.max(len(to), 0.05), L1 + L2 - 0.002);
      const dir = unit(to);
      // 팔꿈치는 원본 팔꿈치가 있던 쪽 (어깨→손목 선에 수직인 성분)
      const hint = sub(elbow0, S);
      let pole = sub(hint, scale(dir, dot(hint, dir)));
      pole = len(pole) < 1e-3 ? unit(sub([0, -1, 0], scale(dir, dot([0, -1, 0], dir)))) : unit(pole);
      const a = (L1 * L1 - L2 * L2 + dist * dist) / (2 * dist);
      const h = Math.sqrt(Math.max(0, L1 * L1 - a * a));
      E = add(add(S, scale(dir, a)), scale(pole, h));
    }
    const W = add(S, scale(unit(sub(wrist, S)), Math.min(len(sub(wrist, S)), L1 + L2 - 0.002)));
    // 위팔 · 팔뚝 — 원본 회전에서 뼈 방향만 새 팔꿈치 · 손목으로 (비틀림은 원본대로)
    const qu = qnorm(mul(fromTo(rotate(upper0.q, restT(L_LOWER)), sub(E, S)), upper0.q));
    const ql = qnorm(mul(fromTo(rotate(lower0.q, restT(L_HAND)), sub(W, E)), lower0.q));
    results[L_UPPER].push(qnorm(mul(inv(shoulder.q), qu)));
    results[L_LOWER].push(qnorm(mul(inv(qu), ql)));
    results[L_HAND].push(qnorm(mul(inv(ql), qh)));
    const fist = add(W, rotate(qh, GRIP_L));
    const d = sub(fist, gripR);
    worstAfter = Math.max(worstAfter, len(sub(d, scale(D, dot(d, D)))));
  }

  // 사원수 반구 맞추기 (q 와 -q 사이를 먼 길로 돌지 않게)
  for (const list of Object.values(results)) {
    for (let i = 1; i < list.length; i += 1) {
      const p = list[i - 1];
      const q = list[i];
      if (p[0] * q[0] + p[1] * q[1] + p[2] * q[2] + p[3] * q[3] < 0) list[i] = q.map((v) => -v);
    }
  }

  const timeAcc = document.createAccessor().setType("SCALAR").setArray(new Float32Array(times)).setBuffer(buffer);
  const write = (bone, values) => {
    const node = nodes.get(bone);
    const old = channels.find((c) => c.getTargetNode() === node && c.getTargetPath() === "rotation");
    const sampler = document
      .createAnimationSampler()
      .setInput(timeAcc)
      .setOutput(document.createAccessor().setType("VEC4").setArray(new Float32Array(values.flat())).setBuffer(buffer))
      .setInterpolation("LINEAR");
    animation.addSampler(sampler);
    if (old) {
      const was = old.getSampler();
      old.setSampler(sampler);
      was.dispose();
    } else animation.addChannel(document.createAnimationChannel().setTargetNode(node).setTargetPath("rotation").setSampler(sampler));
  };
  if (SPEAR_ONE) for (const bone of [L_UPPER, L_LOWER, L_HAND]) delete results[bone];
  for (const [bone, values] of Object.entries(results)) write(bone, values);
  for (const [bone, q] of Object.entries(L_FIST)) write(bone, times.map(() => q));
  console.log(`[two-hand] ${name} — 왼손 주먹이 방망이에서 최대 ${(worstBefore * 100).toFixed(1)}cm → ${(worstAfter * 100).toFixed(1)}cm`);
}
for (const accessor of root.listAccessors()) if (accessor.listParents().length <= 1) accessor.dispose();
await io.write(animsPath, document);
console.log(`[two-hand] → ${animsPath}`);
