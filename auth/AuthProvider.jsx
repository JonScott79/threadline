/*======================================================
                        IMPORTS
======================================================*/

import {

    createContext,

    useContext,

    useEffect,

    useRef,

    useState

} from "react";

import {

    onAuthStateChanged,

    signInWithCustomToken,

    signOut as firebaseSignOut

} from "firebase/auth";

import axios from "axios";

import {

    auth

} from "./firebase";

const AUTH_HUB_URL = (import.meta.env.VITE_LANZAR_AUTH_HUB_URL || (
    typeof window !== "undefined" && window.location.hostname.endsWith("-dev.lanzar.me")
        ? "https://auth-dev.lanzar.me"
        : "https://auth.lanzar.me"
)).replace(/\/+$/, "");

const AUTH_API_URL = (import.meta.env.VITE_LANZAR_AUTH_API_URL || (
    typeof window !== "undefined" && window.location.hostname.endsWith("-dev.lanzar.me")
        ? "https://auth-api-dev.lanzar.me"
        : "https://auth-api.lanzar.me"
)).replace(/\/+$/, "");

const EXPECTED_OIDC_ISSUER = (import.meta.env.VITE_LANZAR_OIDC_ISSUER || AUTH_HUB_URL).replace(/\/+$/, "");

const CLIENT_ID = "threadline";
const PKCE_STATE_KEY = "threadline_pkce_state";
const PKCE_VERIFIER_KEY = "threadline_pkce_verifier";
const PKCE_NONCE_KEY = "threadline_pkce_nonce";
const LANZAR_SESSION_ID_KEY = "lanzar_session_id";
const SILENT_SSO_KEY = "threadline_silent_sso_attempted";

function decodeJwtPayload(token) {
    const parts = String(token || "").split(".");
    if (parts.length !== 3) return null;
    try {
        const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
        const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
        return JSON.parse(atob(padded));
    } catch (_) {
        return null;
    }
}

function generateRandomId() {
    if (typeof crypto.randomUUID === "function") {
        return crypto.randomUUID();
    }
    return generateCodeVerifier();
}

