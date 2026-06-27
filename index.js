"use strict";
// @aiassistsecure/license-gate — public SDK surface.
//
// Protected packages call requireLicense() at import/open/boot:
//
//   const { requireLicense } = require("@aiassistsecure/license-gate");
//   requireLicense({ product: "nedb-engine", packageName: "nedb-engine", env: process.env.NODE_ENV });
//
// Server-side signing (src/sign.js) is intentionally NOT exported here — the
// issuer private key lives only with the license API.
const { requireLicense, LicenseError } = require("./src/gate");
const { verifyReceipt } = require("./src/verify");
const { findReceipt } = require("./src/receipt");
const { isCompanyEmail } = require("./src/email");

module.exports = { requireLicense, LicenseError, verifyReceipt, findReceipt, isCompanyEmail };
