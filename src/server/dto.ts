/**
 * API レスポンス用の整形処理。
 * 複数のルートから使うものだけをここに置く（1箇所でしか使わない整形は各ルートに書く）。
 */
import type { Repo } from '../db/repo.js'
import { isOpen, remainingSeats } from '../domain/event.js'
import type { Activity, MapActivity, VolunteerEvent } from '../domain/types.js'

export function withGroupName(repo: Repo, a: Activity) {
  return { ...a, groupName: repo.getGroup(a.groupId)?.name ?? a.groupId }
}

export function toEventDto(repo: Repo, e: VolunteerEvent) {
  return {
    ...e,
    groupName: repo.getGroup(e.groupId)?.name ?? e.groupId,
    wardName: repo.wardName(e.wardId),
    remainingSeats: remainingSeats(e),
    confirmedCount: e.participants.filter((p) => p.status === 'confirmed').length,
    waitlistCount: e.participants.filter((p) => p.status === 'waitlisted').length,
    isOpen: isOpen(e, new Date().toISOString()),
  }
}

/** 地図に載せるのは市が確認済みの実績のみ */
export function toMapActivities(repo: Repo): MapActivity[] {
  return repo.listPublishedActivities().map((a) => ({
    id: a.id,
    wardId: a.wardId,
    lat: a.location.lat,
    lng: a.location.lng,
    garbageKg: a.report?.garbageKg ?? 0,
    participants: a.report?.actualParticipants ?? 0,
    date: a.scheduledDate,
    title: a.title,
  }))
}

export interface GroupStatsRow {
  activityCount: number
  garbageKg: number
  participants: number
  lastActivityDate: string | null
}

export const EMPTY_GROUP_STATS: GroupStatsRow = {
  activityCount: 0,
  garbageKg: 0,
  participants: 0,
  lastActivityDate: null,
}

/** 団体ごとの実績集計（確認済みの活動のみ） */
export function groupStats(repo: Repo): Map<string, GroupStatsRow> {
  const map = new Map<string, GroupStatsRow>()

  for (const a of repo.listPublishedActivities()) {
    const row = map.get(a.groupId) ?? { ...EMPTY_GROUP_STATS }
    row.activityCount += 1
    row.garbageKg += a.report?.garbageKg ?? 0
    row.participants += a.report?.actualParticipants ?? 0
    if (!row.lastActivityDate || a.scheduledDate > row.lastActivityDate) row.lastActivityDate = a.scheduledDate
    map.set(a.groupId, row)
  }

  return map
}

export function round1(n: number): number {
  return Math.round(n * 10) / 10
}
