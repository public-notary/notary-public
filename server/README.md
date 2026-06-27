# notary-public — License Authority (server)

The license/registration API that issues and notarizes licenses for
`notary-public`. It **dogfoods `nedb-engine`**: every lifecycle transition
(register → verify-email → approve → revoke/suspend) is an immutable,
content-addressed NEDB event whose `caused_by` links to the events that produced
it, so `TRACE caused_by` reconstructs the full provenance — **who approved it,
when, and why**. Approval signs an **offline Ed25519 receipt** the `notary-public`
client SDK verifies with no server contact.

This is the *authority* half — it is **not** part of the thin client install
(`nedb-engine` is an `optionalDependency`).

## Run

```bash
npm i nedb-engine                  # the authority's store (optionalDependency)
export INTERCHAINED_ISSUER_KEY=…   # issuer PRIVATE key — PEM contents or a path
export NOTARY_ADMIN_TOKEN=…        # bearer token guarding /v1/admin/*
export NOTARY_DATA_DIR=./notary-data
notary serve                       # or: node server/app.js   (PORT, default 8787)
```

**Self-host your own authority:** generate your own Ed25519 keypair, set it as
`INTERCHAINED_ISSUER_KEY`, and embed its public key in your client build. The
shipped public key trusts the canonical Interchained authority only. The issuer
private key is never committed or published.

## /v1 endpoints

- `POST /v1/register` · `/v1/verify-email` · `/v1/login` · `/v1/license/check` · `/v1/license/refresh`
- `POST /v1/admin/licenses/:id/{approve,deny,revoke,suspend,restore}`
- `GET  /v1/admin/{requests,orgs,licenses}` · `GET /v1/admin/licenses/:id/trace`

Registration requires a company email (consumer inboxes are rejected).

## Tests

```bash
node server/test.js        # lifecycle + causal provenance (register→approve→revoke→TRACE)
node server/http.test.js   # /v1 HTTP smoke
```
