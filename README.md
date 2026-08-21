# ならクリーン — 奈良市 清掃ボランティア支援アプリ

奈良市のごみ清掃ボランティア活動における「アナログ作業のデジタル化」と「若年層の取り込み」を目的としたプロトタイプです。

## 起動

```bash
npm install
npm run dev          # API(:8787) と Web(:5173) を同時起動
```

ブラウザで <http://localhost:5173/> を開きます。初回起動時にデモデータが自動投入されます。

```bash
npm test             # テスト（108件）
npm run typecheck    # 型チェック
npm run build        # 本番ビルド
npm run seed         # デモデータを再投入
```

DB は `data/nara-clean.db`（SQLite）。作り直したい場合はこのファイルを削除してください。

## 画面右上の「表示中」でロールを切り替えられます

| ロール | できること |
| --- | --- |
| 奈良市 清美課 | 申請・報告書の審査、奨励金の支払確定、振込CSV出力 |
| 団体（3団体） | 活動申請・報告書提出、イベント掲載、出席確定、掲示板 |
| 個人（あかり21歳 / ゆうと19歳） | イベント申込、ポイント・ランク確認 |

## 機能と対応する実装

| ご要望の機能 | 実装 |
| --- | --- |
| 活動管理（申請・報告書・写真のデジタル化） | `src/domain/activity.ts` のステートマシン + 活動管理画面 |
| インセンティブの支払い | `src/domain/incentive.ts`（算定・上限）+ 全銀形式CSV出力 |
| イベント募集・参加 | `src/domain/event.ts`（定員・キャンセル待ち・繰り上げ） |
| 団体間の活動状況確認・コミュニケーション | 団体一覧／詳細 + `src/domain/board.ts` の掲示板 |
| 実績・ポイント制 | `src/domain/points.ts`（継続ボーナス・若年層倍率・ランク） |
| マップによる実績可視化 | `src/domain/geo.ts` + Leaflet（活動地点／地区別／メッシュ密度） |

## 業務フロー

```
団体: 申請作成 → 市に申請
   ↓
市:   承認 ─── 却下（理由必須）
   ↓
団体: 活動実施 → 報告書＋写真を提出（写真1枚以上が必須）
   ↓
市:   実績確定 ─── 差し戻し（理由必須・報告書は破棄）
   ↓        ↓ 団体にポイント付与／奨励金を自動算定
市:   支払確定 → 振込CSV出力 → 支払済み
```

状態と権限の対応は `src/domain/activity.ts` の `RULES` テーブルが唯一の仕様です。

## 算定ルール

**団体ポイント**: (参加人数 × 時間 × 10pt + 回収量kg × 5pt) × 継続倍率
継続倍率は連続活動 3か月で1.1／6か月で1.2／12か月以上で1.3（上限）。

**個人ポイント**: 時間 × 30pt × 若年層倍率(29歳以下は1.5) + 初参加100pt + 紹介50pt×最大3人
→ 若年層の参加動機づけを制度として組み込んでいます。

**奨励金**: 基本 ¥3,000 + 回収量 ¥100/kg（1活動上限 ¥30,000／団体の年度上限 ¥200,000）
実送金は行わず、全銀形式に準じたCSVを出力して既存の会計処理に渡す設計です。

## 構成

```
src/
  domain/    ビジネスルール（外部依存なし・テストの中心）
  db/        SQLite 永続化（node:sqlite・ネイティブ依存なし）
  server/    Express API（認証・入力検証・DTO整形のみ）
    routes/  機能ごとのルート定義（並行開発でぶつからないよう分割）
  web/       React + Vite + Leaflet
tests/       Vitest（112件）
```

## チーム開発の進め方

### 担当分け（機能の縦割り）

レイヤーで分けると待ちが発生するため、1人が domain → server → web まで縦に持ちます。

| 担当 | 機能 | 主に触るファイル |
| --- | --- | --- |
| A | 活動管理・インセンティブ | `domain/activity.ts` `domain/incentive.ts` `server/routes/activities.ts` `payments.ts` `web/pages/Activities.tsx` `Payments.tsx` |
| B | イベント募集・ポイント制 | `domain/event.ts` `domain/points.ts` `server/routes/events.ts` `web/pages/Events.tsx` `MyPage.tsx` |
| C | 地図・団体間連携 | `domain/geo.ts` `domain/board.ts` `server/routes/map.ts` `board.ts` `groups.ts` `web/pages/Dashboard.tsx` `Groups.tsx` `Board.tsx` |

3人が同時に触るファイル（コンフリクトしやすい箇所）は次の3つだけです。変更するときは一声かけてください。

- `src/server/app.ts` — ルートを追加したときだけ（1行）
- `src/web/App.tsx` — タブを追加したときだけ（`TABS` 配列）
- `src/db/schema.ts` — テーブルを追加したとき

### ブランチ運用

```bash
git pull --rebase origin main          # 作業開始前に必ず最新化
git switch -c feat/event-waitlist      # 機能ごとにブランチを切る
npm test                               # 緑になってからコミット
git push -u origin feat/event-waitlist # → GitHub で Pull Request
```

ルールは3つだけ。

1. **main に直接 push しない**（PR経由でレビューを1人つける）
2. **`npm test` が緑でないものは PR にしない**
3. **PR は小さく**（1機能・1日以内）。長生きしたブランチほどマージが大変になります

PR を出すと GitHub Actions が型チェック・テスト・ビルドを自動実行します（`.github/workflows/ci.yml`）。

## 本番導入にあたって差し替えが必要な箇所

- **認証**: いまは `x-user-id` ヘッダによる簡易認証。奈良市の共通認証基盤に置き換えてください（`src/server/app.ts` の認証ミドルウェア）。
- **写真**: ファイル名のみを保持。実際には S3 等への保存と、位置情報・撮影日時の検証が必要です。
- **奨励金の額と上限**: `INCENTIVE_RULES` は仮の数値です。実際の要綱に合わせてください。
- **地区マスタ**: 20地区の代表座標のみ。正式な境界ポリゴンを使うと地区別集計の精度が上がります。
