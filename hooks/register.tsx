import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { QuotaWindow } from '../types'

const windows = atom({ plugin: 'usage-tracker', key: 'windows' } as const, [] as QuotaWindow[])

const ROWS = [
  { kind: 'five_hour', label: 'Current session' },
  { kind: 'seven_day', label: 'This week' },
] as const

const BAR_WIDTH = 20
// A solid dark block, not a dotted one, so the empty part of the bar reads as a clean track.
const TRACK = '#2d333b'
// One soft blue for both labels, so the status colours stay the only accent that changes.
const LABEL = '#60a5fa'
const LABEL_WIDTH = Math.max(...ROWS.map(r => r.label.length))
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
// Longest reset text ("Resets Wed 12:00 AM"); padding to it keeps both rows the same width so they align.
const RESET_WIDTH = 'Resets Wed 12:00 AM'.length

// Fill colour follows how much is used: calm green, amber, then red.
const fillFor = (used: number) => (used < 50 ? '#4ade80' : used < 80 ? '#fbbf24' : '#f87171')

const clockTime = (d: Date) => {
  const h = d.getHours()
  const mins = String(d.getMinutes()).padStart(2, '0')

  return `${h % 12 || 12}:${mins} ${h < 12 ? 'AM' : 'PM'}`
}

// "10:40 PM" when it resets today, "Fri 7:00 AM" otherwise.
const resetAt = (iso: string | undefined, now: number) => {
  if (!iso) return ''
  const at = new Date(iso)
  const isToday = at.toDateString() === new Date(now).toDateString()

  return `Resets ${isToday ? '' : `${DAYS[at.getDay()]} `}${clockTime(at)}`
}

export const register: Register = on => {
  // session.measure fires when a window moves a whole point, so the bars track live quota.
  on('session.measure', async ($, e, next) => {
    if (e.changed.includes('rateLimits')) {
      await update($, windows, () => e.rateLimits.filter(w => ROWS.some(r => r.kind === w.kind)))
    }

    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const quota = await read($, windows)

    // Off a subscription, or before the first response, there is nothing to show.
    if (e.props.hasSurvey || quota.length === 0) {
      return next(e)
    }

    const { Box, Text } = $.ui.resolve(e)
    const now = await $.clock.now()

    return (
      <Box flexDirection="column" alignItems="flex-end" gap={1}>
        {ROWS.map(row => {
          const w = quota.find(q => q.kind === row.kind)
          if (!w) return null

          const used = Math.min(100, Math.max(0, w.percentUsed))
          // At least one block once anything is used, so a small figure is still visible.
          const filled = used > 0 ? Math.max(1, Math.round((used / 100) * BAR_WIDTH)) : 0

          return (
            <Text key={row.kind}>
              <Text color={LABEL} bold>{row.label.padEnd(LABEL_WIDTH)}</Text>
              <Text>{'  '}</Text>
              <Text color={fillFor(used)}>{'█'.repeat(filled)}</Text>
              <Text color={TRACK}>{'█'.repeat(BAR_WIDTH - filled)}</Text>
              <Text color={fillFor(used)} bold>{` ${used.toFixed(0).padStart(3)}% used`}</Text>
              <Text dimColor>{`  ${resetAt(w.resetsAt, now).padEnd(RESET_WIDTH)}`}</Text>
            </Text>
          )
        })}
      </Box>
    )
  })
}
