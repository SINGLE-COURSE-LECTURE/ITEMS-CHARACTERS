/**
 * 방망이 3단 콤보 — 동작 파일(core/assets/models/player-anims.glb)의 ArmedAttack1 · 2 · 3 을 새로 굽는다.
 *
 * 원래 무기 공격 동작은 칼 베기(Quaternius)라 방망이를 쥐면 방망이가 손과 따로 놀고 찌르듯 흔들려 어색했다.
 * 방망이답게: 1단 가로 휘두르기(오른쪽 → 왼쪽) · 2단 되돌려 휘두르기(왼쪽 → 오른쪽) · 3단 한 발 디디며 내려찍기.
 * 게임의 타격 순간(characterModel ARMED_IMPACT = 0.3 · 0.2 · 0.32)에 방망이가 몸 앞을 지나가게 키를 잡았다.
 *
 * 만드는 법: 서기(IdleArmed) 첫 자세를 바탕으로 — 손가락 쥐기 등 손대지 않는 뼈는 그대로 —
 * 아래 KEYS 의 뼈만 새로 잡아 60 fps 로 찍는다. 각도는 쉬는 자세(T 자) 기준, 부모 뼈 축 (VRoid 1.0: 앞 +Z · 왼쪽 +X · 위 +Y).
 *   몸통 yaw: + 는 왼쪽으로 돌기 · pitch: + 는 앞으로 숙이기
 *   팔 dn: 수평에서 내린 각(음수는 올리기) · fw: 음수 = 앞으로 · yw: + 는 몸 앞으로(오른팔은 왼쪽으로 가로질러) · el: 팔꿈치 굽히기 · wr: 손목
 *   다리 x: 음수 = 앞으로 들기 · k: 무릎 · f: 발목 · ad: 다리 벌리기
 *
 * 쓰는 법 (3DLECTURE-GAMES 폴더에서): node ITEMS-CHARACTERS/scripts/bat-combo-anims.mjs [입력.glb] [출력.glb]
 * 다음에 feminine-anims.mjs 를 다시 돌려 _F(여성형)도 새 동작으로 만든다. 몇 번 돌려도 같다.
 */
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const input = process.argv[2] ?? join(here, "..", "..", "core", "assets", "models", "player-anims.glb");
const output = process.argv[3] ?? input;

const deg = (v) => (v * Math.PI) / 180;
const mul = (a, b) => [
  a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
  a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
  a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
  a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
];
const axis = (x, y, z, a) => [x * Math.sin(a / 2), y * Math.sin(a / 2), z * Math.sin(a / 2), Math.cos(a / 2)];
const X = (d) => axis(1, 0, 0, deg(d));
const Y = (d) => axis(0, 1, 0, deg(d));
const Z = (d) => axis(0, 0, 1, deg(d));
const ease = (x) => x * x * (3 - 2 * x);

/** 키 [[t, {값}]...] 사이를 부드럽게 (빠진 값은 0) */
const keyed = (keys) => (t) => {
  const names = [...new Set(keys.flatMap(([, v]) => Object.keys(v)))];
  const at = (v) => Object.fromEntries(names.map((n) => [n, v[n] ?? 0]));
  if (t <= keys[0][0]) return at(keys[0][1]);
  for (let i = 1; i < keys.length; i += 1) {
    if (t <= keys[i][0]) {
      const f = ease((t - keys[i - 1][0]) / (keys[i][0] - keys[i - 1][0]));
      const a = at(keys[i - 1][1]);
      const b = at(keys[i][1]);
      return Object.fromEntries(names.map((n) => [n, a[n] + (b[n] - a[n]) * f]));
    }
  }
  return at(keys[keys.length - 1][1]);
};

