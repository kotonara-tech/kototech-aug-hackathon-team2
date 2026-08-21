import { describe, it, expect } from 'vitest'
import { calculateActivityPoints, calculateMemberPoints, rankOf, RANKS } from '@/domain/points'

describe('団体の活動ポイント計算', () => {
  const base = { actualParticipants: 10, hours: 2, garbageKg: 30, consecutiveMonths: 0 }

  it('参加人数×時間×10pt を人時ポイントとして加算する', () => {
    const r = calculateActivityPoints({ ...base, garbageKg: 0 })
    expect(r.breakdown.personHours).toBe(200)
  })

  it('回収したごみ 1kg につき 5pt を加算する', () => {
    const r = calculateActivityPoints({ ...base, garbageKg: 30 })
    expect(r.breakdown.garbage).toBe(150)
  })

  it('小数のごみ量は切り捨てて整数ポイントにする', () => {
    const r = calculateActivityPoints({ ...base, garbageKg: 46.5 })
    expect(Number.isInteger(r.total)).toBe(true)
    expect(r.breakdown.garbage).toBe(232)
  })

  it('連続活動月数に応じた継続ボーナス倍率がかかる', () => {
    expect(calculateActivityPoints({ ...base, consecutiveMonths: 0 }).multiplier).toBe(1.0)
    expect(calculateActivityPoints({ ...base, consecutiveMonths: 3 }).multiplier).toBe(1.1)
    expect(calculateActivityPoints({ ...base, consecutiveMonths: 6 }).multiplier).toBe(1.2)
    expect(calculateActivityPoints({ ...base, consecutiveMonths: 12 }).multiplier).toBe(1.3)
  })

  it('継続ボーナスの倍率は 1.3 が上限', () => {
    expect(calculateActivityPoints({ ...base, consecutiveMonths: 60 }).multiplier).toBe(1.3)
  })

  it('合計は (人時 + ごみ) × 倍率 の切り捨て', () => {
    const r = calculateActivityPoints({ ...base, consecutiveMonths: 6 })
    expect(r.total).toBe(Math.floor((200 + 150) * 1.2))
  })

  it('不正な入力は 0 ポイントではなく例外にする', () => {
    expect(() => calculateActivityPoints({ ...base, hours: -1 })).toThrow()
    expect(() => calculateActivityPoints({ ...base, actualParticipants: 0 })).toThrow()
  })
})

describe('個人ポイント計算（若年層の取り込み）', () => {
  it('活動1時間につき 30pt', () => {
    expect(calculateMemberPoints({ hours: 2, isFirstTime: false })).toBe(60)
  })

  it('初参加には歓迎ボーナス 100pt', () => {
    expect(calculateMemberPoints({ hours: 2, isFirstTime: true })).toBe(160)
  })

  it('29歳以下は 1.5 倍（若年層インセンティブ）', () => {
    expect(calculateMemberPoints({ hours: 2, isFirstTime: false, age: 22 })).toBe(90)
    expect(calculateMemberPoints({ hours: 2, isFirstTime: false, age: 29 })).toBe(90)
    expect(calculateMemberPoints({ hours: 2, isFirstTime: false, age: 30 })).toBe(60)
  })

  it('友人紹介ボーナスは 1人につき 50pt、上限 3人', () => {
    expect(calculateMemberPoints({ hours: 1, isFirstTime: false, referredCount: 2 })).toBe(130)
    expect(calculateMemberPoints({ hours: 1, isFirstTime: false, referredCount: 10 })).toBe(180)
  })
})

describe('ランク判定', () => {
  it('累計ポイントからランクを決める', () => {
    expect(rankOf(0)).toBe('ブロンズ')
    expect(rankOf(999)).toBe('ブロンズ')
    expect(rankOf(1000)).toBe('シルバー')
    expect(rankOf(5000)).toBe('ゴールド')
    expect(rankOf(20000)).toBe('プラチナ')
  })

  it('ランク定義は昇順で連続している', () => {
    for (let i = 1; i < RANKS.length; i++) {
      expect(RANKS[i]!.threshold).toBeGreaterThan(RANKS[i - 1]!.threshold)
    }
  })
})
