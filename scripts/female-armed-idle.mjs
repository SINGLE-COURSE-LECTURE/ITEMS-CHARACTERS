/**
 * 여성형 무기 서기 — IdleArmed_F 를 「몸은 여성 기본 서기(Idle_F), 무기 든 오른팔만 칼 서기(IdleArmed)」 로 짓는다.
 *
 * 칼 서기는 무릎을 굽히고 다리를 벌린 싸움 자세다. feminine-anims 로 다리를 모으면 무릎이 붙고 안짱다리가 됐다 (2026-11-04).
 * 새로 자세를 만들지 않고 있는 동작 둘을 뼈 단위로 잇는다. 오른팔 쪽 키는 Idle_F 길이에 맞춰 늘이거나 줄인다 (되풀이할 때 튀지 않게).
 *
 * 쓰는 법: node ITEMS-CHARACTERS/scripts/female-armed-idle.mjs [동작 파일]
 * feminine-anims 로 IdleArmed 를 다시 구우면 이것도 다시 돌린다. 몇 번 돌려도 같다.
 */
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const file = process.argv[2] ?? join(here, "..", "..", "core", "assets", "models", "player-anims.glb");
/** 무기 든 오른팔 — 어깨부터 손가락까지 */
const ARMED_BONE = /_R_(Shoulder|UpperArm|LowerArm|Hand|Thumb|Index|Middle|Ring|Little|Elbow)/;

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const document = await io.read(file);
const root = document.getRoot();
const buffer = root.listBuffers()[0];
const find = (name) => root.listAnimations().find((animation) => animation.getName() === name);
const body = find("Idle_F");
const armed = find("IdleArmed");
if (!body || !armed) throw new Error("Idle_F · IdleArmed 동작이 없습니다");

const old = find("IdleArmed_F");
if (old) {
  const samplers = old.listSamplers();
  for (const channel of old.listChannels()) channel.dispose();
  for (const sampler of samplers) sampler.dispose();
  old.dispose();
}

const duration = (animation) => {
  let longest = 0;
  for (const sampler of animation.listSamplers()) longest = Math.max(longest, sampler.getInput().getMax([])[0]);
  return longest;
};
const bodyLength = duration(body);
const armedLength = duration(armed);
const scale = armedLength > 0 ? bodyLength / armedLength : 1;

const result = document.createAnimation("IdleArmed_F");
const add = (channel, input) => {
  const sampler = channel.getSampler();
  const copy = document.createAnimationSampler().setInput(input ?? sampler.getInput()).setOutput(sampler.getOutput()).setInterpolation(sampler.getInterpolation());
  result.addSampler(copy);
  result.addChannel(document.createAnimationChannel().setTargetNode(channel.getTargetNode()).setTargetPath(channel.getTargetPath()).setSampler(copy));
};

const scaled = new Map();
const scaledInput = (input) => {
  if (!scaled.has(input)) {
    const times = new Float32Array(input.getCount());
    for (let i = 0; i < times.length; i += 1) times[i] = input.getScalar(i) * scale;
    scaled.set(input, document.createAccessor().setType("SCALAR").setArray(times).setBuffer(buffer));
  }
  return scaled.get(input);
};

let fromBody = 0;
let fromArmed = 0;
for (const channel of body.listChannels()) {
  if (ARMED_BONE.test(channel.getTargetNode()?.getName() ?? "")) continue;
  add(channel);
  fromBody += 1;
}
for (const channel of armed.listChannels()) {
  if (!ARMED_BONE.test(channel.getTargetNode()?.getName() ?? "")) continue;
  add(channel, scaledInput(channel.getSampler().getInput()));
  fromArmed += 1;
}

await io.write(file, document);
console.log(`[female-armed-idle] IdleArmed_F — 몸 ${fromBody} 채널(Idle_F ${bodyLength.toFixed(2)} 초) + 오른팔 ${fromArmed} 채널(IdleArmed ${armedLength.toFixed(2)} 초) · 저장 ${file}`);
