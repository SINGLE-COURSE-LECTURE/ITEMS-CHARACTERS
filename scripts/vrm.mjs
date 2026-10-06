/**
 * VRM(= glTF 바이너리) 읽기 — 꾸러미 없이.
 * GLB 는 머리 12 바이트 + JSON 덩이 + BIN 덩이. VRM 정보는 JSON 의 extensions.VRMC_vrm(1.0) · VRM(0.x) 에 있다.
 */
import { readFileSync } from "node:fs";

const GLB_MAGIC = 0x46546c67; // "glTF"
const CHUNK_JSON = 0x4e4f534a;
const CHUNK_BIN = 0x004e4942;

export function readGlb(path) {
  const buf = readFileSync(path);
  if (buf.readUInt32LE(0) !== GLB_MAGIC) throw new Error("glTF 바이너리(GLB)가 아닙니다");
  let at = 12;
  let json = null;
  let bin = null;
  while (at < buf.length) {
    const length = buf.readUInt32LE(at);
    const type = buf.readUInt32LE(at + 4);
    const body = buf.subarray(at + 8, at + 8 + length);
    if (type === CHUNK_JSON) json = JSON.parse(body.toString("utf8"));
    else if (type === CHUNK_BIN) bin = body;
    at += 8 + length;
  }
  if (!json) throw new Error("JSON 덩이가 없습니다");
  return { json, bin, bytes: buf.length };
}

/** VRM 1.0 이면 VRMC_vrm, 0.x 면 VRM */
export function vrmInfo(json) {
  const v1 = json.extensions?.VRMC_vrm;
  if (v1) {
    return {
      version: "1.0",
      meta: v1.meta ?? {},
      bones: Object.keys(v1.humanoid?.humanBones ?? {}),
      thumbnailImage: v1.meta?.thumbnailImage,
    };
  }
  const v0 = json.extensions?.VRM;
  if (v0) {
    const meta = v0.meta ?? {};
    const texture = meta.texture !== undefined ? json.textures?.[meta.texture] : undefined;
    return {
      version: "0.x",
      meta: { name: meta.title, authors: meta.author ? [meta.author] : [], allowRedistribution: meta.licenseName === "CC0", licenseName: meta.licenseName },
      bones: (v0.humanoid?.humanBones ?? []).map((bone) => bone.bone),
      thumbnailImage: texture?.source,
    };
  }
  return null;
}

/** 이미지 하나의 바이트 (bufferView 로 박혀 있는 것) */
export function imageBytes(glb, index) {
  const image = glb.json.images?.[index];
  if (!image || image.bufferView === undefined || !glb.bin) return null;
  const view = glb.json.bufferViews[image.bufferView];
  return { bytes: glb.bin.subarray(view.byteOffset ?? 0, (view.byteOffset ?? 0) + view.byteLength), mimeType: image.mimeType ?? "image/png" };
}

/** VRM 1.0 필수 뼈대 — 이것이 다 있어야 게임 동작(걷기 · 공격)이 붙는다 */
export const REQUIRED_BONES = [
  "hips", "spine", "head",
  "leftUpperArm", "leftLowerArm", "leftHand", "rightUpperArm", "rightLowerArm", "rightHand",
  "leftUpperLeg", "leftLowerLeg", "leftFoot", "rightUpperLeg", "rightLowerLeg", "rightFoot",
];
