/**
 * 방망이 3단 콤보 — 실제 모션캡처를 잘라 core 동작 파일(player-anims.glb)의 ArmedAttack1 · 2 · 3 으로 넣는다.
 *
 * 원본: FIELD_INIT/blender/retarget_bat.py 가 VRoid 뼈대로 옮긴 glb
 *   BatSwingFull  CMU 124_07 Baseball Swing — 두 번 휘두른다 (2.8 초 · 8.4 초 근처가 타격)
 *   BatChop       Quaternius UAL2 TreeChopping (CC0) — 두 손 내려찍기
 * 1단 = 첫 스윙 · 2단 = 둘째 스윙을 좌우로 뒤집어 반대로 · 3단 = 둘째 스윙을 원래 방향으로 길게 (마무리).
 * 타자는 옆으로 서서 치므로, 타격 순간 가슴이 앞(+Z)을 보도록 골반을 통째로 돌린다.
 * 손가락은 원본에 없어 서기(IdleArmed)의 쥔 손을 쓴다 — 방망이를 쥔 채로.
 *
 * 쓰는 법 (3DLECTURE-GAMES 폴더에서):
 *   node ITEMS-CHARACTERS/scripts/bat-from-mocap.mjs <retarget_bat 출력.glb> [동작 파일 = core/assets/models/player-anims.glb]
 * 다음에 feminine-anims.mjs 를 다시 돌려 _F 도 새로 만든다.
 */
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const sourcePath = process.argv[2];
const animsPath = process.argv[3] ?? join(here, "..", "..", "core", "assets", "models", "player-anims.glb");
if (!sourcePath) throw new Error("retarget_bat.py 출력 glb 를 주세요");

/** 잘라 쓸 구간 (초) — 게임 타격 순간(ARMED_IMPACT 0.3 · 0.2 · 0.32)에 맞춰 잡았다 */
const CUTS = {
  ArmedAttack1: { from: "BatSwingFull", start: 2.5, end: 3.55, mirror: false, impact: 2.82 },
  ArmedAttack2: { from: "BatSwingFull", start: 8.18, end: 9.25, mirror: true, impact: 8.4 },
  // 3단(마무리) — 둘째 스윙을 원래 방향으로, 끝까지 길게 휘두른다
  // (나무 찍기는 두 손 도끼 동작이라 한 손 방망이로는 방망이가 뒤로 꺾여 어색했다)
  ArmedAttack3: { from: "BatSwingFull", start: 7.9, end: 9.6, mirror: false, impact: 8.4 },
};
const FPS = 60;

const mul = (a, b) => [
  a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
  a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
  a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
  a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
];
const inv = (q) => [-q[0], -q[1], -q[2], q[3]];
const turn = (q, v) => {
  const p = mul(mul(q, [v[0], v[1], v[2], 0]), inv(q));
  return [p[0], p[1], p[2]];
};
const yawQ = (a) => [0, Math.sin(a / 2), 0, Math.cos(a / 2)];
const slerp = (a, b, t) => {
  let d = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
  const bb = d < 0 ? b.map((v) => -v) : b;
  d = Math.abs(d);
  if (d > 0.9995) {
    const r = a.map((v, i) => v + (bb[i] - v) * t);
    const l = Math.hypot(...r);
    return r.map((v) => v / l);
  }
  const th = Math.acos(d);
  const s = Math.sin(th);
  return a.map((v, i) => (v * Math.sin((1 - t) * th) + bb[i] * Math.sin(t * th)) / s);
};

