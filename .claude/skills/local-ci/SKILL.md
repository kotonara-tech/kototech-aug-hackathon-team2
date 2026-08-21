---
name: local-ci
description: CI（.github/workflows/ci.yml）を手元で再現する。push 前に必ず /local-ci all を通す。「CIを再現して」「pushして大丈夫か確認」「typecheckだけ」「ビルド確認」で使う。
---

# /local-ci

`.github/workflows/ci.yml` と同じ順序（typecheck → test → build）をローカルで再現する。**push 前に `/local-ci all` を必ず通す。**

## 使い方

サブコマンド（省略時は `all`）:

- `/local-ci typecheck` — `npm run typecheck`（tsc --noEmit）
- `/local-ci test` — `npm test`（vitest run、全件）
- `/local-ci build` — `npm run build`（vite build、本番ビルド）
- `/local-ci all` — 上記を CI と同順で typecheck → test → build

単一テストファイルだけ流したいときは `npx vitest run tests/<file>.test.ts` を直接使う（サブコマンド化しない）。

Windows / PowerShell 5.1 の注意: `&&` は使えないので `;` か `if ($?) { ... }` で繋ぐ。

```powershell
npm run typecheck; if ($?) { npm test }; if ($?) { npm run build }
```

## 出力

Markdown 表で報告する。

| job | status | duration | 件数 |
|---|---|---|---|
| typecheck | pass/fail | 実測 | エラー数 |
| test | pass/fail | 実測 | pass/fail/total 件数 |
| build | pass/fail | 実測 | - |

失敗したジョブがあれば、実出力の末尾（エラーメッセージ部分）をそのまま貼る。省略や要約で誤魔化さない。

## 禁止

- `--no-verify` の使用
- force-push
- テストを緩めて（期待値を書き換えて）通すこと
- ESLint の実行（このリポジトリには未導入。設定ファイルも lint スクリプトも無い）
