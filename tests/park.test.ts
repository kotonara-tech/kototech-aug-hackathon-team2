import { describe, it, expect } from 'vitest'
import { rankParksByNeglect, isNeglected, NEGLECT_THRESHOLD_DAYS } from '@/domain/park'
import type { ParkCleanupRecord } from '@/domain/park'
import type { Park } from '@/domain/types'

/** 基準時刻。テストからは必ずこれを渡し、new Date() を暗黙に使わない設計であることを担保する */
const NOW = '2026-08-22T00:00:00.000Z'

const parks: Park[] = [
  { id: 'park-a', name: '直近清掃公園', wardId: 'naramachi', lat: 34.68, lng: 135.82 },
  { id: 'park-b', name: '古参清掃公園', wardId: 'saho', lat: 34.7, lng: 135.81 },
  { id: 'park-c', name: '未清掃公園', wardId: 'naramachi', lat: 34.69, lng: 135.8 },
]

const records: ParkCleanupRecord[] = [
  { parkId: 'park-a', groupId: 'g1', cleanedOn: '2026-08-20' },
  { parkId: 'park-b', groupId: 'g2', cleanedOn: '2026-01-10' },
]

describe('公園の放置ランキング（rankParksByNeglect）', () => {
  it('未清掃の公園が先頭に来る', () => {
    const ranked = rankParksByNeglect(parks, records, NOW)
    expect(ranked[0]!.parkId).toBe('park-c')
    expect(ranked[0]!.neglect).toBe('never')
  })

  it('清掃済みの公園同士は最終清掃日が古い順に並ぶ', () => {
    const ranked = rankParksByNeglect(parks, records, NOW)
    const cleaned = ranked.filter((r) => r.lastCleanedOn !== null)
    expect(cleaned.map((r) => r.parkId)).toEqual(['park-b', 'park-a'])
  })

  it('daysSinceCleaned が正しく計算される（2026-08-22 基準で 2026-08-12 清掃なら10日）', () => {
    const target: Park[] = [{ id: 'park-x', name: 'テスト公園', wardId: 'naramachi', lat: 34.68, lng: 135.82 }]
    const recs: ParkCleanupRecord[] = [{ parkId: 'park-x', groupId: 'g1', cleanedOn: '2026-08-12' }]
    const [status] = rankParksByNeglect(target, recs, NOW)
    expect(status!.daysSinceCleaned).toBe(10)
  })

  describe('境界値: 365日でオフバイワンを潰す', () => {
    const target: Park[] = [{ id: 'park-x', name: 'テスト公園', wardId: 'naramachi', lat: 34.68, lng: 135.82 }]

    it('ちょうど365日経過（2025-08-22清掃）は over-year かつ isNeglected が true', () => {
      const recs: ParkCleanupRecord[] = [{ parkId: 'park-x', groupId: 'g1', cleanedOn: '2025-08-22' }]
      const [status] = rankParksByNeglect(target, recs, NOW)
      expect(status!.daysSinceCleaned).toBe(NEGLECT_THRESHOLD_DAYS)
      expect(status!.neglect).toBe('over-year')
      expect(isNeglected(status!)).toBe(true)
    })

    it('364日経過（2025-08-23清掃）は recent かつ isNeglected が false', () => {
      const recs: ParkCleanupRecord[] = [{ parkId: 'park-x', groupId: 'g1', cleanedOn: '2025-08-23' }]
      const [status] = rankParksByNeglect(target, recs, NOW)
      expect(status!.daysSinceCleaned).toBe(NEGLECT_THRESHOLD_DAYS - 1)
      expect(status!.neglect).toBe('recent')
      expect(isNeglected(status!)).toBe(false)
    })
  })

  it('未清掃の公園は isNeglected が true で、清掃関連の値がすべて null', () => {
    const target: Park[] = [{ id: 'park-x', name: 'テスト公園', wardId: 'naramachi', lat: 34.68, lng: 135.82 }]
    const [status] = rankParksByNeglect(target, [], NOW)
    expect(status!.lastCleanedOn).toBeNull()
    expect(status!.daysSinceCleaned).toBeNull()
    expect(status!.lastCleanedGroupId).toBeNull()
    expect(status!.neglect).toBe('never')
    expect(isNeglected(status!)).toBe(true)
  })

  it('清掃回数と最終清掃団体: 複数団体の記録があれば件数が一致し、最新清掃の団体が採用される', () => {
    const target: Park[] = [{ id: 'park-x', name: 'テスト公園', wardId: 'naramachi', lat: 34.68, lng: 135.82 }]
    const recs: ParkCleanupRecord[] = [
      { parkId: 'park-x', groupId: 'g-old', cleanedOn: '2026-01-05' },
      { parkId: 'park-x', groupId: 'g-new', cleanedOn: '2026-08-01' },
      { parkId: 'park-x', groupId: 'g-mid', cleanedOn: '2026-05-15' },
    ]
    const [status] = rankParksByNeglect(target, recs, NOW)
    expect(status!.cleanupCount).toBe(3)
    expect(status!.lastCleanedOn).toBe('2026-08-01')
    expect(status!.lastCleanedGroupId).toBe('g-new')
  })

  it('イミュータブル: parks と activities の引数を書き換えない', () => {
    const parksCopy = structuredClone(parks)
    const recordsCopy = structuredClone(records)

    rankParksByNeglect(parks, records, NOW)

    expect(parks).toEqual(parksCopy)
    expect(records).toEqual(recordsCopy)
  })

  it('タイムゾーンに依存しない: UTC日の終わり(23:59:59Z)を渡しても daysSinceCleaned が変わらない', () => {
    const target: Park[] = [{ id: 'park-x', name: 'テスト公園', wardId: 'naramachi', lat: 34.68, lng: 135.82 }]
    const recs: ParkCleanupRecord[] = [{ parkId: 'park-x', groupId: 'g1', cleanedOn: '2026-08-12' }]

    const atMidnight = rankParksByNeglect(target, recs, '2026-08-22T00:00:00.000Z')[0]!
    const atEndOfDay = rankParksByNeglect(target, recs, '2026-08-22T23:59:59.000Z')[0]!

    expect(atEndOfDay.daysSinceCleaned).toBe(atMidnight.daysSinceCleaned)
    expect(atEndOfDay.daysSinceCleaned).toBe(10)
  })
})
