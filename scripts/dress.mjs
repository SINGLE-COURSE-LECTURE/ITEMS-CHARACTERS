/**
 * 기본 옷 입히기 — 기본 캐릭터(여, 트위스트)가 입은 진짜 티셔츠 · 반바지를 다른 캐릭터에 옮겨 입힌다.
 *
 * 처음에는 몸 피부를 떼어 띄운 옷(outfit.mjs 의 옛 방식)을 썼는데 몸에 딱 붙어 기본 캐릭터의 헐렁한 티셔츠처럼 보이지 않았고
 * 목둘레 · 아랫단이 톱니처럼 잘렸다. 기본 캐릭터 옷을 그대로 가져오면 실루엣 · 소매 · 단이 그대로다.
 *
 * 1. 뼈 따라 옮기기 — 옷 정점마다 가중치대로 「대상 뼈 × 기준 뼈⁻¹」 를 섞어 곱한다(쉬는 자세 기준). 모든 캐릭터가 같은 VRoid 뼈대다
 * 2. 몸 밖으로 — 대상 몸 피부(가까운 정점)보다 안으로 들어간 옷 정점은 피부 바깥 MARGIN 으로 민다. 둘레를 고르게 몇 번 다듬는다
 * 3. 가중치는 뼈 이름으로 다시 잇는다 — 대상에 없는 뼈면 그 부모 쪽 뼈로
 * 재질 이름은 ITEMS_Tops_00_CLOTH · ITEMS_Bottoms_00_CLOTH — 게임(core/game/outfit.ts)이 인벤토리 상의 · 하의를 고르면 이 옷을 보이고 제 옷을 숨긴다.
 * 그림은 기본 캐릭터 옷 그림(흰 티 · 반바지)을 그대로 — 게임의 색 칠하기가 음영을 살려 상의 · 하의 색으로 바꾼다.
 *
 * 이미 티셔츠 · 반바지(_Tops_ 와 _Bottoms_ 둘 다)인 캐릭터는 건너뛴다 — 제 옷의 색을 바꾸는 원래 방식 그대로.
 */
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { existsSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { apply, meshToWorld } from "./shape.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);

/** 옷을 가져올 캐릭터 */
export const DRESS_SOURCE = "pixiv-twist";
/** 피부 바깥으로 띄우는 최소 거리 (m) */
const MARGIN = 0.009;
/** 반바지는 피부에서 · 티셔츠는 반바지 위에서 이만큼 */
const BOTTOM_MARGIN = 0.004;
const GARMENT_MARGIN = 0.003;
/** 티셔츠 안쪽으로 집어넣는 깊이 */
const TUCK = 0.004;
/** 둘레 피부를 살피는 반지름 (m) · 그중 옷 정점 바로 밑(옆으로 이만큼 안)인 것만 */
const REACH = 0.045;
const UNDER = 0.035;
/** 옷을 몇 번 쪼개나 (한 번에 면 4 배) */
const SUBDIVIDE = 2;
/** 펴고 다시 밀기 횟수 */
const SMOOTH_ROUNDS = 12;
/** 늘어뜨릴 때 아래로 1m 에 안으로 들어가는 정도 — 0 이면 수직으로 떨어진다 */
const DRAPE_SLOPE = 0.9;
/** 기본 옷 여유를 얼마나 옮기나 — 가슴 높이 · 허리 아래 (여성형은 몸에 붙게) */
const FIT_CHEST = 0.55;
const FIT_WAIST = 0.12;
const FIT_SHORTS = 0.4;
const FIT_SLEEVE = 0.5;
const FIT_SHOULDER = 0.4;
/** 맞춤 비율을 이웃끼리 고르게 펴는 횟수 */
const FIT_SMOOTH = 6;
/** 늘어뜨리고 펴기 횟수 */
const DRAPE_ROUNDS = 40;
/** 반바지 윗단 위로 티셔츠를 비스듬히 덮는 높이 · 기울기 */
const RIM_RISE = 0.08;
/** 엉덩이 꼭대기에서 위로 1m 에 안으로 들어가는 정도 */
const BACK_SLOPE = 0.6;
/** 바깥으로 본 줄의 굵기 (m) */
const RAY_WIDTH = 0.012;
/** 옷 가중치에 몸 피부 가중치를 섞는 비율 */
const SKIN_WEIGHT = 0.85;
/** 가중치를 이웃끼리 고르게 펴는 횟수 */
const WEIGHT_SMOOTH = 8;
const RIM_SLOPE = 0.3;
const TOP = /(^|_)Tops_/;
const BOTTOM = /(^|_)Bottoms_/;

// ── 4x4 (열 우선) ─────────────────────────────────────────────────────
const mul = (a, b) => {
  const o = new Array(16).fill(0);
  for (let c = 0; c < 4; c += 1) for (let r = 0; r < 4; r += 1) for (let k = 0; k < 4; k += 1) o[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k];
  return o;
};
const inv = (m) => {
  const [a, b, c, d, e, f, g, h, i] = [m[0], m[4], m[8], m[1], m[5], m[9], m[2], m[6], m[10]];
  const det = a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g);
  const r = [(e * i - f * h) / det, (c * h - b * i) / det, (b * f - c * e) / det, (f * g - d * i) / det, (a * i - c * g) / det, (c * d - a * f) / det, (d * h - e * g) / det, (b * g - a * h) / det, (a * e - b * d) / det];
  const out = [r[0], r[3], r[6], 0, r[1], r[4], r[7], 0, r[2], r[5], r[8], 0, 0, 0, 0, 1];
  for (let row = 0; row < 3; row += 1) out[12 + row] = -(out[row] * m[12] + out[4 + row] * m[13] + out[8 + row] * m[14]);
  return out;
};
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a) => {
  const l = Math.hypot(...a) || 1;
  return a.map((v) => v / l);
};

/** 몸 피부(얼굴 빼고) 정점 — 세상 좌표와 면에서 셈한 방향 */
function skinOf(document, weightsOf = null) {
  const points = [];
  const normals = [];
  /** 몸 메시(weightsOf)의 피부 정점이면 뼈 가중치 (뼈 번호 → 가중치) */
  const weights = [];
  for (const mesh of document.getRoot().listMeshes()) {
    const toWorld = meshToWorld(document, mesh);
    for (const primitive of mesh.listPrimitives()) {
      const name = primitive.getMaterial()?.getName() ?? "";
      if (!/_SKIN/.test(name) || /Face/.test(name)) continue;
      const position = primitive.getAttribute("POSITION");
      const indices = primitive.getIndices();
      const joints = mesh === weightsOf ? primitive.getAttribute("JOINTS_0") : null;
      const weightAttr = mesh === weightsOf ? primitive.getAttribute("WEIGHTS_0") : null;
      const world = new Map();
      const tmp = [], jt = [], wt = [];
      const at = (v) => {
        if (!world.has(v)) {
          let w = null;
          if (joints && weightAttr) {
            joints.getElement(v, jt);
            weightAttr.getElement(v, wt);
            w = new Map();
            for (let k = 0; k < 4; k += 1) if (wt[k]) w.set(jt[k], (w.get(jt[k]) ?? 0) + wt[k]);
          }
          world.set(v, { p: apply(toWorld, position.getElement(v, tmp)), n: [0, 0, 0], w });
        }
        return world.get(v);
      };
      for (let i = 0; i < indices.getCount(); i += 3) {
        const [a, b, c] = [at(indices.getScalar(i)), at(indices.getScalar(i + 1)), at(indices.getScalar(i + 2))];
        const n = cross(sub(b.p, a.p), sub(c.p, a.p));
        for (const v of [a, b, c]) for (let k = 0; k < 3; k += 1) v.n[k] += n[k];
      }
      for (const { p, n, w } of world.values()) {
        points.push(p);
        normals.push(norm(n));
        weights.push(w);
      }
    }
  }
  return { points, normals, weights };
}

