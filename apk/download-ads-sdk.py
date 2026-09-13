#!/usr/bin/env python3
"""PGPRO · AdMob SDK resolver — download the full transitive AAR/JAR tree
needed to build with play-services-ads WITHOUT Gradle.

Resolves artifacts from TWO Maven sources:
  1. dl.google.com/android/maven2  (com.google.android.gms, androidx.*)
  2. repo1.maven.org/maven2        (com.google.guava, org.jetbrains.*, everything else)

Usage:  python3 download-ads-sdk.py [--purge] [--version 24.0.0]
"""
import argparse
import pathlib
import sys
import urllib.request
import xml.etree.ElementTree as ET
import zipfile

SOURCES = [
    "https://dl.google.com/android/maven2",
    "https://repo1.maven.org/maven2",
]
ROOT_ARTIFACT = ("com.google.android.gms", "play-services-ads")
JAR_GROUPS = {"com.google.guava", "com.google.auto.value", "org.checkerframework",
              "com.google.errorprone", "com.google.j2objc", "org.codehaus.mojo",
              "com.google.jimproto"}
SKIP_GROUPS = {"com.google.code.findbugs", "org.jetbrains"}
APPROX_MB = 1024 * 1024


def ns(tag: str) -> str:
    return tag.split("}")[-1]


def fetch(url: str) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": "pgpro-build/1.0"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.read()


def fetch_with_fallback(group: str, artifact: str, version: str, ext: str) -> bytes | None:
    for src in SOURCES:
        url = f"{src}/{group.replace('.', '/')}/{artifact}/{version}/{artifact}-{version}.{ext}"
        try:
            return fetch(url)
        except Exception:
            continue
    return None


def pom_dependencies(pom_bytes: bytes) -> list[tuple[str, str, str, str, str]]:
    """Return [(groupId, artifactId, version, scope, type)] from <dependencies> sections only.
    Skips <dependencyManagement> (version pins, not real deps), test/provided/system scopes,
    and BOM references (type=pom)."""
    root = ET.fromstring(pom_bytes)
    out = []
    for dep_elem in root.iter():
        if ns(dep_elem.tag) != "dependency":
            continue
        # walk up to check parent is <dependencies> not <dependencyManagement>
        parent = None
        for p in root.iter():
            for c in list(p):
                if c is dep_elem:
                    parent = p
                    break
            if parent is not None:
                break
        if parent is None or ns(parent.tag) != "dependencies":
            continue

        def child(name):
            for c in list(dep_elem):
                if ns(c.tag) == name:
                    return (c.text or "").strip()
            return ""

        g = child("groupId").lstrip("[").rstrip("]")
        a = child("artifactId").lstrip("[").rstrip("]")
        v = child("version").lstrip("[").rstrip("]")
        scope = child("scope")
        typ = child("type")
        if not (g and a and v):
            continue
        if scope in ("test", "provided", "system"):
            continue
        out.append((g, a, v, scope, typ))
    return out


