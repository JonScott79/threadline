/*======================================================
                    IMPORTS
======================================================*/

const { db } = require("../firebase/admin");

/*======================================================
                SERIALIZE
======================================================*/

function serialize(data){

    return JSON.parse(

        JSON.stringify(data)

    );

}

/*======================================================
                BATCH WRITER
======================================================*/

async function commitInBatches(writes){

    let batch = db.batch();

    let count = 0;

    for(const write of writes){

        batch.set(

            write.ref,

            serialize(write.data)

        );

        count++;

        if(count === 500){

            console.log("✓ Committing batch...");

            await batch.commit();

            batch = db.batch();

            count = 0;

        }

    }

    if(count > 0){

        console.log("✓ Final batch commit...");

        await batch.commit();

    }

}

/*======================================================
                    EXPORTS
======================================================*/

module.exports = {

    commitInBatches

};