# ScheduleRMP

A Firefox add-on that places detailed Rate My Professors information beside
instructors in CUNY Schedule Builder and exports the visible schedule as a local
calendar file. It is unofficial and is not affiliated with CUNY or Rate My
Professors.

## Features

- Ratings, difficulty, review counts, take-again percentages, top tags, and
  profile links directly inside Schedule Builder
- Separate matches when a class has multiple instructors
- Stronger professor and college matching, including initials, accents, and
  `Last, First` names
- Local rating cache with configurable refresh intervals
- Clear loading, not-found, and retry states
- Settings to disable annotations or hide unrated professors
- A review-first `.ics` export for the currently visible schedule
- Recurring class events with course details, locations, and Eastern time
- Clear warnings for untimed, incomplete, or skipped meetings
- Google Calendar import guidance and duplicate-import reminders
- Accessible labels, focus styles, symbols, and light/dark color support
- No analytics or project-operated data collection server

## Install temporarily in Firefox

1. Install dependencies and build:

   ```powershell
   corepack yarn install --frozen-lockfile
   corepack yarn build
   ```

2. Open `about:debugging#/runtime/this-firefox`.
3. Select **Load Temporary Add-on**.
4. Choose `build/firefox/manifest.json`.

Temporary add-ons are removed when Firefox closes. A signed `.xpi` is required
for permanent installation in standard Firefox.

## Development

```powershell
corepack yarn test
corepack yarn lint:firefox
corepack yarn package:firefox
```

The unpacked add-on is written to `build/firefox/`. The submission-ready ZIP is
written to `artifacts/`.

## Mozilla source-code submission

This project uses esbuild, so answer **Yes** when Mozilla asks whether build
tools are used. Submit the repository source, excluding `node_modules`,
`build`, `artifacts`, `dist`, and `_metadata`. Reviewers can reproduce the
package with:

```powershell
corepack yarn install --frozen-lockfile
corepack yarn package:firefox
```

## Privacy

The add-on reads instructor and college names displayed in Schedule Builder and
sends them directly to Rate My Professors for lookup. Results and settings are
stored locally in Firefox. Calendar files are generated entirely on the device
only when requested. See [PRIVACY.md](PRIVACY.md).

## Calendar export limitations

Only the currently visible schedule is exported. Untimed or asynchronous
classes are listed as skipped, and recurring meetings continue through the
displayed course end date without excluding holidays or breaks. Import a file
only once to avoid duplicate calendar events.

## License

[MIT](LICENSE)

The calendar parser, generator, and review workflow include MIT-licensed work
adapted from Rate My CUNY Professor. See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
