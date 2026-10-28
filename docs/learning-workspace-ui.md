# Learning workspace UI specification

## Scope and design status

This manual specification accompanies the React Native + Expo implementation. Figma and Uizard integrations were not available in this workspace, so no editable Figma file or Uizard prototype was created. Treat the wireframes below as implementation wireframes, not as exported design-tool frames.

The UI does not contain live course records or fabricated student metrics. A course source is explicitly identified as missing when none is attached. Progress values and saved rows come from the authenticated API; empty states explain how to begin.

## Shared system

- **Theme:** `src/components/theme.ts` reads the operating-system light/dark preference. The `palettes.light` and `palettes.dark` objects are the reusable color tokens.
- **Layout:** `Shell` uses a left sidebar at 760 px and wider, and a compact bottom navigation below 760 px. Content is capped at 1040 px. Cards wrap into columns on tablet/desktop and stack on phones.
- **Typography and controls:** `PageHeader`, `Eyebrow`, `Field`, `Button`, `Notice`, and `Loading` provide consistent page hierarchy and states.
- **Accessibility:** Controls have semantic roles and accessible labels; focus is visible; content can wrap at narrow widths; `global.css` reduces motion when requested by the OS.
- **State rule:** Keep user-entered values in component state and draft storage on failed requests. Disable duplicate submissions while a request is pending. Show success only after the server confirms it.

## Wireframes

### `/dashboard` — Learning dashboard

```text
Desktop: [sidebar] [Page heading                                  ]
                   [Continue learning / primary action            ]
                   [Goal picker + current level] [Practice queue ]
                                                  [Progress summary]
Phone:   [heading] [Continue learning] [Goal picker] [Practice]
         [Progress summary] [bottom navigation]
```

Choose one of the configured goals, enter current level, and continue to `/learn`. The practice and progress cards link to their existing routes. Empty summary copy describes when saved work will appear rather than showing sample metrics.

### `/learn` — Learning workspace

```text
Desktop: [sidebar] [Goal / step banner                           ]
                   [Topic navigation] [Lesson content             ]
                                      [Source references          ]
                                      [Notes guidance] [Save state]
Phone:   [banner] [Topic navigation] [Lesson] [References]
         [Notes] [Save/retry] [bottom navigation]
```

Topic selection updates the displayed guidance. Save shows pending, confirmed, or recoverable error state. Source references clearly state when no course note is attached.

### `/practice` — Practice and feedback

```text
Desktop: [sidebar] [Question / practice prompt] [Feedback explanation]
                   [Answer input                  ] [Retry / next step]
Phone:   [prompt] [answer input] [feedback] [submit/retry]
```

The entered answer remains in place if the API fails. Feedback and a completion state are displayed only after a confirmed API result.

### `/progress` — Progress

```text
Desktop: [sidebar] [Progress summary cards                         ]
                   [Goal history                                   ]
                   [Progress by topic                              ]
                   [Saved sessions + date range + resume action    ]
Phone:   [summary cards] [Goal history] [Topic progress]
         [date range] [Saved sessions] [bottom navigation]
```

Loading, empty, error/retry, and populated states use the same section structure. The date range filters saved sessions. Retry refetches authenticated records.

### `/assistant` — AI assistance

```text
Desktop: [sidebar] [Context selector + question form] [Validated response]
                   [Source/evidence selection        ] [Limitations       ]
Phone:   [context selector] [notes/question] [ask/retry]
         [response/evidence] [bottom navigation]
```

Context is either a student-provided excerpt or an assigned course note loaded through the authenticated API. Error preserves the draft and offers retry. Citations are shown when returned and validated; limitations remain visible.

### `/login` — Sign in

```text
Desktop/mobile: [Study Sprout mark]
                [Welcome / sign-in status]
                [Email] [Password] [Sign in]
                [Recoverable error or provider setup note]
                [Return to introduction]
```

The page preserves email/password on authentication failure and restores the requested protected route after a confirmed session. Supabase URL and public anon key are required for a real sign-in; no credentials are included here.

## State and permission behavior

| State | Behavior |
| --- | --- |
| Pending | Keep layout stable, announce a concise loading label, disable duplicate mutation buttons. |
| Empty | Explain the first permitted action; do not invent records. |
| Success | Show only after server confirmation and point to the next permitted route. |
| Permission | Explain that access is missing without confirming whether a private record exists; offer sign-in or an allowed route. |
| Error | State what failed, retain the user’s input, and offer a safe retry. |

## React Native implementation notes

- Keep controls reachable at a 360 px viewport; the compact bottom bar uses five equal link targets.
- Use `useWindowDimensions` for layout mode, `useColorScheme` for theme, and `accessibilityState` for selected navigation/radio states.
- Avoid motion-dependent meaning. CSS focus styles remain visible in web builds, and reduced-motion preference suppresses transitions/animations.
- Cypress E2E covers a 360 px journey, keyboard tab navigation, protected-route redirect, saved-work recovery, and representative API failures. It uses mocked auth/API responses and does not replace tests against a running Supabase project.
