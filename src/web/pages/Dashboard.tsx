import { Link } from 'react-router-dom'
import { useApi } from '../api'
import type { Me, Stats, WardSummary } from '../types'
import { MapView } from '../components/MapView'
import { Stat } from '../components/ui'

export function Dashboard({ me }: { me: Me }) {
  const { data: stats } = useApi<Stats>('/stats')
  const { data: wards } = useApi<WardSummary[]>('/map/wards')

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
              <div className="muted">写真確認待ちの活動報告</div>
              <div style={{ fontSize: '1.4rem', fontWeight: 700 }}>{stats?.pendingReviews ?? 0} 件</div>
            </div>
            <Link className="btn" to="/activities">
              確認する
            </Link>
          </div>
          <div className="card spread">
            <div>
              <div className="muted">手配・回収待ち</div>
              <div style={{ fontSize: '1.4rem', fontWeight: 700 }}>{stats?.pendingPickups ?? 0} 件</div>
            </div>
            <Link className="btn" to="/activities">
              回収管理へ
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
          <h2 style={{ marginTop: 0 }}>日常業務</h2>
          <div className="card">
            <ol style={{ marginTop: 0 }}>
              <li>団体が活動前後の写真と実績を報告</li>
              <li>必要な場合は同時にごみ回収を依頼</li>
              <li>地域づくり推進課が写真確認と回収手配を更新</li>
              <li>年度末は確認済み実績を自動集計</li>
            </ol>
            <div className="row">
              <Link className="btn" to="/activities">
                活動・回収管理
              </Link>
              {me.role === 'city' && (
                <Link className="btn ghost" to="/reports">
                  年度活動実績
                </Link>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
