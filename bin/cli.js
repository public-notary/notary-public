#!/usr/bin/env node
"use strict";
// notary — the friendly CLI for notary-public.
// Designed for first-timers: every path is one command, every error hands you
// the exact next step, success feels good. Zero dependencies.

const fs = require("fs");
const os = require("os");
const path = require("path");
const readline = require("readline");

const cat = require("../src/catalogue");
const { placeLicense } = require("../src/place");
const { notarize, verifyAttestation } = require("../src/notarize");
const { findReceipt } = require("../src/receipt");
const { verifyReceipt } = require("../src/verify");
const { requireLicense } = require("../src/gate");
const { isCompanyEmail } = require("../src/email");

// ── pretty ──────────────────────────────────────────────────────────────────
const useColor = process.stdout.isTTY && !process.env.NO_COLOR;
const c = (n) => (s) => (useColor ? `\x1b[${n}m${s}\x1b[0m` : s);
const bold = c(1), dim = c(2), cyan = c(36), green = c(32), yellow = c(33), red = c(31), mag = c(35);
function box(title, lines) {
  const w = Math.max(title.length, ...lines.map((l) => l.length), 36) + 2;
  const bar = "─".repeat(w);
  const pad = (s) => " " + s + " ".repeat(w - s.length - 1);
  return [
    cyan("╭" + bar + "╮"),
    cyan("│") + bold(pad(title)) + cyan("│"),
    cyan("├" + bar + "┤"),
    ...lines.map((l) => cyan("│") + pad(l) + cyan("│")),
    cyan("╰" + bar + "╯"),
  ].join("\n");
}
const say = (...a) => console.log(...a);
function tip(cmd) { return dim("  →  ") + cyan(cmd); }
function regRequestPath(product) {
  return path.join(os.homedir(), ".interchained", "registrations", `${product}.json`);
}

function ask(rl, q, { required = false, validate } = {}) {
  return new Promise((resolve) => {
    const go = () => rl.question(cyan("? ") + q + " ", (ans) => {
      ans = (ans || "").trim();
      if (required && !ans) { say(red("  (required)")); return go(); }
      if (ans && validate) { const v = validate(ans); if (v !== true) { say(red("  " + v)); return go(); } }
      resolve(ans);
    });
    go();
  });
}

// ── commands ──────────────────────────────────────────────────────────────────
async function cmdInit(args) {
  const product = args._[1] || "nedb-engine";
  say(box("notary · register " + product, [
    "Two minutes. We verify your org, you're cleared,",
    "and the product unlocks. Company email required.",
  ]));
  say("");
  let info;
  if (process.stdin.isTTY) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    try {
      const org = await ask(rl, "Organization name:", { required: true });
      const email = await ask(rl, "Company email:", {
        required: true,
        validate: (e) => {
          const r = isCompanyEmail(e);
          return r.ok ? true : r.reason === "consumer_domain"
            ? `Use a company email — ${r.domain} is a personal inbox.`
            : "That doesn't look like an email.";
        },
      });
      const project = await ask(rl, "Project name:", { required: true });
      const env = (await ask(rl, "Environment [development/staging/production] (development):")) || "development";
      const useCase = await ask(rl, "What are you building? (one line):");
      info = { org, email, project, env, use_case: useCase };
    } finally { rl.close(); }
  } else {
    // non-interactive: take flags
    const email = args.email;
    if (!email || !isCompanyEmail(email).ok) {
      say(red("Non-interactive registration needs a company email:"));
      say(tip(`notary init ${product} --org "Acme" --email you@acme.com --project app --env production`));
      process.exit(1);
    }
    info = { org: args.org || "", email, project: args.project || "", env: args.env || "development", use_case: args["use-case"] || "" };
  }

  const req = {
    product, ...info, domain: isCompanyEmail(info.email).domain,
    license_state: "pending_submission", requested_at: new Date().toISOString(),
  };
  const p = regRequestPath(product);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(req, null, 2));

  say("");
  say(green("✓ Registration prepared for ") + bold(product) + green("."));
  say(dim("  Saved locally: " + p));
  say("");
  say("Next:");
  say(tip("notary verify-email     ") + dim("# confirm your email"));
  say(tip("notary status           ") + dim("# check approval state"));
  say("");
  say(dim("(Heads up: the hosted approval API is the next piece we're wiring;"));
  say(dim(" this stages your request so the flow is ready end-to-end.)"));
}

function cmdStatus(args) {
  const product = args._[1] || "nedb-engine";
  const found = findReceipt(product);
  if (found && verifyReceipt(found.receipt)) {
    const r = found.receipt;
    say(green("✓ Licensed: ") + bold(product) + "  " + dim("(" + r.license_state + ")"));
    say(dim("  org: " + (r.org || "?") + "   type: " + (r.license_type || "?")));
    const feats = Object.entries(r.features || {}).filter(([, v]) => v).map(([k]) => k);
    if (feats.length) say(dim("  features: " + feats.join(", ")));
    return;
  }
  const reqP = regRequestPath(product);
  if (fs.existsSync(reqP)) {
    say(yellow("◌ Pending: ") + bold(product));
    say(dim("  Your registration is staged/awaiting approval."));
    say(tip("notary status   ") + dim("# check again later"));
    return;
  }
  say(red("✗ Not registered: ") + bold(product));
  say(tip(`notary init ${product}`) + dim("   # 2-minute registration"));
}

