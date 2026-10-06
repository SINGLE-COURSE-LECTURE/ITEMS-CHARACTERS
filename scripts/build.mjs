/**
 * 캐릭터 묶음 만들기 — characters/<id>/ 마다 검사하고, 게임용 파일과 catalog.json 을 만든다.
 *
 *   characters/<id>/model.vrm   원본 (VRoid Studio 에서 내보낸 것, Git LFS)
 *   characters/<id>/meta.json   이름 · 라이선스 · 출처 (사람이 적는다)
 *   → dist/characters/<id>/game.glb   게임이 받는 파일 (텍스처를 줄인 것 — optimize.mjs)
 *   → dist/characters/<id>/thumb.png  고르기 화면의 얼굴 (VRM 에 박힌 썸네일을 꺼낸다)
 *   → dist/catalog.json                게임이 읽는 목록
 * dist 는 만들어지는 것이라 git 에 넣지 않는다 — GitHub Pages 가 dist 를 그대로 내보내고, core 의 sync-characters 가 게임으로 옮긴다.
 *
 * 하나라도 오류가 있으면 실패로 끝난다 (Actions 에서 막는다). 경고는 적기만 한다.
 * 쓰는 법: node scripts/build.mjs   (검사만: node scripts/build.mjs --check)
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, rmdirSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { optimizeModel, optimizeThumb } from "./optimize.mjs";
import { imageBytes, readGlb, REQUIRED_BONES, vrmInfo } from "./vrm.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const checkOnly = process.argv.includes("--check");
const dist = join(root, "dist");

/** VRoid 가 아닌 모델을 VRoid 뼈대로 바꿀 때의 기준 — VRoid Studio 로 만든 캐릭터 하나 */
const REFERENCE = join(root, "characters", "items-player", "model.vrm");
/**
 * 넣을 수 있는 라이선스 — CC0 · 직접 만든 것(own) · VRM 공개 라이선스(VRM-1.0, 아래 조건을 VRM 정보로 확인)
 * VRM-1.0 은 VRM 정보가 「재배포 허용 · 수정 후 재배포 허용 · 누구나 아바타 · 폭력 표현 허용(사냥터에서 싸운다)」 일 때만.
 */
const LICENSES = new Set(["CC0-1.0", "own", "VRM-1.0"]);
/** 게임이 받는 파일 하나의 한도 (줄인 뒤) */
const MAX_GAME_BYTES = 8 * 1024 * 1024;
const ID = /^[a-z0-9][a-z0-9-]*$/;

/** dist 를 비운다 — 빠진 캐릭터가 남지 않게. Node 24 의 rmSync 는 한글 경로에서 죽어서 직접 지운다 */
function removeTree(dir) {
  if (!existsSync(dir)) return;
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) removeTree(full);
    else unlinkSync(full);
  }
  rmdirSync(dir);
}
if (!checkOnly) removeTree(dist);

const errors = [];
const warnings = [];
const catalog = [];

