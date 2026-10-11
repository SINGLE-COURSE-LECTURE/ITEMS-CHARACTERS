/**
 * 여성형 기본 동작 — 동작 파일(core/assets/models/player-anims.glb)의 서기 · 걷기 · 달리기를 바탕으로
 * 여성형 몸짓을 구워 「이름_F」 동작을 더한다 (서기 · 걷기 · 달리기 · 점프 · 방망이 — 아래 STYLES). 게임은 여성형 캐릭터면 _F 를 먼저 찾는다.
 *
 * 동작 원본(Quaternius UAL1 · UAL2, CC0)에는 여성형 걷기 · 달리기가 없다(UAL2 의 여성 마네킹도 동작은 같은 것을 쓰라고 한다).
 * 예전에 게임 안에서 매 프레임 골반 · 팔 몸짓을 얹어 봤다가 팔이 휘어 보여 걷어 냈다 — 여기서는 키 값 자체를 고쳐 굽는다.
 *
 * 고치는 것 (VRoid 1.0 뼈대 — 쉬는 자세가 세상 축과 나란하다: 앞 +Z · 왼쪽 +X · 위 +Y)
 *   골반   돌기(Y 축 비틀림)만 키운다. 위 척추에서 그만큼 되돌려 어깨는 흔들리지 않는다.
 *          좌우 기울기(롤)까지 키웠더니 머리가 옆으로 5 → 9.4cm 흔들려 뒤뚱거렸다 — 기울기는 그대로 둔다
 *   가슴   좌우 기울기를 줄인다 — 윗몸이 곧게 서야 뒤뚱거리지 않는다
 *   다리   허벅지를 안으로 모아 발이 한 줄에 가깝게 딛는다. 발목에서 되돌려 발바닥은 바닥에 붙인다
 *   팔     몸쪽으로 모으고, 앞뒤로 흔드는 폭을 줄인다
 *   머리   (서기) 살짝 기울인다
 *
 * 쓰는 법 (3DLECTURE-GAMES 폴더에서): node ITEMS-CHARACTERS/scripts/feminine-anims.mjs
 * 동작 파일을 다시 만들면(FIELD_INIT/blender/retarget_animations.py) 이것도 다시 돌린다. 몇 번 돌려도 같다(_F 를 지우고 다시 만든다).
 */
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const file = process.argv[2] ?? join(here, "..", "..", "core", "assets", "models", "player-anims.glb");

const deg = (value) => (value * Math.PI) / 180;

/** 동작마다 고칠 세기 */
const STYLES = {
  // hipYaw 골반 돌기 배수 · hipRoll 골반 기울기 배수 · torsoRoll 가슴 기울기 배수 · legIn 허벅지 모으기(도)
  // armIn 팔 모으기(도) — 체형 굽기로 골반 · 티셔츠가 넓어져 많이 모으면 손이 옷 속에 묻힌다(7~10 도에서 묻혔다)
  // 원래 서기는 다리를 어깨보다 넓게 벌리고 주먹을 쥔 자세라 다리를 많이 모은다
  Idle: { hipYaw: 1, hipRoll: 1, torsoRoll: 1, legIn: 7, armIn: 1.5, armSwing: 1, headTilt: 4 },
  Walk: { hipYaw: 1.6, hipRoll: 0.8, torsoRoll: 0.6, legIn: 3.5, armIn: 1, armSwing: 0.6, headTilt: 0 },
  Run: { hipYaw: 1.3, hipRoll: 0.85, torsoRoll: 0.8, legIn: 3, armIn: 3, armSwing: 0.7, headTilt: 0 },
  // 점프 — 원래는 다리를 개구리처럼 벌리고 팔을 활짝 편다. 무릎을 모으고 팔을 내린다
  // kneeIn 허벅지를 제 축으로 안쪽 비틀기(도) — 개구리처럼 바깥을 보던 무릎이 앞을 본다. 발목에서 되돌려 발끝은 그대로
  // level 골반을 바로 세운다 (levelHips) — 원래 점프 · 떨어지기 · 착지는 골반이 옆으로 기울어 비스듬히 뛰었다
  Jump: { hipYaw: 1, hipRoll: 1, torsoRoll: 1, legIn: 16, kneeIn: -6, armIn: 25, armSwing: 1, headTilt: 0, level: true },
  Fall: { hipYaw: 1, hipRoll: 1, torsoRoll: 1, legIn: 16, kneeIn: -6, armIn: 25, armSwing: 1, headTilt: 0, level: true },
  Land: { hipYaw: 1, hipRoll: 1, torsoRoll: 1, legIn: 9, kneeIn: -4, armIn: 12, armSwing: 1, headTilt: 0, level: true },
  // 방망이 — 원래는 허리를 깊이 숙이고 고개를 떨군 구부정한 자세(대기는 안짱다리로 웅크림).
  // 휘두르는 팔(무기 궤적) · 땅을 딛는 다리는 그대로 두고, torsoPitch 로 척추 · 목의 앞숙임을 줄여 윗몸을 세운다
  IdleArmed: { hipYaw: 1, hipRoll: 1, torsoRoll: 1, torsoPitch: 0.35, legIn: 0, armIn: 0, armSwing: 1, headTilt: 0 },
  ArmedAttack1: { hipYaw: 1, hipRoll: 1, torsoRoll: 1, torsoPitch: 0.6, legIn: 3, armIn: 0, armSwing: 1, headTilt: 0 },
  ArmedAttack2: { hipYaw: 1, hipRoll: 1, torsoRoll: 1, torsoPitch: 0.6, legIn: 3, armIn: 0, armSwing: 1, headTilt: 0 },
  ArmedAttack3: { hipYaw: 1, hipRoll: 1, torsoRoll: 1, torsoPitch: 0.7, legIn: 3, armIn: 0, armSwing: 1, headTilt: 0 },
};