/** 둘레(REACH) 안의 피부 정점들 */
function aroundFinder({ points }) {
  const CELL = REACH;
  const grid = new Map();
  const key = (x, y, z) => `${x},${y},${z}`;
  points.forEach((p, i) => {
    const k = key(Math.floor(p[0] / CELL), Math.floor(p[1] / CELL), Math.floor(p[2] / CELL));
    if (!grid.has(k)) grid.set(k, []);
    grid.get(k).push(i);
  });
  return (q) => {
    const cx = Math.floor(q[0] / CELL), cy = Math.floor(q[1] / CELL), cz = Math.floor(q[2] / CELL);
    const found = [];
    for (let x = cx - 1; x <= cx + 1; x += 1) for (let y = cy - 1; y <= cy + 1; y += 1) for (let z = cz - 1; z <= cz + 1; z += 1) {
      for (const i of grid.get(key(x, y, z)) ?? []) {
        if ((points[i][0] - q[0]) ** 2 + (points[i][1] - q[1]) ** 2 + (points[i][2] - q[2]) ** 2 < REACH * REACH) found.push(i);
      }
    }
    return found;
  };
}

/** 가까운 피부 정점 — 칸(5cm)으로 나눠 찾는다 */
function nearestFinder({ points }) {
  const CELL = 0.05;
  const grid = new Map();
  const key = (x, y, z) => `${x},${y},${z}`;
  points.forEach((p, i) => {
    const k = key(Math.floor(p[0] / CELL), Math.floor(p[1] / CELL), Math.floor(p[2] / CELL));
    if (!grid.has(k)) grid.set(k, []);
    grid.get(k).push(i);
  });
  return (q) => {
    const cx = Math.floor(q[0] / CELL), cy = Math.floor(q[1] / CELL), cz = Math.floor(q[2] / CELL);
    let best = -1, bestD = Infinity;
    for (let r = 1; r <= 3 && best < 0; r += 1) {
      for (let x = cx - r; x <= cx + r; x += 1) for (let y = cy - r; y <= cy + r; y += 1) for (let z = cz - r; z <= cz + r; z += 1) {
        for (const i of grid.get(key(x, y, z)) ?? []) {
          const d = (points[i][0] - q[0]) ** 2 + (points[i][1] - q[1]) ** 2 + (points[i][2] - q[2]) ** 2;
          if (d < bestD) (bestD = d), (best = i);
        }
      }
    }
    return best;
  };
}

/** 몸 메시 노드(피부가 있는, 뼈가 붙은) */
const bodyNode = (document) =>
  document.getRoot().listNodes().find((node) => node.getSkin() && node.getMesh()?.listPrimitives().some((p) => /Body_\d*_?SKIN|Body_00_SKIN/.test(p.getMaterial()?.getName() ?? "")));

/** 이미 티셔츠 · 반바지를 입은 캐릭터 */
export function wearsTeeAndShorts(document) {
  const names = document.getRoot().listMaterials().map((m) => m.getName());
  return names.some((n) => TOP.test(n) && !/^ITEMS_/.test(n)) && names.some((n) => BOTTOM.test(n) && !/^ITEMS_/.test(n));
}

/**
 * 몸통 단면 지도 — 높이(1cm)와 방향(BINS)마다 몸 피부가 중심에서 얼마나 먼가.
 * 옷과 몸 사이의 여유를 옮길 때 쓴다(옷의 절대 크기가 아니라 몸에서 띄운 만큼을 옮긴다).
 */
const RADIAL_BINS = 48;
function radialMap(document, skinPoints) {
  const by = (name) => document.getRoot().listNodes().find((n) => n.getName() === name)?.getWorldMatrix();
  const hips = by("J_Bip_C_Hips");
  const armpitY = by("J_Bip_L_UpperArm")[13] - 0.06;
  const centre = [hips[12], hips[14]];
  const grid = new Map();
  const polar = (x, z) => {
    const dx = x - centre[0], dz = z - centre[1];
    return { bin: Math.floor((((Math.atan2(dx, dz) / (2 * Math.PI)) * RADIAL_BINS) + RADIAL_BINS) % RADIAL_BINS), r: Math.hypot(dx, dz) };
  };
  for (const [x, y, z] of skinPoints) {
    // 팔은 빼고 몸통만 — 겨드랑이 위(어깨 높이)는 팔이 옆으로 뻗어 있어 더 좁게
    // 골반 높이(엉덩이 뼈 아래)는 더 넓게 — 골반 바깥 면까지
    if (Math.abs(x - centre[0]) > (y < hips[13] ? 0.24 : y < armpitY ? 0.17 : 0.1)) continue;
    const { bin, r } = polar(x, z);
    const key = `${Math.round(y * 100)},${bin}`;
    if (r > (grid.get(key) ?? 0)) grid.set(key, r);
  }
  const lookup = (x, y, z) => {
    const { bin, r } = polar(x, z);
    const yy = Math.round(y * 100);
    for (let reach = 0; reach <= 3; reach += 1) {
      let best = 0, n = 0;
      for (let dy = -reach; dy <= reach; dy += 1) for (let db = -reach; db <= reach; db += 1) {
        const value = grid.get(`${yy + dy},${(bin + db + RADIAL_BINS) % RADIAL_BINS}`);
        if (value) (best += value), (n += 1);
      }
      if (n) return { R: best / n, r, centre };
    }
    return { R: 0, r, centre };
  };
  return { lookup, armpitY, centre, waistY: hips[13] + 0.08, crotchY: by("J_Bip_L_UpperLeg")[13] - 0.04 };
}

