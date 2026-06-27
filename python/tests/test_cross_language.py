"""
Cross-language fixture tests — THE most critical tests.

1. Load test/fixtures/receipt.signed.json and verify it with Python verifier → True.
2. Assert canonicalize(receipt_minus_signature) byte-equals canonical.expected.txt.

If either fails, canonicalization is wrong.
"""
import json
import sys
from pathlib import Path

# Make sure we can import from source checkout without installation
sys.path.insert(0, str(Path(__file__).parent.parent))

import pytest
from notary_public.canonical import canonicalize
from notary_public.verify import verify_receipt

FIXTURES = Path(__file__).parent.parent.parent / "test" / "fixtures"


def load_fixture(name: str) -> Path:
    p = FIXTURES / name
    assert p.exists(), f"Fixture not found: {p}"
    return p


def test_verify_fixture_receipt():
    """The pre-signed JS fixture receipt must verify True in Python."""
    receipt = json.loads(load_fixture("receipt.signed.json").read_text("utf-8"))
    result = verify_receipt(receipt)
    assert result is True, (
        f"verify_receipt returned {result!r} — canonicalization or key mismatch"
    )


def test_canonical_bytes_match_fixture():
    """
    Canonicalizing the fixture receipt (without signature) must produce
    byte-identical output to canonical.expected.txt.
    """
    receipt = json.loads(load_fixture("receipt.signed.json").read_text("utf-8"))
    expected = load_fixture("canonical.expected.txt").read_bytes()

    # canonicalize() already drops 'signature' recursively
    actual = canonicalize(receipt).encode("utf-8")

    # Strip a potential trailing newline from the .txt file (text editors add one)
    expected_stripped = expected.rstrip(b"\n")

    assert actual == expected_stripped, (
        f"\nExpected: {expected_stripped!r}\n"
        f"Got:      {actual!r}\n"
        "Canonical bytes do not match — check sort order, separators, or ensure_ascii."
    )


def test_signature_field_excluded_from_canonical():
    """Signature field must be stripped before hashing."""
    obj = {"b": 2, "a": 1, "signature": "SHOULDBEEXCLUDED"}
    canon = canonicalize(obj)
    assert "signature" not in canon
    assert canon == '{"a":1,"b":2}'


def test_nested_signature_excluded():
    """Signature field must be stripped recursively (nested objects)."""
    obj = {
        "data": {"x": 1, "signature": "inner_sig"},
        "signature": "outer_sig",
        "z": True,
    }
    canon = canonicalize(obj)
    assert "signature" not in canon
    assert canon == '{"data":{"x":1},"z":true}'


def test_array_order_preserved():
    """Arrays must keep their insertion order (not be sorted)."""
    obj = {"arr": [3, 1, 2], "signature": "x"}
    canon = canonicalize(obj)
    assert canon == '{"arr":[3,1,2]}'


def test_null_value_preserved():
    """null values must be preserved as JSON null."""
    obj = {"expires_at": None, "a": "b"}
    canon = canonicalize(obj)
    assert canon == '{"a":"b","expires_at":null}'


def test_non_ascii_not_escaped():
    """Non-ASCII characters must not be unicode-escaped (ensure_ascii=False)."""
    obj = {"name": "Ünïcödé", "signature": "x"}
    canon = canonicalize(obj)
    assert "\\u" not in canon
    assert "Ünïcödé" in canon
