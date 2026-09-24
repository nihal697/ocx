# Publishing OCX (GitHub releases only)

OCX ships **direct APKs via GitHub Releases**. There is no Play Store listing,
no F-Droid repo. Push a `v*` tag and CI builds, signs, and publishes.

## Required GitHub Secrets

Set once in **Settings > Secrets and variables > Actions**:

| Secret | Description |
|--------|-------------|
| `KEYSTORE_BASE64` | Base64 of the OCX production `keystore` (`base64 -w0 ocx-release.keystore`) |
| `KEYSTORE_PASSWORD` | Keystore (store) password |
| `KEY_ALIAS` | Key alias (`ocx`) |
| `KEY_PASSWORD` | Key password (same as store password for PKCS12) |

Without these, CI signs with a throwaway debug key — fine for a test build,
but users must reinstall when you switch keys. Never lose
`ocx-release.keystore`: no future APK will upgrade existing installs without it.
Its fingerprint is recorded in the repo history (`keytool -list` output at
key-creation time).

No other secrets are needed. Sentry/PostHog/Chatwoot keys are all optional —
the app runs without them (telemetry stays off).

## Releasing

1. Bump the version in **four** places, then run `npm run check:versions`:
   `package.json` `version`, `app.json` `expo.version`,
   `android/app/build.gradle` `versionName` — plus `versionCode` in **both**
   `app.json` (`expo.android.versionCode`) and `build.gradle`, incremented by one.
   Direct-APK installs key upgrades off `versionCode`: reusing the previous
   release's code means installed apps are never offered the update.
2. Add the changelog for the **new versionCode** in both
   `distribution/changelogs/<versionCode>.txt` and
   `fastlane/metadata/android/en-US/changelogs/<versionCode>.txt`
   (`check:versions` requires the file named after the versionCode to describe
   the version you are releasing), and update the Play-style release notes in
   `distribution/whatsnew/whatsnew-en-US` (**max 500 chars**). Merge to `main`.
3. Tag the release: `git tag -a vX.Y.Z <sha> -m "..." && git push origin vX.Y.Z`.
4. CI (`build.yml`) runs `check:versions` + typecheck + tests, builds one APK
   per architecture (`app-arm64-v8a-release.apk`,
   `app-armeabi-v7a-release.apk`), and creates the GitHub Release with both
   attached. First build takes ~15–20 min. The release job only runs on tags.
5. Verify: the Release exists with both APKs, and
   `https://github.com/nihal697/ocx/releases/latest` resolves to it (README
   links and the in-app update check poll this URL).

## Notes

- **Never force-push or move a tag that already produced a release.**
  Moving an *unreleased* tag (CI red, no release object) to refire the build
  is fine.
- **Sentry is removed.** The `@sentry/react-native/expo` plugin and the
  `sentry.gradle` apply are gone because OCX has no Sentry account — the
  upload step used to fail every release build. Runtime code
  (`src/lib/sentry.ts`) stays and is a no-op without a DSN. To re-add crash
  reporting later: create a Sentry project, add the four `SENTRY_*` /
  `EXPO_PUBLIC_SENTRY_DSN` secrets, restore the plugin block in `app.json`,
  and re-add the `sentry.gradle` apply in `android/app/build.gradle`.
- **F-Droid flavor job deleted** (`build-fdroid` removed from `build.yml`;
  restorable from git history). `publish-fdroid.yml` and
  `publish-play-store.yml` are manual (`workflow_dispatch`) only.
- **Old Play history** (Data Safety rejection #143, App-access rejection on
  v0.4.5, run_number+100 versionCodes) lives in git history, not in this file.
  None of it applies to OCX (`com.ocx.app` was never submitted to any store).
