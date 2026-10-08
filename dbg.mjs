import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(process.argv[2]);
const w = (n) => { const node = doc.getRoot().listNodes().find((e) => e.getName() === n); const m = node.getWorldMatrix(); return [m[12], m[13], m[14]].map((v) => v.toFixed(3)); };
for (const n of ["J_Sec_L_Bust1", "J_Sec_L_Bust2", "J_Bip_C_Chest", "J_Bip_C_UpperChest", "J_Bip_C_Hips", "J_Bip_L_UpperLeg", "J_Bip_C_Neck"]) console.log(n, w(n).join(","));
for (const mesh of doc.getRoot().listMeshes()) for (const [i, p] of mesh.listPrimitives().entries()) {
  const pos = p.getAttribute("POSITION"); const v = [0,0,0]; const rows = {};
  for (let k = 0; k < pos.getCount(); k++) { pos.getElement(k, v); if (Math.abs(v[0]-0.07) > 0.03) continue; const y = Math.round(v[1] * 40) / 40; rows[y] = Math.max(rows[y] ?? -9, v[2]); }
  const ys = Object.keys(rows).map(Number).filter((y) => y > 0.8 && y < 1.4).sort((a, b) => b - a);
  if (ys.length) console.log(mesh.getName(), i, p.getMaterial()?.getName(), ys.map((y) => `${y}:${rows[y].toFixed(3)}`).join(" "));
}
