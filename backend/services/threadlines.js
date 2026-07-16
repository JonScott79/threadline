/*======================================================
                        IMPORTS
======================================================*/

const { db } = require("../firebase/admin");

const {

    FieldValue

} = require("firebase-admin/firestore");

const { commitInBatches } = require("./batchWriter");

/*======================================================
                CREATE THREADLINE
======================================================*/

async function createThreadline(uid, archive){

    console.log("");
    console.log("==========================================");
    console.log("CREATE THREADLINE");
    console.log("==========================================");
    console.log("UID:", uid);
    console.log("Source:", archive.source);
    console.log("Messages:", archive.messageCount);
    console.log("Conversations:", archive.conversationCount);

    const threadlineRef = db

        .collection("users")

        .doc(uid)

        .collection("threadlines")

        .doc();

    console.log("Threadline ID:", threadlineRef.id);

    await threadlineRef.set({

        name: archive.source,

        source: archive.source,

        platform: archive.platform,

        created: FieldValue.serverTimestamp(),

        updated: FieldValue.serverTimestamp(),

        messageCount: archive.messageCount,

        conversationCount: archive.conversationCount

    });

    console.log("✓ Metadata written.");

    const writes = [];

    /*==================================================
                    CONVERSATIONS
    ==================================================*/

    archive.conversations.forEach(conversation=>{

        const ref = threadlineRef

            .collection("conversations")

            .doc();

        writes.push({

            ref,

            data: conversation

        });

    });

    console.log("Conversation writes:", archive.conversations.length);

    /*==================================================
                        MESSAGES
    ==================================================*/

    archive.messages.forEach(message=>{

        const ref = threadlineRef

            .collection("messages")

            .doc();

        writes.push({

            ref,

            data: message

        });

    });

    console.log("Message writes:", archive.messages.length);
    console.log("Total writes:", writes.length);

    console.log("Beginning batch commit...");

    await commitInBatches(writes);

    console.log("✓ Batch commit complete.");
    console.log("==========================================");
    console.log("");

    return threadlineRef.id;

}

/*======================================================
                GET THREADLINES
======================================================*/

async function getThreadlines(uid){

    const snapshot = await db

        .collection("users")

        .doc(uid)

        .collection("threadlines")

        .orderBy("updated","desc")

        .get();

    return snapshot.docs.map(doc=>({

        id: doc.id,

        ...doc.data()

    }));

}

/*======================================================
                GET THREADLINE
======================================================*/

async function getThreadline(uid,id){

    const snapshot = await db

        .collection("users")

        .doc(uid)

        .collection("threadlines")

        .doc(id)

        .get();

    if(!snapshot.exists){

        return null;

    }

    return{

        id: snapshot.id,

        ...snapshot.data()

    };

}

/*======================================================
                DELETE THREADLINE
======================================================*/

async function deleteThreadline(uid,id){

    await db

        .collection("users")

        .doc(uid)

        .collection("threadlines")

        .doc(id)

        .delete();

}

/*======================================================
                    EXPORTS
======================================================*/

module.exports={

    createThreadline,

    getThreadlines,

    getThreadline,

    deleteThreadline

};