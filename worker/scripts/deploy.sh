#!/usr/bin/env bash
# 使い方: worker/scripts/deploy.sh production
# CLOUDFLARE_API_TOKEN と Worker の secret は呼び出し側（deploy workflow の op run）が環境変数で渡す。
# secret は毎回すべて反映する。argv に載せないよう --secrets-file で渡す。
# HTTP の入口が無いので、デプロイ後の確認は Gatus の external endpoint spotify_play-history で見る
set -euo pipefail

if [ "${1:-}" != "production" ]; then
  echo "usage: worker/scripts/deploy.sh production" >&2
  exit 2
fi

cd "$(dirname "$0")/.."

secrets=(
  SPOTIFY_CLIENT_ID
  SPOTIFY_CLIENT_SECRET
  SPOTIFY_REFRESH_TOKEN
  GCP_SERVICE_ACCOUNT_KEY
  GATUS_TOKEN
  CF_ACCESS_CLIENT_ID
  CF_ACCESS_CLIENT_SECRET
)

missing=()
for name in CLOUDFLARE_API_TOKEN "${secrets[@]}"; do
  if [ -z "${!name:-}" ]; then
    missing+=("$name")
  fi
done
if [ ${#missing[@]} -gt 0 ]; then
  echo "error: 未設定: ${missing[*]}（.github/deploy/worker.env.op の参照先を確かめる）" >&2
  exit 1
fi

secrets_dir=$(mktemp -d)
trap 'rm -rf "$secrets_dir"' EXIT
secrets_file="$secrets_dir/secrets.json"
(umask 077 && : > "$secrets_file")
# 鍵の JSON は改行を含むので、dotenv ではなく JSON で渡す
jq -n '$ENV | with_entries(select(.key | IN($ARGS.positional[])))' --args "${secrets[@]}" > "$secrets_file"

pnpm exec wrangler deploy --secrets-file "$secrets_file"
