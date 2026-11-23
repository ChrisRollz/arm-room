const ArmMesh = (() => {
  function readSTL(bytes) {
    const data = new DataView(bytes),
      count = bytes.byteLength >= 84 ? data.getUint32(80, true) : 0;
    let positions;
    if (count && 84 + count * 50 === bytes.byteLength) {
      positions = new Float32Array(count * 9);
      for (let j = 0; j < count; j++)
        for (let k = 0; k < 9; k++)
          positions[j * 9 + k] = data.getFloat32(96 + j * 50 + k * 4, true);
    } else {
      const text = new TextDecoder().decode(bytes);
      if (!/^\s*solid\b/i.test(text) || !/^\s*endsolid\b/im.test(text))
        throw Error("Choose a complete binary or ASCII STL.");
      const facets = (text.match(/\bfacet\s+normal/gi) || []).length;
      positions = new Float32Array(facets * 9);
      const matches = text.matchAll(/\bvertex\s+(\S+)\s+(\S+)\s+(\S+)/gi);
      let offset = 0;
      for (const m of matches) {
        if (offset + 3 > positions.length) throw Error("Invalid ASCII STL.");
        for (let k = 1; k <= 3; k++) positions[offset++] = Number(m[k]);
      }
      if (offset !== positions.length) throw Error("Incomplete STL faces.");
    }
    if (!positions.length || !positions.every(Number.isFinite))
      throw Error("STL has missing or invalid vertices.");
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    g.computeBoundingBox();
    const size = g.boundingBox.getSize(new THREE.Vector3());
    if (size.lengthSq() === 0) throw Error("STL has no measurable extent.");
    g.computeVertexNormals();
    return g;
  }
  function stl(mesh) {
    mesh.updateWorldMatrix(true, false);
    const a = mesh.geometry.attributes.position,
      idx = mesh.geometry.index,
      count = (idx ? idx.count : a.count) / 3;
    const bytes = new ArrayBuffer(84 + 50 * count),
      view = new DataView(bytes);
    view.setUint32(80, count, true);
    const points = [
        new THREE.Vector3(),
        new THREE.Vector3(),
        new THREE.Vector3(),
      ],
      u = new THREE.Vector3(),
      v = new THREE.Vector3();
    for (let i = 0; i < count; i++) {
      for (let j = 0; j < 3; j++)
        points[j]
          .fromBufferAttribute(a, idx ? idx.getX(i * 3 + j) : i * 3 + j)
          .applyMatrix4(mesh.matrixWorld);
      u.subVectors(points[1], points[0])
        .cross(v.subVectors(points[2], points[0]))
        .normalize();
      const row = [u, ...points];
      for (let j = 0; j < 4; j++)
        for (let k = 0; k < 3; k++)
          view.setFloat32(
            84 + i * 50 + j * 12 + k * 4,
            row[j].getComponent(k),
            true,
          );
    }
    return bytes;
  }
  // Intersect local triangles with the world plane. Transform only the crossing edges.
  function cut(mesh, axis, level) {
    mesh.updateWorldMatrix(true, false);
    const pos = mesh.geometry.attributes.position,
      arr = pos.array,
      indices = mesh.geometry.index?.array;
    const m = mesh.matrixWorld.elements,
      lines = [],
      total = indices?.length ?? pos.count;
    for (let i = 0; i < total; i += 3) {
      const a = (indices ? indices[i] : i) * 3,
        b = (indices ? indices[i + 1] : i + 1) * 3,
        c = (indices ? indices[i + 2] : i + 2) * 3;
      const dist = (j) =>
        arr[j] * m[axis] +
        arr[j + 1] * m[axis + 4] +
        arr[j + 2] * m[axis + 8] +
        m[axis + 12] -
        level;
      const da = dist(a),
        db = dist(b),
        dc = dist(c);
      if (da > 0 === db > 0 && db > 0 === dc > 0) continue;
      const hit = (j, k, d, e) => {
        const t = d / (d - e);
        return new THREE.Vector3(
          arr[j] + t * (arr[k] - arr[j]),
          arr[j + 1] + t * (arr[k + 1] - arr[j + 1]),
          arr[j + 2] + t * (arr[k + 2] - arr[j + 2]),
        ).applyMatrix4(mesh.matrixWorld);
      };
      const pair = [];
      if (da > 0 !== db > 0) pair.push(hit(a, b, da, db));
      if (db > 0 !== dc > 0) pair.push(hit(b, c, db, dc));
      if (dc > 0 !== da > 0) pair.push(hit(c, a, dc, da));
      if (pair.length === 2) lines.push(pair);
    }
    return lines;
  }
  // Sample the outer torso at the sternum and upper back. Keep the sampling
  // separate from pad thickness so moving the slider never re-reads a scan.
  function padSurfaces(body) {
    const bounds = new THREE.Box3().setFromObject(body);
    const size = bounds.getSize(new THREE.Vector3()),
      center = bounds.getCenter(new THREE.Vector3());
    const rows = 9,
      columns = 11,
      front = [],
      back = [],
      faces = [];
    for (let row = 0; row < rows; row++) {
      const t = row / (rows - 1),
        z = bounds.min.z + size.z * (0.48 + 0.14 * t);
      const lines = cut(body, 2, z);
      const halfWidth =
        size.x * 0.125 * Math.sqrt(1 - Math.pow((2 * t - 1) * 0.92, 2));
      for (let col = 0; col < columns; col++) {
        const x = center.x + halfWidth * ((2 * col) / (columns - 1) - 1);
        let low = Infinity,
          high = -Infinity;
        for (const [a, b] of lines) {
          if (a.x > x === b.x > x) continue;
          const y = a.y + ((b.y - a.y) * (x - a.x)) / (b.x - a.x);
          low = Math.min(low, y);
          high = Math.max(high, y);
        }
        if (!Number.isFinite(low) || high - low < 1) return [];
        front.push([x, low, z]);
        back.push([x, high, z]);
        const k = row * columns + col;
        if (row && col)
          faces.push(
            k - columns - 1,
            k - columns,
            k,
            k - columns - 1,
            k,
            k - 1,
          );
      }
    }
    const rim = [];
    for (let c = 0; c < columns; c++) rim.push(c);
    for (let r = 1; r < rows; r++) rim.push(r * columns + columns - 1);
    for (let c = columns - 2; c >= 0; c--) rim.push((rows - 1) * columns + c);
    for (let r = rows - 2; r > 0; r--) rim.push(r * columns);
    return [
      { surface: front, sign: -1, faces, rim },
      { surface: back, sign: 1, faces, rim },
    ];
  }
  function foamGeometry(pad, thickness) {
    const { surface, faces, rim, sign } = pad,
      n = surface.length;
    const vertices = surface.flat();
    for (const [x, y, z] of surface) vertices.push(x, y + sign * thickness, z);
    const indices = [];
    for (let i = 0; i < faces.length; i += 3) {
      const [a, b, c] = faces.slice(i, i + 3);
      indices.push(c, b, a, n + a, n + b, n + c);
    }
    for (let i = 0; i < rim.length; i++) {
      const a = rim[i],
        b = rim[(i + 1) % rim.length];
      indices.push(a, b, n + b, a, n + b, n + a);
    }
    if (sign === 1) indices.reverse();
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(vertices, 3),
    );
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    return geometry;
  }
  return { readSTL, stl, cut, padSurfaces, foamGeometry };
})();
