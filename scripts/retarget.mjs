/**
 * VRoid 가 아닌 VRM(예: Mixamo 뼈대의 100Avatars)을 게임 동작이 붙는 VRoid 뼈대로 바꾼다.
 *
 * 게임은 동작(player-anims.glb)의 뼈별 회전을 **이름으로** 그대로 옮겨 붙인다. 그러려면 두 가지가 같아야 한다:
 *   1. 뼈 이름 — VRM 의 휴머노이드 표(hips · leftUpperArm …)로 VRoid 이름(J_Bip_C_Hips …)을 붙인다
 *   2. 쉬는 자세의 뼈 방향 — 휴머노이드 뼈마다 VRoid 의 쉬는 자세 방향(월드 회전)으로 돌려 둔다
 * 뼈를 돌리면 피부가 따라 비틀리므로, 바인드 행렬(inverseBindMatrices)을 다시 계산해 쉬는 모습은 그대로 둔다:
 *   IBM_new = inv(J_new) · M · J_old · IBM_old   (M = 앞 방향 · 크기 맞춤)
 * 앞 방향: VRM 0.x 는 -Z 를 보고 VRM 1.0(VRoid)은 +Z 를 본다 → 0.x 면 Y 축으로 180° 돌린다.
 * 크기: 엉덩이 높이를 VRoid 와 같게 — 다리 길이가 같아져 동작의 엉덩이 위치가 그대로 맞는다.
 * 뼈 길이는 모델 것을 쓴다 — 표지 노드(ITEMS_KEEP_BONE_LENGTHS)를 두면 게임이 엉덩이 말고는 위치 채널을 버린다.
 */
import { MathUtils } from "@gltf-transform/core";

export const KEEP_LENGTHS_MARKER = "ITEMS_KEEP_BONE_LENGTHS";

// ── 4×4 행렬 (glTF 처럼 열 우선) ─────────────────────────────────────────
function mul(a, b) {
  const out = new Array(16).fill(0);
  for (let c = 0; c < 4; c += 1)
    for (let r = 0; r < 4; r += 1) {
      let sum = 0;
      for (let k = 0; k < 4; k += 1) sum += a[k * 4 + r] * b[c * 4 + k];
      out[c * 4 + r] = sum;
    }
  return out;
}