function base64UrlEncode(bytes) {
    let binary = "";
    const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    for (let i = 0; i < arr.length; i++) {
        binary += String.fromCharCode(arr[i]);
    }
    return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function generateCodeVerifier() {
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    return base64UrlEncode(bytes);
}

async function generateCodeChallenge(verifier) {
    const encoded = new TextEncoder().encode(verifier);
    const digest = await crypto.subtle.digest("SHA-256", encoded);
    return base64UrlEncode(new Uint8Array(digest));
}

/*======================================================
                    CONTEXT
======================================================*/

const AuthContext = createContext();

/*======================================================
                AUTH PROVIDER
======================================================*/

export function AuthProvider({ children }){

    const [user, setUser] = useState(null);

    const [loading, setLoading] = useState(true);

    const wasSignedInRef = useRef(false);
    const lastIdTokenRef = useRef(null);
    const revokingRef = useRef(false);

    async function revokeCentralSession(idTokenOverride = null) {
        if (revokingRef.current) return;
        revokingRef.current = true;
        try {
            const sessionId = sessionStorage.getItem(LANZAR_SESSION_ID_KEY);
            const idToken = idTokenOverride || lastIdTokenRef.current;
            if (sessionId && idToken) {
                await fetch(`${AUTH_API_URL}/api/id/sessions/${encodeURIComponent(sessionId)}`, {
                    method: "DELETE",
                    headers: { "Authorization": `Bearer ${idToken}` }
                }).catch(() => {});
            }
            await fetch(`${AUTH_API_URL}/api/id/session/logout`, {
                method: "POST",
                credentials: "include",
                headers: {
                    "Content-Type": "application/json",
                    "X-Lanzar-Client": "id"
                }
            }).catch(() => {});
            sessionStorage.removeItem(LANZAR_SESSION_ID_KEY);
            lastIdTokenRef.current = null;
        } catch (err) {
            console.warn("[AUTH] Central session revocation warning:", err);
        } finally {
            revokingRef.current = false;
        }
    }

    async function loginWithLanzarId() {
        localStorage.removeItem("threadline_local_mode");
        const verifier = generateCodeVerifier();
        const challenge = await generateCodeChallenge(verifier);
        const state = generateRandomId();
        const nonce = generateRandomId();

        sessionStorage.setItem(PKCE_VERIFIER_KEY, verifier);
        sessionStorage.setItem(PKCE_STATE_KEY, state);
        sessionStorage.setItem(PKCE_NONCE_KEY, nonce);

        const redirectUri = window.location.origin;
        const params = new URLSearchParams({
            client_id: CLIENT_ID,
            redirect_uri: redirectUri,
            code_challenge: challenge,
            code_challenge_method: "S256",
            scope: "openid profile email",
            state,
            nonce
        });
        window.location.href = `${AUTH_HUB_URL}?${params.toString()}`;
    }

    useEffect(()=>{

        // Check if user has opted for local guest mode previously
        const isLocalMode = localStorage.getItem("threadline_local_mode") === "true";
        const urlParams = new URLSearchParams(window.location.search);
        const authCode = urlParams.get("code");
        const authState = urlParams.get("state");

        if (isLocalMode && !authCode) {
            setUser({
                uid: "local",
                displayName: "Local Guest",
                email: "local@threadline.internal"
            });
            setLoading(false);
            return;
        }

        let isMounted = true;

        async function completePkceExchangeIfPresent() {
            if (!authCode) return false;
            const storedState = sessionStorage.getItem(PKCE_STATE_KEY);
            const codeVerifier = sessionStorage.getItem(PKCE_VERIFIER_KEY);
            const storedNonce = sessionStorage.getItem(PKCE_NONCE_KEY);
            sessionStorage.removeItem(PKCE_STATE_KEY);
            sessionStorage.removeItem(PKCE_VERIFIER_KEY);
            sessionStorage.removeItem(PKCE_NONCE_KEY);

            const cleanSearch = (() => {
                const p = new URLSearchParams(window.location.search);
                p.delete("code");
                p.delete("state");
                const qs = p.toString();
                return window.location.pathname + (qs ? "?" + qs : "") + window.location.hash;
            })();
            window.history.replaceState({}, document.title, cleanSearch);

            if (!storedState || !authState || storedState !== authState || !codeVerifier) {
                console.warn("[AUTH] LANZAR ID PKCE state/verifier missing or mismatched.");
                return false;
            }

            try {
                const res = await fetch(`${AUTH_API_URL}/oauth/token`, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        "Idempotency-Key": `tl_exch_${generateRandomId().replace(/[^a-zA-Z0-9_-]/g, "")}`
                    },
                    body: JSON.stringify({
                        grant_type: "authorization_code",
                        code: authCode,
                        client_id: CLIENT_ID,
                        redirect_uri: window.location.origin,
                        code_verifier: codeVerifier
                    })
                });
                const data = await res.json().catch(() => ({}));
                if (res.ok && data.id_token) {
                    const idClaims = decodeJwtPayload(data.id_token);
                    const nowSec = Math.floor(Date.now() / 1000);
                    const audMatches = idClaims && (
                        idClaims.aud === CLIENT_ID ||
                        (Array.isArray(idClaims.aud) && idClaims.aud.includes(CLIENT_ID))
                    );
                    if (
                        !idClaims ||
                        String(idClaims.iss || "").replace(/\/+$/, "") !== EXPECTED_OIDC_ISSUER ||
                        !audMatches ||
                        !Number.isFinite(idClaims.exp) ||
                        idClaims.exp <= nowSec ||
                        (storedNonce && idClaims.nonce !== storedNonce)
                    ) {
                        console.warn("[AUTH] LANZAR ID OIDC id_token claim validation failed.");
                        return false;
                    }
                }
                if (res.ok && data.access_token) {
                    sessionStorage.setItem("lanzar_oidc_access_token", data.access_token);
                }
                if (res.ok && data.custom_token) {
                    if (data.session_id) {
                        sessionStorage.setItem(LANZAR_SESSION_ID_KEY, data.session_id);
                    }
                    sessionStorage.removeItem(SILENT_SSO_KEY);
                    await signInWithCustomToken(auth, data.custom_token);
                    return true;
                }
            } catch (err) {
                console.error("[AUTH] LANZAR ID /oauth/token failed:", err);
            }
            return false;
        }

        const reqInterceptorId = axios.interceptors.request.use(async (config) => {
            try {
                let bearer = null;
                if (auth.currentUser) {
                    bearer = await auth.currentUser.getIdToken();
                } else {
                    bearer = lastIdTokenRef.current || sessionStorage.getItem("lanzar_oidc_access_token");
                }
                if (bearer) {
                    config.headers = config.headers || {};
                    if (!config.headers.Authorization && !config.headers.authorization) {
                        config.headers.Authorization = `Bearer ${bearer}`;
                    }
                }
            } catch (_) {
                // Non-fatal: backend will enforce 401 if unauthenticated
            }
            return config;
        });

        let unsubscribe = () => {};
        (async () => {
            await completePkceExchangeIfPresent();
            if (!isMounted) return;

            unsubscribe = onAuthStateChanged(

            auth,

            async (currentUser)=>{

                if (!isMounted) return;

                if (currentUser) {
                    wasSignedInRef.current = true;
                    try {
                        const tokenRes = await currentUser.getIdTokenResult();
                        lastIdTokenRef.current = tokenRes.token;
                        const hasLanzarSession = Boolean(
                            sessionStorage.getItem(LANZAR_SESSION_ID_KEY) ||
                            tokenRes?.claims?.session_id ||
                            tokenRes?.claims?.lanzarSessionId
                        );
                        if (hasLanzarSession) {
                            const valRes = await fetch(`${AUTH_API_URL}/api/id/session/validate`, {
                                headers: { "Authorization": `Bearer ${tokenRes.token}` }
                            });
                            if (valRes.status === 401 || valRes.status === 403) {
                                const errBody = await valRes.json().catch(() => ({}));
                                if (valRes.status === 403 || errBody.error === "session_revoked" || errBody.error === "session_expired") {
                                    sessionStorage.removeItem(LANZAR_SESSION_ID_KEY);
                                    wasSignedInRef.current = false;
                                    await firebaseSignOut(auth);
                                    return;
                                }
                            }
                        }
                    } catch (err) {
                        console.warn("[AUTH] Session validation check warning:", err);
                    }

                    setUser(currentUser);
                    setLoading(false);
                    return;
                }

                if (wasSignedInRef.current) {
                    wasSignedInRef.current = false;
                    await revokeCentralSession();
                } else {
                    const host = window.location.hostname;
                    const onLanzarDomain = host === "lanzar.me" || host.endsWith(".lanzar.me");
                    const attempted = sessionStorage.getItem(SILENT_SSO_KEY);
                    if (onLanzarDomain && !authCode && !attempted) {
                        sessionStorage.setItem(SILENT_SSO_KEY, "1");
                        try {
                            const ssoRes = await fetch(`${AUTH_API_URL}/api/id/session/token`, {
                                method: "POST",
                                credentials: "include",
                                headers: {
                                    "Content-Type": "application/json",
                                    "X-Lanzar-Client": "id"
                                },
                                body: JSON.stringify({ clientApp: CLIENT_ID })
                            });
                            if (ssoRes.ok) {
                                const ssoData = await ssoRes.json().catch(() => ({}));
                                if (ssoData.customToken) {
                                    if (ssoData.sessionId) {
                                        sessionStorage.setItem(LANZAR_SESSION_ID_KEY, ssoData.sessionId);
                                    }
                                    await signInWithCustomToken(auth, ssoData.customToken);
                                    return;
                                }
                            }
                        } catch (err) {
                            console.warn("[AUTH] Silent SSO bridge check skipped:", err);
                        }
                    }
                }

                setUser(null);
                setLoading(false);

            }

        );
        })();

        return () => {
            isMounted = false;
            axios.interceptors.request.eject(reqInterceptorId);
            unsubscribe();
        };

    },[]);

    function loginAsLocalGuest() {
        localStorage.setItem("threadline_local_mode", "true");
        setUser({
            uid: "local",
            displayName: "Local Guest",
            email: "local@threadline.internal"
        });
    }

    function logoutLocalGuest() {
        localStorage.removeItem("threadline_local_mode");
        setUser(null);
    }

    async function logout() {
        if (user?.uid === "local") {
            logoutLocalGuest();
            return;
        }
        wasSignedInRef.current = false;
        sessionStorage.removeItem("lanzar_oidc_access_token");
        const currentToken = auth.currentUser ? await auth.currentUser.getIdToken().catch(() => null) : null;
        await revokeCentralSession(currentToken);
        await firebaseSignOut(auth);
    }

    return(

        <AuthContext.Provider

            value={{

                user,

                loading,

                loginAsLocalGuest,

                logoutLocalGuest,

                loginWithLanzarId,

                logout

            }}

        >

            {children}

        </AuthContext.Provider>

    );

}

/*======================================================
                    EXPORTS
======================================================*/

export function useAuth(){

    return useContext(AuthContext);

}