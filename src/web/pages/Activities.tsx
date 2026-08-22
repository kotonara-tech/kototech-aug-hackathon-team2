import { useState } from 'react'
import { api, useApi } from '../api'
import type { Activity, Me, ParkCleanupStatusDto, Ward } from '../types'
import { Empty, StatusBadge, formatDate, formatDateTime } from '../components/ui'

const ACTION_LABEL: Record<string, string> = {
  submit: '市に申請（旧フロー）',
  approve: '承認',
  reject: '却下',
  report: '活動報告・回収依頼を送信',
  returnReport: '修正を依頼',
  verify: '写真確認済みにする',
  markPaid: '支払済みにする',
  cancel: '中止',
}

/** 役割 × 状態 で「次に押せるボタン」を決める（サーバ側の遷移表と対応） */
function nextActions(a: Activity, me: Me): string[] {
  const isOwner = me.role === 'group' && me.groupId === a.groupId
  if (me.role === 'city') {
    if (a.status === 'submitted') return ['approve', 'reject']
    if (a.status === 'reported') return ['verify', 'returnReport']
    return []
  }
  if (!isOwner) return []
  if (a.status === 'draft') return ['report', 'cancel']
  if (a.status === 'approved') return ['report']
  return []
}

export function Activities({ me }: { me: Me }) {
  const [filter, setFilter] = useState<string>(me.role === 'city' ? 'pickup' : '')
  const query = filter && filter !== 'pickup' ? `/activities?status=${filter}` : '/activities'
  const { data, error, reload } = useApi<Activity[]>(query, [filter])
  const visibleActivities =
    filter === 'pickup'
      ? (data ?? []).filter(
          (activity) =>
            activity.pickupRequest?.status === 'requested' || activity.pickupRequest?.status === 'scheduled',
        )
      : (data ?? [])
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

  async function runPickup(a: Activity, type: 'schedule' | 'complete') {
    let payload: Record<string, unknown> = { type }
    if (type === 'schedule') {
      const scheduledDate = prompt('回収予定日を入力してください（YYYY-MM-DD）', a.pickupRequest?.preferredDate ?? '')
      if (!scheduledDate) return
      payload = { type, scheduledDate }
    }
    setBusy(a.id)
    setMessage(null)
    try {
      await api.post(`/activities/${a.id}/pickup-actions`, payload)
      setMessage(`「${a.title}」の回収状態を更新しました`)
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
          { id: 'pickup', label: '回収待ち' },
          { id: 'reported', label: '写真確認待ち' },
          { id: 'verified', label: '確認済み' },
          { id: '', label: 'すべて' },
        ]
      : [
          { id: '', label: 'すべて' },
          { id: 'draft', label: '活動報告待ち' },
          { id: 'reported', label: '確認待ち' },
          { id: 'verified', label: '確認済み' },
        ]

  return (
    <>
      <div className="spread">
        <div>
          <h1>活動管理</h1>
          <p className="page-lead">
            {me.role === 'city'
              ? '写真付き活動報告を確認し、ごみ回収の手配から完了までを管理します。'
              : '活動後の写真報告とごみ回収依頼を一度に送信できます。電話・FAXは不要です。'}
          </p>
        </div>
        {me.role === 'group' && <button onClick={() => setCreating(true)}>＋ 活動予定を登録</button>}
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
        {visibleActivities.map((a) => (
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

            {a.pickupRequest && (
              <div className="alert info" style={{ marginTop: '0.5rem' }}>
                {a.pickupRequest.status === 'not_required'
                  ? 'ごみ回収：不要'
                  : `ごみ回収：${
                      a.pickupRequest.status === 'requested'
                        ? '依頼済み'
                        : a.pickupRequest.status === 'scheduled'
                          ? `手配済み（${a.pickupRequest.scheduledDate}）`
                          : '回収済み'
                    }／${a.pickupRequest.bagCount}袋／${a.pickupRequest.location?.address ?? ''}`}
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
              {me.role === 'city' && a.pickupRequest?.status === 'requested' && (
                <button disabled={busy === a.id} onClick={() => runPickup(a, 'schedule')}>
                  回収を手配
                </button>
              )}
              {me.role === 'city' &&
                (a.pickupRequest?.status === 'requested' || a.pickupRequest?.status === 'scheduled') && (
                  <button className="subtle" disabled={busy === a.id} onClick={() => runPickup(a, 'complete')}>
                    回収済みにする
                  </button>
                )}
            </div>
          </article>
        ))}
        {visibleActivities.length === 0 && <Empty>該当する活動はありません</Empty>}
      </div>
    </>
  )
}

function NewActivityForm({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const { data: wards } = useApi<Ward[]>('/wards')
  const { data: parks } = useApi<ParkCleanupStatusDto[]>('/parks')
  const [form, setForm] = useState({
    title: '',
    parkId: '',
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
        ...(form.parkId ? { parkId: form.parkId } : {}),
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
      <h2 style={{ marginTop: 0 }}>活動予定の登録</h2>
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
          <label>活動する公園</label>
          <select
            value={form.parkId}
            onChange={(e) => {
              const park = parks?.find((candidate) => candidate.parkId === e.target.value)
              setForm({
                ...form,
                parkId: e.target.value,
                ...(park ? { wardId: park.wardId, address: park.name } : {}),
              })
            }}
          >
            <option value="">公園を選択（任意）</option>
            {(parks ?? []).map((park) => (
              <option key={park.parkId} value={park.parkId}>
                {park.name}（{park.wardName}）
              </option>
            ))}
          </select>
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
          登録する
        </button>
        <button className="subtle" onClick={onClose}>
          キャンセル
        </button>
      </div>
      <p className="muted" style={{ marginBottom: 0 }}>
        登録済み団体の定例活動は事前承認不要です。活動後に写真と回収依頼をまとめて送信してください。
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
    workTypes: ['cleanup'],
    pickupRequired: true,
    wasteTypes: ['burnable'],
    bagCount: 1,
    pickupAddress: activity.location.address,
    preferredDate: '',
    pickupNote: '',
  })
  const [beforePhoto, setBeforePhoto] = useState<File | null>(null)
  const [afterPhoto, setAfterPhoto] = useState<File | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  function toggleList(field: 'workTypes' | 'wasteTypes', value: string) {
    const values = form[field]
    setForm({ ...form, [field]: values.includes(value) ? values.filter((item) => item !== value) : [...values, value] })
  }

  function toDataUrl(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result))
      reader.onerror = () => reject(new Error('写真を読み込めませんでした'))
      reader.readAsDataURL(file)
    })
  }

  function demoPhoto(name: string): File {
    const base64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9WlNobwAAAAASUVORK5CYII='
    const bytes = Uint8Array.from(atob(base64), (character) => character.charCodeAt(0))
    return new File([bytes], name, { type: 'image/png' })
  }

  function setDemoInput() {
    const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10)
    setBeforePhoto(demoPhoto('活動前-demo.png'))
    setAfterPhoto(demoPhoto('活動後-demo.png'))
    setForm({
      ...form,
      actualParticipants: 10,
      hours: 1,
      garbageKg: 8,
      workTypes: ['cleanup'],
      pickupRequired: true,
      wasteTypes: ['burnable'],
      bagCount: 3,
      preferredDate: tomorrow,
      pickupNote: 'デモ用の回収依頼です。',
      comment: 'デモ用の活動報告です。',
    })
  }

  async function submit() {
    if (!beforePhoto || !afterPhoto) {
      setError('活動前と活動後の写真をそれぞれ選択してください')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const photos = await Promise.all([toDataUrl(beforePhoto), toDataUrl(afterPhoto)])
      const uploaded = await api.post<{ urls: string[] }>(`/activities/${activity.id}/photos`, { photos })
      const beforePhotoUrls = uploaded.urls.slice(0, 1)
      const afterPhotoUrls = uploaded.urls.slice(1, 2)
      await api.post(`/activities/${activity.id}/actions`, {
        type: 'report',
        report: {
          actualParticipants: Number(form.actualParticipants),
          hours: Number(form.hours),
          garbageKg: Number(form.garbageKg),
          comment: form.comment,
          workTypes: form.workTypes,
          photoUrls: uploaded.urls,
          beforePhotoUrls,
          afterPhotoUrls,
        },
        pickupRequest: form.pickupRequired
          ? {
              required: true,
              wasteTypes: form.wasteTypes,
              bagCount: Number(form.bagCount),
              location: { ...activity.location, address: form.pickupAddress },
              preferredDate: form.preferredDate,
              note: form.pickupNote,
            }
          : { required: false },
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
      <h2 style={{ marginTop: 0 }}>活動報告・ごみ回収依頼 — {activity.title}</h2>
      {error && <div className="alert error">{error}</div>}
      <div className="alert info spread">
        <span>デモでは、写真を用意しなくても一連の操作を確認できます。</span>
        <button className="ghost" onClick={setDemoInput}>
          デモ入力をセット
        </button>
      </div>
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
        <label>実施した作業</label>
        <div className="row">
          {([
            ['cleanup', '清掃'],
            ['weeding', '除草'],
            ['pruning', '低木剪定'],
            ['planting', '花植え'],
            ['other', 'その他'],
          ] as const).map(([value, label]) => (
            <label key={value}>
              <input
                type="checkbox"
                checked={form.workTypes.includes(value)}
                onChange={() => toggleList('workTypes', value)}
              />{' '}
              {label}
            </label>
          ))}
        </div>
      </div>
      <div className="grid cols-2">
        <div className="field">
          <label>活動前の写真（必須）</label>
          <input type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => setBeforePhoto(e.target.files?.[0] ?? null)} />
        </div>
        <div className="field">
          <label>活動後の写真（必須）</label>
          <input type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => setAfterPhoto(e.target.files?.[0] ?? null)} />
        </div>
      </div>
      <div className="field">
        <label>所感・気づいたこと</label>
        <textarea value={form.comment} onChange={(e) => setForm({ ...form, comment: e.target.value })} />
      </div>
      <div className="field">
        <label>
          <input
            type="checkbox"
            checked={form.pickupRequired}
            onChange={(e) => setForm({ ...form, pickupRequired: e.target.checked })}
          />{' '}
          ごみ回収を依頼する
        </label>
      </div>
      {form.pickupRequired && (
        <div className="card" style={{ marginBottom: '1rem' }}>
          <div className="field">
            <label>ごみの種類</label>
            <div className="row">
              {([
                ['burnable', '可燃'],
                ['nonBurnable', '不燃'],
                ['branches', '枝木'],
                ['grass', '草'],
                ['other', 'その他'],
              ] as const).map(([value, label]) => (
                <label key={value}>
                  <input
                    type="checkbox"
                    checked={form.wasteTypes.includes(value)}
                    onChange={() => toggleList('wasteTypes', value)}
                  />{' '}
                  {label}
                </label>
              ))}
            </div>
          </div>
          <div className="grid cols-3">
            <div className="field">
              <label>袋数</label>
              <input type="number" min={1} value={form.bagCount} onChange={(e) => setForm({ ...form, bagCount: Number(e.target.value) })} />
            </div>
            <div className="field">
              <label>回収希望日</label>
              <input type="date" value={form.preferredDate} onChange={(e) => setForm({ ...form, preferredDate: e.target.value })} />
            </div>
            <div className="field">
              <label>回収場所</label>
              <input value={form.pickupAddress} onChange={(e) => setForm({ ...form, pickupAddress: e.target.value })} />
            </div>
          </div>
          <div className="field">
            <label>回収時の連絡事項</label>
            <textarea value={form.pickupNote} onChange={(e) => setForm({ ...form, pickupNote: e.target.value })} />
          </div>
        </div>
      )}
      <div className="row">
        <button
          onClick={submit}
          disabled={
            saving ||
            !beforePhoto ||
            !afterPhoto ||
            form.workTypes.length === 0 ||
            (form.pickupRequired && (!form.preferredDate || !form.pickupAddress || form.wasteTypes.length === 0))
          }
        >
          活動報告と回収依頼を送信
        </button>
        <button className="subtle" onClick={onClose}>
          キャンセル
        </button>
      </div>
    </div>
  )
}
