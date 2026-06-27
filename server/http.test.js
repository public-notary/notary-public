"use strict";
// HTTP smoke for the /v1 surface: register -> verify -> approve -> revoke ->
// trace, plus admin-auth + consumer-email rejection, over real sockets.
const http = require("http");
const os = require("os"), fs = require("fs"), path = require("path");
const { createServer } = require("./app");

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "np-http-"));
const server = createServer({ dataDir: dir, adminToken: "t0ken" });
const AUTH = { authorization: "Bearer t0ken" };

function req(method, p, bodyObj, headers = {}) {
  return new Promise((resolve, reject) => {
    const data = bodyObj ? JSON.stringify(bodyObj) : null;
    const r = http.request({ host: "127.0.0.1", port: server.address().port, method, path: p, headers: { "content-type": "application/json", ...headers } },
      (res) => { let b = ""; res.on("data", (c) => (b += c)); res.on("end", () => resolve({ status: res.statusCode, json: (() => { try { return JSON.parse(b); } catch { return b; } })() })); });
    r.on("error", reject); if (data) r.write(data); r.end();
  });
}
let pass = 0, fail = 0;
const check = async (n, f) => { try { await f(); console.log("  ok  " + n); pass++; } catch (e) { console.log("  XX  " + n + "  ::  " + (e && e.message || e)); fail++; } };

(async () => {
  await new Promise((r) => server.listen(0, r));
  console.log("notary /v1 http smoke:");
  let reg;
  await check("POST /v1/register -> 201", async () => {
    const r = await req("POST", "/v1/register", { product: "nedb-engine", org: "Acme", email: "dev@acme.com", project: "p", env: "production" });
    if (r.status !== 201) throw new Error(r.status + " " + JSON.stringify(r.json)); reg = r.json;
  });
  await check("consumer email -> 400", async () => {
    const r = await req("POST", "/v1/register", { product: "x", org: "y", email: "a@gmail.com" });
    if (r.status !== 400 || r.json.code !== "consumer_domain") throw new Error(r.status + " " + JSON.stringify(r.json));
  });
  await check("admin route without token -> 401", async () => {
    const r = await req("GET", "/v1/admin/licenses"); if (r.status !== 401) throw new Error(String(r.status));
  });
  await check("verify-email + admin approve -> signed receipt", async () => {
    await req("POST", "/v1/verify-email", { license_id: reg.license_id });
    const r = await req("POST", `/v1/admin/licenses/${reg.license_id}/approve`, { admin: "founders@vibecode-101.com" }, AUTH);
    if (r.status !== 200 || !r.json.receipt || r.json.receipt.license_state !== "approved") throw new Error(JSON.stringify(r.json).slice(0, 140));
  });
  await check("revoke + trace lineage over http", async () => {
    await req("POST", `/v1/admin/licenses/${reg.license_id}/revoke`, { admin: "a", reason: "x" }, AUTH);
    const r = await req("GET", `/v1/admin/licenses/${reg.license_id}/trace`, null, AUTH);
    const types = (r.json.trace || []).map((t) => t.type);
    for (const t of ["registered", "email_verified", "approved", "revoked"]) if (!types.includes(t)) throw new Error("missing " + t + " in " + types.join(","));
  });
  server.close();
  console.log("\n" + (fail === 0 ? "ALL GREEN" : "FAILURES") + " — " + pass + " passed, " + fail + " failed");
  process.exit(fail ? 1 : 0);
})();
