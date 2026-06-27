//! Place a vendored SPDX license into a project (copies canonical text;
//! never authored here).
use std::fs;
use std::path::Path;

/// Write the canonical SPDX text for `spdx_id` to `dest`. Returns the sha256 of
/// the placed text. Refuses to overwrite unless `force`.
pub fn place_license(spdx_id: &str, dest: &Path, force: bool) -> Result<String, String> {
    let text = crate::catalogue::get_text(spdx_id)
        .ok_or_else(|| format!("Unknown or unavailable SPDX license: {spdx_id}"))?;
    if dest.exists() && !force {
        return Err(format!("{} already exists (pass force to overwrite)", dest.display()));
    }
    if let Some(parent) = dest.parent() {
        let _ = fs::create_dir_all(parent);
    }
    fs::write(dest, &text).map_err(|e| e.to_string())?;
    Ok(crate::notarize::sha256_hex(text.as_bytes()))
}
