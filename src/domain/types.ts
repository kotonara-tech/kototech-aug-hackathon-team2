/** 奈良市ごみ清掃ボランティア基盤 — ドメイン型定義 */

export type Role = 'city' | 'group' | 'member'

export interface Actor {
  id: string
  role: Role
  /** 団体管理者・団体所属メンバーの所属団体。市職員は null */
  groupId: string | null
}

export interface GeoPoint {
  lat: number
  lng: number
  address: string
}

/* ---------------- 活動（申請 → 報告 → 支払い） ---------------- */

export type ActivityStatus =
  | 'draft'
  | 'submitted'
  | 'approved'
  | 'rejected'
  | 'reported'
  | 'verified'
  | 'paid'
  | 'cancelled'

export interface ActivityReport {
  actualParticipants: number
  hours: number
  garbageKg: number
  photoUrls: string[]
  comment: string
}

export interface HistoryEntry {
  action: string
  actorId: string
  at: string
  note?: string
}

export interface Activity {
  id: string
  groupId: string
  title: string
  wardId: string
  scheduledDate: string
  location: GeoPoint
  plannedParticipants: number
  status: ActivityStatus
  /** 継続ボーナス算定用: 申請時点での連続活動月数 */
  consecutiveMonths: number
  report: ActivityReport | null
  awardedPoints: number
  rejectionReason: string | null
  submittedAt: string | null
  verifiedAt: string | null
  createdAt: string
  history: HistoryEntry[]
}

export interface NewActivityInput {
  groupId: string
  title: string
  wardId: string
  scheduledDate: string
  location: GeoPoint
  plannedParticipants: number
  consecutiveMonths?: number
}

/* ---------------- インセンティブ（奨励金） ---------------- */

export type PaymentStatus = 'pending' | 'scheduled' | 'paid'

export interface BankAccount {
  bankCode: string
  branchCode: string
  accountType: '普通' | '当座'
  accountNumber: string
  accountHolderKana: string
}

export interface PaymentRecord {
  id: string
  groupId: string
  groupName: string
  activityId: string
  amount: number
  status: PaymentStatus
  bank: BankAccount
  scheduledDate: string
  paidAt: string | null
}

/* ---------------- イベント（募集） ---------------- */

export type ParticipationStatus = 'confirmed' | 'waitlisted' | 'cancelled'

export interface Participation {
  memberId: string
  status: ParticipationStatus
  joinedAt: string
  cancelledAt?: string
}

export interface VolunteerEvent {
  id: string
  groupId: string
  title: string
  description: string
  startsAt: string
  hours: number
  meetingPoint: GeoPoint
  wardId: string
  capacity: number
  applicationDeadline: string
  pointsReward: number
  participants: Participation[]
}

/* ---------------- 地図 ---------------- */

export interface MapActivity {
  id: string
  wardId: string
  lat: number
  lng: number
  garbageKg: number
  participants: number
  date: string
  title: string
}

export interface WardSummary {
  wardId: string
  activityCount: number
  garbageKg: number
  participants: number
}

export interface HeatCell {
  lat: number
  lng: number
  count: number
  garbageKg: number
}

/* ---------------- 掲示板 ---------------- */

export type PostCategory = '資機材' | '共同開催' | 'ノウハウ' | '雑談' | 'お知らせ'

export interface BoardPost {
  id: string
  groupId: string | null
  authorId: string
  category: PostCategory
  body: string
  createdAt: string
}
