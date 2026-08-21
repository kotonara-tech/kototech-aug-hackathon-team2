/**
 * 公園マスタ × 清掃実績 — 「清掃されていない公園」を可視化するためのドメインロジック。
 * DB / Repo には依存しない（ビジネスルールは src/domain/ にしか書かない、の約束）。
 */
import type { Park } from './types.js'

/** 1年以上清掃されていない公園を「放置」とみなす閾値（日） */
export const NEGLECT_THRESHOLD_DAYS = 365

/**
 * rankParksByNeglect が必要とする最小限の清掃実績。
 * MapActivity 全体には依存させず、この関数が使うフィールドだけを持つ形にする。
 */
export interface ParkCleanupRecord {
  parkId: string
  groupId: string
  /** 清掃日（YYYY-MM-DD） */
  cleanedOn: string
}

export interface ParkCleanupStatus {
  parkId: string
  name: string
  wardId: string
  lat: number
  lng: number
  /** 最後に清掃された日（YYYY-MM-DD）。一度も清掃されていなければ null */
  lastCleanedOn: string | null
  /** 最終清掃からの経過日数。未清掃なら null */
  daysSinceCleaned: number | null
  /** 最後に清掃した団体の ID。未清掃なら null */
  lastCleanedGroupId: string | null
  /** これまでに清掃された回数 */
  cleanupCount: number
  /** 未清掃 / 1年以上放置 / 直近清掃済み の区分 */
  neglect: 'never' | 'over-year' | 'recent'
}

/**
 * "YYYY-MM-DD" 形式の日付文字列を、UTC の 0時0分0秒とみなしてエポックミリ秒に変換する。
 * ISO 文字列の now もここで日付部分だけを切り出して同じ関数に通すことで、
 * 実行環境のタイムゾーンや now の時刻部分に結果が左右されないようにする。
 */
function toUtcDateMillis(dateOnly: string): number {
  const [year, month, day] = dateOnly.split('-').map(Number)
  return Date.UTC(year!, month! - 1, day!)
}

const MS_PER_DAY = 24 * 60 * 60 * 1000

/** now（ISO文字列）と cleanedOn（YYYY-MM-DD）の間の日数差を、日付単位・UTC基準で求める */
function daysBetween(cleanedOn: string, now: string): number {
  const nowDateOnly = now.slice(0, 10)
  return Math.round((toUtcDateMillis(nowDateOnly) - toUtcDateMillis(cleanedOn)) / MS_PER_DAY)
}

/** 清掃実績から区分（未清掃 / 1年以上放置 / 直近清掃済み）を決める */
function classifyNeglect(daysSinceCleaned: number | null): ParkCleanupStatus['neglect'] {
  if (daysSinceCleaned === null) return 'never'
  return daysSinceCleaned >= NEGLECT_THRESHOLD_DAYS ? 'over-year' : 'recent'
}

/**
 * ランキング用の比較関数。
 * 1. 未清掃（'never'）が最優先で先頭
 * 2. 清掃済み同士は lastCleanedOn の昇順（古い方が先）
 * 3. 同着は parkId の辞書順で決定的にする
 */
function compareByNeglect(a: ParkCleanupStatus, b: ParkCleanupStatus): number {
  const aNever = a.neglect === 'never'
  const bNever = b.neglect === 'never'
  if (aNever && !bNever) return -1
  if (!aNever && bNever) return 1
  if (!aNever && !bNever && a.lastCleanedOn !== b.lastCleanedOn) {
    return a.lastCleanedOn! < b.lastCleanedOn! ? -1 : 1
  }
  return a.parkId.localeCompare(b.parkId)
}

/**
 * 公園を「最後に清掃されてから時間が経っている順」に並べる。
 * now は ISO 文字列で受け取り、呼び出し側が固定できるようにする（暗黙の new Date() を使わない）。
 */
export function rankParksByNeglect(
  parks: Park[],
  activities: ParkCleanupRecord[],
  now: string,
): ParkCleanupStatus[] {
  const recordsByParkId = new Map<string, ParkCleanupRecord[]>()
  for (const record of activities) {
    const list = recordsByParkId.get(record.parkId) ?? []
    list.push(record)
    recordsByParkId.set(record.parkId, list)
  }

  const statuses = parks.map((p): ParkCleanupStatus => {
    const records = recordsByParkId.get(p.id) ?? []

    if (records.length === 0) {
      return {
        parkId: p.id,
        name: p.name,
        wardId: p.wardId,
        lat: p.lat,
        lng: p.lng,
        lastCleanedOn: null,
        daysSinceCleaned: null,
        lastCleanedGroupId: null,
        cleanupCount: 0,
        neglect: 'never',
      }
    }

    // 最新（cleanedOn が最大）の記録を最終清掃実績として採用する
    const latest = records.reduce((a, b) => (a.cleanedOn > b.cleanedOn ? a : b))
    const daysSinceCleaned = daysBetween(latest.cleanedOn, now)

    return {
      parkId: p.id,
      name: p.name,
      wardId: p.wardId,
      lat: p.lat,
      lng: p.lng,
      lastCleanedOn: latest.cleanedOn,
      daysSinceCleaned,
      lastCleanedGroupId: latest.groupId,
      cleanupCount: records.length,
      neglect: classifyNeglect(daysSinceCleaned),
    }
  })

  return statuses.sort(compareByNeglect)
}

/** 未清掃、または 1年以上清掃されていない公園かどうかを判定する。 */
export function isNeglected(status: ParkCleanupStatus): boolean {
  return status.neglect === 'never' || status.neglect === 'over-year'
}