/** 값 묶음 → 뼈 회전 */
const arm = (side, dn, fw, yw) => {
  const s = side === "L" ? -1 : 1;
  return mul(Y(s * yw), mul(X(fw), Z(s * dn)));
};
const pose = (raw) => {
  // 키에 없는 값은 0
  const v = new Proxy(raw, { get: (o, k) => (typeof o[k] === "number" ? o[k] : 0) });
  return {
  J_Bip_C_Hips: mul(Y(v.hipYaw), X(v.hipPitch)),
  J_Bip_C_Spine: mul(Y(v.yaw * 0.3), X(v.pitch * 0.4)),
  J_Bip_C_Chest: mul(Y(v.yaw * 0.35), X(v.pitch * 0.35)),
  J_Bip_C_UpperChest: mul(Y(v.yaw * 0.35), X(v.pitch * 0.25)),
  // 머리는 몸통 돌기를 되돌려 앞을 본다
  J_Bip_C_Neck: Y(-(v.yaw + v.hipYaw) * 0.35),
  J_Bip_C_Head: mul(Y(-(v.yaw + v.hipYaw) * 0.35), X(-v.pitch * 0.3)),
  J_Bip_R_UpperArm: arm("R", v.rdn, v.rfw, v.ryw),
  J_Bip_R_LowerArm: Y(v.rel),
  J_Bip_R_Hand: mul(X(v.rwr), Z(v.rwz)),
  J_Bip_L_UpperArm: arm("L", v.ldn, v.lfw, v.lyw),
  J_Bip_L_LowerArm: Y(-v.lel),
  J_Bip_L_UpperLeg: mul(Y(-v.hipYaw * 0.6), mul(Z(-v.lad), X(v.lx))),
  J_Bip_L_LowerLeg: X(v.lk),
  J_Bip_L_Foot: X(v.lf),
  J_Bip_R_UpperLeg: mul(Y(-v.hipYaw * 0.6), mul(Z(v.rad), X(v.rx))),
  J_Bip_R_LowerLeg: X(v.rk),
  J_Bip_R_Foot: X(v.rf),
  };
};

// 쥐고 선 자세 — 방망이를 오른 어깨 앞에 세워 든다
const READY = { yaw: -10, rdn: 62, rfw: -35, ryw: 0, rel: 75, rwr: -20, ldn: 62, lfw: -30, lel: 75, lx: -14, lk: 18, lf: -4, rx: 10, rk: 18, rf: -4, lad: 14, rad: 14, drop: 0.05 };

/** 동작 이름 → { 길이(초), 키 } */
const CLIPS = {
  // 1단 — 오른쪽 뒤로 감았다가 몸을 틀며 가로로 (타격 0.3)
  ArmedAttack1: {
    seconds: 0.72,
    keys: [
      [0, READY],
      [0.16, { ...READY, yaw: -45, hipYaw: -12, rdn: 25, rfw: -10, ryw: -35, rel: 85, rwr: -40, ldn: 58, lfw: -45, lyw: 25, lel: 75, drop: 0.06 }],
      [0.3, { ...READY, yaw: 15, hipYaw: 8, rdn: 12, rfw: 0, ryw: 55, rel: 8, rwr: 0, ldn: 60, lfw: -15, lyw: 0, lel: 65, drop: 0.07 }],
      [0.5, { ...READY, yaw: 50, hipYaw: 15, rdn: 25, rfw: 0, ryw: 110, rel: 35, rwr: 10, ldn: 62, lfw: -5, lyw: -10, lel: 60, drop: 0.06 }],
      [1, { ...READY, yaw: 30, hipYaw: 8, rdn: 40, rfw: -20, ryw: 80, rel: 60, rwr: 0 }],
    ],
  },
  // 2단 — 왼쪽에서 되돌려 손등 쪽으로 (타격 0.2)
  ArmedAttack2: {
    seconds: 0.62,
    keys: [
      [0, { ...READY, yaw: 40, hipYaw: 12, rdn: 30, rfw: -10, ryw: 105, rel: 70, rwr: 20, drop: 0.05 }],
      [0.2, { ...READY, yaw: 0, hipYaw: 0, rdn: 15, rfw: 0, ryw: 30, rel: 10, rwr: 0, ldn: 62, lfw: -30, lel: 70, drop: 0.07 }],
      [0.42, { ...READY, yaw: -40, hipYaw: -12, rdn: 20, rfw: 0, ryw: -45, rel: 25, rwr: -15, ldn: 62, lfw: -35, lyw: 20, lel: 70, drop: 0.06 }],
      [1, { ...READY, yaw: -20, hipYaw: -5, rdn: 45, rfw: -25, ryw: -10, rel: 60 }],
    ],
  },
  // 3단 — 머리 위로 들어 한 발 디디며 내려찍기 (타격 0.32)
  ArmedAttack3: {
    seconds: 0.95,
    keys: [
      [0, READY],
      [0.2, { ...READY, yaw: -5, pitch: -14, rdn: -75, rfw: 45, ryw: 5, rel: 70, rwr: -20, ldn: -60, lfw: 40, lyw: 15, lel: 80, lx: -30, lk: 30, lf: 0, rx: 15, rk: 20, drop: 0.02 }],
      [0.32, { ...READY, yaw: 0, pitch: 28, rdn: 55, rfw: -55, ryw: 20, rel: 8, rwr: 25, ldn: 55, lfw: -45, lyw: 20, lel: 20, lx: -45, lk: 55, lf: -10, rx: 25, rk: 35, rf: 10, drop: 0.14 }],
      [0.6, { ...READY, yaw: 0, pitch: 24, rdn: 60, rfw: -50, ryw: 20, rel: 10, rwr: 25, ldn: 60, lfw: -40, lyw: 20, lel: 20, lx: -45, lk: 55, lf: -10, rx: 25, rk: 35, rf: 10, drop: 0.13 }],
      [1, READY],
    ],
  },
};

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const document = await io.read(input);
const root = document.getRoot();
const buffer = root.listBuffers()[0];
const idle = root.listAnimations().find((a) => a.getName() === "IdleArmed");
if (!idle) throw new Error("IdleArmed 동작이 없습니다");