function invert(m) {
  const inv = new Array(16);
  inv[0] = m[5] * m[10] * m[15] - m[5] * m[11] * m[14] - m[9] * m[6] * m[15] + m[9] * m[7] * m[14] + m[13] * m[6] * m[11] - m[13] * m[7] * m[10];
  inv[4] = -m[4] * m[10] * m[15] + m[4] * m[11] * m[14] + m[8] * m[6] * m[15] - m[8] * m[7] * m[14] - m[12] * m[6] * m[11] + m[12] * m[7] * m[10];
  inv[8] = m[4] * m[9] * m[15] - m[4] * m[11] * m[13] - m[8] * m[5] * m[15] + m[8] * m[7] * m[13] + m[12] * m[5] * m[11] - m[12] * m[7] * m[9];
  inv[12] = -m[4] * m[9] * m[14] + m[4] * m[10] * m[13] + m[8] * m[5] * m[14] - m[8] * m[6] * m[13] - m[12] * m[5] * m[10] + m[12] * m[6] * m[9];
  inv[1] = -m[1] * m[10] * m[15] + m[1] * m[11] * m[14] + m[9] * m[2] * m[15] - m[9] * m[3] * m[14] - m[13] * m[2] * m[11] + m[13] * m[3] * m[10];
  inv[5] = m[0] * m[10] * m[15] - m[0] * m[11] * m[14] - m[8] * m[2] * m[15] + m[8] * m[3] * m[14] + m[12] * m[2] * m[11] - m[12] * m[3] * m[10];
  inv[9] = -m[0] * m[9] * m[15] + m[0] * m[11] * m[13] + m[8] * m[1] * m[15] - m[8] * m[3] * m[13] - m[12] * m[1] * m[11] + m[12] * m[3] * m[9];
  inv[13] = m[0] * m[9] * m[14] - m[0] * m[10] * m[13] - m[8] * m[1] * m[14] + m[8] * m[2] * m[13] + m[12] * m[1] * m[10] - m[12] * m[2] * m[9];
  inv[2] = m[1] * m[6] * m[15] - m[1] * m[7] * m[14] - m[5] * m[2] * m[15] + m[5] * m[3] * m[14] + m[13] * m[2] * m[7] - m[13] * m[3] * m[6];
  inv[6] = -m[0] * m[6] * m[15] + m[0] * m[7] * m[14] + m[4] * m[2] * m[15] - m[4] * m[3] * m[14] - m[12] * m[2] * m[7] + m[12] * m[3] * m[6];
  inv[10] = m[0] * m[5] * m[15] - m[0] * m[7] * m[13] - m[4] * m[1] * m[15] + m[4] * m[3] * m[13] + m[12] * m[1] * m[7] - m[12] * m[3] * m[5];
  inv[14] = -m[0] * m[5] * m[14] + m[0] * m[6] * m[13] + m[4] * m[1] * m[14] - m[4] * m[2] * m[13] - m[12] * m[1] * m[6] + m[12] * m[2] * m[5];
  inv[3] = -m[1] * m[6] * m[11] + m[1] * m[7] * m[10] + m[5] * m[2] * m[11] - m[5] * m[3] * m[10] - m[9] * m[2] * m[7] + m[9] * m[3] * m[6];
  inv[7] = m[0] * m[6] * m[11] - m[0] * m[7] * m[10] - m[4] * m[2] * m[11] + m[4] * m[3] * m[10] + m[8] * m[2] * m[7] - m[8] * m[3] * m[6];
  inv[11] = -m[0] * m[5] * m[11] + m[0] * m[7] * m[9] + m[4] * m[1] * m[11] - m[4] * m[3] * m[9] - m[8] * m[1] * m[7] + m[8] * m[3] * m[5];
  inv[15] = m[0] * m[5] * m[10] - m[0] * m[6] * m[9] - m[4] * m[1] * m[10] + m[4] * m[2] * m[9] + m[8] * m[1] * m[6] - m[8] * m[2] * m[5];
  const det = m[0] * inv[0] + m[1] * inv[4] + m[2] * inv[8] + m[3] * inv[12];
  if (Math.abs(det) < 1e-12) throw new Error("뒤집을 수 없는 행렬");
  return inv.map((v) => v / det);
}

const translationOf = (m) => [m[12], m[13], m[14]];
function rotationOf(m) {
  const t = [0, 0, 0];
  const r = [0, 0, 0, 1];
  const s = [1, 1, 1];
  MathUtils.decompose(m, t, r, s);
  return r;
}
const compose = (t, r, s = [1, 1, 1]) => MathUtils.compose(t, r, s, new Array(16));

// ── 휴머노이드 표 ─────────────────────────────────────────────────────────

/** VRM 0.x 의 엄지 이름 → VRM 1.0 이름 (나머지는 같다) */
const V0_TO_V1 = {
  leftThumbProximal: "leftThumbMetacarpal",
  leftThumbIntermediate: "leftThumbProximal",
  rightThumbProximal: "rightThumbMetacarpal",
  rightThumbIntermediate: "rightThumbProximal",
};

/** VRM json → { VRM1 뼈 이름: 노드 번호 }, 0.x 인가 */
export function humanoidOf(json) {
  const v1 = json.extensions?.VRMC_vrm?.humanoid?.humanBones;
  if (v1) return { bones: Object.fromEntries(Object.entries(v1).map(([bone, entry]) => [bone, entry.node])), v0: false };
  const v0 = json.extensions?.VRM?.humanoid?.humanBones;
  if (v0) return { bones: Object.fromEntries(v0.map((entry) => [V0_TO_V1[entry.bone] ?? entry.bone, entry.node])), v0: true };
  return null;
}

/** 이미 VRoid 뼈대인가 (뼈 이름이 J_Bip_ 로 시작) */
export function isVroidRig(json) {
  const hips = humanoidOf(json)?.bones.hips;
  return hips !== undefined && /^J_Bip_/.test(json.nodes[hips]?.name ?? "");
}

