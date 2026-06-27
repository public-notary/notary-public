//! Company-email gate. Rejects generic consumer inboxes so each license maps to
//! a real organization domain. Mirrors the JS denylist.
const CONSUMER: &[&str] = &[
    "gmail.com", "googlemail.com", "outlook.com", "hotmail.com", "live.com", "msn.com",
    "yahoo.com", "ymail.com", "aol.com", "proton.me", "protonmail.com", "pm.me",
    "icloud.com", "me.com", "mac.com", "gmx.com", "mail.com", "zoho.com",
    "yandex.com", "hey.com", "fastmail.com", "tutanota.com", "duck.com",
];

/// Ok(domain) for a company email; Err(reason) for "invalid_email" / "consumer_domain".
pub fn is_company_email(email: &str) -> Result<String, String> {
    let e = email.trim().to_lowercase();
    let at = match e.find('@') {
        Some(i) => i,
        None => return Err("invalid_email".to_string()),
    };
    let local = &e[..at];
    let domain = &e[at + 1..];
    if local.is_empty() || domain.is_empty() || !domain.contains('.') {
        return Err("invalid_email".to_string());
    }
    if CONSUMER.contains(&domain) {
        return Err("consumer_domain".to_string());
    }
    Ok(domain.to_string())
}
