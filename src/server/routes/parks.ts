/** 公園マスタ × 清掃実績の可視化 — 担当: 地図/団体連携班 */
import { Router } from 'express'
import type { Repo } from '../../db/repo.js'
import { isNeglected, rankParksByNeglect, type ParkCleanupRecord, type ParkCleanupStatus } from '../../domain/park.js'

/** 市が確認済みの活動のうち、公園に紐づくものだけを清掃実績に変換する */
function toParkCleanupRecords(repo: Repo): ParkCleanupRecord[] {
  return repo
    .listPublishedActivities()
    .filter((a): a is typeof a & { parkId: string } => a.parkId != null)
    .map((a) => ({ parkId: a.parkId, groupId: a.groupId, cleanedOn: a.scheduledDate }))
}

/** 表示用に地区名・最終清掃団体名を付け足す */
function withParkNames(repo: Repo, status: ParkCleanupStatus) {
  return {
    ...status,
    wardName: repo.wardName(status.wardId),
    lastCleanedGroupName: status.lastCleanedGroupId ? (repo.getGroup(status.lastCleanedGroupId)?.name ?? null) : null,
  }
}

/** 全公園を放置度でランク付けし、表示用の名前を付けたものを返す */
function listRankedParks(repo: Repo) {
  const statuses = rankParksByNeglect(repo.listParks(), toParkCleanupRecords(repo), new Date().toISOString())
  return statuses.map((s) => withParkNames(repo, s))
}

export function parksRouter(repo: Repo): Router {
  const router = Router()

  router.get('/parks', (_req, res) => {
    res.json(listRankedParks(repo))
  })

  router.get('/map/parks', (_req, res) => {
    res.json(listRankedParks(repo).filter(isNeglected))
  })

  return router
}
