"use strict";
// Local signed-license-receipt storage. Two locations, searched in order:
//   1. $INTERCHAINED_LICENSE_FILE  (explicit override)
//   2. <cwd>/.nedb/license.json     (project-local)
//   3. ~/.interchained/licenses/<product>.json  (user/global)
const fs = require("fs");
const os = require("os");
const path = require("path");

function userReceiptPath(product) {
  return path.join(os.homedir(), ".interchained", "licenses", `${product}.json`);
}
function projectReceiptPath(cwd) {
  return path.join(cwd || process.cwd(), ".nedb", "license.json");
}

function findReceipt(product, opts = {}) {
  const candidates = [];
  if (process.env.INTERCHAINED_LICENSE_FILE) candidates.push(process.env.INTERCHAINED_LICENSE_FILE);
  candidates.push(projectReceiptPath(opts.cwd));
  candidates.push(userReceiptPath(product));
  for (const p of candidates) {
    try {
      if (p && fs.existsSync(p)) {
        const r = JSON.parse(fs.readFileSync(p, "utf8"));
        if (!product || r.product === product) return { receipt: r, path: p };
      }
    } catch {
      /* malformed receipt — keep searching */
    }
  }
  return null;
}

function writeUserReceipt(product, receipt) {
  const p = userReceiptPath(product);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(receipt, null, 2));
  return p;
}

module.exports = { userReceiptPath, projectReceiptPath, findReceipt, writeUserReceipt };
