/**
 * 게임용으로 줄이기 — model.vrm → game.glb.
 *
 * VRoid 의 텍스처는 2048 px 이 여럿이라 파일 대부분이 그림이다. 1024 px 로 줄이고, 쓰지 않는 것 · 겹친 것을 걷어 낸다.
 * 메시 압축(Draco · meshopt)은 하지 않는다 — 브라우저가 따로 해독기를 받아야 해서.
 * VRM 확장(VRMC_*)은 떨어진다: 게임은 VRM 정보를 읽지 않고 뼈 이름(J_Bip_*)과 재질 이름(_SKIN · _HAIR …)만 본다.
 * 원본(model.vrm)은 그대로 두므로 VRM 이 필요하면 원본을 쓴다.
 * 기준(reference, VRoid 1.0 캐릭터 하나)이 아닌 모델은 모두 기준 뼈대로 맞춘다 (retarget.mjs) — 이름 · 쉬는 자세 뼈 방향 · 앞 방향 · 크기.
 */
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { dedup, prune, textureCompress } from "@gltf-transform/functions";
import sharp from "sharp";

import { resolve } from "node:path";

import { humanoidOf, toVroidRig } from "./retarget.mjs";
import { readGlb } from "./vrm.mjs";

/** 게임용 텍스처의 긴 변 */
export const TEXTURE_SIZE = 1024;

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);

/** 돌려주는 것: 뼈대를 바꿨으면 그 결과({ bones, scale, unmatched }), 이미 VRoid 면 null */
export async function optimizeModel(input, output, reference) {
  const document = await io.read(input);
  const json = readGlb(input).json;
  let rig = null;
  // 기준 캐릭터가 아니면 모두 기준 뼈대로 맞춘다. 뼈 이름이 VRoid 여도 쉬는 자세 뼈 방향이 다를 수 있다 —
  // pixiv 트위스트 샘플은 머리 뼈가 90° 돌아가 있어 목이 꺾이고 모자가 옆으로 붙었다. 이미 같은 VRoid 면 거의 그대로다
  if (resolve(input) !== resolve(reference ?? "")) {
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
