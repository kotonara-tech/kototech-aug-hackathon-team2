import { describe, it, expect, beforeEach } from 'vitest'
import request from 'supertest'
import type { Express } from 'express'
import type { Repo } from '@/db/repo'
import type { Activity } from '@/domain/types'
import { createTestApp, AS_CITY, AS_GROUP_A, AS_MEMBER } from './helpers'

let app: Express
let repo: Repo

beforeEach(() => {
  const testApp = createTestApp()
  app = testApp.app
  repo = testApp.repo
})

let seq = 0

/**
 * テスト用の活動を最小構成で組み立てる。
 * DB 層のテストなので domain/activity.ts の状態遷移は経由せず、
 * repo.saveActivity に渡す Activity を直接組み立てる。
 */
function makeActivity(overrides: Partial<Activity> & Pick<Activity, 'groupId' | 'wardId' | 'scheduledDate' | 'status'>): Activity {
  seq += 1
  return {
    id: overrides.id ?? `act-${seq}`,
    groupId: overrides.groupId,
    title: overrides.title ?? 'テスト清掃活動',
    wardId: overrides.wardId,
    scheduledDate: overrides.scheduledDate,
    location: overrides.location ?? { lat: 34.697, lng: 135.808, address: 'テスト住所' },
    plannedParticipants: overrides.plannedParticipants ?? 10,
    status: overrides.status,
    consecutiveMonths: overrides.consecutiveMonths ?? 0,
    report: overrides.report ?? null,
    awardedPoints: overrides.awardedPoints ?? 0,
    rejectionReason: overrides.rejectionReason ?? null,
    submittedAt: overrides.submittedAt ?? null,
    verifiedAt: overrides.verifiedAt ?? null,
    createdAt: overrides.createdAt ?? `${overrides.scheduledDate}T00:00:00.000Z`,
    history: overrides.history ?? [],
    parkId: overrides.parkId,
  }
}

/** 十分に古い日付（1年以上前）: 実行日に依存せず「放置」と判定される */
const OLD_DATE = '2020-01-01'
/** 十分に新しい日付（1年未満）: 実行日に依存せず「直近清掃済み」と判定される */
const RECENT_DATE = '2026-08-15'

/**
 * 未清掃・放置（1年超）・直近清掃済みの3公園を用意する共通シナリオ。
 * park-never: 一度も清掃実績なし
 * park-old:   OLD_DATE に g-a が清掃（放置扱い）
 * park-recent: RECENT_DATE に g-a が清掃（直近扱い）
 */
function seedRankingScenario(): void {
  repo.upsertPark({ id: 'park-never', name: '未清掃公園', wardId: 'saho', lat: 34.697, lng: 135.808 })
  repo.upsertPark({ id: 'park-old', name: '放置公園', wardId: 'saho', lat: 34.699, lng: 135.809 })
  repo.upsertPark({ id: 'park-recent', name: '直近清掃公園', wardId: 'naramachi', lat: 34.678, lng: 135.83 })

  repo.saveActivity(
    makeActivity({
      groupId: 'g-a',
      wardId: 'saho',
      scheduledDate: OLD_DATE,
      status: 'verified',
      parkId: 'park-old',
    }),
  )
  repo.saveActivity(
    makeActivity({
      groupId: 'g-a',
      wardId: 'naramachi',
      scheduledDate: RECENT_DATE,
      status: 'verified',
      parkId: 'park-recent',
    }),
  )
}

