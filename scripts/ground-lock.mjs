/**
 * 발 바닥 고정 — 동작 중 발(발목 · 발가락)이 서기(Idle)보다 바닥 아래로 내려가는 프레임만 허리를 그만큼 올린다.
 *
 * 무기 동작은 bat-from-mocap.mjs 가 허리 높이를 틀 동작(BAT_BASE, 보통 칼 서기 IdleArmed)에서 가져온다. 칼 서기는 무릎을 굽힌
 * 낮은 자세라, 다리를 펴고 던지는 동작(Mixamo Throw)을 얹으면 발이 바닥 아래로 17 cm 꺼졌다(2026-10-18 사용자).
 * 위로 뛰는 동작(점프 베기)은 그대로 둔다 — 꺼질 때만 올린다.
 *
 * 쓰는 법 (3DLECTURE-GAMES 폴더에서): node ITEMS-CHARACTERS/scripts/ground-lock.mjs <동작 파일> [--check] [동작 이름 정규식]
 *   --check 는 고치지 않고 동작마다 가장 깊이 꺼진 값만 보여 준다.
 * 순서: bat-from-mocap · two-hand-grip 다음, feminine-anims 앞.
 */
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";

const args = process.argv.slice(2);
const path = args.find((a) => !a.startsWith("--"));
const check = args.includes("--check");
const pattern = new RegExp(args.filter((a) => !a.startsWith("--"))[1] ?? "(Attack[0-9]|^SkillCast)");
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(path);
const root = doc.getRoot();
const buffer = root.listBuffers()[0];
const byName = new Map(root.listNodes().map((n) => [n.getName(), n]));
const FEET = ["J_Bip_L_Foot", "J_Bip_R_Foot", "J_Bip_L_ToeBase", "J_Bip_R_ToeBase"];
const HIPS = "J_Bip_C_Hips";

const mul = (a, b) => [
  a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
  a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
  a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
  a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
];
const rot = (q, v) => { const p = mul(mul(q, [v[0], v[1], v[2], 0]), [-q[0], -q[1], -q[2], q[3]]); return [p[0], p[1], p[2]]; };
const slerpish = (a, b, f) => { let d = 0; for (let k = 0; k < 4; k++) d += a[k] * b[k]; const s = d < 0 ? -1 : 1; const r = a.map((x, k) => x + (s * b[k] - x) * f); const l = Math.hypot(...r); return r.map((x) => x / l); };
const sampler = (ch) => {
  const t = ch.getSampler().getInput().getArray(), v = ch.getSampler().getOutput().getArray();
  const size = ch.getTargetPath() === "rotation" ? 4 : 3;
  return (x) => {
    let i = 0; while (i < t.length - 1 && t[i + 1] < x) i++;
    if (i >= t.length - 1) return Array.from(v.slice((t.length - 1) * size, t.length * size));
    const f = Math.min(1, Math.max(0, (x - t[i]) / ((t[i + 1] - t[i]) || 1)));
    const a = Array.from(v.slice(i * size, i * size + size)), b = Array.from(v.slice((i + 1) * size, (i + 2) * size));
    return size === 4 ? slerpish(a, b, f) : a.map((q, k) => q + (b[k] - q) * f);
  };
};
const chain = (leaf) => { const c = []; for (let n = byName.get(leaf); n; n = n.getParentNode?.()) c.unshift(n); return c; };
const tracksOf = (anim) => { const m = new Map(); for (const ch of anim.listChannels()) m.set(`${ch.getTargetNode().getName()}|${ch.getTargetPath()}`, sampler(ch)); return m; };
const footLow = (tr, t, hipsLift = 0) => {
  let low = Infinity;
  for (const leaf of FEET) {
    let p = [0, 0, 0], q = [0, 0, 0, 1];
    for (const n of chain(leaf)) {
      let tl = tr.get(`${n.getName()}|translation`)?.(t) ?? n.getTranslation();
      if (n.getName() === HIPS) tl = [tl[0], tl[1] + hipsLift, tl[2]];
      const rl = tr.get(`${n.getName()}|rotation`)?.(t) ?? n.getRotation();
      const s = n.getScale();
      const w = rot(q, [tl[0], tl[1], tl[2]]);
      p = [p[0] + w[0], p[1] + w[1], p[2] + w[2]];
      q = mul(q, rl);
      void s;
    }
    low = Math.min(low, p[1]);
  }
  return low;
};

const idle = root.listAnimations().find((a) => a.getName() === "Idle");
if (!idle) throw new Error("Idle 동작이 없습니다");
const ref = footLow(tracksOf(idle), 0);
// 허리 국소 y 1 이 세상에서 얼마나 올라가나 (부모 배율)
const probe = tracksOf(idle);
const k = (footLow(probe, 0, 0.1) - ref) / 0.1 || 1;

let fixed = 0;
for (const anim of root.listAnimations()) {
  const name = anim.getName();
  if (/_F$/.test(name) || !pattern.test(name)) continue;
  const tr = tracksOf(anim);
  const hipsCh = anim.listChannels().find((c) => c.getTargetNode().getName() === HIPS && c.getTargetPath() === "translation");
  const times = hipsCh ? Array.from(hipsCh.getSampler().getInput().getArray()) : [];
  let worst = 0;
  const lifts = times.map((t) => { const dip = ref - footLow(tr, t); worst = Math.max(worst, dip); return dip > 0.003 ? dip / k : 0; });
  if (check || !hipsCh) { if (worst > 0.01) console.log(`[ground] ${name} 최대 ${(worst * 100).toFixed(1)} cm 꺼짐${hipsCh ? "" : " (허리 위치 채널 없음)"}`); continue; }
  if (worst <= 0.01) continue;
  const old = hipsCh.getSampler();
  const v = old.getOutput().getArray();
  const out = new Float32Array(v.length);
  for (let i = 0; i < times.length; i++) { out[i * 3] = v[i * 3]; out[i * 3 + 1] = v[i * 3 + 1] + lifts[i]; out[i * 3 + 2] = v[i * 3 + 2]; }
  const s = doc.createAnimationSampler().setInput(old.getInput()).setOutput(doc.createAccessor().setType("VEC3").setArray(out).setBuffer(buffer)).setInterpolation(old.getInterpolation());
  anim.addSampler(s); hipsCh.setSampler(s); old.dispose();
  fixed += 1;
  console.log(`[ground] ${name} 최대 ${(worst * 100).toFixed(1)} cm 꺼짐 → 올림`);
}
if (!check) {
  for (const accessor of root.listAccessors()) if (accessor.listParents().length <= 1) accessor.dispose();
  await io.write(path, doc);
  console.log(`[ground] ${fixed} 개 동작을 고쳤습니다 → ${path}`);
}
