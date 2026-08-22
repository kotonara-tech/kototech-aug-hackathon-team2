/** 初期データ投入。地区マスタは奈良市の地区区分に対応させている。 */
import { createDb } from './schema.js'
import { Repo, fiscalYearOf } from './repo.js'
import { createActivity, transition } from '../domain/activity.js'
import { joinEvent } from '../domain/event.js'
import { createPost } from '../domain/board.js'
import { calculateIncentive } from '../domain/incentive.js'
import type { Actor, Park, VolunteerEvent } from '../domain/types.js'

export const WARDS = [
  { id: 'saho', name: '佐保', lat: 34.697, lng: 135.808 },
  { id: 'sahogawa', name: '佐保川', lat: 34.671, lng: 135.812 },
  { id: 'naramachi', name: 'ならまち', lat: 34.678, lng: 135.83 },
  { id: 'nara-park', name: '奈良公園', lat: 34.685, lng: 135.843 },
  { id: 'omiya', name: '大宮', lat: 34.686, lng: 135.812 },
  { id: 'mikasa', name: '三笠', lat: 34.7, lng: 135.84 },
  { id: 'heijo', name: '平城', lat: 34.706, lng: 135.788 },
  { id: 'miyato', name: '都跡', lat: 34.678, lng: 135.78 },
  { id: 'rokujo', name: '六条', lat: 34.665, lng: 135.782 },
  { id: 'fushimi', name: '伏見', lat: 34.693, lng: 135.766 },
  { id: 'tomio', name: '富雄', lat: 34.687, lng: 135.735 },
  { id: 'tomigaoka', name: '登美ヶ丘', lat: 34.712, lng: 135.727 },
  { id: 'asuka', name: '飛鳥', lat: 34.673, lng: 135.828 },
  { id: 'tatsuichi', name: '辰市', lat: 34.652, lng: 135.8 },
  { id: 'obitoke', name: '帯解', lat: 34.641, lng: 135.808 },
  { id: 'higashiichi', name: '東市', lat: 34.635, lng: 135.83 },
  { id: 'tawara', name: '田原', lat: 34.65, lng: 135.9 },
  { id: 'yagyu', name: '柳生', lat: 34.72, lng: 135.95 },
  { id: 'tsuge', name: '都祁', lat: 34.605, lng: 135.93 },
  { id: 'tsukigase', name: '月ヶ瀬', lat: 34.66, lng: 136.02 },
] as const

/** テストと本番デモの両方が前提にする最小データ（地区・団体・利用者） */
export function seedBaseline(repo: Repo): void {
  for (const w of WARDS) repo.upsertWard({ ...w })

  repo.insertGroup({
    id: 'g-a',
    name: '佐保川をきれいにする会',
    contact: 'saho@example.nara.jp',
    totalPoints: 0,
    bank: {
      bankCode: '0009',
      branchCode: '567',
      accountType: '普通',
      accountNumber: '1234567',
      accountHolderKana: 'ｻﾎｶﾞﾜｦｷﾚｲﾆｽﾙｶｲ',
    },
    createdAt: '2024-04-01T00:00:00.000Z',
  })

  repo.insertGroup({
    id: 'g-b',
    name: 'ならまち美化クラブ',
    contact: 'naramachi@example.nara.jp',
    totalPoints: 0,
    bank: {
      bankCode: '0005',
      branchCode: '123',
      accountType: '当座',
      accountNumber: '7654321',
      accountHolderKana: 'ﾅﾗﾏﾁﾋﾞｶｸﾗﾌﾞ',
    },
    createdAt: '2025-06-01T00:00:00.000Z',
  })

  repo.insertGroup({
    id: 'g-c',
    name: '奈良女子大 環境サークル',
    contact: 'campus@example.nara.jp',
    totalPoints: 0,
    bank: {
      bankCode: '0009',
      branchCode: '210',
      accountType: '普通',
      accountNumber: '2223334',
      accountHolderKana: 'ﾅﾗｼﾞｮｼﾀﾞｲｶﾝｷｮｳｻｰｸﾙ',
    },
    createdAt: '2026-04-10T00:00:00.000Z',
  })

  const users: Parameters<Repo['insertUser']>[0][] = [
    { id: 'u-city', name: '奈良市 地域づくり推進課', role: 'city', groupId: null, age: null, totalPoints: 0 },
    { id: 'u-group-a', name: '田中（佐保川をきれいにする会）', role: 'group', groupId: 'g-a', age: 68, totalPoints: 0 },
    { id: 'u-group-b', name: '西村（ならまち美化クラブ）', role: 'group', groupId: 'g-b', age: 54, totalPoints: 0 },
    { id: 'u-group-c', name: '森本（奈良女子大 環境サークル）', role: 'group', groupId: 'g-c', age: 20, totalPoints: 0 },
    { id: 'u-member-1', name: 'あかり', role: 'member', groupId: null, age: 21, totalPoints: 0 },
    { id: 'u-member-2', name: '山田', role: 'member', groupId: null, age: 45, totalPoints: 0 },
    { id: 'u-member-3', name: 'ゆうと', role: 'member', groupId: null, age: 19, totalPoints: 0 },
  ]
  for (const u of users) repo.insertUser(u)
}

