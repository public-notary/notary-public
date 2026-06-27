// @aiassistsecure/license-gate — type surface.

export interface LicenseReceipt {
  product: string;
  org?: string;
  email?: string;
  domain?: string;
  license_state:
    | "approved" | "trial" | "enterprise"
    | "pending_approval" | "pending_email_verification"
    | "revoked" | "suspended" | "denied" | "expired";
  license_type?: string;
  install_id?: string;
  org_id?: string;
  issued_at?: string;
  expires_at?: string | null;
  last_checked_at?: string;
  features?: Record<string, boolean>;
  signature: string;
}

export interface RequireLicenseResult {
  ok: true;
  license: LicenseReceipt;
  path: string | null;
  stale?: boolean;
  bypass?: boolean;
}

export class LicenseError extends Error {
  licenseState: string;
  code: string;
  product?: string;
}

export interface RequireLicenseOptions {
  product: string;
  packageName?: string;
  env?: string;
}

/** Offline runtime gate. Returns the verified license or throws LicenseError. */
export function requireLicense(opts: RequireLicenseOptions): RequireLicenseResult;

/** Verify a receipt's Ed25519 signature against the embedded issuer public key. */
export function verifyReceipt(receipt: unknown): boolean;

/** Locate a local signed receipt (env override → project → user). */
export function findReceipt(
  product: string,
  opts?: { cwd?: string }
): { receipt: LicenseReceipt; path: string } | null;

/** Reject generic consumer email domains; require a company domain. */
export function isCompanyEmail(
  email: string
): { ok: boolean; reason?: "invalid_email" | "consumer_domain"; domain?: string };
