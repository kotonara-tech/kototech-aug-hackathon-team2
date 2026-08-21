/** データアクセス層。SQL はここに閉じ込め、上位にはドメイン型だけを渡す。 */
import type { DatabaseSync } from 'node:sqlite'
import type { Activity, BankAccount, BoardPost, PaymentRecord, VolunteerEvent } from '../domain/types.js'

export interface GroupRow {
  id: string
  name: string
  contact: string
  totalPoints: number
  bank: BankAccount
  createdAt: string
}

export interface UserRow {
  id: string
  name: string
  role: 'city' | 'group' | 'member'
  groupId: string | null
  age: number | null
  totalPoints: number
}

export interface WardRow {
  id: string
  name: string
  lat: number
  lng: number
}

export interface AttendanceRow {
  eventId: string
  memberId: string
  points: number
  awardedAt: string
}

/** 年度（4月始まり）を求める。奨励金の年間上限判定に使う。 */
export function fiscalYearOf(isoDate: string): number {
  const d = new Date(isoDate)
  return d.getUTCMonth() + 1 >= 4 ? d.getUTCFullYear() : d.getUTCFullYear() - 1
}

export class Repo {
  constructor(private readonly db: DatabaseSync) {}

  /* ---------------- 地区 ---------------- */

  upsertWard(w: WardRow): void {
    this.db
      .prepare('INSERT OR REPLACE INTO wards (id, name, lat, lng) VALUES (?, ?, ?, ?)')
      .run(w.id, w.name, w.lat, w.lng)
  }

  listWards(): WardRow[] {
    return this.db.prepare('SELECT id, name, lat, lng FROM wards ORDER BY id').all() as unknown as WardRow[]
  }

  wardName(id: string): string {
    const row = this.db.prepare('SELECT name FROM wards WHERE id = ?').get(id) as { name?: string } | undefined
    return row?.name ?? id
  }

  /* ---------------- 団体・利用者 ---------------- */

