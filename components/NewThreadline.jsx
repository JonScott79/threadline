/*======================================================
                        IMPORTS
======================================================*/

import { useState } from "react";
import { createThreadline } from "../js/models/threadline";

/*======================================================
                        COMPONENT
======================================================*/

function NewThreadline({

    onCancel,

    onCreate

}){

    /*==============================================
                        STATE
    ==============================================*/

    const [title,setTitle] = useState("");

    const [description,setDescription] = useState("");

    /*==============================================
                        EVENTS
    ==============================================*/

    function handleCreate(){

		onCreate(

			createThreadline({

				title,

				description

			})

		);

    }

    /*==============================================
                        RENDER
    ==============================================*/

    return(

        <section className="panel">

            <h2>

                New Threadline

            </h2>

            <p>

                Create a Threadline to organize conversations.

            </p>

            <input

                className="input"

                placeholder="Threadline Name"

                value={title}

                onChange={(event)=>

                    setTitle(event.target.value)

                }

            />

            <textarea

                className="input"

                rows="5"

                placeholder="Description (optional)"

                value={description}

                onChange={(event)=>

                    setDescription(event.target.value)

                }

            />

            <div className="buttons">

                <button

                    className="button primary"

                    onClick={handleCreate}

                >

                    Create Threadline

                </button>

                <button

                    className="button secondary"

                    onClick={onCancel}

                >

                    Cancel

                </button>

            </div>

        </section>

    );

}

/*======================================================
                        EXPORTS
======================================================*/

export default NewThreadline;