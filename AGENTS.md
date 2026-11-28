# AGENTS

Spotify の再生履歴を Cloudflare Worker で取得し、GCP プロジェクト `chanuco` の BigQuery に貯め、Dataform で整える。設計の正本は `PLAN.md`。設計を変えたら同じ PR で `PLAN.md` も直す。

## 守ること

- raw はやり直せない。取得はカーソルの少し前から読み直して重複を許して書き、重複を除くのは Dataform（`spotify_stg.plays`）でやる。raw の表と `item` の JSON の形は、後から読み直せる形のまま保つ
- 取得が黙って止まると、その期間は二度と埋まらない。Worker の結果は必ず `spotify_ops.runs` と Gatus に届く形にする
- Dataform のファイル（`workflow_settings.yaml`、`definitions/`）は repo の root に置く。Dataform はサブディレクトリを root にできない
- 秘密は 1Password の `gh-deploy/spotify-play-history`（Worker）と Secret Manager（Dataform の git の token）に置く。コード・設定・state には入れない

## 持ち分

- プロジェクト `chanuco`、API、SA（`spotify-play-history-ingest` とその鍵、`spotify-play-history-dataform`）、`roles/bigquery.jobUser`、Gatus の external endpoint と Access、GitHub の Environment は ochanuco/chabatake が持つ。ここでは作らない
- dataset・表・その権限、Dataform の repository と schedule は `infra/envs/prod` が持つ

## 確かめ方

- Worker: `cd worker && pnpm run typecheck && pnpm test && pnpm run build`
- Dataform: `npx @dataform/cli@3.0.46 compile .`
- infra: `op run --env-file=infra/envs/prod/.env.op -- tofu -chdir=infra/envs/prod plan`