  insertGroup(g: GroupRow): void {
    this.db
      .prepare(
        'INSERT INTO groups (id, name, contact, total_points, bank_json, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      )
      .run(g.id, g.name, g.contact, g.totalPoints, JSON.stringify(g.bank), g.createdAt)
  }

  getGroup(id: string): GroupRow | null {
    const r = this.db.prepare('SELECT * FROM groups WHERE id = ?').get(id) as Record<string, unknown> | undefined
    return r ? toGroup(r) : null
  }

  listGroups(): GroupRow[] {
    const rows = this.db.prepare('SELECT * FROM groups ORDER BY total_points DESC, name').all()
    return (rows as unknown as Record<string, unknown>[]).map(toGroup)
  }

  addGroupPoints(groupId: string, points: number): void {
    this.db.prepare('UPDATE groups SET total_points = total_points + ? WHERE id = ?').run(points, groupId)
  }

  insertUser(u: UserRow): void {
    this.db
      .prepare('INSERT INTO users (id, name, role, group_id, age, total_points) VALUES (?, ?, ?, ?, ?, ?)')
      .run(u.id, u.name, u.role, u.groupId, u.age, u.totalPoints)
  }

  getUser(id: string): UserRow | null {
    const r = this.db.prepare('SELECT * FROM users WHERE id = ?').get(id) as Record<string, unknown> | undefined
    if (!r) return null
    return {
      id: r.id as string,
      name: r.name as string,
      role: r.role as UserRow['role'],
      groupId: (r.group_id as string) ?? null,
      age: (r.age as number) ?? null,
      totalPoints: r.total_points as number,
    }
  }

  addUserPoints(userId: string, points: number): void {
    this.db.prepare('UPDATE users SET total_points = total_points + ? WHERE id = ?').run(points, userId)
  }

  /* ---------------- 活動 ---------------- */

  saveActivity(a: Activity): void {
    this.db
      .prepare(
        `INSERT INTO activities (id, group_id, status, ward_id, scheduled_date, data)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET status = excluded.status, data = excluded.data`,
      )
      .run(a.id, a.groupId, a.status, a.wardId, a.scheduledDate, JSON.stringify(a))
  }

  getActivity(id: string): Activity | null {
    const r = this.db.prepare('SELECT data FROM activities WHERE id = ?').get(id) as { data?: string } | undefined
    return r?.data ? (JSON.parse(r.data) as Activity) : null
  }

  listActivities(filter: { status?: string; groupId?: string } = {}): Activity[] {
    const where: string[] = []
    const params: string[] = []
    if (filter.status) {
      where.push('status = ?')
      params.push(filter.status)
    }
    if (filter.groupId) {
      where.push('group_id = ?')
      params.push(filter.groupId)
    }
    const sql = `SELECT data FROM activities ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY scheduled_date DESC`
    const rows = this.db.prepare(sql).all(...params) as unknown as { data: string }[]
    return rows.map((r) => JSON.parse(r.data) as Activity)
  }

  /** 地図に載せるのは市が確認済みの実績のみ */
  listPublishedActivities(): Activity[] {
    const rows = this.db
      .prepare("SELECT data FROM activities WHERE status IN ('verified','paid') ORDER BY scheduled_date DESC")
      .all() as unknown as { data: string }[]
    return rows.map((r) => JSON.parse(r.data) as Activity)
  }

  /** 連続活動月数（今月から遡って、実績がある月が何か月続いているか） */
  consecutiveMonths(groupId: string, from: Date): number {
    const months = new Set(
      (
        this.db
          .prepare(
            "SELECT scheduled_date FROM activities WHERE group_id = ? AND status IN ('reported','verified','paid')",
          )
          .all(groupId) as unknown as { scheduled_date: string }[]
      ).map((r) => r.scheduled_date.slice(0, 7)),
    )

    let count = 0
    const cursor = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), 1))
    while (months.has(cursor.toISOString().slice(0, 7))) {
      count++
      cursor.setUTCMonth(cursor.getUTCMonth() - 1)
    }
    return count
  }

  /* ---------------- 支払い ---------------- */

  savePayment(p: PaymentRecord, fiscalYear: number): void {
    this.db
      .prepare(
        `INSERT INTO payments (id, group_id, activity_id, status, fiscal_year, data)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET status = excluded.status, data = excluded.data`,
      )
      .run(p.id, p.groupId, p.activityId, p.status, fiscalYear, JSON.stringify(p))
  }

  getPayment(id: string): PaymentRecord | null {
    const r = this.db.prepare('SELECT data FROM payments WHERE id = ?').get(id) as { data?: string } | undefined
    return r?.data ? (JSON.parse(r.data) as PaymentRecord) : null
  }

  listPayments(filter: { groupId?: string } = {}): PaymentRecord[] {
    const sql = filter.groupId
      ? 'SELECT data FROM payments WHERE group_id = ? ORDER BY rowid DESC'
      : 'SELECT data FROM payments ORDER BY rowid DESC'
    const rows = (
      filter.groupId ? this.db.prepare(sql).all(filter.groupId) : this.db.prepare(sql).all()
    ) as unknown as { data: string }[]
    return rows.map((r) => JSON.parse(r.data) as PaymentRecord)
  }

  /** 年度内に支払確定・支払済となった金額の合計（年間上限の判定に使う） */
  yearToDatePaid(groupId: string, fiscalYear: number): number {
    const r = this.db
      .prepare(
        `SELECT COALESCE(SUM(json_extract(data, '$.amount')), 0) AS total
         FROM payments WHERE group_id = ? AND fiscal_year = ? AND status IN ('scheduled','paid')`,
      )
      .get(groupId, fiscalYear) as { total?: number } | undefined
    return Number(r?.total ?? 0)
  }

  /* ---------------- イベント ---------------- */

  saveEvent(e: VolunteerEvent): void {
    this.db
      .prepare(
        `INSERT INTO events (id, group_id, starts_at, data) VALUES (?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET data = excluded.data`,
      )
      .run(e.id, e.groupId, e.startsAt, JSON.stringify(e))
  }

  getEvent(id: string): VolunteerEvent | null {
    const r = this.db.prepare('SELECT data FROM events WHERE id = ?').get(id) as { data?: string } | undefined
    return r?.data ? (JSON.parse(r.data) as VolunteerEvent) : null
  }

  listEvents(): VolunteerEvent[] {
    const rows = this.db
      .prepare('SELECT data FROM events ORDER BY starts_at')
      .all() as unknown as { data: string }[]
    return rows.map((r) => JSON.parse(r.data) as VolunteerEvent)
  }

  /* ---------------- 出席・ポイント履歴 ---------------- */

  hasAttendance(eventId: string, memberId: string): boolean {
    return (
      this.db.prepare('SELECT 1 FROM attendances WHERE event_id = ? AND member_id = ?').get(eventId, memberId) !==
      undefined
    )
  }

  saveAttendance(row: AttendanceRow): void {
    this.db
      .prepare('INSERT OR IGNORE INTO attendances (event_id, member_id, points, awarded_at) VALUES (?, ?, ?, ?)')
      .run(row.eventId, row.memberId, row.points, row.awardedAt)
  }

  countAttendances(memberId: string): number {
    const r = this.db.prepare('SELECT COUNT(*) AS c FROM attendances WHERE member_id = ?').get(memberId) as
      | { c?: number }
      | undefined
    return Number(r?.c ?? 0)
  }

  listAttendances(memberId: string): (AttendanceRow & { eventTitle: string; startsAt: string })[] {
    const rows = this.db
      .prepare(
        `SELECT a.event_id, a.points, a.awarded_at, e.data
         FROM attendances a JOIN events e ON e.id = a.event_id
         WHERE a.member_id = ? ORDER BY a.awarded_at DESC`,
      )
      .all(memberId) as unknown as { event_id: string; points: number; awarded_at: string; data: string }[]

    return rows.map((r) => {
      const event = JSON.parse(r.data) as VolunteerEvent
      return {
        eventId: r.event_id,
        memberId,
        points: r.points,
        awardedAt: r.awarded_at,
        eventTitle: event.title,
        startsAt: event.startsAt,
      }
    })
  }

  /* ---------------- 掲示板 ---------------- */

  savePost(p: BoardPost): void {
    this.db
      .prepare('INSERT INTO posts (id, group_id, created_at, data) VALUES (?, ?, ?, ?)')
      .run(p.id, p.groupId, p.createdAt, JSON.stringify(p))
  }

  listPosts(): BoardPost[] {
    const rows = this.db
      .prepare('SELECT data FROM posts ORDER BY rowid DESC')
      .all() as unknown as { data: string }[]
    return rows.map((r) => JSON.parse(r.data) as BoardPost)
  }
}

function toGroup(r: Record<string, unknown>): GroupRow {
  return {
    id: r.id as string,
    name: r.name as string,
    contact: r.contact as string,
    totalPoints: r.total_points as number,
    bank: JSON.parse(r.bank_json as string) as BankAccount,
    createdAt: r.created_at as string,
  }
}
