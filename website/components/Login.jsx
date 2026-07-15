/*======================================================
                        IMPORTS
======================================================*/

import { auth } from "../auth/firebase";

import {

    GoogleAuthProvider,

    signInWithPopup

} from "firebase/auth";

/*======================================================
                        COMPONENT
======================================================*/

function Login(){

    /*==============================================
                        EVENTS
    ==============================================*/

    async function handleGoogleLogin(){

        try{

            const provider = new GoogleAuthProvider();

            await signInWithPopup(

                auth,

                provider

            );

        }

        catch(error){

            console.error(error);

        }

    }

    /*==============================================
                        RENDER
    ==============================================*/

    return(

        <section className="login">

            <div className="panel login-panel">

                <h1>THREADLINE</h1>

                <p>

                    Organize Years of Communication

                </p>

                <button

                    className="primary"

                    onClick={handleGoogleLogin}

                >

                    Continue with Google

                </button>

            </div>

        </section>

    );

}

/*======================================================
                        EXPORTS
======================================================*/

export default Login;