/*======================================================
                        IMPORTS
======================================================*/

import axios from "axios";

/*======================================================
                    UPLOAD ARCHIVE
======================================================*/

export async function uploadArchive(file){

    const formData = new FormData();

    formData.append(

        "archive",

        file

    );

    try{

        const response = await axios.post(

            "http://localhost:3001/api/import",

            formData,

            {

                headers:{

                    "Content-Type":"multipart/form-data"

                }

            }

        );

        console.log(response.data);

        return response.data;

    }

    catch(error){

        console.error(error);

        throw error;

    }

}