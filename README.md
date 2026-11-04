# project-overview

A pane for one project at a time, docked beside the chat: its sessions with a one-line synopsis, an hours estimate and a status; its issues as a headline and stacked bar; today's overview with carry-forward; its scheduled tasks; and a robotic gerbil PM in the middle whose line comes from simple rules.

## Use

- `/overview` opens or focuses the pane (it also opens at session start unless `openOnStart` is off).
- `/overview refresh` re-reads sessions, scheduled tasks and issues now, then estimates changed sessions.
- `/overview all` toggles the full list of the project's sessions.
- `/overview done <session id>` marks a session done (it stays in Today until midnight, then drops out) and archives it; the app asks before archiving.
- `/overview backdate <session id>` sets a done session's day to yesterday, to watch the rollover.
- `/overview dump` prints what the pane holds, for checking without a screen.
- `/overview clan` lists every project's gerbil; `/overview gerbil …` renames or recolours the selected one (see below).

In the pane: the Clan card at the top picks the project by its gerbil (a project is a session's first folder under `projectsRoot`); the status glyph cycles wip → blocked → planned; `done` and `edit` sit on each row; each open issue has a `done` button; the three dim buttons prefill the prompt with the regular asks (today's progress, weekly report, UAT overview). The Scheduled card shows only on a device that has scheduled tasks: with none, or with no scheduled-tasks server at all, it is left out and nothing is reported as an error.

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

The mod lives at `C:\Users\amyjm\.claude\mods\project-overview`. A desktop session takes no `--plugin-dir` flag, so name the folder in the `env` block of `~/.claude/settings.json`; it is read when a session starts, and the folder is then watched, so saving a file reloads the mod:

```json
{ "env": { "CLAUDE_CODE_PLUGIN_DIRS": "C:\\Users\\amyjm\\.claude\\mods\\project-overview" } }
```

Check with `claude plugin validate` and `claude plugin test` on the folder, using the desktop app's bundled engine (`%APPDATA%\Claude\claude-code\<version>\<hash>\claude.exe`), which has both commands.

## Settings

`projectsRoot`, `issuesFile`, `estimateModel`, `refreshMinutes`, `maxEstimatesPerRefresh`, `jiraProjects`, `gerbils`, `openOnStart` — see `.claude-plugin/plugin.json`.

`projectsRoot` takes several folders separated by semicolons, and `~` is the home folder (`USERPROFILE` on Windows, `HOME` on a Mac). Its default, `C:\Users\amyjm\RiderProjects; ~/RiderProjects`, serves the Windows machine and a Mac whose projects are in `~/RiderProjects`, so the same files run on both. On a Mac whose projects are elsewhere, set it in the mod's settings (`pluginConfigs` → `project-overview` → `options` in `~/.claude/settings.json`).

## Permissions

The pane reads sessions and scheduled tasks through the app's own MCP servers. In a session in auto mode those calls are made by a timer, not by a model request, so the auto-mode classifier has no verdict and refuses them. Allow the four read-only tools in `~/.claude/settings.json`:

```json
{ "permissions": { "allow": [
  "mcp__ccd_session_mgmt__list_sessions",
  "mcp__ccd_session_mgmt__list_events",
  "mcp__scheduled-tasks__list_scheduled_tasks",
  "mcp__scheduled-tasks__list_task_runs",
  "mcp__a42b580c-4d22-425e-906d-bc95104ad94d__searchJiraIssuesUsingJql"
] } }
```

The last one is the Atlassian connector's search, read-only, needed for the sprint summary; its server key is the `jiraServer` setting.

Archiving a session on "done" (`archive_session`) is not in that list: in a default-mode session the app asks; in auto mode it is refused and the pane says so, with the session still marked done. To let the done button archive in auto mode too, add `"mcp__ccd_session_mgmt__archive_session"` to the same `allow` list. The call is only ever made from your own click or `/overview done`, and an archived session can be unarchived.
