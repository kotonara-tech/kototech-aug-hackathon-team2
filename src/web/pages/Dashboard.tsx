import { Link } from 'react-router-dom'
import { useApi } from '../api'
import type { EventDto, Me, Stats, WardSummary } from '../types'
import { MapView } from '../components/MapView'
import { Empty, RankBadge, Stat, formatDate } from '../components/ui'

export function Dashboard({ me }: { me: Me }) {
  const { data: stats } = useApi<Stats>('/stats')
  const { data: wards } = useApi<WardSummary[]>('/map/wards')
  const { data: events } = useApi<EventDto[]>('/events')

  const openEvents = (events ?? []).filter((e) => e.isOpen).slice(0, 3)

  return (
    <>
      <h1>奈良市のクリーン活動</h1>
      <p className="page-lead">
        市内で確認済みの清掃活動の実績です。地図と数字で「どこが手薄か」を共有し、次の活動につなげます。
      </p>

      <div className="grid cols-4">
        <Stat label="累計 回収量" value={stats?.totalGarbageKg ?? '—'} unit="kg" />
        <Stat label="活動回数" value={stats?.totalActivities ?? '—'} unit="回" />
        <Stat label="延べ参加人数" value={stats?.totalParticipants ?? '—'} unit="人" />
        <Stat label="活動中の地区" value={`${stats?.activeWards ?? '—'} / 20`} unit="地区" />
      </div>

      {me.role === 'city' && (
        <div className="grid cols-2" style={{ marginTop: '0.75rem' }}>
          <div className="card spread">
            <div>
              <div className="muted">審査待ちの申請</div>
              <div style={{ fontSize: '1.4rem', fontWeight: 700 }}>{stats?.pendingReviews ?? 0} 件</div>
            </div>
            <Link className="btn" to="/activities">
              審査する
            </Link>
          </div>
          <div className="card spread">
            <div>
              <div className="muted">未確定の奨励金</div>
              <div style={{ fontSize: '1.4rem', fontWeight: 700 }}>{stats?.pendingPayments ?? 0} 件</div>
            </div>
            <Link className="btn" to="/payments">
              支払処理へ
            </Link>
          </div>
        </div>
      )}

      <h2>活動実績マップ</h2>
      <MapView />

      <div className="grid cols-2" style={{ marginTop: '1.5rem' }}>
        <div>
          <h2 style={{ marginTop: 0 }}>地区別の実績</h2>
          <div className="card table-scroll">
            <table>
              <thead>
                <tr>
                  <th>地区</th>
                  <th className="num">活動</th>
                  <th className="num">回収量</th>
                  <th className="num">延べ人数</th>
                </tr>
              </thead>
              <tbody>
                {(wards ?? []).map((w) => (
                  <tr key={w.wardId}>
                    <td>{w.wardName}</td>
                    <td className="num">{w.activityCount}</td>
                    <td className="num">{Math.round(w.garbageKg * 10) / 10} kg</td>
                    <td className="num">{w.participants}</td>
                  </tr>
                ))}
                {wards?.length === 0 && (
                  <tr>
                    <td colSpan={4} className="muted">
                      まだ確定した実績がありません
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div>
          <h2 style={{ marginTop: 0 }}>募集中のイベント</h2>
          <div className="list">
            {openEvents.map((e) => (
              <div key={e.id} className="card">
                <div className="spread">
                  <strong>{e.title}</strong>
                  <RankBadge rank={`+${e.pointsReward}pt`} />
                </div>
                <div className="muted">
                  {formatDate(e.startsAt)}／{e.wardName}／{e.groupName}
                </div>
                <div className="muted">
                  残り {e.remainingSeats} 席（申込 {e.confirmedCount}人）
                </div>
              </div>
            ))}
            {openEvents.length === 0 && <Empty>募集中のイベントはありません</Empty>}
            <Link className="btn ghost" to="/events" style={{ textAlign: 'center' }}>
              すべてのイベントを見る →
            </Link>
          </div>
        </div>
      </div>
    </>
  )
}
