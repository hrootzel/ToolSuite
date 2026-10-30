const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const PORT = Number(process.env.PORT || 8080);
const ROOT = path.resolve(process.env.WEB_ROOT || "/srv/www");
// Each application stores JSON in its OWN folder: <WEB_ROOT>/<app>/data/<key>.json.
// WEB_ROOT itself does not need write permission. No app-specific storage paths.
const MAX_JSON_BYTES = 8 * 1024 * 1024;
const writeQueues = new Map();
const storageRoute = /^(.+)\/api\/storage\/([a-zA-Z0-9][a-zA-Z0-9_-]{0,63})$/;

const mimeTypes = {
    ".html": "text/html; charset=utf-8",
    ".htm": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".mjs": "text/javascript; charset=utf-8",
    ".cjs": "text/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".txt": "text/plain; charset=utf-8",
    ".md": "text/markdown; charset=utf-8",
    ".xml": "application/xml; charset=utf-8",

    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".ico": "image/x-icon",

    ".woff": "font/woff",
    ".woff2": "font/woff2",
    ".ttf": "font/ttf",
    ".otf": "font/otf",

    ".pdf": "application/pdf",

    ".mp3": "audio/mpeg",
    ".wav": "audio/wav",
    ".ogg": "audio/ogg",

    ".mp4": "video/mp4",
    ".webm": "video/webm"
};

function send(res, status, body, contentType = "text/plain; charset=utf-8") {
    const buffer = Buffer.from(body);

    res.writeHead(status, {
        "Content-Type": contentType,
        "Content-Length": buffer.length,
        "X-Content-Type-Options": "nosniff"
    });

    res.end(buffer);
}

function sendError(res, status, message) {
    send(res, status, `${status} ${message}\n`);
}

// Generic, revisioned JSON document API, reusable by any app in its own directory.
function sendJson(res, status, value) {
    const buffer = Buffer.from(JSON.stringify(value));
    res.writeHead(status, {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Length": buffer.length,
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff"
    });
    res.end(buffer);
}

function httpError(status, message) {
    const error = new Error(message);
    error.status = status;
    return error;
}

function isBelow(file, base) {
    return file.startsWith(base + path.sep);
}

// URL: /<app-folder>/api/storage/<key> (e.g. /ToolSuite/api/storage/baby-calendar).
// The path is a *directory* beneath WEB_ROOT, not an arbitrary filesystem path.
async function appDocumentPath(appUrlPath, key) {
    if (!appUrlPath.startsWith("/") || appUrlPath.includes("\\") ||
        appUrlPath.includes("\0") || appUrlPath.split("/").some(part =>
            part === "." || part === ".." || part === "data" || part.startsWith("."))) {
        throw httpError(400, "Invalid application directory");
    }
    const appDir = path.resolve(ROOT, "." + appUrlPath);
    if (!isBelow(appDir, ROOT)) {
        throw httpError(403, "Application must be in its own folder below WEB_ROOT");
    }
    let canonicalRoot, canonicalApp, files;
    try {
        canonicalRoot = await fs.promises.realpath(ROOT);
        canonicalApp = await fs.promises.realpath(appDir);
        // Require an actual HTML app in the selected folder; reject missing paths.
        files = await fs.promises.readdir(appDir, { withFileTypes: true });
    } catch (err) {
        if (err.code === "ENOENT" || err.code === "ENOTDIR") {
            throw httpError(404, "Application directory does not exist");
        }
        throw err;
    }
    if (!isBelow(canonicalApp, canonicalRoot)) {
        throw httpError(403, "Application directory escapes WEB_ROOT");
    }
    if (!files.some(file => file.isFile() && /\.html?$/i.test(file.name))) {
        throw httpError(404, "No HTML application in this directory");
    }
    return { dataDir: path.join(appDir, "data"), file: path.join(appDir, "data", key + ".json") };
}

async function checkDataFolder(dataDir, create) {
    let stats;
    try {
        stats = await fs.promises.lstat(dataDir);
    } catch (error) {
        if (error.code !== "ENOENT") throw error;
        if (!create) return false;
        // Only the app's own folder must be writable. Never mkdir recursively.
        try {
            await fs.promises.mkdir(dataDir, { mode: 0o700 });
        } catch (mkdirError) {
            // Two independent document keys can create the same data/ directory at once.
            if (mkdirError.code !== "EEXIST") throw mkdirError;
        }
        stats = await fs.promises.lstat(dataDir);
    }
    if (stats.isSymbolicLink() || !stats.isDirectory()) {
        throw httpError(403, "App data folder cannot be a symlink or regular file");
    }
    return true;
}

