/*======================================================
                        IMPORTS
======================================================*/

import { auth } from "../auth/firebase";
import { useAuth } from "../auth/AuthProvider";

import {

    GoogleAuthProvider,

    signInWithPopup

} from "firebase/auth";

/*======================================================
                        COMPONENT
======================================================*/

function Login(){

    const { loginAsLocalGuest } = useAuth();

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

		<section className="welcome">

			<div className="panel hero">
				<div style={{ marginBottom: "22px", display: "flex", justifyContent: "center", width: "100%" }}>
					<img 
						src="/logo-2.png" 
						alt="THREADLINE by LANZAR" 
						style={{ 
							width: "100%", 
							maxWidth: "320px", 
							height: "auto", 
							borderRadius: "32px",
							boxShadow: "0 18px 48px rgba(0, 0, 0, 0.75), 0 0 35px rgba(63, 216, 255, 0.22)",
							border: "1px solid rgba(255, 255, 255, 0.08)",
							display: "block"
						}} 
					/>
				</div>

				<h2>

					Every conversation has a timeline.

				</h2>

				<p>

					Organize years of communication into one searchable timeline.

				</p>

				<div className="buttons">

					<button

						className="button primary"

						onClick={loginAsLocalGuest}

					>

						Use Local Mode (Offline)

					</button>

					<button

						className="button secondary"

						onClick={handleGoogleLogin}

					>

						Sign in with Google

					</button>

				</div>

				<div className="buttons">

					<button

						className="button secondary"

						disabled

					>

						Continue with Microsoft

					</button>

					<button

						className="button secondary"

						disabled

					>

						Continue with Apple

					</button>

					<button

						className="button secondary"

						disabled

					>

						Continue with Email

					</button>

				</div>

			</div>

		</section>

	);

}

/*======================================================
                        EXPORTS
======================================================*/

export default Login;