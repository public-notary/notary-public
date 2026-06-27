//! Deterministic JSON canonicalization — the cross-language signing contract.
//!
//! Recursively sorts object keys (arrays keep order), ALWAYS excludes the
//! `signature` field, emits compact separators, UTF-8. Scalars are rendered with
//! `serde_json::to_string`, which matches JavaScript `JSON.stringify` and Python
//! `json.dumps(...,ensure_ascii=False)` for the string/bool/null/integer values
//! that appear in receipts. The output must byte-equal the other ports.
use serde_json::Value;

pub fn canonicalize(value: &Value) -> String {
    match value {
        Value::Object(map) => {
            let mut keys: Vec<&String> = map.keys().filter(|k| k.as_str() != "signature").collect();
            keys.sort();
            let parts: Vec<String> = keys
                .iter()
                .map(|k| {
                    let key_json = serde_json::to_string(k).expect("string key serializes");
                    format!("{}:{}", key_json, canonicalize(map.get(*k).unwrap()))
                })
                .collect();
            format!("{{{}}}", parts.join(","))
        }
        Value::Array(arr) => {
            let parts: Vec<String> = arr.iter().map(canonicalize).collect();
            format!("[{}]", parts.join(","))
        }
        other => serde_json::to_string(other).expect("scalar serializes"),
    }
}
