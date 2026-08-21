import { describe, it, expect, beforeEach } from 'vitest'
import request from 'supertest'
import type { Express } from 'express'
import {
  createTestApp,
  AS_CITY,
  AS_GROUP_A,
  AS_GROUP_B,
  AS_MEMBER,
  AS_MEMBER2,
  NEW_ACTIVITY,
  VALID_REPORT,
} from './helpers'

let app: Express

beforeEach(() => {
  app = createTestApp().app
})

/** 申請 → 承認 → 報告 → 確認 まで進めた活動IDを返す */
async function completedActivity(): Promise<string> {
  const created = await request(app).post('/api/activities').set(AS_GROUP_A).send(NEW_ACTIVITY)
  const id = created.body.id as string
  await request(app).post(`/api/activities/${id}/actions`).set(AS_GROUP_A).send({ type: 'submit' })
  await request(app).post(`/api/activities/${id}/actions`).set(AS_CITY).send({ type: 'approve' })
  await request(app)
    .post(`/api/activities/${id}/actions`)
    .set(AS_GROUP_A)
    .send({ type: 'report', report: VALID_REPORT })
  await request(app).post(`/api/activities/${id}/actions`).set(AS_CITY).send({ type: 'verify' })
  return id
}

describe('認証', () => {
  it('利用者ヘッダがなければ 401', async () => {
    await request(app).get('/api/activities').expect(401)
  })

  it('存在しない利用者は 401', async () => {
    await request(app).get('/api/activities').set({ 'x-user-id': 'u-unknown' }).expect(401)
  })

  it('ログイン中の利用者情報を返す', async () => {
    const res = await request(app).get('/api/me').set(AS_MEMBER).expect(200)
    expect(res.body).toMatchObject({ id: 'u-member-1', role: 'member' })
    expect(res.body.rank).toBe('ブロンズ')
  })
})

describe('活動の申請と報告（デジタル化）', () => {
  it('団体は活動申請を作成できる', async () => {
    const res = await request(app).post('/api/activities').set(AS_GROUP_A).send(NEW_ACTIVITY).expect(201)
    expect(res.body).toMatchObject({ status: 'draft', groupId: 'g-a', wardId: 'saho' })
    expect(res.body.id).toBeTruthy()
  })

  it('個人メンバーは活動申請を作成できない', async () => {
    await request(app).post('/api/activities').set(AS_MEMBER).send(NEW_ACTIVITY).expect(403)
  })

  it('必須項目が欠けた申請は 400', async () => {
    await request(app)
      .post('/api/activities')
      .set(AS_GROUP_A)
      .send({ ...NEW_ACTIVITY, title: '' })
      .expect(400)
  })

  it('奈良市域外の座標は 400', async () => {
    await request(app)
      .post('/api/activities')
      .set(AS_GROUP_A)
      .send({ ...NEW_ACTIVITY, location: { lat: 34.69, lng: 135.5, address: '大阪市' } })
      .expect(400)
  })

  it('申請 → 承認 → 報告 → 確認 まで一連の流れが通る', async () => {
    const id = await completedActivity()
    const res = await request(app).get(`/api/activities/${id}`).set(AS_CITY).expect(200)
    expect(res.body.status).toBe('verified')
    expect(res.body.awardedPoints).toBeGreaterThan(0)
    expect(res.body.history).toHaveLength(4)
  })

  it('他団体は承認できない（403）', async () => {
    const created = await request(app).post('/api/activities').set(AS_GROUP_A).send(NEW_ACTIVITY)
    const id = created.body.id
    await request(app).post(`/api/activities/${id}/actions`).set(AS_GROUP_A).send({ type: 'submit' })
    await request(app).post(`/api/activities/${id}/actions`).set(AS_GROUP_B).send({ type: 'approve' }).expect(403)
  })

  it('順序を飛ばした遷移は 409', async () => {
    const created = await request(app).post('/api/activities').set(AS_GROUP_A).send(NEW_ACTIVITY)
    await request(app)
      .post(`/api/activities/${created.body.id}/actions`)
      .set(AS_CITY)
      .send({ type: 'approve' })
      .expect(409)
  })

  it('写真なしの報告書は 400 で拒否される', async () => {
    const created = await request(app).post('/api/activities').set(AS_GROUP_A).send(NEW_ACTIVITY)
    const id = created.body.id
    await request(app).post(`/api/activities/${id}/actions`).set(AS_GROUP_A).send({ type: 'submit' })
    await request(app).post(`/api/activities/${id}/actions`).set(AS_CITY).send({ type: 'approve' })
    await request(app)
      .post(`/api/activities/${id}/actions`)
      .set(AS_GROUP_A)
      .send({ type: 'report', report: { ...VALID_REPORT, photoUrls: [] } })
      .expect(400)
  })

  it('市は審査待ちの申請だけを絞り込める', async () => {
    const created = await request(app).post('/api/activities').set(AS_GROUP_A).send(NEW_ACTIVITY)
    await request(app).post(`/api/activities/${created.body.id}/actions`).set(AS_GROUP_A).send({ type: 'submit' })
    await request(app).post('/api/activities').set(AS_GROUP_B).send(NEW_ACTIVITY)

    const res = await request(app).get('/api/activities?status=submitted').set(AS_CITY).expect(200)
    expect(res.body).toHaveLength(1)
    expect(res.body[0].status).toBe('submitted')
  })
})

