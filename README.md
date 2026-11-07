# LucianOS

LucianOS is a web desktop that runs on your Mac. You can reach it from the Mac, or from your iPhone through a tunnel. This repo has the desktop and the shared platform that every app in the suite runs on: iEdit, shellrun, the touchscreen terminal, simplug, fastos and DanceStudio. It is one Node.js server that uses only Node's built-in modules, so there is nothing to install.

## The desktop (at `/`)

- **Icons:**
  - Your `Desktop` folder appears as icons. You can choose another folder with **Go ▸ Choose desktop folder**. Installed apps appear on the right.
  - Double-click an icon to open it. On a touchscreen, tap a selected icon.
  - Drag icons to arrange them; their places are remembered.
  - Drop icons on a folder, or on a folder window, to move the files there.
  - Shift or ⌘ selects several icons. **Enter** renames the selected icon in place. **Delete** (or the Delete button) moves it to the trash after asking.
- **What opens what:**

  | You open | What happens |
  | --- | --- |
  | Folder | Opens in a folder window |
  | Text, Prolog or Markdown file | Opens in iEdit, in a desktop window. Further files open in the same iEdit window |
  | `.shellrun.json` script | Opens in shellrun and runs |
  | `.url` or `.webloc` icon | Opens the address; suite apps such as `/apps/iedit/` open in a desktop window |
  | Image, audio, video or PDF | Opens in a viewer |

  **File ▸ New URL icon** makes a new link icon.
- **Spotlight** (top right, ⌘K) finds apps, files by name and, with one more click, text inside files. It also answers sums as you type, for example `2 (3 + 4) ^ 2`.
- **Tools ▸ Calculator:**
  - Brackets `( ) [ ] { }`, spaces, `+ − × ÷ ^ %`, `mod`, `!`, `sqrt( )` and `pi`.
  - Durations such as `2h 30m + 45 min`, and conversions such as `90 min in h`.
  - Copy the answer with the button, or select part of it. The answer and the history stay put, even after a reload.
