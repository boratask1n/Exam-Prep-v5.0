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
const UPDATE_RECHECK_INTERVAL_MS = 4 * 60 * 60 * 1000;
const CACHEABLE_CONTENT_TYPES = [
  "application/json",
  "image/",
  "text/plain",
  "application/xml",
];

let mainWindow = null;
let autoUpdatesConfigured = false;
let manualUpdateCheck = false;
let updateCheckInterval = null;
let updateState = {
  status: "idle",
  currentVersion: app.getVersion(),
  latestVersion: null,
  downloadUrl: null,
  progressPercent: null,
  checkedAt: null,
  message: null,
  manual: false,
  autoInstallSupported: false,
  isPortable: false,
};

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

function isPortableBuild() {
  return Boolean(
    process.env.PORTABLE_EXECUTABLE_FILE ||
      process.env.PORTABLE_EXECUTABLE_DIR ||
      /portable/i.test(process.execPath),
  );
}

function canAutoInstallUpdates() {
  return app.isPackaged && !isPortableBuild();
}

function getUpdateBaseUrl() {
  try {
    return new URL("/desktop-updates/", readServerUrl()).toString().replace(/\/+$/, "");
  } catch {
    return new URL("/desktop-updates/", DEFAULT_SERVER_URL).toString().replace(/\/+$/, "");
  }
}

function getUpdateChannelUrl() {
  return `${getUpdateBaseUrl()}/channel.json`;
}

function broadcast(channel, payload) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send(channel, payload);
}

function getUpdateState() {
  return {
    ...updateState,
    currentVersion: app.getVersion(),
    autoInstallSupported: canAutoInstallUpdates(),
    isPortable: isPortableBuild(),
    feedUrl: `${getUpdateBaseUrl()}/latest.yml`,
    channelUrl: getUpdateChannelUrl(),
  };
}

function setUpdateState(patch) {
  updateState = {
    ...updateState,
    ...patch,
    currentVersion: app.getVersion(),
    autoInstallSupported: canAutoInstallUpdates(),
    isPortable: isPortableBuild(),
  };
  const snapshot = getUpdateState();
  broadcast("desktop:update-state", snapshot);
  return snapshot;
}

