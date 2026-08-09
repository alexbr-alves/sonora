#!/bin/zsh
set -euo pipefail

script_dir=${0:A:h}
build_dir="$script_dir/build"
archive="$build_dir/CreatingAnAudioServerDriverPlugIn.zip"
source_dir="$build_dir/source"
bundle="$build_dir/SoundpadMicrophone.driver"
download_url="https://docs-assets.developer.apple.com/published/430ad6501f6f/CreatingAnAudioServerDriverPlugIn.zip"
expected_sha256="860334dfa9e83f2afb749a890ca5a79fc7d3d572d4e116ff9242bec458be4cb0"

mkdir -p "$build_dir"
if [[ ! -f "$archive" ]]; then
  curl --fail --location --silent --show-error "$download_url" --output "$archive"
fi

actual_sha256=$(shasum -a 256 "$archive" | awk '{print $1}')
if [[ "$actual_sha256" != "$expected_sha256" ]]; then
  print -u2 "Checksum inesperado para o exemplo oficial da Apple."
  exit 1
fi

rm -rf "$source_dir" "$bundle"
mkdir -p "$source_dir" "$bundle/Contents/MacOS"
unzip -q "$archive" -d "$source_dir"
source_file=$(find "$source_dir" -name NullAudio.c -type f -print -quit)
if [[ -z "$source_file" ]]; then
  print -u2 "NullAudio.c não foi encontrado no pacote oficial."
  exit 1
fi

cp "$source_file" "$build_dir/NullAudio.c"
perl -pi -e 's/com\.apple\.audio\.NullAudio/com.soundpad.virtual-microphone/g; s/NullAudioBox_UID/SoundpadMicrophoneBox_UID/g; s/NullAudioDevice_ModelUID/SoundpadMicrophoneDevice_ModelUID/g; s/NullAudioDevice_UID/SoundpadMicrophoneDevice_UID/g' "$build_dir/NullAudio.c"
perl -0pi -e 's/(static const UInt32\s+kDevice_RingBufferSize\s+= 16384;)/$1\nstatic Float32 gLoopback_Buffer[16384 * 2] = { 0 };\nstatic UInt32 gLoopback_ReadFrame = 0;\nstatic UInt32 gLoopback_AvailableFrames = 0;/s' "$build_dir/NullAudio.c"
patch --directory "$build_dir" --strip=0 < "$script_dir/soundpad-loopback.patch"

xcrun clang -std=gnu17 -O2 -fPIC -bundle "$build_dir/NullAudio.c" \
  -framework CoreFoundation -framework CoreAudio -framework IOKit \
  -o "$bundle/Contents/MacOS/SoundpadMicrophone"
cp "$script_dir/Info.plist" "$bundle/Contents/Info.plist"
codesign --force --sign - "$bundle"

plutil -lint "$bundle/Contents/Info.plist"
codesign --verify --verbose=2 "$bundle"
file "$bundle/Contents/MacOS/SoundpadMicrophone"
print "Driver validado em: $bundle"
