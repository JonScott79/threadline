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

		<section className="welcome">

			<div className="panel hero">

				<h1>

					THREADLINE

				</h1>

				<h2>

					Every conversation has a timeline.

				</h2>

				<p>

					Organize years of communication into one searchable timeline.

				</p>

				<div className="buttons">

					<button

						className="button primary"

						onClick={handleGoogleLogin}

					>

						Continue with Google

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