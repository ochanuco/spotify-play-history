# spotify-play-history

Spotify の再生履歴を Cloudflare Worker で取得して BigQuery に貯め、Dataform で整えて Looker Studio で見る。設計は `PLAN.md`。

## 構成

| パス | 中身 |
|---|---|
| `worker/` | 取得の Worker（TypeScript、wrangler） |
| `definitions/`、`workflow_settings.yaml` | Dataform（repo の root に置く必要がある） |
| `infra/envs/prod/` | BigQuery の dataset・表・権限、Dataform の repository（OpenTofu） |

## 開発

```sh
cd worker
pnpm install
pnpm run typecheck && pnpm test
```

Dataform の compile: `npx @dataform/cli@3.0.46 compile .`

## デプロイ

- Worker: `main` に push すると `.github/workflows/deploy.yml` がデプロイする。secret は 1Password の `gh-deploy/spotify-play-history` から毎回すべて反映する
- infra: `op run --env-file=infra/envs/prod/.env.op -- tofu -chdir=infra/envs/prod apply`。state は R2 の `chabatake-tfstate` の `spotify-play-history/chanuco/terraform.tfstate`
- Dataform: `main` を毎時 compile して実行する。手で流すときは BigQuery の画面の Dataform から

## 初めて動かすとき・取り直すとき

### Spotify の refresh token

Spotify for Developers の app の Redirect URIs に `http://127.0.0.1:8888/callback` を登録してから実行する。

```sh
SPOTIFY_CLIENT_ID=... SPOTIFY_CLIENT_SECRET=... node worker/scripts/authorize.ts
```

出てきた token を 1Password の `gh-deploy/spotify-play-history` の `spotify_refresh_token` に入れ、deploy workflow を手で流す。Worker は secret が変わったことを見て、新しい token に切り替える。

### Dataform の git の token

GitHub の fine-grained PAT（この repo の Contents を読むだけ）を作り、Secret Manager に入れる。

```sh
gcloud secrets versions add spotify-play-history-dataform-git-token --project=chanuco --data-file=-
```

## Looker Studio

BigQuery の `chanuco` に接続し、`spotify_mart` の表と view をデータソースにする。アルバムのジャケットは、`album_image_url` の型を「画像の URL」にすると表に出る。
