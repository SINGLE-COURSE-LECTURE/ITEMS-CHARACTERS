/**
 * 총 자세를 Mixamo 동작으로 — 두 손으로 권총을 받쳐 쥔다 (2026-11-18, 사용자: 받치는 손이 쥔 손을 감싸 쥐는 모양).
 *
 * 예전 총 자세(Quaternius UAL Pistol_*)는 한 손으로 쥐어 왼손이 가슴 앞에 떠 있었다. 손으로 만든 IK 자세는 어색하다고 거절됐다
 * (방망이 때와 같다) — Mixamo 모션캡처를 그대로 쓴다.
 *
 *   IdleGun · Aim   ← Mixamo 「Pistol Idle — Idle With Aimed Pistol」 (두 손으로 겨누고 선다)
 *   AimCrouch       ← Mixamo 「Pistol Kneeling Idle — Kneeling Idle With Aimed Pistol」
 *   Shoot           ← 윗몸은 Mixamo 「Shooting — Firing A Gun」 0.2~0.85 초(반동), 다리 · 골반은 IdleGun
 *   ShootCrouch     ← 윗몸은 같은 Firing A Gun, 다리 · 골반은 AimCrouch
 * 쏘기 원본은 다리를 크게 벌리고 서서, 그대로 쓰면 쏠 때마다 발이 튀었다. 다리 · 골반은 서기(앉기) 것을 쓰고,
 * 가슴이 원본 쏘기와 같은 쪽을 보도록 척추에서 골반 차이를 되돌린다 (척추 = 서기골반⁻¹ · 쏘기골반 · 쏘기척추).
 * 탄창 갈기(Reload · ReloadCrouch)는 그대로 둔다.
 *
 * 원본: FIELD_INIT/blender/mixamo/gun/*.fbx (Mixamo, 사용자 계정으로 받음 · 저장소 제외) →
 *   blender --background --python blender/retarget_mixamo.py -- $TEMP/gun_src.glb <fbx …> (FIELD_INIT 에서)
 * 쓰는 법 (3DLECTURE-GAMES 에서): node ITEMS-CHARACTERS/scripts/gun-from-mocap.mjs <gun_src.glb> [동작 파일]
 */
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const [sourcePath, targetArg] = process.argv.slice(2);
if (!sourcePath) throw new Error("쓰는 법: gun-from-mocap.mjs <gun_src.glb> [player-anims.glb]");
const targetPath = targetArg ?? join(here, "..", "..", "core", "assets", "models", "player-anims.glb");
const FPS = 60;
/**
 * 쏘기 원본(Firing A Gun 1.2 초)에서 쓸 구간 — 반동이 0.23 초에 시작해 0.4 초에 총구가 22° 들리고 0.83 초에 가라앉는다.
 * 앞 0.2 초(가만히 겨눔)는 버려 누르자마자 반동이 나오게.
 * (Gunplay — Shooting 은 총이 내내 14° 옆으로 기울어 탈락)
 */
const FIRE = [0.2, 0.85];

