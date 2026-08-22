/** グリーンサポート制度の年度活動実績 — 登録・更新フォームとは分離して運用する */
import { Router } from 'express'
import type { Repo } from '../../db/repo.js'
import type { WorkType } from '../../domain/types.js'
import { requireRole } from '../http.js'

const WORK_TYPES: WorkType[] = ['cleanup', 'weeding', 'pruning', 'planting', 'other']

export function reportsRouter(repo: Repo): Router {
  const router = Router()

  router.get('/reports/annual', requireRole('city'), (req, res) => {
    const fiscalYear = Number(req.query.fiscalYear)
    if (!Number.isInteger(fiscalYear) || fiscalYear < 2000 || fiscalYear > 2100) {
      return res.status(400).json({ error: '年度を西暦で指定してください' })
    }

    const start = `${fiscalYear}-04-01`
    const end = `${fiscalYear + 1}-04-01`
    const activities = repo
      .listPublishedActivities()
      .filter((activity) => activity.scheduledDate >= start && activity.scheduledDate < end)

    const byWorkType: Record<WorkType, number> = {
      cleanup: 0,
      weeding: 0,
      pruning: 0,
      planting: 0,
      other: 0,
    }
    const groups = new Map<
      string,
      { groupId: string; groupName: string; activityCount: number; participants: number; hours: number; garbageKg: number }
    >()

    for (const activity of activities) {
      const workTypes = activity.report?.workTypes?.length ? activity.report.workTypes : ['cleanup']
      for (const workType of WORK_TYPES) if (workTypes.includes(workType)) byWorkType[workType] += 1

      const row = groups.get(activity.groupId) ?? {
        groupId: activity.groupId,
        groupName: repo.getGroup(activity.groupId)?.name ?? activity.groupId,
        activityCount: 0,
        participants: 0,
        hours: 0,
        garbageKg: 0,
      }
      row.activityCount += 1
      row.participants += activity.report?.actualParticipants ?? 0
      row.hours += activity.report?.hours ?? 0
      row.garbageKg += activity.report?.garbageKg ?? 0
      groups.set(activity.groupId, row)
    }

    res.json({
      fiscalYear,
      totalActivities: activities.length,
      totalParticipants: activities.reduce((sum, activity) => sum + (activity.report?.actualParticipants ?? 0), 0),
      totalHours: activities.reduce((sum, activity) => sum + (activity.report?.hours ?? 0), 0),
      totalGarbageKg: activities.reduce((sum, activity) => sum + (activity.report?.garbageKg ?? 0), 0),
      pickupRequests: activities.filter(
        (activity) => activity.pickupRequest && activity.pickupRequest.status !== 'not_required',
      ).length,
      byWorkType,
      byGroup: [...groups.values()].sort((a, b) => a.groupName.localeCompare(b.groupName, 'ja')),
    })
  })

  return router
}
