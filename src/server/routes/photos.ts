/**
 * 活動報告に添付する写真のアップロード・配信 — 担当: (未定)
 *
 * 認可仕様（Green フェーズで実装すること。tests/photo-api.test.ts に固定してある）:
 * - 投稿（POST）: 活動を所有する団体のみ（他団体・個人メンバー・市職員は 403 / FORBIDDEN）
 * - 閲覧（GET）: 活動が確認済み（verified/paid）なら全ロール、それ以外は所有団体と市職員のみ
 *   （`GET /activities/:id` に存在する「一覧は絞るが詳細は素通り」という既知の穴を、
 *   写真の配信では作らないこと）
 * - パストラバーサル対策として isSafePhotoFileName を必ず通すこと
 */
import { Router } from 'express'
import type { Repo } from '../../db/repo.js'

export function photosRouter(repo: Repo): Router {
  const router = Router()

  router.post('/activities/:id/photos', (_req, res) => {
    // TODO: Green フェーズで実装する
    void repo
    res.status(501).json({ error: '未実装です' })
  })

  router.get('/photos/:activityId/:fileName', (_req, res) => {
    // TODO: Green フェーズで実装する
    void repo
    res.status(501).json({ error: '未実装です' })
  })

  return router
}
