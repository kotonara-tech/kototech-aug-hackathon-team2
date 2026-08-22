import { beforeEach, describe, expect, it } from 'vitest'
import request from 'supertest'
import type { Express } from 'express'
import { createDb } from '@/db/schema'
import { Repo } from '@/db/repo'
import { seedBaseline, seedDemo } from '@/db/seed'
import { createApp } from '@/server/app'
import { AS_CITY, AS_GROUP_A, AS_MEMBER, VALID_REPORT } from './helpers'

let app: Express
let repo: Repo

beforeEach(() => {
  repo = new Repo(createDb(':memory:'))
  seedBaseline(repo)
  seedDemo(repo, '2026-08-22T00:00:00.000Z')
  app = createApp(repo)
})

describe('デモ用の団体フロー', () => {
  it('団体画面に事前承認なしで報告できるdraft活動が用意される', async () => {
    const list = await request(app).get('/api/activities?status=draft').set(AS_GROUP_A).expect(200)
    expect(list.body).toHaveLength(1)

    const activity = list.body[0]
    const reported = await request(app)
      .post(`/api/activities/${activity.id}/actions`)
      .set(AS_GROUP_A)
      .send({
        type: 'report',
        report: {
          ...VALID_REPORT,
          beforePhotoUrls: ['/api/photos/demo/before.png'],
          afterPhotoUrls: ['/api/photos/demo/after.png'],
          workTypes: ['cleanup'],
        },
        pickupRequest: {
          required: true,
          wasteTypes: ['burnable'],
          bagCount: 3,
          location: activity.location,
          preferredDate: '2026-08-24',
          note: 'デモ用の回収依頼',
        },
      })
      .expect(200)

    expect(reported.body.status).toBe('reported')
    expect(reported.body.pickupRequest.status).toBe('requested')

    const scheduled = await request(app)
      .post(`/api/activities/${activity.id}/pickup-actions`)
      .set(AS_CITY)
      .send({ type: 'schedule', scheduledDate: '2026-08-24' })
      .expect(200)

    expect(scheduled.body.pickupRequest).toMatchObject({
      status: 'scheduled',
      scheduledDate: '2026-08-24',
    })
    expect(scheduled.body.history.at(-1)).toMatchObject({
      action: 'schedulePickup',
      actorId: 'u-city',
      note: '回収予定日: 2026-08-24',
    })
  })
})

describe('デモ用の個人参加フロー', () => {
  it('個人が団体の募集を一覧し、参加申込できる', async () => {
    const list = await request(app).get('/api/events').set(AS_MEMBER).expect(200)
    const event = list.body.find((candidate: { id: string }) => candidate.id === 'ev-morning')
    expect(event).toBeTruthy()

    const joined = await request(app).post(`/api/events/${event.id}/join`).set(AS_MEMBER).expect(200)
    expect(joined.body.status).toBe('confirmed')
  })

  it('画面が接続先APIのデモ対応バージョンを判別できる', async () => {
    const health = await request(app).get('/api/health').expect(200)
    expect(health.body).toMatchObject({ ok: true, apiVersion: 'green-support-v2' })
  })

  it('市職員はデモ後の写真確認待ちと回収待ちを確認できる', async () => {
    const stats = await request(app).get('/api/stats').set(AS_CITY).expect(200)
    expect(stats.body.pendingPickups).toBeGreaterThanOrEqual(1)
  })
})
