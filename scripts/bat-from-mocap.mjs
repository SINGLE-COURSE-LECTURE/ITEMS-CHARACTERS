/**
 * 방망이 콤보 — 실제 모션캡처를 잘라 core 동작 파일(player-anims.glb)의 ArmedAttack1 ~ 4 로 넣는다.
 *
 * 지금 쓰는 자르기 (전체 순서는 ITEMS-CHARACTERS/scripts/README 또는 메모리 bat-combo-pipeline):
 *   1 ~ 3 단 ← FIELD_INIT/blender/retarget_mixamo.py 출력의 MxTwoHandClubCombo (Mixamo 「Two Hand Club Combo」 두 손 몽둥이 연속 공격 5.45 초,
 *     타격 1.65 · 2.92 · 4.05 초 = 내려찍기 · 내려찍기 · 가로 베기). 이어 자르니 앞 단의 끝 = 다음 단의 시작
 *     BAT_CUTS='{"ArmedAttack1":{"from":"MxTwoHandClubCombo","start":1.0,"end":1.85,"keepFacing":true,"rise":1},"ArmedAttack2":{"from":"MxBackhand","start":0.35,"end":1.35,"keepFacing":true,"rise":1},"ArmedAttack3":{"from":"MxTwoHandClubCombo","start":3.25,"end":4.15,"keepFacing":true,"rise":1}}'
 *     (2026-10-27) 1 단 1.0~1.85(내려찍은 뒤 낮은 자세) · 2 단 Standing Melee Attack Backhand 0.35~1.35(retarget 에 그 fbx 도) · 3 단 ~4.15. two-hand-grip 은 1 · 3 · 4 단만(백핸드는 왼손을 놓는다)
 *   4 단 ← retarget_bat.py 출력의 BatSwingFull (CMU 124_07 홈런) — 아래 기본값
 *   맨손 네 방 ← retarget_mixamo.py 출력 — 원투는 「Jab Cross」(Boxing Jab Cross Long: 잽 0.40 · 스트레이트 0.66 초), 3 단은 「Hook」(Short Hook To The Head: 0.43 초),
 *     4 단은 「Cross Punch」(1.08 초, 게임이 앞으로 반 걸음 내딛게 한다 — index.ts lunge). 틀은 서기(BAT_BASE=Idle) · 손가락은 원본 주먹
 *     (2026-10-27) 1 단 잽은 Mixamo 「Lead Jab」(Long Head Jab) 0.25~0.72 초 — 「Jab Cross」 잽은 굽은 채, 「Punch Combo」 잽은 위로 치켜 올라갔다. retarget 에 「Lead Jab Long Head.fbx」 도 넣는다
 *     BAT_BASE=Idle BAT_CUTS='{"Attack1":{"from":"MxLeadJabLongHead","start":0.25,"end":0.72,"keepFacing":true,"rise":1,"fingers":"source"},"Attack2":{"from":"MxJabCross","start":0.5,"end":0.8,"keepFacing":true,"rise":1,"fingers":"source"},"Attack3":{"from":"MxHook","start":0.25,"end":0.62,"keepFacing":true,"rise":1,"fingers":"source"},"Attack4":{"from":"MxCrossPunch","start":0.78,"end":1.5,"keepFacing":true,"rise":1,"fingers":"source"}}'
 *   서기(IdleArmed)는 원래 칼 서기(UAL1 Sword_Idle) 그대로 — 사용자가 이 기본 자세를 원했다. 그 뒤 two-hand-grip.mjs(1~4 단만) → feminine-anims.mjs → grip-fist.mjs.
 *
 * 원본: FIELD_INIT/blender/retarget_bat.py 가 VRoid 뼈대로 옮긴 glb
 *   BatSwingFull  CMU 124_07 Baseball Swing — 두 번 휘두른다 (2.8 초 · 8.4 초 근처가 타격)
 *   BatChop       Quaternius UAL2 TreeChopping (CC0) — 두 손 내려찍기
 * 1단 = 내려찍기 · 2단 = 비스듬히 내려치기 · 3단 = 옆으로 크게 (UAL2, CC0) · 4단(마무리) = 홈런 스윙 (CMU).
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
/** 시험할 때는 환경 변수 BAT_CUTS(JSON)로 바꿔 넣는다 */
const CUTS = process.env.BAT_CUTS ? JSON.parse(process.env.BAT_CUTS) : {
  // 1단 — 어깨 뒤로 들었다가 앞 아래로 내려찍기 (UAL2 TreeChopping, CC0). 도끼 쥔 손이라 손목을 -90 도 돌려 방망이가 앞을 보게
  ArmedAttack1: { from: "BatChop", start: 0, end: Infinity, keepFacing: true, rise: 0.5, handOffset: [-90, 0, 0] },
  // 2단 — 위에서 비스듬히 내려치기 · 3단 — 들어 올렸다 옆으로 크게 (UAL2 Sword_Regular_A · B, CC0)
  // 원래 앉는 깊이(골반 0.4 ~ 0.5 m)가 너무 깊어 절반만 (rise 0.5)
  ArmedAttack2: { from: "BatSlashA", start: 0, end: Infinity, keepFacing: true, rise: 0.5 },
  ArmedAttack3: { from: "BatSlashB", start: 0, end: Infinity, keepFacing: true, rise: 0.5 },
  // 4단(마무리) — 홈런 스윙 (CMU 124_07 첫 스윙). 콘티 「끝」처럼 방망이를 목 뒤로 감아 넘긴 데서 끊는다 (3.23 초).
  // 그 뒤(3.75 초까지)는 타자가 방망이를 떨어뜨려 왼쪽 허리 아래로 처졌다. 타격 2.82 초 = 동작의 0.47 (게임 ARMED_IMPACT 0.5)
  ArmedAttack4: { from: "BatSwingFull", start: 2.45, end: 3.23, mirror: false, impact: 2.82, rise: 1 },
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
const axisQ = (x, y, z, d) => {
  const a = (d * Math.PI) / 360;
  return [x * Math.sin(a), y * Math.sin(a), z * Math.sin(a), Math.cos(a)];
};
/** [x, y, z] 도 → 회전 (X 다음 Y 다음 Z) */
const euler = ([x, y, z]) => mul(axisQ(0, 0, 1, z), mul(axisQ(0, 1, 0, y), axisQ(1, 0, 0, x)));
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
// 채널 틀 · 손가락 · 골반 기본 높이를 빌려 올 동작 — 무기는 IdleArmed, 맨손(BAT_BASE=Idle)은 서기
const idle = root.listAnimations().find((a) => a.getName() === (process.env.BAT_BASE ?? "IdleArmed"));
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
  // 이미 앞을 보고 치는 동작(전투 휘두르기)은 돌리지 않는다 (keepFacing)
  const fix = cut.keepFacing ? [0, 0, 0, 1] : yawQ(-facingAt(cut.impact ?? (start + end) / 2));

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
    // 손가락은 보통 서기의 쥔 손을 쓴다. fingers: "source" 면 원본 손가락 그대로 (주먹 콤보 — Mixamo 는 손가락까지 있다)
    if (path === "rotation" && tracks.has(`${bone}|rotation`) && (cut.fingers === "source" || !/Thumb|Index|Middle|Ring|Little/.test(bone))) {
      // 손목 덧돌리기 (handOffset [x, y, z] 도) — 도끼 · 칼 쥐는 손 방향을 방망이에 맞춘다
      const hand = cut.handOffset && bone === "J_Bip_R_Hand" ? euler(cut.handOffset) : null;
      values = times.map((t) => {
        const q = read(bone, t);
        if (bone === "J_Bip_C_Hips") return mul(fix, q);
        return hand ? mul(q, hand) : q;
      });
    } else if (path === "translation" && bone === "J_Bip_C_Hips" && tracks.has(`${bone}|translation`)) {
      const s = tracks.get(`${bone}|translation`);
      // 높이만 원본에서 (앞뒤 좌우는 게임 물리가 정한다)
      const y0 = s(start)[1];
      values = times.map((t) => [base[0], base[1] + (s(t)[1] - y0) * (cut.rise ?? 1), base[2]]);
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
