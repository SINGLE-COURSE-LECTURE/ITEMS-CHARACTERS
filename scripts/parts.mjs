/**
 * 조립 부품 만들기 — 게임용 캐릭터(dist/characters/<id>/game.glb)에서 얼굴 그림을 떼어 낸다.
 *
 * 캐릭터 만들기(CUSTOMIZE)는 완성 캐릭터를 고르는 대신 「베이스 + 얼굴」로 조립한다.
 *   베이스  게임의 기본 캐릭터 남 · 여 (기본 플레이어 · 트위스트). 머리도 그 캐릭터 원래 머리 그대로
 *          (2026-10-12: 떼어 붙인 머리 · 가발은 모두 걷어 냈다 — catalog.json 의 hair 는 늘 빈 목록)
 *   얼굴    dist/parts/face/<id>/<칸>.png — 눈동자 · 흰자 · 눈 하이라이트 · 눈매 · 속눈썹 · 눈썹 · 입 그림
 *   목록    dist/parts/catalog.json
 *
 * VRoid 얼굴은 그림 배치(UV)가 같아 얼굴 그림을 서로 바꿔 끼울 수 있다.
 * build.mjs 끝에서 불린다. 따로: node scripts/parts.mjs
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import sharp from "sharp";

import { readGlb } from "./vrm.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "dist");

/**
 * 베이스 — 머리를 숨기고 몸 · 얼굴 틀로 쓴다. 게임의 기본 캐릭터 둘(상점 착장 · 동작이 이 둘에 맞춰져 있다).
 * 남자 기본 = 기본 플레이어(VRoid Studio 로 직접 만든 것), 여자 기본 = 트위스트 샘플(체형 굽기 · 기본 옷 맞춤).
 */
export const BASES = [
  { id: "male", name: "남자 기본", from: "items-player" },
  { id: "female", name: "여자 기본", from: "pixiv-twist" },
];

/** 부품을 떼지 않는 캐릭터 — 볼륨 테스트는 비타와 같은 원본 */
const SKIP = new Set(["lab-curvy"]);
/** 얼굴 그림을 떼지 않는 캐릭터 — VRoid Studio 내보내기가 아니라 얼굴 그림 배치가 다르다 */
const SKIP_FACE = new Set(["pixiv-twist"]);

/**
 * 「눈 모양」(흰자 · 눈매 · 속눈썹 · 하이라이트)을 가져와도 되는 캐릭터 — 두 베이스(남자 기본 1.0 · 여자 기본 트위스트)에
 * 끼워 보고 고른 것 (2026-10-12). 나머지(다크니스 · 빅토리아 · 비타 · 비비 · 시노)는 눈 둘레에 흰 · 회색 테두리가 남았다.
 * 눈동자 · 눈썹 · 입은 어느 캐릭터 것이든 맞았다.
 */
const EYES_OK = new Set(["items-player", "vroid-hairsample-female", "vroid-hairsample-male", "vroid-sakurada-fumiriya", "vroid-sendagaya-shibu"]);

/** 옛 VRoid 샘플(0.x)의 눈썹 그림은 흰색이라(재질 색을 곱해 칠하던 방식) 짙은 갈색으로 미리 칠한다 — 기본 캐릭터 눈썹과 같은 결 */
const BROW_TINT = [0.24, 0.17, 0.13];

/** 얼굴 그림 칸 — 재질 이름의 이 조각으로 찾는다 */
export const FACE_SLOTS = ["EyeIris", "EyeWhite", "EyeHighlight", "FaceEyeline", "FaceEyelash", "FaceBrow", "FaceMouth"];

/**
 * 머리 크기 — 얼굴 살갗(Face_00_SKIN, VRoid 는 두피 · 뒤통수까지 한 장) 정점의 상자 (메시 공간, m).
 * 게임이 머리카락을 다른 몸에 씌울 때 이 상자끼리 맞춰 늘린다. 눈 뼈(J_Adj)는 없는 모델이 있어 뼈로는 못 잰다.
 */
