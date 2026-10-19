// 동작 파일(player-anims.glb) 줄이기 — 구울 때 매 프레임 찍힌 키 가운데 앞뒤 키로 그어도 같은 것(1e-4 안)을 뺀다.
// 동작 수 · 채널 · 첫 키 · 끝 키는 그대로 (게임이 첫 키 손가락 · 프레임 번호를 쓴다). 2026-10-19: 11.8 MB → 4.6 MB, 키 68 만 → 13 만.
// 굽기(bake) 맨 끝에 한 번:  node scripts/slim-anims.mjs <입력.glb> <출력.glb>
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { dedup, prune, resample } from "@gltf-transform/functions";

const [src, out] = process.argv.slice(2);
/** 키를 뺄 때 허용하는 차이 — 1e-4 는 회전이 한 곳에서 1.8° 어긋나 1e-5 로 (손 · 무기 맞물림이 틀어지지 않게) */
const TOLERANCE = 1e-5;
if (!src || !out) {
  console.error("node scripts/slim-anims.mjs <입력.glb> <출력.glb>");
  process.exit(1);
}
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(src);
const root = doc.getRoot();
const count = () => ({
  anims: root.listAnimations().length,
  channels: root.listAnimations().reduce((sum, anim) => sum + anim.listChannels().length, 0),
  keys: root.listAnimations().reduce((sum, anim) => sum + anim.listSamplers().reduce((n, sampler) => n + (sampler.getInput()?.getCount() ?? 0), 0), 0),
});
const before = count();
await doc.transform(resample({ tolerance: TOLERANCE }), dedup(), prune());
const after = count();
if (before.anims !== after.anims || before.channels !== after.channels) throw new Error(`동작 · 채널 수가 바뀌었습니다 ${JSON.stringify({ before, after })}`);
await io.write(out, doc);
console.log(`[slim-anims] 동작 ${after.anims} · 채널 ${after.channels} · 키 ${before.keys} → ${after.keys}`);