/** 다리 단면 지도 — 허벅지 뼈(위 → 무릎) 축을 중심으로, 높이와 방향마다 다리 피부가 얼마나 먼가 */
function legMap(document, skinPoints) {
  const by = (name) => document.getRoot().listNodes().find((n) => n.getName() === name)?.getWorldMatrix();
  const legs = { L: [by("J_Bip_L_UpperLeg"), by("J_Bip_L_LowerLeg")], R: [by("J_Bip_R_UpperLeg"), by("J_Bip_R_LowerLeg")] };
  const hips = by("J_Bip_C_Hips");
  const sideOf = (x) => ((x - hips[12]) * (legs.L[0][12] - hips[12]) > 0 ? "L" : "R");
  const axis = (side, y) => {
    const [a, b] = legs[side];
    const t = Math.min(1, Math.max(0, (a[13] - y) / (a[13] - b[13])));
    return [a[12] + (b[12] - a[12]) * t, a[14] + (b[14] - a[14]) * t];
  };
  const polar = (side, x, y, z) => {
    const [cx, cz] = axis(side, y);
    const dx = x - cx, dz = z - cz;
    return { bin: Math.floor((((Math.atan2(dx, dz) / (2 * Math.PI)) * RADIAL_BINS) + RADIAL_BINS) % RADIAL_BINS), r: Math.hypot(dx, dz), centre: [cx, cz] };
  };
  const top = Math.max(legs.L[0][13], legs.R[0][13]);
  const grid = new Map();
  for (const [x, y, z] of skinPoints) {
    if (y > top) continue;
    const side = sideOf(x);
    const { bin, r } = polar(side, x, y, z);
    if (r > 0.13) continue;
    const key = `${side},${Math.round(y * 100)},${bin}`;
    if (r > (grid.get(key) ?? 0)) grid.set(key, r);
  }
  const lookup = (x, y, z) => {
    const side = sideOf(x);
    const { bin, r, centre } = polar(side, x, y, z);
    const yy = Math.round(y * 100);
    for (let reach = 0; reach <= 3; reach += 1) {
      let sum = 0, n = 0;
      for (let dy = -reach; dy <= reach; dy += 1) for (let db = -reach; db <= reach; db += 1) {
        const value = grid.get(`${side},${yy + dy},${(bin + db + RADIAL_BINS) % RADIAL_BINS}`);
        if (value) (sum += value), (n += 1);
      }
      if (n) return { R: sum / n, r, centre };
    }
    return { R: 0, r, centre };
  };
  return { lookup };
}

/** 팔 단면 지도 — 쉬는 자세(T 자)라 팔은 옆(x)으로 뻗어 있다. 위팔 뼈 축 둘레(y · z)로 팔 피부가 얼마나 먼가 */
function armMap(document, skinPoints) {
  const by = (name) => document.getRoot().listNodes().find((n) => n.getName() === name)?.getWorldMatrix();
  const arms = { L: [by("J_Bip_L_UpperArm"), by("J_Bip_L_LowerArm")], R: [by("J_Bip_R_UpperArm"), by("J_Bip_R_LowerArm")] };
  const hips = by("J_Bip_C_Hips");
  const sideOf = (x) => ((x - hips[12]) * (arms.L[0][12] - hips[12]) > 0 ? "L" : "R");
  const axis = (side, x) => {
    const [a, b] = arms[side];
    const t = Math.min(1, Math.max(0, (x - a[12]) / (b[12] - a[12])));
    return [a[13] + (b[13] - a[13]) * t, a[14] + (b[14] - a[14]) * t];
  };
  const polar = (side, x, y, z) => {
    const [cy, cz] = axis(side, x);
    const dy = y - cy, dz = z - cz;
    return { bin: Math.floor((((Math.atan2(dy, dz) / (2 * Math.PI)) * RADIAL_BINS) + RADIAL_BINS) % RADIAL_BINS), r: Math.hypot(dy, dz), centre: [cy, cz] };
  };
  const startX = { L: arms.L[0][12], R: arms.R[0][12] };
  const outside = (side, x) => Math.abs(x - hips[12]) > Math.abs(startX[side] - hips[12]) - 0.01;
  const grid = new Map();
  for (const [x, y, z] of skinPoints) {
    const side = sideOf(x);
    if (!outside(side, x)) continue;
    const { bin, r } = polar(side, x, y, z);
    if (r > 0.1) continue;
    const key = `${side},${Math.round(x * 100)},${bin}`;
    if (r > (grid.get(key) ?? 0)) grid.set(key, r);
  }
  const lookup = (x, y, z) => {
    const side = sideOf(x);
    const { bin, r, centre } = polar(side, x, y, z);
    const xx = Math.round(x * 100);
    for (let reach = 0; reach <= 3; reach += 1) {
      let sum = 0, n = 0;
      for (let dx = -reach; dx <= reach; dx += 1) for (let db = -reach; db <= reach; db += 1) {
        const value = grid.get(`${side},${xx + dx},${(bin + db + RADIAL_BINS) % RADIAL_BINS}`);
        if (value) (sum += value), (n += 1);
      }
      if (n) return { R: sum / n, r, centre };
    }
    return { R: 0, r, centre };
  };
  return { lookup, startX: Math.abs(startX.L - hips[12]), centreX: hips[12] };
}

/** 어깨 윗면 지도 — 목과 어깨 사이, 가로 자리(x · z)마다 피부 맨 위 높이 */
function shoulderMap(document, skinPoints) {
  const by = (name) => document.getRoot().listNodes().find((n) => n.getName() === name)?.getWorldMatrix();
  const armpitY = by("J_Bip_L_UpperArm")[13] - 0.06;
  const grid = new Map();
  for (const [x, y, z] of skinPoints) {
    if (y < armpitY) continue;
    const key = `${Math.round(x * 100)},${Math.round(z * 100)}`;
    if (y > (grid.get(key) ?? -Infinity)) grid.set(key, y);
  }
  return (x, z) => {
    const xx = Math.round(x * 100), zz = Math.round(z * 100);
    for (let reach = 0; reach <= 2; reach += 1) {
      let best = -Infinity;
      for (let dx = -reach; dx <= reach; dx += 1) for (let dz = -reach; dz <= reach; dz += 1) best = Math.max(best, grid.get(`${xx + dx},${zz + dz}`) ?? -Infinity);
      if (best > -Infinity) return best;
    }
    return null;
  };
}

