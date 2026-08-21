import { createDb } from '@/db/schema'
import { Repo } from '@/db/repo'
import { seedBaseline } from '@/db/seed'
import { createApp } from '@/server/app'

/** テスト用: インメモリDB + 基礎データ（利用者・団体・地区）を積んだアプリを作る */
export function createTestApp() {
  const db = createDb(':memory:')
  const repo = new Repo(db)
  seedBaseline(repo)
  return { app: createApp(repo), repo, db }
}

export const AS_CITY = { 'x-user-id': 'u-city' }
export const AS_GROUP_A = { 'x-user-id': 'u-group-a' }
export const AS_GROUP_B = { 'x-user-id': 'u-group-b' }
export const AS_MEMBER = { 'x-user-id': 'u-member-1' }
export const AS_MEMBER2 = { 'x-user-id': 'u-member-2' }

export const NEW_ACTIVITY = {
  title: '佐保川河川敷クリーン作戦',
  wardId: 'saho',
  scheduledDate: '2026-06-14',
  location: { lat: 34.697, lng: 135.808, address: '奈良市法蓮町 佐保川河川敷' },
  plannedParticipants: 20,
}

export const VALID_REPORT = {
  actualParticipants: 18,
  hours: 2,
  garbageKg: 46.5,
  photoUrls: ['/uploads/demo-1.jpg', '/uploads/demo-2.jpg'],
  comment: 'ペットボトルと空き缶が中心。若い参加者が6名。',
}
