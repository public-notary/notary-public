"use strict";
// The license authority — dogfoods nedb-engine. Every lifecycle transition is
// an immutable, content-addressed NEDB event whose `caused_by` points at the
// hash(es) of the events that produced it, so `TRACE caused_by` reconstructs
// "who approved it, when, and why" natively. Approval signs an offline receipt
// the notary-public client SDK verifies.
const crypto = require("crypto");
const { signReceipt } = require("../src/sign");
const { isCompanyEmail } = require("../src/email");
const { loadIssuerPrivateKey } = require("./keys");

let _NedbCore;
function NedbCore() {
  if (!_NedbCore) {
    try { _NedbCore = require("nedb-engine").NedbCore; }
    catch (e) { throw new Error("notary authority requires nedb-engine (optionalDependency): npm i nedb-engine"); }
  }
  return _NedbCore;
}
const rid = (p) => `${p}_${crypto.randomBytes(8).toString("hex")}`;
const now = () => new Date().toISOString();

class Authority {
  constructor(dataDir, { issuerKey } = {}) {
    // The authority's own nedb-engine must not be gated by itself.
    if (!process.env.INTERCHAINED_LICENSE_BYPASS) process.env.INTERCHAINED_LICENSE_BYPASS = "1";
    this.db = NedbCore().open(dataDir);
    this.key = issuerKey || loadIssuerPrivateKey();
  }
  _put(coll, id, doc, caused_by = []) {
    return JSON.parse(this.db.put(coll, id, JSON.stringify({ ...doc, caused_by })));
  }
  _get(coll, id) { const s = this.db.get(coll, id); return s ? JSON.parse(s) : null; }
  _q(nql) { return this.db.query(nql).map((s) => JSON.parse(s)); }
  // Append a causal event; returns its content hash (used as the next caused_by).
  _event(type, license_id, actor, extra = {}, causes = []) {
    const node = this._put("events", rid("evt"), { kind: "license_event", type, license_id, actor, at: now(), ...extra }, causes);
    return node._hash;
  }

  register({ product, org, email, project, env, use_case }) {
    const chk = isCompanyEmail(email);
    if (!chk.ok) {
      const e = new Error(chk.reason === "consumer_domain"
        ? `Company email required — ${chk.domain} is a personal inbox.`
        : "Invalid email address.");
      e.code = chk.reason; throw e;
    }
    const domain = chk.domain;
    const org_id = rid("org"), user_id = rid("usr"), license_id = rid("lic"), install_id = rid("inst");
    this._put("organizations", org_id, { name: org, domain, status: "pending", created_at: now() });
    this._put("users", user_id, { email, org_id, email_verified: false, role: "owner", created_at: now() });
    const evt = this._event("registered", license_id, email, { org, domain, project, env, use_case, org_id, user_id }, []);
    this._put("licenses", license_id, {
      product, org, org_id, user_id, email, domain, project, env, use_case,
      state: "pending_email_verification", install_id, latest_event: evt, created_at: now(),
    });
    return { license_id, org_id, user_id, install_id, state: "pending_email_verification" };
  }

  verifyEmail(license_id) {
    const lic = this._get("licenses", license_id); if (!lic) throw new Error("no such license");
    const evt = this._event("email_verified", license_id, lic.email, {}, [lic.latest_event]);
    this._put("users", lic.user_id, { ...this._get("users", lic.user_id), email_verified: true });
    this._put("licenses", license_id, { ...lic, state: "pending_approval", latest_event: evt });
    return { state: "pending_approval" };
  }

  approve(license_id, admin, { license_type = "BUSL-commercial-grant", features = { engine: true, production: true }, expires_at = null } = {}) {
    const lic = this._get("licenses", license_id); if (!lic) throw new Error("no such license");
    const receipt = signReceipt({
      product: lic.product, org: lic.org, email: lic.email, domain: lic.domain,
      license_state: "approved", license_type, install_id: lic.install_id, org_id: lic.org_id,
      issued_at: now(), expires_at, features,
    }, this.key);
    const evt = this._event("approved", license_id, admin, { license_type, features, expires_at }, [lic.latest_event]);
    this._put("receipts", lic.install_id, { license_id, receipt, issued_at: now() });
    this._put("organizations", lic.org_id, { ...this._get("organizations", lic.org_id), status: "approved" });
    this._put("licenses", license_id, { ...lic, state: "approved", license_type, features, expires_at, latest_event: evt, approved_by: admin });
    return receipt;
  }

  _transition(license_id, admin, type, state, extra = {}) {
    const lic = this._get("licenses", license_id); if (!lic) throw new Error("no such license");
    const evt = this._event(type, license_id, admin, extra, [lic.latest_event]);
    this._put("licenses", license_id, { ...lic, state, latest_event: evt, ...extra });
    return { state };
  }
  deny(license_id, admin, reason = "") { return this._transition(license_id, admin, "denied", "denied", { reason }); }
  revoke(license_id, admin, reason = "") { return this._transition(license_id, admin, "revoked", "revoked", { reason, revoked_at: now() }); }
  suspend(license_id, admin, reason = "") { return this._transition(license_id, admin, "suspended", "suspended", { reason }); }
  restore(license_id, admin) { return this._transition(license_id, admin, "restored", "approved", {}); }

  check(license_id) { const l = this._get("licenses", license_id); return l ? { state: l.state, product: l.product, org: l.org } : null; }
  receipt(install_id) { const r = this._get("receipts", install_id); return r ? r.receipt : null; }
  licenses(state) { const rows = this._q("FROM licenses"); return state ? rows.filter((r) => r.state === state) : rows; }
  organizations() { return this._q("FROM organizations"); }

  // Real operational aggregate for the cockpit dashboard (no mock data).
  metrics() {
    const lics = this._q("FROM licenses");
    const byState = {}, byProduct = {};
    let today = 0, week = 0, month = 0; const now = Date.now();
    for (const l of lics) {
      byState[l.state] = (byState[l.state] || 0) + 1;
      byProduct[l.product] = (byProduct[l.product] || 0) + 1;
      const t = Date.parse(l.created_at || "");
      if (t) { const age = now - t; if (age < 864e5) today++; if (age < 6048e5) week++; if (age < 2592e6) month++; }
    }
    return {
      active: byState["approved"] || 0,
      pending: (byState["pending_approval"] || 0) + (byState["pending_email_verification"] || 0),
      flagged: (byState["suspended"] || 0) + (byState["denied"] || 0),
      registrations: { today, week, month },
      orgs: this._q("FROM organizations").length,
      total: lics.length,
      products: Object.entries(byProduct).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count),
    };
  }

  _latestEventId(license_id) {
    const rows = this._q(`FROM events WHERE license_id = "${license_id}"`);
    rows.sort((a, b) => (b._seq || 0) - (a._seq || 0));
    return rows[0] ? rows[0]._id : null;
  }
  // Native causal provenance: TRACE caused_by from the latest event.
  trace(license_id) {
    const head = this._latestEventId(license_id);
    if (!head) return [];
    return this._q(`FROM events WHERE _id = "${head}" TRACE caused_by`)
      .map((r) => ({ type: r.type, actor: r.actor, at: r.at, reason: r.reason, hash: r._hash, caused_by: r._caused_by || [] }));
  }
}

module.exports = { Authority };
