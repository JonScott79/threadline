/*======================================================
                    CONVERSATION
======================================================*/

class Conversation{

    constructor(data={}){

        this.id = data.id || null;

        this.platform = data.platform || "";

        this.title = data.title || "";

        this.participants = data.participants || [];

        this.messages = data.messages || [];

        this.firstMessage = data.firstMessage || null;

        this.lastMessage = data.lastMessage || null;

    }

}

module.exports = Conversation;