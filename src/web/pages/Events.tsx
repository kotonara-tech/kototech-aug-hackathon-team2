import { useState } from 'react'
import { api, useApi } from '../api'
import type { EventDto, Me, Ward } from '../types'
import { Empty, formatDate, formatDateTime } from '../components/ui'

export function Events({ me, onPointsChanged }: { me: Me; onPointsChanged: () => void }) {
  const { data, error, reload } = useApi<EventDto[]>('/events')
  const [message, setMessage] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)

  async function join(e: EventDto) {
    setBusy(e.id)
    setMessage(null)
    try {
      const res = await api.post<{ status: string }>(`/events/${e.id}/join`)
      setMessage(
        res.status === 'confirmed'
          ? `「${e.title}」への参加が確定しました。当日お待ちしています！`
          : `「${e.title}」はキャンセル待ちで登録しました。空きが出たら自動で繰り上がります。`,
      )
      reload()
    } catch (err) {
      setMessage((err as Error).message)
    } finally {
      setBusy(null)
    }
  }

  async function cancel(e: EventDto) {
    setBusy(e.id)
    try {
      await api.del(`/events/${e.id}/join`)
      setMessage(`「${e.title}」への参加を取り消しました`)
      reload()
    } catch (err) {
      setMessage((err as Error).message)
    } finally {
      setBusy(null)
    }
  }

  const myParticipation = (e: EventDto) =>
    e.participants?.find((p) => p.memberId === me.id && p.status !== 'cancelled')?.status

  return (
    <>
      <div className="spread">
        <div>
          <h1>清掃イベント</h1>
          <p className="page-lead">
            団体が募集しているイベントに、個人が1クリックで参加申込できます。参加でポイントが貯まります。
          </p>
        </div>
        {me.role === 'group' && <button onClick={() => setCreating(true)}>＋ イベントを掲載</button>}
      </div>

      {message && <div className="alert info">{message}</div>}
      {error && <div className="alert error">{error}</div>}
      {creating && (
        <NewEventForm
          onClose={() => setCreating(false)}
          onCreated={() => {
            setCreating(false)
            reload()
          }}
        />
      )}

      <div className="list">
        {(data ?? []).map((e) => (
          <EventCard
            key={e.id}
            event={e}
            me={me}
            busy={busy === e.id}
            myStatus={myParticipation(e)}
            onJoin={() => join(e)}
            onCancel={() => cancel(e)}
            onAttendanceDone={() => {
              reload()
              onPointsChanged()
            }}
          />
        ))}
        {data?.length === 0 && <Empty>いま募集中のイベントはありません</Empty>}
      </div>
    </>
  )
}

