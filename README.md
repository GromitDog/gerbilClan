# project-overview

A pane for one project at a time, docked beside the chat: its sessions with a one-line synopsis, an hours estimate and a status; its issues as a headline and stacked bar; today's overview with carry-forward; its scheduled tasks; and a robotic gerbil PM in the middle whose line comes from simple rules.

## Use

- `/overview` opens or focuses the pane (it also opens at session start unless `openOnStart` is off).
- `/overview refresh` re-reads sessions, scheduled tasks and issues now, then estimates changed sessions.
- `/overview all` toggles the full list of the project's sessions.
- `/overview status <planned|wip|blocked|done|auto> [session]` sets a session's status by hand; the session is named by its id or by words of its title, and left out it is this session. `auto` hands the status back to the estimate.
- `/overview auto [on|off]` says whether the estimate sets statuses at all (see Statuses).
- `/overview done <session id>` marks a session done (it stays in Today until midnight, then drops out) and archives it; the app asks before archiving.
- `/overview backdate <session id>` sets a done session's day to yesterday, to watch the rollover.
- `/overview dump` prints what the pane holds, for checking without a screen.
- `/overview clan` lists every project's gerbil; `/overview gerbil …` renames or recolours the selected one (see below).

In the pane: the Clan card at the top picks the project by its gerbil (a project is a session's first folder under `projectsRoot`) and puts that gerbil on duty (see below); each row's status opens a picker, and the glyph before the title still cycles wip → blocked → planned; `done` and `edit` sit on each row; each open issue has a `done` button; the three dim buttons prefill the prompt with the regular asks (today's progress, weekly report, UAT overview). The Scheduled card shows only on a device that has scheduled tasks: with none, or with no scheduled-tasks server at all, it is left out and nothing is reported as an error.

## On duty: a gerbil names the environment

A gerbil stands for its project, so calling one tells Claude where to work. Two ways:

- **By name, in the prompt.** `Hey, Butterscotch, regenerate the UAT overview` means: do this in butterfield_rrt. `@Butterscotch` works anywhere in the prompt, and so does a greeting and the name (`hey`, `hi`, `hello`, `yo`, `oi`, `psst`, `dear`); at the start of a prompt so does the bare name set off from the task (`Butterscotch, …`, `Scout: …`, `Digger - …`). Only what you typed is read: the reminder the app puts in front of a new session's first prompt, and anything pasted, call nobody. A name that only begins a sentence is no call (`Scout the repo for dead code`), and neither is one in another session's message or a background task's report.
- **By a click.** Clicking a gerbil in the clan turns the pane to its project, as before, and the gerbil is now `listening`: your next message goes to its project. `not now` in its speech bubble takes the click back. The selected gerbil's bubble has its own `Hey, <Name>` button for the same thing.

Either way your prompt goes in exactly as you typed it. Beside it, where only Claude reads, goes a note: which project the gerbil stands for, its folder, and to move the session there first (the app's `change_directory` tool) when the session is somewhere else. The note is sent once per change, the gerbil then shows `on duty`, and the pane turns to its project. A clicked gerbil is the softer of the two: if your message plainly continues work in another project, Claude is told to finish that where it was.

The whole clan is in the Clan card for this: every folder under `projectsRoot` that the `gerbils` setting names, whether it has had a session lately or not. The gerbil of the No folder sessions names no project.

## This session

The app's list of sessions leaves out the one asking, so the pane asks for it by itself (`get_session`, see Permissions) and shows it under its real name and id. Where that call is not allowed the row goes by the first line of the session's first prompt, and a line at the foot of the pane says what to allow.

Its hours are a clock, not an estimate. The clock counts while a turn runs, and for `idleMinutes` (five) after the last sign of life, a prompt or a turn ending; then it pauses until the next one. The row shows the time to the minute and moves as it passes, with `live` beside it while it counts; `edit` on that row sets the clock, which counts on from what you typed. The time is written to the session's record, so other sessions' panes and the day's total show the same figure, and it is kept over the estimate's hours afterwards. Its synopsis is written from its own conversation after a turn, at most every five minutes. Once worked in, the session is `wip` unless you picked a status.

## Statuses

A status is either yours or a guess. The estimate guesses `wip`, `blocked` or `done` from the transcript, and a guess is drawn as plain coloured words with a question mark (`blocked?`). Click it and pick: `planned`, `wip`, `blocked`, `done`. A picked status is drawn as a solid badge and the estimate never changes it again; `↺ let it guess` in the same picker hands it back. `done` from the picker stamps the day and archives nothing; the row's own `✓ done` still marks done and archives.

`statuses: guessed for you` at the foot of the pane is a switch. Turned to `statuses: yours only`, the estimate goes on writing each synopsis and hours and sets no status at all, in every session, until you turn it back; `/overview auto on|off` is the same switch, and the `autoStatus` setting is its starting position.

## Issues file

Per project, `<project>/.claude/overview/issues.json`:

```json
{ "issues": [ { "key": "UAT_QRY-24", "title": "…", "state": "new|wip|testing|closed",
                "priority": "High|Medium|Low", "owner": "…", "sessionId": "local_…",
                "openedOn": "2026-10-28", "closedOn": "2026-10-30" } ] }
```

Marking an issue done writes `state: "closed"` and `closedOn` back.

## Jira

A project with no issues file may be on Jira. The `jiraProjects` setting names the Jira project per folder (`bragi=BRAG, seeker=SKR`), or the issues file does with only `{ "jira": { "projectKey": "SKR" } }`. The pane then reads the project's open sprint through the Atlassian connector: a count of the sprint, and its open issues (up to 20, highest priority first) with the key linked to Jira. The Issues card becomes `Sprint <name>` with `N issues · M open`, the bar shows done against open, and the gerbil worries when the sprint's end date has passed. Jira issues are read only; closing them stays in Jira. A project with neither a file nor a Jira key reads `on Jira`.

## The gerbil clan

Each project has its own gerbil PM, with a name and a coat after the colours breeders name: golden agouti, black, argente golden, argente cream, black-eyed white, dove, lilac, Burmese, Siamese, slate, nutmeg, dark-eyed honey and polar fox, and the pied ones: pied black, mottled black, pied golden agouti, pied argente golden, pied lilac and pied Burmese. Red-eyed coats wear ruby goggles; Burmese and Siamese have darker points; pied coats have a white blaze and spots, mottled ones more. An agouti-type coat (golden agouti, argente, nutmeg, honey, polar fox) shows its lighter underside as a tummy; a self colour (black, slate, lilac, dove, Burmese, Siamese, and the pied forms of black, lilac and Burmese) has an underside as dark as its back, so it has none. All of them together are the clan: the Clan card at the top of the pane shows every project's gerbil in its current mood, and picking one selects its project: it is how the pane switches projects. The speech bubble shows the gerbil's name and mood; its coat shows only in the picker.

- The `gerbils` setting names them, as `folder=Name/coat` pairs (`no-folder` for the No folder sessions). A project it leaves out is dealt a name and a coat no other project has, and keeps them.
- `edit` beside the gerbil's name opens a name field and a coat picker; what is picked there is kept over the setting.
- `/overview clan` lists the clan; `/overview gerbil` names the selected project's gerbil; `/overview gerbil name <Name>` and `/overview gerbil coat <coat>` change it (`/overview gerbil coats` lists the coats); `/overview gerbil reset` hands it back to the setting.

## Loading it in every session

The mod lives at `C:\Users\amyjm\.claude\mods\project-overview`. A desktop session takes no `--plugin-dir` flag, so name the folder in the `env` block of `~/.claude/settings.json`; it is read when a session starts:

```json
{ "env": { "CLAUDE_CODE_PLUGIN_DIRS": "C:\\Users\\amyjm\\.claude\\mods\\project-overview" } }
```

Check with `claude plugin validate` and `claude plugin test` on the folder, using the desktop app's bundled engine, which has both commands: `%APPDATA%\Claude\claude-code\<version>\<hash>\claude.exe`, or where the app keeps its data under `%LOCALAPPDATA%\Claude-Data\<profile>\claude-code\<version>\<hash>\claude.exe`.

A session the desktop app starts reads the folder when it starts and does not watch it (that needs `CLAUDE_CODE_PLUGIN_DIR_WATCH=1` beside `CLAUDE_CODE_PLUGIN_DIRS`), so a change shows in sessions started after it.

## Settings

`projectsRoot`, `issuesFile`, `estimateModel`, `refreshMinutes`, `maxEstimatesPerRefresh`, `jiraProjects`, `gerbils`, `idleMinutes`, `autoStatus`, `openOnStart` — see `.claude-plugin/plugin.json`.

`projectsRoot` takes several folders separated by semicolons, and `~` is the home folder (`USERPROFILE` on Windows, `HOME` on a Mac). Its default, `C:\Users\amyjm\RiderProjects; ~/RiderProjects`, serves the Windows machine and a Mac whose projects are in `~/RiderProjects`, so the same files run on both. On a Mac whose projects are elsewhere, set it in the mod's settings (`pluginConfigs` → `project-overview` → `options` in `~/.claude/settings.json`).

## Permissions

The pane reads sessions and scheduled tasks through the app's own MCP servers. In a session in auto mode those calls are made by a timer, not by a model request, so the auto-mode classifier has no verdict and refuses them. Allow the read-only tools in `~/.claude/settings.json`:

```json
{ "permissions": { "allow": [
  "mcp__ccd_session_mgmt__list_sessions",
  "mcp__ccd_session_mgmt__get_session",
  "mcp__ccd_session_mgmt__list_events",
  "mcp__scheduled-tasks__list_scheduled_tasks",
  "mcp__scheduled-tasks__list_task_runs",
  "mcp__a42b580c-4d22-425e-906d-bc95104ad94d__searchJiraIssuesUsingJql"
] } }
```

`get_session` is how the pane learns this session's own name and id (the list leaves the asking session out); without it the row goes by its first prompt's words, and what you set on it is kept under an id other sessions' panes do not know. The last one is the Atlassian connector's search, read-only, needed for the sprint summary; its server key is the `jiraServer` setting.

A gerbil called from a session that is somewhere else has Claude move the session with the app's `change_directory` tool. In auto mode the classifier can refuse that move ("judged this action dangerous"), and Claude then reads what it can by absolute path and says so. `"mcp__ccd_directory__change_directory"` in the same `allow` list lets the move through; it does so for every session and every folder, with no check on the move itself (what Claude then does in the folder is still checked), so it is yours to decide.

Archiving a session on "done" (`archive_session`) is not in that list: in a default-mode session the app asks; in auto mode it is refused and the pane says so, with the session still marked done. To let the done button archive in auto mode too, add `"mcp__ccd_session_mgmt__archive_session"` to the same `allow` list. The call is only ever made from your own click or `/overview done`, and an archived session can be unarchived.
