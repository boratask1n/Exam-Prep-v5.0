const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const desktopRoot = path.resolve(__dirname, "..");
const repoRoot = path.resolve(desktopRoot, "..", "..");
const trackerRoot = path.join(repoRoot, "artifacts", "yks-tracker");
const sourceDir = path.join(trackerRoot, "dist", "public");
const targetDir = path.join(desktopRoot, "web");
const localPnpm = process.platform === "win32"
  ? path.join(repoRoot, "tools", "bin", "pnpm.cmd")
  : path.join(repoRoot, "tools", "bin", "pnpm");
const pnpmCommand = fs.existsSync(localPnpm) ? localPnpm : "pnpm";

function runBuild() {
  const args = ["--filter", "@workspace/yks-tracker", "run", "build"];
  const command = process.platform === "win32"
    ? `"${pnpmCommand}" ${args.join(" ")}`
    : pnpmCommand;
  const result = spawnSync(
    command,
    process.platform === "win32" ? [] : args,
    {
      cwd: repoRoot,
      stdio: "inherit",
      shell: process.platform === "win32",
    },
  );

  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
}

function copyWebBuild() {
  if (!fs.existsSync(path.join(sourceDir, "index.html"))) {
    throw new Error(`Frontend build not found at ${sourceDir}`);
  }

  fs.rmSync(targetDir, { recursive: true, force: true });
  fs.mkdirSync(targetDir, { recursive: true });
  fs.cpSync(sourceDir, targetDir, { recursive: true });
  console.log(`Copied desktop web assets to ${targetDir}`);
}

runBuild();
copyWebBuild();
