/*======================================================
                        IMPORTS
======================================================*/

import {

    createContext,

    useContext,

    useEffect,

    useState

} from "react";

import {

    onAuthStateChanged

} from "firebase/auth";

import {

    auth

} from "./firebase";

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

    useEffect(()=>{

        // Check if user has opted for local guest mode previously
        const isLocalMode = localStorage.getItem("threadline_local_mode") === "true";
        if (isLocalMode) {
            setUser({
                uid: "local",
                displayName: "Local Guest",
                email: "local@threadline.internal"
            });
            setLoading(false);
            return;
        }

        const unsubscribe = onAuthStateChanged(

            auth,

            (currentUser)=>{

                setUser(currentUser);

                setLoading(false);

            }

        );

        return unsubscribe;

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

    return(

        <AuthContext.Provider

            value={{

                user,

                loading,

                loginAsLocalGuest,

                logoutLocalGuest

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