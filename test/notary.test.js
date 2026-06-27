"use strict";
// SPDX catalogue + place + notarize roundtrip.
const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { list, getText, meta, search, version } = require("../src/catalogue");
const { placeLicense } = require("../src/place");
const { notarize, verifyAttestation } = require("../src/notarize");
const { loadIssuerKey } = require("../src/sign");

const KEY = loadIssuerKey();
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "np-"));
let pass = 0, fail = 0;
function check(name, fn) {
  try { fn(); console.log("  ok  " + name); pass++; }
  catch (e) { console.log("  XX  " + name + "  ::  " + (e && e.message || e)); fail++; }
}

console.log("notary-public catalogue/place/notarize tests (SPDX " + version() + "):");

check("catalogue lists the full corpus", () => {
  const all = list({ includeDeprecated: true });
  assert.ok(all.length > 600, "expected >600 licenses, got " + all.length);
  const osi = list({ osiOnly: true });
  assert.ok(osi.length > 100 && osi.length < all.length);
});

check("known licenses resolve (MIT, Apache-2.0, GPL-3.0-only, BUSL-1.1)", () => {
  for (const id of ["MIT", "Apache-2.0", "GPL-3.0-only", "BUSL-1.1"]) {
    assert.ok(meta(id), "meta missing " + id);
    assert.ok(getText(id) && getText(id).length > 100, "text missing " + id);
  }
  assert.ok(/permission is hereby granted/i.test(getText("MIT")));
});

check("case-insensitive lookup + search", () => {
  assert.strictEqual(meta("mit").licenseId, "MIT");
  assert.ok(search("apache").some((l) => l.id === "Apache-2.0"));
});

let placed;
check("place MIT into a project", () => {
  const dest = path.join(tmp, "proj", "LICENSE");
  placed = placeLicense("MIT", dest);
  assert.ok(fs.existsSync(dest));
  assert.strictEqual(placed.id, "MIT");
  assert.strictEqual(fs.readFileSync(dest, "utf8"), getText("MIT"));
});

check("place refuses to clobber without force", () => {
  assert.throws(() => placeLicense("MIT", placed.dest));
  const r = placeLicense("Apache-2.0", placed.dest, { force: true });
  assert.strictEqual(r.id, "Apache-2.0");
  // restore MIT for notarize test
  placeLicense("MIT", placed.dest, { force: true });
});

check("place rejects unknown id", () => {
  assert.throws(() => placeLicense("NOPE-9000", path.join(tmp, "x")));
});

check("notarize identifies a placed license as exact MIT", () => {
  const att = notarize(placed.dest);
  assert.strictEqual(att.spdx_id, "MIT");
  assert.strictEqual(att.match, "exact");
  assert.strictEqual(att.file_sha256, att.canonical_sha256);
});

check("notarize detects a modified license (not exact)", () => {
  const f = path.join(tmp, "MODIFIED-LICENSE");
  fs.writeFileSync(f, getText("MIT") + "\n\n// sneaky extra clause\n");
  const att = notarize(f, { spdxId: "MIT" });
  assert.notStrictEqual(att.match, "exact");
});

check("signed notarization stamp verifies; tamper fails", () => {
  const att = notarize(placed.dest, { privateKeyPem: KEY });
  assert.ok(att.signature, "expected a signature");
  assert.strictEqual(verifyAttestation(att), true);
  const tampered = Object.assign({}, att, { spdx_id: "Apache-2.0" });
  assert.strictEqual(verifyAttestation(tampered), false);
});

console.log("\n" + (fail === 0 ? "ALL GREEN" : "FAILURES") + " — " + pass + " passed, " + fail + " failed");
process.exit(fail === 0 ? 0 : 1);