async function readDocument(paths) {
    if (!await checkDataFolder(paths.dataDir, false)) {
        return { version: 1, revision: 0, initialized: false, data: null };
    }
    let handle;
    try {
        // O_NOFOLLOW prevents following a per-document symlink outside this folder.
        handle = await fs.promises.open(paths.file, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0));
        const stats = await handle.stat();
        if (!stats.isFile() || stats.size > MAX_JSON_BYTES) {
            throw httpError(400, "Invalid or oversized stored JSON document");
        }
        const state = JSON.parse(await handle.readFile({ encoding: "utf8" }));
        if (!state || state.version !== 1 ||
            !Number.isSafeInteger(state.revision) || state.revision < 1 ||
            !Object.prototype.hasOwnProperty.call(state, "data")) {
            throw httpError(500, "Invalid stored JSON document");
        }
        return { ...state, initialized: true };
    } catch (error) {
        if (error.code === "ENOENT") {
            return { version: 1, revision: 0, initialized: false, data: null };
        }
        throw error;
    } finally {
        if (handle) await handle.close();
    }
}

async function readJsonRequest(req) {
    if (!(req.headers["content-type"] || "").toLowerCase().startsWith("application/json")) {
        throw httpError(415, "Expected application/json");
    }
    const chunks = [];
    let size = 0;
    for await (const chunk of req) {
        size += chunk.length;
        if (size > MAX_JSON_BYTES) throw httpError(413, "JSON request exceeds 8 MB");
        chunks.push(chunk);
    }
    try {
        return JSON.parse(Buffer.concat(chunks).toString("utf8"));
    } catch {
        throw httpError(400, "Invalid JSON");
    }
}

async function writeDocument(paths, state) {
    await checkDataFolder(paths.dataDir, true);
    const tmp = path.join(paths.dataDir, `.write-${process.pid}-${crypto.randomBytes(8).toString("hex")}.tmp`);
    let handle;
    try {
        handle = await fs.promises.open(tmp, "wx", 0o600);
        await handle.writeFile(JSON.stringify(state, null, 2) + "\n", "utf8");
        await handle.sync();
        await handle.close();
        handle = null;
        await fs.promises.rename(tmp, paths.file);
    } finally {
        if (handle) await handle.close();
        await fs.promises.rm(tmp, { force: true }).catch(() => {});
    }
}

async function handleAppStorage(req, res, appUrlPath, key) {
    if (req.method !== "GET" && req.method !== "PUT") {
        res.setHeader("Allow", "GET, PUT");
        return sendJson(res, 405, { error: "Method not allowed" });
    }
    if (req.method === "PUT" && req.headers.origin) {
        // CSRF defense; for untrusted clients this is not authentication.
        let originHost;
        try { originHost = new URL(req.headers.origin).host.toLowerCase(); } catch {}
        const hosts = [req.headers.host, req.headers["x-forwarded-host"]]
            .filter(Boolean).map(host => String(host).toLowerCase());
        if (!originHost || !hosts.includes(originHost)) {
            return sendJson(res, 403, { error: "Cross-origin writes are not allowed" });
        }
    }
    try {
        const paths = await appDocumentPath(appUrlPath, key);
        if (req.method === "GET") {
            return sendJson(res, 200, await readDocument(paths));
        }
        const payload = await readJsonRequest(req);
        if (!payload || !Number.isSafeInteger(payload.revision) || payload.revision < 0 ||
            !Object.prototype.hasOwnProperty.call(payload, "data") ||
            (payload.version !== undefined && payload.version !== 1)) {
            throw httpError(400, "Expected {revision, data} JSON document");
        }
        // Serialize competing PUTs for the same document within this Node process.
        const previous = writeQueues.get(paths.file) || Promise.resolve();
        const task = previous.catch(() => {}).then(async () => {
            const oldState = await readDocument(paths);
            if (oldState.revision !== payload.revision) {
                return { conflict: true, revision: oldState.revision };
            }
            const next = { version: 1, revision: oldState.revision + 1, data: payload.data };
            await writeDocument(paths, next);
            return { conflict: false, revision: next.revision };
        });
        writeQueues.set(paths.file, task);
        try {
            const result = await task;
            if (result.conflict) {
                return sendJson(res, 409, {
                    error: "Storage document changed elsewhere", revision: result.revision
                });
            }
            return sendJson(res, 200, { ok: true, revision: result.revision });
        } finally {
            if (writeQueues.get(paths.file) === task) writeQueues.delete(paths.file);
        }
    } catch (error) {
        if (error.status) return sendJson(res, error.status, { error: error.message });
        console.error("App storage API failed:", error);
        return sendJson(res, 500, { error: "App storage failed; check folder permissions and JSON file" });
    }
}

function statFile(filename) {
    return new Promise((resolve, reject) => {
        fs.stat(filename, (err, stats) => {
            if (err) {
                reject(err);
            } else {
                resolve(stats);
            }
        });
    });
}

function serveFile(req, res, filename, stats) {
    const ext = path.extname(filename).toLowerCase();
    const contentType =
        mimeTypes[ext] || "application/octet-stream";

    const headers = {
        "Content-Type": contentType,
        "Content-Length": stats.size,
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "no-cache"
    };

    res.writeHead(200, headers);

    // Correct behavior for HEAD requests.
    if (req.method === "HEAD") {
        return res.end();
    }

    const stream = fs.createReadStream(filename);

    stream.on("error", (err) => {
        console.error(`read failed for ${filename}:`, err);

        if (!res.headersSent) {
            sendError(res, 500, "Internal Server Error");
        } else {
            res.destroy();
        }
    });

    stream.pipe(res);
}

