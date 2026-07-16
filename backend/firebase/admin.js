/*======================================================
                        IMPORTS
======================================================*/

const { initializeApp, cert } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");

const serviceAccount = require("./serviceAccount.json");

/*======================================================
                    INITIALIZE
======================================================*/

initializeApp({

    credential: cert(serviceAccount)

});

/*======================================================
                    FIRESTORE
======================================================*/

const db = getFirestore();

/*======================================================
                    EXPORTS
======================================================*/

module.exports = {

    db

};