//! `notary` — the notary-public CLI (Rust).
use std::path::PathBuf;

fn main() {
    let args: Vec<String> = std::env::args().collect();
    let cmd = args.get(1).map(|s| s.as_str()).unwrap_or("help");
    match cmd {
        "show" | "license" => {
            let id = match args.get(2) {
                Some(s) => s,
                None => fail("usage: notary show <SPDX-ID>"),
            };
            match notary_public::catalogue::get_text(id) {
                Some(t) => print!("{t}"),
                None => fail(&format!("not found / unavailable: {id}")),
            }
        }
        "place" => {
            let id = args.get(2).cloned().unwrap_or_default();
            let dest = args.get(3).filter(|s| !s.starts_with("--")).cloned().unwrap_or_else(|| "LICENSE".to_string());
            let force = args.iter().any(|a| a == "--force");
            match notary_public::place::place_license(&id, &PathBuf::from(&dest), force) {
                Ok(sha) => println!("placed {id} -> {dest}\n  sha256={sha}"),
                Err(e) => fail(&e),
            }
        }
        "notarize" => {
            let file = match args.get(2) {
                Some(s) => s,
                None => fail("usage: notary notarize <file> [--id SPDX-ID]"),
            };
            let id = args.iter().position(|a| a == "--id").and_then(|i| args.get(i + 1)).map(|s| s.as_str());
            match notary_public::notarize::notarize(file, id) {
                Ok(att) => println!("{}", serde_json::to_string_pretty(&att).unwrap()),
                Err(e) => fail(&e.to_string()),
            }
        }
        "verify" => {
            let file = match args.get(2) {
                Some(s) => s,
                None => fail("usage: notary verify <attestation.json>"),
            };
            let txt = std::fs::read_to_string(file).unwrap_or_default();
            let v: serde_json::Value = serde_json::from_str(&txt).unwrap_or(serde_json::Value::Null);
            if notary_public::verify_attestation(&v) {
                println!("VERIFIED — issuer signature valid");
            } else {
                fail("INVALID — signature does not verify");
            }
        }
        "status" => {
            let product = args.get(2).map(|s| s.as_str()).unwrap_or("nedb-engine");
            let env = std::env::var("NODE_ENV").ok();
            match notary_public::require_license(product, env.as_deref()) {
                Ok(ok) => println!(
                    "license OK: {product} ({})",
                    ok.license.get("license_state").and_then(|v| v.as_str()).unwrap_or("?")
                ),
                Err(e) => fail(&e.message),
            }
        }
        _ => {
            println!(
                "notary — the licensing notary\n\n  notary show <SPDX-ID>                 print a canonical SPDX license\n  notary place <SPDX-ID> [path] [--force]  place a license (default ./LICENSE)\n  notary notarize <file> [--id SPDX-ID]    identify + attest a license file\n  notary verify <attestation.json>      verify a signed notary stamp\n  notary status [product]               check this install's license\n"
            );
        }
    }
}

fn fail(msg: &str) -> ! {
    eprintln!("{msg}");
    std::process::exit(1);
}
