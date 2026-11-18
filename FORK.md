# Fork notes

This repository is a soft fork of [matze/wastebin](https://github.com/matze/wastebin).
It tracks upstream closely and carries a small set of changes, each tied to one
of the objectives below. Each objective names the tests that fail if a merge
from upstream breaks it.

Upstream status was last checked on 2026-11-18 against upstream `c0ec968`
(3.9.0 plus three fixes).

## Branches

- `master` mirrors upstream `master` and only ever fast-forwards.
- `dev` holds the fork's commits. Upstream is merged into it with explicit
  merge commits, never rebased.

## Objectives

### 1. Build and test on Windows

Unix domain socket support is compiled on Unix only; on other platforms,
configuring `WASTEBIN_UNIX_SOCKET_PATH` fails with a clear error at startup.
Without this, the server crate, and with it the whole test suite, does not
compile on Windows.

- Guarded by: compiling and running `cargo test --workspace` on Windows. No
  unit test can catch a compile failure on another platform.
- Upstream: still imports `tokio::net::UnixListener` unconditionally and fails
  to compile on Windows.

### 2. Security hardening upstream does not have

| Change | Guarded by | Upstream |
| --- | --- | --- |
| The owner handoff (`/{id}?owner=…`) redirects to the parsed, canonical paste id, never the raw path parameter, which can produce an off-site `Location`. | `handlers::html::paste::tests::owner_handoff_does_not_open_redirect` | Redirects to the raw path parameter (open redirect). |
| A delete without proven ownership answers 403 in the route's own format: a JSON error for `DELETE /{id}`, the HTML error page for `POST /delete/{id}`. | `handlers::delete::api::tests::delete_without_owner_is_forbidden`, `delete_with_forged_cookie_is_forbidden`, `handlers::delete::form::tests::delete_without_owner_is_forbidden` | Answers 403 with an empty body when the `uid` cookie is missing or invalid. |
| `WASTEBIN_PASTE_EXPIRATIONS` is a policy: inserts requesting any other expiration are rejected with 400. | `handlers::insert::api::tests::insert_rejects_disallowed_expiration`, `handlers::insert::form::tests::insert_rejects_disallowed_expiration` | Accepts any expiration. |
| Highlighted renders larger than 1 MiB are not cached, bounding cache memory to roughly `WASTEBIN_CACHE_SIZE` × 1 MiB. | `cache::tests::oversized_renders_are_not_cached` | Caches renders of any size. |
| Concurrent Argon2 password hashing is capped at the number of logical CPUs. | `crypto::tests::concurrent_roundtrips_all_complete` (checks that permits are released, not the cap itself) | Bounded only by the tokio blocking pool (512 threads). |

### 3. Live, localized expiry countdown

The paste view's "expires in" label counts down every second and switches to
a translated "expired" note at the deadline. The page passes each unit's
translated singular and plural forms to `paste.js`, so the countdown keeps the
language the server rendered it in.

- Guarded by: `handlers::html::paste::tests::expiration_renders_remaining_seconds_for_countdown`,
  `countdown_carries_localized_unit_templates`. The JavaScript itself is not
  covered by an automated test; it was checked in headless Chromium for
  `de-DE`, `zh-CN` and `en-US`.
- Upstream: renders a static label.

### 4. Compact expiry durations

Durations show at most their two most significant units ("2 hours, 30 mins"
rather than "2 hours, 30 mins, 45 secs"), both server-side and in the
countdown.

- Guarded by: `expiration::tests::formatting` (English `Display`),
  `i18n::tests::duration_keeps_two_most_significant_units` (localized views).
- Upstream: lists every unit.

### 5. Optional 32-bit paste identifiers

`WASTEBIN_ID_SIZE=32` generates the six-character identifiers used before
wastebin 3.0 instead of the default eleven-character ones. Existing pastes
of either size stay accessible.

- Guarded by: `id::tests::rand_respects_id_size`,
  `db::tests::insert_with_32_bit_ids`,
  `handlers::insert::form::tests::insert_with_32_bit_ids`.
- Upstream: always 64-bit.

## Fixes now upstream, tests kept

The fork fixed the following before upstream did. Upstream 3.9.0 has its own
fixes and the fork uses upstream's code for them. The fork's tests stay as
regression guards.

An adversarial comparison on 2026-11-18 ran the same probes against upstream,
the fork before the merge and the merged tree. Upstream's fixes held for
every vector. For the `Referer` and URL extension cases they are stricter than
the fork's former ones, which let a TAB-separated `Referer` through and
answered 500 to a CR/LF extension.

| Issue | Tests |
| --- | --- |
| Lines longer than the highlighting cutoff reached the page unescaped. | `highlight::tests::long_plain_text_lines_are_escaped`, `long_lines_are_escaped` |
| The QR page rendered the title and URL extension unescaped. | `handlers::html::qr::tests::title_is_escaped`, `extension_is_escaped` |
| The burn page put the URL extension into a link unescaped. | `handlers::html::burn::tests::burn_rejects_markup_in_extension`, `cache::tests::extension_validation` |
| `/theme` redirected to scheme-relative or off-site `Referer` targets. | `handlers::theme::tests::absolute_referer_with_scheme_relative_path_falls_back`, `backslash_relative_referer_falls_back`, `tab_in_referer_falls_back` |

## Updating from upstream

1. `git fetch matze`, then fast-forward the mirror from `dev` with
   `git fetch . matze/master:master`.
2. List the new commits with `git log --oneline <previous upstream>..master`
   and read every diff. Classify each as mechanical, behaviour-changing, or
   touching an objective, and check the last group against the code rather
   than the commit message.
3. Preview conflicts with `git merge-tree --write-tree --name-only dev master`.
4. On `dev`, run `git merge --no-ff master` and resolve conflicts by keeping the
   intent of both sides.
5. Run `cargo fmt --all -- --check`,
   `cargo clippy --workspace --all-targets --locked` and
   `cargo test --workspace --locked` on Windows (which also checks
   objective 1).
6. If an upstream change contradicts an objective, adapt or revert it in its
   own commit that states the reason, or revise the objective here on
   purpose.
7. Record what came in and how each conflict was resolved in the merge
   commit message, and update the upstream status in this file.

Pitfalls seen so far:

- `CHANGELOG.md` can merge without conflict yet file the fork's Unreleased
  entries under a heading upstream has just released. Rebuild it from
  upstream's file and re-add the fork's entries under Unreleased.
- Upstream sometimes fixes the same bug as the fork with a different design.
  Same-named tests then clash at compile time, and fork tests may assert the
  old status codes.
- When comparing trees in separate worktrees, give each one its own
  `CARGO_TARGET_DIR` if their `Cargo.lock` files are identical: Cargo
  otherwise reuses the binary built from the other worktree.
