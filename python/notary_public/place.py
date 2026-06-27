"""
Place a vendored SPDX license into a project. Copies the canonical SPDX text
VERBATIM (downloaded/vendored, never authored here) to a destination file
(default ./LICENSE).
"""
from __future__ import annotations

import hashlib
from pathlib import Path

from .catalogue import meta, get_text


def place_license(spdx_id: str, dest_path: str | Path | None = None,
                  force: bool = False) -> dict:
    """
    Copy the canonical SPDX license text for `spdx_id` to `dest_path`
    (default: ./LICENSE). Raises if dest already exists unless force=True.

    Returns {"id", "name", "dest", "bytes", "sha256"}.
    """
    m = meta(spdx_id)
    if not m:
        raise ValueError(f"Unknown SPDX license id: {spdx_id}")
    text = get_text(m["licenseId"])
    if text is None:
        raise ValueError(f"No vendored text for {m['licenseId']}")

    dest = Path(dest_path) if dest_path else Path.cwd() / "LICENSE"
    if dest.exists() and not force:
        raise FileExistsError(
            f"{dest} already exists — pass force=True to overwrite"
        )
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_text(text, encoding="utf-8")

    text_bytes = text.encode("utf-8")
    return {
        "id": m["licenseId"],
        "name": m["name"],
        "dest": str(dest),
        "bytes": len(text_bytes),
        "sha256": hashlib.sha256(text_bytes).hexdigest(),
    }
