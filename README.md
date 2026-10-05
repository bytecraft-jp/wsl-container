# WSL Container Studio

WSL3 に同梱されている **WSL Container CLI (`wslc.exe`)** を GUI で操作する、Electron + Vue 3 製のコンテナー管理アプリです。
WSL2 のディストリビューションや Docker Desktop / Docker Engine は不要です。

## 必要なもの

| 項目 | 内容 |
| --- | --- |
| OS | Windows 11 |
| WSL | WSL 3.0 以降 (`C:\Program Files\WSL\wslc.exe` があること) |
| Node.js | 20.19以降、または22.12以降 (開発時のみ) |

WSL を更新するには、管理者権限の PowerShell で次を実行します。

```powershell
wsl --update
wsl --version   # WSL バージョン: 3.x であることを確認
```

## 起動方法

ダブルクリックで起動する場合は `start.bat`、ポータブルexeを作成する場合は `build.bat` を使います。exeは `release/` に出力されます。

```powershell
npm install
npm run dev      # 開発モード (ホットリロード)
npm start        # ビルドして起動
npm run dist     # Windows ポータブルexe (release/) を作成
npm test         # 単体テスト (test/*.test.cjs)
node test/smoke/gui-editor-smoke.mjs # Vue / CodeMirror の入力・Undo・保存・スクロールを検証
node test/smoke/gui-presets-smoke.cjs # プリセット追加・再読み込み・起動経路を検証（wslc 実行は模擬）
node test/smoke/gui-ubuntu-smoke.cjs --build # 実際の Ubuntu イメージをビルドし、起動・日本語入力・再起動を検証
```

VS Code のターミナルでは `ELECTRON_RUN_AS_NODE=1` が設定されていることがあります。
起動スクリプトはこの変数を自動で外すので、`electron .` を直接実行せず `npm run dev` / `npm start` を使ってください。

アプリとタスクバーのアイコンは `electron/assets/icon.ico` を使います。元デザインの `electron/assets/icon.svg` を変更した場合は `npm run icon` で ICO を再生成し、`npm run dist` で exe を作り直してください。

## 機能

### データの保存先

開発時はプロジェクトルートの `data/`、ポータブルexeではexeと同じフォルダーの `data/` に保存します。exeは書き込み可能なフォルダーに配置してください。

| 内容 | 保存先 |
| --- | --- |
| アプリ設定・暗号化したHubトークン | `data/settings.json` |
| Electronキャッシュ・ログ | `data/electron/` |
| 新規Composeの既定保存先 | `data/compose/` |
| 自作GUIアプリのビルドデータ | `data/gui-builds/` |
| 追加・自作GUIプリセット | `data/gui-presets/` |
| Compose用Dockerfileの既定保存先 | 各 `compose.yaml` と同じフォルダー (既存の `build.context` がある場合はそのフォルダー) |
| イメージ・コンテナー・guestボリューム | `<選択した保存先>/wslc/sessions/<session>/storage.vhdx` (初期値: `data/`) |

Windows標準の `C:\Program Files\WSL\wslc.exe` を利用します。「設定 → イメージ・コンテナーの保存先 → 選択 → 保存先を変更」で任意のフォルダーを指定できます。選択はアプリ再起動後も保持します。アプリで未選択の場合は既存の `%LOCALAPPDATA%\wslc\settings.yaml` の `session.storagePath` を尊重し、未設定の場合のみ `data/` を初期値にします。この設定ファイル自体はWindows側に残り、保存先の変更は同じWindowsユーザーのwslc CLIにも適用されます。元の設定は初回変更時に `.wcs-backup` として保存します。

保存先の変更は次回の既定wslcセッション起動から適用します。稼働中のセッションをアプリから自動終了することはありません。新しい場所でセッションを起動すると、その場所のデータを使うため、空の保存先では既存イメージは一覧に出ません。「見つかった仮想ディスク（実データ）」で旧保存先を確認し、元の保存先へ戻すこともできます。既存データを引き継いで移すには別途移行が必要です。

既存のVHDX・イメージは自動移動されず、以前の場所に残ります。旧アプリ設定は初回起動でコピーします。既存の外部ComposeとWindowsのバインドマウントは元の場所を使い、新規Composeも保存先を選択した場合はその場所を使います。data内のComposeパスは相対パスで記録するため、ルートフォルダーごと移動できます。`data/` はGit管理対象外です。

