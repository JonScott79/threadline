/*======================================================
                    CONVERSATION
======================================================*/

class Conversation {

    constructor(data = {}) {

        this.id = data.id || null;

        this.platform = data.platform || "";

        this.title = data.title || "";

        this.participants = data.participants || [];

        this.messages = data.messages || [];

        this.messageCount = data.messageCount || 0;

        this.firstMessage = data.firstMessage || null;

        this.lastMessage = data.lastMessage || null;

        this.created = data.created || Date.now();

        this.updated = data.updated || Date.now();

    }

}

module.exports = Conversation;