const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { chromium } = require("playwright");
const THREE = require("../src/vendor/three.min.js");
const readJS = async (f) =>
  fs.readFile(path.join(__dirname, "../src", f + ".js"), "utf8");
async function run() {
  const G = new Function(
    "THREE",
    (await readJS("mesh")) + (await readJS("geometry")) + ";return ArmGeometry",
  )(THREE);
  const shell = Buffer.from(G.stl(new THREE.Mesh(G.demo("shoulder"))));
  const file = (name, buffer) => ({
    name,
    mimeType: "application/octet-stream",
    buffer,
  });
  const browser = await chromium.launch({
    executablePath:
      process.env.CHROME_BIN ||
      (process.platform === "darwin"
        ? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
        : undefined),
    headless: true,
    args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
  });
  try {
    const page = await browser.newPage({
      viewport: { width: 1250, height: 820 },
    });
    page.setDefaultTimeout(6000);
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    const button = (name) => page.getByRole("button", { name, exact: true }),
      click = (name) => button(name).click();
    async function pick(name, f) {
      const ready = page.waitForEvent("filechooser");
      await click(name);
      await (await ready).setFiles(f);
    }
    async function exportBytes() {
      const ready = page.waitForEvent("download");
      await click("Download fitted plate");
      return fs.readFile(await (await ready).path());
    }
    await page.goto(
      pathToFileURL(path.resolve(__dirname, "../dist/preview.html")).href,
    );
    for (const [region, closed, side] of [
      ["forearm", true, "Right"],
      ["upper", false, "Left"],
      ["shoulder", false, "Left"],
    ]) {
      await page
        .getByRole("button", { name: new RegExp("^" + G.regions[region]) })
        .click();
      await click(side);
      if (closed) await click("Slides over my hand");
      await click("Measure my arm");
      const input = page.getByLabel("Your measurement");
      await input.fill("0");
      assert(await button("Next").isDisabled());
      const steps = G.steps(region, closed);
      for (let i = 0; i < steps.length; i++) {
        const s = steps[i];
        await input.fill(String(s.initial / 10));
        await click(i === steps.length - 1 ? "Review arm" : "Next");
      }
      await page.getByLabel("Arm name").fill("Studio " + region);
      await click("Save and fit armor");
      await pick(
        "Choose armor STL",
        file("broken.stl", Buffer.from("not STL")),
      );
      await page.getByText("Choose a complete binary or ASCII STL.").waitFor();
      const fits = process.argv.slice(2);
      const real =
        region === "shoulder" && fits[0]
          ? fits[0]
          : region === "upper" && fits[1]
            ? fits[1]
            : null;
      const mesh = real
        ? await fs.readFile(real)
        : Buffer.from(G.stl(new THREE.Mesh(G.demo(region))));
      await pick("Choose armor STL", real || file(region + ".stl", mesh));
      await click("Move");
      await click("Rotate");
      await click("Orbit");
      await page.getByLabel("Plate scale (%)").fill("108");
      await page.getByRole("checkbox", { name: "Preview foam pads" }).check();
      for (const view of ["Front cut", "Side cut", "Top cut"]) {
        await click(view);
        await click("Measure gap");
        await click("Measure gap");
      }
      await click("3D");
      if (closed) {
        await page.getByText("Hand entry", { exact: true }).click();
        await click("Show hand entry");
        await page.getByRole("slider", { name: "Entry height" }).focus();
        await page.keyboard.press("ArrowRight");
        await click("Hide hand entry");
      }
      if (region === "shoulder") {
        await page.getByText("Shoulder overlap", { exact: true }).click();
        const ref = Buffer.from(shell);
        ref.write("ROOMSHOULDER");
        ref.writeUInt32LE(1, 12);
        ref.writeFloatLE(60, 16);
        ref.writeFloatLE(-60, 28);
        await pick(
          "Add chest reference",
          process.env.CHEST_REFERENCE_STL || file("Registration.stl", ref),
        );
        const neutral = await exportBytes();
        assert.equal(neutral.readUInt32LE(80), mesh.readUInt32LE(80));
        for (const pose of ["Reach forward", "Arm raised"]) {
          await click(pose);
          assert.equal(await button("Download fitted plate").count(), 0);
        }
        await click("Arm down");
        assert((await exportBytes()).equals(neutral));
        for (const f of fits.slice(2)) await pick("Add piece", f);
        await pick("Add piece", file("Neighbor.stl", shell));
        await click(real ? path.parse(real).name : region);
      }
      await click("Save fit…");
      await page.getByLabel("Fit name").fill("Fit " + region);
      await click("Save version");
      await page.getByText("Saved Fit " + region + " · v1.").waitFor();
      const fitted = await exportBytes();
      assert.equal(fitted.length, mesh.length);
      await page.reload();
      await click("Saved fits");
      await page
        .getByRole("button", { name: new RegExp("Fit " + region + " · v1") })
        .click();
      assert((await exportBytes()).equals(fitted));
      console.log(
        region,
        real || "procedural closed shell",
        mesh.readUInt32LE(80),
        "triangles; fit reopened byte-identically",
      );
      await click("Library");
      await click("Arms");
    }
    await page.getByRole("button", { name: /^Shoulder Pauldrons/ }).click();
    await click("Try the Mandalorian shoulder");
    await page.getByRole("heading", { name: "Fit armor" }).waitFor();
    await click("Library");
    await page
      .getByRole("button", { name: /^Forearm & wrist Bracers/ })
      .click();
    await pick("Use arm scan", file("Demo scan.stl", shell));
    await click("Save and fit armor");
    await pick("Choose armor STL", file("Demo.stl", shell));
    assert.equal((await exportBytes()).length, shell.length);
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
}
run().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
