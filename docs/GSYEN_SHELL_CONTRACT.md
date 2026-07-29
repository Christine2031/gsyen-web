# GSYEN Shell Contract

This file locks the shell rules that must not drift between releases.

## Platform Boundaries

- 27-inch Web and 27-inch Electron share the same right-account visual language.
- 13/14-inch Electron may use tighter measurements only to avoid overlap with Windows controls.
- 13/14-inch Web may compress labels, but must not inherit Electron-only window-control layout.
- A small-screen fix must be scoped by platform and viewport. It must not target `#app-header.gsyen-app-header` globally unless the change is intended for every shell.

## Account Tray

- Account/auth tray widths are fixed shell measurements, not flexible content.
- `中文 / 登录 / 注册` must not use `flex: 1` to consume remaining space.
- Large Web and large Electron auth tray width: `206px`.
- Auth segments:
  - language: `54px`
  - login: `72px`
  - register: `80px`
- Logged-in account tray may be wider, but it must remain fixed and right-aligned.

## Height

- Module toolbar and command deck standard height: `42px`.
- `52px` is an outdated design-spec value and must not be used as the shared shell toolbar standard.
- Inner controls should stay around `28-30px`.
- Top AppHeader navigation may keep its own compact internal height, but it must not redefine the shared module toolbar rail.
- If a module needs a taller local tool surface, that belongs inside the module body, not the shared shell rail.

## Surfaces

- Do not add cross-module background harmonizers that repaint Mail, Calendar, Prism, and the main workspace from one CSS layer.
- Module backgrounds belong to each module or to stable tokens, not late global override files.
- Shell chrome surfaces use `#F4F2EE`: AppHeader, root shell, module toolbar,
  brand subnav, and command deck background. Content areas keep `#F9F8F6`.
- Avoid gradients and `color-mix()` surface overrides in late index layers unless Ethan explicitly approves the full shell change.

## Double Click

- Header hide/show is a shell primitive.
- The double-click target before the header is hidden is the visible header-shell drawer:
  the blank band at the bottom of `#app-header`, plus the immediate shell toolbar band below it.
- The default visible header-shell band height is `44px`, stored as `--gsyen-header-shell-zone-height`.
- `.gsyen-shell-double-click-zone` is the semantic marker for that band. It is not a 1px/8px waistline.
- Hidden state uses `.gsyen-shell-reveal-hotzone`, a separate `8-12px` top-edge recall strip.
- The hidden recall strip is not a button, must not focus, and must not expand on single click.
- The hidden recall strip is recall-only: double-clicking it recalls the header, but dragging it must not move the window.
- When the header is hidden, empty shell drawer zones below it remain part of the same shell primitive:
  they can drag the Electron window only after pointer movement passes the drag threshold, and double-clicking them recalls the header.
- Do not confuse these two states: visible header-shell band hides the header; hidden top-edge hotzone recalls it.
- `#app-header` as a whole must not be a double-click target. Only its bottom blank shell band may toggle hide/show.
- Buttons, module navigation, account tray, Windows controls, inputs, command buttons, Pulse controls, and model buttons must not trigger header hide/show.
- Empty space in `.gsyen-command-deck`, `.gsyen-module-toolbar:not(.gsyen-command-deck)`, and `.gsyen-brand-subnav` is part of the header-shell drawer and may toggle the header.
- Shell chrome must use `user-select: none` and must not show a text caret.
- Do not start a hidden-shell window drag on `pointerdown`. `pointerdown` may only arm a candidate; actual drag starts after a movement threshold. Single click must have no side effects.

## Shell Evolution Notes

- `v2.87.247`: header recall used document-level `dblclick` near the top edge. There was no custom hidden-shell drag hook.
- `v2.87.249`: `.gsyen-shell-reveal-hotzone` introduced as a top-edge recall strip.
- `v2.87.291`: `useHiddenShellDrag` was introduced and pointer handlers were attached to the recall strip. This mixed recall and drag responsibilities.
- `v2.87.292`: hidden drag was expanded to shell drawer zones, which made the issue appear across modules.
- `v2.87.295`: release/cancel cleanup was added, but `pointerdown` could still arm the wrong behavior too early.
- Current rule: recall strip is double-click only; hidden drawer zones drag only after movement threshold; single click does nothing.

## Shell Bottom Edge

- PRISM `brand subnav` and Calendar `module toolbar` use the same shell bottom edge as other modules.
- The bottom edge is `1px solid rgba(26, 26, 26, 0.08)` on `#F4F2EE`.
- Do not remove this edge to blend the toolbar into the content body.

## Release Discipline

- Before release, inspect the diff for shell files.
- If a change targets one platform or viewport, the selector must prove that boundary.
- Do not solve one screenshot by adding a broad global CSS layer.
