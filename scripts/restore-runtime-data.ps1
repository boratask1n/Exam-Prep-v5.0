param(
  [Parameter(Mandatory = $true)]
  [string]$BackupPath
)

$ErrorActionPreference = "Stop"
$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$backup = Resolve-Path $BackupPath
$dumpPath = Join-Path $backup "exam_prep.dump"
$uploadsZip = Join-Path $backup "uploads.zip"
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

if (-not (Test-Path $dumpPath)) {
  throw "Veritabani yedegi bulunamadi: $dumpPath"
}

Write-Host "[1/4] PostgreSQL baslatiliyor..."
docker compose -f (Join-Path $repoRoot "docker-compose.yml") up -d postgres | Out-Host

Write-Host "[2/4] Veritabani geri yukleniyor..."
docker exec exam-prep-postgres psql -U $postgresUser -d postgres -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '$postgresDb' AND pid <> pg_backend_pid();" | Out-Null
docker cp $dumpPath exam-prep-postgres:/tmp/exam_prep.dump
docker exec exam-prep-postgres pg_restore --clean --if-exists --no-owner -U $postgresUser -d $postgresDb /tmp/exam_prep.dump
docker exec exam-prep-postgres rm -f /tmp/exam_prep.dump | Out-Null

Write-Host "[3/4] Uploads geri yukleniyor..."
New-Item -ItemType Directory -Force -Path $uploadsPath | Out-Null
Get-ChildItem -LiteralPath $uploadsPath -Force -ErrorAction SilentlyContinue | Remove-Item -Recurse -Force -ErrorAction SilentlyContinue
if (Test-Path $uploadsZip) {
  Expand-Archive -Path $uploadsZip -DestinationPath $uploadsPath -Force
}

Write-Host "[4/4] Tamamlandi."
Write-Host "Sonraki adim: BASLAT.bat"
