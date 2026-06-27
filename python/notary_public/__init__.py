"""
notary-public — offline Ed25519 license gate + SPDX license notary.

Public API (mirrors JS index.js):
  require_license(product, env=None)  → raises LicenseError or returns result dict
  verify_receipt(receipt)             → bool
  find_receipt(product)               → dict | None
  is_company_email(email)             → dict
  LicenseError                        — exception class

SPDX notary API (mirrors src/catalogue.js, place.js, notarize.js):
  list_licenses(osi_only, include_deprecated)
  get_text(spdx_id)
  place_license(spdx_id, dest, force)
  notarize(file_path, spdx_id, private_key_pem)
  verify_attestation(att)
"""

from .gate import require_license, LicenseError, ACTIVE, PENDING, BLOCKED
from .verify import verify_receipt, PUBLIC_KEY_PEM
from .receipt import find_receipt, write_user_receipt
from .email import is_company_email, email_domain, CONSUMER_DOMAINS
from .catalogue import list_licenses, get_text, meta, search, version
from .place import place_license
from .notarize import notarize, verify_attestation
from .canonical import canonicalize, canonical_bytes

__all__ = [
    # Gate
    "require_license", "LicenseError", "ACTIVE", "PENDING", "BLOCKED",
    # Verify
    "verify_receipt", "PUBLIC_KEY_PEM",
    # Receipt storage
    "find_receipt", "write_user_receipt",
    # Email gate
    "is_company_email", "email_domain", "CONSUMER_DOMAINS",
    # SPDX catalogue
    "list_licenses", "get_text", "meta", "search", "version",
    # Place + notarize
    "place_license", "notarize", "verify_attestation",
    # Canonicalization
    "canonicalize", "canonical_bytes",
]
