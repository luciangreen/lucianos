# LucianOS

LucianOS is a web desktop that runs on your Mac. You can reach it from the Mac, or from your iPhone through a tunnel. This repo has the desktop and the shared platform that every app in the suite runs on: iEdit, shellrun, the touchscreen terminal, simplug, fastos and DanceStudio. It is one Node.js server that uses only Node's built-in modules, so there is nothing to install.

## The desktop (at `/`)

- **Icons:**
  - Your `Desktop` folder appears as icons. You can choose another folder with **Go ▸ Choose desktop folder**. Installed apps appear on the right.
  - Double-click an icon to open it. On a touchscreen, tap a selected icon.
  - Drag icons to arrange them; their places are remembered.
  - Drop icons on a folder, or on a folder window, to move the files there.
  - **Copying:**
    - Hold **⌥ Option** (Alt) while you drop to copy instead of moving. A badge by the pointer says **Move** or **＋ Copy**.
    - **Edit ▸ Dragging copies** makes every drag copy until you turn it off: handy on a touch screen, which has no Option key.
    - ⌥-dropping in the same place duplicates.
    - **Edit ▸ Copy** and **Edit ▸ Paste** (⌘C, ⌘V) copy files into the front folder window, or onto the desktop.
    - **Edit ▸ Duplicate** (⌘D) copies files where they are.
    - A name already taken gets " copy" added, as in the Finder: `notes copy.txt`, then `notes copy 2.txt`.
  - **Drop files on an iEdit window** to put their contents into it.
    - Dragged icons float above every window, and the badge says **Put into iEdit**. The window you're over is outlined, and its cursor shows where the text will go.
    - If iEdit doesn't take the files, LucianOS says so. That usually means iEdit needs updating: run `git pull` in `lucianos/apps/iedit`.
    - The text goes in as whole lines, at the line you drop on.
    - Several files go in one after another.
    - It's one step that ⌘Z undoes, and the files themselves stay where they are.
  - Shift or ⌘ selects several icons. To select a group, press on an empty space and drag a rectangle over them, on the desktop or in a folder window; every icon it touches is selected. Hold Shift to add to the selection, or ⌘/Ctrl to flip icons in and out of it. In a folder window, drag past the top or bottom edge to scroll. On a touchscreen, touch and hold an empty space for half a second, then drag.
  - **Right-click or Control-click** an icon for Open, Open in iEdit, Rename, Copy, Duplicate, Paste into a folder, Ask the character, Move to trash. Right-click an empty space for New folder, New text file, New URL icon, Paste, Select all, Clean up and the sort orders. On a touchscreen, touch and hold an icon (or an empty space) instead.
  - **Clean up** (in that menu or the Edit menu) lines the icons up in a grid that fits the desktop or window: files fill columns from the left, apps from the right, wrapping into more columns when the screen is short. **Sort by name / kind / date changed** does the same in that order; a folder window remembers its sort. Icons whose remembered place is off screen (after turning the phone, or a smaller window) are shown in free places without forgetting where they were.
  - App icons are drawn tiles (`public/desktop/app-icons.js`), the same on every device; an app without a drawing gets a coloured tile with its first letter.
  - **Enter** renames the selected icon in place. **Delete** (or the Delete button) moves it to the trash after asking.
  - **Renamed or deleted outside LucianOS** (in the Finder, a terminal, Dropbox): a folder window follows its folder to its new name or place, and closes with a note if the folder was deleted or put in the Finder's trash. The desktop folder is followed the same way (it falls back to Home if it is gone). Apps that send a file's `id` (iEdit does) keep saving to the file after it is renamed or moved.
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
  - **Eyes and mouth:** if they're in the wrong places on your photo, choose ⚙ ▸ **Adjust eyes and mouth** (or say "adjust my face"). Drag the circles onto the eyes and the middle of the mouth, then press **Done**; **Find again** looks for the face afresh, and **Cancel** keeps the old places. It opens by itself when the face had to be guessed. On a keyboard, the arrow keys nudge the selected circle (Shift for bigger steps).
  - **What it understands:**
    - "open iEdit", "open notes"
    - "go to Projects", "go up", "go home", "what's here"
    - "run hello", "find plan"
    - "what is open bracket 1 plus 2 close bracket squared", "what time is it"
    - "brainstorm time travel" starts `LucianOS/brainstorm/time-travel.md` and opens it.
    - "breason meditation" breasons that Grammar Logic file ("breason it" does the newest).
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

  Items can repeat **daily** or every so many days (an app can make weekly or monthly ones); a repeating item comes back on the list when it is due, and the morning question counts it.

  Apps can keep their own group of items in the checklist (Lucian Office's business coach does): an app in a window posts `{type: 'lucianos.checklist', group: {key, title, kind, target}, items: [{key, title, kind, target, daily, everyDays, comment}]}`, and LucianOS adds or updates the group's items by key, keeping your ticks, and hides items the app no longer sends. `finish: key` ticks one as done.

  **Run today's** runs every daily item. Scripts run side by side, and scripts that pause for you open in shellrun. The list can be shrunk to its title bar.
- **Grammar Logic** (Tools ▸ Grammar Logic…, or say "grammar logic on meditation"):
  - It asks for a topic and runs Grammar Logic with the calls from `br_16k_args_algs` in `find_char_map.pl` (private repo). It copies the topic's first word and adds 79 words, so the file has 80 words, one per line. In Algorithm-Writer-with-Lists:
    `Essay_0 = "<first word>", As is 1, grammar_logic_to_alg1(Essay_0,As,GL_out1)`, then it writes the words one per line.
  - The files are loaded as `find_char_map.pl` gets them through `cgpt_combophil_analogy.pl`: `Text-to-Breasonings/text_to_breasonings.pl` and `Algorithm-Writer-with-Lists/grammar_logic_to_alg1.pl`. Prolog writes a small loader that includes both, `LucianOS/prolog/gl_and_breasoning.pl`, so shared files load once. All paths are absolute, from the suite folder, so they still work when Dropbox is a link (as on a Mac, into `Library/CloudStorage`).
  - Those files also need listprologinterpreter, Philosophy, Languages, List-Prolog-to-Prolog-Converter, Prolog-to-List-Prolog, SSI and culturaltranslationtool next to them, as in your `GitHub-private2` folder.
  - It saves the result in `LucianOS/gl/<topic> <date time>.txt` and opens it in iEdit.
  - When you've finished the file, **Breason it** reads it as `GL_out` and runs, in Text-to-Breasonings:
    `As is 1, Br is As*80, texttobr2(u,u,GL_out,Br,[auto,on]), texttobr(u,u,GL_out,u)`
    This breasons out the file's 80 words.
    The output appears in a Breasoning window, with a Stop button.
  - `scripts/check-gl-breasoning.mjs` runs both calls against real checkouts. GitHub Actions runs it (the "Grammar Logic and breasoning" check): It checks that Grammar Logic gives 80 words and that breasoning breasons all 80.
- **Reminders and questions:**
  - Each morning LucianOS asks whether to run today's workflows, start Grammar Logic now, or remind you later.
  - At your reminder times (10:00 and 15:00 unless you change them), it asks again, until Grammar Logic is done: **Start now**, **In an hour** or **Not today**.
- **Tools ▸ Today's music:**
  - Songs Music-Composer made in the last day (or 7 days, or all), played in the browser.
  - **Instruments:** every one of the 128 General MIDI instruments has its own voice (`public/shared/gm.js`), so a song sounds like the instruments Music-Composer chose. Each song lists its instruments by name.
    - Pianos and mallets are struck and fade away.
    - Guitars, basses, harp, koto and sitar are plucked strings.
    - Organs sustain with a rotating-speaker shimmer.
    - Strings and brass swell, with vibrato.
    - Flutes and reeds breathe.
    - Choirs sing vowels.
    - Each of the 47 drum-kit sounds is its own: kick, snares, hats (closing the hi-hat cuts an open one), toms, cymbals, congas, cowbell and so on.
    - Every instrument has been rendered and levelled so they're about equally loud, the pitched ones checked to be in tune, and a little room reverb added.
  - ☆ shortlists a favourite. **Copy shortlist** copies them to `Music/GarageBand shortlist`.
  - **Open in GarageBand** opens them on the Mac. It needs `"open"` added to `allowedCommands`.
  - 💬 asks the character what it thinks of a song (needs simplug).
- **Tools ▸ Workflow settings** sets these places:
  - the folders for Algorithm-Writer-with-Lists, Text-to-Breasonings and Music-Composer (defaults under `Dropbox/GitHub-private2/`)
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

Every file entry has an `id` (its identity on disk). Send the one from your last read or save, and a file renamed or moved since (outside LucianOS) is found again: `api.files.write(path, text, { baseMtime, id })` saves to where it is now, and `api.files.read(path, { id })` reads it; the reply's `path` is then the new one, with `movedFrom` the old. Keep the reply's `id`, because each save gives the file a new one. `api.files.watch(folder, onChange, false, onGone)` calls `onGone({ path, movedTo })` when the folder itself is renamed (`movedTo` is the new path) or deleted (`movedTo` is null). Saving into a folder that is gone answers 404 with a plain message.

## Tests

```sh
npm test
```

There are 98 tests. They cover the Claude bridge (with a stand-in API: confirmation, monthly limit, temporary keys, the key never sent to the browser), predicted commands, recently changed files, GitHub statistics (with a stand-in GitHub), finding programs in READMEs and making test files, many live streams sharing one connection, the workflow checklist (daily and repeating items, app groups, child uses, reminder times, the Grammar Logic goal), MIDI reading and key finding, file copies, rectangle selection (hits, Shift/⌘ modes, edge scrolling), icon layout (clean up, fitting, sort orders), following files and folders renamed or deleted outside LucianOS, the character's command grammar (spoken maths, fuzzy names), the calculator, durations and time zones, plus sandbox escapes, symlinks, save conflicts, trash, search, the command allowlist, shell-injection attempts, interrupt, input, temporary folders, the job queue, output streaming, the Prolog command line, state, events, the local-mode guards, password login and its rate limit.

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

## Needed for Grammar Logic and Breasoning

Repos needed: those two files include others, so these must sit together in Dropbox/GitHub-private2 (where lucianos should be):
* Install these with [Time Machine](https://github.com/luciangreen/Time_Machine).

```
Algorithm-Writer-with-Lists
Text-to-Breasonings
listprologinterpreter
Philosophy
Languages
List-Prolog-to-Prolog-Converter
Prolog-to-List-Prolog
SSI
culturaltranslationtool
```

* NB lucianos works with GL and Breasoning by being at `~/Library/CloudStorage/Dropbox/GitHub-private2/lucianos/` where `“~/Dropbox is a symlink to ~/Library/CloudStorage/Dropbox”`. This is accomplished with the commands:
* Check first that `~/Dropbox` doesn’t already exist, because the Dropbox app sometimes creates it:

```sh
# Run from any folder
ls -ld ~/Dropbox
```

If it says “No such file or directory”: run the ln -s command below.
```sh
ln -s ~/Library/CloudStorage/Dropbox ~/Dropbox
```

* Caveat: lucianos works on Safari, not Chrome, on my machine.

## Next

All seven apps are built. Next: try them on your Mac and iPhone and tell me what to change.

## Inputs and outputs

`io/ios.txt` lists 200 inputs and the outputs they give, from real runs of this repo's functions (the list of functions is in `io/cases.mjs`; the inputs come from a fixed seed, so they are the same every time). `npm test` runs them again and fails if any output changes. If a change is meant, run `npm run ios` to write the new outputs and check the diff.