function headBox(input) {
  const { json, bin } = readGlb(input);
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (const mesh of json.meshes ?? []) {
    for (const primitive of mesh.primitives) {
      if (!/Face_00_SKIN/.test(json.materials?.[primitive.material]?.name ?? "")) continue;
      const accessor = json.accessors[primitive.attributes.POSITION];
      if (!accessor?.min || !accessor?.max) continue;
      for (let i = 0; i < 3; i += 1) {
        min[i] = Math.min(min[i], accessor.min[i]);
        max[i] = Math.max(max[i], accessor.max[i]);
      }
    }
  }
  if (!Number.isFinite(min[0])) return null;
  // 얼굴이 보는 쪽 — 눈동자(EyeIris)가 머리 상자 가운데보다 +z 쪽이면 1, -z 쪽이면 -1.
  // VRoid Studio 1.0 내보내기 · 트위스트는 +z, 옛 VRoid 샘플(0.x)은 -z 를 본다 (retarget 은 뼈만 돌리고 정점은 그대로 둔다)
  // 눈동자 조각이 얼굴과 정점 묶음을 같이 쓰는 모델(옛 VRoid 샘플)이 있어, 상자(min · max)가 아니라 눈동자 삼각형이 쓰는 정점만 평균 낸다
  let irisZ = null;
  for (const mesh of json.meshes ?? []) {
    for (const primitive of mesh.primitives) {
      if (!/EyeIris/.test(json.materials?.[primitive.material]?.name ?? "")) continue;
      const z = usedAverage(json, bin, primitive, 2);
      if (z !== null) irisZ = z;
    }
  }
  const front = irisZ === null ? 1 : irisZ >= (min[2] + max[2]) / 2 ? 1 : -1;
  const round = (value) => Math.round(value * 10000) / 10000;
  return { min: min.map(round), max: max.map(round), front };
}

/** 한 조각의 삼각형이 쓰는 정점들의 좌표 평균 (axis 0 · 1 · 2) */
function usedAverage(json, bin, primitive, axis) {
  const view = (accessor) => {
    const bufferView = json.bufferViews[accessor.bufferView];
    return { offset: (bufferView.byteOffset ?? 0) + (accessor.byteOffset ?? 0), stride: bufferView.byteStride };
  };
  const position = json.accessors[primitive.attributes.POSITION];
  if (!position || position.componentType !== 5126 || primitive.indices === undefined) return null;
  const pos = view(position);
  const stride = pos.stride ?? 12;
  const index = json.accessors[primitive.indices];
  const idx = view(index);
  const size = index.componentType === 5125 ? 4 : index.componentType === 5123 ? 2 : 1;
  const seen = new Set();
  let sum = 0;
  for (let i = 0; i < index.count; i += 1) {
    const at = idx.offset + i * size;
    const v = size === 4 ? bin.readUInt32LE(at) : size === 2 ? bin.readUInt16LE(at) : bin.readUInt8(at);
    if (seen.has(v)) continue;
    seen.add(v);
    sum += bin.readFloatLE(pos.offset + v * stride + axis * 4);
  }
  return seen.size ? sum / seen.size : null;
}

/** 얼굴 그림을 칸마다 꺼낸다. 꺼낸 칸 → 파일 이름 */
async function extractFace(input, outDir, vrm) {
  const glb = readGlb(input);
  const { json, bin } = glb;
  const found = {};
  for (const material of json.materials ?? []) {
    const slot = FACE_SLOTS.find((name) => new RegExp(`(^|_)${name}_`).test(material.name ?? ""));
    if (!slot || found[slot]) continue;
    const textureIndex = material.pbrMetallicRoughness?.baseColorTexture?.index;
    const image = textureIndex !== undefined ? json.images?.[json.textures?.[textureIndex]?.source] : undefined;
    const view = image?.bufferView !== undefined ? json.bufferViews[image.bufferView] : undefined;
    if (!view) continue;
    const ext = image.mimeType === "image/jpeg" ? "jpg" : image.mimeType === "image/webp" ? "webp" : "png";
    const file = `${slot}.${ext}`;
    mkdirSync(outDir, { recursive: true });
    const bytes = bin.subarray(view.byteOffset ?? 0, (view.byteOffset ?? 0) + view.byteLength);
    if (slot === "FaceBrow" && vrm === "0.x") {
      await sharp(bytes).ensureAlpha().linear([...BROW_TINT, 1], [0, 0, 0, 0]).png().toFile(join(outDir, `${slot}.png`));
      found[slot] = `${slot}.png`;
      continue;
    }
    writeFileSync(join(outDir, file), bytes);
    found[slot] = file;
  }
  return found;
}


