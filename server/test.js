"use strict";
// Proves the authority end to end on real nedb-engine: register -> verify ->
// approve (sign a receipt the client SDK verifies) -> revoke, with TRACE
// reconstructing the full causal lineage.
const os = require("os"), fs = require("fs"), path = require("path");
const { Authority } = require("./store");
const { requireLicense } = require("../src/gate");
const { verifyReceipt } = require("../src/verify");

let pass = 0, fail = 0;
const check = (n, f) => { try { f(); console.log("  ok  " + n); pass++; } catch (e) { console.log("  XX  " + n + "  ::  " + (e && e.message || e)); fail++; } };
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "np-auth-"));
const A = new Authority(dir);
let reg, receipt;

console.log("notary authority — lifecycle + causal-provenance test:");

check("register (company email) -> pending_email_verification", () => {
  reg = A.register({ product: "nedb-engine", org: "Acme Inc", email: "dev@acme.com", project: "indexer", env: "production", use_case: "blockchain indexer" });
  if (reg.state !== "pending_email_verification") throw new Error(reg.state);
});
check("register rejects consumer email", () => {
  try { A.register({ product: "x", org: "y", email: "someone@gmail.com" }); throw new Error("should have rejected"); }
  catch (e) { if (e.code !== "consumer_domain") throw e; }
});
check("verify-email -> pending_approval", () => {
  if (A.verifyEmail(reg.license_id).state !== "pending_approval") throw new Error("not pending_approval");
});
check("approve issues a signed receipt the client SDK accepts", () => {
  receipt = A.approve(reg.license_id, "founders@vibecode-101.com", { features: { engine: true, production: true } });
  if (!verifyReceipt(receipt)) throw new Error("issued receipt does not verify against the embedded public key");
  if (receipt.license_state !== "approved") throw new Error(receipt.license_state);
  const f = path.join(dir, "receipt.json");
  fs.writeFileSync(f, JSON.stringify(receipt));
  process.env.INTERCHAINED_LICENSE_FILE = f;
  if (!requireLicense({ product: "nedb-engine", env: "production" }).ok) throw new Error("gate rejected an approved receipt");
});
check("revoke -> authority state revoked", () => {
  if (A.revoke(reg.license_id, "founders@vibecode-101.com", "key compromised").state !== "revoked") throw new Error("not revoked");
  if (A.check(reg.license_id).state !== "revoked") throw new Error("check() not revoked");
});
check("TRACE caused_by reconstructs the full lineage", () => {
  const chain = A.trace(reg.license_id);
  const types = chain.map((c) => c.type);
  for (const t of ["registered", "email_verified", "approved", "revoked"]) {
    if (!types.includes(t)) throw new Error(`missing ${t} in lineage [${types.join(", ")}]`);
  }
  const revoked = chain.find((c) => c.type === "revoked");
  if (!revoked.caused_by.length) throw new Error("revoked event is not causally linked");
  console.log("       lineage (newest first): " + types.join("  <-  "));
});

console.log("\n" + (fail === 0 ? "ALL GREEN" : "FAILURES") + " — " + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