- **Tools ▸ Time converter:** a date and time in one place, shown in other time zones.
- **The character** (bottom right; **Tools ▸ Show or hide the character**) is a talking photo, ported from [retromr](https://github.com/luciangreen/retromr). It uses [newos](https://github.com/luciangreen/newos)'s voice with lip-sync.
  - **Talking to it:** tap 🎤 and speak, or type.
  - **Setting it up:** ⚙ chooses your photo, name, voice and speed. Until you choose a photo, it shows a drawn face. Every app in the suite shares the same character.
  - **What it understands:**
    - "open iEdit", "open notes"
    - "go to Projects", "go up", "go home", "what's here"
    - "run hello", "find plan"
    - "what is open bracket 1 plus 2 close bracket squared", "what time is it"
    - "brainstorm time travel" starts `LucianOS/brainstorm/time-travel.md` and opens it.
    - "breason file.txt" opens your Breasoning script in shellrun.
    - "run today's workflows", "show me the checklist", "grammar logic on pedagogy", "play today's music", "comment on notes" (with simplug)
  - **Suggestions:** above the input it offers what you're likely to want next. It learns from what you have run before, at this time of day, in this folder, and what usually follows the last thing you did. Tap a suggestion to put it in the input, change it if you like, then send it.
  - On a phone it starts as a small face bubble, so it doesn't cover the screen.
- **Tools ▸ Checklist:** your workflows, each with:
  - **done** (for daily items, done today)
  - a name you can edit
  - a **profitable** status: Not yet, Profitable or Not profitable
  - a comment
  - when it was made and changed
  - ▶ to run it, ＋ to add a child use (it asks what else it could be used for, adds it underneath and opens a page to plan it), 🙈 to hide it, and ✕ to delete it

  Workflows can be:
  - a shellrun script
  - a web address
  - an app
  - **Grammar Logic**
  - **Today's music**
  - a note

  **Run today's** runs every daily item. Scripts run side by side, and scripts that pause for you open in shellrun. The list can be shrunk to its title bar.
- **Grammar Logic** (Tools ▸ Grammar Logic…, or say "grammar logic on meditation"):
  - It asks for a topic and runs `grammar_logic_to_alg1` from your Algorithm-Writer-with-Lists folder.
  - It saves the result one item per line in `LucianOS/gl/<topic> <date time>.txt` and opens it in iEdit.
  - When you've finished the file, **Breason it** puts the text into `Text-to-Breasonings/file.txt` and runs your Breasoning script in shellrun, which asks the thesis question first.
  - **Save finished copy** files it, by default in `LucianOS/gl/finished/`, and ticks Grammar Logic off for today.
- **Reminders and questions:**
  - Each morning LucianOS asks whether to run today's workflows, start Grammar Logic now, or remind you later.
  - At your reminder times (10:00 and 15:00 unless you change them), it asks again, until Grammar Logic is done: **Start now**, **In an hour** or **Not today**.
- **Tools ▸ Today's music:**
  - Songs Music-Composer made in the last day (or 7 days, or all), played in the browser.
  - ☆ shortlists a favourite. **Copy shortlist** copies them to `Music/GarageBand shortlist`.
  - **Open in GarageBand** opens them on the Mac. It needs `"open"` added to `allowedCommands`.
  - 💬 asks the character what it thinks of a song (needs simplug).
- **Tools ▸ Workflow settings** sets these places:
  - the folders for Algorithm-Writer-with-Lists, Text-to-Breasonings and Music-Composer (defaults under `Dropbox/GitHub-private2/`)
  - the breasoning script
  - where to save Grammar Logic files and how long they are
  - the reminder times
  - the shortlist folder
- **Programs in a folder:** a repo folder window shows a **Programs** strip.
  - Its buttons are the commands in the README, such as `['adder.pl'].` then `add(1,2,X).`, or `swipl -s demo.pl`. It also lists start goals in the `.pl` files (`initialization`, `main`, `run`).
  - A button opens the program in its own window. You can edit the files, goal and stack limit before running, and the window remembers your changes.
  - **🧪 Make test file** turns the README examples into a PlUnit file (`tests/<repo>_examples_tests.pl`) and opens it in iEdit.
  - **🩺 Check tests** runs the repo's tests: `tests/run.pl`, or PlUnit files. With **auto** ticked, they run in the background when you open the folder, at most once an hour.
  - When tests fail, LucianOS writes instructions for Claude to `LucianOS/diagnostics/<repo> <date time>.md`, with the test output and the relevant source. You can edit the template in `programs-lib.js`.
  - **Send to Claude…** shows exactly what will be sent and asks first. It saves Claude's suggested fix next to the instructions without applying it.
- **Tools ▸ Claude settings:**
  - **API key:** paste a key from console.anthropic.com. Tick **this session only** to keep a temporary key in memory, so it's forgotten when the server stops. Otherwise the key is saved in the data folder, readable only by you.
  - **Model:** Sonnet by default.
  - **Monthly limit:** a token limit, 1,000,000 by default.
  - **Confirm:** on by default, so you see and approve every request before it's sent.
  - **Turn off and forget the key** removes the key.
  - Nothing goes to Claude unless you press a button that says so.
- **Tools ▸ Claude to-action list** opens the touchscreen terminal's list of algorithm ideas, ready to send to Claude. The terminal's ⭐ Today panel also has your work hotspots, a word game and rewards.
- **DanceStudio** (💃) lets you choose commands by moving in front of the camera, or by holding the cursor on a tile. You build a sentence such as "grammar logic on meditation", and the desktop runs it as if you'd said it to the character. A link like `/?do=brainstorm time travel` does the same.
- **Windows** come back where you left them next time. On an iPhone, one window shows at a time with tabs to switch.

The old platform check page is at `/check.html` (**LucianOS ▸ Platform check page**).

## The platform

| Service | What it does |
| --- | --- |
| Server and routing | Serves every app; future apps go in `apps/<name>/` and appear at `/apps/<name>/` |
| Run modes and password | **Local** (default): only this Mac can reach it. **Remote**: reach it from your iPhone through a Tailscale tunnel, behind one suite password |
| File API | List, read, write, rename/move, new folder, trash (never deletes), search by name or contents, raw files (images, MIDI), live change watching |
| Job runner | Runs allowed commands as separate processes, up to 4 at once (the rest queue), with live output, interrupt, input, temporary folders deleted afterwards and a notification when a job ends |
| Prolog bridge | Runs a Prolog goal with no `?-` prompt: `swipl --stack-limit=54G -g "consult([...]), Goal" -t halt` |
| State store | Saves open windows, unsaved work, recent folders and preferences as JSON |
| Event bus | Apps hear about saved files, finished jobs and each other's `app.*` events |


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

Live updates (folder changes, job output, events) share one connection per desktop (`/api/mux`). Browsers allow only six connections to a site over plain HTTP, so without this, a few open windows would stall the desktop.

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

There are 76 tests. They cover the Claude bridge (with a stand-in API: confirmation, monthly limit, temporary keys, the key never sent to the browser), predicted commands, recently changed files, GitHub statistics (with a stand-in GitHub), finding programs in READMEs and making test files, many live streams sharing one connection, the workflow checklist (daily items, child uses, reminder times, the Grammar Logic goal), MIDI reading and key finding, file copies, the character's command grammar (spoken maths, fuzzy names), the calculator, durations and time zones, plus sandbox escapes, symlinks, save conflicts, trash, search, the command allowlist, shell-injection attempts, interrupt, input, temporary folders, the job queue, output streaming, the Prolog command line, state, events, the local-mode guards, password login and its rate limit.

## Adding the apps

Each app has its own repo and runs inside this platform. To add one, clone it into `apps/`. It then appears at `/apps/<name>/`:

```sh
git clone https://github.com/luciangreen/lucianos
cd lucianos/apps
git clone https://github.com/luciangreen/iedit
git clone https://github.com/luciangreen/shellrunscriptmaker
git clone https://github.com/luciangreen/touchscreenterminal
git clone https://github.com/luciangreen/simplug
git clone https://github.com/luciangreen/fastos
git clone https://github.com/luciangreen/dancestudio
```

For example, iEdit opens at http://localhost:4170/apps/iedit/. The platform repo ignores everything in `apps/`, so each app stays in its own repo.

## Next

All seven apps are built. Next: try them on your Mac and iPhone and tell me what to change.
