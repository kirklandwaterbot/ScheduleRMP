# ScheduleRMP

A Firefox add-on that places Rate My Professors ratings beside instructors in
CUNY Schedule Builder. It is unofficial and is not affiliated with CUNY or Rate
My Professors.

## Features

- Rating and profile links directly inside Schedule Builder
- Stronger professor and college matching, including initials, accents, and
  `Last, First` names
- Local rating cache with configurable refresh intervals
- Clear loading, not-found, and retry states
- Settings to disable annotations or hide unrated professors
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
stored locally in Firefox. See [PRIVACY.md](PRIVACY.md).

## License

[MIT](LICENSE)
