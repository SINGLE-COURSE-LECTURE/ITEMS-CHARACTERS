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

import { bakeConstraints, humanoidOf, toVroidRig } from "./retarget.mjs";
import { apply, meshToWorld, shapeBody, worldOf } from "./shape.mjs";
import { readGlb } from "./vrm.mjs";

/** 게임용 텍스처의 긴 변 */
export const TEXTURE_SIZE = 1024;

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);

/** 돌려주는 것: 뼈대를 바꿨으면 그 결과({ bones, scale, unmatched }), 이미 VRoid 면 null */
/**
 * 옷 벗기기 (meta.json "strip": true) — 몸 구조를 보려는 실험용.
 * VRoid 옷은 두 가지다: 따로 붙은 옷 메시(재질 이름 끝이 _CLOTH — 원피스 · 신발 …)는 뺀다.
 * 몸 피부 그림에 칠해진 옷(비타의 바디슈트 · 타이츠 무늬)은 메시가 아니라서, 몸 피부(Body_*_SKIN) 재질의 그림을 떼고 단색 살색으로 — 마네킹처럼.
 * 얼굴 피부(Face_*_SKIN)는 그대로. 몸 피부는 조명을 받게 바꾼다(굴곡이 보이게).
 */
function stripClothes(document) {
  let removed = 0;
  for (const mesh of document.getRoot().listMeshes()) {
    for (const primitive of mesh.listPrimitives()) {
      if (!/_CLOTH/i.test(primitive.getMaterial()?.getName() ?? "")) continue;
      mesh.removePrimitive(primitive);
      primitive.dispose();
      removed += 1;
    }
  }
  for (const material of document.getRoot().listMaterials()) {
    if (!/Body_\d+_SKIN/.test(material.getName())) continue;
    material.setBaseColorTexture(null);
    // 살색 (sRGB 250 · 222 · 206 → 선형)
    material.setBaseColorFactor([0.955, 0.73, 0.617, 1]);
    // VRoid 재질은 조명을 받지 않는다(KHR_materials_unlit) — 단색이면 굴곡이 하나도 안 보여서 몸 피부만 조명을 받게
    material.setExtension("KHR_materials_unlit", null);
    material.setMetallicFactor(0);
    material.setRoughnessFactor(0.75);
  }
  return removed;
}

/**
 * 원피스 수영복 (meta.json "swimsuit": { "color": [r, g, b] }) — 옷을 벗긴(strip) 몸에 입힌다.
 * VRoid 에 수영복 옷 메시가 없어서 몸 피부 그림(텍스처)을 새로 그린다 — 그림의 칸(텍셀)마다 몸 위의 실제 자리를
 * 삼각형 무게중심으로 되짚어 수영복이 덮는 곳이면 수영복 색, 아니면 살색. 처음에 면 단위로 칠했더니 다리 라인 · 어깨끈이 톱니처럼 각졌다.
 *   몸판   겨드랑이 아래 ~ 사타구니
 *   다리   하이컷 — 사타구니에서 골반 옆(엉덩이 뼈 높이)으로 비스듬히
 *   목둘레 앞은 윗가슴 뼈 높이(가슴을 덮는다), 등은 가슴 뼈 위 3cm(날개뼈 아래로 파임)
 *   어깨   끈 두 줄 (몸 중심에서 5.5~8.5cm)
 * 기준은 뼈 위치(세상 좌표, 앞 +Z)라 체형 굽기 뒤에도 맞는다.
 */
const SWIM_TEXTURE = 1024;
const SKIN_SRGB = [250, 222, 206];

