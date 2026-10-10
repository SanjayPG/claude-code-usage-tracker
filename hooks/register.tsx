import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { QuotaWindow } from '../types'

const windows = atom({ plugin: 'usage-tracker', key: 'windows' } as const, [] as QuotaWindow[])
// Only the non-terminal surfaces use this: the terminal gets its own [-] control from Claude Code.
const isCollapsed = atom({ plugin: 'usage-tracker', key: 'isCollapsed' } as const, false)

const ROWS = [
  { kind: 'five_hour', label: 'Current session', short: 'Session' },
  { kind: 'seven_day', label: 'This week', short: 'Week' },
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

type Row = { label: string; short: string; used: number; reset: string }

// Pixel layout for the SVG card. A drawing keeps its columns in any font, which spaces cannot.
const SVG_ROW_HEIGHT = 26
const SVG_BAR_X = 122
const SVG_BAR_WIDTH = 160
const SVG_PERCENT_X = SVG_BAR_X + SVG_BAR_WIDTH + 12
const SVG_RESET_X = SVG_PERCENT_X + 82
const SVG_WIDTH = SVG_RESET_X + 130

const svgCard = (rows: Row[]) => {
  const height = rows.length * SVG_ROW_HEIGHT
  const body = rows
    .map((r, i) => {
      const mid = i * SVG_ROW_HEIGHT + SVG_ROW_HEIGHT / 2
      const color = fillFor(r.used)
      // At least a small stub once anything is used, so a low figure is still visible.
      const fill = r.used > 0 ? Math.max(6, (r.used / 100) * SVG_BAR_WIDTH) : 0

      return [
        `<text x="0" y="${mid + 4}" fill="${LABEL}" font-weight="600">${r.label}</text>`,
        `<rect x="${SVG_BAR_X}" y="${mid - 4}" width="${SVG_BAR_WIDTH}" height="8" rx="4" fill="${TRACK}"/>`,
        fill > 0 ? `<rect x="${SVG_BAR_X}" y="${mid - 4}" width="${fill}" height="8" rx="4" fill="${color}"/>` : '',
        `<text x="${SVG_PERCENT_X}" y="${mid + 4}" fill="${color}" font-weight="700">${r.used.toFixed(0)}% used</text>`,
        `<text x="${SVG_RESET_X}" y="${mid + 4}" fill="#8b949e">${r.reset}</text>`,
      ].join('')
    })
    .join('')

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${SVG_WIDTH}" height="${height}" viewBox="0 0 ${SVG_WIDTH} ${height}" font-family="system-ui, -apple-system, 'Segoe UI', sans-serif" font-size="13">${body}</svg>`
}

export const register: Register = on => {
  // session.measure fires when a window moves a whole point, so the bars track live quota.
  on('session.measure', async ($, e, next) => {
    if (e.changed.includes('rateLimits')) {
      const tracked = e.rateLimits.filter(w => ROWS.some(r => r.kind === w.kind))
      await update($, windows, () => tracked)

      // A small JSON feed for the Windows tray app. A failed write must never break the session.
      const home = (await $.env.get('USERPROFILE')) ?? (await $.env.get('HOME'))
      if (home && tracked.length > 0) {
        const feed: Record<string, unknown> = { updatedAt: new Date(await $.clock.now()).toISOString() }
        for (const w of tracked) {
          feed[w.kind] = { usedPercent: w.percentUsed, resetsAt: w.resetsAt ?? null }
        }

        try {
          await $.fs.write(`${home}/.claude/usage-feed.json`, JSON.stringify(feed))
        } catch {
          // Feed is optional; the on-screen card still works.
        }
      }
    }

    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const quota = await read($, windows)

    // Off a subscription, or before the first response, there is nothing to show.
    if (e.props.hasSurvey || quota.length === 0) {
      return next(e)
    }

    const now = await $.clock.now()

    if (e.surface === 'terminal') {
      const { Box, Text } = $.ui.resolve(e)

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
    }

    // Desktop, VS Code and mobile draw an SVG card, with a button to minimise it.
    const { Box, Text, Button, Svg } = $.ui.resolve(e)
    const rows: Row[] = ROWS.flatMap(row => {
      const w = quota.find(q => q.kind === row.kind)

      return w
        ? [{ label: row.label, short: row.short, used: Math.min(100, Math.max(0, w.percentUsed)), reset: resetAt(w.resetsAt, now) }]
        : []
    })
    const collapsed = await read($, isCollapsed)

    if (collapsed) {
      return (
        <Box justifyContent="flex-end" gap={1}>
          <Text color={LABEL} bold>Usage</Text>
          {rows.map(r => (
            <Text key={r.short} color={fillFor(r.used)} bold>{`${r.short} ${r.used.toFixed(0)}%`}</Text>
          ))}
          <Button key="expand" label="Expand" onPress={() => update($, isCollapsed, () => false)} />
        </Box>
      )
    }

    return (
      <Box flexDirection="column" alignItems="flex-end">
        <Svg
          source={svgCard(rows)}
          alt={rows.map(r => `${r.label}: ${r.used.toFixed(0)}% used, ${r.reset}`).join('. ')}
          width={SVG_WIDTH}
          height={rows.length * SVG_ROW_HEIGHT}
        />
        <Button key="minimise" label="Minimise" onPress={() => update($, isCollapsed, () => true)} />
      </Box>
    )
  })
}
