"use strict";
// Offline receipt verification. The issuer's Ed25519 PUBLIC key is shipped in
// the package (issuer-public-key.pem) and embedded here; the runtime verifies a
// locally-cached signed receipt against it with NO contact to any license
// server. The private key never ships.
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { canonicalize } = require("./canonical");

const PUBLIC_KEY_PEM = fs.readFileSync(
  path.join(__dirname, "issuer-public-key.pem"),
  "utf8"
);

// Verify a receipt's Ed25519 signature over its canonical bytes.
// Returns true only if the signature was produced by the issuer key.
function verifyReceipt(receipt) {
  if (!receipt || typeof receipt !== "object" || typeof receipt.signature !== "string") {
    return false;
  }
  try {
    const key = crypto.createPublicKey(PUBLIC_KEY_PEM);
    const msg = Buffer.from(canonicalize(receipt), "utf8");
    return crypto.verify(null, msg, key, Buffer.from(receipt.signature, "base64"));
  } catch {
    return false;
  }
}

module.exports = { verifyReceipt, PUBLIC_KEY_PEM };
