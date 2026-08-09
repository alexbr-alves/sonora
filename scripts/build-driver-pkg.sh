#!/bin/zsh
set -euo pipefail

project_dir=${0:A:h:h}
driver="$project_dir/native/macos/virtual-mic/build/SoundpadMicrophone.driver"
package_root=$(mktemp -d /private/tmp/sonora-mix-root.XXXXXX)
trap 'rm -rf "$package_root"' EXIT

destination="$package_root/Library/Audio/Plug-Ins/HAL"
mkdir -p "$destination" "$project_dir/release"
ditto "$driver" "$destination/SoundpadMicrophone.driver"

pkgbuild \
  --root "$package_root" \
  --identifier "com.sonora.mix.driver" \
  --version "0.1.0" \
  --install-location / \
  --scripts "$project_dir/native/macos/virtual-mic/pkg-scripts" \
  "$project_dir/release/Sonora-Mix.pkg"
