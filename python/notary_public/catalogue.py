"""
SPDX license catalogue. Reads the SPDX License List corpus from:
  1. Local bundled spdx/ dir (present in the repo itself), or
  2. A local cache dir (~/.interchained/spdx/), or
  3. HTTPS fetch from the repo (base URL configurable via NOTARY_SPDX_BASE env)
     and cache locally.

The Python package does NOT bundle the 30M SPDX corpus.
"""
from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Optional

# ---------------------------------------------------------------------------
# Corpus location resolution
# ---------------------------------------------------------------------------

_REPO_SPDX_DIR = Path(__file__).parent.parent.parent / "spdx"
_CACHE_SPDX_DIR = Path.home() / ".interchained" / "spdx"
_DEFAULT_BASE_URL = "https://raw.githubusercontent.com/public-notary/notary-public/main/spdx"


def _spdx_base_url() -> str:
    return os.environ.get("NOTARY_SPDX_BASE", _DEFAULT_BASE_URL).rstrip("/")


def _resolve_spdx_dirs() -> tuple[Path, Path, Path]:
    """Return (spdx_dir, text_dir, json_dir) for the best available location."""
    # 1. Repo bundled copy
    candidate = _REPO_SPDX_DIR
    if (candidate / "json" / "licenses.json").exists():
        return candidate, candidate / "text", candidate / "json"
    # 2. Local cache
    candidate = _CACHE_SPDX_DIR
    if (candidate / "json" / "licenses.json").exists():
        return candidate, candidate / "text", candidate / "json"
    # Neither present — callers will trigger fetch
    return _CACHE_SPDX_DIR, _CACHE_SPDX_DIR / "text", _CACHE_SPDX_DIR / "json"


def _fetch_and_cache(rel_path: str) -> bytes:
    """Fetch a file from the SPDX base URL and cache it locally."""
    import urllib.request
    url = f"{_spdx_base_url()}/{rel_path}"
    cache_path = _CACHE_SPDX_DIR / rel_path
    cache_path.parent.mkdir(parents=True, exist_ok=True)
    with urllib.request.urlopen(url, timeout=30) as resp:
        data = resp.read()
    cache_path.write_bytes(data)
    return data


def _read_or_fetch(rel_path: str) -> bytes:
    """Read from local corpus first; fall back to HTTPS fetch+cache."""
    spdx_dir, _, _ = _resolve_spdx_dirs()
    local = spdx_dir / rel_path
    if local.exists():
        return local.read_bytes()
    # Cache might have it after a previous fetch
    cache = _CACHE_SPDX_DIR / rel_path
    if cache.exists():
        return cache.read_bytes()
    return _fetch_and_cache(rel_path)


# ---------------------------------------------------------------------------
# In-memory index
# ---------------------------------------------------------------------------

_index: Optional[dict] = None


def _get_index() -> dict:
    global _index
    if _index is None:
        data = _read_or_fetch("json/licenses.json")
        _index = json.loads(data.decode("utf-8"))
    return _index


def list_licenses(osi_only: bool = False, include_deprecated: bool = False) -> list[dict]:
    """Return list of {id, name, osi, deprecated} dicts."""
    licenses = _get_index()["licenses"]
    if not include_deprecated:
        licenses = [l for l in licenses if not l.get("isDeprecatedLicenseId")]
    if osi_only:
        licenses = [l for l in licenses if l.get("isOsiApproved")]
    return [
        {
            "id": l["licenseId"],
            "name": l["name"],
            "osi": bool(l.get("isOsiApproved")),
            "deprecated": bool(l.get("isDeprecatedLicenseId")),
        }
        for l in licenses
    ]


# Keep JS-compatible alias
def list(osi_only: bool = False, include_deprecated: bool = False) -> list[dict]:  # noqa: A001
    return list_licenses(osi_only=osi_only, include_deprecated=include_deprecated)


def meta(spdx_id: str) -> Optional[dict]:
    """Return raw SPDX index entry for the given id (case-insensitive), or None."""
    want = str(spdx_id or "").lower()
    for l in _get_index()["licenses"]:
        if l["licenseId"].lower() == want:
            return l
    return None


def text_path(spdx_id: str) -> Optional[Path]:
    m = meta(spdx_id)
    resolved_id = m["licenseId"] if m else spdx_id
    spdx_dir, text_dir, _ = _resolve_spdx_dirs()
    p = text_dir / f"{resolved_id}.txt"
    if p.exists():
        return p
    # Try cache dir
    cp = _CACHE_SPDX_DIR / "text" / f"{resolved_id}.txt"
    if cp.exists():
        return cp
    return None


def get_text(spdx_id: str) -> Optional[str]:
    """Return full license text for the given SPDX id, or None."""
    m = meta(spdx_id)
    resolved_id = m["licenseId"] if m else spdx_id
    p = text_path(resolved_id)
    if p:
        return p.read_text("utf-8")
    # Fall back to HTTPS fetch
    try:
        data = _read_or_fetch(f"text/{resolved_id}.txt")
        return data.decode("utf-8")
    except Exception:
        return None


def search(q: str) -> list[dict]:
    s = str(q or "").lower()
    return [
        l for l in list(include_deprecated=True)
        if s in l["id"].lower() or s in l["name"].lower()
    ]


def version() -> Optional[str]:
    try:
        data = _read_or_fetch("PROVENANCE.json")
        return json.loads(data.decode("utf-8")).get("licenseListVersion")
    except Exception:
        return None


SPDX_DIR = _REPO_SPDX_DIR
TEXT_DIR = _REPO_SPDX_DIR / "text"
JSON_DIR = _REPO_SPDX_DIR / "json"
