#!/usr/bin/env bash
# ============================================================
# GATE-CBT · APK build script (no Gradle / no Android Studio)
#
# Pipeline (community-standard for on-device builds):
#   aapt2 compile/link -> javac -> d8 -> zip assets -> zipalign -> apksigner
#
# Prereqs (one-time):
#   apt install openjdk-17-jdk-headless qemu-user libc6-amd64-cross libgcc-s1-amd64-cross
#   Android build-tools + platform android.jar extracted somewhere, e.g.:
#     /opt/android/build-tools/34.0.0/...  (aapt2, zipalign, d8, apksigner)
#     /opt/android/platforms/android-35/android.jar
#
# Env overrides:
#   BT_DIR    build-tools dir containing aapt2/zipalign/d8/apksigner
#   ANDROID_JAR  android.jar path
#   KS_PASS / KEY_PASS  keystore key passwords (defaults: random, saved)
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

# x86_64 host binaries run under qemu-user on aarch64
run64() { QEMU_LD_PREFIX="$QEMU_PREFIX" qemu-x86_64 "$@"; }

PKG="com.pgpro.gatecbt"
VER_CODE="${VER_CODE:-1}"
VER_NAME="${VER_NAME:-1.0.0}"
OUT_APK="${OUT_APK:-$REPO/dist/GATE-CBT-v${VER_NAME}.apk}"

WORK="$ROOT/.build"
KS="$ROOT/keystore/release.keystore"
KS_ENV="$ROOT/keystore/keystore.env"

for f in "$AAPT2" "$ZIPALIGN" "$D8" "$APKSIGNER" "$ANDROID_JAR"; do
  [ -f "$f" ] || { echo "MISSING: $f" >&2; exit 1; }
done
command -v qemu-x86_64 >/dev/null || { echo "MISSING: qemu-x86_64" >&2; exit 1; }
command -v javac >/dev/null || { echo "MISSING: javac (openjdk)" >&2; exit 1; }

# AdMob SDK classpath (absolute jar paths, one per line)
ADS_CP="$REPO/vendor/ads/classpath.txt"
if [ ! -f "$ADS_CP" ]; then
  echo "Missing AdMob SDK — run: python3 $ROOT/download-ads-sdk.py" >&2
  exit 1
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
  --manifest "$ROOT/AndroidManifest.xml" \
  --java "$WORK/gen" \
  --min-sdk-version 24 --target-sdk-version 35 \
  --version-code "$VER_CODE" --version-name "$VER_NAME" \
  -o "$WORK/unsigned.apk" "$WORK/res/res.zip"

echo "==> java (javac)"
PKG_PATH="${PKG//./\/}"
javac --release 17 -encoding UTF-8 -cp "$ANDROID_JAR:$(paste -sd: "$ADS_CP")" -d "$WORK/classes" \
  "$WORK/gen/$PKG_PATH/R.java" "$ROOT/src/$PKG_PATH/MainActivity.java"

echo "==> dex (d8)"
find "$WORK/classes" -name "*.class" > "$WORK/classes.list"
cat "$WORK/classes.list" "$ADS_CP" > "$WORK/d8-inputs.list"
"$D8" --release --lib "$ANDROID_JAR" --min-api 24 --output "$WORK/dex" \
  @"$WORK/d8-inputs.list"

echo "==> assets (web app bundle)"
cp "$REPO"/index.html "$REPO"/style.css "$REPO"/app.js "$REPO"/calc.js \
   "$REPO"/exams.js "$REPO"/bank-*.js "$WORK/assets/"
cp -r "$REPO"/vendor "$WORK/assets/"
cp "$ROOT"/android.js "$WORK/assets/"
# inject android.js into the asset copy of index.html (repo copy untouched)
sed -i 's|<script src="app.js"></script>|<script src="android.js"></script><script src="app.js"></script>|' \
  "$WORK/assets/index.html"

echo "==> package (zip)"
zip -q -j "$WORK/unsigned.apk" "$WORK/dex"/*.dex           # classes.dex at root
(cd "$WORK" && zip -q -r unsigned.apk assets)              # assets/...

echo "==> align (zipalign)"
run64 "$ZIPALIGN" -p 4 "$WORK/unsigned.apk" "$WORK/aligned.apk"

echo "==> sign (apksigner v2+v3)"
"$APKSIGNER" sign \
  --ks "$KS" --ks-key-alias gatecbt \
  --ks-pass "env:KS_PASS" --key-pass "env:KEY_PASS" \
  --v1-signing-enabled false --v2-signing-enabled true --v3-signing-enabled true \
  --min-sdk-version 24 \
  --out "$OUT_APK" "$WORK/aligned.apk"

echo "==> verify"
"$APKSIGNER" verify --verbose "$OUT_APK" | head -12

echo "==> done: $OUT_APK ($(du -h "$OUT_APK" | cut -f1))"