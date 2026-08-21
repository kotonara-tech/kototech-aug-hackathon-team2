import { describe, it, expect } from 'vitest'
import { joinEvent, cancelParticipation, EventError, isOpen } from '@/domain/event'
import type { VolunteerEvent } from '@/domain/types'

const NOW = '2026-05-01T00:00:00.000Z'

const evt = (over: Partial<VolunteerEvent> = {}): VolunteerEvent => ({
  id: 'e1',
  groupId: 'g-a',
  title: '朝活クリーン＠奈良公園',
  description: '朝7時集合、1時間で解散。道具は貸出します。',
  startsAt: '2026-05-20T07:00:00.000Z',
  hours: 1,
  meetingPoint: { lat: 34.685, lng: 135.843, address: '奈良公園 登大路園地' },
  wardId: 'nara-park',
  capacity: 3,
  applicationDeadline: '2026-05-19T00:00:00.000Z',
  pointsReward: 100,
  participants: [],
  ...over,
})

describe('清掃イベントへの参加募集', () => {
  it('定員内なら confirmed で参加できる', () => {
    const { event, status } = joinEvent(evt(), 'm1', NOW)
    expect(status).toBe('confirmed')
    expect(event.participants).toHaveLength(1)
  })

  it('定員を超えた申込は waitlisted になる', () => {
    let e = evt()
    for (const id of ['m1', 'm2', 'm3']) e = joinEvent(e, id, NOW).event
    const { event, status } = joinEvent(e, 'm4', NOW)
    expect(status).toBe('waitlisted')
    expect(event.participants.filter((p) => p.status === 'confirmed')).toHaveLength(3)
  })

  it('同じ人は二重に申し込めない', () => {
    const e = joinEvent(evt(), 'm1', NOW).event
    expect(() => joinEvent(e, 'm1', NOW)).toThrowError(expect.objectContaining({ code: 'ALREADY_JOINED' }))
  })

  it('締切を過ぎたイベントには申し込めない', () => {
    expect(() => joinEvent(evt(), 'm1', '2026-05-19T09:00:00.000Z')).toThrowError(
      expect.objectContaining({ code: 'CLOSED' }),
    )
  })

  it('締切前かどうかを判定できる', () => {
    expect(isOpen(evt(), NOW)).toBe(true)
    expect(isOpen(evt(), '2026-05-19T00:00:01.000Z')).toBe(false)
  })

  it('確定者がキャンセルするとキャンセル待ちが繰り上がる', () => {
    let e = evt()
    for (const id of ['m1', 'm2', 'm3', 'm4', 'm5']) e = joinEvent(e, id, NOW).event
    expect(e.participants.find((p) => p.memberId === 'm4')!.status).toBe('waitlisted')

    e = cancelParticipation(e, 'm2', NOW)
    expect(e.participants.find((p) => p.memberId === 'm2')!.status).toBe('cancelled')
    expect(e.participants.find((p) => p.memberId === 'm4')!.status).toBe('confirmed')
    expect(e.participants.find((p) => p.memberId === 'm5')!.status).toBe('waitlisted')
  })

  it('繰り上げは申込が早い順（先着）で行う', () => {
    let e = evt({ capacity: 1 })
    e = joinEvent(e, 'm1', '2026-05-01T00:00:00.000Z').event
    e = joinEvent(e, 'm2', '2026-05-03T00:00:00.000Z').event
    e = joinEvent(e, 'm3', '2026-05-02T00:00:00.000Z').event
    e = cancelParticipation(e, 'm1', NOW)
    expect(e.participants.find((p) => p.memberId === 'm3')!.status).toBe('confirmed')
    expect(e.participants.find((p) => p.memberId === 'm2')!.status).toBe('waitlisted')
  })

  it('参加していない人はキャンセルできない', () => {
    expect(() => cancelParticipation(evt(), 'mx', NOW)).toThrow(EventError)
  })

  it('イベントオブジェクトはイミュータブルに扱う', () => {
    const e = evt()
    joinEvent(e, 'm1', NOW)
    expect(e.participants).toHaveLength(0)
  })
})
