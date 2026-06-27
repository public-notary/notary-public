"""
The runtime gate. This is the REAL enforcement point — call it at package
import, CLI startup, daemon boot, etc.
It reads a locally-cached signed receipt and verifies it fully offline.

Enforcement never lives in postinstall alone; this function is what actually
unlocks the product.
"""
from __future__ import annotations

import os
import time
from datetime import datetime, timezone

from .receipt import find_receipt
from .verify import verify_receipt

CONTACT = "founders@vibecode-101.com\n  dev@interchained.org"
ACTIVE = {"approved", "trial", "enterprise"}
PENDING = {"pending_approval", "pending_email_verification"}
BLOCKED = {"revoked", "suspended", "denied", "expired"}


class LicenseError(Exception):
    """Raised by require_license when the license check fails."""

    def __init__(self, message: str, *, state: str = "invalid", product: str | None = None):
        super().__init__(message)
        self.name = "LicenseError"
        self.license_state = state
        self.code = "LICENSE_" + str(state or "invalid").upper()
        self.product = product


def _grace_ms() -> int:
    raw = os.environ.get("INTERCHAINED_LICENSE_GRACE_DAYS", "")
    try:
        days = float(raw)
        if days >= 0:
            return int(days * 86_400_000)
    except (ValueError, TypeError):
        pass
    return 14 * 86_400_000


def _now_ms() -> int:
    return int(time.time() * 1000)


def _parse_iso(s: str) -> int | None:
    """Parse ISO-8601 string to epoch milliseconds, or None on failure."""
    try:
        # Handle both 'Z' and '+00:00' variants
        dt = datetime.fromisoformat(s.replace("Z", "+00:00"))
        return int(dt.timestamp() * 1000)
    except Exception:
        return None


def require_license(product: str | None = None, package_name: str | None = None,
                    env: str | None = None, **kwargs) -> dict:
    """
    require_license(product, env=None) -> {"ok": True, "license": <receipt>, "path": <str>, ...}
    or raises LicenseError with .license_state and an actionable message.

    Also accepts keyword-argument form: require_license(product="x", env="production").
    """
    # Allow both positional and keyword-only call styles
    if product is None:
        product = kwargs.get("product")

    if not product:
        raise LicenseError(
            "require_license requires a `product` name.",
            state="misconfigured",
        )

    # Escape hatch for issuer infrastructure / CI bootstrap.
    if os.environ.get("INTERCHAINED_LICENSE_BYPASS") == "1":
        return {
            "ok": True,
            "license": {"product": product, "license_state": "bypass"},
            "path": None,
            "bypass": True,
        }

    found = find_receipt(product)
    if not found:
        raise LicenseError(
            f"{product} requires registration before use.\n\nRun:\n  nedb init\n\nStatus:\n  license_state=missing",
            state="missing",
            product=product,
        )

    r = found["receipt"]

    if not verify_receipt(r):
        raise LicenseError(
            f"{product}: license signature invalid (tampered, or not issued by Interchained).\n\nRun:\n  nedb init\n\nContact:\n  {CONTACT}",
            state="invalid_signature",
            product=product,
        )

    if product and r.get("product") and r["product"] != product:
        raise LicenseError(
            f"{product}: license receipt is for \"{r['product']}\", not \"{product}\".\n\nRun:\n  nedb init",
            state="product_mismatch",
            product=product,
        )

    state = r.get("license_state")

    if state in PENDING:
        raise LicenseError(
            f"Registration received.\n\nStatus:\n  {state}\n\nYour request is awaiting admin approval.",
            state=state,
            product=product,
        )

    if state in BLOCKED:
        raise LicenseError(
            f"License {state}.\n\nContact:\n  {CONTACT}",
            state=state,
            product=product,
        )

    if state not in ACTIVE:
        raise LicenseError(
            f"{product}: license not active (state={state}).\n\nRun:\n  nedb license",
            state=state,
            product=product,
        )

    # Expiry check
    expires_at = r.get("expires_at")
    if expires_at:
        exp_ms = _parse_iso(str(expires_at))
        if exp_ms is not None and exp_ms < _now_ms():
            raise LicenseError(
                f"License expired ({expires_at}).\n\nRun:\n  nedb license\n\nContact:\n  {CONTACT}",
                state="expired",
                product=product,
            )

    # Offline grace: stale check
    last_checked_at = r.get("last_checked_at")
    if last_checked_at:
        last_ms = _parse_iso(str(last_checked_at))
        if last_ms is not None and (_now_ms() - last_ms) > _grace_ms():
            r["__stale"] = True

    # Production gate
    feats = r.get("features") or {}
    is_prod = env in ("production", "prod")
    if is_prod and feats.get("production") is False:
        raise LicenseError(
            f"{product}: this license does not include PRODUCTION use.\n\nRun:\n  nedb license   (or request a commercial grant)\n\nContact:\n  {CONTACT}",
            state="production_not_licensed",
            product=product,
        )

    return {
        "ok": True,
        "license": r,
        "path": found["path"],
        "stale": bool(r.get("__stale")),
    }
