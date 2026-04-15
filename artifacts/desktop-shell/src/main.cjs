const { app, BrowserWindow, Menu, ipcMain, shell } = require("electron");
const fs = require("node:fs");
const path = require("node:path");

const DEFAULT_SERVER_URL = process.env.EXAM_PREP_SERVER_URL || "http://127.0.0.1:24486";
let mainWindow = null;

function serverConfigPath() {
  return path.join(app.getPath("userData"), "server-url.txt");
}

function normalizeServerUrl(raw) {
  const value = String(raw || "").trim().replace(/\/+$/, "");
  if (!value) return DEFAULT_SERVER_URL;
  if (!/^https?:\/\//i.test(value)) return `http://${value}`;
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

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function connectionHtml(currentUrl, message = "Sunucuya bağlanılamadı.") {
  const safeUrl = escapeHtml(currentUrl);
  const safeMessage = escapeHtml(message);
  return `<!doctype html>
<html lang="tr">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Exam Prep Bağlantı</title>
  <style>
    :root { color-scheme: light dark; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: radial-gradient(circle at top left, rgba(124, 58, 237, .16), transparent 30%), linear-gradient(135deg, #f8fafc, #eef2ff); color: #111827; }
    main { width: min(560px, calc(100vw - 32px)); border: 1px solid rgba(99,102,241,.18); border-radius: 28px; padding: 28px; background: rgba(255,255,255,.86); box-shadow: 0 30px 90px -50px rgba(15,23,42,.6); backdrop-filter: blur(18px); }
    h1 { margin: 0; font-size: 28px; letter-spacing: -.04em; }
    p { color: #64748b; line-height: 1.55; }
    label { display: block; margin: 18px 0 8px; font-size: 13px; font-weight: 700; color: #475569; }
    input { width: 100%; box-sizing: border-box; border: 1px solid #d8def0; border-radius: 16px; padding: 13px 14px; font-size: 15px; background: #fff; color: #111827; outline: none; }
    input:focus { border-color: #7c3aed; box-shadow: 0 0 0 4px rgba(124,58,237,.12); }
    .actions { display: flex; gap: 10px; margin-top: 18px; flex-wrap: wrap; }
    button { border: 0; border-radius: 999px; padding: 11px 16px; font-weight: 800; cursor: pointer; }
    .primary { background: linear-gradient(135deg, #7c3aed, #ec4899); color: white; }
    .secondary { background: #eef2ff; color: #4338ca; }
    code { border-radius: 8px; padding: 2px 6px; background: rgba(99,102,241,.1); color: #4338ca; }
    @media (prefers-color-scheme: dark) {
      body { background: radial-gradient(circle at top left, rgba(124,58,237,.18), transparent 30%), linear-gradient(135deg, #09090f, #111827); color: #f8fafc; }
      main { background: rgba(15,23,42,.88); border-color: rgba(255,255,255,.1); }
      p, label { color: #b8c2d8; }
      input { background: rgba(255,255,255,.06); color: #f8fafc; border-color: rgba(255,255,255,.12); }
      .secondary { background: rgba(255,255,255,.08); color: #ddd6fe; }
      code { color: #ddd6fe; background: rgba(255,255,255,.08); }
    }
  </style>
</head>
<body>
  <main>
    <h1>Exam Prep sunucusunu bekliyor</h1>
    <p>${safeMessage}</p>
    <p>Bu bilgisayar sunucu olacaksa önce proje klasöründeki <code>BASLAT.bat</code> dosyasını çalıştır. Mac veya başka PC aynı modemde bağlanacaksa sunucu bilgisayarın ağ adresini yaz: <code>http://192.168.x.x:24486</code>.</p>
    <label for="serverUrl">Sunucu adresi</label>
    <input id="serverUrl" value="${safeUrl}" placeholder="http://127.0.0.1:24486" />
    <div class="actions">
      <button class="primary" id="save">Kaydet ve bağlan</button>
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
  const baseUrl = readServerUrl();
  const cacheBustedUrl = `${baseUrl}${baseUrl.includes("?") ? "&" : "?"}_desktop_ts=${Date.now()}`;
  mainWindow.webContents.session
    .clearCache()
    .catch(() => {})
    .finally(() => {
      mainWindow.loadURL(cacheBustedUrl);
    });
}

function createMenu() {
  const template = [
    {
      label: "Exam Prep",
      submenu: [
        { label: "Yenile", accelerator: "CmdOrCtrl+R", click: () => mainWindow?.reload() },
        { label: "Sunucu Adresini Değiştir", click: () => loadConnectionPage("Sunucu adresini buradan değiştirebilirsin.") },
        { type: "separator" },
        { role: "quit", label: "Çık" },
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
    title: "Exam Prep",
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
    const serverUrl = readServerUrl();
    if (!url.startsWith(serverUrl) && !url.startsWith("data:text/html")) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });

  mainWindow.webContents.on("did-fail-load", (_event, _code, description, _validatedUrl, isMainFrame) => {
    if (isMainFrame === false) return;
    loadConnectionPage(`Sunucuya bağlanılamadı: ${description || "bağlantı hatası"}`);
  });

  loadApp();
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

app.whenReady().then(() => {
  createMenu();
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
