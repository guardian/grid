---
name: pr-scenario-videos
description: "Record Playwright videos of the BDD scenarios a PR adds and put them in the PR description. Use when asked to add scenario videos, recordings, or screen captures of e2e tests to a pull request in guardian/grid."
argument-hint: "<PR number>"
---

# PR scenario videos

Record a paced Playwright video of each scenario a PR adds or changes, then add a
"Scenario recordings" section to the PR description with one slot per video.

GitHub has no API for uploading videos to a PR description. Videos only play
inline when they're dragged into the PR editor in the browser, so the last step
is manual and done by the user.

## Prerequisites

- The local Grid stack is running (see [e2e-tests/README.md](../README.md)).
- `gh auth status` shows a logged-in account.
- `e2e-tests/playwright.video.config.ts` and
  `e2e-tests/steps/utils/address-bar-overlay.ts` are in the working tree. The
  config records every test and adds `slowMo: 1000` so there's a 1 second pause
  after each browser action. Videos only capture the page, so the overlay file
  draws the current URL along the bottom of each video, which shows address
  changes and Back/Forward. Both are uncommitted, so they carry over when you
  check out another branch. Don't commit them to a PR branch.
- `/e2e-tests/pr-videos/` is in git's local exclude file, so videos are never
  committed:
  ```bash
  EXCLUDE="$(git rev-parse --git-path info/exclude)"
  grep -qx '/e2e-tests/pr-videos/' "$EXCLUDE" || echo '/e2e-tests/pr-videos/' >> "$EXCLUDE"
  ```

## Procedure

Run everything from `e2e-tests/`, on the PR's branch. The only uncommitted
changes should be the video files above and this folder.

1. **Find the PR's feature files.** Only record what this PR adds or changes,
   not the rest of the stack:
   ```bash
   gh pr view <PR> -R guardian/grid --json files --jq '.files[].path | select(endswith(".feature"))'
   ```
   Each `e2e-tests/features/<path>.feature` is generated to
   `.features-gen/features/<path>.feature.spec.js`.

2. **Record the scenarios** with the paced video config and a JSON report:
   ```bash
   rm -rf .features-gen && npx bddgen
   PLAYWRIGHT_JSON_OUTPUT_NAME=/tmp/pr-videos-<PR>.json \
     npx playwright test --config playwright.video.config.ts \
     .features-gen/features/<path>.feature.spec.js ... --reporter=list,json
   ```

3. **Collect the passing videos.** Failed scenarios are left out:
   ```bash
   node pr-scenario-videos/collect-videos.mjs /tmp/pr-videos-<PR>.json pr-videos/<PR>
   ```
   This copies each video to `pr-videos/<PR>/NN-<feature>--<scenario>.webm` and
   writes `pr-videos/<PR>/recordings.md`.

4. **Report any failures before going on.** The video config pauses 1 second
   after every action, plus 1.5 seconds for each action label. Steps that need
   several actions to happen within Kahuna's 500 ms search debounce will fail
   only when recorded. Tell the user which scenarios failed and why. Don't
   quietly drop them. Prefer making the step a single action, for example
   select-all + Backspace rather than one Backspace per character.

5. **Ask the user to review the videos.** guardian/grid is public, and the
   videos show the local stack and the e2e test account. Don't add anything
   to the PR until the user confirms.

6. **Add the section to the PR description.** This replaces any earlier
   recordings section, and puts it before "How should a reviewer test this
   change?":
   ```bash
   node pr-scenario-videos/add-to-pr.mjs <PR> pr-videos/<PR>/recordings.md
   ```

7. **Hand over the upload.** Tell the user to:
   - open the PR, edit the description, and open `e2e-tests/pr-videos/<PR>/`
     in their file browser (it's inside the workspace bind mount)
   - drag each `.webm` onto the line after its `<!-- drop … -->` comment.
     GitHub uploads it and inserts a `user-attachments` link that plays inline.
   - save the description

## Stacked PRs

Run the skill once per branch, checking out each PR's branch in turn. Only
record the feature files from step 1, so each PR shows only its own scenarios.
