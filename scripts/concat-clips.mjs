/**
 * 동작 여러 조각을 이어 새 동작 하나로 — 끝 자세와 다음 시작 자세가 같은 한 묶음 동작(Mixamo 활 묶음: 당기기 → 오래 당기기 → 놓기)을 잇는다.
 * 이음새가 어긋나면 튀니, 끝과 시작이 같은 조각만 잇는다 (_bow 확인: Standing Draw Arrow 끝 = Aim Recoil 시작 = Aim Overdraw 시작).
 *
 * 쓰는 법 (3DLECTURE-GAMES 폴더에서):
 *   node ITEMS-CHARACTERS/scripts/concat-clips.mjs <원본.glb> <출력.glb> '<JSON>'
 *   JSON = { "새이름": [["원본 동작", 시작초, 끝초], …], … } — 60 fps 로 다시 뽑는다. 출력에는 새 동작만 남긴다
 *   (이어 slim-anims.mjs 로 키를 줄이고 copy-clip.mjs 로 player-anims.glb 에 옮겨 넣는다)
 *
 * 활 (2026-11-02, FIELD_INIT/blender/retarget_mixamo.py 출력 — Standing Draw Arrow · Aim Recoil · Aim Overdraw):
 *   '{"BowAttack1":[["MxStandingDrawArrow",0.35,1.05],["MxStandingAimRecoil",0,0.45]],
 *     "LongbowAttack1":[["MxStandingDrawArrow",0.35,1.05],["MxStandingAimOverdraw",0,1.6],["MxStandingAimRecoil",0,0.6]]}'
 */
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";

const [sourcePath, outPath, specText] = process.argv.slice(2);
if (!sourcePath || !outPath || !specText) throw new Error("쓰는 법: concat-clips.mjs <원본.glb> <출력.glb> '<JSON>'");
const spec = JSON.parse(specText);
const FPS = 60;

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(sourcePath);
const root = doc.getRoot();
const buffer = root.listBuffers()[0];

/** 샘플러를 t 초에서 읽는다 (선형 · 회전은 짧은 쪽 구면 보간) */
function sample(sampler, t) {
  const times = sampler.getInput().getArray();
  const values = sampler.getOutput().getArray();
  const size = values.length / times.length;
  let i = 0;
  while (i < times.length - 1 && times[i + 1] < t) i += 1;
  const j = Math.min(times.length - 1, i + 1);
  const span = times[j] - times[i];
  const k = span > 0 ? Math.max(0, Math.min(1, (t - times[i]) / span)) : 0;
  const a = Array.from(values.slice(i * size, i * size + size));
  const b = Array.from(values.slice(j * size, j * size + size));
  if (size === 4) {
    const d = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
    const bb = d < 0 ? b.map((v) => -v) : b;
    const out = a.map((v, n) => v + (bb[n] - v) * k);
    const len = Math.hypot(...out);
    return out.map((v) => v / len);
  }
  return a.map((v, n) => v + (b[n] - v) * k);
}

const made = [];
for (const [name, pieces] of Object.entries(spec)) {
  const clips = pieces.map(([clip, start, end]) => {
    const animation = root.listAnimations().find((a) => a.getName() === clip);
    if (!animation) throw new Error(`${sourcePath} 에 ${clip} 동작이 없습니다`);
    const channels = new Map();
    for (const channel of animation.listChannels()) channels.set(`${channel.getTargetNode().getName()}|${channel.getTargetPath()}`, channel);
    return { channels, start, end, length: end - start };
  });
  // 어느 조각에든 나오는 뼈 · 성분
  const keys = new Map();
  for (const clip of clips) for (const [key, channel] of clip.channels) keys.set(key, channel);
  const total = clips.reduce((sum, clip) => sum + clip.length, 0);
  const frames = Math.round(total * FPS) + 1;
  const times = new Float32Array(frames);
  for (let f = 0; f < frames; f += 1) times[f] = f / FPS;
  const input = doc.createAccessor(`${name}-time`).setType("SCALAR").setArray(times).setBuffer(buffer);
  const animation = doc.createAnimation(name);
  for (const [key, any] of keys) {
    const node = any.getTargetNode();
    const path = any.getTargetPath();
    const rest = path === "rotation" ? node.getRotation() : path === "translation" ? node.getTranslation() : node.getScale();
    const size = rest.length;
    const out = new Float32Array(frames * size);
    for (let f = 0; f < frames; f += 1) {
      // 이 시각이 속한 조각
      let t = times[f];
      let clip = clips[clips.length - 1];
      for (const piece of clips) {
        if (t <= piece.length + 1e-6) {
          clip = piece;
          break;
        }
        t -= piece.length;
      }
      const channel = clip.channels.get(key);
      const value = channel ? sample(channel.getSampler(), clip.start + Math.min(t, clip.length)) : rest;
      out.set(value, f * size);
    }
    const output = doc.createAccessor(`${name}-${key}`).setType(size === 4 ? "VEC4" : "VEC3").setArray(out).setBuffer(buffer);
    const sampler = doc.createAnimationSampler().setInput(input).setOutput(output).setInterpolation("LINEAR");
    animation.addSampler(sampler).addChannel(doc.createAnimationChannel().setTargetNode(node).setTargetPath(path).setSampler(sampler));
  }
  made.push(name);
  console.log(`[concat] ${name} — ${pieces.length} 조각 · ${total.toFixed(2)} 초 · ${keys.size} 채널`);
}
// 새 동작만 남긴다
for (const animation of root.listAnimations()) {
  if (made.includes(animation.getName())) continue;
  for (const channel of animation.listChannels()) channel.dispose();
  for (const sampler of animation.listSamplers()) sampler.dispose();
  animation.dispose();
}
for (const accessor of root.listAccessors()) if (accessor.listParents().length <= 1) accessor.dispose();
await io.write(outPath, doc);
console.log(`[concat] 저장: ${outPath}`);
