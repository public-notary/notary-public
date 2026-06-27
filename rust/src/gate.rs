//! The runtime license gate — mirrors the JS `requireLicense`. Reads a locally
//! cached signed receipt, verifies it offline, enforces state + production grant.
use crate::verify::verify_receipt;
use serde_json::Value;
use std::fmt;
use std::fs;
use std::path::PathBuf;

const CONTACT: &str = "founders@vibecode-101.com\n  dev@interchained.org";

#[derive(Debug, Clone)]
pub struct LicenseError {
    pub license_state: String,
    pub message: String,
}
impl fmt::Display for LicenseError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", self.message)
    }
}
impl std::error::Error for LicenseError {}

#[derive(Debug, Clone)]
pub struct LicenseOk {
    pub license: Value,
    pub path: Option<PathBuf>,
}

fn err(state: &str, message: String) -> LicenseError {
    LicenseError { license_state: state.to_string(), message }
}

fn candidate_paths(product: &str) -> Vec<PathBuf> {
    let mut v = Vec::new();
    if let Ok(p) = std::env::var("INTERCHAINED_LICENSE_FILE") {
        if !p.is_empty() {
            v.push(PathBuf::from(p));
        }
    }
    if let Ok(cwd) = std::env::current_dir() {
        v.push(cwd.join(".nedb").join("license.json"));
    }
    if let Some(h) = dirs::home_dir() {
        v.push(h.join(".interchained").join("licenses").join(format!("{product}.json")));
    }
    v
}

fn find_receipt(product: &str) -> Option<(Value, PathBuf)> {
    for p in candidate_paths(product) {
        if let Ok(txt) = fs::read_to_string(&p) {
            if let Ok(val) = serde_json::from_str::<Value>(&txt) {
                let ok_product = val
                    .get("product")
                    .and_then(|v| v.as_str())
                    .map(|s| s == product)
                    .unwrap_or(true);
                if ok_product {
                    return Some((val, p));
                }
            }
        }
    }
    None
}

/// Returns Some(true) if the ISO-8601 UTC timestamp is strictly in the past.
/// Dependency-free (Howard Hinnant's days_from_civil). Expects `YYYY-MM-DDTHH:MM:SS…Z`.
fn iso_in_past(s: &str) -> Option<bool> {
    let b = s.as_bytes();
    if s.len() < 19 || b[4] != b'-' || b[7] != b'-' || b[10] != b'T' || b[13] != b':' || b[16] != b':' {
        return None;
    }
    let n = |a: &str| a.parse::<i64>().ok();
    let (y, mo, d) = (n(&s[0..4])?, n(&s[5..7])?, n(&s[8..10])?);
    let (h, mi, se) = (n(&s[11..13])?, n(&s[14..16])?, n(&s[17..19])?);
    let yy = if mo <= 2 { y - 1 } else { y };
    let era = (if yy >= 0 { yy } else { yy - 399 }) / 400;
    let yoe = yy - era * 400;
    let doy = (153 * (if mo > 2 { mo - 3 } else { mo + 9 }) + 2) / 5 + d - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    let days = era * 146097 + doe - 719468;
    let ts = days * 86400 + h * 3600 + mi * 60 + se;
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .ok()?
        .as_secs() as i64;
    Some(ts < now)
}

/// Verify and enforce the license for `product`. `env` is the deployment env
/// (e.g. "production"). Returns the verified license or a LicenseError.
pub fn require_license(product: &str, env: Option<&str>) -> Result<LicenseOk, LicenseError> {
    if std::env::var("INTERCHAINED_LICENSE_BYPASS").as_deref() == Ok("1") {
        return Ok(LicenseOk {
            license: serde_json::json!({"product": product, "license_state": "bypass"}),
            path: None,
        });
    }
    let (receipt, path) = match find_receipt(product) {
        Some(x) => x,
        None => {
            return Err(err(
                "missing",
                format!("{product} requires registration before use.\n\nRun:\n  nedb init\n\nStatus:\n  license_state=missing"),
            ))
        }
    };
    if !verify_receipt(&receipt) {
        return Err(err(
            "invalid_signature",
            format!("{product}: license signature invalid (tampered, or not issued by Interchained).\n\nRun:\n  nedb init\n\nContact:\n  {CONTACT}"),
        ));
    }
    let state = receipt.get("license_state").and_then(|v| v.as_str()).unwrap_or("");
    match state {
        "pending_approval" | "pending_email_verification" => {
            return Err(err(state, format!("Registration received.\n\nStatus:\n  {state}\n\nYour request is awaiting admin approval.")))
        }
        "revoked" | "suspended" | "denied" | "expired" => {
            return Err(err(state, format!("License {state}.\n\nContact:\n  {CONTACT}")))
        }
        "approved" | "trial" | "enterprise" => {}
        other => return Err(err("inactive", format!("{product}: license not active (state={other}).\n\nRun:\n  nedb license"))),
    }
    if let Some(exp) = receipt.get("expires_at").and_then(|v| v.as_str()) {
        if iso_in_past(exp) == Some(true) {
            return Err(err("expired", format!("License expired ({exp}).\n\nContact:\n  {CONTACT}")));
        }
    }
    let is_prod = matches!(env, Some("production") | Some("prod"));
    let prod_feature = receipt.get("features").and_then(|f| f.get("production")).and_then(|v| v.as_bool());
    if is_prod && prod_feature == Some(false) {
        return Err(err(
            "production_not_licensed",
            format!("{product}: this license does not include PRODUCTION use.\n\nRun:\n  nedb license   (or request a commercial grant)\n\nContact:\n  {CONTACT}"),
        ));
    }
    Ok(LicenseOk { license: receipt, path: Some(path) })
}
