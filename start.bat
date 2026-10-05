@echo off
chcp 65001 >nul
setlocal
rem WSL Container Studio 起動スクリプト (ダブルクリックで起動)
cd /d "%~dp0"

rem VS Code などから継承すると Electron が Node として起動してしまうため外す
set ELECTRON_RUN_AS_NODE=

where node >nul 2>&1
if errorlevel 1 (
  echo [エラー] Node.js が見つかりません。https://nodejs.org/ からインストールしてください。
  pause
  exit /b 1
)

if not exist "C:\Program Files\WSL\wslc.exe" (
  echo [警告] wslc.exe が見つかりません。管理者権限の PowerShell で "wsl --update" を実行して WSL3 に更新してください。
)

if not exist "node_modules\" (
  echo 依存パッケージをインストールしています...
  call npm install
  if errorlevel 1 (
    echo [エラー] npm install に失敗しました。
    pause
    exit /b 1
  )
)

echo WSL Container Studio を起動しています...
call npm start
if errorlevel 1 (
  echo [エラー] 起動に失敗しました。
  pause
  exit /b 1
)
endlocal