function cmdLicenses(args) {
  const q = args._[1] || args.search;
  const rows = q ? cat.search(q) : cat.list({ osiOnly: args.osi });
  say(bold(`${rows.length} licenses`) + dim(`  (SPDX ${cat.version()})`) + (q ? dim(`  matching "${q}"`) : "") + "\n");
  for (const l of rows.slice(0, args.all ? rows.length : 40)) {
    say("  " + cyan(l.id.padEnd(28)) + dim(l.name) + (l.osi ? green("  ·OSI") : ""));
  }
  if (!args.all && rows.length > 40) say(dim(`\n  …and ${rows.length - 40} more — ` ) + cyan("notary licenses --all") + dim(" or ") + cyan("notary licenses <search>"));
  say("\n" + dim("Drop one in: ") + cyan("notary license <SPDX-ID>"));
}

function cmdShow(args) {
  const id = args._[1];
  if (!id) return fail("usage: notary show <SPDX-ID>");
  const t = cat.getText(id);
  if (!t) return fail(`Unknown license: ${id}\n` + tip("notary licenses <search>"));
  process.stdout.write(t);
}

function cmdPlace(args) {
  const id = args._[1];
  if (!id) return fail("usage: notary license <SPDX-ID> [path]\n" + tip("notary licenses   # browse"));
  const dest = args._[2] || path.join(process.cwd(), "LICENSE");
  try {
    const r = placeLicense(id, dest, { force: !!args.force });
    say(green("✓ Placed ") + bold(r.id) + green(" → ") + r.dest);
    say(dim("  " + r.name + "   sha256: " + r.sha256.slice(0, 16) + "…"));
    say(dim("  Tip: ") + cyan(`notary notarize ${path.relative(process.cwd(), r.dest) || "LICENSE"}`) + dim(" to attest it's the real thing."));
  } catch (e) {
    if (/already exists/.test(e.message)) return fail(e.message + "\n" + tip(`notary license ${id} --force`));
    fail(e.message);
  }
}

function cmdNotarize(args) {
  const file = args._[1];
  if (!file) return fail("usage: notary notarize <file> [--id SPDX-ID]");
  const keyPath = path.join(__dirname, "..", ".issuer-key.pem");
  const sign = args.sign && fs.existsSync(keyPath);
  const att = notarize(file, { spdxId: args.id, privateKeyPem: sign ? fs.readFileSync(keyPath, "utf8") : undefined });
  if (att.match === "exact") say(green("✓ Notarized: ") + bold(att.spdx_id) + green(" — exact canonical match."));
  else if (att.match === "normalized") say(yellow("≈ ") + bold(att.spdx_id || "?") + yellow(" — matches apart from whitespace."));
  else say(red("✗ Not a recognized unmodified SPDX license") + (att.spdx_id ? dim(` (closest: ${att.spdx_id})`) : ""));
  say(dim("  sha256: " + att.file_sha256.slice(0, 24) + "…"));
  if (att.signature) say(dim("  stamp signed; verify with ") + cyan("notary verify <file.json>"));
  if (args.json) say("\n" + JSON.stringify(att, null, 2));
}

function cmdVerify(args) {
  const file = args._[1];
  if (!file) return fail("usage: notary verify <attestation-or-receipt.json>");
  let v; try { v = JSON.parse(fs.readFileSync(file, "utf8")); } catch { return fail("Can't read JSON: " + file); }
  say(verifyReceipt(v) ? green("✓ VERIFIED — issuer signature valid.") : red("✗ INVALID — signature does not verify."));
  if (!verifyReceipt(v)) process.exit(1);
}

function cmdHelp() {
  say(box("notary · the licensing notary", [
    "Register once, drop in any license, prove it's real.",
  ]));
  const rows = [
    ["init [product]", "register this install (guided)"],
    ["status [product]", "are we licensed? what's pending?"],
    ["license <SPDX> [path]", "drop a license into your project"],
    ["licenses [search]", "browse the SPDX catalogue"],
    ["show <SPDX>", "print a license to stdout"],
    ["notarize <file>", "identify + attest a LICENSE file"],
    ["verify <file.json>", "verify a signed notary stamp"],
    ["serve", "run the license authority (/v1 API)"],
  ];
  say("");
  for (const [cmd, desc] of rows) say("  " + cyan(("notary " + cmd).padEnd(31)) + dim(desc));
  say("\n  " + dim("New here? Start with ") + cyan("notary license MIT") + dim(" — instant gratification."));
}

function fail(msg) { say(red(msg)); process.exit(1); }

// ── arg parse (tiny) ──────────────────────────────────────────────────────────
function parse(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith("--")) { out[key] = next; i++; } else out[key] = true;
    } else out._.push(a);
  }
  return out;
}

async function main() {
  const args = parse(process.argv.slice(2));
  const cmd = args._[0] || "help";
  try {
    switch (cmd) {
      case "init": case "register": return await cmdInit(args);
      case "status": case "whoami": case "license-status": return cmdStatus(args);
      case "license": case "place": case "add": return cmdPlace(args);
      case "licenses": case "list": case "catalogue": return cmdLicenses(args);
      case "show": case "cat": return cmdShow(args);
      case "notarize": case "stamp": return cmdNotarize(args);
      case "verify": return cmdVerify(args);
      case "serve": case "server": return require("../server/app").main();
      case "version": case "--version": case "-v": return say("notary-public " + require("../package.json").version);
      default: return cmdHelp();
    }
  } catch (e) { fail(e && e.message ? e.message : String(e)); }
}
main();
