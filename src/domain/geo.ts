/** 活動実績の地理的な可視化（地区別集計・メッシュ集計） */
import type { HeatCell, MapActivity, WardSummary } from './types.js'

/** 奈良市の外接矩形（月ヶ瀬・都祁を含む東西に長い市域） */
export const NARA_BOUNDS = {
  south: 34.55,
  north: 34.79,
  west: 135.72,
  east: 136.1,
} as const

export function isWithinNara(lat: number, lng: number): boolean {
  return (
    lat >= NARA_BOUNDS.south && lat <= NARA_BOUNDS.north && lng >= NARA_BOUNDS.west && lng <= NARA_BOUNDS.east
  )
}

/** 地区ごとに実績を合計し、ごみ量の多い順に並べる */
export function aggregateByWard(activities: MapActivity[]): WardSummary[] {
  const byWard = new Map<string, WardSummary>()

  for (const a of activities) {
    const row = byWard.get(a.wardId) ?? { wardId: a.wardId, activityCount: 0, garbageKg: 0, participants: 0 }
    row.activityCount += 1
    row.garbageKg += a.garbageKg
    row.participants += a.participants
    byWard.set(a.wardId, row)
  }

  return [...byWard.values()].sort((a, b) => b.garbageKg - a.garbageKg)
}

/**
 * 緯度経度を格子状のセルに丸めて集計する（ヒートマップ用）。
 * cellSize は度単位。0.01度 ≒ 約1.1km 四方。
 */
export function toHeatCells(activities: MapActivity[], cellSize: number): HeatCell[] {
  if (cellSize <= 0) throw new RangeError('セルサイズは0より大きい必要があります')

  const cells = new Map<string, HeatCell>()

  for (const a of activities) {
    const latIndex = Math.floor(a.lat / cellSize)
    const lngIndex = Math.floor(a.lng / cellSize)
    const key = `${latIndex}:${lngIndex}`

    const cell = cells.get(key) ?? {
      lat: (latIndex + 0.5) * cellSize,
      lng: (lngIndex + 0.5) * cellSize,
      count: 0,
      garbageKg: 0,
    }
    cell.count += 1
    cell.garbageKg += a.garbageKg
    cells.set(key, cell)
  }

  return [...cells.values()]
}
