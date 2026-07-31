@echo off
rem ---------------------------------------------------------------------------
rem  Daily DB backup launcher for Windows Task Scheduler.
rem  Registered task: "bizpage-db-backup"  (see README - backup section)
rem
rem  ASCII only on purpose. A .bat file with Korean text breaks depending on the
rem  console code page, and a launcher that dies on its own comments is worse
rem  than no launcher at all. Korean output from node is fine - chcp 65001 below.
rem
rem  The log lives in ai-loop\logs\ (already gitignored). The backup files
rem  themselves go outside the repo - see ai-loop\db_backup.js for why.
rem ---------------------------------------------------------------------------
chcp 65001 >nul
setlocal
set HERE=%~dp0
if not exist "%HERE%logs" mkdir "%HERE%logs"

rem  Prefer the known install path, fall back to PATH so a node upgrade that moves
rem  the exe does not silently turn this into a task that "runs" and backs up nothing.
set NODE="C:\Program Files\nodejs\node.exe"
if not exist %NODE% set NODE=node

pushd "%HERE%.."
echo. >> "%HERE%logs\backup.log"
echo ==== %date% %time% ==== >> "%HERE%logs\backup.log"
%NODE% "ai-loop\db_backup.js" >> "%HERE%logs\backup.log" 2>&1
set CODE=%ERRORLEVEL%
echo exit=%CODE% >> "%HERE%logs\backup.log"
popd

endlocal & exit /b %CODE%
