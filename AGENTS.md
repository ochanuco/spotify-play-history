# AGENTS

このリポジトリは `spotify-play-history` を段階的に構築するための作業場。

## 目的
- Spotifyの再生履歴を定期取得してBigQueryへappend-onlyで蓄積
- Dataformで重複排除・正規化
- Looker Studioで可視化
- GCPインフラはTerraformで管理

## 進め方
- まず `infra/` と `app/` と `dataform/` の骨組みを固める
- 仕様の変更がある場合は `PLAN.md` を更新
- 迷う点（言語選択、実行基盤など）は先に確認する

## 標準ディレクトリ
- `infra/` Terraform
- `app/` 取得Function/Run
- `dataform/` Dataform SQLX
- `skills/` Codex技能

## インフラ操作
- `infra/envs/prod` の state は Cloudflare R2（`chabatake-tfstate`）に置く
- 実行は 1Password 経由: `op run --env-file=infra/envs/prod/.env.op -- tofu -chdir=infra/envs/prod plan`
- サービスアカウント（`spotify-play-history-fn` / `-scheduler` / `-build`）と `roles/bigquery.jobUser` は ochanuco/chabatake が管理する。ここでは作らない

## コーディング方針
- append-only ingestion（重複許容）
- 正しさはDataformで担保
- 機密情報はSecret Manager、コードやstateに含めない

## Codex向け
- 作業前に `PLAN.md` と `skills/spotify-play-history` を確認
- 大きな変更は短い実装計画を提示してから着手
