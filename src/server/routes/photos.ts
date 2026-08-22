/**
 * 活動報告に添付する写真のアップロード・配信 — 担当: (未定)
 *
 * 認可仕様:
 * - 投稿（POST）: 活動を所有する団体のみ（他団体・個人メンバー・市職員は 403 / FORBIDDEN）
 * - 閲覧（GET）: 活動が確認済み（verified/paid）なら全ロール、それ以外は所有団体と市職員のみ
 *   （`GET /activities/:id` に存在する「一覧は絞るが詳細は素通り」という既知の穴を、
 *   写真の配信では作らないこと）
 * - パストラバーサル対策として isSafePhotoFileName を必ず通すこと（実体は photo-store.ts 側）
 *
 * 検証順は 状態（活動の存在） → 権限（認可） → 入力値 の順に統一する。
 */
import { Router, type Request } from 'express'
import { z } from 'zod'
import type { Repo } from '../../db/repo.js'
import type { Activity } from '../../domain/types.js'
import { PhotoError } from '../../domain/photo.js'
import { readPhoto, savePhotos } from '../photo-store.js'

const photosBodySchema = z.object({
  photos: z.array(z.string()),
})

/** Express 5 の型では params が string|string[] になるため、ここで正規化する */
function param(req: Request, name: string): string {
  const raw = req.params[name]
  return Array.isArray(raw) ? (raw[0] ?? '') : (raw ?? '')
}

/** 活動を所有する団体かどうか */
function isOwnerGroup(req: Request, activity: Activity): boolean {
  return req.user.role === 'group' && req.user.groupId === activity.groupId
}

/** 確認済み（verified/paid）は全ロールに公開してよい状態 */
function isPublished(activity: Activity): boolean {
  return activity.status === 'verified' || activity.status === 'paid'
}

export function photosRouter(repo: Repo): Router {
  const router = Router()

  router.post('/activities/:id/photos', (req, res, next) => {
    try {
      const activity = repo.getActivity(param(req, 'id'))
      if (!activity) return res.status(404).json({ error: '活動が見つかりません' })

      // 報告するのは所有団体のみ。他団体・個人メンバー・市職員は投稿できない
      if (!isOwnerGroup(req, activity)) {
        throw new PhotoError('FORBIDDEN', 'この活動の写真を投稿できるのは所有団体のみです')
      }

      const parsed = photosBodySchema.safeParse(req.body)
      if (!parsed.success) {
        throw new PhotoError('VALIDATION', '写真の入力内容が不正です')
      }

      const urls = savePhotos(activity.id, parsed.data.photos)
      res.status(201).json({ urls })
    } catch (err) {
      next(err)
    }
  })

  router.get('/photos/:activityId/:fileName', (req, res, next) => {
    try {
      const activityId = param(req, 'activityId')
      const fileName = param(req, 'fileName')

      const activity = repo.getActivity(activityId)
      if (!activity) return res.status(404).json({ error: '活動が見つかりません' })

      // 審査中など未確認の活動は、所有団体・市職員以外に見せない
      // （一覧では絞っているのに詳細取得が素通りする、という既知の穴を再発させない）
      if (!isPublished(activity) && !isOwnerGroup(req, activity) && req.user.role !== 'city') {
        throw new PhotoError('FORBIDDEN', 'この活動の写真を閲覧する権限がありません')
      }

      const photo = readPhoto(activityId, fileName)
      if (!photo) return res.status(404).json({ error: '写真が見つかりません' })

      res.status(200).type(photo.mime).send(Buffer.from(photo.bytes))
    } catch (err) {
      next(err)
    }
  })

  return router
}
