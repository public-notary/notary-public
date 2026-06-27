//! SPDX catalogue resolver. Licenses live in the `public-notary/notary-public`
//! repository; this crate does NOT bundle them. Resolution order:
//!   1. bundled `spdx/` dir (when running inside the repo)
//!   2. local cache (`~/.interchained/spdx/`)
//!   3. fetch from the repo over HTTPS (base = `NOTARY_SPDX_BASE`) + cache
use serde_json::Value;
use std::fs;
use std::path::PathBuf;

fn base_url() -> String {
    std::env::var("NOTARY_SPDX_BASE").unwrap_or_else(|_| {
        "https://raw.githubusercontent.com/public-notary/notary-public/main/spdx".to_string()
    })
}
fn cache_dir() -> Option<PathBuf> {
    dirs::home_dir().map(|h| h.join(".interchained").join("spdx"))
}
fn bundled_dir() -> Option<PathBuf> {
    let p = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("..").join("spdx");
    if p.join("text").is_dir() {
        Some(p)
    } else {
        None
    }
}

fn read_or_fetch(rel: &str) -> Option<String> {
    if let Some(b) = bundled_dir() {
        if let Ok(s) = fs::read_to_string(b.join(rel)) {
            return Some(s);
        }
    }
    if let Some(c) = cache_dir() {
        if let Ok(s) = fs::read_to_string(c.join(rel)) {
            return Some(s);
        }
    }
    let url = format!("{}/{}", base_url(), rel);
    let resp = ureq::get(&url).call().ok()?;
    let body = resp.into_string().ok()?;
    if let Some(c) = cache_dir() {
        let dest = c.join(rel);
        if let Some(parent) = dest.parent() {
            let _ = fs::create_dir_all(parent);
        }
        let _ = fs::write(&dest, &body);
    }
    Some(body)
}

/// Canonical SPDX license text for `spdx_id` (e.g. "MIT"), or None.
pub fn get_text(spdx_id: &str) -> Option<String> {
    read_or_fetch(&format!("text/{spdx_id}.txt"))
}

/// The SPDX license index (json/licenses.json), parsed.
pub fn index() -> Option<Value> {
    serde_json::from_str(&read_or_fetch("json/licenses.json")?).ok()
}

/// Display name for an SPDX id, from the index.
pub fn name(spdx_id: &str) -> Option<String> {
    let idx = index()?;
    let want = spdx_id.to_lowercase();
    for l in idx.get("licenses")?.as_array()? {
        if l.get("licenseId").and_then(|v| v.as_str()).map(|s| s.to_lowercase()) == Some(want.clone()) {
            return l.get("name").and_then(|v| v.as_str()).map(|s| s.to_string());
        }
    }
    None
}

/// Identify a license by its normalized-text hash. Available only when the
/// bundled corpus is present (full-corpus scan over the network is impractical);
/// otherwise pass an explicit SPDX id to `notarize`.
pub fn identify(norm_sha: &str) -> Option<String> {
    let text_dir = bundled_dir()?.join("text");
    for entry in fs::read_dir(&text_dir).ok()?.flatten() {
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) != Some("txt") {
            continue;
        }
        if let Ok(s) = fs::read_to_string(&path) {
            if crate::notarize::sha256_hex(crate::notarize::normalize(&s).as_bytes()) == norm_sha {
                return path.file_stem().map(|st| st.to_string_lossy().to_string());
            }
        }
    }
    None
}
