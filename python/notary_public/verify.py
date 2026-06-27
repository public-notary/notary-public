"""
Offline receipt verification. The issuer's Ed25519 PUBLIC key is shipped in
the package (issuer-public-key.pem) and embedded here; the runtime verifies a
locally-cached signed receipt against it with NO contact to any license
server. The private key never ships.
"""
import base64
from pathlib import Path

from cryptography.hazmat.primitives.serialization import load_pem_public_key
from cryptography.exceptions import InvalidSignature

from .canonical import canonical_bytes

_PUBLIC_KEY_PEM_PATH = Path(__file__).parent / "issuer-public-key.pem"

with open(_PUBLIC_KEY_PEM_PATH, "rb") as _fh:
    PUBLIC_KEY_PEM = _fh.read().decode("utf-8")

_PUBLIC_KEY = load_pem_public_key(_PUBLIC_KEY_PEM_PATH.read_bytes())


def verify_receipt(receipt) -> bool:
    """
    Verify a receipt's Ed25519 signature over its canonical bytes.
    Returns True only if the signature was produced by the issuer key.
    """
    if not receipt or not isinstance(receipt, dict):
        return False
    sig_b64 = receipt.get("signature")
    if not isinstance(sig_b64, str):
        return False
    try:
        sig = base64.b64decode(sig_b64)
        msg = canonical_bytes(receipt)
        _PUBLIC_KEY.verify(sig, msg)
        return True
    except (InvalidSignature, Exception):
        return False
