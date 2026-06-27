"""
Company/organization email gate. Registration requires a verifiable company
domain — generic consumer inboxes are rejected so every license maps to a
real organization identity.
"""
from __future__ import annotations

import re

CONSUMER_DOMAINS = {
    "gmail.com", "googlemail.com", "outlook.com", "hotmail.com", "live.com", "msn.com",
    "yahoo.com", "ymail.com", "aol.com", "proton.me", "protonmail.com", "pm.me",
    "icloud.com", "me.com", "mac.com", "gmx.com", "mail.com", "zoho.com",
    "yandex.com", "hey.com", "fastmail.com", "tutanota.com", "duck.com",
}

_EMAIL_RE = re.compile(r"^[^@\s]+@([^@\s]+\.[^@\s]+)$")


def email_domain(email: str) -> str | None:
    """Extract domain from email address, or None if invalid."""
    m = _EMAIL_RE.match(str(email or "").strip().lower())
    return m.group(1) if m else None


def is_company_email(email: str) -> dict:
    """
    Returns {"ok": True, "domain": <d>} for company addresses,
    or {"ok": False, "reason": "invalid_email"|"consumer_domain", "domain"?: <d>}.
    """
    d = email_domain(email)
    if not d:
        return {"ok": False, "reason": "invalid_email"}
    if d in CONSUMER_DOMAINS:
        return {"ok": False, "reason": "consumer_domain", "domain": d}
    return {"ok": True, "domain": d}
