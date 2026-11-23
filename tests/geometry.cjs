const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const THREE = require("../src/vendor/three.min.js");
const source = (name) =>
  fs.readFileSync(path.resolve(__dirname, "../src/" + name + ".js"), "utf8");
const G = new Function(
  "THREE",
  source("mesh") + source("geometry") + ";return ArmGeometry",
)(THREE);
for (const region of Object.keys(G.regions)) {
  for (const side of ["Left", "Right"]) {
    const { geometry, guides } = G.mannequin(G.defaults, region, side);
    assert(geometry.attributes.position.array.every(Number.isFinite));
    for (const { key } of G.steps(region, true))
      assert(guides[key]?.length >= 2, key);
    const shell = G.demo(region),
      mesh = new THREE.Mesh(shell);
    mesh.rotation.z = 0.4;
    mesh.scale.setScalar(1.08);
    mesh.position.set(3, 4, 7);
    const bytes = G.stl(mesh),
      reloaded = G.readSTL(bytes);
    assert.equal(reloaded.attributes.position.count, shell.index.count);
    const box = new THREE.Box3().setFromObject(new THREE.Mesh(reloaded));
    mesh.updateMatrixWorld();
    const world = new THREE.Box3().setFromBufferAttribute(
      reloaded.attributes.position,
    );
    assert(box.max.distanceTo(world.max) < 1e-5);
    assert(G.cut(mesh, 2, 36).length > 0);
  }
}
const f = G.mannequin({ ...G.defaults, foreStation: 143 }, "forearm", "Left");
const loop = f.guides.forearm,
  length = loop
    .slice(1)
    .reduce((n, p, i) => n + Math.hypot(...p.map((v, k) => v - loop[i][k])), 0);
assert(Math.abs(length - G.defaults.forearm) < 0.2);
assert.equal(loop[0][2], 143);
assert.equal(G.steps("forearm", false).length, 4);
assert.equal(G.steps("forearm", true).length, 6);
assert.equal(G.steps("upper", false).length, 3);
assert.equal(G.steps("shoulder", false).length, 4);
console.log(
  "Passed arm profiles, measured rings, guides, demo meshes, sections and STL round-trips.",
);
