いい判断です。
**Dataformは今回のケースに“学習コスパが一番高い”**ですし、設計もきれいに分離できます 👍
以下は **Codexにそのまま投入できる完成版仕様書（Dataform前提）** です。

---

# spotify-play-history

## 仕様書（GCP単体 / Dataform採用 / Terraform管理）

---

## 1. 目的

* Spotify Web API の **Recently Played Tracks（最大50件制限）** を定期取得し、
  **BigQueryに履歴として永続蓄積**する。
* 重複は許容して投入し、**BigQuery上で正規化（dedup）**する。
* 変換・正規化・分析用テーブル作成は **Dataform** に集約する。
* 可視化は **Looker Studio** を使用し、アルバムジャケットは **画像URLを直接表示**する。

---

## 2. 全体アーキテクチャ

```
Spotify API
  ↓
Cloud Scheduler（10分）
  ↓
Cloud Functions / Cloud Run
  ↓（append-only）
BigQuery.spotify_raw.plays_raw
  ↓（Dataform）
BigQuery.spotify.plays
  ↓
Looker Studio
```

---

## 3. 非機能要件

### 3.1 コスト

* 個人GCP利用前提
* Cloud Scheduler：1ジョブ（無料枠）
* 実行基盤：短時間実行、無料枠狙い
* Dataform：利用料なし
* BigQuery：クエリ量を **直近N日処理** に制限

### 3.2 信頼性

* Spotify API制限（50件）を考慮し、**巻き戻し取得**を必須とする
* 取得側は冪等性を持たせない（重複OK）
* 正しさは BigQuery + Dataform が保証する

### 3.3 セキュリティ

* Spotify secrets（client_secret / refresh_token）は
  **Secret Managerで管理**
* Terraform state に secret 実値を含めない

---

## 4. Spotify API 要件

### 4.1 スコープ

* `user-read-recently-played`

### 4.2 エンドポイント

* `GET /v1/me/player/recently-played`

  * `limit=50`
  * `after=<epoch_ms>`

### 4.3 取得フィールド

* `played_at`
* `track.id`
* `track.name`
* `track.duration_ms`
* `track.artists[0].name`
* `track.album.id`
* `track.album.name`
* `track.album.images[]`
* `context.type`（存在すれば）
* `context.uri`（存在すれば）

---

## 5. 取得戦略（重要）

### 5.1 実行頻度

* **10分おき**（5分でも可）

### 5.2 巻き戻し取得

* 前回取得した最大 `played_at` を `last_played_at` として保存
* 次回取得時：

  ```
  after = last_played_at_ms - 120000（2分）
  ```

### 5.3 カーソル管理

* BigQuery `spotify_raw.state` テーブルに保持
* 単一ユーザー前提のため1行のみ

---

## 6. BigQuery データモデル

### 6.1 Dataset

| Dataset       | 用途      |
| ------------- | ------- |
| `spotify_raw` | 生データ    |
| `spotify`     | 正規化・分析用 |

Location：`asia-northeast1`（固定）

---

### 6.2 `spotify_raw.plays_raw`（append-only）

**用途**

* 取得ジョブがそのままINSERTする
* 重複を許容する

**推奨設定**

* partition：`DATE(ingested_at)`
* cluster：`played_at`, `track_id`

**カラム**

| column          | type      |
| --------------- | --------- |
| user_id         | STRING    |
| played_at       | TIMESTAMP |
| track_id        | STRING    |
| track_name      | STRING    |
| artist_name     | STRING    |
| album_id        | STRING    |
| album_name      | STRING    |
| album_image_url | STRING    |
| duration_ms     | INT64     |
| context_type    | STRING    |
| context_uri     | STRING    |
| ingested_at     | TIMESTAMP |
| run_id          | STRING    |

---

### 6.3 `spotify_raw.state`

| column     | type      |
| ---------- | --------- |
| key        | STRING    |
| value      | STRING    |
| updated_at | TIMESTAMP |

* `key = 'last_played_at'`
* value は ISO8601 or epoch ms

---

## 7. Dataform 設計（中核）

### 7.1 Dataform Repository

* 管理対象：**変換・正規化・分析用SQLのみ**
* Git管理（infraとは分離）

### 7.2 モデル：`spotify.plays`

**役割**

* `plays_raw` から重複排除した事実テーブルを生成
* Looker Studio の参照元

**同一再生の定義（uniqueKey）**

```
(user_id, played_at, track_id)
```

**処理要件**

* `ingested_at` は最小値を採用
* 処理対象は **直近2日分** に限定（コスト削減）

**Dataform設定（概念）**

* type: table
* incremental: true
* uniqueKey:

  * user_id
  * played_at
  * track_id

---

### 7.3 将来拡張（任意）

* `listening_by_hour`
* `artists_daily`
* `top_tracks_monthly`

※ すべて Dataform 側で定義

---

## 8. Looker Studio 要件

### 8.1 接続

* BigQuery `spotify.plays`

### 8.2 画像表示

* `album_image_url` を

  * フィールド型「画像URL」
  * または `IMAGE(album_image_url)`

### 8.3 最低限のダッシュボード

* 最近再生一覧（時刻 × ジャケ × 曲名）
* 曜日 × 時間帯ヒートマップ
* Topアーティスト（月次）

---

## 9. Terraform 管理方針

### 9.1 Terraformで管理するもの

* BigQuery datasets / tables
* Cloud Scheduler
* Cloud Functions / Cloud Run
* Service Account
* IAM
* Secret Manager（secret container）
* Dataform Repository / Release / Schedule

### 9.2 Terraformで管理しないもの

* Spotify secrets の **値**
* Dataform SQLコード本体（別Git）

---

## 10. IAM（最小権限）

### 実行用 Service Account

* BigQuery Data Editor（dataset単位）
* BigQuery Job User
* Secret Manager Secret Accessor

---

## 11. 受け入れ条件（Acceptance Criteria）

* Spotify履歴が10分おきに `plays_raw` に蓄積される
* 巻き戻し取得により重複が発生しても `spotify.plays` は一意
* Dataform実行後、Looker Studioで履歴が正しく可視化される
* ジャケット画像がURL経由で表示される

---

## 12. 決め打ちパラメータ（推奨）

| 項目                 | 値    |
| ------------------ | ---- |
| Scheduler interval | 10分  |
| 巻き戻し               | 2分   |
| Dataform処理範囲       | 直近2日 |
| 画像URL              | 64px |

---

## 13. リポジトリ構成（推奨）

```
spotify-play-history/
├── infra/          # Terraform
│   ├── modules/
│   └── envs/prod/
├── app/            # Spotify取得Function
├── dataform/       # Dataform repo（別管理でも可）
└── README.md
```

---

### 補足（設計の意図）

* **取得と変換を完全分離**
* **BigQueryをSingle Source of Truth**
* **Dataformで「分析用に育てていく」前提**

---

この仕様は
👉 **Codexが迷わず実装できる粒度**
👉 **Dataform学習教材としても実戦的**

次にやるならおすすめは：

1. **Dataform側の `plays.sqlx` を設計レビュー**
2. Terraformの **resource一覧だけ洗い出し**
3. Looker Studioの **最初のダッシュボード設計**

どこから詰めます？