async function dressSwimsuit(document, swimsuit) {
  const bone = (name) => worldOf(document, name);
  const upperChest = bone("J_Bip_C_UpperChest");
  const chest = bone("J_Bip_C_Chest");
  const hips = bone("J_Bip_C_Hips");
  const upperLeg = bone("J_Bip_L_UpperLeg");
  if (!upperChest || !chest || !hips || !upperLeg) return 0;
  const crotchY = upperLeg[1] - 0.075;
  const hipSideY = hips[1];
  const frontTop = upperChest[1] - 0.005;
  const backTop = chest[1] + 0.03;
  const middleZ = chest[2] - 0.01;

  const inSuit = ([x, y, z]) => {
    const ax = Math.abs(x);
    // 어깨 끈
    if (ax > 0.055 && ax < 0.085 && y > frontTop - 0.02 && y < frontTop + 0.16) return true;
    // 팔(쉬는 자세 T 자) · 겨드랑이 바깥
    if (ax > 0.15) return false;
    if (y > backTop - 0.02 && ax > 0.125) return false;
    // 목둘레 — 앞 · 등
    if (y > (z > middleZ ? frontTop : backTop)) return false;
    // 다리 — 하이컷
    const t = Math.min(1, ax / 0.15);
    return y > crotchY + Math.pow(t, 1.3) * (hipSideY - crotchY);
  };

  const suitSrgb = (swimsuit.colorSrgb ?? [24, 32, 72]);
  const N = SWIM_TEXTURE;
  const pixels = new Uint8Array(N * N * 4);
  const filled = new Uint8Array(N * N);
  let painted = 0;
  let target = null;

  for (const mesh of document.getRoot().listMeshes()) {
    const toWorld = meshToWorld(document, mesh);
    for (const primitive of mesh.listPrimitives()) {
      const material = primitive.getMaterial();
      if (!/Body_\d+_SKIN/.test(material?.getName() ?? "")) continue;
      target = material;
      const position = primitive.getAttribute("POSITION");
      const uv = primitive.getAttribute("TEXCOORD_0");
      const indices = primitive.getIndices();
      if (!position || !uv || !indices) continue;
      const P = [], U = [];
      const tmp = [];
      for (let i = 0; i < indices.getCount(); i += 3) {
        for (let k = 0; k < 3; k += 1) {
          const v = indices.getScalar(i + k);
          P[k] = apply(toWorld, position.getElement(v, tmp));
          const [u, w] = uv.getElement(v, tmp);
          U[k] = [u * N, w * N];
        }
        // 삼각형을 그림 칸 위에 그린다
        const minX = Math.max(0, Math.floor(Math.min(U[0][0], U[1][0], U[2][0])));
        const maxX = Math.min(N - 1, Math.ceil(Math.max(U[0][0], U[1][0], U[2][0])));
        const minY = Math.max(0, Math.floor(Math.min(U[0][1], U[1][1], U[2][1])));
        const maxY = Math.min(N - 1, Math.ceil(Math.max(U[0][1], U[1][1], U[2][1])));
        const det = (U[1][1] - U[2][1]) * (U[0][0] - U[2][0]) + (U[2][0] - U[1][0]) * (U[0][1] - U[2][1]);
        if (Math.abs(det) < 1e-9) continue;
        for (let py = minY; py <= maxY; py += 1) {
          for (let px = minX; px <= maxX; px += 1) {
            const sx = px + 0.5, sy = py + 0.5;
            const l0 = ((U[1][1] - U[2][1]) * (sx - U[2][0]) + (U[2][0] - U[1][0]) * (sy - U[2][1])) / det;
            const l1 = ((U[2][1] - U[0][1]) * (sx - U[2][0]) + (U[0][0] - U[2][0]) * (sy - U[2][1])) / det;
            const l2 = 1 - l0 - l1;
            if (l0 < -0.02 || l1 < -0.02 || l2 < -0.02) continue;
            const p = [0, 1, 2].map((c) => l0 * P[0][c] + l1 * P[1][c] + l2 * P[2][c]);
            const colour = inSuit(p) ? suitSrgb : SKIN_SRGB;
            const at = py * N + px;
            pixels.set([...colour, 255], at * 4);
            filled[at] = 1;
            painted += 1;
          }
        }
      }
    }
  }
  if (!target) return 0;
  // 그림 조각 가장자리 — 빈 칸을 옆 칸 색으로 몇 번 번지게(이음매에 흰 선이 안 보이게)
  for (let pass = 0; pass < 4; pass += 1) {
    const next = filled.slice();
    for (let y = 0; y < N; y += 1) for (let x = 0; x < N; x += 1) {
      const at = y * N + x;
      if (filled[at]) continue;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= N || ny >= N || !filled[ny * N + nx]) continue;
        pixels.copyWithin(at * 4, (ny * N + nx) * 4, (ny * N + nx) * 4 + 4);
        next[at] = 1;
        break;
      }
    }
    filled.set(next);
  }
  const png = await sharp(Buffer.from(pixels), { raw: { width: N, height: N, channels: 4 } }).png().toBuffer();
  const texture = document.createTexture("Swimsuit_Body").setImage(new Uint8Array(png)).setMimeType("image/png");
  target.setBaseColorTexture(texture);
  target.setBaseColorFactor([1, 1, 1, 1]);
  return painted;
}

export async function optimizeModel(input, output, reference, shape = null, strip = false, swimsuit = null) {
  const document = await io.read(input);
  const json = readGlb(input).json;
  let rig = null;
  // 노드 제약은 게임이 모르므로 부모 관계로 굳힌다 (트위스트 샘플의 소매 · 허벅지)
  const baked = bakeConstraints(document, json);
  if (baked) console.log(`  제약 뼈 ${baked} 개를 따라가던 뼈 밑으로`);
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
  // 체형 굽기 (meta.json 의 shape) — 뼈대를 기준으로 맞춘 뒤라 앞이 +Z 다
  if (shape) console.log(`  체형 굽기: 정점 ${shapeBody(document, shape)} 개`);
  if (strip) console.log(`  옷 벗기기: 옷 메시 ${stripClothes(document)} 개를 빼고 몸 피부를 단색으로`);
  if (swimsuit) console.log(`  원피스 수영복: 그림 칸 ${await dressSwimsuit(document, swimsuit)} 개`);
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