/* ---------------- デモ用データ（開発サーバ起動時に使う） ---------------- */

const CITY: Actor = { id: 'u-city', role: 'city', groupId: null }
const asGroup = (groupId: string): Actor => ({ id: `u-group-${groupId.slice(2)}`, role: 'group', groupId })

/**
 * 公園マスタ（デモ用）。
 * 座標はデモ用の概算値であり奈良市の公式データではない。実運用では奈良市の公園台帳等に差し替える。
 * 「未清掃」の公園を含めて3パターン（未清掃／1年以上放置／直近清掃済み）が揃うように
 * DEMO_ACTIVITIES 側の parkId 割り当てと合わせて調整している。
 */
const PARKS: Park[] = [
  // --- 直近清掃済み（DEMO_ACTIVITIES で parkId を割り当てる） ---
  { id: 'park-nara-koen', name: '奈良公園', wardId: 'nara-park', lat: 34.6873, lng: 135.8398 },
  { id: 'park-konoike', name: '鴻ノ池運動公園', wardId: 'saho', lat: 34.7025, lng: 135.8033 },
  { id: 'park-sahogawa', name: '佐保川河川敷緑地', wardId: 'sahogawa', lat: 34.669, lng: 135.8105 },
  { id: 'park-mugitani', name: 'ならまち麦谷公園', wardId: 'naramachi', lat: 34.6765, lng: 135.8285 },
  { id: 'park-omiya', name: '大宮南公園', wardId: 'omiya', lat: 34.6855, lng: 135.8115 },
  { id: 'park-kasugano', name: '春日野園地', wardId: 'mikasa', lat: 34.6825, lng: 135.8465 },
  // --- 1年以上放置（DEMO_ACTIVITIES に古い日付の実績を追加して割り当てる） ---
  { id: 'park-heijo', name: '平城宮跡歴史公園', wardId: 'heijo', lat: 34.6851, lng: 135.7955 },
  { id: 'park-daianji', name: '大安寺西公園', wardId: 'rokujo', lat: 34.663, lng: 135.786 },
  { id: 'park-akishinogawa', name: '秋篠川緑地公園', wardId: 'miyato', lat: 34.681, lng: 135.776 },
  // --- 一度も未清掃（どの活動にも紐づけない） ---
  { id: 'park-gakuenmae', name: '学園前中央公園', wardId: 'tomigaoka', lat: 34.709, lng: 135.729 },
  { id: 'park-tomiogawa', name: '富雄川親水公園', wardId: 'tomio', lat: 34.685, lng: 135.732 },
  { id: 'park-obitoke', name: '帯解グラウンド公園', wardId: 'obitoke', lat: 34.639, lng: 135.806 },
  { id: 'park-tsuge', name: '都祁高原公園', wardId: 'tsuge', lat: 34.607, lng: 135.928 },
]

