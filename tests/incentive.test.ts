import { describe, it, expect } from 'vitest'
import { calculateIncentive, buildTransferCsv, sumTransferAmount, INCENTIVE_RULES } from '@/domain/incentive'
import type { PaymentRecord } from '@/domain/types'

describe('インセンティブ（奨励金）の算定', () => {
  const activity = { garbageKg: 30, actualParticipants: 10, hours: 2 }

  it('1活動あたりの基本額 3,000円 + ごみ 100円/kg', () => {
    const r = calculateIncentive(activity, { yearToDatePaid: 0 })
    expect(r.amount).toBe(3000 + 3000)
  })

  it('1円未満は切り捨てる', () => {
    const r = calculateIncentive({ ...activity, garbageKg: 46.5 }, { yearToDatePaid: 0 })
    expect(r.amount).toBe(3000 + 4650)
    expect(Number.isInteger(r.amount)).toBe(true)
  })

  it('1活動あたりの上限 30,000円で頭打ちになる', () => {
    const r = calculateIncentive({ ...activity, garbageKg: 1000 }, { yearToDatePaid: 0 })
    expect(r.amount).toBe(INCENTIVE_RULES.perActivityCap)
    expect(r.cappedBy).toBe('perActivity')
  })

  it('団体の年間上限 200,000円を超えない', () => {
    const r = calculateIncentive({ ...activity, garbageKg: 500 }, { yearToDatePaid: 190_000 })
    expect(r.amount).toBe(10_000)
    expect(r.cappedBy).toBe('annual')
  })

  it('年間上限に達している団体は 0円になる', () => {
    const r = calculateIncentive(activity, { yearToDatePaid: 200_000 })
    expect(r.amount).toBe(0)
    expect(r.cappedBy).toBe('annual')
  })

  it('上限にかからない場合 cappedBy は null', () => {
    expect(calculateIncentive(activity, { yearToDatePaid: 0 }).cappedBy).toBeNull()
  })
})

const NL = String.fromCharCode(10)

describe('振込データ（全銀形式CSV）の出力', () => {
  const payments: PaymentRecord[] = [
    {
      id: 'p1',
      groupId: 'g-a',
      groupName: '佐保川をきれいにする会',
      activityId: 'a1',
      amount: 6000,
      status: 'scheduled',
      bank: { bankCode: '0009', branchCode: '567', accountType: '普通', accountNumber: '1234567', accountHolderKana: 'ｻﾎｶﾞﾜｦｷﾚｲﾆｽﾙｶｲ' },
      scheduledDate: '2026-06-30',
      paidAt: null,
    },
    {
      id: 'p2',
      groupId: 'g-b',
      groupName: 'ならまち美化クラブ',
      activityId: 'a2',
      amount: 12500,
      status: 'scheduled',
      bank: { bankCode: '0005', branchCode: '123', accountType: '当座', accountNumber: '7654321', accountHolderKana: 'ﾅﾗﾏﾁﾋﾞｶｸﾗﾌﾞ' },
      scheduledDate: '2026-06-30',
      paidAt: null,
    },
  ]

  it('ヘッダ行 + 明細行を出力する', () => {
    const rows = buildTransferCsv(payments).trim().split('\n')
    expect(rows).toHaveLength(3)
    expect(rows[0]).toContain('金融機関コード')
  })

  it('金額はカンマなしの整数で出力する', () => {
    expect(buildTransferCsv(payments)).toContain(',6000,')
  })

  it('口座種別は全銀コード（普通=1 / 当座=2）に変換する', () => {
    const rows = buildTransferCsv(payments).trim().split('\n')
    expect(rows[1]!.split(',')).toContain('1')
    expect(rows[2]!.split(',')).toContain('2')
  })

  it('支払済・未確定のレコードは振込データに含めない', () => {
    const mixed: PaymentRecord[] = [
      ...payments,
      { ...payments[0]!, id: 'p3', status: 'paid', paidAt: '2026-05-31' },
      { ...payments[0]!, id: 'p4', status: 'pending' },
    ]
    const rows = buildTransferCsv(mixed).trim().split('\n')
    expect(rows).toHaveLength(3)
  })

  it('カンマを含む団体名でも列がずれない（RFC4180 のクォート）', () => {
    const tricky: PaymentRecord[] = [{ ...payments[0]!, groupName: '奈良,美化,の会' }]
    const rows = buildTransferCsv(tricky).trim().split(NL)
    expect(rows[1]).toContain('"奈良,美化,の会"')
    expect(parseCsvLine(rows[1]!)).toHaveLength(parseCsvLine(rows[0]!).length)
  })

  it('振込合計金額を集計できる', () => {
    expect(sumTransferAmount(payments)).toBe(18_500)
  })

  it('合計は振込対象（scheduled）のみを数える', () => {
    const mixed: PaymentRecord[] = [...payments, { ...payments[0]!, id: 'p9', status: 'pending' }]
    expect(sumTransferAmount(mixed)).toBe(18_500)
  })
})

/** テスト用の最小 CSV パーサ（クォート内のカンマを無視する） */
function parseCsvLine(line: string): string[] {
  return line.match(/("([^"]|"")*"|[^,]*)(,|$)/g)!.slice(0, -1)
}
