/**
 * 게임 옷 만들기 — 모든 캐릭터가 인벤토리의 상의 · 하의를 입을 수 있게, 몸에 맞는 티셔츠 · 반바지를 캐릭터마다 굽는다.
 *
 * 게임의 상의 · 하의는 옷을 새로 입히지 않고 캐릭터 제 옷(재질 이름에 _Tops_ · _Bottoms_)의 색만 바꾼다.
 * 그래서 티셔츠 · 반바지 차림인 기본 캐릭터(남 · 여)에서만 보였고, 드레스 · 코트 차림인 캐릭터는 아무것도 바뀌지 않았다.
 *
 * 몸 피부에서 옷이 덮는 면을 떼어 바깥(면 방향)으로 조금 띄워 옷으로 쓴다 — 체형(체형 굽기 · 큰 가슴 · 넓은 골반)이 달라도 꼭 맞는다.
 * 뼈 가중치를 그대로 가져오므로 몸과 같이 움직인다. VRoid 는 옷 밑 피부도 남겨 두어(재 보니 모든 캐릭터에 있다) 뗄 피부가 있다.
 *   상의  ITEMS_Tops_00_CLOTH     둥근 목 · 반팔(위팔 중간) · 골반 뼈 높이까지
 *   하의  ITEMS_Bottoms_00_CLOTH  허리띠(골반 뼈 위 6cm) ~ 허벅지 중간
 * 그림은 기본 장비 색(상의 흰색 · 하의 검정) 한 가지 — 다른 상의 · 하의는 게임이 그 색으로 칠한다(한 가지 색 그림은 recolor 가 색을 그대로 입힌다).
 * 게임(core/game/outfit.ts)은 상의를 입으면 이 상의를 보이고 캐릭터 제 윗옷(_Tops_)을 숨긴다. 하의도 같다.
 *
 * 이미 티셔츠 · 반바지(_Tops_ 와 _Bottoms_ 둘 다)인 캐릭터는 만들지 않는다 — 제 옷의 색을 바꾸는 원래 방식 그대로.
 */
import sharp from "sharp";

import { apply, meshToWorld, worldOf } from "./shape.mjs";

/** 옷을 피부에서 띄우는 거리 (m). 상의가 하의 위로 덮이게 조금 더 띄운다 */
const TOP_LIFT = 0.012;
const BOTTOM_LIFT = 0.008;

const linear = (m) => [m[0], m[1], m[2], m[4], m[5], m[6], m[8], m[9], m[10]];
const applyDir = (l, [x, y, z]) => {
  const out = [l[0] * x + l[3] * y + l[6] * z, l[1] * x + l[4] * y + l[7] * z, l[2] * x + l[5] * y + l[8] * z];
  const length = Math.hypot(...out) || 1;
  return out.map((value) => value / length);
};
const mat4Inv = (m) => {
  const [a, b, c, d, e, f, g, h, i] = [m[0], m[4], m[8], m[1], m[5], m[9], m[2], m[6], m[10]];
  const det = a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g);
  const r = [(e * i - f * h) / det, (c * h - b * i) / det, (b * f - c * e) / det, (f * g - d * i) / det, (a * i - c * g) / det, (c * d - a * f) / det, (d * h - e * g) / det, (b * g - a * h) / det, (a * e - b * d) / det];
  const out = [r[0], r[3], r[6], 0, r[1], r[4], r[7], 0, r[2], r[5], r[8], 0, 0, 0, 0, 1];
  for (let row = 0; row < 3; row += 1) out[12 + row] = -(out[row] * m[12] + out[4 + row] * m[13] + out[8 + row] * m[14]);
  return out;
};

