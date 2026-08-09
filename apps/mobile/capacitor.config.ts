import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.alexalves.soundpad",
  appName: "Sonora",
  webDir: "../../dist",
  backgroundColor: "#070910",
  android: {
    allowMixedContent: true,
    backgroundColor: "#070910"
  }
};

export default config;
