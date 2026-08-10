/*======================================================
                        IMPORTS
======================================================*/

import axios from "axios";
import { API_BASE_URL } from "../../src/apiConfig";

/*======================================================
                    UPLOAD ARCHIVE
======================================================*/

export async function uploadArchive(file, user){

    const formData = new FormData();

    formData.append(
        "archive",
        file
    );

    formData.append(
        "uid",
        user.uid
    );

    try{
        const response = await axios.post(
            `${API_BASE_URL}/import`,
            formData,
            {
                headers:{
                    "Content-Type":"multipart/form-data",
                    "x-user-uid": user.uid
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