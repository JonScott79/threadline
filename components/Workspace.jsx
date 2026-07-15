/*======================================================
                        IMPORTS
======================================================*/

import ThreadlineHome from "./ThreadlineHome";
import NewThreadline from "./NewThreadline";
import ThreadlineWorkspace from "./ThreadlineWorkspace";

import { useAuth } from "../auth/AuthProvider";

import { saveThreadline } from "../services/threadlines";


/*======================================================
                        COMPONENT
======================================================*/

function Workspace({

    threadlines,

    setThreadlines,

    currentThreadline,

    setCurrentThreadline,

    creatingThreadline,

    setCreatingThreadline

}){

    /*==============================================
                        STATE
    ==============================================*/

	const {

		user

	} = useAuth();

    /*==============================================
                        RENDER
    ==============================================*/

    return(

        <section className="workspace">

            {

				currentThreadline ?

					<ThreadlineWorkspace

						threadline={currentThreadline}

					/>

                :

                    creatingThreadline ?

                        <NewThreadline

							onCreate={async(threadline)=>{

								try{

									const saved = await saveThreadline(

										user.uid,

										threadline

									);

									setThreadlines(previous=>([

										...previous,

										saved

									]));

									setCurrentThreadline(saved);

									setCreatingThreadline(false);

								}

								catch(error){

									console.error(error);

								}

							}}

                            onCancel={()=>{

                                setCreatingThreadline(false);

                            }}

                        />

                    :

                        <ThreadlineHome

                            onCreate={()=>{

                                setCreatingThreadline(true);

                            }}

                        />

            }

        </section>

    );

}

/*======================================================
                        EXPORTS
======================================================*/

export default Workspace;