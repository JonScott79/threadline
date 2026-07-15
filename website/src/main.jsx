/*======================================================
                        IMPORTS
======================================================*/

import React from "react";
import ReactDOM from "react-dom/client";

import "../css/theme.css";
import "../css/main.css";
import "../css/components.css";
import "../css/animation.css";
import "../css/responsive.css";

import App from "./App";

import { AuthProvider } from "../auth/AuthProvider";

/*======================================================
                        APPLICATION
======================================================*/

ReactDOM.createRoot(

    document.getElementById("root")

).render(

    <React.StrictMode>

        <AuthProvider>

            <App />

        </AuthProvider>

    </React.StrictMode>

);