//! Offline Ed25519 verification against the embedded issuer public key. The
//! private key never ships; this crate only verifies.
use crate::canonical::canonicalize;
use base64::Engine as _;
use ed25519_dalek::{Signature, Verifier, VerifyingKey};
use serde_json::Value;

/// Raw 32-byte Ed25519 issuer public key (matches src/issuer-public-key.pem,
/// the same key the JS and Python ports embed).
const ISSUER_PUBKEY: [u8; 32] = [
    243, 80, 150, 24, 28, 174, 96, 42, 196, 78, 86, 145, 47, 236, 211, 11, 136, 82, 197, 227, 146,
    201, 209, 137, 222, 249, 231, 36, 66, 111, 20, 49,
];

/// Verify a receipt/attestation's `signature` (base64 Ed25519) over its
/// canonical bytes. Returns true only if produced by the issuer key.
pub fn verify_receipt(receipt: &Value) -> bool {
    let sig_b64 = match receipt.get("signature").and_then(|v| v.as_str()) {
        Some(s) => s,
        None => return false,
    };
    let sig_vec = match base64::engine::general_purpose::STANDARD.decode(sig_b64) {
        Ok(v) => v,
        Err(_) => return false,
    };
    let sig_arr: [u8; 64] = match <[u8; 64]>::try_from(sig_vec.as_slice()) {
        Ok(a) => a,
        Err(_) => return false,
    };
    let vk = match VerifyingKey::from_bytes(&ISSUER_PUBKEY) {
        Ok(k) => k,
        Err(_) => return false,
    };
    let sig = Signature::from_bytes(&sig_arr);
    vk.verify(canonicalize(receipt).as_bytes(), &sig).is_ok()
}
