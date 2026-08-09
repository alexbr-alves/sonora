#!/bin/zsh
set -euo pipefail

project_dir=${0:A:h:h}
app="$project_dir/release/macos/mac-arm64/Sonora Connect.app"
work_dir=$(mktemp -d /private/tmp/sonora-dmg-build.XXXXXX)
dmg_root="$work_dir/root"
rw_dmg="$work_dir/Sonora-rw.dmg"
mkdir -p "$dmg_root"
mount_dir=""
mounted=false
cleanup() {
  if [[ "$mounted" == true ]]; then hdiutil detach "$mount_dir" -force >/dev/null 2>&1 || true; fi
  rm -rf "$work_dir"
}
trap cleanup EXIT

if [[ ! -d "$app" ]]; then
  print -u2 "O aplicativo Sonora Connect ainda não foi gerado."
  exit 1
fi

COPYFILE_DISABLE=1 ditto --noextattr --norsrc "$app" "$dmg_root/Sonora Connect.app"
ln -s /Applications "$dmg_root/Aplicativos"
mkdir -p "$dmg_root/.background"
sips -s format png "$project_dir/apps/macos/assets/dmg-background.svg" \
  --out "$dmg_root/.background/background.png" >/dev/null
xattr -cr "$dmg_root"

# Sem uma conta Apple Developer não há assinatura pública, mas a assinatura
# ad-hoc mantém todos os componentes internos íntegros. A cópia temporária
# também evita metadados do Finder adicionados pela pasta de desenvolvimento.
codesign --force --deep --sign - "$dmg_root/Sonora Connect.app"
codesign --verify --deep --strict --verbose=2 "$dmg_root/Sonora Connect.app"

hdiutil create \
  -volname "Sonora Connect" \
  -srcfolder "$dmg_root" \
  -ov \
  -format UDRW \
  "$rw_dmg" >/dev/null

attach_output=$(hdiutil attach "$rw_dmg" -readwrite -noverify -noautoopen)
mount_dir=$(print -r -- "$attach_output" | awk -F '\t' 'NF >= 3 { path = $NF } END { print path }')
volume_name=${mount_dir:t}
mounted=true
SetFile -a V "$mount_dir/.background"

osascript - "$volume_name" <<'APPLESCRIPT'
on run argv
set volumeName to item 1 of argv
tell application "Finder"
  tell disk volumeName
    open
    set current view of container window to icon view
    set toolbar visible of container window to false
    set statusbar visible of container window to false
    set pathbar visible of container window to false
    set sidebar width of container window to 0
    set the bounds of container window to {120, 120, 780, 540}
    set viewOptions to the icon view options of container window
    set arrangement of viewOptions to not arranged
    set icon size of viewOptions to 96
    set text size of viewOptions to 13
    set background picture of viewOptions to file ".background:background.png"
    set position of item "Sonora Connect.app" of container window to {190, 215}
    set position of item "Aplicativos" of container window to {470, 215}
    update without registering applications
    delay 2
    close
  end tell
end tell
end run
APPLESCRIPT

sync
hdiutil detach "$mount_dir" >/dev/null
mounted=false

hdiutil convert "$rw_dmg" \
  -format UDZO \
  -imagekey zlib-level=9 \
  -ov \
  -o "$project_dir/release/Sonora.dmg" >/dev/null

print "DMG criado em: $project_dir/release/Sonora.dmg"
