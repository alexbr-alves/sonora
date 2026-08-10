#!/bin/zsh
set -euo pipefail

project_dir=${0:A:h:h}
app="$project_dir/release/macos/mac-arm64/Talos Connect.app"
driver="$project_dir/native/macos/virtual-mic/build/SoundpadMicrophone.driver"
package_root=$(mktemp -d /private/tmp/talos-installer-root.XXXXXX)
trap 'rm -rf "$package_root"' EXIT

if [[ ! -d "$app" || ! -d "$driver" ]]; then
  print -u2 "O aplicativo ou o driver ainda não foi compilado."
  exit 1
fi

mkdir -p "$package_root/Applications"
mkdir -p "$package_root/Library/Audio/Plug-Ins/HAL"
COPYFILE_DISABLE=1 ditto --noextattr --norsrc "$app" "$package_root/Applications/Talos Connect.app"
COPYFILE_DISABLE=1 ditto --noextattr --norsrc "$driver" "$package_root/Library/Audio/Plug-Ins/HAL/SoundpadMicrophone.driver"
find "$package_root" -name '._*' -delete
xattr -cr "$package_root"

pkgbuild \
  --root "$package_root" \
  --identifier "com.sonora.installer" \
  --version "0.2.0" \
  --install-location / \
  --scripts "$project_dir/native/macos/virtual-mic/pkg-scripts" \
  "$project_dir/release/Talos.pkg"
