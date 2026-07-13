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

/*======================================================
                    DRAG ENTER
======================================================*/

export function handleDragEnter(event){

    event.preventDefault();

}

/*======================================================
                    DRAG LEAVE
======================================================*/

export function handleDragLeave(event){

    event.preventDefault();

}

/*======================================================
                    DROP
======================================================*/

export async function handleDrop(event){

    event.preventDefault();

    const file = event.dataTransfer.files[0];

    if(!file){

        return;

    }

    try{

        const response = await uploadArchive(file);

        console.table(response);

    }

    catch(error){

        console.error(error);

    }

}

/*======================================================
                    FILE BROWSER
======================================================*/

export async function handleBrowse(event){

    const file = event.target.files[0];

    if(!file){

        return;

    }

    try{

        const response = await uploadArchive(file);

        console.table(response);

    }

    catch(error){

        console.error(error);

    }

}