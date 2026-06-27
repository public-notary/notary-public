//! Cross-language compatibility: the Rust crate must reproduce the exact
//! canonical bytes and verify the SAME issuer-signed receipt that the JS and
//! Python ports produce/verify.
use notary_public::canonical::canonicalize;
use notary_public::verify::verify_receipt;
use serde_json::Value;
use std::fs;
use std::path::PathBuf;

fn fixtures() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("tests").join("fixtures")
}
fn load_signed() -> Value {
    let txt = fs::read_to_string(fixtures().join("receipt.signed.json")).unwrap();
    serde_json::from_str(&txt).unwrap()
}

#[test]
fn canonical_bytes_match_reference() {
    let signed = load_signed();
    let expected = fs::read_to_string(fixtures().join("canonical.expected.txt")).unwrap();
    // canonicalize() excludes `signature`, so signed canonicalizes to the reference.
    assert_eq!(canonicalize(&signed), expected.trim_end_matches('\n'));
}

#[test]
fn verifies_js_signed_fixture() {
    assert!(verify_receipt(&load_signed()), "JS-signed receipt must verify in Rust");
}

#[test]
fn rejects_tampered_receipt() {
    let mut signed = load_signed();
    signed["org"] = Value::String("Evil Corp".to_string());
    assert!(!verify_receipt(&signed));
}

#[test]
fn rejects_missing_signature() {
    let mut signed = load_signed();
    signed.as_object_mut().unwrap().remove("signature");
    assert!(!verify_receipt(&signed));
}