describe('GET /api/parks', () => {
  it('未清掃の公園が先頭、以降は最終清掃日の昇順で返る', async () => {
    seedRankingScenario()
    const res = await request(app).get('/api/parks').set(AS_CITY).expect(200)
    expect(res.body.map((p: { parkId: string }) => p.parkId)).toEqual(['park-never', 'park-old', 'park-recent'])
  })

  it('各行に清掃実績の集計値が載る（未清掃は null / 0）', async () => {
    seedRankingScenario()
    const res = await request(app).get('/api/parks').set(AS_CITY).expect(200)
    const byId = new Map(res.body.map((p: { parkId: string }) => [p.parkId, p]))

    expect(byId.get('park-never')).toMatchObject({
      lastCleanedOn: null,
      daysSinceCleaned: null,
      cleanupCount: 0,
      lastCleanedGroupId: null,
    })

    const old = byId.get('park-old') as {
      lastCleanedOn: string
      daysSinceCleaned: number
      cleanupCount: number
      lastCleanedGroupId: string
    }
    expect(old.lastCleanedOn).toBe(OLD_DATE)
    expect(old.cleanupCount).toBe(1)
    expect(old.lastCleanedGroupId).toBe('g-a')
    expect(old.daysSinceCleaned).toBeGreaterThanOrEqual(365)
  })

  it('地区名と最終清掃団体名が引ける', async () => {
    seedRankingScenario()
    const res = await request(app).get('/api/parks').set(AS_CITY).expect(200)
    const byId = new Map(res.body.map((p: { parkId: string }) => [p.parkId, p]))

    expect(byId.get('park-old')).toMatchObject({
      wardName: '佐保',
      lastCleanedGroupName: '佐保川をきれいにする会',
    })
    expect(byId.get('park-never')).toMatchObject({
      wardName: '佐保',
      lastCleanedGroupName: null,
    })
  })

  it('確認済みでない活動（submitted）は清掃実績に数えない', async () => {
    repo.upsertPark({ id: 'park-pending', name: '審査中公園', wardId: 'saho', lat: 34.697, lng: 135.808 })
    repo.saveActivity(
      makeActivity({
        groupId: 'g-a',
        wardId: 'saho',
        scheduledDate: RECENT_DATE,
        status: 'submitted',
        parkId: 'park-pending',
      }),
    )
    repo.saveActivity(
      makeActivity({
        groupId: 'g-a',
        wardId: 'saho',
        scheduledDate: RECENT_DATE,
        status: 'reported',
        parkId: 'park-pending',
      }),
    )

    const res = await request(app).get('/api/parks').set(AS_CITY).expect(200)
    const row = res.body.find((p: { parkId: string }) => p.parkId === 'park-pending')
    expect(row).toMatchObject({ cleanupCount: 0, lastCleanedOn: null, neglect: 'never' })
  })

  it('parkId の無い活動は無視され、エラーにも他の公園の実績にもならない', async () => {
    repo.upsertPark({ id: 'park-loose', name: '無関係公園', wardId: 'saho', lat: 34.697, lng: 135.808 })
    // 既存の活動（parkId 未設定）
    repo.saveActivity(
      makeActivity({
        groupId: 'g-a',
        wardId: 'saho',
        scheduledDate: RECENT_DATE,
        status: 'verified',
      }),
    )

    const res = await request(app).get('/api/parks').set(AS_CITY).expect(200)
    const row = res.body.find((p: { parkId: string }) => p.parkId === 'park-loose')
    expect(row).toMatchObject({ cleanupCount: 0, lastCleanedOn: null })
  })

  it('認証ヘッダが無ければ 401、いずれのロールでも閲覧できる', async () => {
    seedRankingScenario()
    await request(app).get('/api/parks').expect(401)
    await request(app).get('/api/parks').set(AS_CITY).expect(200)
    await request(app).get('/api/parks').set(AS_GROUP_A).expect(200)
    await request(app).get('/api/parks').set(AS_MEMBER).expect(200)
  })
})

describe('GET /api/map/parks', () => {
  it('放置された公園（未清掃 + 1年以上放置）だけを返し、直近清掃済みは含まない', async () => {
    seedRankingScenario()
    const res = await request(app).get('/api/map/parks').set(AS_CITY).expect(200)
    const ids = res.body.map((p: { parkId: string }) => p.parkId)

    expect(ids).toContain('park-never')
    expect(ids).toContain('park-old')
    expect(ids).not.toContain('park-recent')
  })
})
