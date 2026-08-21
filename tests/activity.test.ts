import { describe, it, expect } from 'vitest'
import { transition, WorkflowError, createActivity } from '@/domain/activity'
import type { Activity, ActivityReport } from '@/domain/types'

const NOW = '2026-04-01T09:00:00.000Z'
const city = { id: 'u-city', role: 'city' as const, groupId: null }
const groupA = { id: 'u-a', role: 'group' as const, groupId: 'g-a' }
const groupB = { id: 'u-b', role: 'group' as const, groupId: 'g-b' }
const member = { id: 'u-m', role: 'member' as const, groupId: 'g-a' }

const draft = (): Activity =>
  createActivity(
    {
      groupId: 'g-a',
      title: '佐保川河川敷 清掃',
      wardId: 'saho',
      scheduledDate: '2026-05-10',
      location: { lat: 34.69, lng: 135.81, address: '奈良市法蓮町' },
      plannedParticipants: 20,
    },
    NOW,
  )

const validReport = (): ActivityReport => ({
  actualParticipants: 18,
  hours: 2,
  garbageKg: 46.5,
  photoUrls: ['/uploads/a1.jpg', '/uploads/a2.jpg'],
  comment: '空き缶とペットボトルが中心でした',
})

describe('活動申請のステートマシン', () => {
  it('新規作成した活動は draft から始まる', () => {
    expect(draft().status).toBe('draft')
  })

  it('団体が申請すると submitted になる', () => {
    const a = transition(draft(), { type: 'submit', actor: groupA }, NOW)
    expect(a.status).toBe('submitted')
    expect(a.submittedAt).toBe(NOW)
  })

  it('他団体は申請できない（FORBIDDEN）', () => {
    expect(() => transition(draft(), { type: 'submit', actor: groupB }, NOW)).toThrowError(
      expect.objectContaining({ code: 'FORBIDDEN' }),
    )
  })

  it('個人メンバーは申請できない', () => {
    expect(() => transition(draft(), { type: 'submit', actor: member }, NOW)).toThrow(WorkflowError)
  })

  it('draft のまま承認はできない（INVALID_STATE）', () => {
    expect(() => transition(draft(), { type: 'approve', actor: city }, NOW)).toThrowError(
      expect.objectContaining({ code: 'INVALID_STATE' }),
    )
  })

  it('市が承認すると approved になる', () => {
    const submitted = transition(draft(), { type: 'submit', actor: groupA }, NOW)
    const approved = transition(submitted, { type: 'approve', actor: city }, NOW)
    expect(approved.status).toBe('approved')
  })

  it('団体は自分の申請を承認できない（自己承認の禁止）', () => {
    const submitted = transition(draft(), { type: 'submit', actor: groupA }, NOW)
    expect(() => transition(submitted, { type: 'approve', actor: groupA }, NOW)).toThrowError(
      expect.objectContaining({ code: 'FORBIDDEN' }),
    )
  })

  it('市は理由付きで却下できる', () => {
    const submitted = transition(draft(), { type: 'submit', actor: groupA }, NOW)
    const rejected = transition(
      submitted,
      { type: 'reject', actor: city, reason: '同日同エリアで別団体の活動あり' },
      NOW,
    )
    expect(rejected.status).toBe('rejected')
    expect(rejected.rejectionReason).toBe('同日同エリアで別団体の活動あり')
  })

  it('承認済みの活動に報告書を提出すると reported になる', () => {
    const approved = transition(
      transition(draft(), { type: 'submit', actor: groupA }, NOW),
      { type: 'approve', actor: city },
      NOW,
    )
    const reported = transition(approved, { type: 'report', actor: groupA, report: validReport() }, NOW)
    expect(reported.status).toBe('reported')
    expect(reported.report?.garbageKg).toBe(46.5)
  })

  it('写真が1枚もない報告書は受け付けない（VALIDATION）', () => {
    const approved = transition(
      transition(draft(), { type: 'submit', actor: groupA }, NOW),
      { type: 'approve', actor: city },
      NOW,
    )
    const bad = { ...validReport(), photoUrls: [] }
    expect(() => transition(approved, { type: 'report', actor: groupA, report: bad }, NOW)).toThrowError(
      expect.objectContaining({ code: 'VALIDATION' }),
    )
  })

  it('参加人数0や活動時間0の報告書は受け付けない', () => {
    const approved = transition(
      transition(draft(), { type: 'submit', actor: groupA }, NOW),
      { type: 'approve', actor: city },
      NOW,
    )
    for (const bad of [
      { ...validReport(), actualParticipants: 0 },
      { ...validReport(), hours: 0 },
      { ...validReport(), garbageKg: -1 },
    ]) {
      expect(() => transition(approved, { type: 'report', actor: groupA, report: bad }, NOW)).toThrowError(
        expect.objectContaining({ code: 'VALIDATION' }),
      )
    }
  })

  it('市は報告書を差し戻せる（approved に戻る）', () => {
    const reported = transition(
      transition(
        transition(draft(), { type: 'submit', actor: groupA }, NOW),
        { type: 'approve', actor: city },
        NOW,
      ),
      { type: 'report', actor: groupA, report: validReport() },
      NOW,
    )
    const returned = transition(
      reported,
      { type: 'returnReport', actor: city, reason: '写真が activity 前後で判別できません' },
      NOW,
    )
    expect(returned.status).toBe('approved')
    expect(returned.report).toBeNull()
  })

  it('市が確認すると verified になり、ポイントが確定する', () => {
    const reported = transition(
      transition(
        transition(draft(), { type: 'submit', actor: groupA }, NOW),
        { type: 'approve', actor: city },
        NOW,
      ),
      { type: 'report', actor: groupA, report: validReport() },
      NOW,
    )
    const verified = transition(reported, { type: 'verify', actor: city }, NOW)
    expect(verified.status).toBe('verified')
    expect(verified.awardedPoints).toBeGreaterThan(0)
  })

  it('verified を経ずに支払済にはできない', () => {
    const reported = transition(
      transition(
        transition(draft(), { type: 'submit', actor: groupA }, NOW),
        { type: 'approve', actor: city },
        NOW,
      ),
      { type: 'report', actor: groupA, report: validReport() },
      NOW,
    )
    expect(() => transition(reported, { type: 'markPaid', actor: city }, NOW)).toThrowError(
      expect.objectContaining({ code: 'INVALID_STATE' }),
    )
  })

  it('すべての遷移が履歴に記録される', () => {
    const a = transition(
      transition(draft(), { type: 'submit', actor: groupA }, NOW),
      { type: 'approve', actor: city },
      '2026-04-02T00:00:00.000Z',
    )
    expect(a.history.map((h) => h.action)).toEqual(['submit', 'approve'])
    expect(a.history.at(-1)).toMatchObject({ actorId: 'u-city', at: '2026-04-02T00:00:00.000Z' })
  })

  it('元の活動オブジェクトは書き換えない（イミュータブル）', () => {
    const original = draft()
    transition(original, { type: 'submit', actor: groupA }, NOW)
    expect(original.status).toBe('draft')
    expect(original.history).toHaveLength(0)
  })
})
