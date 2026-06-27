"use strict";
// Place a vendored SPDX license into a project. Copies the canonical SPDX text
// VERBATIM (downloaded/vendored, never authored here) to a destination file
// (default ./LICENSE).
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { getText, meta } = require("./catalogue");

function placeLicense(spdxId, destPath, { force = false } = {}) {
  const m = meta(spdxId);
  if (!m) throw new Error(`Unknown SPDX license id: ${spdxId}`);
  const text = getText(m.licenseId);
  if (text == null) throw new Error(`No vendored text for ${m.licenseId}`);
  const dest = destPath || path.join(process.cwd(), "LICENSE");
  if (fs.existsSync(dest) && !force) {
    throw new Error(`${dest} already exists — pass { force: true } to overwrite`);
  }
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, text);
  return {
    id: m.licenseId,
    name: m.name,
    dest,
    bytes: Buffer.byteLength(text),
    sha256: crypto.createHash("sha256").update(text).digest("hex"),
  };
}

module.exports = { placeLicense };
