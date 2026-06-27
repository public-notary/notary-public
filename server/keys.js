"use strict";
// Issuer signing key resolution for the license authority. CONFIGURABLE so any
// self-hoster runs their own authority with their own keypair:
//   1. INTERCHAINED_ISSUER_KEY — PEM contents, or a path to a PEM file
//   2. repo-local .issuer-key.pem (dev / the canonical Interchained authority)
//   3. ephemeral generated key (warns loudly — receipts won't verify against the
//      shipped public key; pair with your own client build + `notary keygen`)
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

function loadIssuerPrivateKey() {
  const env = process.env.INTERCHAINED_ISSUER_KEY;
  if (env && env.includes("BEGIN")) return env;
  if (env && fs.existsSync(env)) return fs.readFileSync(env, "utf8");
  const repoKey = path.join(__dirname, "..", ".issuer-key.pem");
  if (fs.existsSync(repoKey)) return fs.readFileSync(repoKey, "utf8");
  const { privateKey } = crypto.generateKeyPairSync("ed25519");
  console.warn(
    "[notary] WARNING: no issuer key configured — generated an EPHEMERAL key.\n" +
    "         Receipts will NOT verify against the shipped public key.\n" +
    "         Set INTERCHAINED_ISSUER_KEY (PEM or path) for production."
  );
  return privateKey.export({ type: "pkcs8", format: "pem" });
}

// The matching public key (for self-hosters to embed in their own client build).
function publicKeyPem(privatePem) {
  return crypto.createPublicKey(privatePem).export({ type: "spki", format: "pem" });
}

module.exports = { loadIssuerPrivateKey, publicKeyPem };