describe('ポイント制（継続的な活動）', () => {
  it('活動が確認されると団体の累計ポイントが増える', async () => {
    const before = await request(app).get('/api/groups/g-a').set(AS_GROUP_A)
    await completedActivity()
    const after = await request(app).get('/api/groups/g-a').set(AS_GROUP_A)
    expect(after.body.totalPoints).toBeGreaterThan(before.body.totalPoints)
  })

  it('団体のランキングをポイント順で取得できる', async () => {
    await completedActivity()
    const res = await request(app).get('/api/groups').set(AS_MEMBER).expect(200)
    expect(res.body[0].groupId).toBe('g-a')
    expect(res.body.map((g: { groupId: string }) => g.groupId)).toContain('g-b')
  })

  it('累計ポイントに応じてランクが上がる', async () => {
    for (let i = 0; i < 3; i++) await completedActivity()
    const res = await request(app).get('/api/groups/g-a').set(AS_GROUP_A)
    expect(res.body.rank).toBe('シルバー')
  })
})

describe('インセンティブの支払い', () => {
  it('活動が確認されると支払レコードが pending で作られる', async () => {
    const id = await completedActivity()
    const res = await request(app).get('/api/payments').set(AS_CITY).expect(200)
    expect(res.body).toHaveLength(1)
    expect(res.body[0]).toMatchObject({ activityId: id, status: 'pending', amount: 3000 + 4650 })
  })

  it('団体は自団体の支払しか見られない', async () => {
    await completedActivity()
    const res = await request(app).get('/api/payments').set(AS_GROUP_B).expect(200)
    expect(res.body).toHaveLength(0)
  })

  it('市以外は支払を確定できない', async () => {
    await completedActivity()
    const p = await request(app).get('/api/payments').set(AS_CITY)
    await request(app)
      .post(`/api/payments/${p.body[0].id}/schedule`)
      .set(AS_GROUP_A)
      .send({ scheduledDate: '2026-07-31' })
      .expect(403)
  })

  it('市が支払を確定すると scheduled になる', async () => {
    await completedActivity()
    const p = await request(app).get('/api/payments').set(AS_CITY)
    const res = await request(app)
      .post(`/api/payments/${p.body[0].id}/schedule`)
      .set(AS_CITY)
      .send({ scheduledDate: '2026-07-31' })
      .expect(200)
    expect(res.body).toMatchObject({ status: 'scheduled', scheduledDate: '2026-07-31' })
  })

  it('確定済みの支払を振込CSVとしてダウンロードできる', async () => {
    await completedActivity()
    const p = await request(app).get('/api/payments').set(AS_CITY)
    await request(app)
      .post(`/api/payments/${p.body[0].id}/schedule`)
      .set(AS_CITY)
      .send({ scheduledDate: '2026-07-31' })

    const res = await request(app).get('/api/payments/transfer.csv').set(AS_CITY).expect(200)
    expect(res.headers['content-type']).toContain('text/csv')
    expect(res.headers['content-disposition']).toContain('.csv')
    expect(res.text).toContain('金融機関コード')
    expect(res.text).toContain('7650')
  })

  it('振込CSVは市の職員しか取得できない', async () => {
    await request(app).get('/api/payments/transfer.csv').set(AS_GROUP_A).expect(403)
  })
})

