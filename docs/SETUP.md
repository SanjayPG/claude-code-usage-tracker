# Claude Code Usage Tracker: show your remaining usage in Claude Code

This guide adds a live, coloured quota panel above the prompt, with a progress bar for each limit:

```
Current session  ███░░░░░░░░░░░░░░░░░  13% used  Resets 10:40 PM

This week        █░░░░░░░░░░░░░░░░░░░   2% used  Resets Fri 7:00 AM
```

- **Current session** is the 5-hour window; **This week** is the 7-day window.
- The bar fill and percentage share one colour: green below 50% used, amber from 50 to 80%, red above 80%. Labels are blue, the empty part of the bar is a dark track, and a blank line separates the two rows so the bars do not touch.
- Reset times are shown in your local time.
- It updates as your quota moves.
- It costs no tokens: it is drawn locally and never sent to the model.

It is a small Claude Code **mod** (a plugin that changes the interface), installed once and loaded in every session.

## Before you start

- **Plan:** Claude Code only reports quota for **Claude Pro and Max** subscribers. On an API key or other providers the band stays hidden.
- **Timing:** the band appears after the **first reply** in a session. Before that there is no quota reading.
- **Version:** built and tested on Claude Code **2.1.296**. Older versions may not have the mod API.
- **Position:** mods cannot draw in the top-right corner of the screen. The band sits right-aligned above the prompt, the closest slot available.
- **Windows paths** are shown below. On macOS or Linux use `~/.claude/mods/usage-tracker` and forward slashes.

## Quickest way: install from GitHub

If you just want it, you do not need the manual steps below. Type this at the Claude Code prompt:

```
/plugin install usage-tracker --marketplace SanjayPG/claude-code-usage-tracker
```

Answer `y` to add the marketplace, choose the **user** scope with Enter, then send a message. Source: https://github.com/SanjayPG/claude-code-usage-tracker

The rest of this guide is for building it yourself from scratch.

## Step 1: Create the folder

