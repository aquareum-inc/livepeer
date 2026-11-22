# Running and testing the operator console on phones

Practical notes from building stages 1 and 2 of the console (`docs/mobile/plan.md` section 18). The plan says
what was built and why; this says how to run it, drive it and capture it on one machine. Nothing here is a
rule: `CLAUDE.md` and the plan hold those.

## A mock instance to test against

- Start one with `MOCK_ONLY=1 INSTANCE_CONFIG=docs/mobile/dev.instance.config.json`, a `SESSION_SECRET` of 32 or
  more characters, and `corepack pnpm --filter @livepeer/web exec next dev --port <port>`. The dev config has
  both `surfaces.mobile` and `surfaces.mobileConsole` on.
- Port 3100 is the default and may belong to another checkout. `next dev` allows one dev server per checkout,
  so a second config in the same checkout needs the first stopped.
- To stop one, kill only the listener: `kill $(lsof -ti :<port> -sTCP:LISTEN)`. A plain `lsof -ti :<port>` also
  lists a simulator app with a connection to that port, and kills it.
- **Who is who.** With the mock provider, the email method with `sam@example.test` is the operator, in the user
  app and at the console's sign-in. Any other address or method is Adam, an ordinary user, who is refused at the
  console with "This account doesn't run Livepeer."
- **Console-only.** Copy the dev config with `surfaces.mobile: false` to a scratch file and pass its absolute
  path as `INSTANCE_CONFIG`.
- **What survives a restart.** Reports are kept in a file and survive. Sessions don't: a new `SESSION_SECRET`
  ends every user and operator session, and the console then returns to sign-in with "The console was signed
  out on this phone. Sign in again." That is also the way to see that path.
- **Suspend and resume** are remembered by the mock for the life of the server process. Tomás starts suspended.
- **Filing reports from a shell**, so the queue has something in it:
  `curl -s -L -c jar -b jar "http://localhost:<port>/auth/start?method=google" -o /dev/null` signs in as Adam
  with a cookie; then `POST /api/v1/characters/<slug>/report` with `{"reason":"spam","note":"…"}` and that
  cookie. `GET /api/v1/characters` lists the slugs.
- **Pausing the instance** to see loading rows: `kill -STOP <pid>` on the listener, act in the app, capture,
  then `kill -CONT <pid>`. Stopping it altogether shows Status's "Can't reach Livepeer."

## iOS simulator

- **Point a build at another port** on the command line: `xcodebuild … INSTANCE_URL='http://localhost:<port>'`.
  For the UI tests also set `TEST_RUNNER_LIVEPEER_INSTANCE_URL`. `Config/Instance.xcconfig` stays as it is.
- Schemes: `Livepeer` builds the app and runs the unit tests; `LivepeerAllTests` adds the UI tests.
- **Face ID from a shell.** Enrol:
  `xcrun simctl spawn <udid> notifyutil -s com.apple.BiometricKit.enrollmentChanged 1` then
  `xcrun simctl spawn <udid> notifyutil -p com.apple.BiometricKit.enrollmentChanged`. Match:
  `xcrun simctl spawn <udid> notifyutil -p com.apple.BiometricKit_Sim.pearl.match`.
- **The simulator can't hold a key behind a face.** `DeviceKey` has a simulator-only path that makes the key
  without the biometric condition and asks for the match itself. The device path has never run on a phone.
- **The system "Wants to Use … to Sign In" alert** may not show in a screenshot. Its Continue button is at about
  (275, 508) in points on an iPhone 17.
- **Appearance and text size:** `xcrun simctl ui <udid> appearance dark|light` and
  `xcrun simctl ui <udid> content_size accessibility-extra-extra-extra-large` (back with `content_size large`).
  Rows move at the largest size, so look before tapping: the foot line on More sits where System was.
- **Timing the background.** A view's scene phase doesn't report the background until the app returns;
  `ConsoleSession` listens to the system's background and foreground notices instead.

## Android emulator