### VHDX の縮小・最適化

「設定 → イメージ・コンテナーの保存先 → 見つかった仮想ディスク」で、対象ディスクの「縮小・最適化」を選びます。現在の保存先では確認後に対象セッションの空き領域を回収し、セッションを終了して Windows の `CompactVirtualDisk` API で VHDX を縮小します。対象セッションのコンテナー・GUI アプリは停止するので、完了後に必要なものを起動してください。イメージ・ボリュームは削除しません。

実行中のタスクとターミナルは先に終了してください。処理中はアプリからの wslc 操作を一時的に制限し、進行状況を「タスク」に表示します。完了後は実行前後のサイズと削減量を表示します。旧保存先ではセッションを自動停止せず、停止済みの VHDX だけを最適化します。使用中のディスクは処理を拒否します。管理者権限が必要な場合は縮小処理だけを昇格し、Windows の確認画面を表示します。

回収可能な領域がない場合やセッション内の TRIM が使えない場合は、削除済みデータがあってもサイズが減らないことがあります。縮小は Windows の [CompactVirtualDisk](https://learn.microsoft.com/en-us/windows/win32/api/virtdisk/nf-virtdisk-compactvirtualdisk) の仕組みを使います。

### 画面と操作

- **左クリック**で選択します。Ctrl / Shift で複数選択でき、**ダブルクリック**で詳細、**右クリック**で操作メニューが開きます。
- 何もない場所を右クリックすると、その画面全体の操作 (新規作成・整理など) が出ます。
- キーボード操作: `F5` 更新、`Delete` 削除、`Enter` ログ、`Ctrl+A` 全選択、`Esc` 閉じる、`Ctrl+S` 保存 (Compose)。

| 画面 | できること |
| --- | --- |
| ダッシュボード | 稼働状況、CPU / メモリ、WSL のバージョン情報、クイック操作 |
| コンテナー | 開始・停止・再起動・強制終了・削除 (一括可)、ログ (検索・保存)、ターミナル、統計グラフ、Inspect、ファイルコピー、tar エクスポート、ネットワーク接続、同じ設定で再実行 |
| イメージ | 取得、Dockerfile の作成・編集・保存、Dockerfile からビルド、タグ付け、プッシュ、tar 保存 / 読み込み、一時コンテナーでシェル、整理 |
| ボリューム | 作成 (guest / vhd)、中身をシェルで確認、マウントして実行、整理 |
| ネットワーク | 作成 (サブネット指定可)、コンテナーの接続 / 切断、整理 |
| Docker Hub | 検索、README 表示、タグ一覧、右クリックで取得・実行・Compose に追加、マイリポジトリ |
| Compose | GUI / 分割 / テキストの 3 モードで編集、テンプレート、実行プランの確認、up / stop / restart / down / pull / build |
| GUI アプリ | Firefox・Google Chrome・Ubuntu デスクトップなどのプリセット、apt パッケージから自作 GUI アプリをビルド |
| ターミナル | 複数タブ。実行中コンテナーへの接続、一時コンテナー |
| 設定 | wslc の状態、セッション、Docker Hub トークン、wslc の設定ファイル |

### Compose について

`wslc` には compose コマンドがないため、アプリ内の compose エンジン ([electron/compose/core.cjs](electron/compose/core.cjs)) が `compose.yaml` を解釈し、`wslc network create` → `volume create` → `pull/build` → `run` を依存関係順に実行します。

- 対応: `image` `build` `command` `entrypoint` `environment` `env_file` `.env` の変数展開 `ports` `volumes` `networks` `depends_on` (`service_healthy` / `service_completed_successfully` の待機を含む) `healthcheck` `container_name` `working_dir` `user` `hostname` `tty` `stdin_open` `shm_size` `mem_limit` `cpus` `deploy.resources` `gpus` `tmpfs` `dns` `ulimits` `stop_signal` `stop_grace_period` `labels`
- 未対応 (警告を出して無視): `restart` `privileged` `cap_add` `extra_hosts` `devices` など。`wslc run` に該当オプションがないためです。
- 設定が変わっていないサービスは再作成しません (設定のハッシュをラベルに保存して比較)。
- GUI で編集すると YAML のコメントは失われます。コメントを残したい場合はテキストモードで編集してください。

### Dockerfile の作成・編集

通常の CLI アプリ・サーバー用 Dockerfile は「Compose」または「イメージ」画面の「Dockerfile を作成・編集」から作成します。Compose 画面では開いているプロジェクトを使い、イメージ画面では参照元の Compose プロジェクトを選択します。既定では `compose.yaml` と同じフォルダーの `Dockerfile` に保存し、選択サービスに `build.context` / `build.dockerfile` があればその参照先を使います。エディターには Compose のサービスに貼り付ける `build` 設定を表示します。Ubuntu・Alpine・空のテンプレート、既存ファイルの編集、Ctrl+S 保存、下書き保持に対応しています。保存によってビルドは実行されません。

### GUI アプリについて

wslc のコンテナーには WSLg (X11 / Wayland) のソケットが渡されません (実機で確認済み)。
そこでコンテナー内で noVNC などの Web 画面を動かし、アプリ内のビューアーウィンドウで表示します。

- 全9プリセットは、[共通の Ubuntu ベース](electron/gui/presets/ubuntu-base/Dockerfile)（`FROM ubuntu:22.04`）にアプリをインストールした Dockerfile です。各アプリの Dockerfile は「`FROM wcs-gui/ubuntu-base:22.04` → `apt-get install` → `CMD` に起動コマンド」の形で、個別の起動用スクリプトは持ちません。「起動」でベース → アプリの順に自動ビルドします。
- ベースに入れているのは、日本語ロケール・日本語フォント・TigerVNC/noVNC（コンテナー側5800）・Fcitx5＋Mozc だけです。[gui-session.sh](electron/gui/presets/ubuntu-base/gui-session.sh) が画面と日本語入力を起動し、`CMD` のアプリを一般ユーザー（uid 1000、ホーム `/config`＝設定ボリューム）で実行します。アプリを終了するとコンテナーも停止します。
- 日本語入力は Windows と同じ **「半角／全角」キー**で切り替えます。ローマ字で入力し、`Space` で変換、`Enter` で確定します。設定は [fcitx5/](electron/gui/presets/ubuntu-base/fcitx5/) にあります。
- [Firefox](electron/gui/presets/firefox/Dockerfile) は Mozilla 公式 APT リポジトリー、[Chrome](electron/gui/presets/chrome/Dockerfile) は Google 公式 `.deb`、[VS Code](electron/gui/presets/vscode/Dockerfile) は [Microsoft 公式 APT リポジトリー](https://code.visualstudio.com/docs/setup/linux)、その他は Ubuntu の APT パッケージからインストールします。VS Code はデスクトップ版に日本語言語パックを追加し、noVNC で表示します。Chrome と VS Code はコンテナー内でサンドボックスを使えないため `--no-sandbox` で起動します。
- [GNOME](electron/gui/presets/ubuntu-gnome/Dockerfile) は Ubuntu 標準のセッション（ドック付き）、[KDE](electron/gui/presets/ubuntu-kde/Dockerfile)・[XFCE](electron/gui/presets/ubuntu-xfce/Dockerfile) は各デスクトップをそのまま起動します。
- Windows 側ポートは Firefox 5800、Chrome 3100、XFCE 3200、LibreOffice 3300、GNOME 3400、KDE 3500、Thunderbird 5810、FileZilla 5820、VS Code 8443 です。コンテナー名は `wcs-gui-<id>`、設定ボリュームは `wcs-gui-<id>-config` です。
- 同梱プリセットのビルド用ファイルは、ビルドのたびに `data/gui-builds/<id>/` へ作り直します。各カードの「定義ファイル…」「Dockerfile…」でアプリ内のエディターが開き、プリセットのフォルダー内のファイルをタブで切り替えて編集できます（Ctrl+S で保存）。同梱プリセットを保存すると、フォルダーごと `data/gui-presets/<id>/` にコピーしてそちらを編集します（同じ `id` のため同梱定義より優先されます）。
- 「自作 GUI アプリ」も `wcs-gui/ubuntu-base:22.04` をベースに、指定した apt パッケージと起動コマンドで Dockerfile を生成します。
- 自作 GUI アプリの Dockerfile は画面下部で直接編集できます。フォーム変更時は手編集を保持し、ドラフトは画面移動・再起動後も復元します。「保存」または Ctrl+S で `data/gui-builds/<アプリ名>/Dockerfile` と `startapp.sh` を書き出し、「保存してフォルダーを開く」で確認できます。フォームから作り直す場合は「Dockerfile を再生成」を使います。`build.bat` はこの管理アプリの exe を作るためのファイルです。
- 任意のイメージでも、実行ダイアログの「GUI」タブでポートを指定すれば同じビューアーで開けます。compose では `x-wcs-gui: { port: <ホスト側ポート> }` を書きます。

### GUI プリセットをファイルで追加する

「GUI アプリ → プリセットフォルダー」で開く `data/gui-presets/` に、1プリセットにつき1つの YAML / YML / JSON を追加し、「再読み込み」を押します。アプリのコード変更・再ビルドは不要です。

```yaml
id: my-firefox
title: 自分用 Firefox
image: wcs-gui/firefox:latest
port: 5800
hostPort: 3602
guiPath: /vnc.html?autoconnect=1&resize=remote
```

上の例は同梱 Firefox を一度ビルドしてから使います。独自ビルドは `data/gui-presets/<名前>/preset.yaml` と同じフォルダーに Dockerfile を置き、定義に `build: { context: ., requires: [ubuntu-base] }` を追加します。「起動」で共通ベースから順にビルドして実行できます。同梱プリセットも [electron/gui/presets/](electron/gui/presets/) の各フォルダーに `preset.yaml` と Dockerfile をまとめ、コンテナーのイメージ・設定ボリューム・ビューアーの接続先を紐づけています。自作定義に同じ `id` を付けると同梱定義を上書きします。

初回に `data/gui-presets/examples/` へ見本と説明をコピーします。[追加方法と全項目](electron/gui/examples/README.md)を参照してください。自作プリセットは自分のフォルダーをそのままビルドします。定義を変更した後も既存コンテナーは再利用するため、環境変数などを適用する場合は再作成してください。

### Docker Hub の認証

公開イメージの検索と取得に認証は不要です。
プライベートリポジトリやプッシュを使う場合は、設定画面で Docker Hub のユーザー名と Personal Access Token を保存します。
トークンは Electron の `safeStorage` (Windows DPAPI) で暗号化して `data/settings.json` に保存され、`wslc login` には標準入力で渡します。

## 構成

```
electron/
  main.cjs          起動・メインウィンドウ・IPC の登録
  preload.cjs       レンダラーに公開する API (チャンネルを許可リストで制限)
  viewer.cjs        GUI コンテナーを表示するビューアーウィンドウ
  ipc/              IPC ハンドラー (機能ごと)
    context.cjs     共通処理 (エラー変換・VHDX 最適化中の操作制限・共有状態)
    wslc.cjs        wslc 実行・ストリーム・端末
    compose.cjs     Compose 操作
    hub.cjs         Docker Hub・レジストリ
    settings.cjs    設定・保存先・VHDX 縮小
    gui-presets.cjs GUI プリセット
    files.cjs       ファイル・ダイアログ・外部アプリ連携
  services/         wslc.exe 実行、ConPTY 端末、Docker Hub API、設定、パス、ビューアー認証
  compose/
    core.cjs        compose → wslc 変換 (純粋ロジック・単体テストあり)
    engine.cjs      compose エンジンの実行部
  storage/          wslc の保存先・VHDX の縮小 (PowerShell スクリプトを含む)
  gui/
    presets.cjs     GUI プリセットの検証・読み込み・ビルド準備・ファイル編集
    presets/        同梱プリセット (1 フォルダー = preset.yaml + Dockerfile)
      ubuntu-base/  共通ベース: Dockerfile・gui-session.sh (画面／日本語入力の起動)・fcitx5/
      firefox/ chrome/ vscode/ ubuntu-gnome/ ubuntu-kde/ ubuntu-xfce/ libreoffice/ thunderbird/ filezilla/
    examples/       data/gui-presets/examples へ初回コピーする見本
  assets/           アプリアイコン
src/
  views/            各画面
  components/       右クリックメニュー、実行ダイアログ、ターミナル、ログ、エディターなど
  lib/              状態管理、API ラッパー、コンテナー操作
    gui/            GUI プリセット・起動フォーム・ビューアー URL・ビルド・自作アプリの Dockerfile 生成
test/
  *.test.cjs        単体テスト (npm test)
  smoke/            実機 wslc / Electron を使う結合テスト
scripts/
  dev.mjs           起動スクリプト
  cdp.mjs           開発用: DevTools Protocol で画面操作とスクリーンショット
  check-icons.mjs   アイコン名の存在チェック
  generate-icon.mjs アイコン (ICO) の生成
```
