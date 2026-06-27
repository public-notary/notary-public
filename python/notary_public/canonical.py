"""
Deterministic JSON canonicalization for signing/verifying license receipts.

Recursively sorts object keys (arrays keep their order) and ALWAYS excludes
the `signature` field, so a receipt hashes to the same bytes before and after
it is signed. Both the issuer (sign) and the runtime (verify) canonicalize
identically, so verification is exact and offline.

Cross-language contract: output must be byte-identical to the JS implementation
and the future Rust implementation.
"""
import json


def _strip_signature(value):
    """Recursively remove the 'signature' key at every level of a dict/list."""
    if isinstance(value, dict):
        return {k: _strip_signature(v) for k, v in value.items() if k != "signature"}
    if isinstance(value, list):
        return [_strip_signature(v) for v in value]
    return value


def canonicalize(value) -> str:
    """
    Return compact, deterministic JSON of *value* with:
    - all object keys sorted recursively
    - 'signature' excluded at every nesting level
    - compact separators (no spaces)
    - non-ASCII characters NOT escaped (ensure_ascii=False)
    """
    cleaned = _strip_signature(value)
    return json.dumps(cleaned, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def canonical_bytes(value) -> bytes:
    """Return UTF-8 encoded canonical JSON bytes."""
    return canonicalize(value).encode("utf-8")
