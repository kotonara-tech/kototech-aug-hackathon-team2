/** 奨励金レコードの生成・更新（活動の確認／支払処理から呼ばれる） */
import { Repo, fiscalYearOf } from '../db/repo.js'
import { calculateIncentive } from '../domain/incentive.js'
import type { Activity } from '../domain/types.js'

/** 活動が「実績確定」した時点で、奨励金を算定して未確定の支払レコードを作る */
export function createPaymentFor(repo: Repo, activity: Activity, at: string): void {
  const report = activity.report
  const group = repo.getGroup(activity.groupId)
  if (!report || !group) return

  const fy = fiscalYearOf(at)
  const { amount, cappedBy } = calculateIncentive(
    { garbageKg: report.garbageKg, actualParticipants: report.actualParticipants, hours: report.hours },
    { yearToDatePaid: repo.yearToDatePaid(activity.groupId, fy) },
  )

  repo.savePayment(
    {
      id: `pay-${activity.id.slice(0, 8)}`,
      groupId: activity.groupId,
      groupName: group.name,
      activityId: activity.id,
      amount,
      status: 'pending',
      bank: group.bank,
      scheduledDate: '',
      paidAt: null,
      ...(cappedBy ? { cappedBy } : {}),
    },
    fy,
  )
}

/** 活動を「支払済み」にした時点で、対応する支払レコードも支払済みにする */
export function markPaymentPaid(repo: Repo, activity: Activity, at: string): void {
  const payment = repo.listPayments({ groupId: activity.groupId }).find((p) => p.activityId === activity.id)
  if (payment) repo.savePayment({ ...payment, status: 'paid', paidAt: at }, fiscalYearOf(at))
}
