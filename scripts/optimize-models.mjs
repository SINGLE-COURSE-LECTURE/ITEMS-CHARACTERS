// 몬스터 모델 정리 (렌더링 · 로딩 최적화) — 겹치는 키프레임 줄이기(resample) · 같은 자료 하나로(dedup) · 안 쓰는 것 버리기(prune) ·
// 정점 양자화(KHR_mesh_quantization — Babylon 이 디코더 없이 읽는다). 32.5 MB → 24.2 MB.
// 쓰는 법: node ITEMS-CHARACTERS/scripts/optimize-models.mjs <원본 폴더> <내보낼 폴더>   (원본은 따로 두고 결과를 core/assets/models 에 덮어쓴다)
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { dedup, prune, quantize, resample } from "@gltf-transform/functions";
import { readdirSync, statSync, mkdirSync } from "node:fs";
import { join, dirname, relative } from "node:path";
const [src, dst] = process.argv.slice(2);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const files = [];
const walk = (dir) => { for (const name of readdirSync(dir)) { const p = join(dir, name); if (statSync(p).isDirectory()) walk(p); else if (name.endsWith(".glb")) files.push(p); } };
walk(src);
let before = 0, after = 0;
for (const file of files) {
  const doc = await io.read(file);
  await doc.transform(resample({ tolerance: 1e-4 }), dedup(), prune({ keepLeaves: true, keepAttributes: true }), quantize({ quantizePosition: 14, quantizeNormal: 10, quantizeTexcoord: 12 }));
  const out = join(dst, relative(src, file));
  mkdirSync(dirname(out), { recursive: true });
  await io.write(out, doc);
  before += statSync(file).size; after += statSync(out).size;
}
console.log(files.length, "files", (before / 1e6).toFixed(1), "MB ->", (after / 1e6).toFixed(1), "MB");
