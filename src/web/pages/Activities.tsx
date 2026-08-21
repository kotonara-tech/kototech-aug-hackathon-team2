import { useState } from 'react'
import { api, useApi } from '../api'
import type { Activity, Me, Ward } from '../types'
import { Empty, StatusBadge, formatDate, formatDateTime } from '../components/ui'

const ACTION_LABEL: Record<string, string> = {
  submit: '市に申請',
  approve: '承認',
  reject: '却下',
  report: '報告書を提出',
  returnReport: '差し戻し',
  verify: '実績を確定',
  markPaid: '支払済みにする',
  cancel: '中止',
}

/** 役割 × 状態 で「次に押せるボタン」を決める（サーバ側の遷移表と対応） */
function nextActions(a: Activity, me: Me): string[] {
  const isOwner = me.role === 'group' && me.groupId === a.groupId
  if (me.role === 'city') {
    if (a.status === 'submitted') return ['approve', 'reject']
    if (a.status === 'reported') return ['verify', 'returnReport']
    if (a.status === 'verified') return ['markPaid']
    return []
  }
  if (!isOwner) return []
  if (a.status === 'draft') return ['submit', 'cancel']
  if (a.status === 'approved') return ['report']
  return []
}

export function Activities({ me }: { me: Me }) {
  const [filter, setFilter] = useState<string>(me.role === 'city' ? 'submitted' : '')
  const query = filter ? `/activities?status=${filter}` : '/activities'
  const { data, error, reload } = useApi<Activity[]>(query, [filter])
  const [busy, setBusy] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [reportFor, setReportFor] = useState<Activity | null>(null)

  async function run(a: Activity, type: string) {
    let payload: Record<string, unknown> = { type }
    if (type === 'reject' || type === 'returnReport' || type === 'cancel') {
      const reason = prompt(`${ACTION_LABEL[type]}の理由を入力してください`)
      if (!reason) return
      payload = { type, reason }
    }
    setBusy(a.id)
    setMessage(null)
    try {
      await api.post(`/activities/${a.id}/actions`, payload)
      setMessage(`「${a.title}」を${ACTION_LABEL[type]}しました`)
      reload()
    } catch (e) {
      setMessage((e as Error).message)
    } finally {
      setBusy(null)
    }
  }

  const FILTERS =
    me.role === 'city'
      ? [
          { id: 'submitted', label: '審査待ち' },
          { id: 'reported', label: '報告書の確認待ち' },
          { id: 'verified', label: '実績確定' },
          { id: '', label: 'すべて' },
        ]
      : [
          { id: '', label: 'すべて' },
          { id: 'draft', label: '下書き' },
          { id: 'approved', label: '報告待ち' },
          { id: 'verified', label: '実績確定' },
        ]

  return (
    <>
      <div className="spread">
        <div>
          <h1>活動管理</h1>
          <p className="page-lead">
            {me.role === 'city'
              ? '団体から届いた申請と報告書をオンラインで審査します。紙の回付は不要です。'
              : '清掃活動の申請から報告書・写真の提出までをこの画面で完結できます。'}
          </p>
        </div>
        {me.role === 'group' && <button onClick={() => setCreating(true)}>＋ 活動を申請する</button>}
      </div>

      {message && <div className="alert info">{message}</div>}
      {error && <div className="alert error">{error}</div>}

      <div className="chips">
        {FILTERS.map((f) => (
          <button key={f.id} className={`chip ${filter === f.id ? 'active' : ''}`} onClick={() => setFilter(f.id)}>
            {f.label}
          </button>
        ))}
      </div>

      {creating && <NewActivityForm onClose={() => setCreating(false)} onCreated={reload} />}
      {reportFor && (
        <ReportForm
          activity={reportFor}
          onClose={() => setReportFor(null)}
          onDone={() => {
            setReportFor(null)
            reload()
          }}
        />
      )}

      <div className="list">
        {(data ?? []).map((a) => (
          <article key={a.id} className="card">
            <div className="spread">
              <div>
                <strong>{a.title}</strong>
                <div className="muted">
                  {formatDate(a.scheduledDate)}／{a.groupName}／{a.location.address}
                </div>
              </div>
              <StatusBadge status={a.status} />
            </div>

            {a.report && (
              <div style={{ marginTop: '0.5rem' }}>
                <div className="row muted">
                  <span>参加 {a.report.actualParticipants}人</span>
                  <span>活動 {a.report.hours}時間</span>
                  <span>回収 {a.report.garbageKg}kg</span>
                  {a.awardedPoints > 0 && <span className="badge ok">+{a.awardedPoints} pt</span>}
                </div>
                <div className="photo-strip" style={{ marginTop: '0.5rem' }}>
                  {a.report.photoUrls.map((p) => (
                    <div key={p}>{p.split('/').pop()}</div>
                  ))}
                </div>
                {a.report.comment && <p style={{ marginBottom: 0 }}>{a.report.comment}</p>}
              </div>
            )}

            {a.rejectionReason && a.status !== 'verified' && (
              <div className="alert error" style={{ marginTop: '0.5rem' }}>
                {a.rejectionReason}
              </div>
            )}

            <details style={{ marginTop: '0.5rem' }}>
              <summary className="muted">処理履歴（{a.history.length}件）</summary>
              <ul className="timeline" style={{ marginTop: '0.5rem' }}>
                {a.history.map((h, i) => (
                  <li key={i}>
                    {formatDateTime(h.at)} — {ACTION_LABEL[h.action] ?? h.action}（{h.actorId}）
                    {h.note && <div className="muted">{h.note}</div>}
                  </li>
                ))}
              </ul>
            </details>

            <div className="row" style={{ marginTop: '0.75rem' }}>
              {nextActions(a, me).map((t) => (
                <button
                  key={t}
                  disabled={busy === a.id}
                  className={t === 'reject' || t === 'cancel' ? 'danger' : t === 'returnReport' ? 'subtle' : ''}
                  onClick={() => (t === 'report' ? setReportFor(a) : run(a, t))}
                >
                  {ACTION_LABEL[t]}
                </button>
              ))}
            </div>
          </article>
        ))}
        {data?.length === 0 && <Empty>該当する活動はありません</Empty>}
      </div>
    </>
  )
}