function hash(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;");
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

async function fetchUpdateChannel() {
  const response = await fetchWithTimeout(getUpdateChannelUrl(), {
    headers: { "cache-control": "no-cache", pragma: "no-cache" },
  });

  if (response.status === 404) {
    return {
      published: false,
      latestPath: "latest.yml",
      publishedVersion: null,
      publishedAt: null,
    };
  }

  if (!response.ok) {
    throw new Error(`Guncelleme kanali alinamadi (${response.status})`);
  }

  const payload = await response.json().catch(() => null);
  return {
    published: payload?.published !== false,
    latestPath: typeof payload?.latestPath === "string" ? payload.latestPath : "latest.yml",
    publishedVersion:
      typeof payload?.publishedVersion === "string" ? payload.publishedVersion : null,
    publishedAt: typeof payload?.publishedAt === "string" ? payload.publishedAt : null,
  };
}

function parseManifestValue(text, key) {
  const match = text.match(new RegExp(`^${key}:\\s*['"]?([^\\r\\n'"]+)['"]?\\s*$`, "m"));
  return match ? match[1].trim() : null;
}

function compareVersions(left, right) {
  const a = String(left || "0")
    .split(".")
    .map((part) => Number.parseInt(part, 10) || 0);
  const b = String(right || "0")
    .split(".")
    .map((part) => Number.parseInt(part, 10) || 0);
  const maxLength = Math.max(a.length, b.length);
  for (let index = 0; index < maxLength; index += 1) {
    const diff = (a[index] || 0) - (b[index] || 0);
    if (diff !== 0) return diff > 0 ? 1 : -1;
  }
  return 0;
}

async function fetchRemoteManifest(relativePath = "latest.yml") {
  const feedUrl = new URL(relativePath, `${getUpdateBaseUrl()}/`).toString();
  const response = await fetchWithTimeout(feedUrl, {
    headers: { "cache-control": "no-cache", pragma: "no-cache" },
  });

  if (!response.ok) {
    throw new Error(`Guncelleme bilgisi alinamadi (${response.status})`);
  }

  const text = await response.text();
  const version = parseManifestValue(text, "version");
  const pathValue = parseManifestValue(text, "path");
  const releaseDate = parseManifestValue(text, "releaseDate");

  if (!version || !pathValue) {
    throw new Error("latest.yml dosyasi eksik veya bozuk.");
  }

  return {
    version,
    releaseDate,
    downloadUrl: new URL(pathValue, `${getUpdateBaseUrl()}/`).toString(),
  };
}

async function runManifestUpdateCheck(manual) {
  const channel = await fetchUpdateChannel();
  if (!channel.published) {
    const nextState = setUpdateState({
      latestVersion: null,
      downloadUrl: null,
      checkedAt: new Date().toISOString(),
      manual,
      progressPercent: null,
      message: "Henüz gönderilmiş masaüstü güncellemesi yok.",
      status: "up-to-date",
    });
    return { hasUpdate: false, manifest: null, state: nextState };
  }

  const manifest = await fetchRemoteManifest(channel.latestPath);
  const hasUpdate = compareVersions(manifest.version, app.getVersion()) > 0;
  const nextState = setUpdateState({
    latestVersion: manifest.version,
    downloadUrl: manifest.downloadUrl,
    checkedAt: new Date().toISOString(),
    manual,
    message: hasUpdate
      ? "Yeni surum bulundu."
      : "Exam Duck zaten guncel.",
    status: hasUpdate ? "available" : "up-to-date",
  });
  return { hasUpdate, manifest, state: nextState };
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

  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;
  if (app.isPackaged) {
    try {
      autoUpdater.setFeedURL({ provider: "generic", url: getUpdateBaseUrl() });
    } catch {}
  }

  autoUpdater.on("checking-for-update", () => {
    setUpdateState({
      status: "checking",
      checkedAt: new Date().toISOString(),
      progressPercent: null,
      message: "Guncelleme kontrol ediliyor...",
    });
  });

  autoUpdater.on("update-available", (info) => {
    setUpdateState({
      status: "available",
      latestVersion: info?.version || updateState.latestVersion,
      checkedAt: new Date().toISOString(),
      progressPercent: null,
      message: "Yeni surumu indirmeye hazir.",
    });
  });

  autoUpdater.on("download-progress", (progress) => {
    setUpdateState({
      status: "downloading",
      progressPercent: Math.max(0, Math.min(100, Math.round(progress.percent || 0))),
      message: "Guncelleme arka planda indiriliyor.",
    });
  });

  autoUpdater.on("update-not-available", (info) => {
    manualUpdateCheck = false;
    setUpdateState({
      status: "up-to-date",
      latestVersion: info?.version || updateState.latestVersion || app.getVersion(),
      checkedAt: new Date().toISOString(),
      progressPercent: null,
      message: "Exam Duck zaten guncel.",
    });
  });

  autoUpdater.on("error", (error) => {
    manualUpdateCheck = false;
    setUpdateState({
      status:
        updateState.latestVersion &&
        compareVersions(updateState.latestVersion, app.getVersion()) > 0
          ? "available"
          : "error",
      checkedAt: new Date().toISOString(),
      progressPercent: null,
      message: error?.message || "Guncelleme sunucusuna ulasilamadi.",
    });
  });

  autoUpdater.on("update-downloaded", async () => {
    manualUpdateCheck = false;
    setUpdateState({
      status: "downloaded",
      checkedAt: new Date().toISOString(),
      progressPercent: 100,
      message: "Yeni surum indirildi. Yeniden baslatarak kurabilirsin.",
    });
  });
}

async function checkForUpdates(manual = false) {
  if (manual) manualUpdateCheck = true;

  setUpdateState({
    status: "checking",
    manual,
    checkedAt: new Date().toISOString(),
    progressPercent: null,
    message: "Guncelleme kontrol ediliyor...",
  });

  if (!app.isPackaged) {
    manualUpdateCheck = false;
    setUpdateState({
      status: "up-to-date",
      manual,
      message: "Gelistirme modunda guncelleme kontrolu atlandi.",
    });
    return;
  }

  try {
    if (canAutoInstallUpdates()) {
      try {
        autoUpdater.setFeedURL({ provider: "generic", url: getUpdateBaseUrl() });
      } catch {}
    }
    const manifestResult = await runManifestUpdateCheck(manual);
    if (!manifestResult.hasUpdate) {
      manualUpdateCheck = false;
      return;
    }
    if (!canAutoInstallUpdates()) {
      manualUpdateCheck = false;
      return;
    }
    await autoUpdater.checkForUpdates();
  } catch (error) {
    manualUpdateCheck = false;
    setUpdateState({
      status: "error",
      checkedAt: new Date().toISOString(),
      progressPercent: null,
      message: error?.message || "Guncelleme sunucusuna ulasilamadi.",
    });
  }
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
  mainWindow.webContents.on("did-finish-load", () => {
    broadcast("desktop:update-state", getUpdateState());
  });

  setTimeout(() => {
    void checkForUpdates(false);
  }, UPDATE_CHECK_DELAY_MS);

  if (updateCheckInterval) clearInterval(updateCheckInterval);
  updateCheckInterval = setInterval(() => {
    void checkForUpdates(false);
  }, UPDATE_RECHECK_INTERVAL_MS);
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
ipcMain.handle("desktop:get-meta", () => ({
  currentVersion: app.getVersion(),
  serverUrl: readServerUrl(),
  isPackaged: app.isPackaged,
  autoInstallSupported: canAutoInstallUpdates(),
  isPortable: isPortableBuild(),
}));
ipcMain.handle("desktop:update:get-state", () => getUpdateState());
ipcMain.handle("desktop:update:check", async () => {
  await checkForUpdates(true);
  return getUpdateState();
});
ipcMain.handle("desktop:update:install", async () => {
  const state = getUpdateState();
  if (state.status === "available" && canAutoInstallUpdates()) {
    setUpdateState({
      status: "downloading",
      progressPercent: 0,
      message: "Guncelleme arka planda indiriliyor.",
    });
    await autoUpdater.downloadUpdate();
    return { action: "download" };
  }
  if (state.status === "downloaded" && canAutoInstallUpdates()) {
    setImmediate(() => autoUpdater.quitAndInstall(false, true));
    return { action: "installing" };
  }
  if (state.downloadUrl) {
    await shell.openExternal(state.downloadUrl);
    return { action: "download" };
  }
  return { action: "none" };
});
ipcMain.handle("desktop:sync:check", async (_event, token) => {
  const serverUrl = readServerUrl();
  const checkedAt = new Date().toISOString();
  if (!token) {
    return {
      ok: false,
      status: "missing-token",
      checkedAt,
      serverUrl,
      message: "Oturum bulunamadi.",
    };
  }

  try {
    const response = await fetchWithTimeout(`${serverUrl}/api/auth/me`, {
      headers: { authorization: `Bearer ${token}` },
    });
    if (!response.ok) {
      return {
        ok: false,
        status: response.status === 401 ? "unauthorized" : "server-error",
        checkedAt,
        serverUrl,
        message:
          response.status === 401
            ? "Oturum yeniden dogrulanmali."
            : `Sunucu ${response.status} cevabi verdi.`,
      };
    }

    const payload = await response.json().catch(() => null);
    return {
      ok: true,
      status: "ok",
      checkedAt,
      serverUrl,
      userName: payload?.user?.name || null,
      message: "Senkron hazir.",
    };
  } catch (error) {
    return {
      ok: false,
      status: "offline",
      checkedAt,
      serverUrl,
      message: error?.message || "Sunucuya ulasilamadi.",
    };
  }
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

app.on("before-quit", () => {
  if (updateCheckInterval) clearInterval(updateCheckInterval);
});
