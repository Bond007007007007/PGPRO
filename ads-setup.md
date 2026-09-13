# Ads setup — rewarded-ad unlock gate

## How monetization works
- **Gate point:** a user starting a **Fixed Mock** or **Random Full Exam** must watch **one rewarded ad** before the exam unlocks. The gate fires in `app.js` `startExam()` — after pool-empty/low alerts, right before `showInstructions()`.
- **Drill is exempt:** `Unlimited Drill` (and mistake replay) never triggers the ad — `exemptDrill` config + the drill's early return in `startExam()`.
- **One ad per attempt, incl. retries:** the result screen's **Retry Paper** button re-calls `startExam()`, so a retry is a fresh attempt and shows the gate again. Intended — do not bypass.
- **Ad is not stored/earned:** the reward is single-use. Cancelling (X / outside tap) dismisses the gate and leaves the user on the config screen — the exam does not start.
- **Plain browser = no ads:** `window.CBTAds` only exists in the APK (android.js is injected only into the asset copy of index.html by build-apk.sh). Without it `startExam()` takes today's path — zero behavior change.

## How the bridge works
- `apk/android.js` defines `window.CBTAdsConfig` (flags) + `window.CBTAds` (JS bridge).
- `CBTAds.available` is true **only** when the Java `CBTBridge` exposes `showRewardedAd()`.
- App calls `window.CBTAds.show(cb)`; the native wrapper shows the rewarded ad and calls **`window.CBTAds._onResult(true|false)`** exactly once. Do not rename — frozen contract.
- `ok=true` → modal closes, `showInstructions()` runs. `ok=false` → retry state + (if `fallbackAllowed`) a quiet "Start exam anyway" escape hatch.

## Activate real ads (3 steps)
1. **Create an AdMob app** → copy the **App ID** into the `com.google.android.gms.ads.APPLICATION_ID` meta-data value in `apk/AndroidManifest.xml`.
2. Create a **Rewarded ad unit** in AdMob → copy the **unit ID** into `REWARDED_AD_UNIT_ID` in `apk/src/com/pgpro/gatecbt/MainActivity.java`, and wire `CBTBridge.showRewardedAd()` to load/show it, calling back into `CBTAds._onResult`. (Manifest currently has no INTERNET permission — AdMob needs it; this is part of the native wiring.)
3. **Rebuild:** `bash apk/build-apk.sh` — android.js is injected into the asset copy of index.html automatically.

## Config flags (`apk/android.js` → `window.CBTAdsConfig`)
| Flag | Default | Meaning |
|------|---------|---------|
| `enabled` | `true` | Master switch; `false` disables the gate entirely (same as no bridge). |
| `fallbackAllowed` | `true` | If true, failed ads offer "Start exam anyway (no ad)". |
| `exemptDrill` | `true` | If true, Unlimited Drill bypasses the ad gate. |

## Revenue notes
- **Test ads pay $0** — use AdMob's test unit IDs while developing.
- **Real fill needs a recognized store:** AdMob delivers paying ads mainly to apps published on Google Play (and some other big stores); sideloaded APKs get little/no fill.
- **Sideload-only supply risks AdMob policy:** running live ads on an un-published, self-built APK can violate AdMob policy and risk account suspension.
- **Recommendations:** publish on Google Play (or a supported store) before enabling real fill; keep `fallbackAllowed: true` so a no-fill user can still start exams; keep `exemptDrill: true` so practice never hits a paywall.