/**
 * 모델 문서(doc · json)를 기준 VRoid(refDoc · refJson)의 뼈대 모양으로 바꾼다. 문서를 그 자리에서 고친다.
 * 돌려주는 것: 바꾼 뼈 수 · 크기 배율 · 기준에 없어 남은 뼈
 */
export function toVroidRig(doc, json, refDoc, refJson) {
  const model = humanoidOf(json);
  const ref = humanoidOf(refJson);
  if (!model || !ref) throw new Error("휴머노이드 표가 없습니다");

  const nodes = doc.getRoot().listNodes();
  const refNodes = refDoc.getRoot().listNodes();
  const oldWorld = new Map(nodes.map((node) => [node, node.getWorldMatrix().slice()]));

  // 휴머노이드 노드 → (VRM1 뼈 이름, VRoid 이름, VRoid 쉬는 자세 월드 회전)
  const human = new Map();
  const unmatched = [];
  for (const [bone, index] of Object.entries(model.bones)) {
    const refIndex = ref.bones[bone];
    if (refIndex === undefined) {
      unmatched.push(bone);
      continue;
    }
    const refNode = refNodes[refIndex];
    human.set(nodes[index], { bone, name: refNode.getName(), rotation: rotationOf(refNode.getWorldMatrix()) });
  }

  // 앞 방향 · 크기
  const turn = model.v0 ? compose([0, 0, 0], [0, 1, 0, 0]) : compose([0, 0, 0], [0, 0, 0, 1]);
  const hipsNode = nodes[model.bones.hips];
  const hipsY = translationOf(mul(turn, oldWorld.get(hipsNode)))[1];
  const refHipsY = translationOf(refNodes[ref.bones.hips].getWorldMatrix())[1];
  const scale = refHipsY / hipsY;
  const M = mul(compose([0, 0, 0], [0, 0, 0, 1], [scale, scale, scale]), turn);

  // 새 월드 행렬 — 휴머노이드 뼈는 VRoid 방향(크기 1), 피부 메시 노드는 그대로(스킨이 위치를 정한다), 나머지는 M 만 곱한다
  const skinned = new Set(nodes.filter((node) => node.getSkin()));
  const newWorld = new Map();
  for (const node of nodes) {
    const moved = mul(M, oldWorld.get(node));
    const entry = human.get(node);
    if (entry) newWorld.set(node, compose(translationOf(moved), entry.rotation));
    else if (skinned.has(node)) newWorld.set(node, oldWorld.get(node));
    else newWorld.set(node, moved);
  }

  // 지역 변환 — 부모의 새 월드 기준으로
  for (const node of nodes) {
    const parent = node.getParentNode();
    const local = parent ? mul(invert(newWorld.get(parent)), newWorld.get(node)) : newWorld.get(node);
    const t = [0, 0, 0];
    const r = [0, 0, 0, 1];
    const s = [1, 1, 1];
    MathUtils.decompose(local, t, r, s);
    node.setTranslation(t).setRotation(r).setScale(s);
  }

  // 바인드 행렬 — 쉬는 모습이 그대로 남게
  for (const skin of doc.getRoot().listSkins()) {
    const accessor = skin.getInverseBindMatrices();
    if (!accessor) continue;
    const joints = skin.listJoints();
    const array = new Float32Array(joints.length * 16);
    joints.forEach((joint, k) => {
      const old = Array.from(accessor.getElement(k, new Array(16)));
      const next = mul(mul(mul(invert(newWorld.get(joint)), M), oldWorld.get(joint)), old);
      array.set(next, k * 16);
    });
    // 같은 접근자를 다른 스킨이 같이 쓸 수 있으니 새로 만든다
    const fresh = doc.createAccessor().setType("MAT4").setArray(array).setBuffer(accessor.getBuffer());
    skin.setInverseBindMatrices(fresh);
  }

  // 이름 바꾸기 — 게임 동작은 VRoid 이름으로 뼈를 찾는다
  for (const [node, entry] of human) node.setName(entry.name);

  // 표지 — 게임이 엉덩이 말고는 동작의 위치 채널을 버리게 (뼈 길이는 이 모델 것)
  const marker = doc.createNode(KEEP_LENGTHS_MARKER);
  doc.getRoot().getDefaultScene()?.addChild(marker);

  return { bones: human.size, scale, unmatched };
}
