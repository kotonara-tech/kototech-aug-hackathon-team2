import { beforeEach, describe, expect, it } from 'vitest'
import request from 'supertest'
import type { Express } from 'express'
import type { Repo } from '@/db/repo'
import { AS_CITY, AS_GROUP_A, AS_GROUP_B, NEW_ACTIVITY, VALID_REPORT, createTestApp } from './helpers'

let app: Express
let repo: Repo

beforeEach(() => {
  const testApp = createTestApp()
  app = testApp.app
  repo = testApp.repo
})

async function createActivity(): Promise<string> {
  const res = await request(app)
    .post('/api/activities')
    .set(AS_GROUP_A)
    .send({ ...NEW_ACTIVITY, parkId: 'park-konoike' })
    .expect(201)
  return res.body.id as string
}

const pickupRequest = {
  required: true,
  wasteTypes: ['burnable', 'grass'],
  bagCount: 6,
  location: { lat: 34.7025, lng: 135.8033, address: '鴻ノ池運動公園 南口' },
  preferredDate: '2026-06-15',
  note: '南口の看板横に集積しています',
}

describe('グリーンサポート活動報告とごみ回収依頼', () => {
  it('現地巡回を代替するため活動前後の写真をそれぞれ必須にする', async () => {
    const id = await createActivity()
    const res = await request(app)
      .post(`/api/activities/${id}/actions`)
      .set(AS_GROUP_A)
      .send({ type: 'report', report: VALID_REPORT, pickupRequest: { required: false } })

    expect(res.status).toBe(400)
    expect(res.body.code).toBe('VALIDATION')
  })

  it('登録済み団体は事前承認なしで活動報告と回収依頼を同時送信できる', async () => {
    const id = await createActivity()

    const res = await request(app)
      .post(`/api/activities/${id}/actions`)
      .set(AS_GROUP_A)
      .send({
        type: 'report',
        report: {
          ...VALID_REPORT,
          beforePhotoUrls: ['/uploads/before.jpg'],
          afterPhotoUrls: ['/uploads/after.jpg'],
        },
        pickupRequest,
      })
      .expect(200)

    expect(res.body).toMatchObject({
      status: 'reported',
      parkId: 'park-konoike',
      pickupRequest: {
        status: 'requested',
        wasteTypes: ['burnable', 'grass'],
        bagCount: 6,
        preferredDate: '2026-06-15',
      },
    })
    expect(res.body.history.map((entry: { action: string }) => entry.action)).toEqual(['report'])
  })

  it('市職員が回収依頼を手配済み、回収済みへ進められる', async () => {
    const id = await createActivity()
    await request(app)
      .post(`/api/activities/${id}/actions`)
      .set(AS_GROUP_A)
      .send({
        type: 'report',
        report: {
          ...VALID_REPORT,
          beforePhotoUrls: ['/uploads/before.jpg'],
          afterPhotoUrls: ['/uploads/after.jpg'],
        },
        pickupRequest,
      })

    const scheduled = await request(app)
      .post(`/api/activities/${id}/pickup-actions`)
      .set(AS_CITY)
      .send({ type: 'schedule', scheduledDate: '2026-06-16' })
      .expect(200)
    expect(scheduled.body.pickupRequest).toMatchObject({ status: 'scheduled', scheduledDate: '2026-06-16' })

    const collected = await request(app)
      .post(`/api/activities/${id}/pickup-actions`)
      .set(AS_CITY)
      .send({ type: 'complete' })
      .expect(200)
    expect(collected.body.pickupRequest.status).toBe('collected')
    expect(collected.body.pickupRequest.collectedAt).toBeTruthy()
  })

  it('団体は回収状態を変更できない', async () => {
    const id = await createActivity()
    await request(app)
      .post(`/api/activities/${id}/actions`)
      .set(AS_GROUP_A)
      .send({
        type: 'report',
        report: {
          ...VALID_REPORT,
          beforePhotoUrls: ['/uploads/before.jpg'],
          afterPhotoUrls: ['/uploads/after.jpg'],
        },
        pickupRequest,
      })

    await request(app)
      .post(`/api/activities/${id}/pickup-actions`)
      .set(AS_GROUP_B)
      .send({ type: 'complete' })
      .expect(403)
  })

  it('回収不要の活動も電話連絡なしで報告できる', async () => {
    const id = await createActivity()
    const res = await request(app)
      .post(`/api/activities/${id}/actions`)
      .set(AS_GROUP_A)
      .send({
        type: 'report',
        report: {
          ...VALID_REPORT,
          beforePhotoUrls: ['/uploads/before.jpg'],
          afterPhotoUrls: ['/uploads/after.jpg'],
        },
        pickupRequest: { required: false },
      })
      .expect(200)

    expect(res.body.pickupRequest).toMatchObject({ status: 'not_required' })
  })

  it('実績確定時に報奨金データを自動生成しない', async () => {
    const id = await createActivity()
    await request(app)
      .post(`/api/activities/${id}/actions`)
      .set(AS_GROUP_A)
      .send({
        type: 'report',
        report: {
          ...VALID_REPORT,
          beforePhotoUrls: ['/uploads/before.jpg'],
          afterPhotoUrls: ['/uploads/after.jpg'],
        },
        pickupRequest: { required: false },
      })
    await request(app).post(`/api/activities/${id}/actions`).set(AS_CITY).send({ type: 'verify' }).expect(200)

    expect(repo.listPayments()).toHaveLength(0)
  })
})

