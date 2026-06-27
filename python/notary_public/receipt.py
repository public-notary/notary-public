"""
Local signed-license-receipt storage. Two locations, searched in order:
  1. $INTERCHAINED_LICENSE_FILE  (explicit override)
  2. <cwd>/.nedb/license.json     (project-local)
  3. ~/.interchained/licenses/<product>.json  (user/global)
"""
from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Optional


def user_receipt_path(product: str) -> Path:
    return Path.home() / ".interchained" / "licenses" / f"{product}.json"


def project_receipt_path(cwd: Optional[str] = None) -> Path:
    base = Path(cwd) if cwd else Path.cwd()
    return base / ".nedb" / "license.json"


def find_receipt(product: str, opts: dict | None = None) -> Optional[dict]:
    """
    Search receipt locations in priority order.
    Returns {"receipt": <dict>, "path": <str>} or None.
    """
    opts = opts or {}
    candidates = []
    env_path = os.environ.get("INTERCHAINED_LICENSE_FILE")
    if env_path:
        candidates.append(env_path)
    candidates.append(str(project_receipt_path(opts.get("cwd"))))
    candidates.append(str(user_receipt_path(product)))

    for p in candidates:
        if not p:
            continue
        path = Path(p)
        try:
            if path.exists():
                r = json.loads(path.read_text("utf-8"))
                if not product or r.get("product") == product:
                    return {"receipt": r, "path": str(path)}
        except Exception:
            pass  # malformed receipt — keep searching
    return None


def write_user_receipt(product: str, receipt: dict) -> str:
    p = user_receipt_path(product)
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(receipt, indent=2), encoding="utf-8")
    return str(p)
