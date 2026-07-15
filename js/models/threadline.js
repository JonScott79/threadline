/*======================================================
                    THREADLINE MODEL
======================================================*/

export function createThreadline({

    title = "",

    person = "",

    description = ""

}){

    const now = new Date().toISOString();

    return{

        id: crypto.randomUUID(),

        title,

        person,

        description,

        created: now,

        updated: now,

        ownerUid: null,

        imports: [],

        conversations: [],

        timeline: []

    };

}