// ── 사원수 (x, y, z, w) ───────────────────────────────────────────────
const mul = (a, b) => [
  a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
  a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
  a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
  a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
];
const inv = (q) => [-q[0], -q[1], -q[2], q[3]];
const norm = (q) => {
  const l = Math.hypot(...q) || 1;
  return q.map((v) => v / l);
};
const axis = (x, y, z, angle) => [x * Math.sin(angle / 2), y * Math.sin(angle / 2), z * Math.sin(angle / 2), Math.cos(angle / 2)];
const slerp = (a, b, t) => {
  let d = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
  let bb = b;
  if (d < 0) {
    d = -d;
    bb = b.map((v) => -v);
  }
  if (d > 0.9995) return norm(a.map((v, i) => v + (bb[i] - v) * t));
  const th = Math.acos(d);
  const s = Math.sin(th);
  return a.map((v, i) => (v * Math.sin((1 - t) * th) + bb[i] * Math.sin(t * th)) / s);
};
const IDENTITY = [0, 0, 0, 1];
/** 앞뒤 숙임(X 축)만 k 배로 — 쉬는 자세가 단위 회전이라 키 값 자체에서 나눈다 */
const scalePitch = (q, k) => {
  const pitch = norm([q[0], 0, 0, q[3]]);
  return mul(mul(q, inv(pitch)), slerp(IDENTITY, pitch, k));
};
/** 키 값들의 평균 자세 — 흔들림은 이것에서 벗어난 만큼 */
const meanOf = (list) => {
  const first = list[0];
  const sum = [0, 0, 0, 0];
  for (const q of list) {
    const sign = q[0] * first[0] + q[1] * first[1] + q[2] * first[2] + q[3] * first[3] < 0 ? -1 : 1;
    for (let i = 0; i < 4; i += 1) sum[i] += q[i] * sign;
  }
  return norm(sum);
};
/** 흔들림을 k 배로 (평균은 그대로) */
const scaleSway = (q, mean, k) => mul(mean, slerp(IDENTITY, mul(inv(mean), q), k));
/** 흔들림을 Y 축 돌기(twist)와 나머지 기울기(swing)로 나눠 따로 배수 */
const scaleTwistSwing = (q, mean, yaw, roll) => {
  const dev = mul(inv(mean), q);
  const twist = norm([0, dev[1], 0, dev[3]]);
  const swing = mul(dev, inv(twist));
  return mul(mean, mul(slerp(IDENTITY, swing, roll), slerp(IDENTITY, twist, yaw)));
};