/** 돌려주는 것: { top, bottom } 면 수. 이미 티셔츠 · 반바지 캐릭터면 null */
export async function buildOutfit(document) {
  const materials = document.getRoot().listMaterials().map((material) => material.getName());
  // 재질 이름 맨 앞일 수도 있다(트위스트: Tops_01_CLOTH)
  if (materials.some((name) => /(^|_)Tops_/.test(name)) && materials.some((name) => /(^|_)Bottoms_/.test(name))) return null;

  const bone = (name) => worldOf(document, name);
  const neck = bone("J_Bip_C_Neck");
  const chest = bone("J_Bip_C_Chest");
  const hips = bone("J_Bip_C_Hips");
  const upperLeg = bone("J_Bip_L_UpperLeg");
  const upperArm = bone("J_Bip_L_UpperArm");
  const lowerArm = bone("J_Bip_L_LowerArm");
  if (!neck || !chest || !hips || !upperLeg || !upperArm) return null;
  const sleeveEnd = upperArm[0] + ((lowerArm?.[0] ?? upperArm[0] + 0.24) - upperArm[0]) * 0.5;
  const middleZ = chest[2] - 0.01;

  const inTop = ([x, y, z]) => {
    const ax = Math.abs(x);
    // 반팔 — 쉬는 자세(T 자)라 팔은 어깨 높이로 옆으로 뻗어 있다
    if (ax > 0.15) return ax < sleeveEnd && Math.abs(y - upperArm[1]) < 0.09;
    // 둥근 목 — 앞이 조금 더 파인다
    if (y > neck[1] - (z > middleZ ? 0.055 : 0.035)) return false;
    return y > hips[1];
  };
  const inBottom = ([x, y]) => Math.abs(x) < 0.3 && y < hips[1] + 0.06 && y > upperLeg[1] - 0.17;

  // 기본 장비(흰 무지 티 · 검은 반바지)는 색 칠하기 없이 그림 색 그대로 쓴다 — 그림을 그 색으로. 다른 상의 · 하의는 이 위에 제 색을 칠한다
  const plain = (r, g, b) => sharp({ create: { width: 64, height: 64, channels: 4, background: { r, g, b, alpha: 1 } } }).png().toBuffer();
  const white = await plain(242, 242, 242);
  const black = await plain(38, 38, 43);
  // 상의 · 하의 재질이 똑같으면 빌드의 중복 정리(dedup)가 하나로 합쳐 게임이 따로 켜고 끌 수 없었다 — 거칠기를 달리 둔다
  const garment = (name, roughness, image) =>
    document
      .createMaterial(name)
      .setBaseColorTexture(document.createTexture(`${name}-base`).setImage(new Uint8Array(image)).setMimeType("image/png"))
      .setMetallicFactor(0)
      .setRoughnessFactor(roughness)
      .setDoubleSided(true);
  const parts = [
    { region: inTop, lift: TOP_LIFT, material: garment("ITEMS_Tops_00_CLOTH", 0.85, white), faces: 0 },
    { region: inBottom, lift: BOTTOM_LIFT, material: garment("ITEMS_Bottoms_00_CLOTH", 0.8, black), faces: 0 },
  ];

  for (const mesh of document.getRoot().listMeshes()) {
    const toWorld = meshToWorld(document, mesh);
    const toMesh = mat4Inv(toWorld);
    const dirToWorld = linear(toWorld);
    for (const primitive of [...mesh.listPrimitives()]) {
      const name = primitive.getMaterial()?.getName() ?? "";
      if (!/_SKIN/.test(name) || /Face/.test(name)) continue;
      const position = primitive.getAttribute("POSITION");
      const normal = primitive.getAttribute("NORMAL");
      const indices = primitive.getIndices();
      if (!position || !normal || !indices) continue;
      const world = [];
      const tmp = [];
      const worldAt = (v) => (world[v] ??= apply(toWorld, position.getElement(v, tmp)));

      for (const part of parts) {
        const picked = [];
        for (let i = 0; i < indices.getCount(); i += 3) {
          const tri = [indices.getScalar(i), indices.getScalar(i + 1), indices.getScalar(i + 2)];
          const p = tri.map(worldAt);
          const centre = [0, 1, 2].map((k) => (p[0][k] + p[1][k] + p[2][k]) / 3);
          if (part.region(centre)) picked.push(...tri);
        }
        if (!picked.length) continue;

        // 쓰인 정점만 새로 — 위치는 면 방향으로 띄운다
        const remap = new Map();
        const order = [];
        for (const v of picked) if (!remap.has(v)) remap.set(v, order.push(v) - 1);
        const copy = document.createPrimitive().setMaterial(part.material);
        for (const semantic of primitive.listSemantics()) {
          const source = primitive.getAttribute(semantic);
          const size = source.getElementSize();
          const ArrayType = source.getArray().constructor;
          const out = new ArrayType(order.length * size);
          const element = [];
          order.forEach((v, k) => {
            source.getElement(v, element);
            if (semantic === "POSITION") {
              const n = applyDir(dirToWorld, normal.getElement(v, []));
              const p = worldAt(v);
              element.splice(0, 3, ...apply(toMesh, [p[0] + n[0] * part.lift, p[1] + n[1] * part.lift, p[2] + n[2] * part.lift]));
            }
            out.set(element, k * size);
          });
          const accessor = document.createAccessor().setType(source.getType()).setArray(out).setBuffer(source.getBuffer());
          if (source.getNormalized()) accessor.setNormalized(true);
          copy.setAttribute(semantic, accessor);
        }
        const IndexArray = indices.getArray().constructor;
        copy.setIndices(document.createAccessor().setType("SCALAR").setArray(new IndexArray(picked.map((v) => remap.get(v)))).setBuffer(indices.getBuffer()));
        mesh.addPrimitive(copy);
        part.faces += picked.length / 3;
      }
    }
  }
  return { top: parts[0].faces, bottom: parts[1].faces };
}
