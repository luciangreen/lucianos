# LucianOS suite — Phase 0 platform

The shared base that LucianOS, iEdit, shellrun, the touchscreen terminal, simplug, fastos and DanceStudio all run on. It is one Node.js server that uses only Node's built-in modules, so there is nothing to install.

What Phase 0 gives you:

| Service | What it does |
| --- | --- |
| Server and routing | Serves every app; future apps go in `apps/<name>/` and appear at `/apps/<name>/` |
| Run modes and password | **Local** (default): only this Mac can reach it. **Remote**: reach it from your iPhone through a Tailscale tunnel, behind one suite password |
| File API | List, read, write, rename/move, new folder, trash (never deletes), search by name or contents, raw files (images, MIDI), live change watching |
| Job runner | Runs allowed commands as separate processes, up to 4 at once (the rest queue), with live output, interrupt, input, temporary folders deleted afterwards and a notification when a job ends |
| Prolog bridge | Runs a Prolog goal with no `?-` prompt: `swipl --stack-limit=54G -g "consult([...]), Goal" -t halt` |
| State store | Saves open windows, unsaved work, recent folders and preferences as JSON |
| Event bus | Apps hear about saved files, finished jobs and each other's `app.*` events |

The page at `/` is a **platform check**. With it you can browse and search files, edit and save them, and run a command or a Prolog goal with live output. The real LucianOS desktop replaces it in Phase 2.

## Start (local mode)

You need Node.js 20 or newer (`node --version`).

```sh
cd lucianos
cp config.example.json config.json   # edit "root" if you want a smaller suite folder than your home folder
npm start
```

Open http://localhost:4170/ in Safari or Chrome on the Mac.

## Remote mode (iPhone through Tailscale)

1. Install Tailscale on the Mac and the iPhone, and sign both into the same account.
2. Set the suite password: `npm run set-password`. Only a hash is stored, in `config.json`.
3. In `config.json`, set `"mode": "remote"` and `"secureCookie": true`.
4. Start the suite with `npm start`, then share it on your tailnet over HTTPS: `tailscale serve --bg 4170`.
5. On the iPhone, open the `https://<your-mac>.<tailnet>.ts.net/` address that Tailscale prints, then log in.

The server still listens only on the Mac itself. Tailscale carries the traffic, so the suite is never on the open internet.

## Settings (`config.json`)

| Key | Default | Meaning |
| --- | --- | --- |
| `mode` | `local` | `local` or `remote` |
| `port` | `4170` | Port on the Mac |
| `root` | `~` | Suite folder. Every file path and job folder must be inside it; links that point outside are refused |
| `dataDir` | `~/.lucianos` | State, trash |
| `allowedCommands` | `swipl node git ls echo cat cp mv mkdir pwd` | Only these programs can be run, by name, never through a shell |
| `maxConcurrentJobs` | `4` | Jobs past this number wait in a queue |
| `swiplStackLimit` | `54G` | Default for the Prolog bridge |
| `secureCookie` | `false` | Set to `true` behind `tailscale serve` (HTTPS) |

Trashed items go to `~/.lucianos/trash/`. Each one sits next to a `.origin` file that records where it came from.

## Security notes

- Local mode answers only requests addressed to `localhost`. Every API call needs an `X-LucianOS: 1` header, and the server refuses requests that browsers mark as coming from another site. Together these stop a web page you visit from reaching your files.
- Allowing `node` or `swipl` means a logged-in user can run any code. That is intended for your own suite, but keep the password strong in remote mode. Five wrong passwords lock logins for 15 minutes.
- Never add `bash` or `sh` to `allowedCommands` unless you mean to allow any shell command. shellrun will produce scripts that run through this allowlist.

## API in one glance

The browser library is `public/shared/api.js`. Every app imports it:

```js
import { api } from '/shared/api.js';
const { entries } = await api.files.list('Dropbox/GitHub-private2');
const job = await api.jobs.prolog({ goal: 'texttobr(u,"file.txt",u,u)', consult: ['text_to_breasonings.pl'], cwd: 'Dropbox/GitHub-private2/Text-to-Breasonings', tempDir: true });
api.jobs.stream(job.id, { output: ({ text }) => console.log(text), end: (s) => console.log(s.status) });
```

## Tests

```sh
npm test
```

There are 33 tests. They cover sandbox escapes, symlinks, save conflicts, trash, search, the command allowlist, shell-injection attempts, interrupt, input, temporary folders, the job queue, output streaming, the Prolog command line, state, events, the local-mode guards, password login and its rate limit.

## Adding the apps

Each app has its own repo and runs inside this platform. To add one, clone it into `apps/`. It then appears at `/apps/<name>/`:

```sh
cd lucianos/apps
git clone https://github.com/luciangreen/iedit
git clone https://github.com/luciangreen/shellrunscriptmaker
git clone https://github.com/luciangreen/touchscreenterminal
git clone https://github.com/luciangreen/simplug
git clone https://github.com/luciangreen/fastos
git clone https://github.com/luciangreen/dancestudio
```

For example, iEdit opens at http://localhost:4170/apps/iedit/. The platform repo ignores everything in `apps/`, so each app stays in its own repo.

## Next (Phase 1)

shellrun (`shellrunscriptmaker`) and iEdit, built on this API in their own repos.
