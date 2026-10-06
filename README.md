# ITEMS-CHARACTERS

ITEMS 게임에서 고를 수 있는 캐릭터 모음. **직접 만든 VRoid 모델과 CC0 캐릭터만** 넣는다 ([LICENSES.md](LICENSES.md)).

## 구조

```
characters/<id>/
  model.vrm     원본 — VRoid Studio 에서 VRM 1.0 으로 내보낸 것 (보통 git 파일, 100 MB 까지)
  meta.json     이름 · 만든 사람 · 라이선스 · 출처 · 태그 (사람이 적는다)
  thumb.png     (선택) 고르기 화면 얼굴. 없으면 VRM 에 박힌 썸네일을 쓴다
scripts/
  build.mjs     검사하고 dist/ 를 만든다 (npm install 먼저)
  retarget.mjs  VRoid 가 아닌 VRM(Mixamo 뼈대 등)을 VRoid 뼈대로 — 이름 · 쉬는 자세 방향 · 앞 방향 · 크기
  optimize.mjs  게임용으로 줄이기 — 텍스처 1024 px, 쓰지 않는 것 걷어 내기 (12 MB → 5 MB)
  vrm.mjs       VRM 읽기 (꾸러미 없이)
dist/           만들어지는 것 — git 에 넣지 않는다
  catalog.json  게임이 읽는 목록
  characters/<id>/game.glb · thumb.png
```

## 캐릭터 넣기

1. `characters/<영문-id>/` 폴더를 만들고 `model.vrm` 을 넣는다.
2. `meta.json` 을 적는다.
   ```json
   { "name": "이름", "author": "만든 사람", "license": "own", "source": "어디서 · 어떻게", "tags": [] }
   ```
3. `npm run build` — 오류가 없어야 한다.
4. 게임에 넣기: core 에서 `node scripts/sync-characters.mjs` (dist 를 core/assets/models/characters 로 옮긴다).

## 검사하는 것

- 라이선스가 `CC0-1.0` · `own` 중 하나인가
- VRM 정보가 있고 필수 뼈대(hips · spine · head · 팔다리)가 다 있는가 — 없으면 게임의 걷기 · 공격 동작이 붙지 않는다
- VRoid 가 아니면 VRoid 뼈대로 바꾼다 (휴머노이드 표로 이름을 붙이고 쉬는 자세를 VRoid 방향으로) — 게임 동작은 VRoid 뼈 이름으로 붙는다
- VRM 정보의 재배포 허용 — CC0 라고 했는데 「재배포 불가」면 오류, 직접 만든 것이면 경고
- 게임용 파일 크기 (15 MB 넘으면 경고)

## VRoid Studio 에서 내보낼 때

- VRM 1.0 으로 내보낸다.
- 공개 저장소에 올릴 것이면 내보내기 화면의 라이선스에서 **재배포 허용**, 아바타 사용 허가를 모두에게로.
- 텍스처 해상도를 2048 이하로 두면 파일이 가볍다.

## 게임에서 보관소로 쓰기

게임의 설정 › 꾸미기 › 「내 캐릭터 가져오기」 에서 **GitHub 보관소**를 고르면 이 저장소의 `.vrm` 을 목록으로 보여 주고 골라 가져온다
(학생 토큰으로 읽으므로 비공개 저장소여도 된다). LFS 로 두면 API 가 내용 대신 포인터를 주므로 VRM 은 보통 git 파일로 둔다.

## 배포

main 에 넣으면 Actions 가 검사하고 `dist/` 를 GitHub Pages 로 내보낸다. 게임은 그 주소에서 `catalog.json` 과 `game.glb` 를 받는다.