function NewActivityForm({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const { data: wards } = useApi<Ward[]>('/wards')
  const [form, setForm] = useState({
    title: '',
    wardId: 'saho',
    scheduledDate: '',
    address: '',
    plannedParticipants: 10,
  })
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const ward = wards?.find((w) => w.id === form.wardId)

  async function submit() {
    if (!ward) return
    setSaving(true)
    setError(null)
    try {
      await api.post('/activities', {
        title: form.title,
        wardId: form.wardId,
        scheduledDate: form.scheduledDate,
        plannedParticipants: Number(form.plannedParticipants),
        location: { lat: ward.lat, lng: ward.lng, address: form.address || `${ward.name}地区` },
      })
      onCreated()
      onClose()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="card" style={{ marginBottom: '1rem' }}>
      <h2 style={{ marginTop: 0 }}>清掃活動の申請</h2>
      {error && <div className="alert error">{error}</div>}
      <div className="grid cols-2">
        <div className="field">
          <label>活動名</label>
          <input
            value={form.title}
            placeholder="例）佐保川 桜並木クリーン作戦"
            onChange={(e) => setForm({ ...form, title: e.target.value })}
          />
        </div>
        <div className="field">
          <label>実施予定日</label>
          <input
            type="date"
            value={form.scheduledDate}
            onChange={(e) => setForm({ ...form, scheduledDate: e.target.value })}
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
          <label>予定参加人数</label>
          <input
            type="number"
            min={1}
            value={form.plannedParticipants}
            onChange={(e) => setForm({ ...form, plannedParticipants: Number(e.target.value) })}
          />
        </div>
        <div className="field" style={{ gridColumn: '1 / -1' }}>
          <label>活動場所（住所・目印）</label>
          <input
            value={form.address}
            placeholder="例）奈良市法蓮町 佐保川河川敷"
            onChange={(e) => setForm({ ...form, address: e.target.value })}
          />
        </div>
      </div>
      <div className="row">
        <button onClick={submit} disabled={saving || !form.title || !form.scheduledDate}>
          申請する
        </button>
        <button className="subtle" onClick={onClose}>
          キャンセル
        </button>
      </div>
      <p className="muted" style={{ marginBottom: 0 }}>
        申請するとまず下書きとして保存され、「市に申請」で審査に回ります。
      </p>
    </div>
  )
}

function ReportForm({
  activity,
  onClose,
  onDone,
}: {
  activity: Activity
  onClose: () => void
  onDone: () => void
}) {
  const [form, setForm] = useState({
    actualParticipants: activity.plannedParticipants,
    hours: 2,
    garbageKg: 0,
    comment: '',
    photos: ['活動前.jpg', '活動後.jpg'],
  })
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  async function submit() {
    setSaving(true)
    setError(null)
    try {
      await api.post(`/activities/${activity.id}/actions`, {
        type: 'report',
        report: {
          actualParticipants: Number(form.actualParticipants),
          hours: Number(form.hours),
          garbageKg: Number(form.garbageKg),
          comment: form.comment,
          photoUrls: form.photos.map((p) => `/photos/${p}`),
        },
      })
      onDone()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="card" style={{ marginBottom: '1rem' }}>
      <h2 style={{ marginTop: 0 }}>活動報告書 — {activity.title}</h2>
      {error && <div className="alert error">{error}</div>}
      <div className="grid cols-3">
        <div className="field">
          <label>実参加人数</label>
          <input
            type="number"
            min={1}
            value={form.actualParticipants}
            onChange={(e) => setForm({ ...form, actualParticipants: Number(e.target.value) })}
          />
        </div>
        <div className="field">
          <label>活動時間（時間）</label>
          <input
            type="number"
            min={0.5}
            step={0.5}
            value={form.hours}
            onChange={(e) => setForm({ ...form, hours: Number(e.target.value) })}
          />
        </div>
        <div className="field">
          <label>回収量（kg）</label>
          <input
            type="number"
            min={0}
            step={0.5}
            value={form.garbageKg}
            onChange={(e) => setForm({ ...form, garbageKg: Number(e.target.value) })}
          />
        </div>
      </div>
      <div className="field">
        <label>活動写真（1枚以上が必須）</label>
        <div className="photo-strip">
          {form.photos.map((p) => (
            <div key={p}>{p}</div>
          ))}
          <button
            className="subtle"
            onClick={() => setForm({ ...form, photos: [...form.photos, `写真${form.photos.length + 1}.jpg`] })}
          >
            ＋ 追加
          </button>
          {form.photos.length > 0 && (
            <button className="subtle" onClick={() => setForm({ ...form, photos: [] })}>
              すべて削除
            </button>
          )}
        </div>
        <p className="muted">プロトタイプのためファイル名のみを扱います（実装時はスマホ撮影画像を直接添付）。</p>
      </div>
      <div className="field">
        <label>所感・気づいたこと</label>
        <textarea value={form.comment} onChange={(e) => setForm({ ...form, comment: e.target.value })} />
      </div>
      <div className="row">
        <button onClick={submit} disabled={saving}>
          報告書を提出
        </button>
        <button className="subtle" onClick={onClose}>
          キャンセル
        </button>
      </div>
    </div>
  )
}