/** 사원수로 벡터 돌리기 */
const turn = (q, v) => {
  const p = mul(mul(q, [v[0], v[1], v[2], 0]), inv(q));
  return [p[0], p[1], p[2]];
};
/** 골반이 좌우로 얼마나 돌았나 (도) — 골반 뼈의 옆(X) 축이 수평면에서 가리키는 쪽 */
const hipsYawOf = (q) => {
  const side = turn(q, [1, 0, 0]);
  return (Math.atan2(-side[2], side[0]) * 180) / Math.PI;
};
/** 서기 골반의 돌기 — 바로잡을 때 기준 (아래에서 Idle 을 읽어 채운다) */
let restHipsYaw = 0;
/**
 * 골반 바로 세우기 — 원래 점프 · 떨어지기는 골반이 옆으로 6~12 도 기울고 7 도쯤 더 돌아 있다.
 * 윗몸은 척추가 되돌려 곧지만 다리가 골반에 매달려 몸 전체가 비스듬히 뛰어 보였다(공중제비는 기운 축으로 돈다).
 * 돌기는 서기와 같게, 옆 기울기는 0 으로 — 앞뒤 숙임은 그대로. 척추는 hipsNew 로 되돌리므로 윗몸은 안 바뀐다
 */
const levelHips = (q) => {
  const yawed = mul(axis(0, 1, 0, deg(restHipsYaw - hipsYawOf(q))), q);
  const up = turn(yawed, [0, 1, 0]);
  return mul(axis(0, 0, 1, Math.atan2(up[0], up[1])), yawed);
};

// ── 새로 잡는 자세 (공중 구간)─────────────────────────────────────────
// 원래 점프는 양 무릎을 똑같이 바깥으로 벌린 개구리 자세 · 팔을 수평으로 활짝 편 자세라 각도를 고쳐서는 여성형이 안 된다.
// 발이 땅에서 떨어진 구간만 다리 · 팔을 새로 잡는다(땅을 딛는 구간은 원래 다리 — 엉덩이 높이와 맞아야 발이 박히거나 뜨지 않는다).
// 각도는 쉬는 자세(T 자) 기준, 부모 뼈 축. 다리 x: 음수 = 앞으로 들기 · 종아리 x: 양수 = 무릎 굽히기 · 발 x: 양수 = 발끝 내리기
// 팔 down: 수평에서 내린 각 · fwd: 음수 = 앞으로 · elbow: 팔꿈치 굽히기
const legQ = (side, x, z) => mul(axis(0, 0, 1, deg(side === "L" ? -z : z)), axis(1, 0, 0, deg(x)));
const hingeQ = (x) => axis(1, 0, 0, deg(x));
const armQ = (side, down, fwd) => mul(axis(1, 0, 0, deg(fwd)), axis(0, 0, 1, deg(side === "L" ? -down : down)));
const elbowQ = (side, bend) => axis(0, 1, 0, deg(side === "L" ? -bend : bend));
const ease = (x) => x * x * (3 - 2 * x);
const ramp = (a, b, t) => ease(Math.min(1, Math.max(0, (t - a) / (b - a))));
/** 키 자세 [[t, {값}], ...] 사이를 부드럽게 */
const keyed = (keys) => (t) => {
  if (t <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i += 1) {
    if (t <= keys[i][0]) {
      const f = ease((t - keys[i - 1][0]) / (keys[i][0] - keys[i - 1][0]));
      const a = keys[i - 1][1];
      const b = keys[i][1];
      return Object.fromEntries(Object.keys(a).map((k) => [k, a[k] + (b[k] - a[k]) * f]));
    }
  }
  return keys[keys.length - 1][1];
};
/** 값 묶음(lx 왼허벅지 · lk 왼무릎 · lf 왼발 · r.. 오른쪽 · ad 다리 모으기 · ad/fw/el 팔)을 뼈 회전으로 */
const bonesOf = (v) => ({
  J_Bip_L_UpperLeg: legQ("L", v.lx, v.ad),
  J_Bip_L_LowerLeg: hingeQ(v.lk),
  J_Bip_L_Foot: hingeQ(v.lf),
  J_Bip_R_UpperLeg: legQ("R", v.rx, v.ad),
  J_Bip_R_LowerLeg: hingeQ(v.rk),
  J_Bip_R_Foot: hingeQ(v.rf),
});
const armsOf = (v) => ({
  J_Bip_L_UpperArm: armQ("L", v.dn, v.fw),
  J_Bip_R_UpperArm: armQ("R", v.dn, v.fw),
  J_Bip_L_LowerArm: elbowQ("L", v.el),
  J_Bip_R_LowerArm: elbowQ("R", v.el),
});