for (const id of readdirSync(join(root, "characters")).sort()) {
  const dir = join(root, "characters", id);
  if (!statSync(dir).isDirectory()) continue;
  const fail = (text) => errors.push(`${id}: ${text}`);
  const warn = (text) => warnings.push(`${id}: ${text}`);
  if (!ID.test(id)) fail("폴더 이름은 영문 소문자 · 숫자 · - 만 (게임 주소에 그대로 쓴다)");

  const metaPath = join(dir, "meta.json");
  const modelPath = join(dir, "model.vrm");
  if (!existsSync(metaPath)) {
    fail("meta.json 이 없습니다");
    continue;
  }
  if (!existsSync(modelPath)) {
    fail("model.vrm 이 없습니다");
    continue;
  }
  const meta = JSON.parse(readFileSync(metaPath, "utf8"));
  for (const field of ["name", "author", "license", "source"]) if (!meta[field]) fail(`meta.json 에 ${field} 가 없습니다`);
  if (meta.license && !LICENSES.has(meta.license)) fail(`라이선스 ${meta.license} 는 넣을 수 없습니다 (CC0-1.0 · own 만)`);

  let glb;
  try {
    glb = readGlb(modelPath);
  } catch (error) {
    fail(`model.vrm 을 읽지 못했습니다 — ${error.message}`);
    continue;
  }
  const vrm = vrmInfo(glb.json);
  if (!vrm) {
    fail("VRM 정보가 없습니다 (VRoid Studio 에서 VRM 으로 내보내 주세요)");
    continue;
  }
  const missing = REQUIRED_BONES.filter((bone) => !vrm.bones.includes(bone));
  if (missing.length) fail(`필수 뼈대가 없습니다: ${missing.join(", ")}`);
  if (meta.license === "VRM-1.0") {
    const m = vrm.meta;
    const problems = [];
    if (m.allowRedistribution !== true) problems.push("재배포 불가");
    if (m.modification !== "allowModificationRedistribution") problems.push("수정 후 재배포 불가 (게임용으로 줄이는 것도 수정이다)");
    if (m.avatarPermission !== "everyone") problems.push("누구나 아바타로 쓸 수 없음");
    if (m.allowExcessivelyViolentUsage !== true) problems.push("폭력 표현 불가 (사냥터에서 싸운다)");
    if (problems.length) fail(`VRM-1.0 이라고 했지만 VRM 정보가 허락하지 않습니다: ${problems.join(", ")}`);
    if (m.creditNotation === "required") warn("크레딧 표시가 필요한 모델입니다 — 고르기 화면에 만든 사람이 보입니다");
  }
  if (vrm.meta.allowRedistribution === false) {
    if (meta.license === "own") warn("VRM 정보에 「재배포 불가」로 적혀 있습니다 — 공개 저장소에 올리기 전에 VRoid Studio 에서 재배포 허용 · 라이선스를 바꿔 다시 내보내세요");
    else fail("VRM 정보에 「재배포 불가」로 적혀 있는데 CC0 라고 했습니다 — 출처의 라이선스를 다시 확인하세요");
  }

  // 썸네일 — 폴더에 thumb.png 를 직접 넣었으면 그것, 아니면 VRM 에 박힌 것
  let thumbFile = null;
  const out = join(dist, "characters", id);
  if (!checkOnly) {
    mkdirSync(out, { recursive: true });
    const rig = await optimizeModel(modelPath, join(out, "game.glb"), REFERENCE);
    if (rig) {
      console.log(`  ${id}: VRoid 뼈대로 바꿈 — 뼈 ${rig.bones} 개, 크기 ×${rig.scale.toFixed(2)}`);
      if (rig.unmatched.length) warn(`VRoid 에 없는 뼈라 동작이 붙지 않습니다: ${rig.unmatched.join(", ")}`);
    }
    const gameBytes = statSync(join(out, "game.glb")).size;
    if (gameBytes > MAX_GAME_BYTES) warn(`줄인 뒤에도 ${(gameBytes / 1048576).toFixed(1)} MB — ${MAX_GAME_BYTES / 1048576} MB 를 넘습니다`);
    const own = ["thumb.png", "thumb.jpg"].find((name) => existsSync(join(dir, name)));
    const embedded = vrm.thumbnailImage !== undefined ? imageBytes(glb, vrm.thumbnailImage) : null;
    thumbFile = "thumb.png";
    if (own) await optimizeThumb(readFileSync(join(dir, own)), join(out, thumbFile));
    else if (embedded) await optimizeThumb(embedded.bytes, join(out, thumbFile));
    else {
      thumbFile = null;
      warn("VRM 에 썸네일이 없습니다 — thumb.png 를 폴더에 직접 넣어 주세요");
    }
  }
  catalog.push({
    id,
    name: meta.name,
    author: meta.author,
    license: meta.license,
    source: meta.source,
    tags: meta.tags ?? [],
    model: `characters/${id}/game.glb`,
    thumb: thumbFile ? `characters/${id}/${thumbFile}` : null,
    bytes: checkOnly ? glb.bytes : statSync(join(out, "game.glb")).size,
    vrm: vrm.version,
  });
}

for (const line of warnings) console.warn(`경고  ${line}`);
for (const line of errors) console.error(`오류  ${line}`);
if (!checkOnly) {
  mkdirSync(dist, { recursive: true });
  writeFileSync(join(dist, "catalog.json"), `${JSON.stringify({ _note: "scripts/build.mjs 가 만든다. 손으로 고치지 않는다.", characters: catalog }, null, 2)}\n`);
  console.log(`캐릭터 ${catalog.length} 개 → dist/catalog.json`);
}
if (errors.length) process.exit(1);
