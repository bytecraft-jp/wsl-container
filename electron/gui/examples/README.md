# GUI プリセットの追加

このフォルダーの `.example` は見本です。そのままでは一覧に表示されません。

- 既存イメージ：同梱 Firefox を一度ビルドしてから、`examples/existing-image.yaml.example` をプリセットフォルダー直下へコピーし、`my-firefox.yaml` に名前を変えてください。
- 自作ビルド：`examples/gimp/` または `examples/my-terminal/` をプリセットフォルダー直下へコピーし、`preset.yaml.example` を `preset.yaml` に名前を変えてください。日本語 Ubuntu 共通ベースへアプリをインストールする Dockerfile を編集できます。

アプリの「GUI アプリ → 再読み込み」を押すと追加されます。コピーだけでコンテナーを起動したりビルドしたりすることはありません。

## ファイル形式

YAML / YML / JSON が使えます。1ファイルに1プリセットを記述します。直下の `*.yaml`・`*.yml`・`*.json`、または1階層下の `preset.yaml`・`preset.yml`・`preset.json` を読み込みます。

必須項目は `id`、`title`、`image`、`port` です。`id` は英小文字・数字・ハイフン・アンダースコアで最大64文字、`port` / `hostPort` は整数で指定します。`id` とホスト側ポートは他のプリセットと重ならない値を使ってください。

| 項目 | 内容 / 既定値 |
| --- | --- |
| `description` | 一覧に表示する説明 |
| `hostPort` | Windows 側ポート。省略時は `port` と同じ |
| `scheme` | `http` / `https`。既定は `http` |
| `guiPath` | ビューアーの開始ページ。共通ベースは `/vnc.html?autoconnect=1&resize=remote` |
| `env` | 環境変数のキーと値。数値・真偽値は文字列に変換 |
| `shm` | 共有メモリーサイズ。例：`1g` |
| `configTarget` | 設定ボリュームをマウントするコンテナー内の場所。既定は `/config` |
| `configVolume` | 設定ボリューム名。既定は `wcs-gui-<id>-config` |
| `containerName` | コンテナー名。既定は `wcs-gui-<id>` |
| `color` | アイコン背景色。`#rrggbb` |
| `order` | 表示順。小さい値から表示。既定は100 |
| `auth` | KasmVNC の自動認証には `kasm` を指定（コンテナー側ポート6901） |
| `build.context` | 定義ファイルからの相対ビルドフォルダー。プリセットフォルダー内を指定 |
| `build.dockerfile` | context 内の Dockerfile。既定は `Dockerfile` |
| `build.requires` | 先にビルドするプリセットの id の配列。例：`[ubuntu-base]` |
| `hidden` | `true` で一覧に出さない。共通ベースなど内部依存用 |
| `readyCommand` | 起動後の準備確認コマンドを文字列配列で指定。例：`["sh", "-c", "test -f /tmp/ready"]` |
| `command` / `entrypoint` / `user` / `workdir` / `network` / `memory` / `cpus` | コンテナーの実行設定（文字列） |
| `volumes` | マウント配列。指定すると既定の設定ボリュームを置き換える。各要素は `source` / `target` / `readonly` |

自作プリセットに同梱プリセットと同じ `id` を付けると、その定義を上書きします。自作ファイル同士で `id` が重複するとエラーを表示します。読み込めないファイルがあっても、他のプリセットは利用できます。

自作プリセットは、そのフォルダーをそのままビルドします。Dockerfile などはこのフォルダー内で編集してください。

同梱の `ubuntu-base` は日本語化した Ubuntu 22.04 です。自作 Dockerfile を `FROM wcs-gui/ubuntu-base:22.04` で始めてアプリを `apt-get install` し、`CMD` に起動コマンド（例：`CMD ["gimp"]`）を書きます。定義へ `build: { context: ., requires: [ubuntu-base] }` を指定すると、共通ベースを先にビルドします。共通ベースが画面 (noVNC) と日本語入力 (Fcitx5 + Mozc、半角/全角キーで切り替え) を起動し、一般ユーザーでアプリを実行します。デスクトップ環境のように自前のウィンドウマネージャーを持つ場合は `ENV GUI_WINDOW_MANAGER=none` を指定します。

既存コンテナーは名前とイメージが一致すれば再利用します。定義の環境変数やマウント先を変更しても、既存コンテナーには自動適用しません。別の `id` / `containerName` / `hostPort` で新規作成するか、停止・削除してから同じ設定ボリュームを使って再作成してください。
