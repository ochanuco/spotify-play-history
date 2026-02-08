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
