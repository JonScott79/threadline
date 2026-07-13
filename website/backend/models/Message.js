/*======================================================
                        MESSAGE
======================================================*/

class Message{

    constructor(data={}){

        this.id = data.id || null;

        this.conversationId = data.conversationId || null;

        this.platform = data.platform || "";

        this.direction = data.direction || "";

        this.sender = data.sender || "";

        this.recipient = data.recipient || "";

        this.timestamp = data.timestamp || 0;

        this.body = data.body || "";

        this.attachments = data.attachments || [];

        this.metadata = data.metadata || {};

    }

}

module.exports = Message;