describe('イベント募集（個人の参加）', () => {
  const newEvent = {
    title: '朝活クリーン＠奈良公園',
    description: '7時集合。道具は貸出します。学生歓迎！',
    startsAt: '2026-10-20T07:00:00.000Z',
    hours: 1,
    meetingPoint: { lat: 34.685, lng: 135.843, address: '奈良公園 登大路園地' },
    wardId: 'nara-park',
    capacity: 2,
    applicationDeadline: '2026-10-19T00:00:00.000Z',
    pointsReward: 100,
  }

  it('団体はイベントを掲載できる', async () => {
    const res = await request(app).post('/api/events').set(AS_GROUP_A).send(newEvent).expect(201)
    expect(res.body).toMatchObject({ groupId: 'g-a', capacity: 2 })
  })

  it('個人はイベントを掲載できない', async () => {
    await request(app).post('/api/events').set(AS_MEMBER).send(newEvent).expect(403)
  })

  it('個人はイベントに申し込める（残席あり → confirmed）', async () => {
    const e = await request(app).post('/api/events').set(AS_GROUP_A).send(newEvent)
    const res = await request(app).post(`/api/events/${e.body.id}/join`).set(AS_MEMBER).expect(200)
    expect(res.body.status).toBe('confirmed')
    expect(res.body.event.remainingSeats).toBe(1)
  })

  it('定員が埋まると waitlisted になる', async () => {
    const e = await request(app).post('/api/events').set(AS_GROUP_A).send({ ...newEvent, capacity: 1 })
    await request(app).post(`/api/events/${e.body.id}/join`).set(AS_MEMBER)
    const res = await request(app).post(`/api/events/${e.body.id}/join`).set(AS_MEMBER2).expect(200)
    expect(res.body.status).toBe('waitlisted')
  })

  it('二重申込は 409', async () => {
    const e = await request(app).post('/api/events').set(AS_GROUP_A).send(newEvent)
    await request(app).post(`/api/events/${e.body.id}/join`).set(AS_MEMBER)
    await request(app).post(`/api/events/${e.body.id}/join`).set(AS_MEMBER).expect(409)
  })

  it('キャンセルするとキャンセル待ちが繰り上がる', async () => {
    const e = await request(app).post('/api/events').set(AS_GROUP_A).send({ ...newEvent, capacity: 1 })
    await request(app).post(`/api/events/${e.body.id}/join`).set(AS_MEMBER)
    await request(app).post(`/api/events/${e.body.id}/join`).set(AS_MEMBER2)
    await request(app).delete(`/api/events/${e.body.id}/join`).set(AS_MEMBER).expect(200)

    const res = await request(app).get(`/api/events/${e.body.id}`).set(AS_MEMBER2)
    const me2 = res.body.participants.find((p: { memberId: string }) => p.memberId === 'u-member-2')
    expect(me2.status).toBe('confirmed')
  })

  it('募集中のイベント一覧は誰でも見られる', async () => {
    await request(app).post('/api/events').set(AS_GROUP_A).send(newEvent)
    const res = await request(app).get('/api/events').set(AS_MEMBER).expect(200)
    expect(res.body).toHaveLength(1)
    expect(res.body[0].groupName).toBeTruthy()
  })

  describe('出席確定と個人ポイントの付与', () => {
    async function joinedEvent(): Promise<string> {
      const e = await request(app).post('/api/events').set(AS_GROUP_A).send(newEvent)
      await request(app).post(`/api/events/${e.body.id}/join`).set(AS_MEMBER)
      return e.body.id as string
    }

    it('主催団体が出席を確定すると参加者にポイントが付く', async () => {
      const id = await joinedEvent()
      await request(app)
        .post(`/api/events/${id}/attendance`)
        .set(AS_GROUP_A)
        .send({ memberIds: ['u-member-1'] })
        .expect(200)

      // 21歳・初参加・1時間 → floor(30 × 1.5) + 歓迎ボーナス100
      const me = await request(app).get('/api/me').set(AS_MEMBER).expect(200)
      expect(me.body.totalPoints).toBe(145)
    })

    it('主催団体以外は出席を確定できない', async () => {
      const id = await joinedEvent()
      await request(app)
        .post(`/api/events/${id}/attendance`)
        .set(AS_GROUP_B)
        .send({ memberIds: ['u-member-1'] })
        .expect(403)
    })

    it('同じイベントで二重にポイントは付かない', async () => {
      const id = await joinedEvent()
      const body = { memberIds: ['u-member-1'] }
      await request(app).post(`/api/events/${id}/attendance`).set(AS_GROUP_A).send(body)
      await request(app).post(`/api/events/${id}/attendance`).set(AS_GROUP_A).send(body).expect(200)

      const me = await request(app).get('/api/me').set(AS_MEMBER)
      expect(me.body.totalPoints).toBe(145)
    })

    it('申し込んでいない人は出席確定できない', async () => {
      const id = await joinedEvent()
      const res = await request(app)
        .post(`/api/events/${id}/attendance`)
        .set(AS_GROUP_A)
        .send({ memberIds: ['u-member-2'] })
        .expect(200)
      expect(res.body.awarded).toHaveLength(0)
    })

    it('参加履歴はマイページから確認できる', async () => {
      const id = await joinedEvent()
      await request(app).post(`/api/events/${id}/attendance`).set(AS_GROUP_A).send({ memberIds: ['u-member-1'] })
      const me = await request(app).get('/api/me').set(AS_MEMBER)
      expect(me.body.history).toHaveLength(1)
      expect(me.body.history[0]).toMatchObject({ eventTitle: newEvent.title, points: 145 })
    })
  })
})

