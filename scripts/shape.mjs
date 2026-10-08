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
const BUST_FORWARD = 0.03;
/**
 * 가슴 한쪽의 반지름 (m, 배수 1). 위는 길고 완만하게(쇄골에서 흘러내리는 경사), 아래는 짧고 둥글게 — 물방울 모양.
 * 처음에 좁은 종 모양(가우스, 반지름 6cm)에 7~8cm 를 밀었더니 원뿔처럼 뾰족했다. 클수록 폭도 넓힌다(BUST_WIDEN).
 */
/**
 * 인체 기준 (성형외과 · 인체계측):
 *  - 흉골 위 패인 곳(쇄골 사이)과 두 꼭지가 거의 정삼각형 — 꼭지 높이 = 쇄골 높이 − 꼭지 사이 거리 × 0.87
 *  - 꼭지 사이 거리 ≈ 가슴 폭의 0.5 (20cm 넘지 않게)
 *  - 꼭지를 기준으로 위 45 : 아래 55 (Mallucci) — 윗면은 곧거나 살짝 오목, 아랫면은 볼록, 꼭지는 20° 위로
 * VRoid 는 다리가 긴 그림체라 키에 대한 비(꼭지 높이 0.71 × 키)는 쓰지 않는다 — 몸통의 기준점(쇄골 · 꼭지)끼리로 잡는다.
 */
