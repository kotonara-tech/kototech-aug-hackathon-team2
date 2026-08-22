/** 活動管理（申請・審査・報告書） — 担当: 活動/インセンティブ班 */
import { Router } from 'express'
import { z } from 'zod'
import type { Repo } from '../../db/repo.js'
import { createActivity, transition, type ActivityAction } from '../../domain/activity.js'
import { isWithinNara } from '../../domain/geo.js'
import { updatePickupRequest, type PickupAction } from '../../domain/pickup.js'
import type { PickupRequestInput } from '../../domain/types.js'
import { withGroupName } from '../dto.js'
import { now, pathId, requireRole } from '../http.js'
import { createPaymentFor, markPaymentPaid } from '../payment-service.js'

const pointSchema = z.object({
  lat: z.number(),
  lng: z.number(),
  address: z.string().min(1),
})

const activitySchema = z.object({
  title: z.string().min(1).max(100),
  wardId: z.string().min(1),
  scheduledDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  location: pointSchema,
  plannedParticipants: z.number().int().positive(),
  parkId: z.string().min(1).optional(),
})

const reportSchema = z.object({
  actualParticipants: z.number().int(),
  hours: z.number(),
  garbageKg: z.number(),
  photoUrls: z.array(z.string()),
  beforePhotoUrls: z.array(z.string()).optional(),
  afterPhotoUrls: z.array(z.string()).optional(),
  workTypes: z.array(z.enum(['cleanup', 'weeding', 'pruning', 'planting', 'other'])).default(['cleanup']),
  comment: z.string().default(''),
})

const pickupRequestSchema = z
  .object({
    required: z.boolean(),
    wasteTypes: z.array(z.enum(['burnable', 'nonBurnable', 'branches', 'grass', 'other'])).optional(),
    bagCount: z.number().int().positive().optional(),
    location: pointSchema.optional(),
    preferredDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    note: z.string().max(500).optional(),
  })
  .superRefine((value, context) => {
    if (!value.required) return
    if (!value.wasteTypes?.length) context.addIssue({ code: 'custom', message: 'ごみの種類を選んでください' })
    if (!value.bagCount) context.addIssue({ code: 'custom', message: '袋数を入力してください' })
    if (!value.location) context.addIssue({ code: 'custom', message: '回収場所を入力してください' })
    if (!value.preferredDate) context.addIssue({ code: 'custom', message: '回収希望日を入力してください' })
  })

const actionSchema = z.object({
  type: z.enum(['submit', 'approve', 'reject', 'report', 'returnReport', 'verify', 'markPaid', 'cancel']),
  reason: z.string().optional(),
  note: z.string().optional(),
  report: reportSchema.optional(),
  pickupRequest: pickupRequestSchema.optional(),
})

const pickupActionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('schedule'), scheduledDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }),
  z.object({ type: z.literal('complete') }),
])

/** 理由の入力が必須な操作 */
const REASON_REQUIRED = ['reject', 'returnReport', 'cancel']

export function activitiesRouter(repo: Repo): Router {
  const router = Router()

  router.post('/activities', requireRole('group'), (req, res) => {
    const parsed = activitySchema.safeParse(req.body)
    if (!parsed.success) {
      return res.status(400).json({ error: '入力内容を確認してください', issues: parsed.error.issues })
    }

    const { location } = parsed.data
    if (!isWithinNara(location.lat, location.lng)) {
      return res.status(400).json({ error: '活動場所が奈良市域外です' })
    }

    const groupId = req.user.groupId!
    const activity = createActivity(
      { ...parsed.data, groupId, consecutiveMonths: repo.consecutiveMonths(groupId, new Date()) },
      now(),
    )
    repo.saveActivity(activity)
    res.status(201).json(activity)
  })

  router.get('/activities', (req, res) => {
    const status = typeof req.query.status === 'string' ? req.query.status : undefined
    const groupId = typeof req.query.groupId === 'string' ? req.query.groupId : undefined

    // 個人には確認済みの実績だけを見せる（審査中の情報は団体・市の内部情報）
    const list =
      req.user.role === 'member'
        ? repo.listPublishedActivities()
        : req.user.role === 'group'
          ? repo.listActivities({ status, groupId: req.user.groupId! })
          : repo.listActivities({ status, groupId })

    res.json(list.map((a) => withGroupName(repo, a)))
  })

  router.get('/activities/:id', (req, res) => {
    const a = repo.getActivity(pathId(req))
    if (!a) return res.status(404).json({ error: '活動が見つかりません' })
    const isOwner = req.user.role === 'group' && req.user.groupId === a.groupId
    const isPublished = a.status === 'verified' || a.status === 'paid'
    if (req.user.role !== 'city' && !isOwner && !(req.user.role === 'member' && isPublished)) {
      return res.status(403).json({ error: 'この活動を閲覧する権限がありません' })
    }
    res.json(withGroupName(repo, a))
  })

  router.post('/activities/:id/actions', (req, res) => {
    const activity = repo.getActivity(pathId(req))
    if (!activity) return res.status(404).json({ error: '活動が見つかりません' })

    const parsed = actionSchema.safeParse(req.body)
    if (!parsed.success) {
      return res.status(400).json({ error: '操作内容が不正です', issues: parsed.error.issues })
    }

    const { type, report, pickupRequest, reason, note } = parsed.data
    if (REASON_REQUIRED.includes(type) && !reason) {
      return res.status(400).json({ error: '理由を入力してください' })
    }
    if (type === 'report' && !report) {
      return res.status(400).json({ error: '報告内容を入力してください' })
    }

    const at = now()
    const updated = transition(
      activity,
      { type, actor: req.actor, report, pickupRequest: pickupRequest as PickupRequestInput, reason, note } as ActivityAction,
      at,
    )
    repo.saveActivity(updated)

    // 実績確定でポイント付与と奨励金の算定、支払済みで支払レコードの更新を行う
    if (type === 'verify') {
      repo.addGroupPoints(updated.groupId, updated.awardedPoints)
      // 旧申請フローの活動だけは既存の支払処理を維持する。
      // グリーンサポートの直接報告では、仮の報奨金を自動生成しない。
      if (updated.history.some((entry) => entry.action === 'approve')) createPaymentFor(repo, updated, at)
    }
    if (type === 'markPaid') {
      markPaymentPaid(repo, updated, at)
    }

    res.json(withGroupName(repo, updated))
  })

  /** 地域づくり推進課が、ごみ回収依頼を手配・完了する。 */
  router.post('/activities/:id/pickup-actions', requireRole('city'), (req, res) => {
    const activity = repo.getActivity(pathId(req))
    if (!activity) return res.status(404).json({ error: '活動が見つかりません' })
    if (!activity.pickupRequest) return res.status(409).json({ error: 'ごみ回収依頼がありません' })

    const parsed = pickupActionSchema.safeParse(req.body)
    if (!parsed.success) {
      return res.status(400).json({ error: '回収処理の入力内容を確認してください', issues: parsed.error.issues })
    }

    const at = now()
    const action = parsed.data as PickupAction
    const pickupRequest = updatePickupRequest(activity.pickupRequest, action, at)
    const historyEntry =
      action.type === 'schedule'
        ? {
            action: 'schedulePickup',
            actorId: req.actor.id,
            at,
            note: `回収予定日: ${action.scheduledDate}`,
          }
        : { action: 'completePickup', actorId: req.actor.id, at }
    const updated = { ...activity, pickupRequest, history: [...activity.history, historyEntry] }
    repo.saveActivity(updated)
    res.json(withGroupName(repo, updated))
  })

  return router
}
