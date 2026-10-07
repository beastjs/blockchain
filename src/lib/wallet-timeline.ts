export const TIMELINE_PERIODS = ['1D', '1W', '1M', '1Y'] as const
export type TimelinePeriod = typeof TIMELINE_PERIODS[number]
export interface TimelineEvent { hash: string; timestamp: number; received: boolean; sent: boolean }
export interface WalletTimeline { address: string; network: string; events: TimelineEvent[]; updated: number; since: number; partial: boolean }
export interface TimelinePoint { timestamp: number; total: number; received: number; sent: number }
export const periodDuration = (period: TimelinePeriod) => ({ '1D': 1, '1W': 7, '1M': 30, '1Y': 365 })[period] * 86_400_000

export function timelinePoints(events: readonly TimelineEvent[], period: TimelinePeriod, end: number): TimelinePoint[] {
  const start = end - periodDuration(period)
  const sorted = events.filter(event => event.timestamp >= start && event.timestamp <= end).sort((a, b) => a.timestamp - b.timestamp)
  let cursor = 0, total = 0, received = 0, sent = 0
  return Array.from({ length: 33 }, (_, index) => {
    const timestamp = start + (end - start) * index / 32
    while (cursor < sorted.length && sorted[cursor]!.timestamp <= timestamp) {
      const event = sorted[cursor++]!
      total++; received += Number(event.received); sent += Number(event.sent)
    }
    return { timestamp, total, received, sent }
  })
}

// Horizontal tangents keep these cumulative curves smooth and monotone between samples.
export function timelinePath(points: readonly TimelinePoint[], series: 'total' | 'received' | 'sent', maximum: number) {
  const y = (value: number) => 174 - value / Math.max(1, maximum) * 150
  if (!points.length) return ''
  let path = `M0 ${y(points[0]![series]).toFixed(2)}`
  for (let index = 1; index < points.length; index++) {
    const x0 = (index - 1) / (points.length - 1) * 660
    const x1 = index / (points.length - 1) * 660
    const middle = (x0 + x1) / 2
    path += ` C${middle.toFixed(2)} ${y(points[index - 1]![series]).toFixed(2)} ${middle.toFixed(2)} ${y(points[index]![series]).toFixed(2)} ${x1.toFixed(2)} ${y(points[index]![series]).toFixed(2)}`
  }
  return path
}
