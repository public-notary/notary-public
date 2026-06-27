"use strict";
// SPDX license catalogue. Reads the VENDORED SPDX License List corpus
// (spdx/json/licenses.json index + spdx/text/<id>.txt full texts). Every byte
// of license content is the SPDX corpus we vendored (see spdx/PROVENANCE.json);
// no license text is authored in this package.
const fs = require("fs");
const path = require("path");

const SPDX_DIR = path.join(__dirname, "..", "spdx");
const TEXT_DIR = path.join(SPDX_DIR, "text");
const JSON_DIR = path.join(SPDX_DIR, "json");

let _index = null;
function index() {
  if (!_index) _index = JSON.parse(fs.readFileSync(path.join(JSON_DIR, "licenses.json"), "utf8"));
  return _index;
}

function list({ osiOnly = false, includeDeprecated = false } = {}) {
  return index().licenses
    .filter((l) => includeDeprecated || !l.isDeprecatedLicenseId)
    .filter((l) => !osiOnly || l.isOsiApproved)
    .map((l) => ({ id: l.licenseId, name: l.name, osi: !!l.isOsiApproved, deprecated: !!l.isDeprecatedLicenseId }));
}

function meta(spdxId) {
  const want = String(spdxId || "").toLowerCase();
  return index().licenses.find((l) => l.licenseId.toLowerCase() === want) || null;
}

function textPath(spdxId) {
  const m = meta(spdxId);
  const id = m ? m.licenseId : spdxId;
  const p = path.join(TEXT_DIR, id + ".txt");
  return fs.existsSync(p) ? p : null;
}

function getText(spdxId) {
  const p = textPath(spdxId);
  return p ? fs.readFileSync(p, "utf8") : null;
}

function search(q) {
  const s = String(q || "").toLowerCase();
  return list({ includeDeprecated: true }).filter(
    (l) => l.id.toLowerCase().includes(s) || l.name.toLowerCase().includes(s)
  );
}

function version() {
  try { return require("../spdx/PROVENANCE.json").licenseListVersion; } catch { return null; }
}

module.exports = { index, list, meta, getText, textPath, search, version, SPDX_DIR, TEXT_DIR, JSON_DIR };
