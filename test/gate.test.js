"use strict";
// End-to-end: sign a receipt with the issuer key, then verify the runtime gate
// behaves for every state. Proves the offline sign→verify→gate roundtrip.
const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { signReceipt, loadIssuerKey } = require("../src/sign");
const { requireLicense, LicenseError } = require("../src/gate");
const { verifyReceipt } = require("../src/verify");
const { isCompanyEmail } = require("../src/email");

const KEY = loadIssuerKey();
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "lg-"));
let pass = 0, fail = 0;
function check(name, fn) {
  try { fn(); console.log("  ok  " + name); pass++; }
  catch (e) { console.log("  XX  " + name + "  ::  " + (e && e.message || e)); fail++; }
}
function base(over) {
  return Object.assign({
    product: "nedb-engine", org: "Interchained LLC", email: "dev@interchained.org",
    domain: "interchained.org", license_state: "approved", license_type: "BUSL-commercial-grant",
    install_id: "inst_test", org_id: "org_test", issued_at: new Date().toISOString(),
    expires_at: null, features: { engine: true, studio: true, redis_wrap: true, production: true },
  }, over || {});
}
function writeSigned(over) {
  const r = signReceipt(base(over), KEY);
  const p = path.join(tmp, "lic_" + Math.random().toString(36).slice(2) + ".json");
  fs.writeFileSync(p, JSON.stringify(r, null, 2));
  process.env.INTERCHAINED_LICENSE_FILE = p;
  return { r, p };
}

console.log("license-gate gate tests:");

check("approved unlocks (prod)", () => {
  writeSigned();
  const res = requireLicense({ product: "nedb-engine", env: "production" });
  assert.strictEqual(res.ok, true);
  assert.strictEqual(res.license.license_state, "approved");
});

check("tampered receipt rejected", () => {
  const { r, p } = writeSigned();
  r.org = "Evil Corp"; r.features.production = true; // mutate AFTER signing
  fs.writeFileSync(p, JSON.stringify(r, null, 2));
  assert.strictEqual(verifyReceipt(r), false);
  assert.throws(() => requireLicense({ product: "nedb-engine" }),
    (e) => e instanceof LicenseError && e.licenseState === "invalid_signature");
});

check("pending awaits approval", () => {
  writeSigned({ license_state: "pending_approval" });
  assert.throws(() => requireLicense({ product: "nedb-engine" }),
    (e) => e.licenseState === "pending_approval" && /awaiting admin approval/.test(e.message));
});

check("revoked blocked", () => {
  writeSigned({ license_state: "revoked" });
  assert.throws(() => requireLicense({ product: "nedb-engine" }), (e) => e.licenseState === "revoked");
});

check("expired blocked", () => {
  writeSigned({ expires_at: "2000-01-01T00:00:00Z" });
  assert.throws(() => requireLicense({ product: "nedb-engine" }), (e) => e.licenseState === "expired");
});

check("production gate (dev ok, prod blocked)", () => {
  writeSigned({ features: { engine: true, production: false } });
  assert.strictEqual(requireLicense({ product: "nedb-engine", env: "development" }).ok, true);
  assert.throws(() => requireLicense({ product: "nedb-engine", env: "production" }),
    (e) => e.licenseState === "production_not_licensed");
});

check("missing requires register", () => {
  process.env.INTERCHAINED_LICENSE_FILE = path.join(tmp, "nope.json");
  assert.throws(() => requireLicense({ product: "nedb-engine" }),
    (e) => e.licenseState === "missing" && /license_state=missing/.test(e.message));
});

check("company email gate", () => {
  assert.strictEqual(isCompanyEmail("dev@interchained.org").ok, true);
  assert.strictEqual(isCompanyEmail("founders@vibecode-101.com").ok, true);
  assert.strictEqual(isCompanyEmail("someone@gmail.com").ok, false);
  assert.strictEqual(isCompanyEmail("x@proton.me").ok, false);
  assert.strictEqual(isCompanyEmail("notanemail").ok, false);
});

console.log("\n" + (fail === 0 ? "ALL GREEN" : "FAILURES") + " — " + pass + " passed, " + fail + " failed");
process.exit(fail === 0 ? 0 : 1);
