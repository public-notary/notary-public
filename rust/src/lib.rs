//! notary-public — Rust client SDK.
//!
//! Two halves, mirroring the JavaScript and Python ports byte-for-byte where it
//! matters (the signed-receipt format):
//!
//! 1. **License gate** — [`gate::require_license`] verifies a locally-cached,
//!    Ed25519-signed license receipt fully OFFLINE against the embedded issuer
//!    public key, then enforces state + a production-feature grant.
//! 2. **License notary** — [`catalogue`] resolves SPDX license text from the
//!    `public-notary/notary-public` repository (fetched + cached, never bundled),
//!    [`place::place_license`] drops a canonical license into a project, and
//!    [`notarize`] verifies issuer-signed license attestations.
//!
//! Cross-language contract: receipts/attestations are canonicalized as JSON with
//! recursively-sorted keys, the `signature` field excluded, compact separators,
//! UTF-8 — identical to the JS (`src/canonical.js`) and Python ports — then
//! Ed25519-signed. A receipt signed once verifies in all three runtimes.
//!
//! Signing is SERVER-SIDE ONLY (the license API, in JS/Python); this client
//! crate only ever verifies.

pub mod canonical;
pub mod verify;
pub mod gate;
pub mod email;
pub mod catalogue;
pub mod place;
pub mod notarize;

pub use email::is_company_email;
pub use gate::{require_license, LicenseError, LicenseOk};
pub use notarize::verify_attestation;
pub use verify::verify_receipt;
