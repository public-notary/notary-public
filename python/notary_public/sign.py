"""
SERVER-SIDE ONLY. Signs an approved license receipt with the issuer's Ed25519
PRIVATE key. This module is used by the license API when an admin approves a
request; the private key (.issuer-key.pem) is never published in the package.
"""
from __future__ import annotations

import base64
import os
from pathlib import Path

from cryptography.hazmat.primitives.serialization import load_pem_private_key

from .canonical import canonical_bytes

_DEFAULT_KEY_PATH = Path(__file__).parent.parent.parent / ".issuer-key.pem"


def sign_receipt(receipt: dict, private_key_pem: str | bytes) -> dict:
    """
    Returns a new receipt dict with `signature` (base64 Ed25519) set over the
    canonical bytes of every other field. Mutating any field after signing
    invalidates the signature.
    """
    if isinstance(private_key_pem, str):
        private_key_pem = private_key_pem.encode("utf-8")
    key = load_pem_private_key(private_key_pem, password=None)
    msg = canonical_bytes(receipt)
    sig = key.sign(msg)  # Ed25519 — no algorithm param needed
    return {**receipt, "signature": base64.b64encode(sig).decode("ascii")}


def load_issuer_key(key_path: str | None = None) -> str:
    """
    Convenience for the issuer/server: load the private key from disk.
    Checks key_path arg, then INTERCHAINED_ISSUER_KEY env, then
    <repo-root>/.issuer-key.pem next to the python/ package directory.
    """
    p = key_path or os.environ.get("INTERCHAINED_ISSUER_KEY") or str(_DEFAULT_KEY_PATH)
    return Path(p).read_text("utf-8")
