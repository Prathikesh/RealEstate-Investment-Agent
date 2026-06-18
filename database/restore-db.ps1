# Restore quebec_realestate database from dump.zip
# Run this from the project root: .\database\restore-db.ps1
#
# Prerequisites:
#   1. PostgreSQL installed (psql and pg_restore in PATH)
#   2. PostGIS extension available
#   3. dump.zip in this same folder

$DB_NAME    = "quebec_realestate"
$DB_USER    = "postgres"
$SCRIPT_DIR = $PSScriptRoot
$ZIP_FILE   = "$SCRIPT_DIR\dump.zip"
$DUMP_FILE  = "$SCRIPT_DIR\dump.sql"

# Auto-find psql if not in PATH
$psqlCmd = Get-Command psql -ErrorAction SilentlyContinue
if ($psqlCmd) {
    $PSQL = $psqlCmd.Source
} else {
    $PSQL = Get-ChildItem "C:\Program Files\PostgreSQL\*\bin\psql.exe" -ErrorAction SilentlyContinue | Select-Object -Last 1 -ExpandProperty FullName
}
if (-not $PSQL) {
    Write-Host "ERROR: psql not found. Install PostgreSQL first." -ForegroundColor Red
    exit 1
}

# Check dump.zip exists
if (-not (Test-Path $ZIP_FILE)) {
    Write-Host "ERROR: dump.zip not found in $SCRIPT_DIR" -ForegroundColor Red
    Write-Host "Ask your teammate to share the dump.zip file and place it in the database\ folder."
    exit 1
}

Write-Host "Restoring database '$DB_NAME'..." -ForegroundColor Cyan

# Step 1: Create the database (ignore error if it already exists)
Write-Host "Creating database..." -ForegroundColor Yellow
& $PSQL -U $DB_USER -c "CREATE DATABASE $DB_NAME;" postgres 2>$null
& $PSQL -U $DB_USER -d $DB_NAME -c "CREATE EXTENSION IF NOT EXISTS postgis;" 2>$null
& $PSQL -U $DB_USER -d $DB_NAME -c "CREATE EXTENSION IF NOT EXISTS postgis_topology;" 2>$null

# Step 2: Extract the zip
Write-Host "Extracting dump.zip..." -ForegroundColor Yellow
if (Test-Path $DUMP_FILE) { Remove-Item $DUMP_FILE }
Expand-Archive -Path $ZIP_FILE -DestinationPath $SCRIPT_DIR -Force

# Step 3: Restore
Write-Host "Importing data (this may take a minute)..." -ForegroundColor Yellow
& $PSQL -U $DB_USER -d $DB_NAME -f $DUMP_FILE

if ($LASTEXITCODE -ne 0) {
    Write-Host "Restore failed. Check the error above." -ForegroundColor Red
    exit 1
}

# Cleanup extracted sql
Remove-Item $DUMP_FILE -ErrorAction SilentlyContinue

Write-Host ""
Write-Host "Done! Database '$DB_NAME' is ready." -ForegroundColor Green
Write-Host "You can now run the backend: cd backend && .\.venv\Scripts\Activate.ps1 && uvicorn app.main:app --reload"
