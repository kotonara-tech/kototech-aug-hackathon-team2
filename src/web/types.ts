/** 画面が使う API レスポンスの型（サーバのドメイン型に対応） */
export type Role = 'city' | 'group' | 'member'

export interface Me {
  id: string
  name: string
  role: Role
  groupId: string | null
  groupName: string | null
  age: number | null
  totalPoints: number
  rank: string
  nextRank: { next: string; remaining: number } | null
  history: { eventId: string; eventTitle: string; points: number; awardedAt: string; startsAt: string }[]
}

export interface Activity {
  id: string
  groupId: string
  groupName: string
  title: string
  wardId: string
  scheduledDate: string
  location: { lat: number; lng: number; address: string }
  plannedParticipants: number
  status: string
  report: {
    actualParticipants: number
    hours: number
    garbageKg: number
    photoUrls: string[]
    beforePhotoUrls?: string[]
    afterPhotoUrls?: string[]
    workTypes?: string[]
    comment: string
  } | null
  parkId?: string
  pickupRequest?: {
    status: 'not_required' | 'requested' | 'scheduled' | 'collected'
    wasteTypes: string[]
    bagCount: number
    location: { lat: number; lng: number; address: string } | null
    preferredDate: string | null
    note: string
    scheduledDate: string | null
    collectedAt: string | null
  } | null
  awardedPoints: number
  rejectionReason: string | null
  history: { action: string; actorId: string; at: string; note?: string }[]
}

export interface EventDto {
  id: string
  groupId: string
  groupName: string
  title: string
  description: string
  startsAt: string
  hours: number
  meetingPoint: { lat: number; lng: number; address: string }
  wardId: string
  wardName: string
  capacity: number
  applicationDeadline: string
  pointsReward: number
  remainingSeats: number
  confirmedCount: number
  waitlistCount: number
  isOpen: boolean
  participants?: { memberId: string; status: string; joinedAt: string }[]
}

export interface Payment {
  id: string
  groupId: string
  groupName: string
  activityId: string
  amount: number
  status: 'pending' | 'scheduled' | 'paid'
  scheduledDate: string
  paidAt: string | null
  cappedBy?: string
}

export interface GroupSummary {
  groupId: string
  name: string
  totalPoints: number
  rank: string
  activityCount: number
  garbageKg: number
  participants: number
  lastActivityDate: string | null
}

export interface GroupDetail extends GroupSummary {
  contact: string
  consecutiveMonths: number
  nextRank: { next: string; remaining: number } | null
  activities: Activity[]
}

export interface Post {
  id: string
  groupId: string | null
  groupName: string | null
  authorId: string
  category: string
  body: string
  createdAt: string
}

export interface Stats {
  totalActivities: number
  totalGarbageKg: number
  totalParticipants: number
  totalGroups: number
  activeWards: number
  openEvents: number
  pendingReviews: number
  pendingPayments: number
  pendingPickups: number
}

export interface AnnualReportDto {
  fiscalYear: number
  totalActivities: number
  totalParticipants: number
  totalHours: number
  totalGarbageKg: number
  pickupRequests: number
  byWorkType: Record<string, number>
  byGroup: {
    groupId: string
    groupName: string
    activityCount: number
    participants: number
    hours: number
    garbageKg: number
  }[]
}

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
  wardName: string
  lat: number | null
  lng: number | null
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

export interface Ward {
  id: string
  name: string
  lat: number
  lng: number
}

/** GET /parks, GET /map/parks が返す、公園ごとの清掃実績サマリ */
export interface ParkCleanupStatusDto {
  parkId: string
  name: string
  wardId: string
  wardName: string
  lat: number
  lng: number
  /** 最後に清掃された日（YYYY-MM-DD）。一度も清掃されていなければ null */
  lastCleanedOn: string | null
  /** 最終清掃からの経過日数。未清掃なら null */
  daysSinceCleaned: number | null
  lastCleanedGroupId: string | null
  lastCleanedGroupName: string | null
  cleanupCount: number
  /** 未清掃 / 1年以上放置 / 直近清掃済み の区分 */
  neglect: 'never' | 'over-year' | 'recent'
}
