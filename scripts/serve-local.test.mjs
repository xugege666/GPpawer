import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { mkdtemp, mkdir, writeFile, symlink, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createLocalServer, parseArguments } from "./serve-local.mjs";

let server, url;
before(async () => {
  server = await createLocalServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  url = `http://127.0.0.1:${server.address().port}`;
});
after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
});

test("serves the bundled site and referenced JavaScript with correct MIME types", async () => {
  const response = await fetch(url);
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type"), /text\/html/);
  const html = await response.text();
  assert.match(html, /Alpha Lab/);
  const asset = html.match(/src="([^"]+\.js)"/)[1];
  const script = await fetch(url + asset);
  assert.equal(script.status, 200);
  assert.match(script.headers.get("content-type"), /javascript/);
  assert.ok((await script.text()).length > 1000);
  assert.match(script.headers.get("cache-control"), /immutable/);
});

test("supports HEAD, returns missing assets as 404, and rejects writes", async () => {
  const head = await fetch(url, { method: "HEAD" });
  assert.equal(head.status, 200);
  assert.ok(Number(head.headers.get("content-length")) > 0);
  assert.equal(await head.text(), "");
  assert.equal((await fetch(url + "/missing.js")).status, 404);
  assert.equal((await fetch(url, { method: "POST" })).status, 405);
  assert.equal((await fetch(url + "/research")).status, 200);
});

test("refuses encoded traversal, hidden paths and malformed URLs", async () => {
  // Use raw http paths: URL/fetch would normalize dot segments before sending.
  for (const [path, status] of [
    ["/%2e%2e/package.json", 403],
    ["/%2e%2e%5cpackage.json", 403],
    ["/.env", 403],
    ["/%zz", 400],
  ]) {
    const received = await new Promise((resolve, reject) => {
      const req = http.get(url + "/", { path }, (response) => {
        response.resume();
        response.on("end", () => resolve(response.statusCode));
      });
      req.on("error", reject);
    });
    assert.equal(received, status, path);
  }
});

test("validates ports and rejects unknown CLI options", () => {
  assert.deepEqual(parseArguments(["--open", "--port", "8080"]), {
    port: 8080,
    open: true,
  });
  for (const value of ["0", "-1", "65536", "5173junk", ""])
    assert.throws(() => parseArguments(["--port", value]));
  assert.throws(() => parseArguments(["--unknown"]));
});

test(
  "refuses an index symlink outside the public directory",
  { skip: process.platform === "win32" },
  async () => {
    const temporary = await mkdtemp(join(tmpdir(), "alpha-local-test-"));
    try {
      const root = join(temporary, "dist");
      await mkdir(root);
      const outside = join(temporary, "private.html");
      await writeFile(outside, "must not be served");
      await symlink(outside, join(root, "index.html"));
      await assert.rejects(createLocalServer({ root }), /must remain inside/);
    } finally {
      await rm(temporary, { recursive: true, force: true });
    }
  },
);
