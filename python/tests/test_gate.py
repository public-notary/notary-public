"""
Python port of test/gate.test.js — sign→verify→gate roundtrip for all license states.
"""
import json
import os
import sys
import tempfile
from datetime import datetime, timezone, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

import pytest
from notary_public.sign import sign_receipt, load_issuer_key
from notary_public.verify import verify_receipt
from notary_public.gate import require_license, LicenseError
from notary_public.email import is_company_email

REPO_ROOT = Path(__file__).parent.parent.parent

try:
    KEY = load_issuer_key()
except FileNotFoundError:
    KEY = None


def needs_key(fn):
    """Skip tests that require the private key if it is absent."""
    return pytest.mark.skipif(KEY is None, reason="issuer private key not available")(fn)


def base_receipt(**overrides):
    r = {
        "product": "nedb-engine",
        "org": "Interchained LLC",
        "email": "dev@interchained.org",
        "domain": "interchained.org",
        "license_state": "approved",
        "license_type": "BUSL-commercial-grant",
        "install_id": "inst_test",
        "org_id": "org_test",
        "issued_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "expires_at": None,
        "features": {"engine": True, "studio": True, "redis_wrap": True, "production": True},
    }
    r.update(overrides)
    return r


def write_signed_receipt(tmp_dir, **overrides):
    """Sign a receipt and point INTERCHAINED_LICENSE_FILE at it."""
    r = sign_receipt(base_receipt(**overrides), KEY)
    p = Path(tmp_dir) / f"lic_{os.urandom(4).hex()}.json"
    p.write_text(json.dumps(r, indent=2), encoding="utf-8")
    os.environ["INTERCHAINED_LICENSE_FILE"] = str(p)
    return r, str(p)


@pytest.fixture(autouse=True)
def clean_env():
    """Remove the license env var after each test."""
    yield
    os.environ.pop("INTERCHAINED_LICENSE_FILE", None)
    os.environ.pop("INTERCHAINED_LICENSE_BYPASS", None)


@pytest.mark.skipif(KEY is None, reason="issuer private key not available")
def test_approved_unlocks_production():
    with tempfile.TemporaryDirectory() as tmp:
        write_signed_receipt(tmp)
        res = require_license(product="nedb-engine", env="production")
        assert res["ok"] is True
        assert res["license"]["license_state"] == "approved"


@pytest.mark.skipif(KEY is None, reason="issuer private key not available")
def test_tampered_receipt_rejected():
    with tempfile.TemporaryDirectory() as tmp:
        r, p = write_signed_receipt(tmp)
        r["org"] = "Evil Corp"
        Path(p).write_text(json.dumps(r, indent=2), encoding="utf-8")
        assert verify_receipt(r) is False
        with pytest.raises(LicenseError) as exc_info:
            require_license(product="nedb-engine")
        assert exc_info.value.license_state == "invalid_signature"


@pytest.mark.skipif(KEY is None, reason="issuer private key not available")
def test_pending_awaits_approval():
    with tempfile.TemporaryDirectory() as tmp:
        write_signed_receipt(tmp, license_state="pending_approval")
        with pytest.raises(LicenseError) as exc_info:
            require_license(product="nedb-engine")
        e = exc_info.value
        assert e.license_state == "pending_approval"
        assert "awaiting admin approval" in str(e)


@pytest.mark.skipif(KEY is None, reason="issuer private key not available")
def test_revoked_blocked():
    with tempfile.TemporaryDirectory() as tmp:
        write_signed_receipt(tmp, license_state="revoked")
        with pytest.raises(LicenseError) as exc_info:
            require_license(product="nedb-engine")
        assert exc_info.value.license_state == "revoked"


@pytest.mark.skipif(KEY is None, reason="issuer private key not available")
def test_expired_blocked():
    with tempfile.TemporaryDirectory() as tmp:
        write_signed_receipt(tmp, expires_at="2000-01-01T00:00:00Z")
        with pytest.raises(LicenseError) as exc_info:
            require_license(product="nedb-engine")
        assert exc_info.value.license_state == "expired"


@pytest.mark.skipif(KEY is None, reason="issuer private key not available")
def test_production_gate():
    with tempfile.TemporaryDirectory() as tmp:
        write_signed_receipt(tmp, features={"engine": True, "production": False})
        # dev env is fine
        res = require_license(product="nedb-engine", env="development")
        assert res["ok"] is True
        # production env blocked
        with pytest.raises(LicenseError) as exc_info:
            require_license(product="nedb-engine", env="production")
        assert exc_info.value.license_state == "production_not_licensed"


def test_missing_receipt():
    with tempfile.TemporaryDirectory() as tmp:
        os.environ["INTERCHAINED_LICENSE_FILE"] = str(Path(tmp) / "nope.json")
        with pytest.raises(LicenseError) as exc_info:
            require_license(product="nedb-engine")
        e = exc_info.value
        assert e.license_state == "missing"
        assert "license_state=missing" in str(e)


def test_bypass_env():
    os.environ["INTERCHAINED_LICENSE_BYPASS"] = "1"
    os.environ.pop("INTERCHAINED_LICENSE_FILE", None)
    res = require_license(product="nedb-engine")
    assert res["ok"] is True
    assert res.get("bypass") is True


def test_require_license_no_product():
    with pytest.raises(LicenseError) as exc_info:
        require_license(product=None)
    assert exc_info.value.license_state == "misconfigured"


class TestEmailGate:
    def test_company_email_ok(self):
        assert is_company_email("dev@interchained.org")["ok"] is True
        assert is_company_email("founders@vibecode-101.com")["ok"] is True

    def test_consumer_email_rejected(self):
        assert is_company_email("someone@gmail.com")["ok"] is False
        assert is_company_email("x@proton.me")["ok"] is False

    def test_invalid_email_rejected(self):
        assert is_company_email("notanemail")["ok"] is False

    def test_reason_fields(self):
        r = is_company_email("someone@gmail.com")
        assert r["reason"] == "consumer_domain"
        r2 = is_company_email("bad")
        assert r2["reason"] == "invalid_email"


class TestVerifyReceiptDirect:
    """Verify verify_receipt behavior without needing the private key."""

    def test_missing_signature_returns_false(self):
        assert verify_receipt({"product": "x"}) is False

    def test_none_returns_false(self):
        assert verify_receipt(None) is False  # type: ignore[arg-type]

    def test_wrong_signature_returns_false(self):
        assert verify_receipt({"product": "x", "signature": "bm90YXNpZw=="}) is False
