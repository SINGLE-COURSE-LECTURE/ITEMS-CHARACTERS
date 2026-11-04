/**
 * 칼 서기(IdleArmed) 하체 고정 — 가만히 있어도 발이 좌우로 약 6 cm 미끄러졌다 (2026-11-04 사용자, foot_drift 로 잼).
 * 엉덩이 · 다리 · 발 키를 첫 프레임 값으로 묶는다. 자세는 그대로이고 윗몸 · 팔의 움직임은 남는다.
 *
 * 쓰는 법: node ITEMS-CHARACTERS/scripts/pin-armed-idle.mjs [동작 파일]
 * 칼 서기를 다시 구우면 이것도 다시 돌린다. 몇 번 돌려도 같다. 여성 서기는 female-armed-idle.mjs 가 맡는다.
 */
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const file = process.argv[2] ?? join(here, "..", "..", "core", "assets", "models", "player-anims.glb");
const LOWER = /J_Bip_C_Hips|_(UpperLeg|LowerLeg|Foot|ToeBase)$/;

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const document = await io.read(file);
const root = document.getRoot();
const buffer = root.listBuffers()[0];
const clip = root.listAnimations().find((animation) => animation.getName() === "IdleArmed");
if (!clip) throw new Error("IdleArmed 동작이 없습니다");

let pinned = 0;
for (const channel of clip.listChannels()) {
  if (!LOWER.test(channel.getTargetNode()?.getName() ?? "")) continue;
  const sampler = channel.getSampler();
  const output = sampler.getOutput();
  const size = output.getElementSize();
  const first = output.getElement(0, []);
  const values = new Float32Array(output.getCount() * size);
  for (let i = 0; i < output.getCount(); i += 1) values.set(first, i * size);
  // 다른 동작과 나눠 쓸 수 있어 새 값으로 바꿔 끼운다
  sampler.setOutput(document.createAccessor().setType(output.getType()).setArray(values).setBuffer(buffer));
  pinned += 1;
}
await io.write(file, document);
console.log(`[pin-armed-idle] IdleArmed 하체 ${pinned} 채널 고정 · 저장 ${file}`);
