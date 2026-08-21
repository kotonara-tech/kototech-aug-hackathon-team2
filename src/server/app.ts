/**
 * HTTP API。ビジネスルールは domain/ 側にあり、ここは
 * 「認証・入力検証・永続化・DTO整形」だけを担当する。
 */
import express, { type Express, type NextFunction, type Request, type Response } from 'express'
import cors from 'cors'
import { z } from 'zod'
import { Repo, fiscalYearOf, type UserRow } from '../db/repo.js'
import { createActivity, transition, type ActivityAction } from '../domain/activity.js'
import { createPost } from '../domain/board.js'
import { cancelParticipation, isOpen, joinEvent, remainingSeats } from '../domain/event.js'
import { aggregateByWard, isWithinNara, toHeatCells } from '../domain/geo.js'
import { buildTransferCsv, calculateIncentive } from '../domain/incentive.js'
import { calculateMemberPoints, pointsToNextRank, rankOf } from '../domain/points.js'
import { DomainError, HTTP_STATUS_BY_CODE } from '../domain/errors.js'
import type { Activity, Actor, MapActivity, VolunteerEvent } from '../domain/types.js'

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user: UserRow
      actor: Actor
    }
  }
}

/* ---------------- 入力スキーマ ---------------- */

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
})

const reportSchema = z.object({
  actualParticipants: z.number().int(),
  hours: z.number(),
  garbageKg: z.number(),
  photoUrls: z.array(z.string()),
  comment: z.string().default(''),
})

const actionSchema = z.object({
  type: z.enum(['submit', 'approve', 'reject', 'report', 'returnReport', 'verify', 'markPaid', 'cancel']),
  reason: z.string().optional(),
  note: z.string().optional(),
  report: reportSchema.optional(),
})

const eventSchema = z.object({
  title: z.string().min(1).max(100),
  description: z.string().max(2000).default(''),
  startsAt: z.string().min(1),
  hours: z.number().positive(),
  meetingPoint: pointSchema,
  wardId: z.string().min(1),
  capacity: z.number().int().positive(),
  applicationDeadline: z.string().min(1),
  pointsReward: z.number().int().nonnegative().default(100),
})

const postSchema = z.object({
  body: z.string(),
  category: z.enum(['資機材', '共同開催', 'ノウハウ', '雑談', 'お知らせ']),
})

