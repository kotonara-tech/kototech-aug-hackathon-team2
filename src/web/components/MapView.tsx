import { useState } from 'react'
import { CircleMarker, MapContainer, Popup, Rectangle, TileLayer, Tooltip } from 'react-leaflet'
import { useApi } from '../api'
import type { HeatCell, MapActivity, WardSummary } from '../types'

const NARA_CENTER: [number, number] = [34.6835, 135.8048]
const CELL_SIZE = 0.01

type Mode = 'activities' | 'wards' | 'heat'

const MODES: { id: Mode; label: string; hint: string }[] = [
  { id: 'activities', label: '活動地点', hint: '確認済みの1活動ごとに表示。円の大きさは回収量。' },
  { id: 'wards', label: '地区別', hint: '地区ごとの累計。手が回っていない地区が一目でわかる。' },
  { id: 'heat', label: 'ごみ密度', hint: '約1km四方のメッシュ集計。重点区域の検討に使う。' },
]

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

export function MapView() {
  const [mode, setMode] = useState<Mode>('activities')
  const { data: activities } = useApi<MapActivity[]>('/map/activities')
  const { data: wards } = useApi<WardSummary[]>('/map/wards')
  const { data: cells } = useApi<HeatCell[]>(`/map/heat?cellSize=${CELL_SIZE}`)

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
        </MapContainer>
      </div>

      <p className="muted" style={{ marginTop: '0.5rem' }}>
        {MODES.find((m) => m.id === mode)!.hint}
      </p>
    </div>
  )
}
