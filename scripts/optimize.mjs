/**
 * 게임용으로 줄이기 — model.vrm → game.glb.
 *
 * VRoid 의 텍스처는 2048 px 이 여럿이라 파일 대부분이 그림이다. 1024 px 로 줄이고, 쓰지 않는 것 · 겹친 것을 걷어 낸다.
 * 메시 압축(Draco · meshopt)은 하지 않는다 — 브라우저가 따로 해독기를 받아야 해서.
 * VRM 확장(VRMC_*)은 떨어진다: 게임은 VRM 정보를 읽지 않고 뼈 이름(J_Bip_*)과 재질 이름(_SKIN · _HAIR …)만 본다.
 * 원본(model.vrm)은 그대로 두므로 VRM 이 필요하면 원본을 쓴다.
 * VRoid 1.0 이 아닌 모델(다른 뼈대 · VRoid 0.x)은 먼저 VRoid 1.0 뼈대로 바꾼다 (retarget.mjs) — 기준은 reference(VRoid 1.0 캐릭터 하나).
 */
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { dedup, prune, textureCompress } from "@gltf-transform/functions";
import sharp from "sharp";

import { humanoidOf, isVroidRig, toVroidRig } from "./retarget.mjs";
import { readGlb } from "./vrm.mjs";

/** 게임용 텍스처의 긴 변 */
export const TEXTURE_SIZE = 1024;

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);

/** 돌려주는 것: 뼈대를 바꿨으면 그 결과({ bones, scale, unmatched }), 이미 VRoid 면 null */
export async function optimizeModel(input, output, reference) {
  const document = await io.read(input);
  const json = readGlb(input).json;
  let rig = null;
  // VRoid 1.0 이 아니면 바꾼다 — VRoid 가 아닌 뼈대, 또는 VRoid 라도 VRM 0.x(뒤를 보고 서고 쉬는 자세 뼈 방향이 다르다)
  if (!isVroidRig(json) || humanoidOf(json)?.v0) {
    if (!reference) throw new Error("VRoid 가 아닌 모델인데 기준 VRoid 가 없습니다");
    rig = toVroidRig(document, json, await io.read(reference), readGlb(reference).json);
    // VRM 0.x 의 눈동자(EyeIris)는 MASK 라 흰자와 같은 단계 · 같은 깊이에 그려져 흰자에 가려진다(흰 눈).
    // VRoid 1.0 처럼 BLEND 로 — 불투명을 다 그린 뒤에 위에 얹힌다
    if (humanoidOf(json)?.v0) {
      for (const material of document.getRoot().listMaterials()) {
        if (/EyeIris/.test(material.getName()) && material.getAlphaMode() !== "BLEND") material.setAlphaMode("BLEND");
      }
    }
  }
  await document.transform(
    dedup(),
    // 빈 끝 뼈도 남긴다 — 게임이 이름으로 찾는 뼈(눈 J_Adj_*_FaceEye 등)가 모델마다 끝 뼈일 수 있다
    prune({ keepLeaves: true }),
    // 투명(머리카락 끝 · 눈)이 있어 PNG 그대로 — 크기만 줄인다
    textureCompress({ encoder: sharp, resize: [TEXTURE_SIZE, TEXTURE_SIZE], targetFormat: "png" }),
  );
  await io.write(output, document);
  return rig;
}

/** 고르기 화면 얼굴 — 256 px 이면 충분하다 (VRM 썸네일은 2048 px) */
export async function optimizeThumb(bytes, output) {
  await sharp(bytes).resize(256, 256, { fit: "cover" }).png({ compressionLevel: 9 }).toFile(output);
}
