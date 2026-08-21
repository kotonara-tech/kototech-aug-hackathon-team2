/** ポイント計算 — 継続的な活動と若年層の参加を促すための設計 */

export const POINT_RULES = {
  /** 1人×1時間あたりの団体ポイント */
  perPersonHour: 10,
  /** 回収ごみ 1kg あたりの団体ポイント */
  perGarbageKg: 5,
  /** 個人の 1時間あたりポイント */
  memberPerHour: 30,
  /** 初参加の歓迎ボーナス */
  firstTimeBonus: 100,
  /** 29歳以下に適用する倍率 */
  youthMultiplier: 1.5,
  youthMaxAge: 29,
  /** 友人紹介ボーナス */
  referralBonus: 50,
  referralMax: 3,
} as const

/** 連続活動月数 → 継続ボーナス倍率（しきい値は降順に評価する） */
const STREAK_TIERS: ReadonlyArray<{ months: number; multiplier: number }> = [
  { months: 12, multiplier: 1.3 },
  { months: 6, multiplier: 1.2 },
  { months: 3, multiplier: 1.1 },
  { months: 0, multiplier: 1.0 },
]

export const RANKS: ReadonlyArray<{ name: string; threshold: number }> = [
  { name: 'ブロンズ', threshold: 0 },
  { name: 'シルバー', threshold: 1_000 },
  { name: 'ゴールド', threshold: 5_000 },
  { name: 'プラチナ', threshold: 20_000 },
]

export interface ActivityPointsInput {
  actualParticipants: number
  hours: number
  garbageKg: number
  consecutiveMonths: number
}

export interface ActivityPointsResult {
  total: number
  multiplier: number
  breakdown: { personHours: number; garbage: number }
}

export function streakMultiplier(consecutiveMonths: number): number {
  return STREAK_TIERS.find((t) => consecutiveMonths >= t.months)?.multiplier ?? 1.0
}

export function calculateActivityPoints(input: ActivityPointsInput): ActivityPointsResult {
  const { actualParticipants, hours, garbageKg, consecutiveMonths } = input
  if (actualParticipants <= 0) throw new RangeError('参加人数は1人以上である必要があります')
  if (hours <= 0) throw new RangeError('活動時間は0より大きい必要があります')
  if (garbageKg < 0) throw new RangeError('ごみ量は0以上である必要があります')

  const personHours = Math.floor(actualParticipants * hours * POINT_RULES.perPersonHour)
  const garbage = Math.floor(garbageKg * POINT_RULES.perGarbageKg)
  const multiplier = streakMultiplier(consecutiveMonths)

  return {
    total: Math.floor((personHours + garbage) * multiplier),
    multiplier,
    breakdown: { personHours, garbage },
  }
}

export interface MemberPointsInput {
  hours: number
  isFirstTime: boolean
  age?: number
  referredCount?: number
}

export function calculateMemberPoints({
  hours,
  isFirstTime,
  age,
  referredCount = 0,
}: MemberPointsInput): number {
  if (hours <= 0) throw new RangeError('活動時間は0より大きい必要があります')

  const isYouth = age !== undefined && age <= POINT_RULES.youthMaxAge
  const base = Math.floor(hours * POINT_RULES.memberPerHour * (isYouth ? POINT_RULES.youthMultiplier : 1))
  const welcome = isFirstTime ? POINT_RULES.firstTimeBonus : 0
  const referral = Math.min(referredCount, POINT_RULES.referralMax) * POINT_RULES.referralBonus

  return base + welcome + referral
}

export function rankOf(totalPoints: number): string {
  let current = RANKS[0]!.name
  for (const rank of RANKS) if (totalPoints >= rank.threshold) current = rank.name
  return current
}

/** 次のランクまでの残りポイント（最高ランクなら null） */
export function pointsToNextRank(totalPoints: number): { next: string; remaining: number } | null {
  const next = RANKS.find((r) => totalPoints < r.threshold)
  return next ? { next: next.name, remaining: next.threshold - totalPoints } : null
}
