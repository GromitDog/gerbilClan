# project-overview

A pane for one project at a time, docked beside the chat: its sessions with a one-line synopsis, an hours estimate and a status; its issues as a headline and stacked bar; today's overview with carry-forward; its scheduled tasks; and a robotic gerbil PM in the middle whose line comes from simple rules.

## Use

- `/overview` opens or focuses the pane (it also opens at session start unless `openOnStart` is off).
- `/overview refresh` re-reads sessions, scheduled tasks and issues now, then estimates changed sessions.
- `/overview all` toggles the full list of the project's sessions.
- `/overview done <session id>` marks a session done (it stays in Today until midnight, then drops out) and archives it; the app asks before archiving.
- `/overview backdate <session id>` sets a done session's day to yesterday, to watch the rollover.
- `/overview dump` prints what the pane holds, for checking without a screen.

In the pane: the Select picks the project (a session's first folder under `projectsRoot`); the status glyph cycles wip → blocked → planned; `done` and `edit` sit on each row; each open issue has a `done` button; the three dim buttons prefill the prompt with the regular asks (today's progress, weekly report, UAT overview).

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

## Loading it in every session

The mod lives at `C:\Users\amyjm\.claude\mods\project-overview`. A desktop session takes no `--plugin-dir` flag, so name the folder in the `env` block of `~/.claude/settings.json`; it is read when a session starts, and the folder is then watched, so saving a file reloads the mod:

```json
{ "env": { "CLAUDE_CODE_PLUGIN_DIRS": "C:\\Users\\amyjm\\.claude\\mods\\project-overview" } }
```

Check with `claude plugin validate` and `claude plugin test` on the folder, using the desktop app's bundled engine (`%APPDATA%\Claude\claude-code\<version>\<hash>\claude.exe`), which has both commands.

## Settings

`projectsRoot`, `issuesFile`, `estimateModel`, `refreshMinutes`, `maxEstimatesPerRefresh`, `openOnStart` — see `.claude-plugin/plugin.json`.

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
