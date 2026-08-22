/** 清掃活動の申請 → 承認 → 報告 → 確認 → 支払い のワークフロー */
import { randomUUID } from 'node:crypto'
import { DomainError } from './errors.js'
import { calculateActivityPoints } from './points.js'
import { createPickupRequest } from './pickup.js'
import type { Activity, ActivityReport, ActivityStatus, Actor, NewActivityInput, PickupRequestInput } from './types.js'

export class WorkflowError extends DomainError {}

export type ActivityAction =
  | { type: 'submit'; actor: Actor }
  | { type: 'approve'; actor: Actor; note?: string }
  | { type: 'reject'; actor: Actor; reason: string }
  | { type: 'report'; actor: Actor; report: ActivityReport; pickupRequest?: PickupRequestInput }
  | { type: 'returnReport'; actor: Actor; reason: string }
  | { type: 'verify'; actor: Actor }
  | { type: 'markPaid'; actor: Actor }
  | { type: 'cancel'; actor: Actor; reason: string }

type ActionType = ActivityAction['type']
type ActorScope = 'owner' | 'city' | 'ownerOrCity'

/** 誰が・どの状態から実行でき、どの状態になるか。ワークフロー仕様はこの表がすべて。 */
const RULES: Record<ActionType, { from: ActivityStatus[]; to: ActivityStatus; by: ActorScope }> = {
  submit: { from: ['draft'], to: 'submitted', by: 'owner' },
  approve: { from: ['submitted'], to: 'approved', by: 'city' },
  reject: { from: ['submitted'], to: 'rejected', by: 'city' },
  // グリーンサポートの登録済み団体は、定例活動を事前承認なしで事後報告できる。
  // approved は旧フローのデータを継続して処理するため残す。
  report: { from: ['draft', 'approved'], to: 'reported', by: 'owner' },
  returnReport: { from: ['reported'], to: 'approved', by: 'city' },
  verify: { from: ['reported'], to: 'verified', by: 'city' },
  markPaid: { from: ['verified'], to: 'paid', by: 'city' },
  cancel: { from: ['draft', 'submitted', 'approved'], to: 'cancelled', by: 'ownerOrCity' },
}

export function createActivity(input: NewActivityInput, now: string): Activity {
  return {
    id: randomUUID(),
    groupId: input.groupId,
    title: input.title,
    wardId: input.wardId,
    scheduledDate: input.scheduledDate,
    location: input.location,
    plannedParticipants: input.plannedParticipants,
    ...(input.parkId ? { parkId: input.parkId } : {}),
    consecutiveMonths: input.consecutiveMonths ?? 0,
    status: 'draft',
    report: null,
    pickupRequest: null,
    awardedPoints: 0,
    rejectionReason: null,
    submittedAt: null,
    verifiedAt: null,
    createdAt: now,
    history: [],
  }
}

export function canTransition(activity: Activity, type: ActionType): boolean {
  return RULES[type].from.includes(activity.status)
}

/** 活動を次の状態へ遷移させ、新しいオブジェクトを返す（元の値は変更しない） */
export function transition(activity: Activity, action: ActivityAction, now: string): Activity {
  const rule = RULES[action.type]

  // 状態 → 権限 → 入力値 の順に検証する（順序を変えるとエラーコードが変わる）
  if (!rule.from.includes(activity.status)) {
    throw new WorkflowError(
      'INVALID_STATE',
      `状態 ${activity.status} では ${action.type} を実行できません（許可: ${rule.from.join(', ')}）`,
    )
  }
  assertPermission(activity, action.actor, rule.by, action.type)

  const next: Activity = { ...activity, status: rule.to, history: [...activity.history] }

  switch (action.type) {
    case 'submit':
      next.submittedAt = now
      break
    case 'reject':
      next.rejectionReason = action.reason
      break
    case 'report':
      next.report = validateReport(action.report, activity.status === 'draft')
      next.pickupRequest = action.pickupRequest ? createPickupRequest(action.pickupRequest, now) : null
      break
    case 'returnReport':
      // 差し戻しでは報告内容を破棄し、承認済み状態からやり直させる
      next.report = null
      next.pickupRequest = null
      next.rejectionReason = action.reason
      // 事前申請を経ていない活動は、修正後に再び直接報告できる状態へ戻す。
      if (!activity.submittedAt) next.status = 'draft'
      break
    case 'verify': {
      const report = activity.report
      if (!report) throw new WorkflowError('INVALID_STATE', '報告書が存在しません')
      next.awardedPoints = calculateActivityPoints({
        actualParticipants: report.actualParticipants,
        hours: report.hours,
        garbageKg: report.garbageKg,
        consecutiveMonths: activity.consecutiveMonths,
      }).total
      next.verifiedAt = now
      break
    }
    case 'cancel':
      next.rejectionReason = action.reason
      break
  }

  next.history.push({
    action: action.type,
    actorId: action.actor.id,
    at: now,
    ...('reason' in action ? { note: action.reason } : {}),
  })
  return next
}

function assertPermission(activity: Activity, actor: Actor, by: ActorScope, type: ActionType): void {
  const isCity = actor.role === 'city'
  const isOwner = actor.role === 'group' && actor.groupId === activity.groupId
  const ok = by === 'city' ? isCity : by === 'owner' ? isOwner : isCity || isOwner

  if (!ok) {
    throw new WorkflowError('FORBIDDEN', `${actor.role} はこの活動に対して ${type} を実行する権限がありません`)
  }
}

function validateReport(report: ActivityReport, requireBeforeAfter = false): ActivityReport {
  if (report.photoUrls.length === 0) throw new WorkflowError('VALIDATION', '活動写真を1枚以上添付してください')
  if (requireBeforeAfter && (!report.beforePhotoUrls?.length || !report.afterPhotoUrls?.length)) {
    throw new WorkflowError('VALIDATION', '活動前と活動後の写真をそれぞれ1枚以上添付してください')
  }
  if (report.actualParticipants <= 0) throw new WorkflowError('VALIDATION', '参加人数は1人以上で入力してください')
  if (report.hours <= 0) throw new WorkflowError('VALIDATION', '活動時間は0より大きい値で入力してください')
  if (report.garbageKg < 0) throw new WorkflowError('VALIDATION', '回収量は0以上で入力してください')
  return report
}
