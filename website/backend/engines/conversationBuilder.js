/*======================================================
                    IMPORTS
======================================================*/

const Conversation = require("../models/Conversation");

/*======================================================
                BUILD CONVERSATIONS
======================================================*/

function buildConversations(messages){

    const conversations = {};

    for(const message of messages){

        const key = message.sender;

        if(!conversations[key]){

            conversations[key] = new Conversation({

                title:key,

                platform:message.platform

            });

        }

        conversations[key].messages.push(message);

    }

    return Object.values(conversations);

}

/*======================================================
                    EXPORTS
======================================================*/

module.exports = {

    buildConversations

};