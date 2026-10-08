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
  const centres = [left, right].filter(Boolean).map(([x, y]) => [x * 1.15, chest[1] + (y - chest[1]) * 0.3, chest[2]]);
  const waistY = (hipsBone[1] + chest[1]) / 2;
  const hipY = (hipsBone[1] + upperLeg[1]) / 2 - 0.03;
  const torsoZ = hipsBone[2];

  const done = new Set();
  let moved = 0;
  for (const mesh of document.getRoot().listMeshes()) {
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
        const [x, y, z] = v;
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
          position.setElement(index, [x + dx, y + dy, z + dz]);
          moved += 1;
        }
      }
    }
  }
  return moved;
}
