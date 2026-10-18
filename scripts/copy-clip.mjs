/**
 * 동작 하나를 다른 동작 파일에서 가져와 바꿔 넣는다 — 같은 뼈 이름을 쓰는 파일끼리.
 *
 * 쓰는 법: node ITEMS-CHARACTERS/scripts/copy-clip.mjs <가져올 파일> <넣을 파일> <동작 이름 | 원본이름=새이름> [...]
 * 넣을 파일에 같은 이름의 동작이 있으면 지우고 넣는다. 「_F」 짝은 feminine-anims.mjs 가 다시 만드니 여기서 지우기만 한다.
 */
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";

const [sourcePath, targetPath, ...names] = process.argv.slice(2);
if (!sourcePath || !targetPath || names.length === 0) throw new Error("쓰는 법: copy-clip.mjs <가져올 파일> <넣을 파일> <동작 이름>…");
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const source = await io.read(sourcePath);
const target = await io.read(targetPath);
const root = target.getRoot();
const buffer = root.listBuffers()[0];
const nodes = new Map(root.listNodes().map((node) => [node.getName(), node]));
for (const spec of names) {
  const [fromName, name] = spec.includes("=") ? spec.split("=") : [spec, spec];
  const from = source.getRoot().listAnimations().find((a) => a.getName() === fromName);
  if (!from) throw new Error(`${sourcePath} 에 ${fromName} 동작이 없습니다`);
  for (const old of root.listAnimations().filter((a) => a.getName() === name || a.getName() === `${name}_F`)) {
    for (const channel of old.listChannels()) channel.dispose();
    for (const sampler of old.listSamplers()) sampler.dispose();
    old.dispose();
  }
  const animation = target.createAnimation(name);
  let count = 0;
  for (const channel of from.listChannels()) {
    const node = nodes.get(channel.getTargetNode().getName());
    if (!node) continue;
    const old = channel.getSampler();
    const copy = (accessor) => target.createAccessor().setType(accessor.getType()).setArray(accessor.getArray().slice()).setBuffer(buffer);
    const sampler = target.createAnimationSampler().setInput(copy(old.getInput())).setOutput(copy(old.getOutput())).setInterpolation(old.getInterpolation());
    animation.addSampler(sampler);
    animation.addChannel(target.createAnimationChannel().setTargetNode(node).setTargetPath(channel.getTargetPath()).setSampler(sampler));
    count += 1;
  }
  console.log(`[copy-clip] ${fromName}${fromName === name ? "" : ` → ${name}`} — 채널 ${count} 개`);
}
for (const accessor of root.listAccessors()) if (accessor.listParents().length <= 1) accessor.dispose();
await io.write(targetPath, target);
console.log(`[copy-clip] → ${targetPath}`);
