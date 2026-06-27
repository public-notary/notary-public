"""
License notarization. Identify which SPDX license a file is, and attest the
match — an offline, optionally issuer-signed "notary stamp". The attestation
reuses the same Ed25519 receipt machinery as the deployment gate, so it
verifies offline against the embedded public key.
"""
from __future__ import annotations

import hashlib
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from .catalogue import get_text, meta, list as list_licenses, version
from .verify import verify_receipt


def sha256(data: bytes | str) -> str:
    if isinstance(data, str):
        data = data.encode("utf-8")
    return hashlib.sha256(data).hexdigest()


def normalize(s: str) -> str:
    """Whitespace-insensitive, case-insensitive normalization."""
    s = s.replace("\r\n", "\n")
    s = re.sub(r"\s+", " ", s)
    return s.strip().lower()


_norm_index: Optional[dict] = None


def _get_norm_index() -> dict:
    global _norm_index
    if _norm_index is not None:
        return _norm_index
    idx: dict[str, str] = {}
    for l in list_licenses(include_deprecated=True):
        t = get_text(l["id"])
        if t is not None:
            idx[sha256(normalize(t))] = l["id"]
    _norm_index = idx
    return _norm_index


def notarize(file_path: str | Path, spdx_id: str | None = None,
             private_key_pem: str | None = None) -> dict:
    """
    notarize(file_path, spdx_id=None, private_key_pem=None) -> attestation dict
    (signed if a private key is supplied). match in {"exact", "normalized", "none"}.
    """
    content = Path(file_path).read_bytes()
    file_sha = sha256(content)
    file_norm = sha256(normalize(content.decode("utf-8")))

    # Resolve SPDX id: explicit hint or auto-detect from normalized hash
    if spdx_id:
        m = meta(spdx_id)
        resolved_id = m["licenseId"] if m else spdx_id
    else:
        resolved_id = _get_norm_index().get(file_norm)

    match = "none"
    canonical_sha: Optional[str] = None
    name: Optional[str] = None
    osi: Optional[bool] = None

    if resolved_id:
        canon = get_text(resolved_id)
        m2 = meta(resolved_id)
        name = m2["name"] if m2 else None
        osi = bool(m2.get("isOsiApproved")) if m2 else None
        if canon is not None:
            canonical_sha = sha256(canon.encode("utf-8"))
            canon_norm = sha256(normalize(canon))
            if canonical_sha == file_sha:
                match = "exact"
            elif canon_norm == file_norm:
                match = "normalized"
            else:
                match = "none"

    att = {
        "kind": "license-notarization",
        "file": str(file_path),
        "file_sha256": file_sha,
        "file_normalized_sha256": file_norm,
        "spdx_id": resolved_id,
        "license_name": name,
        "osi_approved": osi,
        "match": match,
        "canonical_sha256": canonical_sha,
        "spdx_list_version": version(),
        "notary": "public-notary (Interchained LLC)",
        "notarized_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
    }

    if private_key_pem:
        from .sign import sign_receipt
        return sign_receipt(att, private_key_pem)
    return att


def verify_attestation(att: dict) -> bool:
    """Verify a signed notarization stamp offline against the embedded public key."""
    return verify_receipt(att)
