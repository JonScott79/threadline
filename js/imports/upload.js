/*======================================================
                        IMPORTS
======================================================*/

import axios from "axios";
import { API_BASE_URL } from "../../src/apiConfig";

/*======================================================
                    UPLOAD ARCHIVE
======================================================*/

export async function uploadArchive(file, user, threadlineId = null){

    const formData = new FormData();

    formData.append(
        "archive",
        file
    );

    formData.append(
        "uid",
        user.uid
    );

    if (threadlineId) {
        formData.append("threadlineId", threadlineId);
    }

    try{
        const response = await axios.post(
            `${API_BASE_URL}/import`,
            formData,
            {
                headers:{
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

/*======================================================
                    PASTE ARCHIVE TEXT
======================================================*/

export async function pasteArchiveText(text, title, user, threadlineId = null){

    try{
        const response = await axios.post(
            `${API_BASE_URL}/import/paste`,
            {
                text,
                title,
                threadlineId
            },
            {
                headers:{
                    "x-user-uid": user.uid
                }
            }
        );

        console.log(response.data);
        return response.data;
    }

    catch(error){
        console.error("Paste archive error:", error);
        throw error;
    }

}