const mul = (a, b) => [
  a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
  a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
  a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
  a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
];
const inv = (q) => [-q[0], -q[1], -q[2], q[3]];
const qnorm = (q) => {
  const l = Math.hypot(...q) || 1;
  return q.map((v) => v / l);
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

const rotate = (q, v) => {
  const p = mul(mul(q, [v[0], v[1], v[2], 0]), inv(q));
  return [p[0], p[1], p[2]];
};
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const source = await io.read(sourcePath);
const target = await io.read(targetPath);
const root = target.getRoot();
const buffer = root.listBuffers()[0];
const nodes = new Map(root.listNodes().map((node) => [node.getName(), node]));

/** 원본 동작 → { 뼈 이름: { rotation?: t→q, translation?: t→v } , duration } */
const clipOf = (name) => {
  const animation = source.getRoot().listAnimations().find((a) => a.getName() === name);
  if (!animation) throw new Error(`${sourcePath} 에 ${name} 이 없습니다`);
  const bones = new Map();
  let duration = 0;
  for (const channel of animation.listChannels()) {
    const bone = channel.getTargetNode().getName();
    const path = channel.getTargetPath();
    if (path !== "rotation" && path !== "translation") continue;
    const times = channel.getSampler().getInput().getArray();
    const values = channel.getSampler().getOutput().getArray();
    const size = path === "rotation" ? 4 : 3;
    duration = Math.max(duration, times[times.length - 1]);
    const at = (t) => {
      let i = 0;
      while (i < times.length - 1 && times[i + 1] < t) i += 1;
      if (i >= times.length - 1) return Array.from(values.slice((times.length - 1) * size, times.length * size));
      const f = Math.min(1, Math.max(0, (t - times[i]) / (times[i + 1] - times[i] || 1)));
      const a = Array.from(values.slice(i * size, i * size + size));
      const b = Array.from(values.slice((i + 1) * size, (i + 2) * size));
      return size === 4 ? slerp(a, b, f) : a.map((v, k) => v + (b[k] - v) * f);
    };
    if (!bones.has(bone)) bones.set(bone, {});
    bones.get(bone)[path] = at;
  }
  return { bones, duration };
};

/** 다리 · 골반 (아래 몸) — 이 뼈들은 받침 동작에서 */
const LOWER = /^J_Bip_C_Hips$|_(UpperLeg|LowerLeg|Foot|ToeBase)$/;

/**
 * 동작 하나를 만든다. upper 의 길이만큼, lower 가 있으면 아래 몸은 lower (lower 는 되풀이 동작이라 시간을 감는다).
 */
const build = (upperName, lowerName, range) => {
  const whole = clipOf(upperName);
  const from = range?.[0] ?? 0;
  const to = range?.[1] ?? whole.duration;
  // 잘라 쓸 때는 시간을 from 만큼 당긴다
  const upper = { duration: to - from, bones: new Map([...whole.bones].map(([bone, paths]) => [bone, Object.fromEntries(Object.entries(paths).map(([path, at]) => [path, (t) => at(t + from)]))])) };
  const lower = lowerName ? clipOf(lowerName) : null;
  const times = [];
  for (let t = 0; t < upper.duration; t += 1 / FPS) times.push(t);
  times.push(upper.duration);
  const lowerAt = (t) => (lower ? t % lower.duration : t);
  const tracks = new Map();
  const names = new Set([...upper.bones.keys(), ...(lower ? lower.bones.keys() : [])]);
  for (const bone of names) {
    const fromLower = lower && LOWER.test(bone);
    const src = (fromLower ? lower : upper).bones.get(bone);
    if (!src) continue;
    for (const path of ["rotation", "translation"]) {
      if (!src[path]) continue;
      tracks.set(`${bone}|${path}`, times.map((t) => src[path](fromLower ? lowerAt(t) : t)));
    }
  }
  if (lower) {
    // 가슴은 원본 쏘기와 같은 쪽을 보게 — 척추 = 서기골반⁻¹ · 쏘기골반 · 쏘기척추
    const hipsUp = upper.bones.get("J_Bip_C_Hips")?.rotation;
    const hipsLow = lower.bones.get("J_Bip_C_Hips")?.rotation;
    const spine = upper.bones.get("J_Bip_C_Spine")?.rotation;
    if (hipsUp && hipsLow && spine) {
      tracks.set("J_Bip_C_Spine|rotation", times.map((t) => qnorm(mul(mul(inv(hipsLow(lowerAt(t))), hipsUp(t)), spine(t)))));
    }
  }
  return { times, tracks };
};

/**
 * 총구 방향을 앞으로 — Mixamo 권총 자세는 몸을 비스듬히 틀고 서서, 그대로면 총이 캐릭터 앞(+Z)에서 옆으로 30° 가량 비껴 보였다.
 * 오른 아래팔(팔꿈치 → 손목) 방향의 평균 가로 각을 재서, 골반(몸 전체)을 그만큼 되돌린다.
 */
const CHAIN = ["J_Bip_C_Hips", "J_Bip_C_Spine", "J_Bip_C_Chest", "J_Bip_C_UpperChest", "J_Bip_R_Shoulder", "J_Bip_R_UpperArm", "J_Bip_R_LowerArm", "J_Bip_R_Hand"];
const faceForward = (clip, label) => {
  const { times, tracks } = clip;
  let sx = 0;
  let sz = 0;
  times.forEach((_, i) => {
    let q = [0, 0, 0, 1];
    let p = [0, 0, 0];
    const at = {};
    for (const bone of CHAIN) {
      const local = tracks.get(`${bone}|rotation`)?.[i] ?? nodes.get(bone).getRotation();
      if (bone !== "J_Bip_C_Hips") p = [p[0] + rotate(q, nodes.get(bone).getTranslation())[0], p[1] + rotate(q, nodes.get(bone).getTranslation())[1], p[2] + rotate(q, nodes.get(bone).getTranslation())[2]];
      q = qnorm(mul(q, local));
      at[bone] = p;
    }
    // 총열 = 손가락이 뻗는 쪽 (오른손 뼈 국소 -X — 손가락 뿌리가 -0.07). 아래팔 방향으로 쟀더니 팔이 몸 가운데로 모여 20° 안쪽으로 나와,
    // 몸을 거꾸로 더 틀었다
    const barrel = rotate(q, [-1, 0, 0]);
    const d = [barrel[0], barrel[2]];
    const l = Math.hypot(d[0], d[1]) || 1;
    sx += d[0] / l;
    sz += d[1] / l;
  });
  const yaw = Math.atan2(sx, sz);
  const fix = [0, Math.sin(-yaw / 2), 0, Math.cos(-yaw / 2)];
  const hipsR = tracks.get("J_Bip_C_Hips|rotation");
  if (hipsR) for (let i = 0; i < hipsR.length; i += 1) hipsR[i] = qnorm(mul(fix, hipsR[i]));
  const hipsT = tracks.get("J_Bip_C_Hips|translation");
  if (hipsT) {
    const base = hipsT[0];
    for (let i = 0; i < hipsT.length; i += 1) {
      const off = rotate(fix, [hipsT[i][0] - base[0], 0, hipsT[i][2] - base[2]]);
      hipsT[i] = [base[0] + off[0], hipsT[i][1], base[2] + off[2]];
    }
  }
  console.log(`[gun] ${label} — 총구가 앞에서 ${((yaw * 180) / Math.PI).toFixed(1)}° 비껴 있어 몸을 되돌림`);
  return clip;
};

/**
 * 여성형 짝(이름_F) — 여성형(pixiv-twist)은 위팔 0.245 · 아래팔 0.239 로 남성형(0.220 · 0.250)과 팔 길이가 달라,
 * 같은 회전이면 두 손이 10 cm 가량 벌어졌다(왼손이 손잡이 옆에 떠 있음). 동작은 그대로 두고, 왼손만 「남성형 동작에서 오른손에 대한 왼손 자리 · 방향」
 * 그대로 오른손에 붙도록 왼팔(위팔 · 아래팔 · 손)을 그 몸 길이로 다시 푼다. 팔꿈치는 원래 동작의 팔꿈치 쪽으로.
 */
const femaleRest = new Map((await io.read(join(here, "..", "..", "core", "assets", "models", "characters", "characters", "pixiv-twist", "game.glb"))).getRoot().listNodes().map((node) => [node.getName(), node.getTranslation()]));
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const scale = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = (a) => Math.hypot(a[0], a[1], a[2]);
const unit = (a) => scale(a, 1 / (len(a) || 1));
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
const SPINE = ["J_Bip_C_Hips", "J_Bip_C_Spine", "J_Bip_C_Chest", "J_Bip_C_UpperChest"];
const armChain = (side) => [...SPINE, `J_Bip_${side}_Shoulder`, `J_Bip_${side}_UpperArm`, `J_Bip_${side}_LowerArm`, `J_Bip_${side}_Hand`];
/** i 번째 프레임에서 뼈 사슬의 세상 자리 · 회전 (골반 자리 0) */
const pose = (tracks, i, chain, restOf) => {
  let q = [0, 0, 0, 1];
  let p = [0, 0, 0];
  const out = {};
  for (const bone of chain) {
    if (bone !== "J_Bip_C_Hips") p = add(p, rotate(q, restOf(bone)));
    q = qnorm(mul(q, tracks.get(`${bone}|rotation`)?.[i] ?? nodes.get(bone).getRotation()));
    out[bone] = { p, q };
  }
  return out;
};
const femaleOf = ({ times, tracks }) => {
  const male = (bone) => nodes.get(bone).getTranslation();
  const female = (bone) => femaleRest.get(bone) ?? nodes.get(bone).getTranslation();
  const next = new Map([...tracks].map(([key, values]) => [key, values.map((v) => [...v])]));
  const upperL = [];
  const lowerL = [];
  const handL = [];
  let worst = 0;
  times.forEach((_, i) => {
    const mR = pose(tracks, i, armChain("R"), male).J_Bip_R_Hand;
    const mL = pose(tracks, i, armChain("L"), male).J_Bip_L_Hand;
    const relP = rotate(inv(mR.q), sub(mL.p, mR.p));
    const relQ = qnorm(mul(inv(mR.q), mL.q));
    const fR = pose(tracks, i, armChain("R"), female).J_Bip_R_Hand;
    const f = pose(tracks, i, armChain("L"), female);
    const wantP = add(fR.p, rotate(fR.q, relP));
    const wantQ = qnorm(mul(fR.q, relQ));
    const shoulder = f.J_Bip_L_Shoulder;
    const S = add(shoulder.p, rotate(shoulder.q, female("J_Bip_L_UpperArm")));
    const upper0 = f.J_Bip_L_UpperArm;
    const lower0 = f.J_Bip_L_LowerArm;
    const elbow0 = lower0.p;
    worst = Math.max(worst, len(sub(f.J_Bip_L_Hand.p, wantP)));
    const L1 = len(female("J_Bip_L_LowerArm"));
    const L2 = len(female("J_Bip_L_Hand"));
    const to = sub(wantP, S);
    const dist = Math.min(Math.max(len(to), 0.05), L1 + L2 - 0.002);
    const dir = unit(to);
    const hint = sub(elbow0, S);
    let pole = sub(hint, scale(dir, dot(hint, dir)));
    pole = len(pole) < 1e-4 ? unit(sub([0, -1, 0], scale(dir, dot([0, -1, 0], dir)))) : unit(pole);
    const a = (L1 * L1 - L2 * L2 + dist * dist) / (2 * dist);
    const h = Math.sqrt(Math.max(0, L1 * L1 - a * a));
    const E = add(add(S, scale(dir, a)), scale(pole, h));
    const W = add(S, scale(dir, dist));
    const qu = qnorm(mul(fromTo(rotate(upper0.q, female("J_Bip_L_LowerArm")), sub(E, S)), upper0.q));
    const ql = qnorm(mul(fromTo(rotate(lower0.q, female("J_Bip_L_Hand")), sub(W, E)), lower0.q));
    upperL.push(qnorm(mul(inv(shoulder.q), qu)));
    lowerL.push(qnorm(mul(inv(qu), ql)));
    handL.push(qnorm(mul(inv(ql), wantQ)));
  });
  next.set("J_Bip_L_UpperArm|rotation", upperL);
  next.set("J_Bip_L_LowerArm|rotation", lowerL);
  next.set("J_Bip_L_Hand|rotation", handL);
  console.log(`[gun] 여성형 — 왼손이 받칠 자리에서 최대 ${(worst * 100).toFixed(1)} cm 떨어져 있어 왼팔을 다시 풂`);
  return { times, tracks: next };
};

const write = (name, { times, tracks }) => {
  for (const old of root.listAnimations().filter((a) => a.getName() === name)) {
    for (const channel of old.listChannels()) channel.dispose();
    for (const sampler of old.listSamplers()) sampler.dispose();
    old.dispose();
  }
  const animation = target.createAnimation(name);
  const input = target.createAccessor().setType("SCALAR").setArray(new Float32Array(times)).setBuffer(buffer);
  let count = 0;
  for (const [key, values] of tracks) {
    const [bone, path] = key.split("|");
    const node = nodes.get(bone);
    if (!node) continue;
    if (path === "rotation") {
      for (let i = 1; i < values.length; i += 1) {
        const p = values[i - 1];
        const q = values[i];
        if (p[0] * q[0] + p[1] * q[1] + p[2] * q[2] + p[3] * q[3] < 0) values[i] = q.map((v) => -v);
      }
    }
    const output = target
      .createAccessor()
      .setType(path === "rotation" ? "VEC4" : "VEC3")
      .setArray(new Float32Array(values.flat()))
      .setBuffer(buffer);
    const sampler = target.createAnimationSampler().setInput(input).setOutput(output).setInterpolation("LINEAR");
    animation.addSampler(sampler);
    animation.addChannel(target.createAnimationChannel().setTargetNode(node).setTargetPath(path).setSampler(sampler));
    count += 1;
  }
  console.log(`[gun] ${name} — 채널 ${count} 개 · ${times[times.length - 1].toFixed(2)}초`);
};

const clips = {
  IdleGun: faceForward(build("MxIdleWithAimedPistol"), "IdleGun"),
  Aim: faceForward(build("MxIdleWithAimedPistol"), "Aim"),
  AimCrouch: faceForward(build("MxKneelingIdleWithAimedPistol"), "AimCrouch"),
  Shoot: faceForward(build("MxFiringAGun", "MxIdleWithAimedPistol", FIRE), "Shoot"),
  ShootCrouch: faceForward(build("MxFiringAGun", "MxKneelingIdleWithAimedPistol", FIRE), "ShootCrouch"),
};
for (const [name, clip] of Object.entries(clips)) {
  write(name, clip);
  write(`${name}_F`, femaleOf(clip));
}
for (const accessor of root.listAccessors()) if (accessor.listParents().length <= 1) accessor.dispose();
await io.write(targetPath, target);
console.log(`[gun] → ${targetPath}`);
