"use strict";
// Company/organization email gate. Registration requires a verifiable company
// domain — generic consumer inboxes are rejected so every license maps to a
// real organization identity.
const CONSUMER_DOMAINS = new Set([
  "gmail.com", "googlemail.com", "outlook.com", "hotmail.com", "live.com", "msn.com",
  "yahoo.com", "ymail.com", "aol.com", "proton.me", "protonmail.com", "pm.me",
  "icloud.com", "me.com", "mac.com", "gmx.com", "mail.com", "zoho.com",
  "yandex.com", "hey.com", "fastmail.com", "tutanota.com", "duck.com",
]);

function emailDomain(email) {
  const m = String(email || "").trim().toLowerCase().match(/^[^@\s]+@([^@\s]+\.[^@\s]+)$/);
  return m ? m[1] : null;
}

// → { ok, domain } | { ok:false, reason:"invalid_email"|"consumer_domain", domain? }
function isCompanyEmail(email) {
  const d = emailDomain(email);
  if (!d) return { ok: false, reason: "invalid_email" };
  if (CONSUMER_DOMAINS.has(d)) return { ok: false, reason: "consumer_domain", domain: d };
  return { ok: true, domain: d };
}

module.exports = { isCompanyEmail, emailDomain, CONSUMER_DOMAINS };
