import { useState } from 'react'
import { CircleMarker, MapContainer, Popup, Rectangle, TileLayer, Tooltip } from 'react-leaflet'
import { useApi } from '../api'
import type { HeatCell, MapActivity, ParkCleanupStatusDto, WardSummary } from '../types'

const NARA_CENTER: [number, number] = [34.6835, 135.8048]
const CELL_SIZE = 0.01

type Mode = 'activities' | 'wards' | 'heat' | 'parks'

const MODES: { id: Mode; label: string; hint: string }[] = [
  { id: 'activities', label: '活動地点', hint: '確認済みの1活動ごとに表示。円の大きさは回収量。' },
  { id: 'wards', label: '地区別', hint: '地区ごとの累計。手が回っていない地区が一目でわかる。' },
  { id: 'heat', label: 'ごみ密度', hint: '約1km四方のメッシュ集計。重点区域の検討に使う。' },
  {
    id: 'parks',
    label: '未清掃の公園',
    hint: '1年以上清掃されていない公園と、一度も清掃されていない公園。重複を避けて次の清掃先を選ぶために使う。',
  },
]

/** 未清掃（一度も清掃記録がない）は最も強い警告色、1年以上放置はそれに次ぐ警告色にする */
function parkColorOf(neglect: ParkCleanupStatusDto['neglect']): string {
  return neglect === 'never' ? '#b91c1c' : '#b45309'
}

/** 回収量に応じた円の半径（px）。差が出すぎないよう平方根でならす。 */
function radiusOf(kg: number, scale = 2.2): number {
  return Math.max(6, Math.min(38, Math.sqrt(kg) * scale))
}

function colorOf(kg: number): string {
  if (kg >= 150) return '#7f1d1d'
  if (kg >= 80) return '#b45309'
  if (kg >= 40) return '#0f766e'
  return '#14b8a6'
}

export function MapView({ initialMode = 'activities' }: { initialMode?: Mode } = {}) {
  const [mode, setMode] = useState<Mode>(initialMode)
  const { data: activities } = useApi<MapActivity[]>('/map/activities')
  const { data: wards } = useApi<WardSummary[]>('/map/wards')
  const { data: cells } = useApi<HeatCell[]>(`/map/heat?cellSize=${CELL_SIZE}`)
  const { data: neglectedParks } = useApi<ParkCleanupStatusDto[]>('/map/parks')

  return (
    <div>
      <div className="chips">
        {MODES.map((m) => (
          <button key={m.id} className={`chip ${mode === m.id ? 'active' : ''}`} onClick={() => setMode(m.id)}>
            {m.label}
          </button>
        ))}
      </div>

      <div className="map-wrap">
        <MapContainer center={NARA_CENTER} zoom={12} scrollWheelZoom>
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          {mode === 'activities' &&
            activities?.map((a) => (
              <CircleMarker
                key={a.id}
                center={[a.lat, a.lng]}
                radius={radiusOf(a.garbageKg)}
                pathOptions={{ color: colorOf(a.garbageKg), fillOpacity: 0.45, weight: 2 }}
              >
                <Popup>
                  <strong>{a.title}</strong>
                  <br />
                  {a.date}／{a.participants}人参加
                  <br />
                  回収量 {a.garbageKg} kg
                </Popup>
              </CircleMarker>
            ))}

          {mode === 'wards' &&
            wards
              ?.filter((w) => w.lat !== null && w.lng !== null)
              .map((w) => (
                <CircleMarker
                  key={w.wardId}
                  center={[w.lat!, w.lng!]}
                  radius={radiusOf(w.garbageKg, 1.8)}
                  pathOptions={{ color: colorOf(w.garbageKg), fillOpacity: 0.35, weight: 2 }}
                >
                  <Tooltip permanent direction="top" offset={[0, -4]}>
                    {w.wardName}
                  </Tooltip>
                  <Popup>
                    <strong>{w.wardName}地区</strong>
                    <br />
                    活動 {w.activityCount} 回／延べ {w.participants} 人
                    <br />
                    回収量 {Math.round(w.garbageKg * 10) / 10} kg
                  </Popup>
                </CircleMarker>
              ))}

          {mode === 'heat' &&
            cells?.map((c, i) => (
              <Rectangle
                key={i}
                bounds={[
                  [c.lat - CELL_SIZE / 2, c.lng - CELL_SIZE / 2],
                  [c.lat + CELL_SIZE / 2, c.lng + CELL_SIZE / 2],
                ]}
                pathOptions={{ color: colorOf(c.garbageKg), fillOpacity: 0.4, weight: 1 }}
              >
                <Popup>
                  このメッシュの活動 {c.count} 回
                  <br />
                  回収量 {Math.round(c.garbageKg * 10) / 10} kg
                </Popup>
              </Rectangle>
            ))}

          {mode === 'parks' &&
            neglectedParks?.map((p) => (
              <CircleMarker
                key={p.parkId}
                center={[p.lat, p.lng]}
                radius={p.neglect === 'never' ? 12 : 9}
                pathOptions={{ color: parkColorOf(p.neglect), fillOpacity: 0.55, weight: 2 }}
              >
                <Popup>
                  <strong>{p.name}</strong>
                  <br />
                  {p.wardName}地区
                  <br />
                  最終清掃日: {p.lastCleanedOn ?? '清掃記録なし'}
                  <br />
                  経過日数: {p.daysSinceCleaned !== null ? `${p.daysSinceCleaned}日` : '清掃記録なし'}
                  <br />
                  清掃回数: {p.cleanupCount} 回
                  <br />
                  最終清掃団体: {p.lastCleanedGroupName ?? '—'}
                </Popup>
              </CircleMarker>
            ))}
        </MapContainer>
      </div>

      <p className="muted" style={{ marginTop: '0.5rem' }}>
        {MODES.find((m) => m.id === mode)!.hint}
      </p>
    </div>
  )
}
