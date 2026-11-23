/* Millimetres throughout. Wrist down, anterior toward −Y. */
const ArmGeometry = (() => {
  const regions = {
    forearm: "Forearm & wrist",
    upper: "Upper arm & elbow",
    shoulder: "Shoulder",
  };
  const measurements = {
    foreLength: [
      "Wrist to elbow",
      "With your elbow slightly bent, measure straight from the wrist crease to the point of your elbow.",
      80,
      440,
      250,
    ],
    wrist: [
      "Around your wrist",
      "Wrap the tape at the wrist crease, over the sleeve or liner you will wear.",
      65,
      330,
      165,
    ],
    forearm: [
      "Fullest forearm",
      "Wrap the tape around the widest part of your forearm with your hand gently closed.",
      95,
      550,
      265,
    ],
    foreStation: [
      "Wrist to fullest forearm",
      "Keep the tape at the widest point. Measure straight up from the wrist crease to that tape.",
      20,
      400,
      160,
    ],
    handWidth: [
      "Hand entry width",
      "Tuck your thumb as if slipping through a cuff. Measure the widest part across your hand between two books, wearing your glove if needed.",
      30,
      190,
      88,
    ],
    handDepth: [
      "Hand entry thickness",
      "Keep the same tucked-thumb pose. Measure front to back at the thickest point, including the thumb.",
      15,
      135,
      49,
    ],
    upperLength: [
      "Shoulder to elbow",
      "Measure straight from the bony tip of your shoulder to the point of your elbow, arm relaxed.",
      95,
      520,
      305,
    ],
    bicep: [
      "Fullest upper arm",
      "Gently flex. Wrap the tape around the fullest part of your upper arm over your costume layer.",
      100,
      730,
      310,
    ],
    elbow: [
      "Around your elbow",
      "Bend your elbow slightly. Wrap the tape around the joint, crossing the bony point.",
      90,
      470,
      242,
    ],
    armhole: [
      "Around the shoulder joint",
      "Loop a soft tape over your shoulder tip and under your armpit. Let your arm rest at your side.",
      180,
      920,
      460,
    ],
    shoulderDrop: [
      "Shoulder drop",
      "Hold a level ruler out from the base of your neck. Measure vertically down to the bony shoulder tip.",
      0,
      125,
      38,
    ],
  };
  function steps(region, closed) {
    const keys =
      region === "forearm"
        ? [
            "foreLength",
            "wrist",
            "forearm",
            "foreStation",
            ...(closed ? ["handWidth", "handDepth"] : []),
          ]
        : region === "upper"
          ? ["upperLength", "bicep", "elbow"]
          : ["upperLength", "bicep", "armhole", "shoulderDrop"];
    return keys.map((key) => {
      const [name, help, min, max, initial] = measurements[key];
      return { key, name, help, min, max, initial };
    });
  }
  const defaults = Object.fromEntries(
    Object.entries(measurements).map(([k, v]) => [k, v[4]]),
  );
  const sideSign = (side) => (side === "Left" ? 1 : -1);
  function dimensions(circumference, ratio) {
    // Ramanujan's ellipse perimeter, scaled to the entered circumference.
    const h = ((1 - ratio) / (1 + ratio)) ** 2;
    const width =
      (2 * circumference) /
      (Math.PI * (1 + ratio) * (1 + (3 * h) / (10 + Math.sqrt(4 - 3 * h))));
    return [width, width * ratio];
  }
  function surface(rings, side) {
    const vertices = [],
      indices = [],
      paths = [],
      n = 64;
    for (const [z, w, d, x, y, tilt = 0] of rings) {
      const path = [];
      for (let i = 0; i < n; i++) {
        const a = (2 * Math.PI * i) / n,
          cos = Math.cos(a);
        const point = [
          sideSign(side) * x + (w * cos) / 2,
          y + (d * Math.sin(a)) / 2,
          z - sideSign(side) * cos * tilt,
        ];
        path.push(point);
        vertices.push(...point);
      }
      paths.push([...path, path[0]]);
    }
    for (let j = 1; j < rings.length; j++)
      for (let i = 0; i < n; i++) {
        const a = (j - 1) * n + i,
          b = (j - 1) * n + ((i + 1) % n);
        indices.push(a, b, b + n, a, b + n, a + n);
      }
    const end = (rings.length - 1) * n;
    for (let i = 1; i < n - 1; i++)
      indices.push(0, i + 1, i, end, end + i, end + i + 1);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(vertices, 3),
    );
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    geometry.computeBoundingBox();
    return { geometry, paths };
  }
  function mannequin(input = {}, region = "forearm", side = "Right") {
    const v = { ...defaults, ...input },
      fore = region === "forearm";
    const rings = [],
      guides = {};
    function add(z, c, r, x = 0, y = 0, tilt = 0) {
      rings.push([z, ...dimensions(c, r), x, y, tilt]);
    }
    const length = fore ? v.foreLength : v.upperLength,
      sign = sideSign(side);
    if (fore) {
      const full = Math.min(v.foreStation, length * 0.97);
      add(0, v.wrist, 0.7);
      add(full * 0.27, v.wrist * 0.78 + v.forearm * 0.22, 0.73, 0, 0);
      add(full * 0.67, v.wrist * 0.32 + v.forearm * 0.68, 0.82, 2, -2);
      add(full, v.forearm, 0.89, 3, -3);
      add(full + (length - full) * 0.53, v.forearm * 0.96, 0.93, 3, 0);
      add(length, v.forearm * 0.86, 0.93, 0, 3);
    } else {
      const e = region === "shoulder" ? v.bicep * 0.78 : v.elbow;
      if (region === "upper") {
        add(-length * 0.19, e * 0.93, 0.89, 0, -length * 0.045);
        add(-length * 0.09, e * 0.98, 0.9, 0, 0);
      }
      add(0, e, 0.9, 0, 3);
      add(length * 0.18, e * 0.68 + v.bicep * 0.32, 0.94, 0, 2);
      add(length * 0.49, v.bicep, 0.96, 3, -4);
      add(length * 0.67, v.bicep * 0.96, 0.98, 3, -1);
      const cap = region === "shoulder" ? v.armhole * 0.73 : v.bicep * 1.06;
      const tilt =
        region === "shoulder"
          ? Math.min(v.shoulderDrop * 0.32, length * 0.07)
          : 4;
      add(length * 0.8, cap, 1.03, 4, 1);
      add(length * 0.9, cap * 0.94, 1.03, 2, 0, tilt * 0.5);
      add(length * 0.96, cap * 0.69, 1.04, 0, 0, tilt * 0.68);
      add(length, cap * 0.28, 1.05, -3, 0, tilt * 0.25);
      add(length + 1, cap * 0.035, 1, -3, 0);
    }
    const model = surface(rings, side),
      outline = model.paths;
    const measureX = Math.min(...rings.map((r) => sign * r[3] - r[1] / 2)) - 7;
    const vertical = (a, b) => [
      [measureX, 0, a],
      [measureX, 0, b],
    ];
    if (fore) {
      guides.wrist = outline[0];
      guides.forearm = outline[3];
      guides.foreLength = vertical(0, length);
      guides.foreStation = vertical(0, rings[3][0]);
      guides.handWidth = [
        [-v.handWidth / 2, 0, 0],
        [v.handWidth / 2, 0, 0],
      ];
      guides.handDepth = [
        [0, -v.handDepth / 2, 0],
        [0, v.handDepth / 2, 0],
      ];
    } else {
      guides.upperLength = vertical(0, length);
      const elbowIndex = region === "upper" ? 2 : 0;
      guides.bicep = outline[elbowIndex + 2];
      guides.elbow = outline[elbowIndex];
      const r = v.armhole / (2 * Math.PI),
        neckX = -sign * (rings[4][1] / 2 + 15);
      guides.armhole = Array.from({ length: 65 }, (_, i) => {
        const a = (i * Math.PI) / 32;
        return [
          -sign * r * 0.22 * Math.cos(a),
          r * Math.sin(a),
          length - r + r * Math.cos(a),
        ];
      });
      guides.shoulderDrop = [
        [neckX, 0, length + v.shoulderDrop],
        [0, 0, length + v.shoulderDrop],
        [0, 0, length],
      ];
    }
    return { geometry: model.geometry, guides, length };
  }
  function entry(width, depth) {
    // Section of a thumb-tucked hand at its widest station.
    return surface(
      [
        [-1, width, depth, 0, 0],
        [1, width, depth, 0, 0],
      ],
      "Right",
    ).geometry;
  }
  function demo(region) {
    const length = region === "forearm" ? 191 : region === "upper" ? 142 : 105;
    const rows =
      region === "forearm"
        ? [
            [0, 63, 50],
            [6, 66, 53],
            [15, 64, 51],
            [125, 96, 86],
            [169, 103, 92],
            [177, 108, 96],
            [length, 107, 95],
          ]
        : region === "upper"
          ? [
              [0, 91, 86],
              [8, 97, 92],
              [18, 95, 90],
              [length - 14, 118, 110],
              [length - 7, 122, 114],
              [length, 121, 114],
            ]
          : [
              [0, 151, 142],
              [8, 155, 146],
              [15, 150, 140],
              [47, 142, 136],
              [75, 116, 114],
              [95, 70, 69],
              [length, 19, 19],
            ];
    const vertices = [],
      n = 48,
      indices = [],
      open = region === "shoulder";
    for (const inner of [false, true])
      for (const [z, w, d] of rows)
        for (let i = 0; i <= n; i++) {
          const a = open ? -1.9 + (3.8 * i) / n : (2 * Math.PI * i) / n;
          vertices.push(
            (w / 2 - (inner ? 3 : 0)) * Math.cos(a),
            (d / 2 - (inner ? 3 : 0)) * Math.sin(a),
            z,
          );
        }
    const stride = n + 1,
      layer = rows.length * stride;
    function quad(a, b, c, d) {
      indices.push(a, b, c, a, c, d);
    }
    for (let j = 0; j < rows.length - 1; j++)
      for (let i = 0; i < n; i++) {
        const a = j * stride + i;
        quad(a, a + 1, a + 1 + stride, a + stride);
        quad(
          layer + a + stride,
          layer + a + 1 + stride,
          layer + a + 1,
          layer + a,
        );
      }
    for (let i = 0; i < n; i++) {
      const t = layer - stride + i;
      quad(i, layer + i, layer + i + 1, i + 1);
      quad(t, t + 1, layer + t + 1, layer + t);
    }
    if (open)
      for (let j = 0; j < rows.length - 1; j++)
        for (const i of [0, n]) {
          const a = j * stride + i;
          quad(a, a + stride, layer + a + stride, layer + a);
        }
    const g = new THREE.BufferGeometry();
    g.setIndex(indices);
    g.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
    g.computeVertexNormals();
    g.computeBoundingBox();
    return g;
  }
  return {
    ...ArmMesh,
    regions,
    steps,
    defaults,
    mannequin,
    entry,
    demo,
    sideSign,
  };
})();
