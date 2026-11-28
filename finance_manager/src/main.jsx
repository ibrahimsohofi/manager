import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import "./i18n";
import "./index.css";
import App from "./App";
import { PreferencesProvider } from "./context/PreferencesContext";
import { SessionProvider } from "./context/SessionContext";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <PreferencesProvider>
        <SessionProvider>
          <App />
        </SessionProvider>
      </PreferencesProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
