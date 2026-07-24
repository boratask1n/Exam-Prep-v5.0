param(
  [string]$BackupRoot = "backups"
)

$ErrorActionPreference = "Stop"
$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$target = Join-Path $repoRoot "$BackupRoot\runtime-$timestamp"
$uploadsPath = Join-Path $repoRoot "artifacts\api-server\uploads"
$envPostgresPath = Join-Path $repoRoot ".env_postgres"
$postgresDb = "exam_prep"
$postgresUser = "postgres"

if (Test-Path $envPostgresPath) {
  Get-Content $envPostgresPath | ForEach-Object {
    if ($_ -match "^POSTGRES_DB=(.+)$") { $script:postgresDb = $matches[1].Trim() }
    if ($_ -match "^POSTGRES_USER=(.+)$") { $script:postgresUser = $matches[1].Trim() }
  }
}

New-Item -ItemType Directory -Force -Path $target | Out-Null

Write-Host "[1/3] PostgreSQL container kontrol ediliyor..."
docker compose -f (Join-Path $repoRoot "docker-compose.yml") up -d postgres | Out-Host

Write-Host "[2/3] Veritabani yedegi aliniyor..."
docker exec exam-prep-postgres pg_dump -U $postgresUser -d $postgresDb --format=custom --file=/tmp/exam_prep.dump
docker cp exam-prep-postgres:/tmp/exam_prep.dump (Join-Path $target "exam_prep.dump")
docker exec exam-prep-postgres rm -f /tmp/exam_prep.dump | Out-Null

Write-Host "[3/3] Uploads yedegi aliniyor..."
if ((Test-Path $uploadsPath) -and (Get-ChildItem -LiteralPath $uploadsPath -Force -ErrorAction SilentlyContinue)) {
  Compress-Archive -Path (Join-Path $uploadsPath "*") -DestinationPath (Join-Path $target "uploads.zip") -Force
} else {
  New-Item -ItemType Directory -Force -Path $uploadsPath | Out-Null
  "Uploads klasoru yedek sirasinda bostu." | Set-Content -Encoding UTF8 (Join-Path $target "uploads-empty.txt")
}

@"
Exam Prep runtime backup
Created: $(Get-Date -Format o)

Files:
- exam_prep.dump: PostgreSQL database dump
- uploads.zip: Uploaded question images/files, if any
"@ | Set-Content -Encoding UTF8 (Join-Path $target "README.txt")

Write-Host ""
Write-Host "Yedek hazir:"
Write-Host $target
