/**
 * 체형 굽기 — 몸 메시의 쉬는 자세 정점을 직접 옮겨 가슴 · 허리 · 골반 볼륨을 낸다.
 *
 * VRoid 의 체형 슬라이더는 내보낼 때 메시에 굳어 버려 뒤에서 고칠 손잡이가 없다. 트위스트 샘플(기본 캐릭터 여)은
 * 기본 캐릭터(남)와 몸이 거의 같아(옆모습이 겹친다) 여성형으로 보이지 않았다.
 * 가슴 뼈(J_Sec_*_Bust1) 크기를 키워 보기도 했지만 그 뼈에 묶인 정점이 100 개 남짓이라 티셔츠가 각지게 튀고
 * 가방끈이 몸을 뚫었다. 그래서 뼈가 아니라 **자리(뼈 위치를 기준으로 한 부드러운 구역)** 로 정점을 민다.
 *
 * 옷 · 피부 · 머리카락을 가리지 않고 같은 구역이면 같이 민다 — 피부만 밀면 옷을 뚫고, 옷만 밀면 속이 빈다.
 * 앞쪽(+Z)이 정면이다 (기준 VRoid 1.0 뼈대 — retarget 이 이 방향으로 맞춘다).
 *
 * meta.json 의 "shape": { "bust": 1, "waist": 1, "hips": 1, "drape": true } — 배수. 0 이면 그 부분은 그대로. 없으면 굽지 않는다.
 * drape: false 면 윗옷이 가슴에서 늘어지지 않는다(몸에 붙는 바디슈트 · 니트), 허리도 같이 조인다.
 * bustAt: 가슴 중심 — "tip"(기본) 가슴 끝 뼈(Bust2) 높이 · "chest" 가슴 뼈와 Bust1 사이 아래쪽(옛 공식).
 */

/** 기본 세기 (m) — 배수 1 일 때 */
const BUST_FORWARD = 0.034;
const BUST_RADIUS = { x: 0.075, y: 0.06 };
/** 윗옷(Tops)은 가슴 꼭지에서 아래로 늘어진다 — 아래쪽으로 이만큼(m)에 걸쳐 서서히 줄어든다 */
const DRAPE = 0.2;
const WAIST_PINCH = 0.06;
const HIP_OUT = 0.02;
const HIP_BACK = 0.014;

const smooth = (edge0, edge1, x) => {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
};

/** 4x4 (열 우선) 곱 */
const mat4Mul = (a, b) => {
  const o = new Array(16).fill(0);
  for (let c = 0; c < 4; c += 1) for (let r = 0; r < 4; r += 1) for (let k = 0; k < 4; k += 1) o[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k];
  return o;
};
/** 아핀 4x4 역행렬 */
const mat4Inv = (m) => {
  const [a, b, c, d, e, f, g, h, i] = [m[0], m[4], m[8], m[1], m[5], m[9], m[2], m[6], m[10]];
  const det = a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g);
  const r = [(e * i - f * h) / det, (c * h - b * i) / det, (b * f - c * e) / det, (f * g - d * i) / det, (a * i - c * g) / det, (c * d - a * f) / det, (d * h - e * g) / det, (b * g - a * h) / det, (a * e - b * d) / det];
  const t = [m[12], m[13], m[14]];
  const out = [r[0], r[3], r[6], 0, r[1], r[4], r[7], 0, r[2], r[5], r[8], 0, 0, 0, 0, 1];
  for (let row = 0; row < 3; row += 1) out[12 + row] = -(out[row] * t[0] + out[4 + row] * t[1] + out[8 + row] * t[2]);
  return out;
};
const apply = (m, [x, y, z]) => [m[0] * x + m[4] * y + m[8] * z + m[12], m[1] * x + m[5] * y + m[9] * z + m[13], m[2] * x + m[6] * y + m[10] * z + m[14]];

/**
 * 메시 좌표 → 몸(세상) 좌표.
 * 정점은 메시 자기 좌표인데 뼈 위치 · 앞(+Z)은 세상 좌표다. 둘이 같지 않다 — 옛 VRoid(0.x, 비타 등)는 메시가 뒤(-Z)를 보고
 * 뼈대 맞추기가 180° 돌려 세운다. 그대로 밀었더니 가슴이 등에, 엉덩이가 배에 돋았다. 트위스트도 크기가 1.12 배 달랐다.
 * 쉬는 자세 = 묶는 자세라 아무 뼈 하나의 (세상 행렬 × 역바인드 행렬)이 곧 메시 → 세상이다.
 */
function meshToWorld(document, mesh) {
  for (const node of document.getRoot().listNodes()) {
    if (node.getMesh() !== mesh) continue;
    const skin = node.getSkin();
    if (skin && skin.listJoints().length) {
      const ibm = [];
      skin.getInverseBindMatrices()?.getElement(0, ibm);
      return ibm.length ? mat4Mul(skin.listJoints()[0].getWorldMatrix(), ibm) : node.getWorldMatrix();
    }
    return node.getWorldMatrix();
  }
  return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
}

function worldOf(document, name) {
  const node = document.getRoot().listNodes().find((entry) => entry.getName() === name);
  if (!node) return null;
  const m = node.getWorldMatrix();
  return [m[12], m[13], m[14]];
}

