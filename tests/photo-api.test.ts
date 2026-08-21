/**
 * 写真の保存・配信（server 層）の API テスト。
 *
 * ドメイン層の検証（decodePhotoDataUrl / assertPhotoCount / isSafePhotoFileName）は
 * tests/photo.test.ts でカバー済みのため、ここでは
 * 「投稿 → 実ファイル保存 → 配信」という I/O を含む一連の流れと、
 * 誰が投稿・閲覧できるか（認可）を検証する。
 *
 * このプロジェクトには「一覧は role で絞っているのに詳細取得（GET /activities/:id）が
 * 素通りする」という既知の欠陥パターンがある。9・10 のテストは、写真の配信
 * （GET /api/photos/:activityId/:fileName）で同じ穴を作らないための再発防止テストである。
 * 審査中（reported 等）の活動の写真は所有団体・市職員以外に見せてはならず、
 * 確認済み（verified/paid）の活動の写真だけを全ロールに公開してよい。
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import request from 'supertest'
import type { Express } from 'express'
import { mkdtempSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { AS_CITY, AS_GROUP_A, AS_GROUP_B, AS_MEMBER, NEW_ACTIVITY, VALID_REPORT, createTestApp } from './helpers'
import { MAX_PHOTOS_PER_REPORT, MAX_PHOTO_BYTES } from '@/domain/photo'

/** JPEG のマジックバイト（先頭3バイト）に適当なペイロードを続けたバイト列を作る（tests/photo.test.ts と同じ流儀） */
const jpegBytes = (payloadLength = 16): Uint8Array => {
  const bytes = new Uint8Array(3 + payloadLength)
  bytes.set([0xff, 0xd8, 0xff], 0)
  for (let i = 0; i < payloadLength; i++) bytes[3 + i] = i % 256
  return bytes
}

const toDataUrl = (mime: string, bytes: Uint8Array): string =>
  `data:${mime};base64,${Buffer.from(bytes).toString('base64')}`

let app: Express
let photoDir: string

beforeEach(() => {
  // 実ファイルの読み書きは必ず一時ディレクトリに隔離する。data/ を汚さない。
  photoDir = mkdtempSync(join(tmpdir(), 'nara-clean-photos-'))
  process.env.NARA_CLEAN_PHOTO_DIR = photoDir
  app = createTestApp().app
})

afterEach(() => {
  delete process.env.NARA_CLEAN_PHOTO_DIR
  rmSync(photoDir, { recursive: true, force: true })
})

/** 活動を draft で作成し、id を返す */
async function createDraftActivity(): Promise<string> {
  const res = await request(app).post('/api/activities').set(AS_GROUP_A).send(NEW_ACTIVITY)
  return res.body.id as string
}

/** 活動を「審査中（reported）」まで進める */
async function progressToReported(id: string): Promise<void> {
  await request(app).post(`/api/activities/${id}/actions`).set(AS_GROUP_A).send({ type: 'submit' })
  await request(app).post(`/api/activities/${id}/actions`).set(AS_CITY).send({ type: 'approve' })
  await request(app)
    .post(`/api/activities/${id}/actions`)
    .set(AS_GROUP_A)
    .send({ type: 'report', report: VALID_REPORT })
}

/** 活動を「確認済み（verified）」まで進める */
async function progressToVerified(id: string): Promise<void> {
  await progressToReported(id)
  await request(app).post(`/api/activities/${id}/actions`).set(AS_CITY).send({ type: 'verify' })
}