interface DemoActivity {
  groupId: string
  title: string
  wardId: string
  date: string
  lat: number
  lng: number
  address: string
  participants: number
  hours: number
  garbageKg: number
  /** 清掃対象の公園マスタID。指定すると公園の清掃実績として集計される */
  parkId?: string
}

const DEMO_ACTIVITIES: DemoActivity[] = [
  // --- 直近清掃済み（2026年4〜7月） ---
  { groupId: 'g-a', title: '佐保川 桜並木クリーン作戦', wardId: 'saho', date: '2026-04-05', lat: 34.697, lng: 135.808, address: '奈良市法蓮町 佐保川河川敷', participants: 24, hours: 2, garbageKg: 58.5, parkId: 'park-konoike' },
  { groupId: 'g-a', title: '佐保川 定例清掃（5月）', wardId: 'saho', date: '2026-05-10', lat: 34.699, lng: 135.809, address: '奈良市法蓮町 佐保川河川敷', participants: 18, hours: 2, garbageKg: 42, parkId: 'park-konoike' },
  { groupId: 'g-a', title: '佐保川 定例清掃（6月）', wardId: 'sahogawa', date: '2026-06-07', lat: 34.671, lng: 135.812, address: '奈良市杏町 佐保川下流', participants: 21, hours: 2, garbageKg: 47.5, parkId: 'park-sahogawa' },
  { groupId: 'g-b', title: 'ならまち格子の家周辺 美化活動', wardId: 'naramachi', date: '2026-04-19', lat: 34.678, lng: 135.83, address: '奈良市元興寺町', participants: 15, hours: 1.5, garbageKg: 31, parkId: 'park-mugitani' },
  { groupId: 'g-b', title: '猿沢池ライトアップ後の清掃', wardId: 'nara-park', date: '2026-05-24', lat: 34.681, lng: 135.833, address: '奈良市登大路町 猿沢池', participants: 30, hours: 2, garbageKg: 76.5, parkId: 'park-nara-koen' },
  { groupId: 'g-c', title: '大学前 通学路クリーンアップ', wardId: 'omiya', date: '2026-06-13', lat: 34.686, lng: 135.812, address: '奈良市北魚屋東町', participants: 12, hours: 1, garbageKg: 18.5, parkId: 'park-omiya' },
  { groupId: 'g-c', title: '若草山ふもと ごみ拾いウォーク', wardId: 'mikasa', date: '2026-07-04', lat: 34.7, lng: 135.84, address: '奈良市雑司町', participants: 26, hours: 2, garbageKg: 39, parkId: 'park-kasugano' },
  { groupId: 'g-b', title: '東向商店街 早朝清掃', wardId: 'naramachi', date: '2026-07-12', lat: 34.684, lng: 135.827, address: '奈良市東向中町', participants: 9, hours: 1, garbageKg: 12.5, parkId: 'park-mugitani' },
  // --- 1年以上放置（2024〜2025年前半に確認済みの実績を残し、以降は誰も清掃していない） ---
  { groupId: 'g-b', title: '平城宮跡 冬の一斉清掃', wardId: 'heijo', date: '2024-11-09', lat: 34.6851, lng: 135.7955, address: '奈良市佐紀町 平城宮跡歴史公園', participants: 20, hours: 2, garbageKg: 33.5, parkId: 'park-heijo' },
  { groupId: 'g-a', title: '大安寺西公園 春の清掃活動', wardId: 'rokujo', date: '2025-03-15', lat: 34.663, lng: 135.786, address: '奈良市大安寺西二丁目', participants: 14, hours: 1.5, garbageKg: 22, parkId: 'park-daianji' },
  { groupId: 'g-c', title: '秋篠川緑地 清掃ボランティア', wardId: 'miyato', date: '2025-06-01', lat: 34.681, lng: 135.776, address: '奈良市秋篠町 秋篠川緑地', participants: 10, hours: 1, garbageKg: 15.5, parkId: 'park-akishinogawa' },
]

