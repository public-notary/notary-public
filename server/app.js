"use strict";
// notary authority — /v1 HTTP surface over the Authority (NEDB-backed, causal).
// Zero framework deps (built-in http). Admin routes require a bearer token when
// NOTARY_ADMIN_TOKEN is set.
const http = require("http");
const { Authority } = require("./store");

const send = (res, code, obj) => { res.writeHead(code, { "content-type": "application/json" }); res.end(JSON.stringify(obj)); };
const body = (req) => new Promise((resolve) => {
  let b = ""; req.on("data", (c) => (b += c)); req.on("end", () => { try { resolve(b ? JSON.parse(b) : {}); } catch { resolve({}); } });
});

function createServer({ dataDir, adminToken } = {}) {
  const A = new Authority(dataDir || process.env.NOTARY_DATA_DIR || "./notary-data");
  const ADMIN = adminToken || process.env.NOTARY_ADMIN_TOKEN || null;
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, "http://localhost");
      const p = url.pathname, m = req.method;
      if (p.startsWith("/v1/admin/") && ADMIN && req.headers["authorization"] !== `Bearer ${ADMIN}`) {
        return send(res, 401, { error: "admin authorization required" });
      }
      if (p === "/v1/health") return send(res, 200, { ok: true, service: "notary-public", engine: "nedb", causal: true });

      if (m === "POST" && p === "/v1/register") {
        const b = await body(req);
        try { return send(res, 201, A.register(b)); }
        catch (e) { return send(res, 400, { error: e.message, code: e.code }); }
      }
      if (m === "POST" && p === "/v1/verify-email") return send(res, 200, A.verifyEmail((await body(req)).license_id));
      if (m === "POST" && p === "/v1/license/check") return send(res, 200, A.check((await body(req)).license_id) || { state: "missing" });
      if (m === "POST" && p === "/v1/license/refresh") {
        const r = A.receipt((await body(req)).install_id);
        return r ? send(res, 200, { receipt: r }) : send(res, 404, { error: "no receipt" });
      }

      const act = p.match(/^\/v1\/admin\/licenses\/([^/]+)\/(approve|deny|revoke|suspend|restore)$/);
      if (m === "POST" && act) {
        const [, id, action] = act; const b = await body(req); const actor = b.admin || "admin";
        if (action === "approve") return send(res, 200, { receipt: A.approve(id, actor, b) });
        return send(res, 200, A[action](id, actor, b.reason || ""));
      }
      const tr = p.match(/^\/v1\/admin\/licenses\/([^/]+)\/trace$/);
      if (m === "GET" && tr) return send(res, 200, { trace: A.trace(tr[1]) });
      if (m === "GET" && p === "/v1/admin/requests") return send(res, 200, { requests: A.licenses(url.searchParams.get("state")) });
      if (m === "GET" && p === "/v1/admin/licenses") return send(res, 200, { licenses: A.licenses() });
      if (m === "GET" && p === "/v1/admin/orgs") return send(res, 200, { orgs: A.organizations() });

      return send(res, 404, { error: "not found" });
    } catch (e) { return send(res, 500, { error: e.message }); }
  });
  return server;
}

function main() {
  const port = Number(process.env.PORT) || 8787;
  createServer().listen(port, () => console.log(`notary authority listening on :${port}  (engine=nedb, causal provenance)`));
}

module.exports = { createServer, main };
if (require.main === module) main();