/** 동작 → { legs(t), arms(t), legWeight(t), armWeight(t) } — t 는 0~1 */
const POSES = {
  // 앞 공중제비 (여성형만) — 게임 점프(높이 2.3m · 중력 22)는 약 0.9 초 떠 있고 동작 0.1 쯤에 땅을 뜬다.
  // 착지(동작 약 0.66) 전에 똑바로 서도록 0.12 ~ 0.58 에 한 바퀴. 도는 동안 무릎을 가슴으로 당기고 팔로 감싼다
  Jump: {
    legs: keyed([
      [0.1, { lx: -8, lk: 10, lf: 35, rx: -2, rk: 8, rf: 35, ad: 2 }],
      [0.24, { lx: -110, lk: 130, lf: 20, rx: -105, rk: 130, rf: 20, ad: 2 }],
      [0.46, { lx: -110, lk: 130, lf: 20, rx: -105, rk: 130, rf: 20, ad: 2 }],
      [0.62, { lx: -28, lk: 40, lf: 10, rx: -14, rk: 32, rf: 15, ad: 2 }],
      [1, { lx: -30, lk: 48, lf: 20, rx: -6, rk: 28, rf: 25, ad: 2 }],
    ]),
    arms: keyed([
      [0.04, { dn: -25, fw: -20, el: 10 }],
      [0.24, { dn: 70, fw: -60, el: 95 }],
      [0.46, { dn: 70, fw: -60, el: 95 }],
      [0.62, { dn: 40, fw: -15, el: 25 }],
      [1, { dn: 50, fw: -10, el: 25 }],
    ]),
    legWeight: (t) => ramp(0.06, 0.14, t),
    armWeight: (t) => ramp(0, 0.06, t),
    /** 골반째 앞으로 한 바퀴 (도) */
    flip: (t) => 360 * ramp(0.12, 0.58, t),
  },
  // 떨어지는 동안 — 두 다리를 모아 왼 무릎만 조금 굽히고, 천천히 흔든다(되풀이라 처음과 끝이 같다)
  Fall: {
    legs: (t) => {
      const w = Math.sin(t * Math.PI * 2) * 3;
      return { lx: -32 + w, lk: 50, lf: 20, rx: -6 - w, rk: 28, rf: 25, ad: 2 };
    },
    arms: (t) => ({ dn: 50 + Math.sin(t * Math.PI * 2) * 3, fw: -10, el: 25 }),
    legWeight: () => 1,
    armWeight: () => 1,
  },
  // 착지 — 다리는 원래 것(땅을 딛는다), 팔만 앞 아래로 뻗어 균형을 잡았다가 끝에서 원래 팔로 돌아간다(서기로 이어진다)
  Land: {
    arms: keyed([
      [0, { dn: 50, fw: -10, el: 25 }],
      [0.15, { dn: 55, fw: -45, el: 35 }],
      [0.5, { dn: 68, fw: -20, el: 20 }],
    ]),
    armWeight: (t) => 1 - ramp(0.6, 1, t),
  },
};

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const document = await io.read(file);
const root = document.getRoot();
const buffer = root.listBuffers()[0];

// 다시 돌릴 때 — 전에 만든 _F 를 지운다
for (const animation of root.listAnimations()) {
  if (/_F$/.test(animation.getName())) {
    // 시간 키 · 고치지 않은 뼈의 값은 원래 동작과 같이 쓴다 — 다른 데서 안 쓰는 것만 버린다
    const samplers = animation.listSamplers();
    const owned = samplers.flatMap((sampler) => [sampler.getInput(), sampler.getOutput()]);
    for (const channel of animation.listChannels()) channel.dispose();
    for (const sampler of samplers) sampler.dispose();
    animation.dispose();
    for (const accessor of new Set(owned)) {
      if (accessor && accessor.listParents().every((parent) => parent === root)) accessor.dispose();
    }
  }
}

/** 시간 t 의 회전 (선형 · 계단 보간) */
function sampleRotation(times, values, t) {
  if (t <= times[0]) return values[0];
  for (let i = 1; i < times.length; i += 1) {
    if (t <= times[i]) {
      const f = (t - times[i - 1]) / (times[i] - times[i - 1]);
      return slerp(values[i - 1], values[i], f);
    }
  }
  return values[values.length - 1];
}

const read = (accessor, size) => {
  const out = [];
  const element = [];
  for (let i = 0; i < accessor.getCount(); i += 1) out.push(size === 1 ? accessor.getScalar(i) : [...accessor.getElement(i, element)]);
  return out;
};