- **Point a build at another port** by editing `url=` in `apps/android/instance.properties` to
  `http://10.0.2.2:<port>` and restoring it before committing. There is no other override. Gradle needs
  `ANDROID_HOME` set (here `$HOME/Library/Android/sdk`).
- **After installing a development build**, grant it the local network:
  `adb shell pm grant org.livepeer.app.dev android.permission.ACCESS_LOCAL_NETWORK`.
- **A fingerprint from a shell.** `adb shell locksettings set-pin 1111`; then
  `adb shell am force-stop com.android.settings` and `adb shell am start -a android.settings.FINGERPRINT_ENROLL`;
  enter the PIN, press MORE, then I AGREE; then `adb -e emu finger touch 1` and `adb -e emu finger remove 1`
  about eight times until "Fingerprint added". To match a prompt, one touch. Afterwards
  `adb shell locksettings clear --old 1111` removes the PIN and the fingerprint with it.
- **The system fingerprint prompt screenshots as black**: Android protects it. Read its words from
  `adb shell uiautomator dump` instead.
- **Finding things to tap.** `uiautomator dump` gives each element's text or description and its bounds; tapping
  by exact text avoids hitting "Continue with Google" when "Continue" was meant.
- **The emulator's Keystore holds the key in software.** A release build refuses such a key on purpose
  (`DeviceKey.create`), so only a development build can enrol in an emulator.
- **Theme and font size:** `adb shell cmd uimode night yes|no` and `adb shell settings put system font_scale 2.0`
  (back with `1.0`).
- **The app switcher.** The stored picture of the console is blank from Android 13; the card is still live for
  the moment it slides in. Check it by going Home first, then opening the switcher.
- **`USE_BIOMETRIC`** must stay in the manifest, or asking whether a fingerprint is enrolled throws.

## Fixtures for the native decoding tests

The fixtures in `docs/mobile/fixtures/operator_*.json` are real answers, captured over HTTP from a mock-only
instance by a short script that acts as a phone. The script is not in the repo. What it does:

1. Makes a P-256 key pair, a PKCE verifier and a state.
2. Follows `/auth/start?method=email&email=sam@example.test&purpose=operator&client=ios&state=…&challenge=…` by
   hand, keeping cookies, until the redirect leaves http for the app's own scheme, and takes `code` from it.
3. Posts the code, the verifier and the public key (base64 of the SubjectPublicKeyInfo is accepted) to
   `POST /api/v1/auth/operator-device` for the `aqo_` token.
4. Asks for an unlock challenge, signs `livepeer-operator-unlock\n<nonce>` (ECDSA over SHA-256, DER,
   base64url) and posts it to `/operator/device/unlock`.
5. Reads each operation and writes its answer as compact JSON, then deletes the session.

A change needs a second challenge for the operation name and the hash of its input; the messages and the
hashing are pinned by `operator_proof_vectors.json`.

## Things that will catch you out

- **Nothing a phone is sent may name a secret.** `apps/web/lib/public-api/operator-phones.test.ts` refuses any
  phone answer containing "token", "secret" or "key" words. The doctor's setup checks name settings such as
  `SESSION_SECRET`, which is why they are not sent to phones; don't loosen the test to let something through.
- **A marked read must say what it answers with** (`output`), or the generated clients have nothing to decode.
  After changing `operations.ts`, run `corepack pnpm api:openapi` and `corepack pnpm mobile:generate`.
- **Rows whose state changes need a new list key** (id plus state) on both platforms, or a lazy list keeps the
  old drawing.
- **Whole numbers in a query** must be sent without a fraction (`limit=30`, not `30.0`).
- **Translucent colours don't stack.** The muted foreground is see-through: laid over ink it vanishes, which is
  why the revenue bars put margin on top of cost and never one over the other.

## Still unproven

- The device key on a real phone, on either platform: hardware-backed storage, and that adding a face or
  fingerprint destroys it. Neither a simulator nor an emulator can show this.
- A phone with only a weak face unlock on Android, and Android 10 to 12.
- No UI test drives the console: a test can't answer the biometric prompt from inside.
