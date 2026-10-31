@echo off
rem Builds the price files on this computer (in Israel) and publishes them on the
rem "data" branch, like the GitHub workflow does. Some chains' sites block
rem computers outside Israel, like GitHub's, so this run fills them in; GitHub's
rem run keeps them from here. Windows Task Scheduler runs it every morning
rem (task "Grocery prices", see README). What it did: logs\run-at-home.log
cd /d "%~dp0"
if not exist logs mkdir logs
call :run > logs\run-at-home.log 2>&1
exit /b %errorlevel%

:run
echo %date% %time%
git pull -q --ff-only || echo (no update from GitHub, building with this copy)
if exist previous rmdir /s /q previous
git clone -q --depth 1 --branch data https://github.com/ShaharZuckerman/my-app-prices.git previous || exit /b 1
rem Only the chains that need a computer in Israel; the others are kept from GitHub's run.
set RUN_AT=home
node build.mjs || exit /b 1
cd out
git init -q -b data
git config user.name "price-bot (home)"
git config user.email "price-bot@users.noreply.github.com"
git add -A
git commit -q -m "Prices from home, %date% %time%"
git push -q -f https://github.com/ShaharZuckerman/my-app-prices.git data || exit /b 1
echo Published.
exit /b 0
