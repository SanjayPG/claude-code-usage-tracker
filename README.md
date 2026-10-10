# Claude Code Usage Tracker

A [Claude Code](https://claude.com/claude-code) mod that shows how much of your usage you have left, as colour-coded progress bars above the prompt.

```
Current session  ███░░░░░░░░░░░░░░░░░  13% used  Resets 10:40 PM

This week        █░░░░░░░░░░░░░░░░░░░   2% used  Resets Fri 7:00 AM
```

- **Current session** is the 5-hour window; **This week** is the 7-day window.
- The bar and percentage turn from green (under 50% used) to amber (50-80%) to red (over 80%).
- Reset times are in your local time.
- It updates live as your quota moves.
- It costs no tokens. It is drawn locally and never sent to the model.

## Install

Type this at the Claude Code prompt:

```
/plugin install usage-tracker --marketplace SanjayPG/claude-code-usage-tracker
```

1. Answer `y` when asked to add the marketplace.
2. Choose the **user** scope with Enter, so it loads in every project and session.
3. Send a message. The bars appear after the first reply.

You do not need to copy any files or edit any settings by hand.

## Requirements

- **Claude Pro or Max.** Claude Code only reports quota on those plans. On an API key or another provider the bars stay hidden.
- **A recent Claude Code.** Built and tested on 2.1.296 in VS Code's integrated terminal. Older versions may not support mods.
- A terminal that draws block characters (`█`) and hex colours.

## Where it appears

Mods cannot draw in the top-right corner of the screen. The bars sit right-aligned above the prompt, the closest slot Claude Code offers.

- **Terminal:** block-character bars. Claude Code adds its own `[-]` control to minimise them.
- **Claude Code Desktop, VS Code and mobile:** a drawn card with a **Minimise** button that collapses it to one line (`Usage  Session 26%  Week 4%`), and an **Expand** button to bring it back.

The desktop layout is newer and less tested than the terminal one.

## Usage feed file

Whenever your usage changes, the mod also writes a small JSON file to `~/.claude/usage-feed.json` (on Windows, `%USERPROFILE%\.claude\usage-feed.json`), for example:

```json
{"updatedAt":"2026-10-10T20:59:15.263Z","five_hour":{"usedPercent":34,"resetsAt":"2026-10-10T21:40:00.000Z"},"seven_day":{"usedPercent":5,"resetsAt":"2026-10-16T06:00:00.000Z"}}
```

It holds only the percentages and reset times Claude Code already shows you, nothing about your account or conversations, and it never leaves your machine. Other tools (such as a tray app) can read it. If the write fails, the on-screen bars still work. To stop it, uninstall the plugin and delete the file.

## Uninstall

```
/plugin uninstall usage-tracker
```

## How it works

Two hooks in `hooks/register.tsx`:

- `session.measure` receives the rate-limit windows Claude Code reports and keeps them in session state.
- `ui.render` on `AbovePrompt` draws the bars from that state, and draws nothing until there is a reading.

Change the look by editing the constants at the top of that file (`BAR_WIDTH`, `TRACK`, `LABEL`, the colour thresholds in `fillFor`).

## Build it yourself

Prefer to set it up by hand, or want to see how each file works? Follow the [step-by-step guide](docs/SETUP.md).

## Develop

```
claude plugin validate .
claude --plugin-dir .
```

## Licence

MIT. See [LICENSE](LICENSE).
