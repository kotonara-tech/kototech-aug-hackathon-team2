/** 地図による実績可視化と市全体の統計 — 担当: 地図/団体連携班 */
import { Router } from 'express'
import type { Repo } from '../../db/repo.js'
import { isOpen } from '../../domain/event.js'
import { aggregateByWard, toHeatCells } from '../../domain/geo.js'
import { round1, toMapActivities } from '../dto.js'

const DEFAULT_CELL_SIZE = 0.01

export function mapRouter(repo: Repo): Router {
  const router = Router()

  router.get('/map/activities', (_req, res) => {
    res.json(toMapActivities(repo))
  })

  router.get('/map/wards', (_req, res) => {
    const wards = new Map(repo.listWards().map((w) => [w.id, w]))
    res.json(
      aggregateByWard(toMapActivities(repo)).map((row) => ({
        ...row,
        wardName: wards.get(row.wardId)?.name ?? row.wardId,
        lat: wards.get(row.wardId)?.lat ?? null,
        lng: wards.get(row.wardId)?.lng ?? null,
      })),
    )
  })

  router.get('/map/heat', (req, res) => {
    const cellSize = Number(req.query.cellSize ?? DEFAULT_CELL_SIZE)
    if (!Number.isFinite(cellSize) || cellSize <= 0) {
      return res.status(400).json({ error: 'cellSize が不正です' })
    }
    res.json(toHeatCells(toMapActivities(repo), cellSize))
  })

  router.get('/wards', (_req, res) => res.json(repo.listWards()))

  router.get('/stats', (_req, res) => {
    const acts = toMapActivities(repo)
    res.json({
      totalActivities: acts.length,
      totalGarbageKg: round1(acts.reduce((s, a) => s + a.garbageKg, 0)),
      totalParticipants: acts.reduce((s, a) => s + a.participants, 0),
      totalGroups: repo.listGroups().length,
      activeWards: new Set(acts.map((a) => a.wardId)).size,
      openEvents: repo.listEvents().filter((e) => isOpen(e, new Date().toISOString())).length,
      pendingReviews: repo.listActivities({ status: 'reported' }).length,
      pendingPayments: repo.listPayments().filter((p) => p.status === 'pending').length,
      pendingPickups: repo
        .listActivities()
        .filter((activity) =>
          activity.pickupRequest
            ? activity.pickupRequest.status === 'requested' || activity.pickupRequest.status === 'scheduled'
            : false,
        ).length,
    })
  })

  return router
}