export async function buildParts() {
  const catalogPath = join(dist, "catalog.json");
  if (!existsSync(catalogPath)) throw new Error("dist/catalog.json 이 없습니다 — build.mjs 를 먼저");
  const characters = JSON.parse(readFileSync(catalogPath, "utf8")).characters;
  const byId = new Map(characters.map((entry) => [entry.id, entry]));

  const bases = BASES.map((base) => {
    const from = byId.get(base.from);
    if (!from) throw new Error(`베이스 ${base.from} 가 캐릭터 목록에 없습니다`);
    return { id: base.id, name: base.name, gender: base.id, from: base.from, vrm: from.vrm, model: from.model, thumb: from.thumb, head: headBox(join(dist, from.model)) };
  });

  // 예전에 떼어 둔 머리 파일은 지운다 (폴더째 rmSync 는 OneDrive 폴더에서 node 가 말없이 죽었다 — 파일만 하나씩)
  const hairDir = join(dist, "parts", "hair");
  if (existsSync(hairDir)) for (const name of readdirSync(hairDir)) unlinkSync(join(hairDir, name));
  const hair = [];
  const face = [];
  for (const entry of characters) {
    if (SKIP.has(entry.id)) continue;
    const input = join(dist, entry.model);
    const source = { from: entry.id, name: entry.name, author: entry.author, license: entry.license, gender: entry.gender, vrm: entry.vrm, thumb: entry.thumb };

    if (!SKIP_FACE.has(entry.id)) {
      const slots = await extractFace(input, join(dist, "parts", "face", entry.id), entry.vrm);
      if (Object.keys(slots).length > 0)
        face.push({ id: entry.id, ...source, eyes: EYES_OK.has(entry.id), slots: Object.fromEntries(Object.entries(slots).map(([slot, file]) => [slot, `parts/face/${entry.id}/${file}`])) });
    }
  }

  // 얼굴 그림은 같은 세대(VRM 버전 — VRoid Studio 1.x · 옛 0.x)끼리만 바꿔 끼운다. 세대가 다르면 눈 그림 배치가 조금 달라
  // 눈 둘레에 흰 테두리가 남았다(기본 플레이어 1.0 에 비타 0.x 의 눈). 같은 세대 얼굴이 없는 베이스는 얼굴을 못 바꾼다
  // 두 베이스 모두 네 칸을 연다 — 눈 모양은 EYES_OK 의 캐릭터만 (face[].eyes)
  for (const base of bases) base.faceParts = ["eyes", "iris", "brow", "mouth"];

  writeFileSync(
    join(dist, "parts", "catalog.json"),
    `${JSON.stringify({ _note: "scripts/parts.mjs 가 만든다. 손으로 고치지 않는다.", faceSlots: FACE_SLOTS, bases, hair, face }, null, 2)}\n`,
  );
  console.log(`부품 — 베이스 ${bases.length} · 얼굴 ${face.length} → dist/parts/catalog.json`);
}

// 따로 돌릴 때 (npm run parts) — 경로 글자 모양(드라이브 대소문자 · 빗금)이 달라도 알아보게
const same = (a, b) => a.replace(/\\/g, "/").toLowerCase() === b.replace(/\\/g, "/").toLowerCase();
if (process.argv[1] && same(fileURLToPath(import.meta.url), process.argv[1])) await buildParts();
