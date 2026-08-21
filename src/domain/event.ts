/** 清掃イベントの募集・参加申込（定員／キャンセル待ち／繰り上げ） */
import { DomainError } from './errors.js'
import type { Participation, VolunteerEvent } from './types.js'

export class EventError extends DomainError {}

/** 申込締切前かどうか */
export function isOpen(event: VolunteerEvent, now: string): boolean {
  return Date.parse(now) < Date.parse(event.applicationDeadline)
}

export function confirmedCount(event: VolunteerEvent): number {
  return event.participants.filter((p) => p.status === 'confirmed').length
}

export function remainingSeats(event: VolunteerEvent): number {
  return Math.max(0, event.capacity - confirmedCount(event))
}

export interface JoinResult {
  event: VolunteerEvent
  status: 'confirmed' | 'waitlisted'
}

export function joinEvent(event: VolunteerEvent, memberId: string, now: string): JoinResult {
  if (!isOpen(event, now)) throw new EventError('CLOSED', '申込期限を過ぎています')

  const active = event.participants.find((p) => p.memberId === memberId && p.status !== 'cancelled')
  if (active) throw new EventError('ALREADY_JOINED', 'すでに申し込み済みです')

  const status = remainingSeats(event) > 0 ? 'confirmed' : 'waitlisted'
  const participation: Participation = { memberId, status, joinedAt: now }

  // 過去にキャンセルした人の再申込は、古い履歴を残さず置き換える
  const others = event.participants.filter((p) => p.memberId !== memberId)

  return { event: { ...event, participants: [...others, participation] }, status }
}

export function cancelParticipation(event: VolunteerEvent, memberId: string, now: string): VolunteerEvent {
  const target = event.participants.find((p) => p.memberId === memberId && p.status !== 'cancelled')
  if (!target) throw new EventError('NOT_JOINED', 'このイベントに参加していません')

  const participants = event.participants.map((p) =>
    p.memberId === memberId ? { ...p, status: 'cancelled' as const, cancelledAt: now } : { ...p },
  )

  return promoteWaitlist({ ...event, participants })
}

/** 空きが出たぶんだけ、申込が早い順にキャンセル待ちを繰り上げる */
function promoteWaitlist(event: VolunteerEvent): VolunteerEvent {
  const participants = [...event.participants]
  const waiting = participants
    .filter((p) => p.status === 'waitlisted')
    .sort((a, b) => Date.parse(a.joinedAt) - Date.parse(b.joinedAt))

  let seats = event.capacity - participants.filter((p) => p.status === 'confirmed').length
  for (const p of waiting) {
    if (seats <= 0) break
    p.status = 'confirmed'
    seats--
  }

  return { ...event, participants }
}