/** 대상 문서에 기준 문서의 티셔츠 · 반바지를 옮겨 입힌다. 돌려주는 것: { top, bottom } 정점 수 */
export function dressFrom(target, source) {
  const sNode = bodyNode(source);
  const tNode = bodyNode(target);
  if (!sNode || !tNode) return null;
  // 다시 돌릴 때 — 전에 입힌 옷은 벗기고
  for (const primitive of tNode.getMesh().listPrimitives()) {
    const old = primitive.getMaterial();
    if (!/^ITEMS_/.test(old?.getName() ?? "")) continue;
    tNode.getMesh().removePrimitive(primitive);
    primitive.dispose();
    old.getBaseColorTexture()?.dispose();
    old.dispose();
  }
  for (const material of target.getRoot().listMaterials()) {
    if (!/^ITEMS_/.test(material.getName())) continue;
    material.getBaseColorTexture()?.dispose();
    material.dispose();
  }
  const sSkin = sNode.getSkin();
  const tSkin = tNode.getSkin();
  const sJoints = sSkin.listJoints();
  const tJoints = tSkin.listJoints();
  const tIndex = new Map(tJoints.map((joint, i) => [joint.getName(), i]));
  const tByName = new Map(target.getRoot().listNodes().map((n) => [n.getName(), n]));
  // 기준 뼈 → 대상 뼈 (없으면 부모 쪽)
  const parentOf = new Map();
  for (const n of source.getRoot().listNodes()) for (const c of n.listChildren()) parentOf.set(c, n);
  const mapJoint = (joint) => {
    for (let n = joint; n; n = parentOf.get(n)) if (tIndex.has(n.getName())) return n.getName();
    return "J_Bip_C_Hips";
  };
  const jointMove = sJoints.map((joint) => {
    const name = mapJoint(joint);
    const t = tByName.get(name);
    const s = name === joint.getName() ? joint : source.getRoot().listNodes().find((n) => n.getName() === name);
    return { index: tIndex.get(name), move: mul(t.getWorldMatrix(), inv(s.getWorldMatrix())) };
  });

  const sToWorld = meshToWorld(source, sNode.getMesh());
  const tToMesh = inv(meshToWorld(target, tNode.getMesh()));
  const skin = skinOf(target, tNode.getMesh());
  // 부딪힐 것 — 처음엔 몸 피부, 반바지를 입힌 뒤엔 반바지도 (티셔츠가 반바지 허리를 덮게)
  let collide = skin;
  /** 먼저 입힌 티셔츠 (반바지를 그 안으로 집어넣는다) */
  let tee = null;
  let around = aroundFinder(skin);
  const sRadial = radialMap(source, skinOf(source).points);
  const tRadial = radialMap(target, skin.points);
  const sLegs = legMap(source, skinOf(source).points);
  const sArms = armMap(source, skinOf(source).points);
  const tArms = armMap(target, skin.points);
  const sTop = shoulderMap(source, skinOf(source).points);
  const tTop = shoulderMap(target, skin.points);
  const tLegs = legMap(target, skin.points);
  const counts = {};

  for (const [slot, pattern, name, roughness] of [
    // 티셔츠 먼저(몸 피부만 보고), 반바지는 그 다음 — 티셔츠에 덮이는 반바지 허리는 티셔츠 안으로 집어넣는다.
    // 반바지를 먼저 입히고 티셔츠를 그 위로 밀었더니 반바지 윗단에서 티셔츠가 계단처럼 접혀 허리에 가로 턱이 졌다
    ["top", TOP, "ITEMS_Tops_00_CLOTH", 0.85],
    ["bottom", BOTTOM, "ITEMS_Bottoms_00_CLOTH", 0.8],
  ]) {
    const primitive = sNode.getMesh().listPrimitives().find((p) => pattern.test(p.getMaterial()?.getName() ?? ""));
    if (!primitive) continue;
    const position = primitive.getAttribute("POSITION");
    const joints = primitive.getAttribute("JOINTS_0");
    const weights = primitive.getAttribute("WEIGHTS_0");
    const uv = primitive.getAttribute("TEXCOORD_0");
    const sourceCount = position.getCount();
    let world = [];
    let uvs = [];
    /** 정점마다 대상 뼈 번호 → 가중치 */
    let weightMaps = [];
    const fits = [];
    const tmp = [], jt = [], wt = [], ut = [];

    // 1. 뼈 따라 옮기기
    for (let v = 0; v < sourceCount; v += 1) {
      const p = apply(sToWorld, position.getElement(v, tmp));
      joints.getElement(v, jt);
      weights.getElement(v, wt);
      const q = [0, 0, 0];
      let total = 0;
      const map = new Map();
      for (let k = 0; k < 4; k += 1) {
        if (!wt[k]) continue;
        const moved = apply(jointMove[jt[k]].move, p);
        for (let c = 0; c < 3; c += 1) q[c] += moved[c] * wt[k];
        total += wt[k];
        const index = jointMove[jt[k]].index;
        map.set(index, (map.get(index) ?? 0) + wt[k]);
      }
      let moved = total ? q.map((c) => c / total) : p;
      /** 몸에 맞추는 비율 — 바로 곱하지 않고 이웃끼리 고르게 편 뒤에 곱한다(점마다 따로 곱하면 천이 구겨졌다) */
      let fit = null;
      // 1-1. 여유 옮기기 (티셔츠 몸통) — 뼈만 따라 옮기면 기본 캐릭터 옷의 절대 크기가 그대로라 몸통이 작은 캐릭터에겐 상자처럼 컸다.
      //      기준 몸에서 띄운 만큼(여유)을 재서 대상 몸에서 그만큼 띄운다 — 몸이 작으면 옷도 줄고, 크면 는다
      if (slot === "top") {
        const torsoSource = p[1] < sRadial.armpitY + 0.08 && Math.abs(p[0] - sRadial.centre[0]) < (p[1] < sRadial.armpitY ? 0.26 : 0.1);
        if (torsoSource) {
          // 허리 아래(골반 · 허벅지 높이 — 밑단)는 단면이 다리로 갈라져 맞지 않는다 — 허리 높이의 단면을 이어 쓴다.
          // (허리 아래를 원래 크기로 돌렸더니 그 경계에 가로 턱이 졌다)
          const below = p[1] < sRadial.waistY;
          const src = sRadial.lookup(p[0], below ? sRadial.waistY : p[1], p[2]);
          const dst = tRadial.lookup(moved[0], below ? tRadial.waistY : moved[1], moved[2]);
          if (src.R && dst.R && dst.r > 1e-4) {
            // 붙임 — 기본 옷의 여유를 그대로 옮기면 허리가 퍼졌다. 가슴 높이는 FIT_CHEST, 허리부터 아래는 FIT_WAIST 만큼만
            const chestY = sRadial.armpitY - 0.12;
            const t = Math.min(1, Math.max(0, (chestY - p[1]) / (chestY - sRadial.waistY)));
            const amount = FIT_CHEST + (FIT_WAIST - FIT_CHEST) * t;
            const gap = MARGIN + Math.max(0, src.r - src.R - MARGIN) * amount;
            const k = (dst.R + gap) / dst.r;
            fit = [(moved[0] - dst.centre[0]) * (k - 1), 0, (moved[2] - dst.centre[1]) * (k - 1)];
          }
        }
      }
      // 1-1e. 소매 · 어깨 (티셔츠) — 뼈만 따라 옮기면 기본 캐릭터의 어깨 폭 · 높이가 그대로라 각져 보였다
      if (slot === "top" && p[1] > sRadial.armpitY - 0.04) {
        const delta = fit ? [...fit] : [0, 0, 0];
        let touched = Boolean(fit);
        if (Math.abs(p[0] - sArms.centreX) > sArms.startX - 0.02) {
          // 소매 — 위팔 뼈 축 둘레로
          const src = sArms.lookup(p[0], p[1], p[2]);
          const dst = tArms.lookup(moved[0], moved[1], moved[2]);
          if (src.R && dst.R && dst.r > 1e-4) {
            const gap = MARGIN + Math.max(0, src.r - src.R - MARGIN) * FIT_SLEEVE;
            const k = (dst.R + gap) / dst.r;
            delta[1] += (moved[1] - dst.centre[0]) * (k - 1);
            delta[2] += (moved[2] - dst.centre[1]) * (k - 1);
            touched = true;
          }
        } else {
          // 어깨 윗면 — 피부 맨 위에서 띄운 높이를 옮긴다
          const srcTop = sTop(p[0], p[2]);
          const dstTop = tTop(moved[0], moved[2]);
          if (srcTop !== null && dstTop !== null && p[1] > srcTop - 0.005) {
            const gap = MARGIN + Math.max(0, p[1] - srcTop - MARGIN) * FIT_SHOULDER;
            delta[1] += dstTop + gap - moved[1];
            touched = true;
          }
        }
        if (touched) fit = delta;
      }
      // 1-1b. 반바지 — 허리에서 사타구니까지(다리로 갈라지기 전) 같은 식으로 몸에 붙인다. 기본 옷 크기 그대로면 티셔츠 아래로 상자처럼 튀어나왔다
      if (slot === "bottom" && p[1] > sRadial.crotchY) {
        const src = sRadial.lookup(p[0], p[1], p[2]);
        const dst = tRadial.lookup(moved[0], moved[1], moved[2]);
        if (src.R && dst.R && dst.r > 1e-4) {
          const gap = BOTTOM_MARGIN + Math.max(0, src.r - src.R - BOTTOM_MARGIN) * FIT_SHORTS;
          const blend = Math.min(1, (p[1] - sRadial.crotchY) / 0.04);
          const k = 1 + ((dst.R + gap) / dst.r - 1) * blend;
          fit = [(moved[0] - dst.centre[0]) * (k - 1), 0, (moved[2] - dst.centre[1]) * (k - 1)];
        }
      }
      // 1-1c. 반바지 다리 — 사타구니 아래는 허벅지마다 같은 식으로
      if (slot === "bottom" && p[1] <= sRadial.crotchY + 0.04) {
        const src = sLegs.lookup(p[0], p[1], p[2]);
        const dst = tLegs.lookup(moved[0], moved[1], moved[2]);
        if (src.R && dst.R && dst.r > 1e-4) {
          const gap = BOTTOM_MARGIN + Math.max(0, src.r - src.R - BOTTOM_MARGIN) * FIT_SHORTS;
          const blend = Math.min(1, (sRadial.crotchY + 0.04 - p[1]) / 0.04);
          const k = 1 + ((dst.R + gap) / dst.r - 1) * blend;
          fit = [(moved[0] - dst.centre[0]) * (k - 1), 0, (moved[2] - dst.centre[1]) * (k - 1)];
        }
      }
      world.push(moved);
      fits.push(fit);
      uvs.push([...uv.getElement(v, ut)]);
      weightMaps.push(map);
    }

    // 1-1d. 비율 고르게 펴기 — 이웃(같은 자리 겹친 정점 포함) 평균을 몇 번
    {
      const groups = new Map();
      world.forEach((p, v) => {
        const key = p.map((c) => Math.round(c * 2000)).join(",");
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(v);
      });
      const near = world.map(() => new Set());
      const source = primitive.getIndices().getArray();
      for (let i = 0; i < source.length; i += 3) {
        const t = [source[i], source[i + 1], source[i + 2]];
        for (const a of t) for (const b of t) if (a !== b) near[a].add(b);
      }
      for (const group of groups.values()) {
        const all = new Set(group.flatMap((v) => [...near[v], ...group]));
        for (const v of group) near[v] = all;
      }
      // 움직일 거리(가로 xz)를 펴서 더한다 — 비율을 펴면 몸통 중심 · 다리 축처럼 중심이 다른 점끼리 섞여 반바지 윗단이 가시처럼 튀었다
      let shift = fits.map((f) => f ?? [0, 0, 0]);
      for (let round = 0; round < FIT_SMOOTH; round += 1) {
        shift = shift.map((value, v) => {
          if (!fits[v]) return value;
          const sum = [...value];
          let n = 1;
          for (const u of near[v]) if (fits[u] && u !== v) {
            for (let c = 0; c < 3; c += 1) sum[c] += shift[u][c];
            n += 1;
          }
          return sum.map((c) => c / n);
        });
      }
      world = world.map((p, v) => (fits[v] ? [p[0] + shift[v][0], p[1] + shift[v][1], p[2] + shift[v][2]] : p));
    }

    // 1-2. 잘게 쪼개기 — 기본 옷은 점이 717 개뿐이라 가슴 앞이 넓은 평면 하나다. 점만 밀어내면 그 면이 큰 가슴을 가로질러 뚫었다
    let triangles = Array.from(primitive.getIndices().getArray());
    for (let level = 0; level < SUBDIVIDE; level += 1) {
      const midpoints = new Map();
      const midpoint = (a, b) => {
        const key = a < b ? `${a},${b}` : `${b},${a}`;
        if (midpoints.has(key)) return midpoints.get(key);
        const index = world.length;
        world.push(world[a].map((c, k) => (c + world[b][k]) / 2));
        uvs.push(uvs[a].map((c, k) => (c + uvs[b][k]) / 2));
        const map = new Map();
        for (const source of [weightMaps[a], weightMaps[b]]) for (const [j, w] of source) map.set(j, (map.get(j) ?? 0) + w / 2);
        weightMaps.push(map);
        midpoints.set(key, index);
        return index;
      };
      const next = [];
      for (let i = 0; i < triangles.length; i += 3) {
        const [a, b, c] = [triangles[i], triangles[i + 1], triangles[i + 2]];
        const [ab, bc, ca] = [midpoint(a, b), midpoint(b, c), midpoint(c, a)];
        next.push(a, ab, ca, ab, b, bc, ca, bc, c, ab, bc, ca);
      }
      triangles = next;
    }
    const count = world.length;

    // 2. 몸 밖으로 — 피부 안쪽이면 피부 + MARGIN 으로. 옆 정점과 고르게 하고 다시 확인을 몇 번
    // 이음매 — 같은 자리에 겹친 정점(그림 좌표만 다름)은 한 몸으로 움직인다. 따로 펴면 앞 가운데 이음매가 벌어져 구멍이 났다
    const seam = new Map();
    world.forEach((p, v) => {
      const key = p.map((c) => Math.round(c * 2000)).join(",");
      if (!seam.has(key)) seam.set(key, []);
      seam.get(key).push(v);
    });
    const groups = [...seam.values()].filter((group) => group.length > 1);
    const weld = () => {
      for (const group of groups) {
        const mean = [0, 0, 0];
        for (const v of group) for (let c = 0; c < 3; c += 1) mean[c] += world[v][c] / group.length;
        for (const v of group) world[v] = [...mean];
      }
    };
    const neighbours = Array.from({ length: count }, () => new Set());
    for (let i = 0; i < triangles.length; i += 3) {
      const t = [triangles[i], triangles[i + 1], triangles[i + 2]];
      for (const a of t) for (const b of t) if (a !== b) neighbours[a].add(b);
    }
    // 이음매 양쪽 이웃을 서로 나눠 가진다
    for (const group of groups) {
      const shared = new Set(group.flatMap((v) => [...neighbours[v]]));
      for (const v of group) neighbours[v] = new Set([...shared].filter((n) => !group.includes(n)));
    }
    // 옷 정점 하나에 가장 가까운 피부 하나만 보면 정점 사이의 면이 큰 가슴 · 넓은 골반을 뚫었다 —
    // 바로 밑(옆으로 UNDER 안)에 있는 둘레 피부를 모두 보고 가장 많이 밀어야 하는 만큼, 그 피부들의 평균 방향으로 민다
    // 몸 중심선(앞뒤 깊이) — 엉덩이 뼈
    const axisZ = target.getRoot().listNodes().find((n) => n.getName() === "J_Bip_C_Hips").getWorldMatrix()[14];
    const pushOut = (touched) => {
      let moved = 0;
      for (let v = 0; v < count; v += 1) {
        let need = 0;
        const dir = [0, 0, 0];
        for (const i of around(world[v])) {
          const offset = sub(world[v], collide.points[i]);
          const n = collide.normals[i];
          const d = dot(offset, n);
          // 몸 반대편(등 · 옆구리 너머)은 건너뛴다 — 다만 옷 정점과 같은 쪽을 보는 피부(가슴 앞면이 앞을 보는 옷 정점 밑)면
          // 깊이 묻혀도(큰 가슴은 기본 옷보다 5cm 더 나온다) 민다
          const outward = norm([world[v][0], 0, world[v][2] - axisZ]);
          const sameSide = dot(n, outward) > 0.5;
          if (d < (sameSide ? -0.09 : -0.03)) continue;
          const lateral = Math.hypot(offset[0] - n[0] * d, offset[1] - n[1] * d, offset[2] - n[2] * d);
          if (lateral > UNDER) continue;
          // 반바지 위로는 얇게 — 피부 9mm + 반바지 위 9mm 면 허리에 턱이 졌다
          const margin = i >= skin.points.length ? GARMENT_MARGIN : slot === "bottom" ? BOTTOM_MARGIN : MARGIN;
          const want = margin - d;
          if (want <= 0) continue;
          need = Math.max(need, want);
          for (let c = 0; c < 3; c += 1) dir[c] += n[c] * want;
        }
        // 티셔츠 앞면 — 같은 높이 · 같은 좌우 줄의 앞쪽 피부보다 앞에. 가슴 사이(가슴골) 안쪽 면은 옆을 봐서 위 검사에 안 걸려 구멍이 남았다
        if (slot === "top" && world[v][2] > axisZ + 0.03) {
          let front = -Infinity;
          for (const i of around(world[v])) {
            const p = collide.points[i];
            if (Math.abs(p[0] - world[v][0]) < 0.02 && Math.abs(p[1] - world[v][1]) < 0.015 && collide.normals[i][2] > -0.2) front = Math.max(front, p[2]);
          }
          const want = front + MARGIN - world[v][2];
          if (want > need) {
            need = want;
            dir[0] = 0; dir[1] = 0; dir[2] = 1;
          }
        }
        if (need <= 0) continue;
        const n = norm(dir);
        for (let c = 0; c < 3; c += 1) world[v][c] += n[c] * need;
        touched[v] = 1;
        moved += 1;
      }
      return moved;
    };
    // 밀어낸 자리 둘레만 여러 번 고르게 편다 — 한 번 밀고 끝내면 정점마다 따로 밀려 혹처럼 울퉁불퉁했다.
    // 펴고 → 다시 밀고를 되풀이하면 천이 가슴 위로 팽팽하게 덮인다. 밀린 적 없는 곳(소매 · 아랫단)은 그대로
    const touched = new Uint8Array(count);
    let pushed = pushOut(touched);
    weld();
    // 반바지는 펴지 않는다 — 다리 사이 안쪽 면이 서로 끌려 사타구니 · 허벅지 안쪽이 찢어졌다
    const rounds = slot === "top" ? SMOOTH_ROUNDS : 0;
    for (let round = 0; round < rounds; round += 1) {
      // 밀린 곳과 그 이웃 두 겹
      let zone = touched.slice();
      for (let ring = 0; ring < 2; ring += 1) {
        const grown = zone.slice();
        for (let v = 0; v < count; v += 1) if (zone[v]) for (const n of neighbours[v]) grown[n] = 1;
        zone = grown;
      }
      const smoothed = world.map((p, v) => {
        if (!zone[v] || !neighbours[v].size) return p;
        const avg = [0, 0, 0];
        for (const n of neighbours[v]) for (let c = 0; c < 3; c += 1) avg[c] += world[n][c] / neighbours[v].size;
        return p.map((c, k) => c * 0.5 + avg[k] * 0.5);
      });
      world = smoothed;
      pushed = pushOut(touched);
      weld();
    }

    // 늘어뜨리기 (티셔츠) — 위만 하면 천이 가슴 모양대로 눌려 속옷 윤곽처럼 턱이 지고, 가슴 밑 · 허리로 말려 들어가 접혔다.
    // 진짜 티셔츠는 가장 튀어나온 곳(앞은 가슴, 옆은 겨드랑이 밑)에서 거의 곧게 떨어진다.
    // 몸통을 빙 둘러 방향(각도)마다 겨드랑이 밑 가장 먼 곳을 찾고, 그보다 아래는 그 선에서 DRAPE_SLOPE 보다 안으로 들어가지 않게 편다.
    if (slot === "top") {
      const armpitY = tByName.get("J_Bip_L_UpperArm").getWorldMatrix()[13] - 0.06;
      const hips = tByName.get("J_Bip_C_Hips").getWorldMatrix();
      const centre = [hips[12], hips[14]];
      const BINS = 48;
      const polar = (p) => {
        const dx = p[0] - centre[0], dz = p[2] - centre[1];
        return { angle: ((Math.atan2(dx, dz) / (2 * Math.PI)) * BINS + BINS) % BINS, r: Math.hypot(dx, dz) };
      };
      const collarY = tByName.get("J_Bip_C_Neck").getWorldMatrix()[13] - 0.025;
      const torso = (p) => (p[1] < armpitY && Math.abs(p[0] - centre[0]) < 0.24) || (p[1] < collarY && Math.abs(p[0] - centre[0]) < 0.12);
      // 기준은 몸 피부 — 옷에서 잡았더니 겨드랑이 밑 소매 끝자락이 가장 먼 곳으로 잡혀 치마처럼 퍼졌다.
      // 겨드랑이 3cm 밑부터 20cm 아래까지(가슴 · 겨드랑이 밑) 몸통 피부의 방향마다 가장 먼 곳 + MARGIN
      // 반바지 윗단 — 높이와 방향마다 바깥 반지름
      const shorts = [];
      const rimY = shorts.length ? Math.max(...shorts.filter((p) => Math.abs(p[0] - centre[0]) < 0.2).map((p) => p[1])) : 0;
      const rim = shorts.length ? new Array(BINS).fill(0) : null;
      if (rim) for (const p of shorts) {
        if (p[1] < rimY - 0.025) continue;
        const { angle, r } = polar(p);
        rim[Math.floor(angle)] = Math.max(rim[Math.floor(angle)], r);
      }
      let lastButt = null;
      const drape = () => {
        const apex = Array.from({ length: BINS }, () => ({ r: 0, y: armpitY }));
        for (const p of skin.points) {
          if (p[1] > armpitY - 0.03 || p[1] < armpitY - 0.23 || Math.abs(p[0] - centre[0]) > 0.17) continue;
          const { angle, r } = polar(p);
          const bin = Math.floor(angle);
          if (r + MARGIN > apex[bin].r) apex[bin] = { r: r + MARGIN, y: p[1] };
        }
        // 쇄골 높이 — 가슴 꼭대기에서 위로는 여기까지 곧은 비탈 (가슴 위가 움푹 꺼졌다 솟아 속옷 윤곽처럼 보였다)
        // 엉덩이 — 허리 아래 몸통 피부의 방향마다 가장 먼 곳. 뒤쪽은 여기서 곧게 떨어진다
        // (허리에 붙이고 나니 뒤 밑단이 엉덩이 아래로 말려 들어가 굴곡이 그대로 드러났다)
        const butt = Array.from({ length: BINS }, () => ({ r: 0, y: 0 }));
        for (const p of skin.points) {
          if (p[1] > tRadial.waistY || p[1] < tRadial.crotchY || Math.abs(p[0] - centre[0]) > 0.2) continue;
          const { angle, r } = polar(p);
          const bin = Math.floor(angle);
          if (r + MARGIN > butt[bin].r) butt[bin] = { r: r + MARGIN, y: p[1] };
        }
        // 천은 엉덩이 사이 골을 건너간다 — 옆 방향(±4)의 반지름을 이 방향으로 비춘 값(r · cos Δ)까지 메운다.
        // 방향마다 피부를 따라가니 골까지 따라 들어가 엉덩이 두 굴곡이 그대로 드러났다
        lastButt = butt.map((own, bin) => {
          let best = own;
          for (let k = -4; k <= 4; k += 1) {
            const other = butt[(bin + k + BINS) % BINS];
            const r = other.r * Math.cos((k * 2 * Math.PI) / BINS);
            if (r > best.r) best = { r, y: other.y };
          }
          return best;
        });
        const collar = new Array(BINS).fill(0);
        for (const p of skin.points) {
          if (Math.abs(p[1] - collarY) > 0.012 || Math.abs(p[0] - centre[0]) > 0.12) continue;
          const { angle, r } = polar(p);
          const bin = Math.floor(angle);
          collar[bin] = Math.max(collar[bin], r + MARGIN);
        }
        // 옆 방향끼리 고르게 — 세로 골이 지지 않게
        const blurred = apex.map((_, i) => {
          let r = 0, y = 0;
          for (let k = -2; k <= 2; k += 1) {
            const a = apex[(i + k + BINS) % BINS];
            const w = 3 - Math.abs(k);
            r += a.r * w;
            y += a.y * w;
          }
          let c = 0, cw = 0;
          for (let k = -2; k <= 2; k += 1) {
            const value = collar[(i + k + BINS) % BINS];
            if (!value) continue;
            c += value * (3 - Math.abs(k));
            cw += 3 - Math.abs(k);
          }
          return { r: r / 9, y: y / 9, collar: cw ? c / cw : 0 };
        });
        for (const p of world) {
          if (!torso(p)) continue;
          const { angle, r } = polar(p);
          const i = Math.floor(angle), f = angle - i;
          const a = blurred[i], b = blurred[(i + 1) % BINS];
          const apexR = a.r * (1 - f) + b.r * f;
          const apexY = a.y * (1 - f) + b.y * f;
          let minR = 0;
          if (apexR && p[1] >= apexY) {
            // 위 — 앞쪽 가운데(쇄골 폭 안)만, 쇄골에서 꼭대기까지 곧게
            const collarR = a.collar * (1 - f) + b.collar * f;
            if (collarR && p[1] < collarY && Math.abs(p[0] - centre[0]) <= 0.12) {
              const t = (p[1] - apexY) / (collarY - apexY);
              minR = apexR + (collarR - apexR) * t;
            }
          } else if (apexR) {
            // 아래 — 앞쪽(±60°)만. 옆 · 뒤까지 늘어뜨렸더니 옷이 사다리꼴로 부풀었다(옆 · 뒤는 여유 옮기기로 몸을 따른다)
            const front = Math.abs(angle - (angle > BINS / 2 ? BINS : 0)) < BINS / 6;
            if (front) minR = apexR - DRAPE_SLOPE * (apexY - p[1]);
          }
          // 반바지 윗단 — 그 위 RIM_RISE 까지는 비스듬히 덮는다. 윗단 바로 위에서 몸 쪽으로 꺾여 허리에 가로 턱이 졌다
          if (rim && p[1] > rimY - 0.03 && p[1] < rimY + RIM_RISE) {
            const rimR = rim[i] * (1 - f) + rim[(i + 1) % BINS] * f;
            if (rimR) minR = Math.max(minR, rimR + GARMENT_MARGIN - Math.max(0, p[1] - rimY) * RIM_SLOPE);
          }
          // 뒤쪽(±60°) 엉덩이 꼭대기 아래 — 곧게
          const back = Math.abs(angle - BINS / 2) < BINS / 6;
          if (back && lastButt) {
            const ba = lastButt[i], bb = lastButt[(i + 1) % BINS];
            const buttR = ba.r * (1 - f) + bb.r * f;
            const buttY = Math.max(ba.y, bb.y);
            // 꼭대기 아래는 곧게, 위(허리까지)는 비스듬히 — 엉덩이 꼭대기가 밑단 높이라 아래만 잡으면 걸리는 데가 없었다
            if (buttR) minR = Math.max(minR, p[1] < buttY ? buttR : buttR - BACK_SLOPE * (p[1] - buttY));
          }
          if (!minR || r >= minR) continue;
          const k = minR / (r || 1e-6);
          p[0] = centre[0] + (p[0] - centre[0]) * k;
          p[2] = centre[1] + (p[2] - centre[1]) * k;
        }
      };
      const inTorso = world.map((p) => torso(p));
      for (let round = 0; round < DRAPE_ROUNDS; round += 1) {
        drape();
        // 몸통 전체를 고르게 — 밀린 자리만 펴면 경계에 턱이 남았다
        world = world.map((p, v) => {
          if (!inTorso[v] || !neighbours[v].size) return p;
          const avg = [0, 0, 0];
          for (const n of neighbours[v]) for (let c = 0; c < 3; c += 1) avg[c] += world[n][c] / neighbours[v].size;
          return p.map((c, k) => c * 0.4 + avg[k] * 0.6);
        });
        pushed = pushOut(touched);
        weld();
      }
      drape();
      // 마지막 밀기를 몇 번 — 한 번으로는 가슴 밑 · 허리 옆에 피부가 뚫고 나온 작은 구멍이 남았다
      for (let round = 0; round < 4; round += 1) {
        pushOut(touched);
        weld();
      }
      // 마지막 — 몸통 축에서 바깥(가로)으로 본 피부보다 앞에. 피부 면 방향으로 밀면 아래를 보는 가슴 밑면을 못 잡아
      // 처진 가슴(비비) 밑에 살이 비쳤다
      const near = aroundFinder(skin);
      for (let round = 0; round < 3; round += 1) {
        for (let v = 0; v < count; v += 1) {
          const p = world[v];
          if (!torso(p)) continue;
          const dir = norm([p[0] - centre[0], 0, p[2] - centre[1]]);
          let need = 0;
          for (const i of near(p)) {
            const offset = sub(skin.points[i], p);
            const d = dot(offset, dir);
            if (d < -0.03) continue;
            const lateral = Math.hypot(offset[0] - dir[0] * d, offset[1], offset[2] - dir[2] * d);
            if (lateral > RAY_WIDTH) continue;
            need = Math.max(need, d + MARGIN);
          }
          if (need > 0) for (let c = 0; c < 3; c += 1) p[c] += dir[c] * need;
        }
        weld();
        // 밀린 자리 둘레를 살짝 고르게
        world = world.map((p, v) => {
          if (!torso(p) || !neighbours[v].size) return p;
          const avg = [0, 0, 0];
          for (const n of neighbours[v]) for (let c = 0; c < 3; c += 1) avg[c] += world[n][c] / neighbours[v].size;
          return p.map((c, k) => c * 0.75 + avg[k] * 0.25);
        });
      }
    }

    // 반바지 허리 집어넣기 — 티셔츠에 덮이는 곳은 티셔츠 안쪽(TUCK)으로. 티셔츠 면 방향이 바깥(몸 중심에서 멀어지는 쪽)이 되게 맞춰 본다
    if (slot === "bottom" && tee) {
      const near = aroundFinder(tee);
      const hips = tByName.get("J_Bip_C_Hips").getWorldMatrix();
      for (let v = 0; v < count; v += 1) {
        let worst = 0;
        let dir = null;
        for (const i of near(world[v])) {
          let n = tee.normals[i];
          const out = [tee.points[i][0] - hips[12], 0, tee.points[i][2] - hips[14]];
          if (dot(n, out) < 0) n = n.map((c) => -c);
          const offset = sub(world[v], tee.points[i]);
          const d = dot(offset, n);
          const lateral = Math.hypot(offset[0] - n[0] * d, offset[1] - n[1] * d, offset[2] - n[2] * d);
          if (lateral > 0.02 || d < -0.04) continue;
          const want = d + TUCK;
          if (want > worst) (worst = want), (dir = n);
        }
        if (dir) for (let c = 0; c < 3; c += 1) world[v][c] -= dir[c] * worst;
        // 가로로 본 티셔츠보다 안에 — 면 방향만 보면 비스듬한 티셔츠 아랫단 밑에서 반바지가 점처럼 비쳤다
        const out = norm([world[v][0] - hips[12], 0, world[v][2] - hips[14]]);
        let inward = 0;
        for (const i of near(world[v])) {
          const offset = sub(tee.points[i], world[v]);
          const d = dot(offset, out);
          const lateral = Math.hypot(offset[0] - out[0] * d, offset[1], offset[2] - out[2] * d);
          if (lateral > RAY_WIDTH || d > 0.03) continue;
          inward = Math.max(inward, TUCK - d);
        }
        if (inward > 0) for (let c = 0; c < 3; c += 1) world[v][c] -= out[c] * inward;
      }
    }

    // 뼈 가중치는 바로 밑 몸 피부 것을 섞어 쓴다 — 기본 캐릭터 옷 가중치를 그대로 쓰면 몸과 다르게 휘어
    // 자세를 잡으면(서기 동작) 가슴 가운데 피부가 옷을 뚫고 나왔다. 정점마다 가까운 피부 것을 따로 쓰면 휠 때 천이 우글거려
    // 이웃끼리 몇 번 고르게 편다
    let vertexWeights = world.map((p, v) => {
      const blended = new Map();
      for (const [j, w] of weightMaps[v]) blended.set(j, w * (1 - SKIN_WEIGHT));
      const nearestSkin = [];
      for (const i of around(p)) if (skin.weights[i]) nearestSkin.push([Math.hypot(...sub(skin.points[i], p)), i]);
      if (!nearestSkin.length) return weightMaps[v];
      nearestSkin.sort((x, y) => x[0] - y[0]);
      const picked = nearestSkin.slice(0, 6);
      const inv = picked.map(([d]) => 1 / Math.max(d, 0.004));
      const invSum = inv.reduce((x, y) => x + y, 0);
      picked.forEach(([, i], n) => {
        for (const [j, w] of skin.weights[i]) blended.set(j, (blended.get(j) ?? 0) + w * SKIN_WEIGHT * (inv[n] / invSum));
      });
      return blended;
    });
    for (let round = 0; round < WEIGHT_SMOOTH; round += 1) {
      vertexWeights = vertexWeights.map((own, v) => {
        const sum = new Map(own);
        let n = 1;
        for (const u of neighbours[v]) {
          for (const [j, w] of vertexWeights[u]) sum.set(j, (sum.get(j) ?? 0) + w);
          n += 1;
        }
        for (const [j, w] of sum) sum.set(j, w / n);
        return sum;
      });
    }

    const out = new Float32Array(count * 3);
    const outUv = new Float32Array(count * 2);
    const outJoints = new Uint16Array(count * 4);
    const outWeights = new Float32Array(count * 4);
    for (let v = 0; v < count; v += 1) {
      out.set(apply(tToMesh, world[v]), v * 3);
      outUv.set(uvs[v], v * 2);
      const source = vertexWeights[v];
      // 무거운 뼈 넷 — 합이 1 이 되게
      const top = [...source].sort((x, y) => y[1] - x[1]).slice(0, 4);
      const sum = top.reduce((total, [, w]) => total + w, 0) || 1;
      top.forEach(([j, w], k) => {
        outJoints[v * 4 + k] = j;
        outWeights[v * 4 + k] = w / sum;
      });
    }

    // 3. 새 옷 — 재질 · 그림은 기준 옷 그대로(이름만 ITEMS_)
    const sMaterial = primitive.getMaterial();
    const sTexture = sMaterial.getBaseColorTexture();
    const material = target
      .createMaterial(name)
      .setBaseColorFactor(sMaterial.getBaseColorFactor())
      .setMetallicFactor(0)
      .setRoughnessFactor(roughness)
      .setDoubleSided(true)
      .setAlphaMode(sMaterial.getAlphaMode())
      .setAlphaCutoff(sMaterial.getAlphaCutoff());
    if (sTexture) material.setBaseColorTexture(target.createTexture(`${name}-base`).setImage(sTexture.getImage()).setMimeType(sTexture.getMimeType()));
    const buffer = target.getRoot().listBuffers()[0];
    const copy = target
      .createPrimitive()
      .setMaterial(material)
      .setAttribute("POSITION", target.createAccessor().setType("VEC3").setArray(out).setBuffer(buffer))
      .setAttribute("TEXCOORD_0", target.createAccessor().setType("VEC2").setArray(outUv).setBuffer(buffer))
      .setAttribute("JOINTS_0", target.createAccessor().setType("VEC4").setArray(outJoints).setBuffer(buffer))
      .setAttribute("WEIGHTS_0", target.createAccessor().setType("VEC4").setArray(outWeights).setBuffer(buffer))
      .setIndices(target.createAccessor().setType("SCALAR").setArray(new Uint32Array(triangles)).setBuffer(buffer));
    tNode.getMesh().addPrimitive(copy);
    if (slot === "top") {
      // 티셔츠 안쪽 면 — 반바지를 집어넣을 때 쓴다
      const normals = world.map(() => [0, 0, 0]);
      for (let i = 0; i < triangles.length; i += 3) {
        const [a, b, c] = [triangles[i], triangles[i + 1], triangles[i + 2]];
        const n = cross(sub(world[b], world[a]), sub(world[c], world[a]));
        for (const v of [a, b, c]) for (let k = 0; k < 3; k += 1) normals[v][k] += n[k];
      }
      tee = { points: world, normals: normals.map(norm) };
    }
    counts[slot] = { vertices: count, pushed };
  }
  return counts;
}

/** dist 의 캐릭터들에 입힌다 — build.mjs 끝에서 (기준 캐릭터가 먼저 만들어져 있어야 한다) */
export async function dressAll(dist = join(root, "dist", "characters")) {
  const sourcePath = join(dist, DRESS_SOURCE, "game.glb");
  if (!existsSync(sourcePath)) return;
  const source = await io.read(sourcePath);
  for (const id of readdirSync(dist)) {
    if (id === DRESS_SOURCE) continue;
    const file = join(dist, id, "game.glb");
    if (!existsSync(file)) continue;
    const document = await io.read(file);
    if (wearsTeeAndShorts(document)) continue;
    const counts = dressFrom(document, source);
    if (!counts) continue;
    await io.write(file, document);
    console.log(`  ${id}: 기본 옷 입힘 — 상의 ${counts.top?.vertices ?? 0} (밀어냄 ${counts.top?.pushed ?? 0}) · 하의 ${counts.bottom?.vertices ?? 0} (밀어냄 ${counts.bottom?.pushed ?? 0})`);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) await dressAll();
