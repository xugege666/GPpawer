import http from "node:http";
import { readFile, realpath, stat } from "node:fs/promises";
import { extname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawn } from "node:child_process";

const DEFAULT_ROOT = fileURLToPath(new URL("../dist/", import.meta.url));
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".ico": "image/x-icon",
  ".json": "application/json; charset=utf-8",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};
const inside = (root, target) => {
  const path = relative(root, target);
  return path !== ".." && !path.startsWith(`..${sep}`) && !isAbsolute(path);
};

/** Serve the bundled site on loopback using Node's standard library only. */
export async function createLocalServer({ root = DEFAULT_ROOT } = {}) {
  const publicRoot = await realpath(root);
  const indexPath = await realpath(join(publicRoot, "index.html"));
  if (!inside(publicRoot, indexPath))
    throw new Error(
      "dist/index.html must remain inside the built site directory.",
    );
  if (!(await stat(indexPath)).isFile())
    throw new Error(
      "dist/index.html is missing. Run npm ci and npm run build first.",
    );

  return http.createServer((request, response) => {
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.setHeader("Referrer-Policy", "same-origin");
    response.setHeader(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'",
    );
    const reply = (status, message) => {
      response.writeHead(status, {
        "Content-Type": "text/plain; charset=utf-8",
        "Content-Length": Buffer.byteLength(message),
      });
      response.end(request.method === "HEAD" ? undefined : message);
    };
    if (!["GET", "HEAD"].includes(request.method)) {
      response.setHeader("Allow", "GET, HEAD");
      reply(405, "Method not allowed");
      return;
    }
    (async () => {
      let pathname;
      try {
        pathname = decodeURIComponent(
          (request.url || "/").split("?")[0],
        ).replaceAll("\\", "/");
      } catch {
        reply(400, "Invalid URL encoding");
        return;
      }
      if (!pathname.startsWith("/") || pathname.includes("\0")) {
        reply(400, "Invalid path");
        return;
      }
      const target = resolve(publicRoot, `.${pathname}`);
      if (
        !inside(publicRoot, target) ||
        pathname.split("/").some((part) => part.startsWith("."))
      ) {
        reply(403, "Forbidden");
        return;
      }
      let file = target;
      try {
        if ((await stat(file)).isDirectory()) file = join(file, "index.html");
        file = await realpath(file);
      } catch (error) {
        if (error.code !== "ENOENT" && error.code !== "ENOTDIR") throw error;
        if (extname(pathname)) {
          reply(404, "Not found");
          return;
        }
        file = indexPath;
      }
      if (!inside(publicRoot, file)) {
        reply(403, "Forbidden");
        return;
      }
      const body = await readFile(file);
      response.writeHead(200, {
        "Content-Type":
          MIME[extname(file).toLowerCase()] || "application/octet-stream",
        "Content-Length": body.length,
        "Cache-Control": file.includes(`${sep}assets${sep}`)
          ? "public, max-age=31536000, immutable"
          : "no-store",
      });
      response.end(request.method === "HEAD" ? undefined : body);
    })().catch((error) => {
      console.error(
        `Local server request failed: ${error.code || error.message}`,
      );
      if (!response.headersSent) reply(500, "Unable to read the site file");
      else response.destroy();
    });
  });
}

export function parseArguments(args) {
  let port = 5173,
    open = false;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--open") open = true;
    else if (args[i] === "--port") {
      const raw = args[++i];
      if (!/^\d+$/.test(raw || "") || Number(raw) < 1 || Number(raw) > 65535)
        throw new Error("--port must be an integer from 1 to 65535.");
      port = Number(raw);
    } else throw new Error(`Unknown argument: ${args[i]}`);
  }
  return { port, open };
}

function openBrowser(url) {
  const command =
    process.platform === "win32"
      ? "cmd.exe"
      : process.platform === "darwin"
        ? "open"
        : "xdg-open";
  const args = process.platform === "win32" ? ["/c", "start", "", url] : [url];
  const browser = spawn(command, args, {
    detached: true,
    stdio: "ignore",
    windowsHide: true,
  });
  browser.on("error", () =>
    console.log(`Open this address in your browser: ${url}`),
  );
  browser.unref();
}

async function main() {
  const { port, open } = parseArguments(process.argv.slice(2));
  let server;
  try {
    server = await createLocalServer();
  } catch (error) {
    throw new Error(
      `The built site is unavailable. Run npm ci and npm run build, then retry. (${error.code || error.message})`,
    );
  }
  await new Promise((ready, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", ready);
  }).catch((error) => {
    if (error.code === "EADDRINUSE")
      throw new Error(
        `Port ${port} is in use. Close your existing local service, or run node scripts/serve-local.mjs --port ${port === 65535 ? 5173 : port + 1}.`,
      );
    throw error;
  });
  const url = `http://127.0.0.1:${port}/`;
  console.log(
    `\nAlpha Lab is running locally: ${url}\nPress Ctrl+C to stop.\n`,
  );
  if (open) openBrowser(url);
  for (const signal of ["SIGINT", "SIGTERM"])
    process.once(signal, () => server.close(() => process.exit(0)));
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  main().catch((error) => {
    console.error(`\n${error.message}\n`);
    process.exitCode = 1;
  });
}
