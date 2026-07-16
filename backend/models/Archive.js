/*======================================================
                        ARCHIVE
======================================================*/

class Archive {

    constructor(data = {}) {

        this.id = data.id || null;

        this.source = data.source || "";

        this.platform = data.platform || "";

        this.confidence = data.confidence || 0;

        this.imported = data.imported || Date.now();

        this.participants = data.participants || [];

        this.conversations = data.conversations || [];

        this.messages = data.messages || [];

        this.attachments = data.attachments || [];

        this.messageCount = this.messages.length;

        this.conversationCount = this.conversations.length;

    }

}

module.exports = Archive;