/*======================================================
                        IMPORTS
======================================================*/

import {

    collection,
    addDoc,
    getDocs,
    deleteDoc,
    doc,
    updateDoc

} from "firebase/firestore";

import { db } from "../auth/firebase";

/*======================================================
                SAVE THREADLINE
======================================================*/

export async function saveThreadline(

    uid,

    threadline

){

    const reference = collection(

        db,

        "users",

        uid,

        "threadlines"

    );

    const document = await addDoc(

        reference,

        threadline

    );

    return{

        ...threadline,

        firestoreId: document.id

    };

}

/*======================================================
                LOAD THREADLINES
======================================================*/

export async function loadThreadlines(

    uid

){

    const reference = collection(

        db,

        "users",

        uid,

        "threadlines"

    );

    const snapshot = await getDocs(reference);

    return snapshot.docs.map(document=>({

        firestoreId: document.id,

        ...document.data()

    }));

}

/*======================================================
                UPDATE THREADLINE
======================================================*/

export async function updateThreadline(

    uid,

    threadline

){

    const reference = doc(

        db,

        "users",

        uid,

        "threadlines",

        threadline.firestoreId

    );

    await updateDoc(reference,threadline);

}

/*======================================================
                DELETE THREADLINE
======================================================*/

export async function deleteThreadline(

    uid,

    firestoreId

){

    const reference = doc(

        db,

        "users",

        uid,

        "threadlines",

        firestoreId

    );

    await deleteDoc(reference);

}