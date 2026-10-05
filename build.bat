@echo off
chcp 65001 >nul
setlocal
rem WSL Container Studio のポータブルexeを作成する
cd /d "%~dp0"
if errorlevel 1 goto failed

set "ELECTRON_RUN_AS_NODE="

where node >nul 2>&1
if errorlevel 1 (
  echo [エラー] Node.js が見つかりません。https://nodejs.org/ からインストールしてください。
  goto failed
)
where npm.cmd >nul 2>&1
if errorlevel 1 (
  echo [エラー] npm が見つかりません。Node.js を再インストールしてください。
  goto failed
)

rem 初回は開発用パッケージも含めてインストールする
if not exist "node_modules\.bin\electron-builder.cmd" goto install
if not exist "node_modules\.bin\vite.cmd" goto install
goto build

:install
echo 依存パッケージをインストールしています...
call npm.cmd ci --include=dev
if errorlevel 1 goto failed

:build
echo ポータブルexeを作成しています。初回は数分かかる場合があります...
call npm.cmd run dist
if errorlevel 1 goto failed

echo.
echo [完了] exeを作成しました。保存先: "%~dp0release"
echo releaseフォルダー内の「WSL Container Studio バージョン番号.exe」を実行してください。
pause
exit /b 0

:failed
echo.
echo [エラー] ビルドに失敗しました。上に表示されたエラーを確認してください。
pause
exit /b 1
