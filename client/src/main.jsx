import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import { SessionProvider } from "./auth/session-context.jsx";
import { NotificationProvider } from "./components/Notifications.jsx";
import { SessionGate } from "./components/SessionGate.jsx";
import { registerServiceWorker } from "./pwa/register-service-worker.js";
import "./index.css";

registerServiceWorker();

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <SessionProvider>
      <NotificationProvider>
        <SessionGate>
          <App />
        </SessionGate>
      </NotificationProvider>
    </SessionProvider>
  </StrictMode>,
);