describe('団体間コミュニケーション', () => {
  it('団体は掲示板に投稿できる', async () => {
    const res = await request(app)
      .post('/api/board')
      .set(AS_GROUP_A)
      .send({ body: 'トング10本余っています。貸出可能です。', category: '資機材' })
      .expect(201)
    expect(res.body.groupId).toBe('g-a')
  })

  it('個人メンバーは投稿できないが閲覧はできる', async () => {
    await request(app).post('/api/board').set(AS_MEMBER).send({ body: 'こんにちは', category: '雑談' }).expect(403)
    await request(app).get('/api/board').set(AS_MEMBER).expect(200)
  })

  it('投稿は新しい順に並ぶ', async () => {
    await request(app).post('/api/board').set(AS_GROUP_A).send({ body: '1つ目', category: '雑談' })
    await request(app).post('/api/board').set(AS_GROUP_B).send({ body: '2つ目', category: '雑談' })
    const res = await request(app).get('/api/board').set(AS_CITY).expect(200)
    expect(res.body[0].body).toBe('2つ目')
    expect(res.body[0].groupName).toBe('ならまち美化クラブ')
  })
})

describe('地図による活動実績の可視化', () => {
  it('確認済みの活動だけが地図に表示される', async () => {
    await request(app).post('/api/activities').set(AS_GROUP_B).send(NEW_ACTIVITY) // draft のまま
    await completedActivity()
    const res = await request(app).get('/api/map/activities').set(AS_MEMBER).expect(200)
    expect(res.body).toHaveLength(1)
    expect(res.body[0]).toMatchObject({ lat: 34.697, lng: 135.808, garbageKg: 46.5 })
  })

  it('地区別の集計を返す', async () => {
    await completedActivity()
    const res = await request(app).get('/api/map/wards').set(AS_MEMBER).expect(200)
    expect(res.body[0]).toMatchObject({ wardId: 'saho', activityCount: 1, garbageKg: 46.5 })
    expect(res.body[0].wardName).toBe('佐保')
  })

  it('ヒートマップ用のメッシュ集計を返す', async () => {
    await completedActivity()
    const res = await request(app).get('/api/map/heat?cellSize=0.01').set(AS_MEMBER).expect(200)
    expect(res.body).toHaveLength(1)
    expect(res.body[0].garbageKg).toBe(46.5)
  })

  it('市全体のサマリを返す', async () => {
    await completedActivity()
    const res = await request(app).get('/api/stats').set(AS_MEMBER).expect(200)
    expect(res.body).toMatchObject({ totalGarbageKg: 46.5, totalActivities: 1, totalParticipants: 18 })
  })
})
