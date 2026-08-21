---
name: demo-run
description: デモ・動作確認用にアプリを起動する。「デモして」「動かして見せて」「アプリ起動して」「dev サーバー立ち上げて」で使う。npm run seed → npm run dev の順で、API:8787とWeb:5173をconcurrentlyで同時起動する。
---

# /demo-run

デモ・動作確認用にアプリを起動する手順。

## 使い方

```powershell
npm run seed   # data/nara-clean.db にデモデータを再投入
npm run dev    # API(:8787) + Web(:5173) を concurrently で同時起動
```

`npm run dev` は `concurrently -n api,web` で `tsx watch src/server/index.ts`（API）と `vite`（Web）を同時に立てる。
ブラウザは `http://localhost:5173` を開く。

## アカウント切り替え

認証はプロトタイプ用に `x-user-id` ヘッダで代用している（`src/server/http.ts` の `authenticate`）。

| 用途 | x-user-id |
|---|---|
| 市職員 | `u-city` |
| 団体A管理者 | `u-group-a` |
| 団体B管理者 | `u-group-b` |
| 個人会員 | `u-member-1` |

Web 画面では `src/web/api.ts` の `switchUser(id)`（localStorage の `nara-clean:userId` を書き換えてリロード）で切り替わる。

## curl での確認例

```bash
# ヘルスチェック（認証不要）
curl http://localhost:8787/api/health

# 市職員として活動一覧を取得
curl -H "x-user-id: u-city" http://localhost:8787/api/activities

# 団体Aとして活動を新規申請
curl -X POST http://localhost:8787/api/activities \
  -H "x-user-id: u-group-a" -H "Content-Type: application/json" \
  -d '{"title":"デモ清掃","wardId":"saho","scheduledDate":"2026-12-01","location":{"lat":34.697,"lng":135.808,"address":"奈良市法蓮町"},"plannedParticipants":10}'
```

## 停止・トラブル対処

- 停止: `npm run dev` を実行しているターミナルで Ctrl+C（concurrently が API/Web 両方を落とす）
- ポート衝突（:8787 / :5173 が使用中）: 該当プロセスを終了してから再実行する
  ```powershell
  Get-NetTCPConnection -LocalPort 8787 | Select-Object -ExpandProperty OwningProcess | ForEach-Object { Stop-Process -Id $_ -Force }
  ```
- DB を作り直したい: `npm run seed` を再実行すればよい（`data/nara-clean.db` を再投入する）

## 禁止

- `data/` 配下のファイルを手で直接編集すること（必ず `npm run seed` 経由で作る）
- 本番想定のデータ投入（このスキルはデモ・動作確認専用）