/** 채널 → 시간 t 의 값 (선형) */
const sampler = (channel) => {
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

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const source = await io.read(sourcePath);
const document = await io.read(animsPath);
const root = document.getRoot();
const buffer = root.listBuffers()[0];
const idle = root.listAnimations().find((a) => a.getName() === "IdleArmed");
const nodesByName = new Map(root.listNodes().map((n) => [n.getName(), n]));

const mirrorName = (n) => (n.includes("_L_") ? n.replace("_L_", "_R_") : n.includes("_R_") ? n.replace("_R_", "_L_") : n);

for (const [name, cut] of Object.entries(CUTS)) {
  const clip = source.getRoot().listAnimations().find((a) => a.getName() === cut.from);
  if (!clip) throw new Error(`${cut.from} 이 없습니다`);
  // 원본 뼈별 표본 (뒤집기면 좌우 뼈를 바꿔 읽는다)
  const tracks = new Map();
  for (const channel of clip.listChannels()) {
    const bone = channel.getTargetNode().getName();
    tracks.set(`${cut.mirror ? mirrorName(bone) : bone}|${channel.getTargetPath()}`, sampler(channel));
  }
  const clipEnd = Math.max(...clip.listChannels().map((c) => c.getSampler().getInput().getArray().at(-1)));
  const start = cut.start;
  const end = Math.min(cut.end, clipEnd);
  const read = (bone, t) => {
    const s = tracks.get(`${bone}|rotation`);
    if (!s) return null;
    const q = s(t);
    // 좌우 뒤집기 — X 를 거울로: (x, y, z, w) → (x, -y, -z, w)
    return cut.mirror ? [q[0], -q[1], -q[2], q[3]] : q;
  };

  // 타격 순간 가슴이 앞(+Z)을 보게 — 골반 · 척추 · 가슴 회전을 이어 앞 방향을 재고 그만큼 되돌린다
  const chain = ["J_Bip_C_Hips", "J_Bip_C_Spine", "J_Bip_C_Chest", "J_Bip_C_UpperChest"];
  const facingAt = (t) => {
    let q = [0, 0, 0, 1];
    for (const bone of chain) q = mul(q, read(bone, t) ?? [0, 0, 0, 1]);
    const f = turn(q, [0, 0, 1]);
    return Math.atan2(f[0], f[2]);
  };
  const fix = yawQ(-facingAt(cut.impact ?? (start + end) / 2));

  // 지운다 (예전 것 · 여성형)
  for (const old of root.listAnimations().filter((a) => a.getName() === name || a.getName() === `${name}_F`)) {
    for (const ch of old.listChannels()) ch.dispose();
    for (const s of old.listSamplers()) s.dispose();
    old.dispose();
  }
  const animation = document.createAnimation(name);
  const times = [];
  for (let t = start; t < end; t += 1 / FPS) times.push(t);
  times.push(end);
  const timeAcc = document.createAccessor().setType("SCALAR").setArray(new Float32Array(times.map((t) => t - start))).setBuffer(buffer);
  for (const channel of idle.listChannels()) {
    const node = channel.getTargetNode();
    const bone = node.getName();
    const path = channel.getTargetPath();
    const base = Array.from(channel.getSampler().getOutput().getArray().slice(0, path === "rotation" ? 4 : 3));
    let values;
    if (path === "rotation" && tracks.has(`${bone}|rotation`) && !/Thumb|Index|Middle|Ring|Little/.test(bone)) {
      values = times.map((t) => {
        const q = read(bone, t);
        return bone === "J_Bip_C_Hips" ? mul(fix, q) : q;
      });
    } else if (path === "translation" && bone === "J_Bip_C_Hips" && tracks.has(`${bone}|translation`)) {
      const s = tracks.get(`${bone}|translation`);
      // 높이만 원본에서 (앞뒤 좌우는 게임 물리가 정한다)
      values = times.map((t) => [base[0], s(t)[1], base[2]]);
    } else values = times.map(() => base);
    const out = document
      .createAnimationSampler()
      .setInput(timeAcc)
      .setOutput(document.createAccessor().setType(path === "rotation" ? "VEC4" : "VEC3").setArray(new Float32Array(values.flat())).setBuffer(buffer))
      .setInterpolation("LINEAR");
    animation.addSampler(out);
    animation.addChannel(document.createAnimationChannel().setTargetNode(nodesByName.get(bone) ?? node).setTargetPath(path).setSampler(out));
  }
  console.log(`[bat-mocap] ${name} ← ${cut.from} ${start.toFixed(2)}~${end.toFixed(2)}s${cut.mirror ? " (좌우 반전)" : ""}`);
}

for (const accessor of root.listAccessors()) if (accessor.listParents().length <= 1) accessor.dispose();
await io.write(animsPath, document);
console.log(`[bat-mocap] → ${animsPath}`);
