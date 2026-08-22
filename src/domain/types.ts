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
  /** 現地巡回の代替証跡。直接報告する新フローでは前後1枚以上を必須とする。 */
  beforePhotoUrls?: string[]
  afterPhotoUrls?: string[]
  /** グリーンサポート制度で実施した作業。未指定の旧データは清掃として扱う。 */
  workTypes?: WorkType[]
  comment: string
}

export type WorkType = 'cleanup' | 'weeding' | 'pruning' | 'planting' | 'other'
export type WasteType = 'burnable' | 'nonBurnable' | 'branches' | 'grass' | 'other'
export type PickupStatus = 'not_required' | 'requested' | 'scheduled' | 'collected'

export type PickupRequestInput =
  | { required: false }
  | {
      required: true
      wasteTypes: WasteType[]
      bagCount: number
      location: GeoPoint
      preferredDate: string
      note: string
    }

export interface PickupRequest {
  status: PickupStatus
  wasteTypes: WasteType[]
  bagCount: number
  location: GeoPoint | null
  preferredDate: string | null
  note: string
  requestedAt: string | null
  scheduledDate: string | null
  collectedAt: string | null
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
  /** 活動報告と同時に受け付けるごみ回収依頼 */
  pickupRequest?: PickupRequest | null
  awardedPoints: number
  rejectionReason: string | null
  submittedAt: string | null
  verifiedAt: string | null
  createdAt: string
  history: HistoryEntry[]
  /** 清掃対象の公園マスタ ID（未紐付けの活動があるため任意） */
  parkId?: string
}

export interface NewActivityInput {
  groupId: string
  title: string
  wardId: string
  scheduledDate: string
  location: GeoPoint
  plannedParticipants: number
  consecutiveMonths?: number
  /** 清掃対象の公園マスタ ID（未紐付けの活動があるため任意） */
  parkId?: string
}

/* ---------------- 公園マスタ ---------------- */

export interface Park {
  id: string
  name: string
  wardId: string
  lat: number
  lng: number
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
