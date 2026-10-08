/**
 * 여성형 기본 동작 — 동작 파일(core/assets/models/player-anims.glb)의 서기 · 걷기 · 달리기를 바탕으로
 * 여성형 몸짓을 구워 「이름_F」 동작을 더한다 (Idle_F · Walk_F · Run_F). 게임은 여성형 캐릭터면 _F 를 먼저 찾는다.
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
  // 원래 서기는 다리를 어깨보다 넓게 벌리고 주먹을 쥔 자세라 많이 모은다
  // hipYaw 골반 돌기 배수 · hipRoll 골반 기울기 배수 · torsoRoll 가슴 기울기 배수
  Idle: { hipYaw: 1, hipRoll: 1, torsoRoll: 1, legIn: 7, armIn: 8, armSwing: 1, headTilt: 4 },
  Walk: { hipYaw: 1.6, hipRoll: 0.8, torsoRoll: 0.6, legIn: 3.5, armIn: 7, armSwing: 0.6, headTilt: 0 },
  Run: { hipYaw: 1.3, hipRoll: 0.85, torsoRoll: 0.8, legIn: 3, armIn: 10, armSwing: 0.7, headTilt: 0 },
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
  const hipsNew = (q) => scaleTwistSwing(q, hipsMean, style.hipYaw, style.hipRoll);
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
      return mul(mul(inv(hipsNew(old)), old), q);
    },
    J_Bip_C_Chest: (q) => scaleTwistSwing(q, chestMean, 1, style.torsoRoll),
    J_Bip_C_UpperChest: (q) => scaleTwistSwing(q, upperChestMean, 1, style.torsoRoll),
    J_Bip_L_UpperLeg: (q) => mul(axis(0, 0, 1, deg(-style.legIn)), q),
    J_Bip_R_UpperLeg: (q) => mul(axis(0, 0, 1, deg(style.legIn)), q),
    J_Bip_L_Foot: (q) => mul(axis(0, 0, 1, deg(style.legIn)), q),
    J_Bip_R_Foot: (q) => mul(axis(0, 0, 1, deg(-style.legIn)), q),
  };
  for (const [side, sign] of [
    ["L", 1],
    ["R", -1],
  ]) {
    const arm = rot(`J_Bip_${side}_UpperArm`);
    const armMean = arm ? meanOf(arm.values) : IDENTITY;
    edits[`J_Bip_${side}_UpperArm`] = (q) => mul(axis(0, 0, 1, deg(-sign * style.armIn)), scaleSway(q, armMean, style.armSwing));
  }
  if (style.headTilt) edits.J_Bip_C_Head = (q) => mul(axis(0, 0, 1, deg(style.headTilt)), q);

  const animation = document.createAnimation(`${name}_F`);
  let changed = 0;
  for (const channel of source.listChannels()) {
    const node = channel.getTargetNode();
    const sampler = channel.getSampler();
    const path = channel.getTargetPath();
    const edit = path === "rotation" ? edits[node.getName()] : null;

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