// 바로 세울 기준 — 서기의 골반 돌기 (VRoid 골반 뼈는 쉬는 자세에서도 조금 돌아 있다)
{
  const idle = root.listAnimations().find((animation) => animation.getName() === "Idle");
  const channel = idle?.listChannels().find((item) => item.getTargetNode()?.getName() === "J_Bip_C_Hips" && item.getTargetPath() === "rotation");
  if (channel) restHipsYaw = hipsYawOf(meanOf(read(channel.getSampler().getOutput(), 4)));
}

for (const [name, style] of Object.entries(STYLES)) {
  const source = root.listAnimations().find((animation) => animation.getName() === name);
  if (!source) {
    console.warn(`[feminine] ${name} 동작이 없습니다`);
    continue;
  }

  // 뼈 이름 → 회전 키
  const tracks = new Map();
  for (const channel of source.listChannels()) {
    const sampler = channel.getSampler();
    const node = channel.getTargetNode();
    if (!node) continue;
    tracks.set(`${node.getName()}|${channel.getTargetPath()}`, {
      times: read(sampler.getInput(), 1),
      values: read(sampler.getOutput(), channel.getTargetPath() === "rotation" ? 4 : 3),
      interpolation: sampler.getInterpolation(),
    });
  }
  const rot = (bone) => tracks.get(`${bone}|rotation`);

  const hips = rot("J_Bip_C_Hips");
  const hipsMean = hips ? meanOf(hips.values) : IDENTITY;
  const hipsSway = (q) => scaleTwistSwing(q, hipsMean, style.hipYaw, style.hipRoll);
  const hipsNew = style.level ? (q) => levelHips(hipsSway(q)) : hipsSway;
  const meanRot = (bone) => {
    const track = rot(bone);
    return track ? meanOf(track.values) : IDENTITY;
  };
  const chestMean = meanRot("J_Bip_C_Chest");
  const upperChestMean = meanRot("J_Bip_C_UpperChest");

  const edits = {
    J_Bip_C_Hips: (q) => hipsNew(q),
    // 골반에서 더한 만큼 위 척추에서 되돌린다 — 어깨는 그대로
    J_Bip_C_Spine: (q, t) => {
      if (!hips) return q;
      const old = sampleRotation(hips.times, hips.values, t);
      // 바로 세울 때는 허리도 같이 — 원래 점프는 윗몸도 5~9 도 돌고 기울어 있다(골반만 세우면 윗몸이 비스듬히 남는다)
      if (style.level) return mul(inv(hipsNew(old)), levelHips(mul(old, q)));
      return mul(mul(inv(hipsNew(old)), old), q);
    },
    J_Bip_C_Chest: (q) => scaleTwistSwing(q, chestMean, 1, style.torsoRoll),
    J_Bip_C_UpperChest: (q) => scaleTwistSwing(q, upperChestMean, 1, style.torsoRoll),
    // 모으기는 부모(골반) 축으로 앞에서 곱하고, 무릎 비틀기는 허벅지 제 축(Y — 다리 길이 방향)으로 뒤에서 곱한다
    J_Bip_L_UpperLeg: (q) => mul(mul(axis(0, 0, 1, deg(-style.legIn)), q), axis(0, 1, 0, deg(-(style.kneeIn ?? 0)))),
    J_Bip_R_UpperLeg: (q) => mul(mul(axis(0, 0, 1, deg(style.legIn)), q), axis(0, 1, 0, deg(style.kneeIn ?? 0))),
    J_Bip_L_Foot: (q) => mul(mul(axis(0, 1, 0, deg(style.kneeIn ?? 0)), axis(0, 0, 1, deg(style.legIn))), q),
    J_Bip_R_Foot: (q) => mul(mul(axis(0, 1, 0, deg(-(style.kneeIn ?? 0))), axis(0, 0, 1, deg(-style.legIn))), q),
  };
  for (const [side, sign] of [
    ["L", 1],
    ["R", -1],
  ]) {
    const arm = rot(`J_Bip_${side}_UpperArm`);
    const armMean = arm ? meanOf(arm.values) : IDENTITY;
    edits[`J_Bip_${side}_UpperArm`] = (q) => mul(axis(0, 0, 1, deg(-sign * style.armIn)), scaleSway(q, armMean, style.armSwing));
  }
  if (style.torsoPitch !== undefined && style.torsoPitch !== 1) {
    for (const bone of ["J_Bip_C_Spine", "J_Bip_C_Chest", "J_Bip_C_UpperChest", "J_Bip_C_Neck", "J_Bip_C_Head"]) {
      const before = edits[bone];
      edits[bone] = (q, t) => scalePitch(before ? before(q, t) : q, style.torsoPitch);
    }
  }
  if (style.headTilt) edits.J_Bip_C_Head = (q) => mul(axis(0, 0, 1, deg(style.headTilt)), q);

  const pose = POSES[name];
  const duration = Math.max(...source.listSamplers().map((sampler) => sampler.getInput().getMax([])[0]));
  /** 이 뼈를 새로 잡나 — 그 시각의 자세와 섞는 무게 */
  const posed = (bone, t) => {
    if (!pose) return null;
    const u = duration > 0 ? t / duration : 0;
    // 공중제비 — 골반을 부모(Root) 축 X 로 돌린다(앞이 +Z 라 양수면 머리가 앞으로 넘어간다)
    if (bone === "J_Bip_C_Hips" && pose.flip) return { apply: (q) => mul(axis(1, 0, 0, deg(pose.flip(u))), q), w: 1 };
    const legs = pose.legs ? bonesOf(pose.legs(u))[bone] : undefined;
    if (legs) return { q: legs, w: pose.legWeight(u) };
    const arms = pose.arms ? armsOf(pose.arms(u))[bone] : undefined;
    if (arms) return { q: arms, w: pose.armWeight(u) };
    return null;
  };

  const animation = document.createAnimation(`${name}_F`);
  let changed = 0;
  for (const channel of source.listChannels()) {
    const node = channel.getTargetNode();
    const sampler = channel.getSampler();
    const path = channel.getTargetPath();
    const edit = path === "rotation" ? edits[node.getName()] : null;

    // 새로 잡는 뼈 — 60 fps 로 다시 찍는다(원래 키가 2 개뿐인 뼈도 움직여야 하고, 공중제비는 한 프레임에 6 도씩 돈다)
    // 골반을 바로 세우면 척추가 매 순간 그만큼 되돌려야 한다 — 키가 2 개뿐인 척추도 다시 찍는다
    const respine = style.level && node.getName() === "J_Bip_C_Spine";
    if (path === "rotation" && (respine || posed(node.getName(), 0))) {
      const track = { times: read(sampler.getInput(), 1), values: read(sampler.getOutput(), 4) };
      const times = [];
      for (let t = 0; t < duration; t += 1 / 60) times.push(t);
      times.push(duration);
      const values = times.map((t) => {
        let q = sampleRotation(track.times, track.values, t);
        if (edit) q = edit(q, t);
        const pose = posed(node.getName(), t);
        if (!pose) return norm(q);
        const { q: target, apply, w } = pose;
        return norm(apply ? apply(q) : slerp(q, target, w));
      });
      const resampled = document
        .createAnimationSampler()
        .setInput(document.createAccessor().setType("SCALAR").setArray(new Float32Array(times)).setBuffer(buffer))
        .setOutput(document.createAccessor().setType("VEC4").setArray(new Float32Array(values.flat())).setBuffer(buffer))
        .setInterpolation("LINEAR");
      animation.addSampler(resampled);
      animation.addChannel(document.createAnimationChannel().setTargetNode(node).setTargetPath(path).setSampler(resampled));
      changed += 1;
      continue;
    }

    let output = sampler.getOutput();
    // 고치는 뼈인데 키가 2 개뿐(움직이지 않는 뼈)이면 그대로 고치면 된다. 다른 뼈와 시간을 맞출 일이 없다
    if (edit) {
      const times = read(sampler.getInput(), 1);
      const values = read(output, 4).map((q, i) => norm(edit(q, times[i])));
      output = document.createAccessor().setType("VEC4").setArray(new Float32Array(values.flat())).setBuffer(buffer);
      changed += 1;
    }
    const copy = document
      .createAnimationSampler()
      .setInput(sampler.getInput())
      .setOutput(output)
      .setInterpolation(sampler.getInterpolation());
    animation.addSampler(copy);
    animation.addChannel(document.createAnimationChannel().setTargetNode(node).setTargetPath(path).setSampler(copy));
  }
  console.log(`[feminine] ${name}_F — 뼈 ${changed} 개를 고쳤습니다`);
}

await io.write(file, document);
console.log(`[feminine] 저장: ${file}`);