Create this structure under `~/.claude/mods/` (on Windows, `C:\Users\<you>\.claude\mods\`):

```
usage-tracker/
├── .claude-plugin/
│   ├── plugin.json
│   └── marketplace.json
├── hooks/
│   ├── hooks.json
│   └── register.tsx
└── types/
    └── index.d.ts
```

Bash:

```bash
mkdir -p ~/.claude/mods/usage-tracker/.claude-plugin ~/.claude/mods/usage-tracker/hooks ~/.claude/mods/usage-tracker/types
```

PowerShell:

```powershell
New-Item -ItemType Directory -Force "$HOME\.claude\mods\usage-tracker\.claude-plugin", "$HOME\.claude\mods\usage-tracker\hooks", "$HOME\.claude\mods\usage-tracker\types"
```

## Step 2: Add the files

### `.claude-plugin/plugin.json`

```json
{
  "name": "usage-tracker",
  "version": "0.1.0",
  "author": { "name": "Your Name" },
  "description": "Shows your remaining Claude usage (current session and this week) as colour-coded progress bars above the prompt.",
  "license": "MIT",
  "types": "./types/index.d.ts"
}
```

### `.claude-plugin/marketplace.json`

This lets Claude Code install the mod from a local folder.

```json
{
  "name": "usage-tracker",
  "description": "A Claude Code mod that tracks your usage quota with progress bars.",
  "owner": { "name": "Your Name" },
  "plugins": [{ "name": "usage-tracker", "source": "./" }]
}
```

### `hooks/hooks.json`

```json
{
  "modules": ["./register.tsx"]
}
```

### `types/index.d.ts`

Declares the one value the mod keeps in session state.

```ts
export type QuotaWindow = { kind: string; percentUsed: number; resetsAt?: string }

declare module 'claude-code' {
  interface PluginState {
    'usage-tracker': { windows: QuotaWindow[] }
  }
}
```

### `hooks/register.tsx`

```tsx
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
```

## Step 3: Validate

```bash
claude plugin validate ~/.claude/mods/usage-tracker
```

Expect `Validation passed`. A warning about a missing marketplace description is harmless. The output should list the hooks `session.measure` and `ui.render{component=AbovePrompt}`.

## Step 4: Install it

Start Claude Code, then type this at the prompt (adjust the path to yours):

```
/plugin install usage-tracker --marketplace C:\Users\<you>\.claude\mods\usage-tracker
```

1. Answer `y` when asked to add the marketplace.
2. Choose the **user** scope with Enter. This is what loads the mod in every future session.
3. You should see `Installed usage-tracker. Plugin is now active.`

This adds two entries to `~/.claude/settings.json`, `extraKnownMarketplaces` and `enabledPlugins`, so you do not edit that file by hand.

## Step 5: Check it works

1. Send any message, such as `hi`.
2. After the reply, the band appears above the prompt.
3. Close Claude Code and start a new session. Send a message. The band should appear again with no extra steps.

## Troubleshooting

| Symptom | Likely cause and fix |
| --- | --- |
| Nothing appears | Not on Pro or Max, or no reply yet. Send a message first. |
| `Marketplace file not found at ...` | The path in the install command is wrong, or `.claude-plugin/marketplace.json` is missing. |
| `Plugin "usage-tracker" not found in marketplace` | The `name` in `plugin.json` and the `plugins` entry in `marketplace.json` do not match. |
| Validation errors | Re-copy the files exactly. Check `hooks.json` points to `./register.tsx`. |
| Band gone after a restart | It was installed at the wrong scope. Run `/plugin` and reinstall at the **user** scope. |
| Still stuck | Run `claude --debug` and look for lines starting `usage-tracker:` or `ui.render (AbovePrompt)`. |

## Optional: a footer status line instead

If you would rather have the quota in the footer under the prompt, or as well as the band, Claude Code passes quota to a status line script as `rate_limits.five_hour.used_percentage` and `rate_limits.seven_day.used_percentage` (with `resets_at` in epoch seconds).

Save as `~/.claude/statusline-quota.js`:

```js
// rate_limits is only present for Pro/Max after the first API response, so every field is optional.
let raw = "";
process.stdin.on("data", (chunk) => (raw += chunk));
process.stdin.on("end", () => {
  let input = {};
  try {
    input = JSON.parse(raw);
  } catch {
    // fall through with empty input
  }

  const fmtReset = (epochSec) => {
    const mins = Math.max(0, Math.round((epochSec * 1000 - Date.now()) / 60000));
    if (mins >= 1440) return `${Math.floor(mins / 1440)}d${Math.floor((mins % 1440) / 60)}h`;
    if (mins >= 60) return `${Math.floor(mins / 60)}h${mins % 60}m`;
    return `${mins}m`;
  };

  const paint = (code, text) => `\x1b[${code}m${text}\x1b[0m`;
  const colorFor = (left) => (left > 50 ? "32" : left > 20 ? "33" : "31");

  const fmtWindow = (label, win) => {
    if (!win || typeof win.used_percentage !== "number") return null;
    const left = Math.max(0, 100 - win.used_percentage);
    const reset = win.resets_at ? paint("2", ` (resets ${fmtReset(win.resets_at)})`) : "";
    return `${paint("36", label)} ${paint(colorFor(left), `${left.toFixed(0)}% left`)}${reset}`;
  };

  const limits = input.rate_limits || {};
  const parts = [fmtWindow("5h", limits.five_hour), fmtWindow("7d", limits.seven_day)].filter(Boolean);
  const model = input.model && input.model.display_name ? `${paint("1;35", input.model.display_name)} | ` : "";
  process.stdout.write(`${model}${parts.length ? parts.join(" | ") : paint("2", "quota: n/a until first response")}`);
});
```

Then add to `~/.claude/settings.json` (use your own absolute path):

```json
"statusLine": {
  "type": "command",
  "command": "node C:/Users/<you>/.claude/statusline-quota.js",
  "refreshInterval": 60
}
```

It needs Node.js on your `PATH`. To remove it, delete the `statusLine` block.

## Uninstall

```
/plugin uninstall usage-tracker
```

Then delete `~/.claude/mods/usage-tracker`. If the marketplace entry remains, remove `usage-tracker` from `extraKnownMarketplaces` in `~/.claude/settings.json`.

## Notes

- **No token cost:** the band is drawn by Claude Code locally and is never added to the conversation.
- **Terminal title attempt:** putting the quota in the terminal tab title did not work in VS Code's terminal, because Claude Code sets its own title. This guide does not use it.
- **Other ways to load a mod:** `claude --plugin-dir <folder>` runs a mod for one session without installing it. This is handy while editing.
