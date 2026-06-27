"use strict";
// License notarization. Identify which SPDX license a file is, and attest the
// match — an offline, optionally issuer-signed "notary stamp". The attestation
// reuses the same Ed25519 receipt machinery as the deployment gate, so it
// verifies offline against the embedded public key.
const fs = require("fs");
const crypto = require("crypto");
const { getText, meta, list, version } = require("./catalogue");
const { signReceipt } = require("./sign"); // server-side stamp (optional)
const { verifyReceipt } = require("./verify");

function sha256(buf) {
  return crypto.createHash("sha256").update(buf).digest("hex");
}
// Whitespace-insensitive, case-insensitive normalization for "same license,
// different formatting" matching. (Filled-in placeholders still differ — that's
// reported as a non-exact match, by design.)
function normalize(s) {
  return String(s).replace(/\r\n/g, "\n").replace(/\s+/g, " ").trim().toLowerCase();
}

let _normIndex = null;
function normIndex() {
  if (_normIndex) return _normIndex;
  _normIndex = new Map();
  for (const l of list({ includeDeprecated: true })) {
    const t = getText(l.id);
    if (t != null) _normIndex.set(sha256(normalize(t)), l.id);
  }
  return _normIndex;
}

// notarize(filePath, { spdxId?, privateKeyPem? }) → attestation object
// (signed if a private key is supplied). match ∈ { exact, normalized, none }.
function notarize(filePath, { spdxId, privateKeyPem } = {}) {
  const content = fs.readFileSync(filePath);
  const fileSha = sha256(content);
  const fileNorm = sha256(normalize(content.toString("utf8")));

  let id = spdxId ? (meta(spdxId) ? meta(spdxId).licenseId : spdxId) : normIndex().get(fileNorm) || null;
  let match = "none", canonicalSha = null, name = null, osi = null;
  if (id) {
    const canon = getText(id);
    const m = meta(id);
    name = m ? m.name : null;
    osi = m ? !!m.isOsiApproved : null;
    if (canon != null) {
      canonicalSha = sha256(Buffer.from(canon, "utf8"));
      const canonNorm = sha256(normalize(canon));
      match = canonicalSha === fileSha ? "exact" : canonNorm === fileNorm ? "normalized" : "none";
    }
  }

  const att = {
    kind: "license-notarization",
    file: filePath,
    file_sha256: fileSha,
    file_normalized_sha256: fileNorm,
    spdx_id: id,
    license_name: name,
    osi_approved: osi,
    match,
    canonical_sha256: canonicalSha,
    spdx_list_version: version(),
    notary: "public-notary (Interchained LLC)",
    notarized_at: new Date().toISOString(),
  };
  return privateKeyPem ? signReceipt(att, privateKeyPem) : att;
}

// Verify a signed notarization stamp offline against the embedded public key.
function verifyAttestation(att) {
  return verifyReceipt(att);
}

module.exports = { notarize, verifyAttestation, sha256, normalize };
