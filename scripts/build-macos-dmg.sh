#!/bin/zsh
set -euo pipefail

project_dir=${0:A:h:h}
app="$project_dir/release/macos/mac-arm64/Sonora Connect.app"
dmg_root=$(mktemp -d /private/tmp/sonora-dmg-root.XXXXXX)
trap 'rm -rf "$dmg_root"' EXIT

if [[ ! -d "$app" ]]; then
  print -u2 "O aplicativo Sonora Connect ainda não foi gerado."
  exit 1
fi

COPYFILE_DISABLE=1 ditto --noextattr --norsrc "$app" "$dmg_root/Sonora Connect.app"
ln -s /Applications "$dmg_root/Aplicativos"
xattr -cr "$dmg_root"

hdiutil create \
  -volname "Sonora" \
  -srcfolder "$dmg_root" \
  -ov \
  -format UDZO \
  "$project_dir/release/Sonora.dmg"
