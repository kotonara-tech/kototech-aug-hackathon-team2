/** 団体間コミュニケーション掲示板 — 担当: 地図/団体連携班 */
import { Router } from 'express'
import { z } from 'zod'
import type { Repo } from '../../db/repo.js'
import { createPost } from '../../domain/board.js'
import { now } from '../http.js'

const postSchema = z.object({
  body: z.string(),
  category: z.enum(['資機材', '共同開催', 'ノウハウ', '雑談', 'お知らせ']),
})

export function boardRouter(repo: Repo): Router {
  const router = Router()

  router.get('/board', (_req, res) => {
    res.json(
      repo.listPosts().map((p) => ({
        ...p,
        groupName: p.groupId ? (repo.getGroup(p.groupId)?.name ?? null) : '奈良市',
      })),
    )
  })

  router.post('/board', (req, res) => {
    const parsed = postSchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: '入力内容を確認してください' })

    // 投稿できるロールの判定はドメイン層（createPost）が行う
    const post = createPost({ actor: req.actor, ...parsed.data }, now())
    repo.savePost(post)
    res.status(201).json(post)
  })

  return router
}
