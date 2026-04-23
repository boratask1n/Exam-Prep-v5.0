const fs = require("node:fs");
const path = require("node:path");

const desktopRoot = path.resolve(__dirname, "..");
const releaseDir = path.join(desktopRoot, "release");
const publishRoot = path.join(desktopRoot, "publish", "desktop-updates");
const latestYmlPath = path.join(releaseDir, "latest.yml");

function readLatestYml() {
  if (!fs.existsSync(latestYmlPath)) {
    throw new Error("latest.yml bulunamadi. Once desktop release alin.");
  }

  const raw = fs.readFileSync(latestYmlPath, "utf8");
  const version = raw.match(/^version:\s*([^\r\n]+)/m)?.[1]?.trim();
  const exeName = raw.match(/^\s*-\s+url:\s*([^\r\n]+)/m)?.[1]?.trim();
  const blockmapName = exeName ? `${exeName}.blockmap` : null;

  if (!version || !exeName) {
    throw new Error("latest.yml icinden surum bilgisi okunamadi.");
  }

  return { raw, version, exeName, blockmapName };
}

function copyIfExists(sourcePath, targetPath) {
  if (!fs.existsSync(sourcePath)) return false;
  fs.copyFileSync(sourcePath, targetPath);
  return true;
}

function main() {
  const { raw, version, exeName, blockmapName } = readLatestYml();
  const exeSource = path.join(releaseDir, exeName);
  const blockmapSource = blockmapName ? path.join(releaseDir, blockmapName) : null;
  const versionedManifestName = `latest-${version}.yml`;
  const channel = {
    published: true,
    publishedVersion: version,
    latestPath: versionedManifestName,
    publishedAt: new Date().toISOString(),
  };

  if (!fs.existsSync(exeSource)) {
    throw new Error(`${exeName} bulunamadi. Once installer build alin.`);
  }

  fs.rmSync(publishRoot, { recursive: true, force: true });
  fs.mkdirSync(publishRoot, { recursive: true });

  fs.writeFileSync(path.join(publishRoot, "latest.yml"), raw, "utf8");
  fs.writeFileSync(path.join(publishRoot, versionedManifestName), raw, "utf8");
  fs.copyFileSync(exeSource, path.join(publishRoot, exeName));
  if (blockmapSource) {
    copyIfExists(blockmapSource, path.join(publishRoot, blockmapName));
  }
  fs.writeFileSync(
    path.join(publishRoot, "channel.json"),
    JSON.stringify(channel, null, 2),
    "utf8",
  );

  fs.writeFileSync(path.join(releaseDir, versionedManifestName), raw, "utf8");
  fs.writeFileSync(
    path.join(releaseDir, "channel.json"),
    JSON.stringify(channel, null, 2),
    "utf8",
  );

  console.log(`Hazirlandi: ${publishRoot}`);
  console.log(`Surum: ${version}`);
  console.log("Sunucunun servis ettigi release klasoru da guncellendi.");
}

try {
  main();
} catch (error) {
  console.error(`[HATA] ${error.message}`);
  process.exit(1);
}
