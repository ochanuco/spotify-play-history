# spotify-play-history

Spotifyの再生履歴をGCPで収集・可視化するためのプロジェクト。

## 目的
- Spotify APIの履歴をBigQueryへappend-onlyで蓄積
- Dataformで重複排除・正規化
- Looker Studioで可視化

## 構成
- `infra/` Terraform
- `app/` 取得アプリ（Cloud Run/Functions）
- `dataform/` Dataform SQLX
- `skills/` Codex技能

## 状態
- 設計: `PLAN.md`
- 初期骨組みのみ（実装はこれから）

## Looker Studio（正攻法）
1. Dataformで `spotify.plays` を更新（重複排除済みファクト）。
2. Looker Studio から BigQuery 接続し、以下をデータソースに使う。
   - 最近再生一覧: `spotify.plays_recent`
   - 曜日×時間帯ヒートマップ: `spotify.listening_by_hour`
   - 月次Topアーティスト: `spotify.top_artists_monthly`
3. ジャケット表示は `album_image_url` を「画像の URL」型に設定する。
