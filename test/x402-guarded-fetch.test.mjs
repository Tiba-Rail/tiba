import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import http from "node:http";
import test from "node:test";
import { Agent, fetch as undiciFetch } from "undici";
import { assertX402UrlAllowed, guardedX402Fetch, resolveX402UrlIfAllowed, X402_URL_NOT_ALLOWED } from "../src/lib/x402/guarded-fetch.ts";

const routeSource = readFileSync(new URL("../src/app/api/v1/x402/route.ts", import.meta.url), "utf8");

/** A resolver with a fixed answer sheet; unknown names resolve to a public address. */
function resolver(table) {
  return async (hostname) => {
    if (hostname in table) {
      const answers = table[hostname];
      if (answers instanceof Error) throw answers;
      return answers.map((address) => ({ address, family: address.includes(":") ? 6 : 4 }));
    }
    return [{ address: "93.184.216.34", family: 4 }];
  };
}

function spyFetch() {
  const calls = [];
  const impl = async (url, init) => {
    calls.push({ url: String(url), init });
    return new Response("ok", { status: 200 });
  };
  return { calls, impl };
}

test("only https is fetched: http, file, ftp and malformed addresses are refused before any request", async () => {
  const { calls, impl } = spyFetch();
  const fetchGuarded = guardedX402Fetch(impl, resolver({}));
  for (const url of [
    "http://api.example.com/premium",
    "ftp://api.example.com/premium",
    "file:///etc/passwd",
    "not a url",
    "https://user:pw@api.example.com/premium"
  ]) {
    await assert.rejects(fetchGuarded(url), { message: X402_URL_NOT_ALLOWED }, url);
  }
  assert.equal(calls.length, 0);
});

test("loopback, private, link-local (cloud metadata) and IPv6-internal targets are refused", async () => {
  const { calls, impl } = spyFetch();
  const lookup = resolver({
    "internal.example.com": ["10.0.0.5"],
    "rebound.example.com": ["93.184.216.34", "192.168.1.1"],
    "meta.example.com": ["169.254.169.254"],
    "six.example.com": ["fd00::1"],
    "mapped.example.com": ["::ffff:127.0.0.1"],
    "nowhere.example.com": [],
    "broken.example.com": new Error("ENOTFOUND")
  });
  const fetchGuarded = guardedX402Fetch(impl, lookup);
  for (const url of [
    "https://127.0.0.1/premium",
    "https://127.1.2.3:8443/premium",
    "https://0.0.0.0/premium",
    "https://10.1.2.3/premium",
    "https://172.16.9.9/premium",
    "https://192.168.0.1/premium",
    "https://169.254.169.254/latest/meta-data/",
    "https://100.64.0.1/premium",
    "https://[::1]/premium",
    "https://[fe80::1]/premium",
    "https://[::ffff:10.0.0.1]/premium",
    "https://internal.example.com/premium",
    "https://rebound.example.com/premium",
    "https://meta.example.com/premium",
    "https://six.example.com/premium",
    "https://mapped.example.com/premium",
    "https://nowhere.example.com/premium",
    "https://broken.example.com/premium"
  ]) {
    await assert.rejects(fetchGuarded(url), { message: X402_URL_NOT_ALLOWED }, url);
  }
  assert.equal(calls.length, 0, "no request left the server");
});

test("a public https seller is fetched with redirects disabled and a timeout, and the caller's method, headers and body kept", async () => {
  const { calls, impl } = spyFetch();
  const fetchGuarded = guardedX402Fetch(impl, resolver({ "api.example.com": ["93.184.216.34", "2606:2800:220:1:248:1893:25c8:1946"] }));
  const response = await fetchGuarded("https://api.example.com/premium?x=1", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{}"
  });
  assert.equal(response.status, 200);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://api.example.com/premium?x=1");
  assert.equal(calls[0].init.redirect, "manual", "a public host must not bounce us to an internal one");
  assert.equal(calls[0].init.method, "POST");
  assert.equal(calls[0].init.body, "{}");
  assert.ok(calls[0].init.signal instanceof AbortSignal);

  const literal = await assertX402UrlAllowed("https://93.184.216.34/premium", resolver({}));
  assert.equal(literal.hostname, "93.184.216.34");
});

test("resolveX402UrlIfAllowed hands back exactly the addresses it checked", async () => {
  const answers = [{ address: "93.184.216.34", family: 4 }, { address: "2606:2800:220:1:248:1893:25c8:1946", family: 6 }];
  const resolved = await resolveX402UrlIfAllowed(
    "https://api.example.com/premium",
    async () => answers
  );
  assert.equal(resolved.url.hostname, "api.example.com");
  assert.deepEqual(resolved.addresses, answers);
});

test("guardedX402Fetch resolves DNS exactly once per request, never again for the real connection", async () => {
  // A rebinding attacker answers differently on a second query. If this ever re-resolved for
  // the real connection instead of reusing what the check already approved, a second call here
  // would hand back the private address rather than the one that passed.
  let calls = 0;
  const rebindingLookup = async () => {
    calls += 1;
    return calls === 1 ? [{ address: "93.184.216.34", family: 4 }] : [{ address: "127.0.0.1", family: 4 }];
  };
  let capturedInit;
  const fetchImpl = async (_url, init) => {
    capturedInit = init;
    return new Response("ok", { status: 200 });
  };

  const fetchGuarded = guardedX402Fetch(fetchImpl, rebindingLookup);
  await fetchGuarded("https://api.example.com/premium");

  assert.equal(calls, 1, "the guard must resolve DNS exactly once per request");
  assert.ok(capturedInit.dispatcher, "the request must carry a dispatcher pinning the connection");
});

test("the pin actually works: a hostname real DNS cannot resolve still reaches the checked address", async () => {
  // The real proof, not just a source-reading check: build the exact kind of pinned Agent
  // guardedX402Fetch builds, by hand, and use it with the real undici fetch against a plain
  // local server. The hostname below cannot resolve on any real network (.invalid is reserved
  // for exactly this) -- if the pin didn't work, this would fail with an ENOTFOUND, not a 200.
  const server = http.createServer((_req, res) => res.end("pinned"));
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  try {
    const pinned = new Agent({
      connect: { lookup: (_hostname, _options, callback) => callback(null, [{ address: "127.0.0.1", family: 4 }]) }
    });
    const response = await undiciFetch(`http://this-name-cannot-possibly-resolve.invalid:${port}/`, { dispatcher: pinned });
    assert.equal(response.status, 200);
    assert.equal(await response.text(), "pinned");
    await pinned.close();
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("the x402 route hands the buyer the guarded fetch, not the global one", () => {
  const start = routeSource.indexOf("payX402Resource(");
  const deps = routeSource.slice(start);
  assert.match(deps, /fetch: guardedX402Fetch\(\)/);
  assert.doesNotMatch(deps, /^\s*fetch,\s*$/m, "the bare global fetch must not be passed");
});
