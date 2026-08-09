#!/bin/zsh
set -euo pipefail

project_dir=${0:A:h:h}
installer="$project_dir/release/Sonora.pkg"
dmg_root=$(mktemp -d /private/tmp/sonora-dmg-root.XXXXXX)
trap 'rm -rf "$dmg_root"' EXIT

if [[ ! -f "$installer" ]]; then
  print -u2 "O instalador Sonora.pkg ainda não foi gerado."
  exit 1
fi

COPYFILE_DISABLE=1 ditto --noextattr --norsrc "$installer" "$dmg_root/Instalar Sonora.pkg"
xattr -cr "$dmg_root"

hdiutil create \
  -volname "Sonora" \
  -srcfolder "$dmg_root" \
  -ov \
  -format UDZO \
  "$project_dir/release/Sonora.dmg"
