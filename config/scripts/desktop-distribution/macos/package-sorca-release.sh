#!/usr/bin/env bash
set -euo pipefail
umask 077

fingerprint="${SORCA_MAC_SIGNING_SHA1:-}"
certificate="${SORCA_MAC_CERTS:-}"
certificate_password="${SORCA_MAC_CERTS_PASSWORD:-}"
unset SORCA_MAC_CERTS SORCA_MAC_CERTS_PASSWORD

if [[ -n "$fingerprint" || -n "$certificate" || -n "$certificate_password" ]]; then
  if [[ ! "$fingerprint" =~ ^[A-F0-9]{40}$ || -z "$certificate" || -z "$certificate_password" ]]; then
    echo '::error::Configure SORCA_MAC_SIGNING_SHA1, SORCA_MAC_CERTS and SORCA_MAC_CERTS_PASSWORD together.'
    exit 1
  fi
  work=$(mktemp -d "${RUNNER_TEMP:-${TMPDIR:-/tmp}}/sorca-signing.XXXXXXXX")
  keychain="$work/signing.keychain-db"
  old_keychains=()
  while IFS= read -r line; do
    path="${line#*\"}"
    old_keychains+=("${path%\"}")
  done < <(security list-keychains -d user)
  cleanup() {
    security list-keychains -d user -s "${old_keychains[@]}" || true
    security delete-keychain "$keychain" || true
    rm -rf "$work"
  }
  trap cleanup EXIT
  keychain_password=$(openssl rand -hex 32)
  printf '%s' "$certificate" | base64 -D > "$work/signing.p12"
  security create-keychain -p "$keychain_password" "$keychain"
  security set-keychain-settings -lut 7200 "$keychain"
  security unlock-keychain -p "$keychain_password" "$keychain"
  security import "$work/signing.p12" -k "$keychain" -P "$certificate_password" -T /usr/bin/codesign
  rm "$work/signing.p12"
  unset certificate certificate_password
  security set-key-partition-list -S apple-tool:,apple: -s -k "$keychain_password" "$keychain" >/dev/null
  security list-keychains -d user -s "$keychain" "${old_keychains[@]}"
  security find-identity -v -p codesigning "$keychain" | awk -v expected="$fingerprint" '
    $2 == expected { found = 1 }
    END { if (!found) exit 1 }
  '
  export CSC_KEYCHAIN="$keychain"
  export SORCA_MAC_LOCAL_SIGNING_IDENTITY="$fingerprint"
else
  echo '::notice::No certificate signing configured. The ad hoc Mac package requires manual installation.'
fi

marker=dist/orca-macos-arm64-update.json
rm -f "$marker"
pnpm exec electron-builder --config config/electron-builder.orca-distribution.config.cjs \
  --mac dmg --arm64 --publish never
test -s dist/orca-macos-arm64.dmg

app=dist/mac-arm64/Orca.app
if [[ -n "$fingerprint" ]]; then
  requirement="=anchor apple generic and certificate leaf = H\"$fingerprint\""
  codesign --verify --deep --strict -R "$requirement" "$app"
  for helper in 'Helpers/Orca Agents.app' 'Frameworks/Orca Helper.app' 'Resources/Orca Computer Use.app'; do
    codesign --verify --strict -R "$requirement" "$app/Contents/$helper"
  done
  signing_identity=$(node --import tsx --input-type=module -e '
    import { createHash } from "node:crypto"
    import { readSOrcaMacSigningIdentity } from "./src/main/updater/local-package/sorca-mac-signing.ts"
    const requirements = await readSOrcaMacSigningIdentity(process.argv[1])
    console.log(createHash("sha256").update(JSON.stringify(requirements)).digest("hex"))
  ' "$app")
  version=$(/usr/libexec/PlistBuddy -c 'Print :CFBundleVersion' "$app/Contents/Info.plist")
  [[ "$version" == "$ORCA_LOCAL_BUILD_VERSION" ]]
  printf '{"version":"%s","signingIdentity":"%s"}\n' "$version" "$signing_identity" > "$marker"
else
  codesign --verify --deep --strict "$app"
fi
