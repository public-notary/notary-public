"use strict";
// SERVER-SIDE ONLY. Signs an approved license receipt with the issuer's Ed25519
// PRIVATE key. This module is used by the license API when an admin approves a
// request; the private key (.issuer-key.pem) is never published in the package.
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { canonicalize } = require("./canonical");

// Returns a new receipt object with `signature` (base64 Ed25519) set over the
// canonical bytes of every other field. Mutating any field after signing
// invalidates the signature.
function signReceipt(receipt, privateKeyPem) {
  const key = crypto.createPrivateKey(privateKeyPem);
  const msg = Buffer.from(canonicalize(receipt), "utf8");
  const sig = crypto.sign(null, msg, key); // Ed25519 → algorithm must be null
  return { ...receipt, signature: sig.toString("base64") };
}

// Convenience for the issuer/server: load the private key from disk (path or
// the INTERCHAINED_ISSUER_KEY env, default ../.issuer-key.pem next to package).
function loadIssuerKey(keyPath) {
  const p =
    keyPath ||
    process.env.INTERCHAINED_ISSUER_KEY ||
    path.join(__dirname, "..", ".issuer-key.pem");
  return fs.readFileSync(p, "utf8");
}

module.exports = { signReceipt, loadIssuerKey };
