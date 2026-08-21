/** 清掃イベントの募集・参加・出席確定 — 担当: イベント/ポイント班 */
import { Router } from 'express'
import { z } from 'zod'
import type { Repo } from '../../db/repo.js'
import { cancelParticipation, joinEvent } from '../../domain/event.js'
import { calculateMemberPoints } from '../../domain/points.js'
import type { VolunteerEvent } from '../../domain/types.js'
import { toEventDto } from '../dto.js'
import { now, pathId, requireRole } from '../http.js'

const eventSchema = z.object({
  title: z.string().min(1).max(100),
  description: z.string().max(2000).default(''),
  startsAt: z.string().min(1),
  hours: z.number().positive(),
  meetingPoint: z.object({ lat: z.number(), lng: z.number(), address: z.string().min(1) }),
  wardId: z.string().min(1),
  capacity: z.number().int().positive(),
  applicationDeadline: z.string().min(1),
  pointsReward: z.number().int().nonnegative().default(100),
})

const attendanceSchema = z.object({ memberIds: z.array(z.string()) })

export function eventsRouter(repo: Repo): Router {
  const router = Router()

  router.post('/events', requireRole('group'), (req, res) => {
    const parsed = eventSchema.safeParse(req.body)
    if (!parsed.success) {
      return res.status(400).json({ error: '入力内容を確認してください', issues: parsed.error.issues })
    }

    const event: VolunteerEvent = {
      id: `ev-${Math.random().toString(36).slice(2, 10)}`,
      groupId: req.user.groupId!,
      participants: [],
      ...parsed.data,
    }
    repo.saveEvent(event)
    res.status(201).json(toEventDto(repo, event))
  })

  router.get('/events', (_req, res) => {
    res.json(repo.listEvents().map((e) => toEventDto(repo, e)))
  })

  router.get('/events/:id', (req, res) => {
    const e = repo.getEvent(pathId(req))
    if (!e) return res.status(404).json({ error: 'イベントが見つかりません' })
    res.json({ ...toEventDto(repo, e), participants: e.participants })
  })

  router.post('/events/:id/join', requireRole('member'), (req, res) => {
    const e = repo.getEvent(pathId(req))
    if (!e) return res.status(404).json({ error: 'イベントが見つかりません' })

    const { event, status } = joinEvent(e, req.user.id, now())
    repo.saveEvent(event)
    res.json({ status, event: toEventDto(repo, event) })
  })

  router.delete('/events/:id/join', requireRole('member'), (req, res) => {
    const e = repo.getEvent(pathId(req))
    if (!e) return res.status(404).json({ error: 'イベントが見つかりません' })

    const event = cancelParticipation(e, req.user.id, now())
    repo.saveEvent(event)
    res.json(toEventDto(repo, event))
  })

  /** 主催団体が出席を確定し、参加者に個人ポイントを付与する */
  router.post('/events/:id/attendance', requireRole('group'), (req, res) => {
    const event = repo.getEvent(pathId(req))
    if (!event) return res.status(404).json({ error: 'イベントが見つかりません' })
    if (event.groupId !== req.user.groupId) {
      return res.status(403).json({ error: '主催団体のみ出席を確定できます' })
    }

    const parsed = attendanceSchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: '参加者を指定してください' })

    const at = now()
    const awarded: { memberId: string; points: number }[] = []

    for (const memberId of parsed.data.memberIds) {
      // 参加確定者以外・付与済みは黙って飛ばす（二重付与の防止）
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

  return router
}
