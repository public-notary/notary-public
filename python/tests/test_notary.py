"""
Python port of test/notary.test.js — SPDX catalogue + place + notarize roundtrip.
"""
import json
import os
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

import pytest
from notary_public.catalogue import list_licenses, get_text, meta, search, version
from notary_public.place import place_license
from notary_public.notarize import notarize, verify_attestation

try:
    from notary_public.sign import load_issuer_key
    KEY = load_issuer_key()
except FileNotFoundError:
    KEY = None


class TestCatalogue:
    def test_lists_full_corpus(self):
        all_licenses = list_licenses(include_deprecated=True)
        assert len(all_licenses) > 600, f"expected >600 licenses, got {len(all_licenses)}"
        osi = list_licenses(osi_only=True)
        assert len(osi) > 100
        assert len(osi) < len(all_licenses)

    def test_known_licenses_resolve(self):
        for spdx_id in ("MIT", "Apache-2.0", "GPL-3.0-only", "BUSL-1.1"):
            m = meta(spdx_id)
            assert m is not None, f"meta missing for {spdx_id}"
            t = get_text(spdx_id)
            assert t is not None and len(t) > 100, f"text missing for {spdx_id}"
        assert "permission is hereby granted" in get_text("MIT").lower()

    def test_case_insensitive_lookup(self):
        m = meta("mit")
        assert m is not None
        assert m["licenseId"] == "MIT"

    def test_search(self):
        results = search("apache")
        assert any(l["id"] == "Apache-2.0" for l in results)

    def test_version_returns_string(self):
        v = version()
        assert v is not None and len(v) > 0


class TestPlaceLicense:
    def test_place_mit(self):
        with tempfile.TemporaryDirectory() as tmp:
            dest = Path(tmp) / "proj" / "LICENSE"
            result = place_license("MIT", dest)
            assert dest.exists()
            assert result["id"] == "MIT"
            assert dest.read_text("utf-8") == get_text("MIT")

    def test_refuses_to_clobber_without_force(self):
        with tempfile.TemporaryDirectory() as tmp:
            dest = Path(tmp) / "LICENSE"
            place_license("MIT", dest)
            with pytest.raises(FileExistsError):
                place_license("MIT", dest)
            # force=True should work
            r = place_license("Apache-2.0", dest, force=True)
            assert r["id"] == "Apache-2.0"

    def test_unknown_id_raises(self):
        with pytest.raises((ValueError, Exception)):
            place_license("NOPE-9000", "/tmp/nope_license_test")

    def test_sha256_correct(self):
        import hashlib
        with tempfile.TemporaryDirectory() as tmp:
            dest = Path(tmp) / "LICENSE"
            result = place_license("MIT", dest)
            text_bytes = get_text("MIT").encode("utf-8")
            expected_sha = hashlib.sha256(text_bytes).hexdigest()
            assert result["sha256"] == expected_sha


class TestNotarize:
    def _mit_file(self, tmp: str) -> Path:
        dest = Path(tmp) / "LICENSE"
        place_license("MIT", dest)
        return dest

    def test_notarize_identifies_exact_mit(self):
        with tempfile.TemporaryDirectory() as tmp:
            dest = self._mit_file(tmp)
            att = notarize(dest)
            assert att["spdx_id"] == "MIT"
            assert att["match"] == "exact"
            assert att["file_sha256"] == att["canonical_sha256"]

    def test_notarize_detects_modified_license(self):
        with tempfile.TemporaryDirectory() as tmp:
            f = Path(tmp) / "MODIFIED-LICENSE"
            f.write_text(get_text("MIT") + "\n\n// sneaky extra clause\n", encoding="utf-8")
            att = notarize(f, spdx_id="MIT")
            assert att["match"] != "exact"

    @pytest.mark.skipif(KEY is None, reason="issuer private key not available")
    def test_signed_stamp_verifies(self):
        with tempfile.TemporaryDirectory() as tmp:
            dest = self._mit_file(tmp)
            att = notarize(dest, private_key_pem=KEY)
            assert att.get("signature"), "expected a signature"
            assert verify_attestation(att) is True

    @pytest.mark.skipif(KEY is None, reason="issuer private key not available")
    def test_tampered_stamp_fails(self):
        with tempfile.TemporaryDirectory() as tmp:
            dest = self._mit_file(tmp)
            att = notarize(dest, private_key_pem=KEY)
            tampered = {**att, "spdx_id": "Apache-2.0"}
            assert verify_attestation(tampered) is False

    def test_attestation_fields_present(self):
        with tempfile.TemporaryDirectory() as tmp:
            dest = self._mit_file(tmp)
            att = notarize(dest)
            for field in ("kind", "file", "file_sha256", "spdx_id", "match",
                          "notarized_at", "notary", "spdx_list_version"):
                assert field in att, f"missing field: {field}"
            assert att["kind"] == "license-notarization"
