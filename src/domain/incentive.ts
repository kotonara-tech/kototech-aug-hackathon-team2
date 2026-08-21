/** インセンティブ（奨励金）の算定と振込データ出力 */
import type { PaymentRecord } from './types.js'

export const INCENTIVE_RULES = {
  /** 1活動あたりの基本額 */
  baseAmount: 3_000,
  /** 回収ごみ 1kg あたりの加算額 */
  perKg: 100,
  /** 1活動あたりの上限 */
  perActivityCap: 30_000,
  /** 1団体あたりの年間上限 */
  annualCap: 200_000,
} as const

export interface IncentiveInput {
  garbageKg: number
  actualParticipants: number
  hours: number
}

export interface IncentiveResult {
  amount: number
  cappedBy: 'perActivity' | 'annual' | null
  /** 上限適用前の理論値（市の説明責任のため保持する） */
  rawAmount: number
}

export function calculateIncentive(
  input: IncentiveInput,
  context: { yearToDatePaid: number },
): IncentiveResult {
  const rawAmount = INCENTIVE_RULES.baseAmount + Math.floor(input.garbageKg * INCENTIVE_RULES.perKg)

  const afterActivityCap = Math.min(rawAmount, INCENTIVE_RULES.perActivityCap)
  const annualRemaining = Math.max(0, INCENTIVE_RULES.annualCap - context.yearToDatePaid)
  const amount = Math.min(afterActivityCap, annualRemaining)

  const cappedBy =
    amount < afterActivityCap ? 'annual' : afterActivityCap < rawAmount ? 'perActivity' : null

  return { amount, cappedBy, rawAmount }
}

/* ---------------- 振込データ（全銀形式に準じた CSV） ---------------- */

const CSV_HEADER = [
  '金融機関コード',
  '支店コード',
  '預金種目',
  '口座番号',
  '受取人名',
  '金額',
  '団体名',
  '活動ID',
  '支払予定日',
]

const ACCOUNT_TYPE_CODE: Record<string, string> = { 普通: '1', 当座: '2' }

/** 振込対象は「支払確定済み（scheduled）」のみ。pending / paid は除外する。 */
export function transferTargets(payments: PaymentRecord[]): PaymentRecord[] {
  return payments.filter((p) => p.status === 'scheduled')
}

export function sumTransferAmount(payments: PaymentRecord[]): number {
  return transferTargets(payments).reduce((sum, p) => sum + p.amount, 0)
}

export function buildTransferCsv(payments: PaymentRecord[]): string {
  const rows = transferTargets(payments).map((p) => [
    p.bank.bankCode,
    p.bank.branchCode,
    ACCOUNT_TYPE_CODE[p.bank.accountType] ?? '1',
    p.bank.accountNumber,
    p.bank.accountHolderKana,
    String(p.amount),
    p.groupName,
    p.activityId,
    p.scheduledDate,
  ])

  return [CSV_HEADER, ...rows].map((row) => row.map(escapeCsv).join(',')).join('\n') + '\n'
}

/** RFC4180: カンマ・引用符・改行を含む値はダブルクォートで囲む */
function escapeCsv(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value
}
