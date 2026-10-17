/**
 * 오른손 주먹 — 동작 파일의 모든 동작에서 오른손 손가락을 방망이 콤보(bat-ik-anims.mjs)와 같은 주먹으로 고정한다.
 *
 * 무기는 늘 오른손에 쥔다(equipment.ts). 그런데 서기 · 걷기 · 달리기 같은 동작은 원래 손을 펴고 있어서
 * 방망이를 들면 펴진 손 아래에 방망이가 떠 보였다. 오른손은 언제나 쥔 모양으로 둔다 (맨손일 때도 주먹이라 어색하지 않다).
 *
 * 쓰는 법 (3DLECTURE-GAMES 폴더에서): node ITEMS-CHARACTERS/scripts/grip-fist.mjs [동작 파일]
 * 동작을 다시 만들면 마지막에 돌린다 (feminine-anims.mjs 다음). 몇 번 돌려도 같다.
 */
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const animsPath = process.argv[2] ?? join(here, "..", "..", "core", "assets", "models", "player-anims.glb");
const axis = (x, y, z, deg) => {
  const a = (deg * Math.PI) / 360;
  return [x * Math.sin(a), y * Math.sin(a), z * Math.sin(a), Math.cos(a)];
};
/** bat-ik-anims.mjs 의 주먹과 같은 값 (오른손 — 손가락은 +Z 축으로 만다) */
const FIST = {};
for (const finger of ["Index", "Middle", "Ring", "Little"]) {
  FIST[`J_Bip_R_${finger}1`] = axis(0, 0, 1, 70);
  FIST[`J_Bip_R_${finger}2`] = axis(0, 0, 1, 95);
  FIST[`J_Bip_R_${finger}3`] = axis(0, 0, 1, 60);
}
FIST.J_Bip_R_Thumb2 = axis(0, 1, 0, -25);
FIST.J_Bip_R_Thumb3 = axis(0, 1, 0, -30);

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const document = await io.read(animsPath);
const root = document.getRoot();
const buffer = root.listBuffers()[0];
let changed = 0;
for (const animation of root.listAnimations()) {
  for (const channel of animation.listChannels()) {
    const fist = FIST[channel.getTargetNode().getName()];
    if (!fist || channel.getTargetPath() !== "rotation") continue;
    const old = channel.getSampler();
    const count = old.getInput().getCount();
    const values = new Float32Array(count * 4);
    for (let i = 0; i < count; i += 1) values.set(fist, i * 4);
    const sampler = document
      .createAnimationSampler()
      .setInput(old.getInput())
      .setOutput(document.createAccessor().setType("VEC4").setArray(values).setBuffer(buffer))
      .setInterpolation(old.getInterpolation());
    animation.addSampler(sampler);
    channel.setSampler(sampler);
    old.dispose();
    changed += 1;
  }
}
for (const accessor of root.listAccessors()) if (accessor.listParents().length <= 1) accessor.dispose();
await io.write(animsPath, document);
console.log(`[grip-fist] 오른손 손가락 채널 ${changed} 개를 주먹으로 → ${animsPath}`);
