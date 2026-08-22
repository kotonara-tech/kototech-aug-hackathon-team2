import { useState } from 'react'
import { useApi } from '../api'
import type { AnnualReportDto } from '../types'
import { Empty, Stat } from '../components/ui'

const currentFiscalYear = () => {
  const now = new Date()
  return now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1
}

const WORK_TYPE_LABELS: Record<string, string> = {
  cleanup: '清掃',
  weeding: '除草',
  pruning: '低木剪定',
  planting: '花植え',
  other: 'その他',
}

export function AnnualReport() {
  const [fiscalYear, setFiscalYear] = useState(currentFiscalYear())
  const { data, error } = useApi<AnnualReportDto>(`/reports/annual?fiscalYear=${fiscalYear}`, [fiscalYear])

  return (
    <>
      <div className="spread">
        <div>
          <h1>年度活動実績</h1>
          <p className="page-lead">確認済みの活動報告を集計します。団体への再集計依頼は不要です。</p>
        </div>
        <div className="field">
          <label>年度</label>
          <input type="number" value={fiscalYear} onChange={(event) => setFiscalYear(Number(event.target.value))} />
        </div>
      </div>

      {error && <div className="alert error">{error}</div>}
      <div className="grid cols-4">
        <Stat label="活動回数" value={data?.totalActivities ?? '—'} unit="回" />
        <Stat label="延べ参加人数" value={data?.totalParticipants ?? '—'} unit="人" />
        <Stat label="活動時間" value={data?.totalHours ?? '—'} unit="時間" />
        <Stat label="回収依頼" value={data?.pickupRequests ?? '—'} unit="件" />
      </div>

      <h2>作業別</h2>
      <div className="grid cols-4">
        {Object.entries(data?.byWorkType ?? {}).map(([type, count]) => (
          <Stat key={type} label={WORK_TYPE_LABELS[type] ?? type} value={count} unit="回" />
        ))}
      </div>

      <h2>団体別</h2>
      <div className="card table-scroll">
        <table>
          <thead>
            <tr>
              <th>団体</th>
              <th className="num">活動</th>
              <th className="num">延べ人数</th>
              <th className="num">活動時間</th>
              <th className="num">回収量</th>
            </tr>
          </thead>
          <tbody>
            {(data?.byGroup ?? []).map((group) => (
              <tr key={group.groupId}>
                <td>{group.groupName}</td>
                <td className="num">{group.activityCount}回</td>
                <td className="num">{group.participants}人</td>
                <td className="num">{group.hours}時間</td>
                <td className="num">{group.garbageKg}kg</td>
              </tr>
            ))}
          </tbody>
        </table>
        {data?.byGroup.length === 0 && <Empty>この年度に確認済みの活動はありません</Empty>}
      </div>
    </>
  )
}
