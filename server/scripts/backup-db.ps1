<#
 LouDent local database backup (Windows PowerShell). Run from the server folder:
     powershell -ExecutionPolicy Bypass -File .\scripts\backup-db.ps1
 Writes a dated, complete dump (schema + data) OUTSIDE the project:  %USERPROFILE%\LouDentBackups\
 Reads DB_* from server\.env without printing them. Never put backups in Git or in a ZIP you share.
 Optional: -RestoreCheck  restores the dump into a throw-away database "loudent_restore_check" using the
 MariaDB ROOT account (you are prompted for the root password) to prove the backup is usable, then drops
 only that throw-away database.
#>
param([switch]$RestoreCheck, [string]$OutDir = (Join-Path $env:USERPROFILE 'LouDentBackups'))
$ErrorActionPreference = 'Stop'
$envFile = Join-Path $PSScriptRoot '..\.env'
if (-not (Test-Path $envFile)) { throw "server\.env not found. Create it from .env.example first." }
$cfg = @{}
Get-Content $envFile | ForEach-Object { if ($_ -match '^\s*([A-Z_]+)\s*=\s*(.*)\s*$') { $cfg[$matches[1]] = $matches[2].Trim('"').Trim("'") } }
$db = if ($cfg.DB_NAME) { $cfg.DB_NAME } else { 'loudent' }
$dbHost = if ($cfg.DB_HOST) { $cfg.DB_HOST } else { '127.0.0.1' }
if ($db -ne 'loudent') { throw "Refusing: DB_NAME is '$db'. This script backs up the local 'loudent' database only." }
if ($dbHost -notin @('127.0.0.1', 'localhost', '::1')) { throw "Refusing: DB_HOST '$dbHost' is not local." }
$dump = (Get-Command mariadb-dump -ErrorAction SilentlyContinue)
if (-not $dump) { $dump = (Get-Command mysqldump -ErrorAction SilentlyContinue) }
if (-not $dump) {
  $found = Get-ChildItem 'C:\Program Files\MariaDB*\bin\mariadb-dump.exe' -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($found) { $dump = $found.FullName } else { throw "mariadb-dump not found. Add C:\Program Files\MariaDB <version>\bin to PATH, or use HeidiSQL: Tools > Export database as SQL (all tables, structure + data, one file)." }
} else { $dump = $dump.Source }
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$file = Join-Path $OutDir "loudent-$stamp.sql"
$env:MYSQL_PWD = $cfg.DB_PASSWORD            # kept out of the command line and the output
try {
  & $dump --host=$dbHost --port=$(if ($cfg.DB_PORT) { $cfg.DB_PORT } else { 3306 }) --user=$cfg.DB_USER --single-transaction --routines --events --triggers --default-character-set=utf8mb4 --databases $db --result-file=$file
  if ($LASTEXITCODE -ne 0) { throw "mariadb-dump failed (exit code $LASTEXITCODE)." }
} finally { Remove-Item Env:\MYSQL_PWD -ErrorAction SilentlyContinue }
$item = Get-Item $file
$text = Get-Content $file -Raw
$checks = [ordered]@{
  'file is not empty (> 2 KB)'       = ($item.Length -gt 2048)
  'contains CREATE TABLE statements' = ($text -match 'CREATE TABLE')
  'contains INSERT INTO (data)'      = ($text -match 'INSERT INTO')
  'dump completed marker present'    = ($text -match '-- Dump completed')
}
$checks.GetEnumerator() | ForEach-Object { Write-Host ("{0,-4} {1}" -f $(if ($_.Value) { 'OK' } else { 'FAIL' }), $_.Key) }
if ($checks.Values -contains $false) { throw "Backup verification FAILED. Do not run any cleanup. File: $file" }
Write-Host "`nBackup saved and verified:`n  $file  ($([math]::Round($item.Length/1KB)) KB)`nKeep it private. To restore: see ACCOUNT_SETUP_AND_RECOVERY.md (Restore procedure)."
if ($RestoreCheck) {
  $mysql = (Get-Command mariadb -ErrorAction SilentlyContinue); if (-not $mysql) { $mysql = (Get-Command mysql -ErrorAction SilentlyContinue) }
  if (-not $mysql) { throw 'mariadb client not found in PATH; restore check skipped.' }
  $root = Read-Host 'MariaDB root password (for the throw-away restore check; not stored)' -AsSecureString
  $plain = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($root))
  $env:MYSQL_PWD = $plain
  try {
    $tmp = Join-Path $env:TEMP "loudent-restore-check-$stamp.sql"
    ($text -replace '`loudent`', '`loudent_restore_check`') | Set-Content -Path $tmp -Encoding utf8
    & $mysql.Source -u root -e 'DROP DATABASE IF EXISTS loudent_restore_check;'
    Get-Content $tmp -Raw | & $mysql.Source -u root
    $n = & $mysql.Source -u root -N -e 'SELECT (SELECT COUNT(*) FROM loudent_restore_check.dentists),(SELECT COUNT(*) FROM loudent_restore_check.services),(SELECT COUNT(*) FROM loudent_restore_check.users),(SELECT COUNT(*) FROM loudent_restore_check.appointments);'
    Write-Host "Restore check OK. Rows restored (dentists, services, users, appointments): $n"
    & $mysql.Source -u root -e 'DROP DATABASE loudent_restore_check;'
    Remove-Item $tmp -ErrorAction SilentlyContinue
  } finally { Remove-Item Env:\MYSQL_PWD -ErrorAction SilentlyContinue }
}
