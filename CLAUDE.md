# CLAUDE.md — ならクリーン（プロジェクト個別ルール）

グランドルール（TDD 強制）は `~/.claude/CLAUDE.md` を参照。ここには本プロジェクト固有の情報だけを書く。

#解決する課題とグリーンサポート制度の情報
https://www.city.nara.lg.jp/soshiki/4/266266.html
https://www.city.nara.lg.jp/soshiki/20/8253.html
https://www.city.nara.lg.jp/uploaded/attachment/181911.pdf
https://www.city.nara.lg.jp/uploaded/attachment/203695.pdf

## コマンド

```bash
npm test              # Vitest 全件
npx vitest run tests/activity.test.ts   # 単一ファイル
npm run typecheck     # tsc --noEmit
npm run dev           # API(:8787) + Web(:5173)
npm run seed          # data/nara-clean.db にデモデータ再投入
```

## 設計上の約束

- **ビジネスルールは `src/domain/` にしか書かない。** `src/server/` は認証・入力検証・DTO整形のみ。
  新しい業務ルールを足すときは、まず `tests/` に失敗するテストを書き、`src/domain/` に実装する。
- **API は機能ごとに `src/server/routes/` に分ける。** 3人で並行開発するため、1ファイルに集約しない。
  新しいルートを足すときは routes/ にファイルを作り、`app.ts` の配列に1行足すだけにする。
  複数のルートから使う整形処理は `src/server/dto.ts` に置く。
- **活動ワークフローの仕様は `src/domain/activity.ts` の `RULES` テーブルが唯一の正。**
  状態遷移を変えるときはこの表とテストを同時に直す。
- **ドメイン関数はイミュータブル。** 引数のオブジェクトを書き換えず、新しい値を返す（テストで担保済み）。
- **検証順は 状態 → 権限 → 入力値。** 順序を変えるとエラーコード（INVALID_STATE / FORBIDDEN / VALIDATION）が
  変わり、API のステータスコードも変わる。
- ドメインの例外は `DomainError` を継承し、`code` を付ける。HTTP への変換は `src/domain/errors.ts` の
  `HTTP_STATUS_BY_CODE` が行う。

## 環境上の注意

- SQLite は Node 24 標準の `node:sqlite`。ネイティブビルド不要。
- テストはインメモリDB（`createDb(':memory:')`）を使い、`tests/helpers.ts` の `createTestApp()` で組み立てる。
- テストデータの日付は「現在日より未来」にすること。イベントの申込締切判定で落ちる。
