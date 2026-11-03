@echo off
setlocal
cd /d "%~dp0"
echo CoursePilot - local USTSpace first-three-course check
 echo Your password is entered ONLY in the official website browser window.
where py >nul 2>&1
if errorlevel 1 (set "COLLECTOR_CREATE_PYTHON=python") else (set "COLLECTOR_CREATE_PYTHON=py -3")
if not exist ".venv\Scripts\python.exe" (
  %COLLECTOR_CREATE_PYTHON% -m venv .venv
  if errorlevel 1 goto setup_failed
)
".venv\Scripts\python.exe" -m pip install -r requirements.txt
if errorlevel 1 goto setup_failed
".venv\Scripts\python.exe" -m playwright install chromium
if errorlevel 1 goto setup_failed
".venv\Scripts\python.exe" collect.py --courses coursepilot-course-codes.json --limit 3
if errorlevel 1 (
 echo Collection stopped or needs attention. Check the saved JSON and terminal message.
) else (
 echo First-three-course check finished. Inspect the JSON before a larger run.
)
pause
exit /b 0
:setup_failed
echo Setup failed. Install Python 3.10+ from https://www.python.org/downloads/ if needed.
echo Keep TLS verification enabled. Read README.md for manual setup steps.
pause
exit /b 1