const BUST_RADIUS = { x: 0.068, up: 0.065, down: 0.08 };
/** 가슴 꼭지를 가슴 끝 뼈(Bust2)보다 이만큼 아래에 (m) + 클수록 조금 더 처지게(BUST_SAG × (배수-1)) */
const BUST_DROP = 0.015;
const BUST_SAG = 0;
/** 미는 방향의 위쪽 성분 (앞으로 미는 양에 대한 비) — 봉긋하게 위로 */
const BUST_LIFT = 0.15;
/** 배수 1 넘게 커질 때 반지름을 늘리는 비 — 크게 늘리면 두 쪽이 합쳐져 어깨 폭 전체가 선반처럼 부풀었다(정면) */
const BUST_WIDEN = 0.1;
/** 가슴 중심을 가슴 끝 뼈보다 바깥으로 (배) — 가운데에 골이 생기게 */
const BUST_SPREAD = 1.1;
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
  const clavicle = worldOf(document, "J_Bip_L_Shoulder");
  const tips = useTip ? ["J_Sec_L_Bust2", "J_Sec_R_Bust2"].map((name) => worldOf(document, name)) : [];
  const centres =
    useTip && tips.every(Boolean)
      ? tips.map(([x, y]) => {
          const cx = x * BUST_SPREAD;
          // 쇄골 높이(어깨 뼈)에서 정삼각형으로 — 없으면 가슴 끝 뼈 높이
          const cy = clavicle ? clavicle[1] - 2 * Math.abs(cx) * 0.87 : y - BUST_DROP;
          return [cx, cy - BUST_SAG * Math.max(0, bust - 1), chest[2]];
        })
      : [left, right].filter(Boolean).map(([x, y]) => [x * 1.15, chest[1] + (y - chest[1]) * 0.3, chest[2]]);
  const waistY = (hipsBone[1] + chest[1]) / 2;
  const hipY = (hipsBone[1] + upperLeg[1]) / 2 - 0.03;
  const torsoZ = hipsBone[2];

  const widen = 1 + BUST_WIDEN * Math.max(0, bust - 1);
  const rx = BUST_RADIUS.x * widen;
  const rUp = BUST_RADIUS.up * widen;
  const rDown = BUST_RADIUS.down * widen;

  /**
   * 자리 p 를 얼마나 미나 — 앞을 보는 정도(front) · 등을 보는 정도(back)는 정점의 면 방향에서 받는다.
   * 미는 양이 자리에 따라 부드럽게 변해야 면 방향(노멀)도 같은 식으로 고칠 수 있다(아래 유한 차분).
   */
  const field = ([x, y, z], front, back, top) => {
    const torso = 1 - smooth(0.16, 0.22, Math.abs(x));
    if (torso <= 0) return [0, 0, 0];
    let dx = 0;
    let dy = 0;
    let dz = 0;

    if (bust) {
      // 양쪽을 더하지 않고 큰 쪽 — 더하면 가운데(가슴골)가 선반처럼 솟는다
      let dome = 0;
      for (const [cx, cy] of centres) {
        const fx = (x - cx) / rx;
        // 윗옷은 가슴 아래로 천이 늘어진다(DRAPE), 아니면 아래는 짧고 둥글게
        const fy = (y - cy) / (y >= cy ? rUp : top ? DRAPE : rDown);
        const r2 = fx * fx + fy * fy;
        // 위: 쇄골 아래에서 꼭지까지 비스듬한 직선에 가까운 S 자(smoothstep(1 - r)) — (1-r²)² 는 쇄골 밑이 수직으로 내려오다
        //     갑자기 부풀어 공을 붙인 것처럼 보였다(게임 옆모습)
        // 아래: (1 - r²)^1.5 — 둥글게 차고 밑선에서 부드럽게 접힌다.
        //   위 · 아래 모두 짧은 반지름에 (1-r²)² 를 썼더니 꼭지 밑 3cm 에서 7cm 가 뚝 떨어져 선반처럼 잘려 보였다
        // 봉긋하게 — 위 (1-r²)^1.3, 아래 (1-r²)^1.2 로 아래가 조금 더 차게. 위 반지름 9cm — 13cm 는 어깨 높이부터 부풀었다
        // 위 (1-r²)^2.2 — 꼭지 근처는 둥글고 위로 갈수록 곧다가 살짝 오목하게 가슴벽에 이어진다
        // 아래 (1-r²)^1.1 — 볼록하게 차고 밑선(유방 아래 주름)에서 접힌다
        if (r2 < 1) dome = Math.max(dome, y >= cy ? Math.pow(1 - r2, 2.2) : Math.pow(1 - r2, 1.1));
      }
      const w = dome * front * torso * bust * BUST_FORWARD;
      dz += w;
      // 살짝 바깥 · 위로 — 정면으로만 밀면 두 개가 나란히 붙은 공처럼, 아래로 밀면 처져 보였다
      dx += Math.sign(x) * 0.15 * w;
      dy += BUST_LIFT * w;
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
      // 엉덩이 뒤쪽 — 뒤를 보는 면만
      dz -= HIP_BACK * band * back * torso * hips;
    }
    return [dx, dy, dz];
  };

  const linear = (m) => [m[0], m[1], m[2], m[4], m[5], m[6], m[8], m[9], m[10]];
  const applyDir = (l, [x, y, z]) => {
    const out = [l[0] * x + l[3] * y + l[6] * z, l[1] * x + l[4] * y + l[7] * z, l[2] * x + l[5] * y + l[8] * z];
    const length = Math.hypot(...out) || 1;
    return out.map((value) => value / length);
  };
  /** (I + J) 의 역전치를 n 에 — 모양을 바꾼 뒤의 면 방향 */
  const bentNormal = (J, n) => {
    const [a, b, c, d, e, f, g, h, i] = [1 + J[0][0], J[0][1], J[0][2], J[1][0], 1 + J[1][1], J[1][2], J[2][0], J[2][1], 1 + J[2][2]];
    const det = a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g);
    // 역행렬의 전치 = 여인수 행렬 / det
    const cof = [
      [e * i - f * h, -(d * i - f * g), d * h - e * g],
      [-(b * i - c * h), a * i - c * g, -(a * h - b * g)],
      [b * f - c * e, -(a * f - c * d), a * e - b * d],
    ];
    const out = [0, 1, 2].map((r) => (cof[r][0] * n[0] + cof[r][1] * n[1] + cof[r][2] * n[2]) / det);
    const length = Math.hypot(...out) || 1;
    return out.map((value) => value / length);
  };

  const done = new Set();
  let moved = 0;
  const STEP = 0.002;
  for (const mesh of document.getRoot().listMeshes()) {
    const toWorld = meshToWorld(document, mesh);
    const toMesh = mat4Inv(toWorld);
    const dirToWorld = linear(toWorld);
    const dirToMesh = linear(toMesh);
    for (const primitive of mesh.listPrimitives()) {
      const position = primitive.getAttribute("POSITION");
      if (!position || done.has(position)) continue;
      done.add(position);
      const normals = primitive.getAttribute("NORMAL");
      const material = primitive.getMaterial()?.getName() ?? "";
      // 윗옷 — 가슴에서 아래로 늘어지고, 허리는 조이지 않는다(헐렁한 티셔츠가 울퉁불퉁해졌다)
      // shape.drape === false 면 몸에 붙는 옷(바디슈트) — 늘어지지 않고 가슴을 따라 붙는다
      const top = shape.drape !== false && /Tops/i.test(material);

      const v = [0, 0, 0];
      const nv = [0, 0, 1];
      for (let index = 0; index < position.getCount(); index += 1) {
        position.getElement(index, v);
        const p = apply(toWorld, v);
        const n = normals ? applyDir(dirToWorld, normals.getElement(index, nv)) : [0, 0, 1];
        // 앞을 보는 면만 가슴으로, 뒤를 보는 면만 엉덩이로 — 겨드랑이 · 옆구리까지 밀리면 혹처럼 붙는다
        const front = smooth(-0.15, 0.45, n[2]);
        const back = smooth(0.15, -0.45, n[2]);
        const d = field(p, front, back, top);
        if (!d[0] && !d[1] && !d[2]) continue;
        position.setElement(index, apply(toMesh, [p[0] + d[0], p[1] + d[1], p[2] + d[2]]));
        moved += 1;

        if (normals) {
          // J[i][j] = ∂d_i/∂p_j
          const J = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
          for (let j = 0; j < 3; j += 1) {
            const q = [...p];
            q[j] += STEP;
            const dq = field(q, front, back, top);
            for (let k = 0; k < 3; k += 1) J[k][j] = (dq[k] - d[k]) / STEP;
          }
          normals.setElement(index, applyDir(dirToMesh, bentNormal(J, n)));
        }
      }
    }
  }
  return moved;
}
