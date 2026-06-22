# Hosting the web app on Firebase

The "web app" is the landing page (`index.html`) that hosts the draggable
bookmarklet. It's fully static, so Firebase Hosting is a perfect fit and the free
Spark plan is more than enough.

This repo already includes [`firebase.json`](firebase.json) (serves the site,
hides dev files like `tests/`, `extension/`, `dist/`) and a
[`.firebaserc`](.firebaserc) points at project **`xtractor-78c0f`**.

## Before you deploy: rebuild the bookmarklet

The bookmarklet code is injected into `index.html` by the build step. Always run
this first so the hosted page has the latest version:

```bash
node build.cjs
# or: npm run build
```

---

## Option A: Firebase Studio (browser, no local setup)

[Firebase Studio](https://studio.firebase.google.com) is Google's cloud IDE.

1. Go to [studio.firebase.google.com](https://studio.firebase.google.com) and
   sign in with your Google account.
2. **Import this repository** (GitHub URL) or upload the project folder.
3. Open the built-in **Terminal** and run:
   ```bash
   node build.cjs
   firebase login --no-localhost   # opens a sign-in link
   firebase init hosting            # only if you didn't keep firebase.json
   ```
   If you keep the included `firebase.json`, you can skip `init`. When prompted
   during `init`, choose **Use an existing project** (or create one), set the
   public directory to `.` (current), and answer **No** to "single-page app"
   rewrites being overwritten.
4. Set your project id in `.firebaserc` (replace `YOUR_FIREBASE_PROJECT_ID`), or
   run `firebase use --add` and pick your project.
5. Deploy:
   ```bash
   firebase deploy --only hosting
   ```
6. Firebase prints your live URL, e.g. `https://your-project.web.app`. Open it,
   drag the button to your bookmarks bar, and you're done.

## Option B: From your own machine (Firebase CLI)

1. No global install needed — deploy uses `npx firebase-tools` (downloads on first run only).
2. Create a project at [console.firebase.google.com](https://console.firebase.google.com)
   (or reuse one). Note its **Project ID**.
3. Put that id in `.firebaserc`, then:
   ```bash
   npm run deploy
   ```
   (`npm run deploy` runs build + `firebase deploy --only hosting`.)

## Option C: Auto-deploy on every push (GitHub Actions)

This repo includes [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml).
When you push to **`main`**, GitHub builds the bookmarklet, runs tests, and deploys
to Firebase Hosting.

### One-time setup

1. Create the GitHub repo (see [README](README.md) for the recommended name).
2. Push this project to `main`.
3. In [Firebase Console](https://console.firebase.google.com) → your project →
   **Project settings** → **Service accounts** → **Generate new private key**.
   Download the JSON file.
4. On GitHub: **Settings → Secrets and variables → Actions**
   - **Secrets → New repository secret**
     - Name: `FIREBASE_SERVICE_ACCOUNT` (exact spelling, case-sensitive)
     - Value: paste the **entire** JSON file contents (starts with `{` and includes `"private_key"`)
   - **Variables → New repository variable**
     - Name: `ENABLE_FIREBASE_DEPLOY`
     - Value: `true`
5. Push to `main` again, or **Actions → CI and Deploy → Run workflow**.

Until both the secret and variable are set, only the **ci** job runs (build + test); **deploy** is skipped.

### Troubleshooting

| Error | Fix |
| --- | --- |
| `Input required and not supplied: firebaseServiceAccount` | Add `FIREBASE_SERVICE_ACCOUNT` secret and set `ENABLE_FIREBASE_DEPLOY=true`. |
| `Unrecognized named-value: 'secrets'` in workflow | Fixed — deploy is gated by variable `ENABLE_FIREBASE_DEPLOY`, not a secrets check. |
| Workflow green but site not updated | Confirm the **deploy** job ran (not only **ci**). |
| Permission denied on deploy | In Firebase Console → IAM, ensure the service account has **Firebase Hosting Admin**. |

The workflow uses project id `xtractor-78c0f` from `.firebaserc`. If you change
projects, update both `.firebaserc` and `projectId` in the workflow file.

After the first successful run, your site is live at
`https://xtractor-78c0f.web.app` (or your custom domain).

## Custom domain (optional)

In the Firebase Console: **Hosting -> Add custom domain**, then follow the DNS
steps. Hosting includes free SSL.

## What gets served

Only the public web app: `index.html`, `styles` it inlines, and
`bookmarklet/dist.txt`. The `extension/`, `tests/`, `scripts/`, and `dist/`
folders are excluded via the `ignore` list in `firebase.json`, so your hosted
site stays clean. (Everything is open source regardless.)

## Updating later

Any time you change `bookmarklet/src.js`, re-run `node build.cjs` and
`firebase deploy --only hosting` again.
