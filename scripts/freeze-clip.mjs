/**
 * 동작을 첫 자세 하나로 굳힌다 — 모든 채널의 값을 첫 키 값으로.
 * 원본에서 아주 짧게 잘라 되풀이하는 서기(IdleSpear)는 처음과 끝이 조금 어긋나 되풀이할 때마다 창끝이 1 cm 씩 덜그럭거렸다.
 * 쓰는 법 (3DLECTURE-GAMES 폴더에서): node ITEMS-CHARACTERS/scripts/freeze-clip.mjs <동작 파일> <동작 이름> [...]
 */
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
const [path, ...names] = process.argv.slice(2);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(path);
const root = doc.getRoot();
const buffer = root.listBuffers()[0];
for (const name of names) {
  const anim = root.listAnimations().find((a) => a.getName() === name);
  if (!anim) { console.warn(`[freeze] ${name} 없음`); continue; }
  for (const ch of anim.listChannels()) {
    const old = ch.getSampler();
    const size = ch.getTargetPath() === "rotation" ? 4 : 3;
    const v = old.getOutput().getArray();
    const n = old.getInput().getCount();
    const out = new Float32Array(n * size);
    for (let i = 0; i < n; i++) for (let k = 0; k < size; k++) out[i * size + k] = v[k];
    const s = doc.createAnimationSampler().setInput(old.getInput()).setOutput(doc.createAccessor().setType(size === 4 ? "VEC4" : "VEC3").setArray(out).setBuffer(buffer)).setInterpolation(old.getInterpolation());
    anim.addSampler(s); ch.setSampler(s); old.dispose();
  }
  console.log(`[freeze] ${name} — 첫 자세로 굳힘`);
}
for (const accessor of root.listAccessors()) if (accessor.listParents().length <= 1) accessor.dispose();
await io.write(path, doc);