const server = http.createServer(async (req, res) => {
    let url;
    let pathname;

    try {
        url = new URL(
            req.url,
            `http://${req.headers.host || "localhost"}`
        );

        pathname = decodeURIComponent(url.pathname);
    } catch (err) {
        console.error("Invalid request URL:", err);
        return sendError(res, 400, "Bad Request");
    }

    const storageMatch = pathname.match(storageRoute);
    if (storageMatch) {
        return handleAppStorage(req, res, storageMatch[1], storageMatch[2]);
    }

    // Static assets are read-only; only the app-specific storage API accepts writes.
    if (req.method !== "GET" && req.method !== "HEAD") {
        res.setHeader("Allow", "GET, HEAD");
        return sendError(res, 405, "Method Not Allowed");
    }

    // Every app's `data` folder is private; regular HTTP GET can never serve it.
    // Dotfiles (including temp writes and legacy storage) are also private.
    if (pathname.split("/").some((segment) => segment === "data" || segment.startsWith("."))) {
        return sendError(res, 403, "Forbidden");
    }

    /*
     * Health endpoint
     *
     * http://host:30080/healthz
     * http://host:30080/api/health
     */
    if (pathname === "/healthz" || pathname === "/api/health") {
        const body = JSON.stringify(
            {
                status: "ok",
                node: process.version,
                uptime: process.uptime(),
                root: ROOT,
                time: new Date().toISOString()
            },
            null,
            2
        );

        return send(
            res,
            200,
            body,
            "application/json; charset=utf-8"
        );
    }

    /*
     * Convert the requested URL into a path beneath WEB_ROOT.
     *
     * Example:
     *
     * /councils/styles.css
     *
     * becomes:
     *
     * /srv/www/councils/styles.css
     */
    const filename = path.resolve(
        ROOT,
        "." + pathname
    );

    /*
     * Prevent:
     *
     * /../../etc/passwd
     *
     * and similar attempts to escape WEB_ROOT.
     */
    if (
        filename !== ROOT &&
        !filename.startsWith(ROOT + path.sep)
    ) {
        console.warn(`Blocked path traversal attempt: ${pathname}`);
        return sendError(res, 403, "Forbidden");
    }

    let stats;

    try {
        stats = await statFile(filename);
    } catch (err) {
        if (err.code === "EACCES") {
            console.error(`Permission denied: ${filename}`);
            return sendError(res, 403, "Forbidden");
        }

        if (err.code === "ENOENT") {
            return sendError(res, 404, "Not Found");
        }

        console.error(`stat failed for ${filename}:`, err);
        return sendError(res, 500, "Internal Server Error");
    }

    /*
     * DIRECTORY HANDLING
     *
     * This is important.
     *
     * If:
     *
     *     /councils
     *
     * refers to a directory, redirect it to:
     *
     *     /councils/
     *
     * That allows relative paths in index.html such as:
     *
     *     styles.css
     *     app.js
     *     assets/mark.svg
     *
     * to resolve as:
     *
     *     /councils/styles.css
     *     /councils/app.js
     *     /councils/assets/mark.svg
     */
    if (stats.isDirectory()) {
        if (!pathname.endsWith("/")) {
            let location = pathname + "/";

            // Preserve any query parameters.
            if (url.search) {
                location += url.search;
            }

            res.writeHead(301, {
                "Location": location,
                "Content-Type": "text/plain; charset=utf-8"
            });

            return res.end(
                `Moved permanently to ${location}\n`
            );
        }

        const indexFile = path.join(
            filename,
            "index.html"
        );

        let indexStats;

        try {
            indexStats = await statFile(indexFile);
        } catch (err) {
            if (err.code === "EACCES") {
                console.error(`Permission denied: ${indexFile}`);
                return sendError(res, 403, "Forbidden");
            }

            if (err.code === "ENOENT") {
                return sendError(
                    res,
                    404,
                    "No index.html in directory"
                );
            }

            console.error(`stat failed for ${indexFile}:`, err);
            return sendError(
                res,
                500,
                "Internal Server Error"
            );
        }

        if (!indexStats.isFile()) {
            return sendError(
                res,
                404,
                "index.html is not a file"
            );
        }

        return serveFile(
            req,
            res,
            indexFile,
            indexStats
        );
    }

    /*
     * Reject special filesystem objects.
     */
    if (!stats.isFile()) {
        return sendError(res, 404, "Not Found");
    }

    return serveFile(
        req,
        res,
        filename,
        stats
    );
});

server.on("clientError", (err, socket) => {
    console.error("Client error:", err.message);

    if (socket.writable) {
        socket.end(
            "HTTP/1.1 400 Bad Request\r\n" +
            "Connection: close\r\n" +
            "\r\n"
        );
    }
});

server.listen(PORT, "0.0.0.0", () => {
    console.log("----------------------------------------");
    console.log("TrueNAS Node web server");
    console.log(`Node version: ${process.version}`);
    console.log(`Listening:    0.0.0.0:${PORT}`);
    console.log(`Web root:     ${ROOT}`);
    console.log("----------------------------------------");
});
