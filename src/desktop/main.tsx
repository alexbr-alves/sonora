import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import DesktopBridge from "./DesktopBridge";
import "./desktop.css";
import "./qr.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <DesktopBridge />
  </StrictMode>
);
