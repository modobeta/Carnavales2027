import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import { SessionProvider } from "./auth/session-context.jsx";
import { NotificationProvider } from "./components/Notifications.jsx";
import { SessionGate } from "./components/SessionGate.jsx";
import { ThemeProvider } from "./context/ThemeContext.jsx";
import { registerServiceWorker } from "./pwa/register-service-worker.js";
import "./index.css";
import "./styles/judge-focus.css";
import "./styles/admin-preparation.css";
import "./styles/scribe-header.css";
import "./styles/comisario-header.css";

registerServiceWorker();

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <ThemeProvider>
      <SessionProvider>
        <NotificationProvider>
          <SessionGate>
            <App />
          </SessionGate>
        </NotificationProvider>
      </SessionProvider>
    </ThemeProvider>
  </StrictMode>,
);
