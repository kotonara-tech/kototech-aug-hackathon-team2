import { describe, it, expect } from 'vitest'
import { isWithinNara, aggregateByWard, toHeatCells, NARA_BOUNDS } from '@/domain/geo'
import type { MapActivity } from '@/domain/types'

const acts: MapActivity[] = [
  { id: 'a1', wardId: 'saho', lat: 34.697, lng: 135.808, garbageKg: 20, participants: 10, date: '2026-04-05', title: '佐保川' },
  { id: 'a2', wardId: 'saho', lat: 34.699, lng: 135.809, garbageKg: 10, participants: 5, date: '2026-04-19', title: '佐保川2' },
  { id: 'a3', wardId: 'naramachi', lat: 34.678, lng: 135.83, garbageKg: 35, participants: 12, date: '2026-05-02', title: 'ならまち' },
]

describe('奈良市域の判定', () => {
  it('市域内の座標を true と判定する', () => {
    expect(isWithinNara(34.685, 135.805)).toBe(true)
  })

  it('市域外（大阪市付近）を false と判定する', () => {
    expect(isWithinNara(34.69, 135.5)).toBe(false)
  })

  it('境界値は市域内として扱う', () => {
    expect(isWithinNara(NARA_BOUNDS.south, NARA_BOUNDS.west)).toBe(true)
    expect(isWithinNara(NARA_BOUNDS.north, NARA_BOUNDS.east)).toBe(true)
  })
})

describe('地区別の実績集計', () => {
  it('地区ごとに活動回数・ごみ量・延べ参加人数を合計する', () => {
    const rows = aggregateByWard(acts)
    const saho = rows.find((r) => r.wardId === 'saho')!
    expect(saho.activityCount).toBe(2)
    expect(saho.garbageKg).toBe(30)
    expect(saho.participants).toBe(15)
  })

  it('ごみ量の多い地区から順に並べる', () => {
    expect(aggregateByWard(acts).map((r) => r.wardId)).toEqual(['naramachi', 'saho'])
  })

  it('活動がなければ空配列を返す', () => {
    expect(aggregateByWard([])).toEqual([])
  })
})

describe('ヒートマップ用のメッシュ集計', () => {
  it('近接する活動は同じセルにまとめられる', () => {
    const cells = toHeatCells(acts, 0.01)
    expect(cells).toHaveLength(2)
  })

  it('セルの重みは回収したごみ量の合計', () => {
    const cell = toHeatCells(acts, 0.01).find((c) => c.count === 2)!
    expect(cell.garbageKg).toBe(30)
  })

  it('セル中心の座標を返す', () => {
    const cell = toHeatCells([acts[0]!], 0.01)[0]!
    expect(cell.lat).toBeCloseTo(34.695, 3)
    expect(cell.lng).toBeCloseTo(135.805, 3)
  })

  it('セルサイズを大きくすると全件が1セルにまとまる', () => {
    expect(toHeatCells(acts, 1)).toHaveLength(1)
  })
})
