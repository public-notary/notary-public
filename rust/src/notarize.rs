//! License notarization — identify a file's SPDX license and verify signed
//! attestations offline. Signing the "notary stamp" is server-side (JS/Python);
//! this crate identifies and verifies.
use crate::verify::verify_receipt;
use serde_json::Value;
use sha2::{Digest, Sha256};

pub fn sha256_hex(bytes: &[u8]) -> String {
    let mut h = Sha256::new();
    h.update(bytes);
    hex::encode(h.finalize())
}

/// Whitespace-insensitive, lowercased normalization (matches the JS port).
pub fn normalize(s: &str) -> String {
    s.replace("\r\n", "\n")
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
        .to_lowercase()
}

/// Verify a server-signed notarization attestation offline against the issuer key.
pub fn verify_attestation(att: &Value) -> bool {
    verify_receipt(att)
}

/// Identify which SPDX license `path` is and report the match. The returned
/// attestation is UNSIGNED — the signed stamp is issued by the license server.
/// `match` ∈ "exact" | "normalized" | "none".
pub fn notarize(path: &str, spdx_id: Option<&str>) -> std::io::Result<Value> {
    let content = std::fs::read(path)?;
    let file_sha = sha256_hex(&content);
    let text = String::from_utf8_lossy(&content);
    let file_norm = sha256_hex(normalize(&text).as_bytes());

    let id: Option<String> = match spdx_id {
        Some(s) => Some(s.to_string()),
        None => crate::catalogue::identify(&file_norm),
    };
    let mut matched = "none".to_string();
    let mut canonical_sha = Value::Null;
    let mut name = Value::Null;
    if let Some(ref id) = id {
        if let Some(canon) = crate::catalogue::get_text(id) {
            let csha = sha256_hex(canon.as_bytes());
            let cnorm = sha256_hex(normalize(&canon).as_bytes());
            matched = if csha == file_sha {
                "exact".to_string()
            } else if cnorm == file_norm {
                "normalized".to_string()
            } else {
                "none".to_string()
            };
            canonical_sha = Value::String(csha);
        }
        if let Some(nm) = crate::catalogue::name(id) {
            name = Value::String(nm);
        }
    }
    Ok(serde_json::json!({
        "kind": "license-notarization",
        "file": path,
        "file_sha256": file_sha,
        "file_normalized_sha256": file_norm,
        "spdx_id": id,
        "license_name": name,
        "match": matched,
        "canonical_sha256": canonical_sha,
        "notary": "public-notary (Interchained LLC)"
    }))
}
