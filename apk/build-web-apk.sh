#!/usr/bin/env bash
# ============================================================
# GATE-CBT Web · APK build script (localhost browser edition)
#
# Same no-Gradle pipeline as build-apk.sh, but for the browser
# variant: loopback HTTP server + browser launch. NO WebView,
# NO AdMob SDK, NO android.js bridge injection.
#
# Prereqs: identical to build-apk.sh (see its header).
#   BT_DIR / ANDROID_JAR / QEMU_PREFIX env overrides apply.
# ============================================================
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
REPO="$(dirname "$ROOT")"

BT_DIR="${BT_DIR:-/tmp/bt34/android-14}"
ANDROID_JAR="${ANDROID_JAR:-/tmp/plat35/android-35/android.jar}"
QEMU_PREFIX="${QEMU_PREFIX:-/usr/x86_64-linux-gnu}"

AAPT2="$BT_DIR/aapt2"
ZIPALIGN="$BT_DIR/zipalign"
D8="$BT_DIR/d8"
APKSIGNER="$BT_DIR/apksigner"

run64() { QEMU_LD_PREFIX="$QEMU_PREFIX" qemu-x86_64 "$@"; }

PKG="com.pgpro.gatecbt.host"
VER_CODE="${VER_CODE:-1}"
VER_NAME="${VER_NAME:-1.5.0-web}"                       # android:versionName
OUT_APK="${OUT_APK:-$REPO/dist/GATE-CBT-web-v${VER_NAME%-web}.apk}"  # ...-web-v1.5.0.apk

NANO_JAR="$REPO/vendor/nanohttpd/nanohttpd-2.3.1.jar"
NANO_URL="https://repo1.maven.org/maven2/org/nanohttpd/nanohttpd/2.3.1/nanohttpd-2.3.1.jar"

WORK="$ROOT/.build"
KS="$ROOT/keystore/release.keystore"
KS_ENV="$ROOT/keystore/keystore.env"

for f in "$AAPT2" "$ZIPALIGN" "$D8" "$APKSIGNER" "$ANDROID_JAR"; do
  [ -f "$f" ] || { echo "MISSING: $f" >&2; exit 1; }
done
command -v qemu-x86_64 >/dev/null || { echo "MISSING: qemu-x86_64" >&2; exit 1; }
command -v javac >/dev/null || { echo "MISSING: javac (openjdk)" >&2; exit 1; }

echo "==> nanohttpd"
if [ ! -f "$NANO_JAR" ]; then
  command -v curl >/dev/null || { echo "MISSING: curl (to fetch NanoHTTPD)" >&2; exit 1; }
  mkdir -p "$(dirname "$NANO_JAR")"
  curl -fsSL -o "$NANO_JAR" "$NANO_URL"
fi

echo "==> clean"
rm -rf "$WORK" "$(dirname "$OUT_APK")"
mkdir -p "$WORK"/{res,gen,classes,dex,assets} "$(dirname "$OUT_APK")" "$ROOT/keystore"

echo "==> keystore"
if [ ! -f "$KS" ]; then
  [ -f "$KS_ENV" ] && . "$KS_ENV"
  KS_PASS="${KS_PASS:-$(head -c 16 /dev/urandom | base64 | tr -dc 'A-Za-z0-9' | head -c 16)}"
  KEY_PASS="${KEY_PASS:-$KS_PASS}"
  printf 'KS_PASS=%s\nKEY_PASS=%s\n' "$KS_PASS" "$KEY_PASS" > "$KS_ENV"
  chmod 600 "$KS_ENV"
  keytool -genkeypair -v \
    -keystore "$KS" -alias gatecbt -keyalg RSA -keysize 2048 -validity 10000 \
    -storepass "$KS_PASS" -keypass "$KEY_PASS" \
    -dname "CN=GATE-CBT, OU=PGPRO, O=PGPRO, L=Unknown, ST=Unknown, C=IN" >/dev/null 2>&1
fi
. "$KS_ENV"
export KS_PASS KEY_PASS

echo "==> resources (aapt2 compile + link)"
run64 "$AAPT2" compile --dir "$ROOT/res" -o "$WORK/res/res.zip"
run64 "$AAPT2" link \
  -I "$ANDROID_JAR" \
  --manifest "$ROOT/AndroidManifest-web.xml" \
  --java "$WORK/gen" \
  --min-sdk-version 24 --target-sdk-version 35 \
  --version-code "$VER_CODE" --version-name "$VER_NAME" \
  -o "$WORK/unsigned.apk" "$WORK/res/res.zip"

echo "==> java (javac)"
PKG_PATH="${PKG//./\/}"
javac --release 17 -encoding UTF-8 -cp "$ANDROID_JAR:$NANO_JAR" -d "$WORK/classes" \
  "$WORK/gen/$PKG_PATH/R.java" "$ROOT/src/$PKG_PATH/WebServerActivity.java"

echo "==> dex (d8)"
find "$WORK/classes" -name "*.class" > "$WORK/classes.list"
cat "$WORK/classes.list" > "$WORK/d8-inputs.list"
echo "$NANO_JAR" >> "$WORK/d8-inputs.list"
"$D8" --release --lib "$ANDROID_JAR" --min-api 24 --output "$WORK/dex" \
  @"$WORK/d8-inputs.list"

echo "==> assets (pure web app bundle — no android.js, no ads)"
cp "$REPO"/index.html "$REPO"/style.css "$REPO"/app.js "$REPO"/calc.js \
   "$REPO"/exams.js "$REPO"/bank-*.js "$WORK/assets/"
cp -r "$REPO"/vendor "$WORK/assets/"

echo "==> package (zip)"
zip -q -j "$WORK/unsigned.apk" "$WORK/dex"/*.dex           # classes.dex at root
(cd "$WORK" && zip -q -r unsigned.apk assets)              # assets/...

echo "==> align (zipalign)"
run64 "$ZIPALIGN" -p 4 "$WORK/unsigned.apk" "$WORK/aligned.apk"

echo "==> sign (apksigner v2+v3, no v4 sidecar)"
"$APKSIGNER" sign \
  --ks "$KS" --ks-key-alias gatecbt \
  --ks-pass "env:KS_PASS" --key-pass "env:KEY_PASS" \
  --v1-signing-enabled false --v2-signing-enabled true --v3-signing-enabled true \
  --v4-signing-enabled false \
  --min-sdk-version 24 \
  --out "$OUT_APK" "$WORK/aligned.apk"

echo "==> verify"
"$APKSIGNER" verify --verbose "$OUT_APK" | head -12

echo "==> done: $OUT_APK ($(du -h "$OUT_APK" | cut -f1))"