<h1 align="center">notary&#8209;public</h1>
<p align="center"><b>The licensing notary.</b></p>
<p align="center"><i>Distribute any SPDX license · notarize a project's LICENSE against the canonical text · gate your own packages with offline, signed registration.</i></p>

<p align="center">
  <code>npm i notary-public</code> &nbsp;·&nbsp; <code>pip install notary-public</code> &nbsp;·&nbsp; <code>cargo add notary-public</code>
</p>

---

`notary-public` is a self-hostable **licensing authority kit**. It has two halves and ships in three runtimes (JavaScript, Python, Rust) that all verify the **same signed receipt**:

1. **License gate** — a protected package calls `requireLicense()` at startup. It reads a locally-cached, **Ed25519-signed** license receipt and verifies it **fully offline** against an embedded issuer public key — no license server contact at runtime — then enforces state (`approved` / `pending` / `revoked` / `expired`) and a production-feature grant.
2. **License notary** — a catalogue of **every SPDX license** that you can drop into a project, plus `notarize` — identify which SPDX license a file is and attest the match with an offline-verifiable stamp.

And the **authority** (server + cockpit) that issues and revokes those licenses — see [`server/`](server/).

## Install & use (client)

```js
// JavaScript
const { requireLicense } = require("notary-public");
requireLicense({ product: "nedb-engine", env: process.env.NODE_ENV });
```
```python
# Python
from notary_public import require_license
require_license(product="nedb-engine", env="production")
```
```rust
// Rust
notary_public::require_license("nedb-engine", Some("production"))?;
```

If unlicensed, you get a clean, actionable error that points to `nedb init`.

## CLI

```
notary init [product]        register this install (guided)
notary status [product]      are we licensed? what's pending?
notary license <SPDX> [path] drop a license into your project
notary licenses [search]     browse the SPDX catalogue
notary notarize <file>       identify + attest a LICENSE file
notary verify <file.json>    verify a signed notary stamp
notary serve                 run the license authority (/v1 API + cockpit)
```

## The authority + Operations Cockpit — [`server/`](server/)

The authority **dogfoods [NEDB](https://github.com/Eth-Interchained/nedb)**: every lifecycle transition (`register → verify-email → approve → revoke`) is an immutable, content-addressed event whose `caused_by` links to the events that produced it, so **`TRACE caused_by` reconstructs who approved a license, when, and why**. Approval signs the offline receipt the client verifies.

```bash
npm i nedb-engine                  # the authority's store (optionalDependency)
export INTERCHAINED_ISSUER_KEY=…    # issuer private key (PEM or path)
export NOTARY_ADMIN_TOKEN=…        # guards /v1/admin/*
notary serve                       # → open http://localhost:8787  (the cockpit)
```

The **Operations Cockpit** is a dark, gamified command center: a live Ignition Queue (one-click Approve/Reject/Hold), a dashboard of real metrics, a provenance panel that renders the NEDB causal chain, and a command palette — all on the live `/v1` API.

**Self-host your own authority:** generate your own Ed25519 keypair, set it as `INTERCHAINED_ISSUER_KEY`, and embed its public key in your client build. The shipped public key trusts the canonical Interchained authority; the private key is never published.

## Licenses, fetched not bundled

The SPDX License List corpus lives in this repo under [`spdx/`](spdx/) (source of truth; vendored from [spdx/license-list-data](https://github.com/spdx/license-list-data)). License text/metadata is fetched from the repo on demand and cached — never hand-authored.

## License

**Business Source License 1.1** — Licensor: Interchained LLC · Change License: Apache‑2.0 · Change Date: 2029‑06‑27 · Additional Use Grant: free for non‑production and non‑commercial/evaluation use; **commercial production use requires a commercial license**. The bundled SPDX corpus keeps its own upstream terms. See [`LICENSE`](LICENSE). Commercial licensing: founders@vibecode-101.com.

<sub>© Interchained LLC × Claude.</sub>
