"use strict";
// Deterministic JSON canonicalization for signing/verifying license receipts.
//
// Recursively sorts object keys (arrays keep their order) and ALWAYS excludes
// the `signature` field, so a receipt hashes to the same bytes before and after
// it is signed. Both the issuer (sign) and the runtime (verify) canonicalize
// identically, so verification is exact and offline.
function canonicalize(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return "[" + value.map(canonicalize).join(",") + "]";
  const keys = Object.keys(value)
    .filter((k) => k !== "signature")
    .sort();
  return "{" + keys.map((k) => JSON.stringify(k) + ":" + canonicalize(value[k])).join(",") + "}";
}

module.exports = { canonicalize };