describe('地域づくり推進課の回収管理', () => {
  it('回収待ち件数をダッシュボード統計で確認できる', async () => {
    const id = await createActivity()
    await request(app)
      .post(`/api/activities/${id}/actions`)
      .set(AS_GROUP_A)
      .send({
        type: 'report',
        report: {
          ...VALID_REPORT,
          beforePhotoUrls: ['/uploads/before.jpg'],
          afterPhotoUrls: ['/uploads/after.jpg'],
        },
        pickupRequest,
      })

    const stats = await request(app).get('/api/stats').set(AS_CITY).expect(200)
    expect(stats.body.pendingPickups).toBe(1)
  })

  it('年度別の活動実績を団体・活動種別・回収件数とともに集計する', async () => {
    const id = await createActivity()
    await request(app)
      .post(`/api/activities/${id}/actions`)
      .set(AS_GROUP_A)
      .send({
        type: 'report',
        report: {
          ...VALID_REPORT,
          workTypes: ['cleanup', 'weeding'],
          beforePhotoUrls: ['/uploads/before.jpg'],
          afterPhotoUrls: ['/uploads/after.jpg'],
        },
        pickupRequest,
      })
    await request(app).post(`/api/activities/${id}/actions`).set(AS_CITY).send({ type: 'verify' })

    const report = await request(app).get('/api/reports/annual?fiscalYear=2026').set(AS_CITY).expect(200)
    expect(report.body).toMatchObject({
      fiscalYear: 2026,
      totalActivities: 1,
      pickupRequests: 1,
      byWorkType: { cleanup: 1, weeding: 1 },
    })
    expect(report.body.byGroup[0]).toMatchObject({ groupId: 'g-a', activityCount: 1 })
  })
})

describe('団体ごとの情報分離', () => {
  it('団体一覧には自団体の活動だけを表示する', async () => {
    await request(app).post('/api/activities').set(AS_GROUP_A).send(NEW_ACTIVITY).expect(201)
    await request(app)
      .post('/api/activities')
      .set(AS_GROUP_B)
      .send({ ...NEW_ACTIVITY, title: 'ならまち清掃' })
      .expect(201)

    const res = await request(app).get('/api/activities').set(AS_GROUP_A).expect(200)
    expect(res.body).toHaveLength(1)
    expect(res.body[0].groupId).toBe('g-a')
  })

  it('他団体の活動詳細と回収場所は参照できない', async () => {
    const other = await request(app)
      .post('/api/activities')
      .set(AS_GROUP_B)
      .send({ ...NEW_ACTIVITY, title: 'ならまち清掃' })
      .expect(201)

    await request(app).get(`/api/activities/${other.body.id}`).set(AS_GROUP_A).expect(403)
  })
})
