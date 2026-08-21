/** 団体の活動状況（相互確認・ランキング） — 担当: 地図/団体連携班 */
import { Router } from 'express'
import type { Repo } from '../../db/repo.js'
import { pointsToNextRank, rankOf } from '../../domain/points.js'
import { EMPTY_GROUP_STATS, groupStats } from '../dto.js'
import { pathId } from '../http.js'

export function groupsRouter(repo: Repo): Router {
  const router = Router()

  router.get('/groups', (_req, res) => {
    const stats = groupStats(repo)
    res.json(
      repo.listGroups().map((g) => ({
        groupId: g.id,
        name: g.name,
        totalPoints: g.totalPoints,
        rank: rankOf(g.totalPoints),
        createdAt: g.createdAt,
        ...(stats.get(g.id) ?? EMPTY_GROUP_STATS),
      })),
    )
  })

  router.get('/groups/:id', (req, res) => {
    const g = repo.getGroup(pathId(req))
    if (!g) return res.status(404).json({ error: '団体が見つかりません' })

    res.json({
      groupId: g.id,
      name: g.name,
      contact: g.contact,
      totalPoints: g.totalPoints,
      rank: rankOf(g.totalPoints),
      nextRank: pointsToNextRank(g.totalPoints),
      consecutiveMonths: repo.consecutiveMonths(g.id, new Date()),
      ...(groupStats(repo).get(g.id) ?? EMPTY_GROUP_STATS),
      activities: repo.listActivities({ groupId: g.id }),
    })
  })

  return router
}
