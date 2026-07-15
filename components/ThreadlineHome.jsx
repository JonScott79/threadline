/*======================================================
                        COMPONENT
======================================================*/

function NewThreadline({

    onCreate,

    onCancel

}){

    return(

        <section className="panel">

            <h2>

                New Threadline

            </h2>

            <p>

                Give your Threadline a name.

            </p>

            <input

                className="input"

                placeholder="Ex: Darcy Scott"

            />

            <div className="buttons">

                <button

                    className="button primary"

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