export function seedDemo(repo: Repo, now = new Date().toISOString()): void {
  // 公園マスタを先に投入する（清掃実績側から parkId で参照するため）
  for (const p of PARKS) repo.upsertPark(p)

  // 過去の活動: 申請 → 承認 → 報告 → 確認 まで通し、実績として地図に載る状態にする
  for (const d of DEMO_ACTIVITIES) {
    const actor = asGroup(d.groupId)
    let activity = createActivity(
      {
        groupId: d.groupId,
        title: d.title,
        wardId: d.wardId,
        scheduledDate: d.date,
        location: { lat: d.lat, lng: d.lng, address: d.address },
        plannedParticipants: d.participants,
        consecutiveMonths: repo.consecutiveMonths(d.groupId, new Date(d.date)),
      },
      `${d.date}T00:00:00.000Z`,
    )
    // createActivity は parkId を引き継がないため、生成直後に付与する（以降 transition は spread で保持する）
    if (d.parkId) activity = { ...activity, parkId: d.parkId }
    const at = `${d.date}T09:00:00.000Z`
    activity = transition(activity, { type: 'submit', actor }, at)
    activity = transition(activity, { type: 'approve', actor: CITY }, at)
    activity = transition(
      activity,
      {
        type: 'report',
        actor,
        report: {
          actualParticipants: d.participants,
          hours: d.hours,
          garbageKg: d.garbageKg,
          photoUrls: [`/photos/${d.wardId}-before.jpg`, `/photos/${d.wardId}-after.jpg`],
          beforePhotoUrls: [`/photos/${d.wardId}-before.jpg`],
          afterPhotoUrls: [`/photos/${d.wardId}-after.jpg`],
          workTypes: ['cleanup'],
          comment: 'ペットボトル・空き缶が中心でした。',
        },
        pickupRequest:
          d.date === '2026-07-12'
            ? {
                required: true,
                wasteTypes: ['burnable'],
                bagCount: 4,
                location: { lat: d.lat, lng: d.lng, address: `${d.address} 集積場所` },
                preferredDate: '2026-07-13',
                note: '通行の妨げにならない場所に集積しています。',
              }
            : { required: false },
      },
      at,
    )
    activity = transition(activity, { type: 'verify', actor: CITY }, at)
    repo.saveActivity(activity)
    repo.addGroupPoints(activity.groupId, activity.awardedPoints)

    const fy = fiscalYearOf(at)
    const group = repo.getGroup(d.groupId)!
    const { amount } = calculateIncentive(
      { garbageKg: d.garbageKg, actualParticipants: d.participants, hours: d.hours },
      { yearToDatePaid: repo.yearToDatePaid(d.groupId, fy) },
    )
    repo.savePayment(
      {
        id: `pay-${activity.id.slice(0, 8)}`,
        groupId: d.groupId,
        groupName: group.name,
        activityId: activity.id,
        amount,
        status: 'pending',
        bank: group.bank,
        scheduledDate: '',
        paidAt: null,
      },
      fy,
    )
  }

  // 審査待ちの申請（市の画面で「やることがある」状態を見せる）
  const pending = transition(
    createActivity(
      {
        groupId: 'g-c',
        title: '秋の観光シーズン前 一斉清掃',
        wardId: 'nara-park',
        scheduledDate: '2026-09-13',
        location: { lat: 34.685, lng: 135.843, address: '奈良公園 登大路園地' },
        plannedParticipants: 40,
      },
      now,
    ),
    { type: 'submit', actor: asGroup('g-c') },
    now,
  )
  repo.saveActivity(pending)

  // 団体デモ用: 事前承認なしで「活動報告・ごみ回収依頼」を試せる下書き。
  const demoDraft = createActivity(
    {
      groupId: 'g-a',
      title: '【デモ用】鴻ノ池公園 定例清掃',
      wardId: 'saho',
      scheduledDate: '2026-08-23',
      location: { lat: 34.7025, lng: 135.8033, address: '鴻ノ池運動公園 南口' },
      plannedParticipants: 10,
      parkId: 'park-konoike',
    },
    now,
  )
  repo.saveActivity(demoDraft)

  // 募集中のイベント
  const events: VolunteerEvent[] = [
    {
      id: 'ev-morning',
      groupId: 'g-c',
      title: '朝活クリーン＠奈良公園',
      description: '7時集合、1時間で解散。道具は貸出します。学生・初参加大歓迎！終わったらモーニングに行きます。',
      startsAt: '2026-09-05T07:00:00.000Z',
      hours: 1,
      meetingPoint: { lat: 34.685, lng: 135.843, address: '奈良公園 登大路園地' },
      wardId: 'nara-park',
      capacity: 20,
      applicationDeadline: '2026-09-04T00:00:00.000Z',
      pointsReward: 100,
      participants: [],
    },
    {
      id: 'ev-river',
      groupId: 'g-a',
      title: '佐保川 river cleanup（親子歓迎）',
      description: '軍手・トングは用意しています。小学生以下は保護者同伴でお願いします。',
      startsAt: '2026-09-12T09:00:00.000Z',
      hours: 2,
      meetingPoint: { lat: 34.697, lng: 135.808, address: '奈良市法蓮町 佐保川河川敷' },
      wardId: 'saho',
      capacity: 3,
      applicationDeadline: '2026-09-10T00:00:00.000Z',
      pointsReward: 200,
      participants: [],
    },
    {
      id: 'ev-machi',
      groupId: 'g-b',
      title: 'ならまち ナイトクリーン',
      description: '観光客が帰ったあとの町家エリアを1時間だけ。ライト持参推奨。',
      startsAt: '2026-09-19T19:00:00.000Z',
      hours: 1,
      meetingPoint: { lat: 34.678, lng: 135.83, address: '奈良市元興寺町' },
      wardId: 'naramachi',
      capacity: 15,
      applicationDeadline: '2026-09-18T00:00:00.000Z',
      pointsReward: 100,
      participants: [],
    },
  ]
  const joinAt = '2026-08-01T00:00:00.000Z'
  for (const e of events) repo.saveEvent(e)
  repo.saveEvent(joinEvent(joinEvent(events[1]!, 'u-member-2', joinAt).event, 'u-member-3', joinAt).event)

  // 団体間掲示板
  const posts: { actor: Actor; body: string; category: '資機材' | '共同開催' | 'ノウハウ' | '雑談' | 'お知らせ' }[] = [
    { actor: CITY, body: '9月の一斉清掃週間の申請受付を開始しました。ごみ袋の配布は各地区の環境事務所で行います。', category: 'お知らせ' },
    { actor: asGroup('g-a'), body: 'トングを20本ほど余分に持っています。9月の活動で足りない団体があればお貸しします。', category: '資機材' },
    { actor: asGroup('g-c'), body: '学生メンバーが増えてきたので、佐保川さんと合同で river cleanup をやりませんか？告知はうちのSNSで出せます。', category: '共同開催' },
    { actor: asGroup('g-b'), body: '観光地の吸い殻対策、携帯灰皿を配ると回収量がかなり減りました。ご参考まで。', category: 'ノウハウ' },
  ]
  const base = Date.parse('2026-08-10T00:00:00.000Z')
  posts.forEach((p, i) => repo.savePost(createPost(p, new Date(base + i * 3_600_000).toISOString())))
}

/* CLI: npm run seed */
if (process.argv[1]?.includes('seed')) {
  const { mkdirSync } = await import('node:fs')
  mkdirSync('data', { recursive: true })
  const repo = new Repo(createDb())
  seedBaseline(repo)
  seedDemo(repo)
  console.log('シードデータを投入しました: data/nara-clean.db')
}
