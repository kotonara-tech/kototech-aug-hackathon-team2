/**
 * 団体の年間上限とインセンティブ支払の整合性を検証するテスト。
 *
 * createPaymentFor は支払レコードを status: 'pending' で作る。
 * repo.yearToDatePaid は status IN ('pending','scheduled','paid') を集計することで、
 * 未確定（pending）の支払も年間上限 200,000円 の判定に含める。
 * これにより、年度内に多数の活動を並行して確認しても団体の年間上限を突破しない。
 */
import { describe, it, expect } from 'vitest'
import request from 'supertest'
import type { Express } from 'express'
import { createPaymentFor } from '@/server/payment-service'
import { createActivity, transition } from '@/domain/activity'
import { INCENTIVE_RULES } from '@/domain/incentive'
import type { Actor, BankAccount, PaymentRecord } from '@/domain/types'
import { createTestApp, AS_CITY, AS_GROUP_A, NEW_ACTIVITY } from './helpers'

const BANK: BankAccount = {
  bankCode: '0009',
  branchCode: '567',
  accountType: '普通',
  accountNumber: '1234567',
  accountHolderKana: 'ｻﾎｶﾞﾜｦｷﾚｲﾆｽﾙｶｲ',
}

/** テスト用の支払レコードを作るヘルパー（既存フィールドは固定値で埋める） */
function paymentFixture(overrides: Partial<PaymentRecord> & Pick<PaymentRecord, 'id' | 'status' | 'amount' | 'activityId'>): PaymentRecord {
  return {
    groupId: 'g-a',
    groupName: '佐保川をきれいにする会',
    bank: BANK,
    scheduledDate: '',
    paidAt: null,
    ...overrides,
  }
}

/** payments.activity_id は activities(id) への外部キーなので、先にダミーの活動を保存しておく */
function saveDummyActivity(repo: ReturnType<typeof createTestApp>['repo'], id: string): void {
  const activity = createActivity(
    {
      groupId: 'g-a',
      title: 'ダミー活動',
      wardId: 'saho',
      scheduledDate: '2026-06-01',
      location: { lat: 34.697, lng: 135.808, address: '奈良市法蓮町 佐保川河川敷' },
      plannedParticipants: 10,
    },
    '2026-06-01T00:00:00.000Z',
  )
  repo.saveActivity({ ...activity, id })
}

describe('団体の年間上限とインセンティブ支払の整合性', () => {
  it('(A) yearToDatePaid は pending / scheduled / paid の合計を返す', () => {
    const { repo } = createTestApp()
    const fy = 2026

    saveDummyActivity(repo, 'act-p-pending')
    saveDummyActivity(repo, 'act-p-scheduled')
    saveDummyActivity(repo, 'act-p-paid')

    repo.savePayment(paymentFixture({ id: 'p-pending', activityId: 'act-p-pending', status: 'pending', amount: 10_000 }), fy)
    repo.savePayment(paymentFixture({ id: 'p-scheduled', activityId: 'act-p-scheduled', status: 'scheduled', amount: 20_000 }), fy)
    repo.savePayment(paymentFixture({ id: 'p-paid', activityId: 'act-p-paid', status: 'paid', amount: 30_000 }), fy)

    // pending / scheduled / paid の3件を合計した 60,000 が返る。
    expect(repo.yearToDatePaid('g-a', fy)).toBe(60_000)
  })

  it('(B) 年間上限200,000円を超えて pending 支払が積み上がらない', async () => {
    const { app } = createTestApp() as { app: Express }

    // 1活動あたり上限 30,000円 に達する報告（garbageKg を十分大きくする）を
    // 同一団体・同一年度内で 7 件、draft → submit → approve → report → verify まで進める。
    for (let i = 0; i < 7; i++) {
      const created = await request(app).post('/api/activities').set(AS_GROUP_A).send(NEW_ACTIVITY)
      const id = created.body.id as string
      await request(app).post(`/api/activities/${id}/actions`).set(AS_GROUP_A).send({ type: 'submit' })
      await request(app).post(`/api/activities/${id}/actions`).set(AS_CITY).send({ type: 'approve' })
      await request(app)
        .post(`/api/activities/${id}/actions`)
        .set(AS_GROUP_A)
        .send({
          type: 'report',
          report: {
            actualParticipants: 18,
            hours: 2,
            garbageKg: 300, // 3,000 + 300*100 = 33,000 → perActivityCap 30,000 で頭打ち
            photoUrls: ['/uploads/demo-1.jpg'],
            comment: '大量のごみを回収',
          },
        })
      await request(app).post(`/api/activities/${id}/actions`).set(AS_CITY).send({ type: 'verify' })
    }

    const payments = await request(app).get('/api/payments').set(AS_CITY).expect(200)
    const total = (payments.body as { amount: number }[]).reduce((sum, p) => sum + p.amount, 0)

    // 7件 × perActivityCap(30,000) = 210,000 となりうるが、年間上限で頭打ちになるため超過しない。
    expect(total).toBeLessThanOrEqual(INCENTIVE_RULES.annualCap)
  })

  it('(C) 同じ活動に対して createPaymentFor を2回呼んでも金額が変わらない', () => {
    const { repo } = createTestApp()
    const at = '2026-06-01T09:00:00.000Z'
    const groupActor: Actor = { id: 'u-group-a', role: 'group', groupId: 'g-a' }
    const cityActor: Actor = { id: 'u-city', role: 'city', groupId: null }

    let activity = createActivity(
      {
        groupId: 'g-a',
        title: '佐保川河川敷クリーン作戦',
        wardId: 'saho',
        scheduledDate: '2026-06-01',
        location: { lat: 34.697, lng: 135.808, address: '奈良市法蓮町 佐保川河川敷' },
        plannedParticipants: 20,
      },
      at,
    )
    activity = transition(activity, { type: 'submit', actor: groupActor }, at)
    activity = transition(activity, { type: 'approve', actor: cityActor }, at)
    activity = transition(
      activity,
      {
        type: 'report',
        actor: groupActor,
        report: {
          actualParticipants: 18,
          hours: 2,
          garbageKg: 46.5,
          photoUrls: ['/uploads/demo-1.jpg'],
          comment: 'ペットボトルと空き缶が中心',
        },
      },
      at,
    )
    activity = transition(activity, { type: 'verify', actor: cityActor }, at)
    repo.saveActivity(activity) // payments.activity_id の外部キー制約を満たすため先に保存する

    createPaymentFor(repo, activity, at)
    const first = repo.getPayment(`pay-${activity.id.slice(0, 8)}`)

    createPaymentFor(repo, activity, at)
    const second = repo.getPayment(`pay-${activity.id.slice(0, 8)}`)

    expect(first?.amount).toBeDefined()
    expect(second?.amount).toBe(first?.amount)
  })
})
