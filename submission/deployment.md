# GitHub Pages deployment

Repository: https://github.com/hansonhxmax-eng/first-project

- `main`: React source, tests, submission materials and dependency lockfile.
- `gh-pages`: built static site, with `.nojekyll`; no installation needed on GitHub Pages.

## First-time activation

In the repository, open **Settings → Pages**. Under **Build and deployment**:

1. Select **Deploy from a branch** as Source.
2. Choose **gh-pages**, folder **/ (root)**, and Save.
3. Wait for GitHub's Pages build/deployment to complete.
4. Open the URL displayed by GitHub and test it in an incognito browser.

The expected standard project address is `https://hansonhxmax-eng.github.io/first-project/`. Treat this as a candidate until deployment is enabled and the page is checked. The GitHub Pages settings link is https://github.com/hansonhxmax-eng/first-project/settings/pages.

Keep Pages enabled and the deployment/repository accessible throughout the full review window. Confirm that your GitHub plan supports Pages for the repository's visibility. This deployment does not automatically grant access to private institutional data.

## Update the published build

Run `npm ci`, `npm test`, and `npm run build` in the source checkout. Publish the contents of `dist/` plus an empty `.nojekyll` file to the root of the existing `gh-pages` branch using a regular commit and non-force push. Preserve branch history. A source-only push to `main` does not rebuild the separate `gh-pages` branch automatically.

## Verification status

Local production build: passed. Solver tests: 19 passed. Chromium journey: 20 checkpoints passed. These are local results, not evidence of successful public deployment. The cloud environment currently blocks GitHub API access and does not yet allow the public Pages hostname. Requests for those two domains have been saved to the cloud environment draft. Opening Pages settings yourself does not depend on the agent's network access.