function EventCard({
  event,
  me,
  busy,
  myStatus,
  onJoin,
  onCancel,
  onAttendanceDone,
}: {
  event: EventDto
  me: Me
  busy: boolean
  myStatus?: string
  onJoin: () => void
  onCancel: () => void
  onAttendanceDone: () => void
}) {
  const [detail, setDetail] = useState<EventDto | null>(null)
  const isHost = me.role === 'group' && me.groupId === event.groupId
  const filled = Math.min(100, Math.round((event.confirmedCount / event.capacity) * 100))

  async function loadDetail() {
    setDetail(await api.get<EventDto>(`/events/${event.id}`))
  }

  async function confirmAttendance() {
    const target = detail ?? (await api.get<EventDto>(`/events/${event.id}`))
    const memberIds = (target.participants ?? []).filter((p) => p.status === 'confirmed').map((p) => p.memberId)
    const res = await api.post<{ awarded: { memberId: string; points: number }[] }>(
      `/events/${event.id}/attendance`,
      { memberIds },
    )
    alert(`${res.awarded.length}名にポイントを付与しました`)
    onAttendanceDone()
  }

  return (
    <article className="card">
      <div className="spread">
        <div>
          <strong>{event.title}</strong>
          <div className="muted">
            {formatDateTime(event.startsAt)}〜（{event.hours}時間）／{event.wardName}／主催: {event.groupName}
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <span className="badge">+{event.pointsReward} pt</span>
          <div className="muted">申込締切 {formatDate(event.applicationDeadline)}</div>
        </div>
      </div>

      <p style={{ margin: '0.5rem 0' }}>{event.description}</p>
      <div className="muted">集合場所: {event.meetingPoint.address}</div>

      <div style={{ margin: '0.6rem 0' }}>
        <div className="progress">
          <div style={{ width: `${filled}%` }} />
        </div>
        <div className="muted">
          {event.confirmedCount} / {event.capacity} 人
          {event.waitlistCount > 0 && `（キャンセル待ち ${event.waitlistCount}人）`}
        </div>
      </div>

      <div className="row">
        {me.role === 'member' &&
          (myStatus ? (
            <>
              <span className={`badge ${myStatus === 'confirmed' ? 'ok' : 'warn'}`}>
                {myStatus === 'confirmed' ? '参加確定' : 'キャンセル待ち'}
              </span>
              <button className="subtle" onClick={onCancel} disabled={busy}>
                申込を取り消す
              </button>
            </>
          ) : (
            <button onClick={onJoin} disabled={busy || !event.isOpen}>
              {event.isOpen ? (event.remainingSeats > 0 ? '参加する' : 'キャンセル待ちで申し込む') : '受付終了'}
            </button>
          ))}

        {isHost && (
          <>
            <button className="ghost" onClick={loadDetail}>
              参加者を見る
            </button>
            <button className="subtle" onClick={confirmAttendance}>
              出席を確定してポイント付与
            </button>
          </>
        )}
      </div>

      {detail && (
        <div className="table-scroll" style={{ marginTop: '0.75rem' }}>
          <table>
            <thead>
              <tr>
                <th>参加者ID</th>
                <th>状態</th>
                <th>申込日時</th>
              </tr>
            </thead>
            <tbody>
              {(detail.participants ?? []).map((p) => (
                <tr key={p.memberId}>
                  <td>{p.memberId}</td>
                  <td>
                    {p.status === 'confirmed' ? '確定' : p.status === 'waitlisted' ? 'キャンセル待ち' : '取消'}
                  </td>
                  <td>{formatDateTime(p.joinedAt)}</td>
                </tr>
              ))}
              {(detail.participants ?? []).length === 0 && (
                <tr>
                  <td colSpan={3} className="muted">
                    まだ申込がありません
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </article>
  )
}

function NewEventForm({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const { data: wards } = useApi<Ward[]>('/wards')
  const [form, setForm] = useState({
    title: '',
    description: '',
    date: '',
    time: '09:00',
    hours: 1,
    wardId: 'nara-park',
    capacity: 20,
    applicationDeadline: '',
    pointsReward: 100,
  })
  const [error, setError] = useState<string | null>(null)

  async function submit() {
    const ward = wards?.find((w) => w.id === form.wardId)
    if (!ward) return
    setError(null)
    try {
      await api.post('/events', {
        title: form.title,
        description: form.description,
        startsAt: new Date(`${form.date}T${form.time}:00Z`).toISOString(),
        hours: Number(form.hours),
        meetingPoint: { lat: ward.lat, lng: ward.lng, address: `${ward.name}地区` },
        wardId: form.wardId,
        capacity: Number(form.capacity),
        applicationDeadline: new Date(`${form.applicationDeadline}T00:00:00Z`).toISOString(),
        pointsReward: Number(form.pointsReward),
      })
      onCreated()
    } catch (e) {
      setError((e as Error).message)
    }
  }

  return (
    <div className="card" style={{ marginBottom: '1rem' }}>
      <h2 style={{ marginTop: 0 }}>イベントの掲載</h2>
      {error && <div className="alert error">{error}</div>}
      <div className="field">
        <label>タイトル</label>
        <input
          value={form.title}
          placeholder="例）朝活クリーン＠奈良公園"
          onChange={(e) => setForm({ ...form, title: e.target.value })}
        />
      </div>
      <div className="field">
        <label>紹介文（学生・初参加の人に向けて書くと集まりやすくなります）</label>
        <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
      </div>
      <div className="grid cols-3">
        <div className="field">
          <label>開催日</label>
          <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
        </div>
        <div className="field">
          <label>開始時刻</label>
          <input type="time" value={form.time} onChange={(e) => setForm({ ...form, time: e.target.value })} />
        </div>
        <div className="field">
          <label>所要時間</label>
          <input
            type="number"
            min={0.5}
            step={0.5}
            value={form.hours}
            onChange={(e) => setForm({ ...form, hours: Number(e.target.value) })}
          />
        </div>
        <div className="field">
          <label>地区</label>
          <select value={form.wardId} onChange={(e) => setForm({ ...form, wardId: e.target.value })}>
            {(wards ?? []).map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>定員</label>
          <input
            type="number"
            min={1}
            value={form.capacity}
            onChange={(e) => setForm({ ...form, capacity: Number(e.target.value) })}
          />
        </div>
        <div className="field">
          <label>申込締切</label>
          <input
            type="date"
            value={form.applicationDeadline}
            onChange={(e) => setForm({ ...form, applicationDeadline: e.target.value })}
          />
        </div>
      </div>
      <div className="row">
        <button onClick={submit} disabled={!form.title || !form.date || !form.applicationDeadline}>
          掲載する
        </button>
        <button className="subtle" onClick={onClose}>
          キャンセル
        </button>
      </div>
    </div>
  )
}
