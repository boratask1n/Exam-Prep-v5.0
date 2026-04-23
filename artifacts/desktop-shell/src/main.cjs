const { app, BrowserWindow, Menu, ipcMain, shell, protocol, net, dialog } = require("electron");
const { autoUpdater } = require("electron-updater");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const APP_ORIGIN = "exam-prep://app";
const DEFAULT_SERVER_URL = process.env.EXAM_PREP_SERVER_URL || "https://examduck.mooo.com";
const NETWORK_TIMEOUT_MS = 18_000;
const UPDATE_CHECK_DELAY_MS = 5_000;
const CACHEABLE_CONTENT_TYPES = [
  "application/json",
  "image/",
  "text/plain",
  "application/xml",
];

let mainWindow = null;
let autoUpdatesConfigured = false;
let manualUpdateCheck = false;

protocol.registerSchemesAsPrivileged([
  {
    scheme: "exam-prep",
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true,
    },
  },
]);

function serverConfigPath() {
  return path.join(app.getPath("userData"), "server-url.txt");
}

function cacheRoot() {
  return path.join(app.getPath("userData"), "response-cache");
}

function normalizeServerUrl(raw) {
  const value = String(raw || "").trim().replace(/\/+$/, "");
  if (!value) return DEFAULT_SERVER_URL;
  if (!/^https?:\/\//i.test(value)) return `https://${value}`;
  return value;
}

function readServerUrl() {
  try {
    const saved = fs.readFileSync(serverConfigPath(), "utf8").trim();
    return normalizeServerUrl(saved || DEFAULT_SERVER_URL);
  } catch {
    return normalizeServerUrl(DEFAULT_SERVER_URL);
  }
}

function writeServerUrl(url) {
  const normalized = normalizeServerUrl(url);
  fs.mkdirSync(path.dirname(serverConfigPath()), { recursive: true });
  fs.writeFileSync(serverConfigPath(), normalized, "utf8");
  return normalized;
}

function webRoot() {
  if (app.isPackaged) return path.join(process.resourcesPath, "web");
  return path.join(__dirname, "..", "web");
}

function appIconPath() {
  return path.join(webRoot(), "brand", "exam-duck-logo-256.png");
}

function hash(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function connectionHtml(currentUrl, message = "Sunucuya baglanilamadi.") {
  const safeUrl = escapeHtml(currentUrl);
  const safeMessage = escapeHtml(message);
  return `<!doctype html>
<html lang="tr">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Exam Duck Baglanti</title>
  <style>
    :root { color-scheme: light dark; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: linear-gradient(135deg, #f7fafc, #e8f3ef); color: #101827; }
    main { width: min(560px, calc(100vw - 32px)); border: 1px solid rgba(16,24,39,.12); border-radius: 8px; padding: 28px; background: rgba(255,255,255,.92); box-shadow: 0 30px 90px -55px rgba(16,24,39,.7); }
    h1 { margin: 0; font-size: 28px; }
    p { color: #516070; line-height: 1.55; }
    label { display: block; margin: 18px 0 8px; font-size: 13px; font-weight: 700; color: #445161; }
    input { width: 100%; box-sizing: border-box; border: 1px solid #d6dee8; border-radius: 8px; padding: 13px 14px; font-size: 15px; background: #fff; color: #101827; outline: none; }
    input:focus { border-color: #19865f; box-shadow: 0 0 0 4px rgba(25,134,95,.12); }
    .actions { display: flex; gap: 10px; margin-top: 18px; flex-wrap: wrap; }
    button { border: 0; border-radius: 8px; padding: 11px 16px; font-weight: 800; cursor: pointer; }
    .primary { background: #19865f; color: white; }
    .secondary { background: #eef4f1; color: #126647; }
    code { border-radius: 8px; padding: 2px 6px; background: rgba(25,134,95,.1); color: #126647; }
    @media (prefers-color-scheme: dark) {
      body { background: linear-gradient(135deg, #0c1015, #17211d); color: #f8fafc; }
      main { background: rgba(15,23,42,.92); border-color: rgba(255,255,255,.1); }
      p, label { color: #b8c2d8; }
      input { background: rgba(255,255,255,.06); color: #f8fafc; border-color: rgba(255,255,255,.12); }
      .secondary { background: rgba(255,255,255,.08); color: #bcebd9; }
      code { color: #bcebd9; background: rgba(255,255,255,.08); }
    }
  </style>
</head>
<body>
  <main>
    <h1>Exam Duck sunucusunu bekliyor</h1>
    <p>${safeMessage}</p>
    <p>Uygulama arayuzu bu bilgisayardan acilir. Veriler icin baglanilacak sunucu adresi asagidaki adrestir.</p>
    <label for="serverUrl">Sunucu adresi</label>
    <input id="serverUrl" value="${safeUrl}" placeholder="https://examduck.mooo.com" />
    <div class="actions">
      <button class="primary" id="save">Kaydet ve baglan</button>
      <button class="secondary" id="retry">Tekrar dene</button>
    </div>
  </main>
  <script>
    const input = document.getElementById('serverUrl');
    document.getElementById('save').addEventListener('click', async () => {
      await window.examPrepDesktop.setServerUrl(input.value);
    });
    document.getElementById('retry').addEventListener('click', async () => {
      await window.examPrepDesktop.retry();
    });
    input.addEventListener('keydown', async (event) => {
      if (event.key === 'Enter') await window.examPrepDesktop.setServerUrl(input.value);
    });
  </script>
</body>
</html>`;
}

function loadConnectionPage(message) {
  if (!mainWindow) return;
  const html = connectionHtml(readServerUrl(), message);
  mainWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
}

function loadApp() {
  if (!mainWindow) return;
  mainWindow.loadURL(`${APP_ORIGIN}/`);
}

function resolveWebPath(url) {
  const parsed = new URL(url);
  let pathname = decodeURIComponent(parsed.pathname);

  if (pathname === "/" || pathname === "") pathname = "/index.html";
  if (pathname.endsWith("/")) pathname += "index.html";

  const root = webRoot();
  const requestedPath = path.normalize(path.join(root, pathname));
  if (!requestedPath.startsWith(root)) {
    return path.join(root, "index.html");
  }

  if (fs.existsSync(requestedPath) && fs.statSync(requestedPath).isFile()) {
    return requestedPath;
  }

  return path.join(root, "index.html");
}

async function serveLocalFile(url) {
  const filePath = resolveWebPath(url);
  if (!fs.existsSync(filePath)) {
    return new Response("Desktop web build is missing. Run pnpm run prepare:web.", {
      status: 500,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }

  return net.fetch(pathToFileURL(filePath).toString());
}

function buildTargetUrl(appUrl) {
  const requestUrl = new URL(appUrl);
  const serverUrl = new URL(readServerUrl());
  return new URL(`${requestUrl.pathname}${requestUrl.search}`, serverUrl).toString();
}

function cachePaths(cacheKey) {
  return {
    body: path.join(cacheRoot(), `${cacheKey}.body`),
    meta: path.join(cacheRoot(), `${cacheKey}.json`),
  };
}

function isCacheableResponse(response) {
  const contentType = response.headers.get("content-type") || "";
  if (!response.ok || response.status !== 200) return false;
  return CACHEABLE_CONTENT_TYPES.some((type) => contentType.includes(type));
}

function filteredHeaders(headers) {
  const safeHeaders = {};
  for (const [key, value] of headers.entries()) {
    const lower = key.toLowerCase();
    if (lower === "content-encoding" || lower === "content-length" || lower === "set-cookie") continue;
    safeHeaders[lower] = value;
  }
  safeHeaders["x-exam-prep-desktop-cache"] = "hit";
  return safeHeaders;
}

function requestCacheKey(targetUrl, request) {
  const auth = request.headers.get("authorization") || "";
  return hash(`${targetUrl}\n${hash(auth)}`);
}

async function readCachedResponse(cacheKey) {
  const paths = cachePaths(cacheKey);
  try {
    const [body, metaRaw] = await Promise.all([
      fs.promises.readFile(paths.body),
      fs.promises.readFile(paths.meta, "utf8"),
    ]);
    const meta = JSON.parse(metaRaw);
    return new Response(body, {
      status: meta.status || 200,
      headers: meta.headers || { "content-type": "application/octet-stream" },
    });
  } catch {
    return null;
  }
}

async function writeCachedResponse(cacheKey, response, body) {
  const paths = cachePaths(cacheKey);
  const meta = {
    status: response.status,
    headers: filteredHeaders(response.headers),
    savedAt: new Date().toISOString(),
  };
  await fs.promises.mkdir(cacheRoot(), { recursive: true });
  await Promise.all([
    fs.promises.writeFile(paths.body, body),
    fs.promises.writeFile(paths.meta, JSON.stringify(meta)),
  ]);
}

async function fetchWithTimeout(url, init) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), NETWORK_TIMEOUT_MS);
  try {
    return await net.fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

async function proxyApi(request) {
  const targetUrl = buildTargetUrl(request.url);
  const method = request.method.toUpperCase();
  const headers = new Headers(request.headers);
  headers.delete("host");
  headers.delete("content-length");
  headers.delete("accept-encoding");
  headers.delete("origin");
  headers.delete("referer");

  const init = { method, headers };
  if (method !== "GET" && method !== "HEAD") {
    init.body = Buffer.from(await request.arrayBuffer());
  }

  if (method !== "GET") {
    return fetchWithTimeout(targetUrl, init);
  }

  const cacheKey = requestCacheKey(targetUrl, request);
  const requestPath = new URL(request.url).pathname;
  const isUpload = requestPath.startsWith("/api/uploads/");

  if (isUpload) {
    const cached = await readCachedResponse(cacheKey);
    if (cached) return cached;
  }

  try {
    const response = await fetchWithTimeout(targetUrl, init);
    if (!isCacheableResponse(response)) return response;

    const body = Buffer.from(await response.arrayBuffer());
    await writeCachedResponse(cacheKey, response, body).catch(() => {});
    return new Response(body, {
      status: response.status,
      statusText: response.statusText,
      headers: filteredHeaders(response.headers),
    });
  } catch (error) {
    const cached = await readCachedResponse(cacheKey);
    if (cached) return cached;
    return new Response(`API istegi basarisiz: ${error.message || "baglanti hatasi"}`, {
      status: 502,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }
}

function configureAutoUpdates() {
  if (autoUpdatesConfigured) return;
  autoUpdatesConfigured = true;

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on("update-available", () => {
    if (!manualUpdateCheck) return;
    dialog.showMessageBox(mainWindow, {
      type: "info",
      message: "Yeni surum bulundu",
      detail: "Guncelleme arka planda indiriliyor. Hazir olunca yeniden baslatma secenegi cikacak.",
      buttons: ["Tamam"],
    });
  });

  autoUpdater.on("update-not-available", () => {
    if (!manualUpdateCheck) return;
    manualUpdateCheck = false;
    dialog.showMessageBox(mainWindow, {
      type: "info",
      message: "Guncelleme yok",
      detail: "Exam Duck zaten en guncel surumde.",
      buttons: ["Tamam"],
    });
  });

  autoUpdater.on("error", (error) => {
    if (!manualUpdateCheck) return;
    manualUpdateCheck = false;
    dialog.showMessageBox(mainWindow, {
      type: "warning",
      message: "Guncelleme kontrol edilemedi",
      detail: error?.message || "Guncelleme sunucusuna ulasilamadi.",
      buttons: ["Tamam"],
    });
  });

  autoUpdater.on("update-downloaded", async () => {
    manualUpdateCheck = false;
    const result = await dialog.showMessageBox(mainWindow, {
      type: "info",
      message: "Guncelleme hazir",
      detail: "Yeni surum indirildi. Uygulama yeniden baslatildiginda guncelleme kurulacak.",
      buttons: ["Yeniden baslat ve kur", "Sonra"],
      defaultId: 0,
      cancelId: 1,
    });

    if (result.response === 0) {
      autoUpdater.quitAndInstall(false, true);
    }
  });
}

function checkForUpdates(manual = false) {
  if (manual) manualUpdateCheck = true;

  if (!app.isPackaged) {
    if (manual) {
      dialog.showMessageBox(mainWindow, {
        type: "info",
        message: "Guncelleme sadece kurulu uygulamada calisir",
        detail: "Gelistirme modunda otomatik guncelleme kontrolu atlandi.",
        buttons: ["Tamam"],
      });
      manualUpdateCheck = false;
    }
    return;
  }

  autoUpdater.checkForUpdates().catch((error) => {
    if (!manualUpdateCheck) return;
    manualUpdateCheck = false;
    dialog.showMessageBox(mainWindow, {
      type: "warning",
      message: "Guncelleme kontrol edilemedi",
      detail: error?.message || "Guncelleme sunucusuna ulasilamadi.",
      buttons: ["Tamam"],
    });
  });
}

function createMenu() {
  const template = [
    {
      label: "Exam Duck",
      submenu: [
        { label: "Yenile", accelerator: "CmdOrCtrl+R", click: () => mainWindow?.reload() },
        {
          label: "Tam Yenile",
          accelerator: "CmdOrCtrl+Shift+R",
          click: async () => {
            await mainWindow?.webContents.session.clearCache();
            mainWindow?.reload();
          },
        },
        {
          label: "Sunucu Adresini Degistir",
          click: () => loadConnectionPage("Sunucu adresini buradan degistirebilirsin."),
        },
        {
          label: "Cache Klasorunu Ac",
          click: () => {
            fs.mkdirSync(cacheRoot(), { recursive: true });
            shell.openPath(cacheRoot());
          },
        },
        {
          label: "Uygulama Cache'ini Temizle",
          click: async () => {
            await fs.promises.rm(cacheRoot(), { recursive: true, force: true }).catch(() => {});
            await mainWindow?.webContents.session.clearCache();
            mainWindow?.reload();
          },
        },
        {
          label: "Guncellemeleri Kontrol Et",
          click: () => checkForUpdates(true),
        },
        { type: "separator" },
        { role: "quit", label: "Cik" },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 940,
    minWidth: 1100,
    minHeight: 720,
    title: "Exam Duck",
    icon: appIconPath(),
    backgroundColor: "#0f1020",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (url.startsWith(APP_ORIGIN) || url.startsWith("data:text/html")) return;
    event.preventDefault();
    shell.openExternal(url);
  });

  mainWindow.webContents.on("did-fail-load", (_event, _code, description, _validatedUrl, isMainFrame) => {
    if (isMainFrame === false) return;
    loadConnectionPage(`Uygulama acilamadi: ${description || "baglanti hatasi"}`);
  });

  loadApp();
  setTimeout(() => checkForUpdates(false), UPDATE_CHECK_DELAY_MS);
}

ipcMain.handle("server-url:get", () => readServerUrl());
ipcMain.handle("server-url:set", (_event, url) => {
  writeServerUrl(url);
  loadApp();
  return readServerUrl();
});
ipcMain.handle("server-url:retry", () => {
  loadApp();
  return readServerUrl();
});
ipcMain.handle("cache:clear", async () => {
  await fs.promises.rm(cacheRoot(), { recursive: true, force: true }).catch(() => {});
  await mainWindow?.webContents.session.clearCache();
  return true;
});

app.whenReady().then(() => {
  configureAutoUpdates();

  protocol.handle("exam-prep", (request) => {
    const url = new URL(request.url);
    if (url.hostname !== "app") {
      return new Response("Not found", { status: 404 });
    }
    if (url.pathname.startsWith("/api/")) {
      return proxyApi(request);
    }
    return serveLocalFile(request.url);
  });

  createMenu();
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
