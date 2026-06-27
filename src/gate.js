"use strict";
// The runtime gate. This is the REAL enforcement point — call it at SDK
// import/open, CLI startup, daemon boot, Studio launch, and health checks.
// It reads a locally-cached signed receipt and verifies it fully offline.
//
// Enforcement never lives in postinstall alone; postinstall only prints the
// "please register" notice. This function is what actually unlocks the product.
const { findReceipt } = require("./receipt");
const { verifyReceipt } = require("./verify");

const CONTACT = "founders@vibecode-101.com\n  dev@interchained.org";
const ACTIVE = new Set(["approved", "trial", "enterprise"]);
const PENDING = new Set(["pending_approval", "pending_email_verification"]);
const BLOCKED = new Set(["revoked", "suspended", "denied", "expired"]);

class LicenseError extends Error {
  constructor(message, { state, product } = {}) {
    super(message);
    this.name = "LicenseError";
    this.licenseState = state || "invalid";
    this.code = "LICENSE_" + String(state || "invalid").toUpperCase();
    this.product = product;
  }
}

function graceMs() {
  const days = Number(process.env.INTERCHAINED_LICENSE_GRACE_DAYS);
  return Number.isFinite(days) && days >= 0 ? days * 86400000 : 14 * 86400000;
}

// requireLicense({ product, packageName, env }) → { ok, license, path }
// or throws LicenseError with an actionable, brief-spec message.
function requireLicense({ product, packageName, env } = {}) {
  if (!product) {
    throw new LicenseError("requireLicense requires a `product` name.", { state: "misconfigured" });
  }
  // Escape hatch for the issuer's own infrastructure / CI bootstrap.
  if (process.env.INTERCHAINED_LICENSE_BYPASS === "1") {
    return { ok: true, license: { product, license_state: "bypass" }, path: null, bypass: true };
  }

  const found = findReceipt(product);
  if (!found) {
    throw new LicenseError(
      `${product} requires registration before use.\n\nRun:\n  nedb init\n\nStatus:\n  license_state=missing`,
      { state: "missing", product }
    );
  }
  const r = found.receipt;

  if (!verifyReceipt(r)) {
    throw new LicenseError(
      `${product}: license signature invalid (tampered, or not issued by Interchained).\n\nRun:\n  nedb init\n\nContact:\n  ${CONTACT}`,
      { state: "invalid_signature", product }
    );
  }
  if (product && r.product && r.product !== product) {
    throw new LicenseError(
      `${product}: license receipt is for "${r.product}", not "${product}".\n\nRun:\n  nedb init`,
      { state: "product_mismatch", product }
    );
  }

  const state = r.license_state;
  if (PENDING.has(state)) {
    throw new LicenseError(
      `Registration received.\n\nStatus:\n  ${state}\n\nYour request is awaiting admin approval.`,
      { state, product }
    );
  }
  if (BLOCKED.has(state)) {
    throw new LicenseError(`License ${state}.\n\nContact:\n  ${CONTACT}`, { state, product });
  }
  if (!ACTIVE.has(state)) {
    throw new LicenseError(`${product}: license not active (state=${state}).\n\nRun:\n  nedb license`, { state, product });
  }

  // Expiry (with offline grace for already-approved installs).
  if (r.expires_at) {
    const exp = Date.parse(r.expires_at);
    if (Number.isFinite(exp) && exp < Date.now()) {
      throw new LicenseError(`License expired (${r.expires_at}).\n\nRun:\n  nedb license\n\nContact:\n  ${CONTACT}`, {
        state: "expired",
        product,
      });
    }
  }
  // Offline grace: if a last remote check is recorded, allow a configurable
  // window before forcing a re-check. (First-run activation is never offline —
  // the receipt itself only exists after a successful registration+approval.)
  if (r.last_checked_at) {
    const last = Date.parse(r.last_checked_at);
    if (Number.isFinite(last) && Date.now() - last > graceMs()) {
      // Soft signal: stale, but do not hard-block an approved install offline.
      // Callers may surface r.__stale to nudge `nedb refresh`.
      r.__stale = true;
    }
  }

  // Production gate: production env requires the `production` feature grant.
  const feats = r.features || {};
  const isProd = env === "production" || env === "prod";
  if (isProd && feats.production === false) {
    throw new LicenseError(
      `${product}: this license does not include PRODUCTION use.\n\nRun:\n  nedb license   (or request a commercial grant)\n\nContact:\n  ${CONTACT}`,
      { state: "production_not_licensed", product }
    );
  }

  return { ok: true, license: r, path: found.path, stale: !!r.__stale };
}

module.exports = { requireLicense, LicenseError, ACTIVE, PENDING, BLOCKED };
