# Export quebec_realestate database to a compressed dump file
# Run this from the project root: .\database\export-db.ps1

$DB_NAME   = "quebec_realestate"
$DB_USER   = "postgres"
$DUMP_FILE = "$PSScriptRoot\dump.sql"
$DUMP_GZ   = "$PSScriptRoot\dump.sql.gz"

# Auto-find pg_dump if not in PATH
$pgCmd = Get-Command pg_dump -ErrorAction SilentlyContinue
if ($pgCmd) {
    $PG_DUMP = $pgCmd.Source
} else {
    $PG_DUMP = Get-ChildItem "C:\Program Files\PostgreSQL\*\bin\pg_dump.exe" -ErrorAction SilentlyContinue | Select-Object -Last 1 -ExpandProperty FullName
}
if (-not $PG_DUMP) {
    Write-Host "ERROR: pg_dump not found. Install PostgreSQL or add its bin folder to PATH." -ForegroundColor Red
    exit 1
}

Write-Host "Exporting database '$DB_NAME'..." -ForegroundColor Cyan

# Remove old files
if (Test-Path $DUMP_FILE) { Remove-Item $DUMP_FILE }
if (Test-Path $DUMP_GZ)   { Remove-Item $DUMP_GZ }

# Dump (schema + data, no owner/privilege statements so any user can restore)
& $PG_DUMP -U $DB_USER -d $DB_NAME --no-owner --no-acl -f $DUMP_FILE

if ($LASTEXITCODE -ne 0) {
    Write-Host "pg_dump failed. Make sure PostgreSQL bin is in PATH and the DB exists." -ForegroundColor Red
    exit 1
}

# Compress with PowerShell's built-in Compress-Archive (as zip)
Compress-Archive -Path $DUMP_FILE -DestinationPath "$PSScriptRoot\dump.zip" -Force
Remove-Item $DUMP_FILE

$size = [math]::Round((Get-Item "$PSScriptRoot\dump.zip").Length / 1MB, 1)
Write-Host ""
Write-Host "Done! File: database\dump.zip ($size MB)" -ForegroundColor Green
Write-Host "Share this file with your team via Google Drive or WeTransfer."