/** 채널 첫 키 값 */
const first = (channel) => Array.from(channel.getSampler().getOutput().getArray().slice(0, channel.getTargetPath() === "rotation" ? 4 : 3));

for (const [name, clip] of Object.entries(CLIPS)) {
  // 예전 것을 지운다 (여성형 _F 는 feminine-anims.mjs 가 다시 만든다)
  for (const old of root.listAnimations().filter((a) => a.getName() === name || a.getName() === `${name}_F`)) {
    for (const ch of old.listChannels()) ch.dispose();
    for (const s of old.listSamplers()) s.dispose();
    old.dispose();
  }
  const animation = document.createAnimation(name);
  const times = [];
  for (let t = 0; t < clip.seconds; t += 1 / 60) times.push(t);
  times.push(clip.seconds);
  const timeAcc = document.createAccessor().setType("SCALAR").setArray(new Float32Array(times)).setBuffer(buffer);
  const track = keyed(clip.keys);
  const frames = times.map((t) => track(t / clip.seconds));
  const posed = frames.map(pose);
  for (const channel of idle.listChannels()) {
    const node = channel.getTargetNode();
    const path = channel.getTargetPath();
    const base = first(channel);
    let values;
    if (path === "rotation" && posed[0][node.getName()]) values = posed.map((p) => p[node.getName()]);
    else if (path === "translation" && node.getName() === "J_Bip_C_Hips") values = frames.map((v) => [base[0], base[1] - v.drop, base[2]]);
    else values = times.map(() => base);
    const sampler = document
      .createAnimationSampler()
      .setInput(timeAcc)
      .setOutput(document.createAccessor().setType(path === "rotation" ? "VEC4" : "VEC3").setArray(new Float32Array(values.flat())).setBuffer(buffer))
      .setInterpolation("LINEAR");
    animation.addSampler(sampler);
    animation.addChannel(document.createAnimationChannel().setTargetNode(node).setTargetPath(path).setSampler(sampler));
  }
  console.log(`[bat] ${name} — ${clip.seconds}s · ${times.length} 프레임`);
}

// 안 쓰는 접근자 정리 (지운 동작의 키)
for (const accessor of root.listAccessors()) if (accessor.listParents().length <= 1) accessor.dispose();
await io.write(output, document);
console.log(`[bat] → ${output}`);
