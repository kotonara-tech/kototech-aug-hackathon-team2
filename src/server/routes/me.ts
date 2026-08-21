/** ログイン中の利用者の情報（ポイント・ランク・参加履歴） */
import { Router } from 'express'
import type { Repo } from '../../db/repo.js'
import { pointsToNextRank, rankOf } from '../../domain/points.js'

export function meRouter(repo: Repo): Router {
  const router = Router()

  router.get('/me', (req, res) => {
    const u = req.user
    res.json({
      id: u.id,
      name: u.name,
      role: u.role,
      groupId: u.groupId,
      groupName: u.groupId ? (repo.getGroup(u.groupId)?.name ?? null) : null,
      age: u.age,
      totalPoints: u.totalPoints,
      rank: rankOf(u.totalPoints),
      nextRank: pointsToNextRank(u.totalPoints),
      history: u.role === 'member' ? repo.listAttendances(u.id) : [],
    })
  })

  return router
}
