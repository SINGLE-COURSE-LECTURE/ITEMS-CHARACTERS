// 동작 파일(player-anims.glb) 튀는 회전 키 고치기 — 몸이 한 바퀴 도는 동작(대검 · 칼 · 창 마무리, 도끼 3 단)에서
// 엉덩이가 180° 를 지나는 프레임 하나가 정면(회전 0)으로 찍혀, 게임에서 그 순간 몸이 한 번 뚝 끊겨 보였다 (2026-10-26 사용자: 「대검 4 번째 콤보가 끊긴다」).
// 앞 · 뒤 키는 서로 가까운데 가운데 키만 둘 다에서 크게 벗어나면, 앞 · 뒤 키 사이를 시간 비율로 이은 값(slerp)으로 바꾼다.
// 굽기(bake) 끝, slim-anims 앞이나 뒤에 한 번:  node scripts/fix-flip-keys.mjs <입력.glb> <출력.glb>   (--check 는 찾기만)
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";

const args = process.argv.slice(2);
const check = args.includes("--check");
const [src, out] = args.filter((a) => !a.startsWith("--"));
if (!src || (!check && !out)) {
  console.error("node scripts/fix-flip-keys.mjs <입력.glb> <출력.glb>  |  --check <입력.glb>");
  process.exit(1);
}
/** 가운데 키가 앞 · 뒤 키 모두에서 이만큼(°) 넘게 벗어나면 튄 키로 본다 */
const JUMP = 40;

const angle = (a, b) => 2 * Math.acos(Math.min(1, Math.abs(a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3]))) * (180 / Math.PI);
const slerp = (a, b, t) => {
  let dot = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
  const s = dot < 0 ? -1 : 1;
  dot *= s;
  const th = Math.acos(Math.min(1, dot));
  const [wa, wb] = th < 1e-6 ? [1 - t, t] : [Math.sin((1 - t) * th) / Math.sin(th), Math.sin(t * th) / Math.sin(th)];
  const q = a.map((x, i) => wa * x + wb * s * b[i]);
  const n = Math.hypot(...q);
  return q.map((x) => x / n);
};

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(src);
let fixed = 0;
for (const anim of doc.getRoot().listAnimations()) {
  for (const channel of anim.listChannels()) {
    if (channel.getTargetPath() !== "rotation") continue;
    const sampler = channel.getSampler();
    const times = sampler.getInput().getArray();
    const values = sampler.getOutput().getArray().slice();
    let changed = false;
    for (let i = 1; i < times.length - 1; i += 1) {
      const prev = Array.from(values.slice((i - 1) * 4, i * 4));
      const cur = Array.from(values.slice(i * 4, i * 4 + 4));
      const next = Array.from(values.slice((i + 1) * 4, i * 4 + 8));
      const toCur = angle(prev, cur);
      const toNext = angle(cur, next);
      const across = angle(prev, next);
      if (toCur <= JUMP || toNext <= JUMP || across >= Math.min(toCur, toNext) * 0.6) continue;
      const t = (times[i] - times[i - 1]) / (times[i + 1] - times[i - 1]);
      const q = slerp(prev, next, t);
      console.log(`[fix-flip-keys] ${anim.getName()} ${channel.getTargetNode()?.getName()} ${times[i].toFixed(3)}초 — ${toCur.toFixed(0)}° 튐 → 앞뒤 사이(${across.toFixed(0)}°)로`);
      fixed += 1;
      if (!check) {
        values.set(q, i * 4);
        changed = true;
      }
    }
    if (changed) sampler.getOutput().setArray(values);
  }
}
if (!check) await io.write(out, doc);
console.log(`[fix-flip-keys] 튄 키 ${fixed} 개${check ? " (찾기만)" : " 고침"}`);