# Optional-integration modules pulled in via BOMs — NOT referenced by the ads SDK
# runtime; excluding them keeps the dex small and avoids Optional/OptionalLimit refs.
JUNK_ARTIFACT_PREFIXES = (
    "byte-buddy", "jna-", "jna_", "slf4j-", "reactor-", "rxjava-", "reactive-streams",
    "kotlinx-coroutines-debug", "kotlinx-coroutines-guava", "kotlinx-coroutines-javafx",
    "kotlinx-coroutines-jdk8", "kotlinx-coroutines-jdk9", "kotlinx-coroutines-play-services",
    "kotlinx-coroutines-reactive", "kotlinx-coroutines-reactor", "kotlinx-coroutines-rx",
    "kotlinx-coroutines-slf4j", "kotlinx-coroutines-swing", "kotlinx-coroutines-test",
    "kotlin-stdlib-common", "kotlin-stdlib-jdk",
    # shim jar — every class it provides is already bundled inside guava itself
    "listenablefuture",
)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--version", default="24.0.0")
    ap.add_argument("--purge", action="store_true")
    args = ap.parse_args()

    out_dir = pathlib.Path(__file__).resolve().parent.parent / "vendor" / "ads"
    aar_dir, jar_dir = out_dir / "aar", out_dir / "jars"
    if args.purge and out_dir.exists():
        import shutil
        shutil.rmtree(out_dir)
    for d in (aar_dir, jar_dir):
        d.mkdir(parents=True, exist_ok=True)

    # BFS resolve with dedupe (group:artifact -> version wins)
    seen: dict[tuple[str, str], str] = {}
    queue: list[tuple[str, str, str]] = [(ROOT_ARTIFACT[0], ROOT_ARTIFACT[1], args.version)]
    order: list[tuple[str, str, str, str]] = []

    while queue:
        g, a, v = queue.pop(0)[:3]
        key = (g, a)
        if key in seen or g in SKIP_GROUPS:
            continue
        seen[key] = v
        # fetch POM from either source
        pom_bytes = fetch_with_fallback(g, a, v, "pom")
        if pom_bytes is None:
            continue
        order.append((g, a, v, "compile"))
        for dep in pom_dependencies(pom_bytes):
            dg, da, dv, dscope, dtype = dep
            if dtype == "pom":
                continue
            if dg not in SKIP_GROUPS and da not in seen:
                queue.append(dep)

    # download artifacts
    total_bytes = 0
    for g, a, v, scope in order:
        is_jar = g in JAR_GROUPS
        ext = "jar" if is_jar else "aar"
        dest = (jar_dir if is_jar else aar_dir) / f"{a}-{v}.{ext}"
        if dest.exists():
            total_bytes += dest.stat().st_size
            continue
        data = fetch_with_fallback(g, a, v, ext)
        if data is None:
            # try jar fallback for aars that are actually jars
            alt = "jar" if ext == "aar" else "aar"
            data = fetch_with_fallback(g, a, v, alt)
            if data:
                dest = (jar_dir if alt == "jar" else aar_dir) / f"{a}-{v}.{alt}"
                ext = alt
                is_jar = (alt == "jar")
        if data is None:
            print(f"  !! SKIP {a}-{v} ({ext} not found on any source)")
            continue
        dest.write_bytes(data)
        total_bytes += len(data)

    # extract classes.jar from AARs (for javac/d8 classpath)
    extracted = 0
    for aar in sorted(aar_dir.glob("*.aar")):
        jar_out = aar.parent / (aar.stem + ".jar")
        if jar_out.exists():
            continue
        try:
            with zipfile.ZipFile(aar) as z:
                if "classes.jar" in z.namelist():
                    with z.open("classes.jar") as src, open(jar_out, "wb") as dst:
                        dst.write(src.read())
                    extracted += 1
        except Exception as e:
            print(f"  !! extract failed {aar.name}: {e}")

    def is_junk(name: str) -> bool:
        return any(name.startswith(p) for p in JUNK_ARTIFACT_PREFIXES)

    all_jars = sorted(jar_dir.glob("*.jar")) + sorted(aar_dir.glob("*.jar"))
    usable = [j for j in all_jars if not is_junk(j.name)]
    # drop shims that fully duplicate another jar's classes (d8 rejects dup defs)
    seen_classes: set[str] = set()
    recon = sorted(usable, key=lambda j: -j.stat().st_size)
    final: list[pathlib.Path] = []
    for j in recon:
        dup = False
        try:
            with zipfile.ZipFile(j) as z:
                dup = any(n.startswith("com/") and n.endswith(".class")
                          and n in seen_classes for n in z.namelist())
                for n in z.namelist():
                    if n.startswith("com/") and n.endswith(".class"):
                        seen_classes.add(n)
        except Exception:
            pass
        if not dup:
            final.append(j)
    usable = sorted(final)
    cp_file = out_dir / "classpath.txt"
    cp_file.write_text("\n".join(str(j) for j in usable) + "\n")
    print(f"\n✓ resolved {len(order)} artifacts, {len(usable)} classpath jars "
          f"({len(all_jars) - len(usable)} excluded: junk/dup), {extracted} AARs extracted")
    print(f"  {total_bytes // APPROX_MB} MB in vendor/ads/")
    return 0


if __name__ == "__main__":
    sys.exit(main())