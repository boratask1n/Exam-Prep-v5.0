const fs = require("node:fs");
const path = require("node:path");

const desktopRoot = path.resolve(__dirname, "..");
const releaseDir = path.join(desktopRoot, "release");
const publishRoot = path.join(desktopRoot, "publish", "desktop-updates");
const channelPath = path.join(releaseDir, "channel.json");
const manifestConfigs = [
  {
    platform: "win32",
    manifestName: "latest.yml",
    versionedManifestName: (version) => `latest-${version}.yml`,
  },
  {
    platform: "darwin",
    manifestName: "latest-mac.yml",
    versionedManifestName: (version) => `latest-mac-${version}.yml`,
  },
];

function copyIfExists(sourcePath, targetPath) {
  if (!fs.existsSync(sourcePath)) return false;
  fs.copyFileSync(sourcePath, targetPath);
  return true;
}

function readExistingChannel() {
  if (!fs.existsSync(channelPath)) return null;
  try {
    return JSON.parse(fs.readFileSync(channelPath, "utf8"));
  } catch {
    return null;
  }
}

function parseManifestAssets(raw) {
  const matches = [...raw.matchAll(/(?:^path:|^\s*-\s+url:)\s*([^\r\n]+)/gm)];
  return [...new Set(matches.map((match) => match[1]?.trim()).filter(Boolean))];
}

function readReleaseManifest(config) {
  const manifestPath = path.join(releaseDir, config.manifestName);
  if (!fs.existsSync(manifestPath)) return null;

  const raw = fs.readFileSync(manifestPath, "utf8");
  const version = raw.match(/^version:\s*([^\r\n]+)/m)?.[1]?.trim();
  const assetNames = parseManifestAssets(raw);
  const extraAssets = [];

  if (!version || assetNames.length === 0) {
    throw new Error(`${config.manifestName} icinden surum bilgisi okunamadi.`);
  }

  for (const assetName of assetNames) {
    if (/\.exe$/i.test(assetName)) {
      extraAssets.push(`${assetName}.blockmap`);
    }
  }

  return {
    ...config,
    raw,
    version,
    assetNames: [...new Set([...assetNames, ...extraAssets])],
  };
}

function main() {
  const existingChannel = readExistingChannel();
  const manifests = manifestConfigs
    .map((config) => readReleaseManifest(config))
    .filter(Boolean);

  if (manifests.length === 0) {
    throw new Error("Yayinlanacak desktop manifesti bulunamadi. Once release build alin.");
  }

  if (
    process.argv.includes("--force") === false &&
    manifests.every(
      (manifest) =>
        existingChannel?.platforms?.[manifest.platform]?.published === true &&
        existingChannel?.platforms?.[manifest.platform]?.publishedVersion === manifest.version,
    )
  ) {
    throw new Error(
      "Bulunan tum platform surumleri zaten yayin kanalinda. Desktop uygulamalarinda bildirim gormek icin once ilgili platformun surumunu artirip yeni build alin. Ayni surumu zorla yayinlamak icin --force kullanabilirsiniz.",
    );
  }

  fs.mkdirSync(publishRoot, { recursive: true });
  const nextPlatforms = { ...(existingChannel?.platforms || {}) };
  const publishedAt = new Date().toISOString();

  for (const manifest of manifests) {
    for (const assetName of manifest.assetNames) {
      const sourcePath = path.join(releaseDir, assetName);
      if (!fs.existsSync(sourcePath)) {
        throw new Error(`${assetName} bulunamadi. Once ${manifest.platform} build alin.`);
      }
      fs.copyFileSync(sourcePath, path.join(publishRoot, assetName));
    }

    const versionedManifestName = manifest.versionedManifestName(manifest.version);
    fs.writeFileSync(path.join(publishRoot, manifest.manifestName), manifest.raw, "utf8");
    fs.writeFileSync(path.join(publishRoot, versionedManifestName), manifest.raw, "utf8");
    fs.writeFileSync(path.join(releaseDir, versionedManifestName), manifest.raw, "utf8");

    nextPlatforms[manifest.platform] = {
      published: true,
      publishedVersion: manifest.version,
      latestPath: versionedManifestName,
      publishedAt,
    };
  }

  const windowsChannel = nextPlatforms.win32 || {
    published: false,
    publishedVersion: null,
    latestPath: "latest.yml",
    publishedAt: publishedAt,
  };
  const channel = {
    published: windowsChannel.published,
    publishedVersion: windowsChannel.publishedVersion,
    latestPath: windowsChannel.latestPath,
    publishedAt: windowsChannel.publishedAt,
    platforms: nextPlatforms,
  };

  fs.writeFileSync(path.join(publishRoot, "channel.json"), JSON.stringify(channel, null, 2), "utf8");
  fs.writeFileSync(path.join(releaseDir, "channel.json"), JSON.stringify(channel, null, 2), "utf8");

  console.log(`Hazirlandi: ${publishRoot}`);
  for (const manifest of manifests) {
    console.log(`${manifest.platform}: ${manifest.version}`);
  }
  console.log("Sunucunun servis ettigi release klasoru da guncellendi.");
}

try {
  main();
} catch (error) {
  console.error(`[HATA] ${error.message}`);
  process.exit(1);
}