/** 돌려주는 것: 옮긴 정점 수 */
export function shapeBody(document, shape) {
  const bust = shape.bust ?? 0;
  const waist = shape.waist ?? 0;
  const hips = shape.hips ?? 0;

  const left = worldOf(document, "J_Sec_L_Bust1");
  const right = worldOf(document, "J_Sec_R_Bust1");
  const hipsBone = worldOf(document, "J_Bip_C_Hips");
  const upperLeg = worldOf(document, "J_Bip_L_UpperLeg");
  const chest = worldOf(document, "J_Bip_C_Chest");
  if (!hipsBone || !upperLeg || !chest) throw new Error("체형 굽기: 엉덩이 · 허벅지 · 가슴 뼈를 찾지 못했습니다");

  // 가슴 한가운데 — VRoid 가슴 뼈(Bust1)는 윗가슴 높이(쇄골 바로 밑)에 있어 그대로 쓰면 목 밑이 부푼다.
  // 높이는 가슴 뼈(J_Bip_C_Chest)와 Bust1 사이 아래쪽 1/3, 깊이는 가슴 뼈 앞
  // shape.bustAt === "tip" 이면 가슴 끝 뼈(Bust2) 높이 — 몸에 붙는 옷 · 피부가 드러난 모델은 가슴 꼭지가 그 높이에 있다.
  // (기본 공식은 트위스트 샘플에 맞췄는데, 비타에서는 가슴 밑선(1.22m)을 가리켜 꼭지(1.29m)는 거의 안 나왔다)
  // 기본이 tip — 메시 좌표를 세상 좌표로 바꾸고 나니 트위스트도 가슴 꼭지가 Bust2 높이에 있었다 ("chest" 는 옛 공식)
  const useTip = shape.bustAt !== "chest";
  const tips = useTip ? ["J_Sec_L_Bust2", "J_Sec_R_Bust2"].map((name) => worldOf(document, name)) : [];
  const centres =
    useTip && tips.every(Boolean)
      ? tips.map(([x, y]) => [x * 0.9, y - 0.015, chest[2] - 0.03])
      : [left, right].filter(Boolean).map(([x, y]) => [x * 1.15, chest[1] + (y - chest[1]) * 0.3, chest[2]]);
  const waistY = (hipsBone[1] + chest[1]) / 2;
  const hipY = (hipsBone[1] + upperLeg[1]) / 2 - 0.03;
  const torsoZ = hipsBone[2];

  const done = new Set();
  let moved = 0;
  for (const mesh of document.getRoot().listMeshes()) {
    const toWorld = meshToWorld(document, mesh);
    const toMesh = mat4Inv(toWorld);
    for (const primitive of mesh.listPrimitives()) {
      const position = primitive.getAttribute("POSITION");
      if (!position || done.has(position)) continue;
      done.add(position);
      const material = primitive.getMaterial()?.getName() ?? "";
      // 윗옷 — 가슴에서 아래로 늘어지고, 허리는 조이지 않는다(헐렁한 티셔츠가 울퉁불퉁해졌다)
      // shape.drape === false 면 몸에 붙는 옷(바디슈트) — 늘어지지 않고 가슴을 따라 붙는다
      const top = shape.drape !== false && /Tops/i.test(material);

      const v = [0, 0, 0];
      for (let index = 0; index < position.getCount(); index += 1) {
        position.getElement(index, v);
        const [x, y, z] = apply(toWorld, v);
        // 몸통만 — 쉬는 자세(T 자)라 팔은 몸통보다 바깥에 있다
        const torso = 1 - smooth(0.16, 0.22, Math.abs(x));
        if (torso <= 0) continue;
        let dx = 0;
        let dy = 0;
        let dz = 0;

        if (bust) {
          for (const [cx, cy, cz] of centres) {
            const fx = (x - cx) / BUST_RADIUS.x;
            // 윗옷은 가슴 아래로 천이 늘어져 있다 — 아래쪽은 DRAPE 에 걸쳐 천천히 줄어든다
            const below = top && y < cy;
            const fy = below ? (y - cy) / DRAPE : (y - cy) / BUST_RADIUS.y;
            const fall = Math.exp(-(fx * fx + fy * fy) * 1.6);
            // 앞면만 — 등 쪽 정점은 그대로 (가슴 뼈보다 앞부터 서서히)
            const front = smooth(cz + 0.01, cz + 0.05, z);
            const w = fall * front * torso * bust;
            dz += BUST_FORWARD * w;
            // 아래쪽이 조금 더 나오게 — 둥근 모양
            dy -= 0.006 * w;
            dx += Math.sign(x - 0) * 0.004 * w;
          }
        }

        if (waist && !top) {
          const band = Math.exp(-(((y - waistY) / 0.06) ** 2));
          dx -= x * WAIST_PINCH * band * torso * waist;
          dz -= (z - torsoZ) * WAIST_PINCH * 0.5 * band * torso * waist;
        }

        if (hips) {
          const band = Math.exp(-(((y - hipY) / 0.085) ** 2));
          const side = smooth(0.02, 0.09, Math.abs(x));
          dx += Math.sign(x) * HIP_OUT * band * side * torso * hips;
          // 엉덩이 뒤쪽
          const back = smooth(torsoZ - 0.01, torsoZ - 0.06, z);
          dz -= HIP_BACK * band * back * torso * hips;
        }

        if (dx || dy || dz) {
          position.setElement(index, apply(toMesh, [x + dx, y + dy, z + dz]));
          moved += 1;
        }
      }
    }
  }
  return moved;
}
