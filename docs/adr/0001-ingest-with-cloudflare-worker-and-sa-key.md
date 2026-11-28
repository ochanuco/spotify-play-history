---
status: accepted
date: 2026-11-28
decision-makers:
  - ochanuco
---

# 再生履歴の取得は Cloudflare Worker で行い、BigQuery へは SA の鍵で書く

## 要約

データを GCP の BigQuery に貯める構成で、10 分ごとの取得をどこで動かすかに対して、Cloudflare Worker の cron で取得から insertAll までを行う案を選び、Cloud Functions を Cloud Scheduler で起動する案と、Worker から Function を呼ぶ案を退けた。Cloud Scheduler の枠を使わず、取得の仕組みを 1 か所にまとめるためで、長く使う SA の鍵を持つことは受け入れる。

## 背景と課題

recently-played API は直近 50 曲しか返さないので、短い間隔で取り続ける必要がある。もとは Cloud Functions を Cloud Scheduler で 10 分ごとに起動していた。Cloud Scheduler の無料の枠は請求先アカウントごとに 3 つで、ほかの用途に残しておきたい。変換（Dataform）は Dataform 自身の schedule で動くので、Scheduler は要らない。

## 判断の決め手

- Cloud Scheduler を使わない
- 取得・状態（カーソルと refresh token）・デプロイを 1 か所で扱える
- 鍵が漏れたときに届く範囲が小さい

## 検討した選択肢

1. Cloud Functions を Cloud Scheduler で起動する
2. Worker の cron が Function を呼び、取得と書き込みは Function が SA で行う
3. Worker が取得から insertAll まで行う

## 決定

選択肢 3 を選ぶ。Workers は Workload Identity Federation に使える ID トークンを出せないので、SA `spotify-play-history-ingest` の鍵を Worker の secret に置く。鍵の権限は `spotify_raw.plays` と `spotify_ops.runs` の表への書き込みだけにする。カーソルと、Spotify が回した refresh token は Workers KV に置く。

### 結果

- 良い点: Cloud Scheduler も、GCP 上で動く取得の仕組みも要らない
- 良い点: refresh token を回されても、KV に書き戻すだけで追従できる
- 悪い点: 期限のない SA の鍵を持つ。回すときは手で作り直し、Worker の secret を入れ替える
- 悪い点: 取得は Cloudflare、データと変換は GCP にあり、見る場所が 2 つになる

## 選択肢ごとの良い点と悪い点

- Function を Scheduler で起動する: 鍵が要らず、GCP の中で完結する。Scheduler の枠を使う。refresh token を回されたときに Secret Manager へ書き戻す権限も要る
- Worker から Function を呼ぶ: 鍵が要らない。Function を公開して共有の secret で守ることになり、動く場所が 2 つに分かれる
