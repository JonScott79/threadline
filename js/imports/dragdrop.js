/*======================================================
                        IMPORTS
======================================================*/

import { uploadArchive } from "./upload";

/*======================================================
                    DRAG EVENTS
======================================================*/

export function handleDragOver(event){

    event.preventDefault();

}

export function handleDragEnter(event){

    event.preventDefault();

}

export function handleDragLeave(event){

    event.preventDefault();

}

/*======================================================
                    DROP
======================================================*/

export async function handleDrop(

    event,

    user,

    setImportResult

){

    event.preventDefault();

    const file = event.dataTransfer.files[0];

    if(!file){

        return;

    }

    try{

        const response = await uploadArchive(

            file,

            user

        );

        setImportResult(response);

    }

    catch(error){

        console.error(error);

    }

}

/*======================================================
                    FILE BROWSER
======================================================*/

export async function handleBrowse(

    event,

    user,

    setImportResult

){

    const file = event.target.files[0];

    if(!file){

        return;

    }

    try{

        const response = await uploadArchive(

            file,

            user

        );

        setImportResult(response);

    }

    catch(error){

        console.error(error);

    }

}