export function createApp(repo: Repo): Express {
  const app = express()
  app.use(cors())
  app.use(express.json({ limit: '2mb' }))

  const now = () => new Date().toISOString()

  /* ---------------- 認証 ----------------
   * プロトタイプのため署名付きトークンではなくヘッダの利用者IDで代用している。
   * 本番では奈良市の共通認証／マイナポータル連携に差し替える想定。 */
  app.use('/api', (req: Request, res: Response, next: NextFunction) => {
    if (req.path === '/health') return next()
    const id = req.header('x-user-id')
    const user = id ? repo.getUser(id) : null
    if (!user) return res.status(401).json({ error: 'ログインが必要です' })
    req.user = user
    req.actor = { id: user.id, role: user.role, groupId: user.groupId }
    next()
  })

  const requireRole =
    (...roles: UserRow['role'][]) =>
    (req: Request, res: Response, next: NextFunction) => {
      if (!roles.includes(req.user.role)) {
        return res.status(403).json({ error: 'この操作を行う権限がありません' })
      }
      next()
    }

  app.get('/api/health', (_req, res) => res.json({ ok: true }))

  /* ---------------- 自分の情報 ---------------- */

  app.get('/api/me', (req, res) => {
    const u = req.user
    const history = u.role === 'member' ? repo.listAttendances(u.id) : []
    res.json({
      id: u.id,
      name: u.name,
      role: u.role,
      groupId: u.groupId,
      groupName: u.groupId ? (repo.getGroup(u.groupId)?.name ?? null) : null,
      age: u.age,
      totalPoints: u.totalPoints,
      rank: rankOf(u.totalPoints),
      nextRank: pointsToNextRank(u.totalPoints),
      history,
    })
  })

  /* ---------------- 活動（申請・報告） ---------------- */

  app.post('/api/activities', requireRole('group'), (req, res) => {
    const parsed = activitySchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: '入力内容を確認してください', issues: parsed.error.issues })

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

  app.get('/api/activities', (req, res) => {
    const status = typeof req.query.status === 'string' ? req.query.status : undefined
    const groupId = typeof req.query.groupId === 'string' ? req.query.groupId : undefined

    // 個人には確認済みの実績だけを見せる（審査中の情報は団体・市の内部情報）
    const list =
      req.user.role === 'member' ? repo.listPublishedActivities() : repo.listActivities({ status, groupId })

    res.json(list.map((a) => withGroupName(a)))
  })

  app.get('/api/activities/:id', (req, res) => {
    const a = repo.getActivity(pathId(req))
    if (!a) return res.status(404).json({ error: '活動が見つかりません' })
    res.json(withGroupName(a))
  })

  app.post('/api/activities/:id/actions', (req, res) => {
    const activity = repo.getActivity(pathId(req))
    if (!activity) return res.status(404).json({ error: '活動が見つかりません' })

    const parsed = actionSchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: '操作内容が不正です', issues: parsed.error.issues })

    const { type, report, reason, note } = parsed.data
    if ((type === 'reject' || type === 'returnReport' || type === 'cancel') && !reason) {
      return res.status(400).json({ error: '理由を入力してください' })
    }
    if (type === 'report' && !report) {
      return res.status(400).json({ error: '報告内容を入力してください' })
    }

    const action = { type, actor: req.actor, report, reason, note } as ActivityAction
    const at = now()
    const updated = transition(activity, action, at)
    repo.saveActivity(updated)

    if (type === 'verify') {
      repo.addGroupPoints(updated.groupId, updated.awardedPoints)
      createPaymentFor(updated, at)
    }
    if (type === 'markPaid') {
      const payment = repo.listPayments({ groupId: updated.groupId }).find((p) => p.activityId === updated.id)
      if (payment) repo.savePayment({ ...payment, status: 'paid', paidAt: at }, fiscalYearOf(at))
    }

    res.json(withGroupName(updated))
  })

  function createPaymentFor(activity: Activity, at: string): void {
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

  /* ---------------- インセンティブの支払い ---------------- */

  app.get('/api/payments', requireRole('city', 'group'), (req, res) => {
    const list =
      req.user.role === 'city' ? repo.listPayments() : repo.listPayments({ groupId: req.user.groupId! })
    res.json(list)
  })

  app.get('/api/payments/transfer.csv', requireRole('city'), (_req, res) => {
    const csv = buildTransferCsv(repo.listPayments())
    res.setHeader('Content-Type', 'text/csv; charset=utf-8')
    res.setHeader('Content-Disposition', 'attachment; filename="nara-clean-transfer.csv"')
    // Excel が UTF-8 と判定できるよう BOM を付ける（自治体の実務では必須になりやすい）
    res.send('﻿' + csv)
  })

  app.post('/api/payments/:id/schedule', requireRole('city'), (req, res) => {
    const payment = repo.getPayment(pathId(req))
    if (!payment) return res.status(404).json({ error: '支払データが見つかりません' })

    const parsed = z.object({ scheduledDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }).safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: '支払予定日を指定してください' })

    const updated = { ...payment, status: 'scheduled' as const, scheduledDate: parsed.data.scheduledDate }
    repo.savePayment(updated, fiscalYearOf(`${parsed.data.scheduledDate}T00:00:00.000Z`))
    res.json(updated)
  })

  /* ---------------- イベント募集 ---------------- */

  app.post('/api/events', requireRole('group'), (req, res) => {
    const parsed = eventSchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: '入力内容を確認してください', issues: parsed.error.issues })

    const event: VolunteerEvent = {
      id: `ev-${Math.random().toString(36).slice(2, 10)}`,
      groupId: req.user.groupId!,
      participants: [],
      ...parsed.data,
    }
    repo.saveEvent(event)
    res.status(201).json(toEventDto(event))
  })

  app.get('/api/events', (_req, res) => {
    res.json(repo.listEvents().map((e) => toEventDto(e)))
  })

  app.get('/api/events/:id', (req, res) => {
    const e = repo.getEvent(pathId(req))
    if (!e) return res.status(404).json({ error: 'イベントが見つかりません' })
    res.json({ ...toEventDto(e), participants: e.participants })
  })

  app.post('/api/events/:id/join', requireRole('member'), (req, res) => {
    const e = repo.getEvent(pathId(req))
    if (!e) return res.status(404).json({ error: 'イベントが見つかりません' })

    const { event, status } = joinEvent(e, req.user.id, now())
    repo.saveEvent(event)
    res.json({ status, event: toEventDto(event) })
  })

  app.delete('/api/events/:id/join', requireRole('member'), (req, res) => {
    const e = repo.getEvent(pathId(req))
    if (!e) return res.status(404).json({ error: 'イベントが見つかりません' })

    const event = cancelParticipation(e, req.user.id, now())
    repo.saveEvent(event)
    res.json(toEventDto(event))
  })

  /** 主催団体が出席を確定し、参加者に個人ポイントを付与する */
  app.post('/api/events/:id/attendance', requireRole('group'), (req, res) => {
    const event = repo.getEvent(pathId(req))
    if (!event) return res.status(404).json({ error: 'イベントが見つかりません' })
    if (event.groupId !== req.user.groupId) {
      return res.status(403).json({ error: '主催団体のみ出席を確定できます' })
    }

    const parsed = z.object({ memberIds: z.array(z.string()) }).safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: '参加者を指定してください' })

    const at = now()
    const awarded: { memberId: string; points: number }[] = []

    for (const memberId of parsed.data.memberIds) {
      const confirmed = event.participants.some((p) => p.memberId === memberId && p.status === 'confirmed')
      if (!confirmed || repo.hasAttendance(event.id, memberId)) continue

      const member = repo.getUser(memberId)
      if (!member || member.role !== 'member') continue

      const points = calculateMemberPoints({
        hours: event.hours,
        isFirstTime: repo.countAttendances(memberId) === 0,
        ...(member.age !== null ? { age: member.age } : {}),
      })
      repo.saveAttendance({ eventId: event.id, memberId, points, awardedAt: at })
      repo.addUserPoints(memberId, points)
      awarded.push({ memberId, points })
    }

    res.json({ awarded })
  })

  /* ---------------- 団体間コミュニケーション ---------------- */

  app.get('/api/board', (_req, res) => {
    res.json(
      repo.listPosts().map((p) => ({
        ...p,
        groupName: p.groupId ? (repo.getGroup(p.groupId)?.name ?? null) : '奈良市',
      })),
    )
  })

  app.post('/api/board', (req, res) => {
    const parsed = postSchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: '入力内容を確認してください' })

    const post = createPost({ actor: req.actor, ...parsed.data }, now())
    repo.savePost(post)
    res.status(201).json(post)
  })

  /* ---------------- 団体（活動状況の相互確認） ---------------- */

  app.get('/api/groups', (_req, res) => {
    const stats = groupStats()
    res.json(
      repo.listGroups().map((g) => ({
        groupId: g.id,
        name: g.name,
        totalPoints: g.totalPoints,
        rank: rankOf(g.totalPoints),
        createdAt: g.createdAt,
        ...(stats.get(g.id) ?? { activityCount: 0, garbageKg: 0, participants: 0, lastActivityDate: null }),
      })),
    )
  })

  app.get('/api/groups/:id', (req, res) => {
    const g = repo.getGroup(pathId(req))
    if (!g) return res.status(404).json({ error: '団体が見つかりません' })

    const stats = groupStats().get(g.id)
    res.json({
      groupId: g.id,
      name: g.name,
      contact: g.contact,
      totalPoints: g.totalPoints,
      rank: rankOf(g.totalPoints),
      nextRank: pointsToNextRank(g.totalPoints),
      consecutiveMonths: repo.consecutiveMonths(g.id, new Date()),
      ...(stats ?? { activityCount: 0, garbageKg: 0, participants: 0, lastActivityDate: null }),
      activities: repo.listActivities({ groupId: g.id }),
    })
  })

  function groupStats() {
    const map = new Map<
      string,
      { activityCount: number; garbageKg: number; participants: number; lastActivityDate: string | null }
    >()
    for (const a of repo.listPublishedActivities()) {
      const row = map.get(a.groupId) ?? {
        activityCount: 0,
        garbageKg: 0,
        participants: 0,
        lastActivityDate: null,
      }
      row.activityCount += 1
      row.garbageKg += a.report?.garbageKg ?? 0
      row.participants += a.report?.actualParticipants ?? 0
      if (!row.lastActivityDate || a.scheduledDate > row.lastActivityDate) row.lastActivityDate = a.scheduledDate
      map.set(a.groupId, row)
    }
    return map
  }

  /* ---------------- 地図・統計 ---------------- */

  app.get('/api/map/activities', (_req, res) => {
    res.json(toMapActivities())
  })

  app.get('/api/map/wards', (_req, res) => {
    const wards = new Map(repo.listWards().map((w) => [w.id, w]))
    res.json(
      aggregateByWard(toMapActivities()).map((row) => ({
        ...row,
        wardName: wards.get(row.wardId)?.name ?? row.wardId,
        lat: wards.get(row.wardId)?.lat ?? null,
        lng: wards.get(row.wardId)?.lng ?? null,
      })),
    )
  })

  app.get('/api/map/heat', (req, res) => {
    const cellSize = Number(req.query.cellSize ?? 0.01)
    if (!Number.isFinite(cellSize) || cellSize <= 0) {
      return res.status(400).json({ error: 'cellSize が不正です' })
    }
    res.json(toHeatCells(toMapActivities(), cellSize))
  })

  app.get('/api/wards', (_req, res) => res.json(repo.listWards()))

  app.get('/api/stats', (_req, res) => {
    const acts = toMapActivities()
    res.json({
      totalActivities: acts.length,
      totalGarbageKg: round1(acts.reduce((s, a) => s + a.garbageKg, 0)),
      totalParticipants: acts.reduce((s, a) => s + a.participants, 0),
      totalGroups: repo.listGroups().length,
      activeWards: new Set(acts.map((a) => a.wardId)).size,
      openEvents: repo.listEvents().filter((e) => isOpen(e, new Date().toISOString())).length,
      pendingReviews: repo.listActivities({ status: 'submitted' }).length,
      pendingPayments: repo.listPayments().filter((p) => p.status === 'pending').length,
    })
  })

  function toMapActivities(): MapActivity[] {
    return repo.listPublishedActivities().map((a) => ({
      id: a.id,
      wardId: a.wardId,
      lat: a.location.lat,
      lng: a.location.lng,
      garbageKg: a.report?.garbageKg ?? 0,
      participants: a.report?.actualParticipants ?? 0,
      date: a.scheduledDate,
      title: a.title,
    }))
  }

  function withGroupName(a: Activity) {
    return { ...a, groupName: repo.getGroup(a.groupId)?.name ?? a.groupId }
  }

  function toEventDto(e: VolunteerEvent) {
    return {
      ...e,
      groupName: repo.getGroup(e.groupId)?.name ?? e.groupId,
      wardName: repo.wardName(e.wardId),
      remainingSeats: remainingSeats(e),
      confirmedCount: e.participants.filter((p) => p.status === 'confirmed').length,
      waitlistCount: e.participants.filter((p) => p.status === 'waitlisted').length,
      isOpen: isOpen(e, new Date().toISOString()),
    }
  }

  /* ---------------- エラー変換 ---------------- */

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof DomainError) {
      return res.status(HTTP_STATUS_BY_CODE[err.code] ?? 400).json({ error: err.message, code: err.code })
    }
    if (err instanceof RangeError) {
      return res.status(400).json({ error: err.message })
    }
    console.error(err)
    res.status(500).json({ error: 'サーバ内部でエラーが発生しました' })
  })

  return app
}

/** Express 5 の型では params が string|string[] になるため、ここで正規化する */
function pathId(req: Request): string {
  const raw = req.params.id
  return Array.isArray(raw) ? (raw[0] ?? '') : (raw ?? '')
}

function round1(n: number): number {
  return Math.round(n * 10) / 10
}
