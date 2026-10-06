/**
 * 얼굴 사진을 캐릭터 폴더에 — characters/<id>/thumb.png 가 없으면 VRM 에 박힌 썸네일을 256 px 로 꺼내 둔다.
 * 게임의 「GitHub 보관소」 목록이 VRM 을 통째로 받지 않고 이 사진만 받아 카드에 보인다. 새 캐릭터를 넣으면 한 번 돌린다.
 * 쓰는 법: npm run thumbs
 */
import { existsSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { optimizeThumb } from "./optimize.mjs";
import { imageBytes, readGlb, vrmInfo } from "./vrm.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
for (const id of readdirSync(join(root, "characters")).sort()) {
  const dir = join(root, "characters", id);
  if (!statSync(dir).isDirectory() || !existsSync(join(dir, "model.vrm"))) continue;
  if (existsSync(join(dir, "thumb.png")) || existsSync(join(dir, "thumb.jpg"))) continue;
  const glb = readGlb(join(dir, "model.vrm"));
  const vrm = vrmInfo(glb.json);
  const image = vrm?.thumbnailImage !== undefined ? imageBytes(glb, vrm.thumbnailImage) : null;
  if (!image) {
    console.warn(`${id}: VRM 에 썸네일이 없습니다 — thumb.png 를 직접 넣어 주세요`);
    continue;
  }
  await optimizeThumb(image.bytes, join(dir, "thumb.png"));
  console.log(`${id}: thumb.png`);
}