describe('写真の投稿と配信', () => {
  it('1. 所有団体は写真を投稿できる（配信用URLが返り、実ファイルが書かれる）', async () => {
    const id = await createDraftActivity()
    const dataUrl = toDataUrl('image/jpeg', jpegBytes())

    const res = await request(app)
      .post(`/api/activities/${id}/photos`)
      .set(AS_GROUP_A)
      .send({ photos: [dataUrl] })
      .expect(201)

    expect(Array.isArray(res.body.urls)).toBe(true)
    expect(res.body.urls).toHaveLength(1)

    // 一時ディレクトリに実ファイルが書かれていることを確認する
    const written = readdirSync(photoDir, { recursive: true }) as string[]
    expect(written.length).toBeGreaterThan(0)
  })

  it('2. 投稿した写真を取得できる（Content-Type と本文バイト列が一致する）', async () => {
    const id = await createDraftActivity()
    const bytes = jpegBytes(32)
    const dataUrl = toDataUrl('image/jpeg', bytes)

    const posted = await request(app)
      .post(`/api/activities/${id}/photos`)
      .set(AS_GROUP_A)
      .send({ photos: [dataUrl] })
      .expect(201)

    const url = posted.body.urls[0] as string
    const got = await request(app).get(url).set(AS_GROUP_A).expect(200)

    expect(got.headers['content-type']).toContain('image/jpeg')
    expect(Buffer.compare(got.body as Buffer, Buffer.from(bytes))).toBe(0)
  })

  it('3. 他団体は投稿できない（403 / FORBIDDEN）', async () => {
    const id = await createDraftActivity()
    const dataUrl = toDataUrl('image/jpeg', jpegBytes())

    const res = await request(app)
      .post(`/api/activities/${id}/photos`)
      .set(AS_GROUP_B)
      .send({ photos: [dataUrl] })
      .expect(403)

    expect(res.body.code).toBe('FORBIDDEN')
  })

  it('4. 市職員は投稿できない（報告するのは団体であるため 403 / FORBIDDEN）', async () => {
    const id = await createDraftActivity()
    const dataUrl = toDataUrl('image/jpeg', jpegBytes())

    const res = await request(app)
      .post(`/api/activities/${id}/photos`)
      .set(AS_CITY)
      .send({ photos: [dataUrl] })
      .expect(403)

    expect(res.body.code).toBe('FORBIDDEN')
  })

  it('5. 不正な data URL は 400（VALIDATION）', async () => {
    const id = await createDraftActivity()

    const res = await request(app)
      .post(`/api/activities/${id}/photos`)
      .set(AS_GROUP_A)
      .send({ photos: ['data:image/jpeg,これはbase64ではない'] })
      .expect(400)

    expect(res.body.code).toBe('VALIDATION')
  })

  it('6. サイズ超過は 413（TOO_LARGE のマッピング確認）', async () => {
    const id = await createDraftActivity()
    const oversized = jpegBytes(MAX_PHOTO_BYTES + 1 - 3)
    const dataUrl = toDataUrl('image/jpeg', oversized)

    const res = await request(app)
      .post(`/api/activities/${id}/photos`)
      .set(AS_GROUP_A)
      .send({ photos: [dataUrl] })
      .expect(413)

    expect(res.body.code).toBe('TOO_LARGE')
  })

  it('7. 枚数超過は 400（VALIDATION）', async () => {
    const id = await createDraftActivity()
    const dataUrl = toDataUrl('image/jpeg', jpegBytes())
    const photos = Array.from({ length: MAX_PHOTOS_PER_REPORT + 1 }, () => dataUrl)

    const res = await request(app)
      .post(`/api/activities/${id}/photos`)
      .set(AS_GROUP_A)
      .send({ photos })
      .expect(400)

    expect(res.body.code).toBe('VALIDATION')
  })

  it('8. パストラバーサルを狙ったファイル名は拒否される（一時ディレクトリの外を読ませない）', async () => {
    const id = await createDraftActivity()

    // ../../secret.jpg のような相対パスを URL エンコードして送る。
    // isSafePhotoFileName の許可リストで弾かれ、一時ディレクトリの外のファイルには
    // 一切到達できないことを担保する意図のテスト。
    const res = await request(app).get(`/api/photos/${id}/..%2F..%2Fsecret.jpg`).set(AS_GROUP_A)

    expect(res.status).not.toBe(200)
    expect([400, 404]).toContain(res.status)
  })

  it('9. 審査中（reported）の活動の写真は所有団体・市以外から見えない（詳細取得の素通りを再発させない）', async () => {
    const id = await createDraftActivity()
    const dataUrl = toDataUrl('image/jpeg', jpegBytes())

    const posted = await request(app)
      .post(`/api/activities/${id}/photos`)
      .set(AS_GROUP_A)
      .send({ photos: [dataUrl] })
      .expect(201)
    const url = posted.body.urls[0] as string

    await progressToReported(id)

    const asGroupB = await request(app).get(url).set(AS_GROUP_B)
    expect(asGroupB.status).not.toBe(200)

    const asMember = await request(app).get(url).set(AS_MEMBER)
    expect(asMember.status).not.toBe(200)

    await request(app).get(url).set(AS_GROUP_A).expect(200)
    await request(app).get(url).set(AS_CITY).expect(200)
  })

  it('10. 確認済み（verified）の活動の写真は個人メンバーからも見える', async () => {
    const id = await createDraftActivity()
    const dataUrl = toDataUrl('image/jpeg', jpegBytes())

    const posted = await request(app)
      .post(`/api/activities/${id}/photos`)
      .set(AS_GROUP_A)
      .send({ photos: [dataUrl] })
      .expect(201)
    const url = posted.body.urls[0] as string

    await progressToVerified(id)

    await request(app).get(url).set(AS_MEMBER).expect(200)
  })
})
