(() => {
  const G = ArmGeometry,
    T = THREE,
    lib = armLibrary(),
    $ = (id) => document.getElementById(id);
  const panel = $("panel"),
    footer = $("footer"),
    main = $("arm-room"),
    tools = $("tools");
  let records = [],
    profile = null,
    scan = null,
    values = {},
    entered = {},
    step = 0,
    unit = "cm",
    page = "",
    active = "plate",
    tool = "orbit",
    busy = false,
    rev = null;
  let assets = {},
    chooser = null,
    fitName = "",
    measuring = false,
    libraryTab = "arm",
    opacity = 0.52,
    foam = 0;
  const projectURLs = {
    head: "https://cloud.orcaslicer.com/p/4dea41994d30",
    chest: "https://cloud.orcaslicer.com/p/4eb3f2417cb9",
    model:
      "https://www.printables.com/model/361599-the-mandalorian-beskar-armor-shoulder",
  };
  let region = "forearm",
    side = "Right",
    closed = false,
    chest = null,
    posture = "rest",
    entryHeight = null;
  const stepList = () => G.steps(region, closed);
  const labelOf = (id) =>
    assets[id]?.name.replace(/\.stl$/i, "") || "Armor piece";
  function note(message = "") {
    $("status").textContent = message;
  }
  const studio = armStudio($("scene"), $("cut"), syncNumbers, note);
  function el(tag, text = "", cls = "") {
    const e = document.createElement(tag);
    e.textContent = text;
    if (cls) e.className = cls;
    return e;
  }
  function add(tag, text, cls) {
    const e = el(tag, text, cls);
    panel.append(e);
    return e;
  }
  function btn(text, fn, primary = false) {
    const b = el("button", text, primary ? "primary" : "");
    b.type = "button";
    b.onclick = fn;
    return b;
  }
  function row(...children) {
    const r = el("div", "", "row");
    r.append(...children);
    panel.append(r);
    return r;
  }
  function title(text, kicker) {
    if (kicker) add("div", kicker, "eyebrow");
    add("h2", text);
  }
  function layout(which) {
    page = which;
    panel.replaceChildren();
    footer.replaceChildren();
    tools.replaceChildren();
    note();
    const fitting = which === "fit";
    main.classList.toggle("fit-mode", fitting);
    footer.hidden = !fitting;
    tools.hidden = true;
    $("home").hidden = which === "home";
    $("gesture").textContent =
      studio.mode === "3d"
        ? "Drag to orbit · Scroll to zoom"
        : "Scroll to zoom · Shift-drag to pan";
  }
  function setLock(on) {
    busy = on;
    main.querySelector("section").inert = on;
    $("home").disabled = on;
    main.classList.toggle("busy", on);
  }
  async function work(message, job) {
    if (busy) return;
    setLock(true);
    note(message);
    try {
      await job();
    } catch (e) {
      note(e.message || String(e));
    } finally {
      setLock(false);
    }
  }
  function freshId() {
    return lib.uid();
  }
  function armGeometry(v, key, frame = false) {
    const model = G.mannequin(v, region, side);
    studio.setWorkspace(region, side);
    studio.setBody(model.geometry, model.guides, key, frame);
    const hand = key === "handWidth" || key === "handDepth";
    studio.setEntry(hand ? v.handWidth : 0, v.handDepth || 0, 0);
  }
  function clearParts() {
    for (const id of [...studio.layers.keys()]) studio.remove(id);
    if (profile) studio.setPreview("rest");
    studio.setChest(null);
    studio.setEntry(0, 0, 0);
    chest = null;
    posture = "rest";
    entryHeight = null;
    studio.setFoam(0);
    assets = {};
    active = "plate";
    rev = null;
    fitName = "";
    measuring = false;
    tool = "orbit";
    studio.setTool(tool);
    opacity = 0.52;
    foam = 0;
  }
  function pickFile(fn) {
    chooser = fn;
    $("file").value = "";
    $("file").click();
  }
  $("file").onchange = () => {
    const f = $("file").files[0];
    if (f && chooser)
      work("Reading " + f.name + "…", async () => {
        if (f.size > 96 * 1024 * 1024)
          throw Error("Choose an STL under 96 MiB.");
        const bytes = await f.arrayBuffer(),
          geometry = G.readSTL(bytes);
        await chooser({ bytes, name: f.name }, geometry);
      });
  };
  function displayBody(p, scanGeo) {
    studio.setWorkspace(region, side);
    if (scanGeo) {
      const center = scanGeo.boundingBox.getCenter(new T.Vector3()),
        low = scanGeo.boundingBox.min.z;
      scanGeo.translate(-center.x, -center.y, -low);
      studio.setBody(scanGeo, null, null, true);
    } else armGeometry(p.values, null, true);
  }
  let demoBytes;
  function shoulderDemo() {
    demoBytes ??= Uint8Array.from(atob(BESKAR_STL), (c) =>
      c.charCodeAt(0),
    ).buffer;
    return { bytes: demoBytes, geometry: G.readSTL(demoBytes) };
  }
  function placeDemo(mesh) {
    mesh.rotation.z = side === "Right" ? -Math.PI / 2 : Math.PI / 2;
    mesh.position.x = G.sideSign(side) * 25;
    mesh.position.z = G.defaults.upperLength - 68;
  }
  function home() {
    clearParts();
    profile = null;
    scan = null;
    region = "shoulder";
    side = "Right";
    armGeometry(G.defaults, null, true);
    placeDemo(studio.add("welcome", shoulderDemo().geometry));
    studio.select(null);
    studio.frameBody();
    studio.setMode(studio.has3d ? "3d" : "front");
    layout("home");
    title("What are you fitting?");
    const tabs = row();
    for (const [id, text] of [
      ["arm", "Arms"],
      ["fit", "Saved fits"],
    ]) {
      const b = btn(text, () => {
        libraryTab = id;
        home();
      });
      b.setAttribute("aria-pressed", id === libraryTab);
      tabs.append(b);
    }
    if (libraryTab === "arm") {
      const stack = add("div", "", "stack regions");
      const descriptions = {
        forearm: "Bracers and wrist shells",
        upper: "Bicep plates and elbow cups",
        shoulder: "Pauldrons and shoulder bells",
      };
      for (const [id, name] of Object.entries(G.regions)) {
        const card = btn(name, () => {
          region = id;
          side = "Right";
          closed = false;
          setup();
        });
        card.className = "region-card " + id;
        card.append(el("small", descriptions[id]));
        stack.append(card);
      }
    }
    if (libraryTab === "arm") {
      const links = add("div", "", "room-links");
      for (const [name, key] of [
        ["Head Room", "head"],
        ["Chest Room", "chest"],
      ]) {
        const link = el("a", name);
        link.href = projectURLs[key];
        link.target = "_blank";
        link.rel = "noopener";
        if (lib.native)
          link.onclick = (e) => {
            e.preventDefault();
            work("Opening " + name + "…", () => lib.openLink(key));
          };
        links.append(link);
      }
    }
    const list = records
      .filter((r) => r.kind === libraryTab)
      .sort((a, b) => b.created - a.created);
    if (list.length) {
      add("h3", libraryTab === "arm" ? "Your arms" : "Your armor fits");
      const stack = add("div", "", "stack");
      for (const item of list) {
        const card = btn(
          item.name + (item.version ? " · " + item.version : ""),
          () =>
            work("Opening…", async () => {
              if (item.kind === "arm") {
                await openArm(item);
                fitPanel();
              } else await openFit(item);
            }),
        );
        card.className = "item";
        card.append(
          el(
            "small",
            item.kind === "arm"
              ? item.source === "scan"
                ? "Arm scan"
                : item.side + " · " + G.regions[item.region]
              : (records.find((r) => r.id === item.arm)?.name || "Arm") +
                  " · " +
                  Object.keys(item.parts).length +
                  " piece(s)",
          ),
        );
        stack.append(card);
      }
    } else if (libraryTab === "fit") {
      add(
        "p",
        "Save a fit from the armor view to return to the same arm, pieces and placement.",
      );
    }
  }
  function setup() {
    studio.remove("welcome");
    layout("setup");
    armGeometry(G.defaults, null, true);
    title(G.regions[region]);
    add("p", "Measure over the sleeve or liner you’ll wear.");
    function options(caption, entries, select) {
      add("h3", caption);
      const bar = row();
      for (const [name, value, selected] of entries) {
        const b = btn(name, () => {
          select(value);
          setup();
        });
        b.setAttribute("aria-pressed", selected);
        bar.append(b);
      }
    }
    options(
      "Which arm?",
      ["Left", "Right"].map((s) => [s, s, s === side]),
      (v) => (side = v),
    );
    if (region === "forearm")
      options(
        "How does it go on?",
        [
          ["Opens or straps on", false, !closed],
          ["Slides over my hand", true, closed],
        ],
        (v) => (closed = v),
      );
    row(
      btn("Measure my arm", () => beginWizard(), true),
      btn("Use arm scan", () =>
        pickFile((a, g) => {
          scan = a;
          profile = {
            kind: "arm",
            region,
            side,
            closed: false,
            name: a.name.replace(/\.stl$/i, ""),
            source: "scan",
          };
          displayBody(profile, g);
          review();
        }),
      ),
    );
    row(
      btn(
        region === "shoulder"
          ? "Try the Mandalorian shoulder"
          : "Try a sample fit",
        () =>
          work("Opening example…", async () => {
            const id =
              "abad" +
              { forearm: "1", upper: "2", shoulder: "3" }[region] +
              (side === "Left" ? "1" : "2") +
              (closed ? "1" : "0") +
              "0".repeat(25);
            let sample = records.find((r) => r.id === id);
            if (!sample) {
              sample = {
                kind: "arm",
                source: "measured",
                id,
                name:
                  "Sample " +
                  side.toLowerCase() +
                  " " +
                  G.regions[region].split(" &")[0].toLowerCase(),
                region,
                side,
                closed,
                values: Object.fromEntries(
                  stepList().map((s) => [s.key, s.initial]),
                ),
                created: Date.now(),
              };
              await lib.save(sample);
              records.push(sample);
            }
            await openArm(sample);
            if (region === "shoulder") {
              const { bytes, geometry: g } = shoulderDemo();
              addPiece(
                "plate",
                { name: "Beskar shoulder · dromanol.stl", bytes },
                g,
              );
              const m = studio.layers.get("plate");
              placeDemo(m);
              studio.frameBody();
              fitPanel();
            } else {
              const g = G.demo(region);
              addPiece(
                "plate",
                {
                  name:
                    region === "upper"
                      ? "Studio bicep plate.stl"
                      : "Studio bracer.stl",
                  bytes: G.stl(new T.Mesh(g)),
                },
                g,
              );
            }
          }),
      ),
    );
    if (region === "shoulder") {
      const credit = add("p", "", "muted");
      credit.append("Demo model by ");
      const link = el("a", "dromanol");
      link.href = projectURLs.model;
      link.target = "_blank";
      if (lib.native)
        link.onclick = (e) => {
          e.preventDefault();
          work("Opening model…", () => lib.openLink("model"));
        };
      credit.append(link, " · CC BY 4.0. Simplified for the offline demo.");
    }
  }
  function beginWizard(base = null) {
    clearParts();
    scan = null;
    profile = {
      kind: "arm",
      region,
      side,
      closed,
      source: "measured",
      name: base
        ? base.name.slice(0, 66) + " · revised"
        : "My " +
          side.toLowerCase() +
          " " +
          G.regions[region].split(" &")[0].toLowerCase(),
    };
    entered = base ? { ...base.values } : {};
    values = { ...G.defaults, ...entered };
    step = 0;
    armGeometry(values, null, true);
    studio.setMode(studio.has3d ? "3d" : "front");
    wizard();
  }
  function wizard() {
    layout("wizard");
    const steps = stepList(),
      s = steps[step];
    title(s.name, "Measurement " + (step + 1) + " of " + steps.length);
    add("p", s.help);
    const label = add("label", "Your measurement");
    label.htmlFor = "distance";
    const bar = add("div", "", "fieldrow"),
      input = el("input"),
      units = el("select");
    input.id = "distance";
    input.type = "number";
    input.step = "any";
    input.inputMode = "decimal";
    units.setAttribute("aria-label", "Units");
    const factor = () => ({ mm: 1, cm: 10, in: 25.4 })[unit];
    for (const u of ["cm", "mm", "in"]) units.add(new Option(u, u));
    units.value = unit;
    const show = () => {
      input.value =
        entered[s.key] == null
          ? ""
          : String(+(entered[s.key] / factor()).toFixed(3));
    };
    show();
    bar.append(input, units);
    const next = btn(
      step === steps.length - 1 ? "Review arm" : "Next",
      () => {
        if (next.disabled) return;
        if (step === steps.length - 1) {
          profile.values = { ...entered };
          review();
        } else {
          step++;
          wizard();
        }
      },
      true,
    );
    row(
      btn("Back", () => {
        if (step) {
          step--;
          wizard();
        } else setup();
      }),
      next,
    );
    function update() {
      const n = input.valueAsNumber * factor();
      next.disabled = true;
      if (!Number.isFinite(n) || n < s.min || n > s.max) {
        note(
          input.value
            ? "Enter " +
                (s.min / factor()).toFixed(1) +
                "–" +
                (s.max / factor()).toFixed(1) +
                " " +
                unit +
                "."
            : "",
        );
        return;
      }
      const draft = { ...values, [s.key]: n };
      if (s.key === "foreStation" && n >= draft.foreLength) {
        note("The fullest point must be between your wrist and elbow.");
        return;
      }
      if (s.key === "forearm" && n < draft.wrist) {
        note(
          "The fullest forearm is smaller than the wrist. Check both tape positions.",
        );
        return;
      }
      try {
        armGeometry(draft, s.key);
        values = draft;
        entered[s.key] = n;
        next.disabled = false;
        note();
      } catch (e) {
        note(e.message);
      }
    }
    units.onchange = () => {
      unit = units.value;
      show();
      update();
    };
    input.oninput = update;
    input.onkeydown = (e) => {
      if (e.key === "Enter" && !next.disabled) next.click();
    };
    next.disabled = entered[s.key] == null;
    if (!next.disabled) update();
    armGeometry(values, s.key);
    studio.guideView(s.key);
    input.focus();
  }
  function review() {
    layout("review");
    title("Save your arm");
    if (profile.source === "measured") {
      armGeometry(profile.values, null);
      const list = add("dl", "", "measurelist");
      for (const s of stepList()) {
        const r = el("div");
        r.append(
          el("dt", s.name),
          el("dd", Math.round(profile.values[s.key] * 10) / 10 + " mm"),
        );
        list.append(r);
      }
    } else
      add(
        "p",
        "Use a scan of the chosen arm region in millimetres, wrist end down and front toward −Y.",
      );
    const l = add("label", "Arm name"),
      name = el("input");
    name.maxLength = 80;
    name.value = profile.name;
    l.append(name);
    row(
      btn("Back", () => {
        if (profile.source === "measured") {
          step = stepList().length - 1;
          wizard();
        } else home();
      }),
      btn(
        "Save and fit armor",
        () =>
          work("Saving arm…", async () => {
            if (!name.value.trim()) throw Error("Give this arm a name.");
            const item = {
              ...profile,
              id: freshId(),
              created: Date.now(),
              name: name.value.trim(),
            };
            if (scan) item.mesh = await lib.store(scan);
            await lib.save(item);
            records.push(item);
            profile = item;
            studio.frameBody();
            studio.setMode(studio.has3d ? "3d" : "front");
            fitPanel();
          }),
        true,
      ),
    );
  }
  async function openArm(p) {
    if (!p) throw Error("The saved arm is missing.");
    let a = null,
      g = null;
    if (p.source === "scan") {
      a = { id: p.mesh, name: p.name, bytes: await lib.read(p.mesh) };
      g = G.readSTL(a.bytes);
    }
    clearParts();
    region = p.region;
    side = p.side;
    closed = p.closed;
    studio.setWorkspace(region, side);
    profile = p;
    scan = a;
    displayBody(p, g);
    studio.setMode(studio.has3d ? "3d" : "front");
  }
  async function openFit(record) {
    await openArm(records.find((r) => r.id === record.arm));
    for (const [id, s] of Object.entries(record.parts)) {
      const bytes = await lib.read(s.mesh);
      const g = G.readSTL(bytes);
      assets[id] = {
        id: s.mesh,
        name: s.file,
        bytes,
        center: g.boundingBox.getCenter(new T.Vector3()).toArray(),
      };
      studio.add(id, g, s.pose);
    }
    active = record.active in assets ? record.active : Object.keys(assets)[0];
    studio.select(active);
    fitName = record.name;
    rev = record;
    if (record.chest) {
      const bytes = await lib.read(record.chest.mesh);
      attachChest(
        { bytes, id: record.chest.mesh, name: record.chest.file },
        G.readSTL(bytes),
      );
    }
    foam = record.foam || 0;
    studio.setFoam(foam);
    fitPanel();
  }
  function loadPlate(id) {
    pickFile((a, g) => addPiece(id, a, g));
  }
  function addPiece(id, a, g) {
    const parent = studio.layers.get(active),
      source = assets[active];
    const original = g.boundingBox.getCenter(new T.Vector3());
    let pose = null;
    if (!assets[id] && parent && source?.center) {
      const delta = original
        .clone()
        .sub(new T.Vector3(...source.center))
        .multiply(parent.scale)
        .applyQuaternion(parent.quaternion);
      pose = {
        position: parent.position.clone().add(delta).toArray(),
        quaternion: parent.quaternion.toArray(),
        scale: parent.scale.toArray(),
      };
    }
    a.center = original.toArray();
    assets[id] = a;
    active = id;
    studio.add(id, g, pose);
    tool = "translate";
    studio.setTool(tool);
    opacityAll();
    fitPanel();
  }
  function attachChest(asset, g) {
    const bytes = asset.bytes,
      tagged = new TextDecoder().decode(bytes.slice(0, 12)) === "ROOMSHOULDER";
    let anchor;
    if (tagged) {
      const view = new DataView(bytes),
        offset = side === "Left" ? 16 : 28;
      if (view.getUint32(12, true) !== 1)
        throw Error("Unsupported Chest Room reference version.");
      anchor = [0, 1, 2].map((i) => view.getFloat32(offset + i * 4, true));
      if (!anchor.every(Number.isFinite))
        throw Error("Invalid shoulder reference.");
    } else {
      const box = g.boundingBox,
        size = box.getSize(new T.Vector3()),
        c = box.getCenter(new T.Vector3());
      anchor = [
        c.x + G.sideSign(side) * size.x * 0.46,
        c.y,
        box.max.z - size.z * 0.07,
      ];
    }
    studio.setChest(g, anchor);
    chest = asset;
    return tagged;
  }
  function shoulderControls() {
    const field = add("details");
    field.open = !!chest || posture !== "rest";
    field.append(el("summary", "Shoulder overlap"));
    field.append(
      el(
        "p",
        chest
          ? chest.name
          : "Use a shoulder reference from Chest Room or an upright cuirass STL. Plain STLs use an estimated shoulder point.",
      ),
    );
    if (posture === "rest")
      field.append(
        btn(chest ? "Change chest reference" : "Add chest reference", () =>
          pickFile((a, g) => {
            const tagged = attachChest(a, g);
            studio.frameBody();
            fitPanel();
            if (!tagged)
              note(
                "Approximate shoulder location. Use a Chest Room shoulder reference for registered placement.",
              );
          }),
        ),
      );
    const bar = el("div", "", "row");
    field.append(bar);
    for (const [id, label] of [
      ["rest", "Arm down"],
      ["reach", "Reach forward"],
      ["raise", "Arm raised"],
    ]) {
      const b = btn(label, () => {
        posture = id;
        studio.setPreview(id);
        studio.frameBody();
        fitPanel();
      });
      b.setAttribute("aria-pressed", posture === id);
      bar.append(b);
    }
    field.append(
      el(
        "small",
        "Poses approximate a rigid 60° lift. Check straps and plate movement on the costume.",
      ),
    );
    if (chest && posture === "rest")
      field.append(
        btn("Remove reference", () => {
          studio.setChest(null);
          chest = null;
          fitPanel();
        }),
      );
  }
  function handControls() {
    const v = profile.values,
      field = add("details");
    field.open = entryHeight !== null;
    field.append(el("summary", "Hand entry"));
    field.append(
      el(
        "p",
        "Sweep your tucked-hand width and thickness through the cuff. The pink oval shows the measured cross-section.",
      ),
    );
    field.append(
      btn(entryHeight === null ? "Show hand entry" : "Hide hand entry", () => {
        entryHeight = entryHeight === null ? 0 : null;
        studio.setEntry(
          entryHeight === null ? 0 : v.handWidth,
          v.handDepth,
          entryHeight ?? 0,
        );
        fitPanel();
      }),
    );
    if (entryHeight !== null) {
      const mesh = studio.layers.get(active),
        box = new T.Box3().setFromObject(mesh);
      const input = el("input"),
        label = el("label", "Entry height"),
        out = el("output", Math.round(entryHeight) + " mm");
      input.type = "range";
      input.min = Math.floor(Math.min(0, box.min.z) - 5);
      input.max = Math.ceil(Math.max(v.foreLength, box.max.z) + 5);
      input.value = entryHeight;
      input.setAttribute("aria-label", "Entry height");
      label.append(" · ", out, input);
      field.append(label);
      input.oninput = () => {
        entryHeight = input.valueAsNumber;
        studio.setEntry(v.handWidth, v.handDepth, entryHeight);
        if (studio.mode === "top") studio.setSlice(entryHeight);
        out.textContent = entryHeight + " mm";
      };
    }
  }
  function opacityAll() {
    for (const m of studio.layers.values()) {
      m.material.opacity = opacity;
      m.material.transparent = opacity < 1;
      m.material.depthWrite = opacity === 1;
      m.material.needsUpdate = true;
    }
    studio.draw();
  }
  function control(parent, text, value, apply, extra = {}) {
    const l = el("label", text),
      i = el("input");
    i.type = "number";
    i.step = "any";
    i.value = value;
    Object.assign(i, extra);
    i.required = true;
    i.oninput = () => {
      if (i.validity.valid) {
        apply(i.valueAsNumber);
        studio.measuring(false);
        measuring = false;
        studio.draw();
        note();
      } else note("Enter a value between " + i.min + " and " + i.max + ".");
      for (const b of footer.querySelectorAll("button"))
        b.disabled = !!panel.querySelector("input:invalid");
    };
    l.append(i);
    parent.append(l);
    return i;
  }
  function syncNumbers() {
    const m = studio.layers.get(active);
    if (!m) return;
    for (const [i, k] of ["x", "y", "z"].entries()) {
      if ($("pos" + i)) $("pos" + i).value = +m.position[k].toFixed(1);
      if ($("rot" + i))
        $("rot" + i).value = +((m.rotation[k] * 180) / Math.PI).toFixed(1);
    }
  }
  function currentRevision() {
    if (
      !rev ||
      (chest?.id || null) !== (rev.chest?.mesh || null) ||
      foam !== (rev.foam || 0) ||
      Object.keys(assets).length !== Object.keys(rev.parts).length
    )
      return false;
    return Object.entries(assets).every(([id, a]) => {
      const stored = rev.parts[id];
      return (
        stored &&
        a.id === stored.mesh &&
        JSON.stringify(studio.pose(id)) === JSON.stringify(stored.pose)
      );
    });
  }
  function foamControl() {
    const enabled = el("input");
    enabled.type = "checkbox";
    enabled.checked = foam > 0;
    const label = add("label", "", "foam-toggle");
    label.append(enabled, "Preview foam pads");
    const change = (n) => {
      foam = n;
      if (!studio.setFoam(n))
        note(
          "The scan has an opening in the pad area. Try a complete arm scan.",
        );
    };
    enabled.onchange = () => {
      foam = enabled.checked ? 6 : 0;
      fitPanel();
      change(foam);
    };
    if (foam) {
      const l = add("label", "Pad thickness · "),
        value = el("output", foam + " mm");
      l.htmlFor = "foam";
      l.append(value);
      const input = el("input");
      input.type = "range";
      input.id = "foam";
      input.min = 1;
      input.max = 30;
      input.value = foam;
      input.oninput = () => {
        value.textContent = input.value + " mm";
        change(input.valueAsNumber);
      };
      panel.append(input);
      add(
        "p",
        "Gold pads sit on the front and back of the arm. Measure to a pad’s outer edge in a cut.",
        "muted",
      );
    }
  }
  function sliceControls() {
    const axis = studio.normal(),
      range = studio.getBounds();
    for (const m of studio.layers.values())
      range.union(new T.Box3().setFromObject(m));
    const l = add(
      "label",
      studio.mode === "top" ? "Slice height" : "Slice position",
    );
    l.htmlFor = "slice";
    const slider = el("input");
    slider.type = "range";
    slider.id = "slice";
    slider.min = Math.floor(range.min.getComponent(axis));
    slider.max = Math.ceil(range.max.getComponent(axis));
    slider.step = 1;
    slider.value = studio.slice;
    const out = el("output", Math.round(studio.slice) + " mm");
    l.append(" · ", out);
    slider.oninput = () => {
      studio.setSlice(slider.valueAsNumber);
      out.textContent = slider.value + " mm";
      if (measuring) note("Click the arm outline, then the plate.");
    };
    panel.append(slider);
    const b = btn("Measure gap", () => {
      measuring = !measuring;
      studio.measuring(measuring);
      b.setAttribute("aria-pressed", measuring);
      note(
        measuring
          ? "Click the arm or foam outline, then the selected plate’s inner edge."
          : "",
      );
    });
    b.setAttribute("aria-pressed", measuring);
    row(b);
    add(
      "p",
      "Mint · arm     Copper · armor     Lavender · chest reference",
      "muted",
    );
  }
  function fitPanel() {
    layout("fit");
    const ids = Object.keys(assets),
      m = studio.layers.get(active);
    title(ids.length ? "Fit armor" : "Try on armor", profile.name);
    if (!ids.length) {
      add("p", "Choose an armor STL in millimetres.");
      row(btn("Choose armor STL", () => loadPlate("plate"), true));
      if (profile.source === "measured")
        row(btn("Modify arm", () => beginWizard(profile)));
      footer.hidden = true;
      return;
    }
    if (posture === "rest") {
      const pick = row();
      for (const id of ids) {
        const b = btn(labelOf(id), () => {
          active = id;
          studio.select(id);
          measuring = false;
          studio.measuring(false);
          fitPanel();
        });
        b.setAttribute("aria-pressed", active === id);
        pick.append(b);
      }
      pick.append(btn("Add piece", () => loadPlate(freshId())));
    }
    if (region === "shoulder") shoulderControls();
    if (region === "forearm" && closed && profile.values) handControls();
    const views = row();
    views.classList.add("compact");
    for (const [id, text] of [
      ["3d", "3D"],
      ["front", "Front cut"],
      ["side", "Side cut"],
      ["top", "Top cut"],
    ]) {
      if (id === "3d" && !studio.has3d) continue;
      const b = btn(text, () => {
        measuring = false;
        studio.setMode(id);
        fitPanel();
      });
      b.setAttribute("aria-pressed", studio.mode === id);
      views.append(b);
    }
    if (posture !== "rest") {
      if (studio.mode !== "3d") sliceControls();
      add("p", "Return to Arm down to adjust or export the pieces.");
      footer.hidden = true;
      return;
    }
    if (studio.mode === "3d") {
      tools.hidden = false;
      for (const [id, text] of [
        ["orbit", "Orbit"],
        ["translate", "Move"],
        ["rotate", "Rotate"],
      ]) {
        const b = btn(text, () => {
          tool = id;
          studio.setTool(id);
          fitPanel();
        });
        b.setAttribute("aria-pressed", tool === id);
        tools.append(b);
      }
      const l = add("label", "Armor opacity"),
        slider = el("input");
      slider.type = "range";
      slider.min = 0;
      slider.max = 100;
      slider.value = Math.round(opacity * 100);
      slider.setAttribute("aria-label", "Armor opacity");
      l.append(slider);
      slider.oninput = () => {
        opacity = slider.valueAsNumber / 100;
        opacityAll();
      };
    } else {
      sliceControls();
      $("gesture").textContent = "Drag plate · Shift-drag to pan";
    }
    control(
      panel,
      "Plate scale (%)",
      +(m.scale.x * 100).toFixed(2),
      (n) => m.scale.setScalar(n / 100),
      { min: 1, max: 2000, id: "scale" },
    );
    foamControl();
    const details = add("details", "");
    details.append(el("summary", "Precise alignment"));
    const nums = el("div", "", "numeric"),
      rot = el("div", "", "numeric");
    details.append(nums, rot);
    for (const [i, k] of ["x", "y", "z"].entries()) {
      control(
        nums,
        k.toUpperCase() + " (mm)",
        +m.position[k].toFixed(1),
        (n) => (m.position[k] = n),
        { id: "pos" + i, min: -10000, max: 10000 },
      );
      control(
        rot,
        k.toUpperCase() + " (°)",
        +((m.rotation[k] * 180) / Math.PI).toFixed(1),
        (n) => (m.rotation[k] = (n * Math.PI) / 180),
        { id: "rot" + i, min: -360, max: 360 },
      );
    }
    details.append(
      btn("Reset this plate", () => {
        const a = assets[active];
        studio.add(active, G.readSTL(a.bytes));
        opacityAll();
        fitPanel();
      }),
    );
    details.append(btn("Replace STL", () => loadPlate(active)));
    if (ids.length > 1)
      details.append(
        btn("Remove from fit", () => {
          studio.remove(active);
          delete assets[active];
          active = Object.keys(assets)[0];
          studio.select(active);
          fitPanel();
        }),
      );
    footer.append(
      btn("Save fit…", saveDialog),
      btn(
        lib.native ? "Open plate in OrcaSlicer" : "Download fitted plate",
        () =>
          work("Preparing fitted STL…", async () => {
            const bytes = G.stl(m),
              base =
                (rev
                  ? rev.name +
                    "-" +
                    rev.version +
                    (currentRevision() ? "" : "-modified")
                  : assets[active].name.replace(/\.stl$/i, "")) +
                "-" +
                active +
                "-fitted";
            const result = await lib.send(bytes, base);
            note(
              result.download
                ? "Fitted plate downloaded."
                : result.opened
                  ? "Fitted plate sent to OrcaSlicer."
                  : "Fitted STL saved. Open " + result.path + " in OrcaSlicer.",
            );
          }),
        true,
      ),
    );
  }
  function saveDialog() {
    const d = el("dialog"),
      head = el("h2", "Save armor fit"),
      l = el("label", "Fit name"),
      n = el("input"),
      vl = el("label", "Version"),
      v = el("input"),
      error = el("p", "", "muted");
    n.value = fitName || assets[active].name.replace(/\.stl$/i, "");
    n.maxLength = 80;
    v.maxLength = 30;
    l.append(n);
    vl.append(v);
    const existing = (name, version) =>
      records.some(
        (r) =>
          r.kind === "fit" &&
          r.arm === profile.id &&
          r.name === name &&
          r.version === version,
      );
    function next() {
      let i = 1;
      while (existing(n.value.trim(), "v" + i)) i++;
      v.value = "v" + i;
    }
    next();
    n.oninput = next;
    const cancel = btn("Cancel", () => d.close()),
      save = btn(
        "Save version",
        async () => {
          const name = n.value.trim(),
            version = v.value.trim();
          if (!name || !version || existing(name, version)) {
            error.textContent = "Enter a name and an unused version.";
            return;
          }
          save.disabled = cancel.disabled = true;
          d.oncancel = (e) => e.preventDefault();
          error.textContent = "Saving…";
          try {
            const parts = {};
            for (const [id, a] of Object.entries(assets))
              parts[id] = {
                mesh: await lib.store(a),
                file: a.name,
                pose: studio.pose(id),
              };
            const item = {
              kind: "fit",
              id: freshId(),
              arm: profile.id,
              name,
              version,
              parts,
              active,
              chest: chest
                ? { mesh: await lib.store(chest), file: chest.name }
                : null,
              foam,
              created: Date.now(),
            };
            await lib.save(item);
            records.push(item);
            rev = item;
            fitName = name;
            d.close();
            fitPanel();
            note("Saved " + name + " · " + version + ".");
          } catch (e) {
            error.textContent = e.message;
          } finally {
            save.disabled = cancel.disabled = false;
            d.oncancel = null;
          }
        },
        true,
      );
    const actions = el("div", "", "row");
    actions.append(cancel, save);
    d.append(head, l, vl, error, actions);
    main.append(d);
    d.onclose = () => d.remove();
    d.showModal();
    n.select();
  }
  $("reset").onclick = () => studio.frameBody();
  $("home").onclick = () => {
    if (!busy) home();
  };
  home();
  work("Opening library…", async () => {
    records = await lib.list();
    home();
  });
})();
