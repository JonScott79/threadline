/*
    conversationBuilder.js

    Forensic conversation reconstruction engine for Threadline.
    Reconstructs conversational threads by grouping messages using true thread identifiers,
    counterparties, or participant sets, preserving full two-way dialogues and group chats.
*/

const Conversation = require("../models/Conversation");

/**
 * Resolves the stable conversation grouping key and title for a message.
 */
function resolveConversationKey(message) {
    const meta = message.metadata || {};

    // 1. Explicit thread identifier (e.g. from SMS/MMS thread_id, Messenger thread, or Email thread)
    if (meta.threadId) {
        return {
            key: `thread_${meta.threadId}`,
            title: meta.threadTitle || meta.contact || meta.counterparty || `Thread ${meta.threadId}`
        };
    }

    // 2. Explicit thread title (e.g. Messenger chat name or group title)
    if (meta.threadTitle) {
        return {
            key: `title_${meta.threadTitle.trim().toLowerCase()}`,
            title: meta.threadTitle.trim()
        };
    }

    // 3. Counterparty address / contact (1-on-1 SMS, HTML exports, direct messages)
    if (meta.counterparty) {
        const cp = meta.counterparty.trim();
        const displayTitle = meta.counterpartyName
            ? `${meta.counterpartyName} (${cp})`
            : (meta.contact || cp);
        return {
            key: `counterparty_${cp.toLowerCase()}`,
            title: displayTitle
        };
    }

    // 4. Direction-based counterparty resolution
    if (message.direction === "sent" && message.recipient) {
        const r = message.recipient.trim();
        const displayTitle = meta.contact ? `${meta.contact} (${r})` : r;
        return {
            key: `counterparty_${r.toLowerCase()}`,
            title: displayTitle
        };
    }

    if (message.direction === "received" && message.sender) {
        const s = message.sender.trim();
        const displayTitle = meta.contact ? `${meta.contact} (${s})` : s;
        return {
            key: `counterparty_${s.toLowerCase()}`,
            title: displayTitle
        };
    }

    // 5. Fallback: sender
    const fallback = message.sender || "Unknown";
    return {
        key: `fallback_${fallback.toLowerCase()}`,
        title: fallback
    };
}

/**
 * Reconstructs conversations from a list of normalized messages.
 * 
 * @param {Array<Message>} messages
 * @returns {Array<Conversation>} Reconstructed conversations
 */
function buildConversations(messages) {
    if (!messages || messages.length === 0) {
        return [];
    }

    const convGroups = {};

    messages.forEach(message => {
        const { key, title } = resolveConversationKey(message);

        if (!convGroups[key]) {
            convGroups[key] = {
                title,
                platform: message.platform || "Custom",
                messages: [],
                participantSet: new Set()
            };
        }

        // Keep best display title if updated with richer contact info
        if (title && title !== "Unknown" && convGroups[key].title === "Unknown") {
            convGroups[key].title = title;
        }

        convGroups[key].messages.push(message);

        // Track participants involved
        if (message.sender) convGroups[key].participantSet.add(message.sender);
        if (message.recipient) {
            // Split if recipient contains multiple comma-separated addresses
            const rList = message.recipient.split(",").map(r => r.trim()).filter(Boolean);
            rList.forEach(r => convGroups[key].participantSet.add(r));
        }
        if (message.metadata?.participants && Array.isArray(message.metadata.participants)) {
            message.metadata.participants.forEach(p => convGroups[key].participantSet.add(p));
        }
    });

    const result = [];

    Object.keys(convGroups).forEach(key => {
        const group = convGroups[key];

        // Sort messages chronologically
        group.messages.sort((a, b) => Number(a.timestamp) - Number(b.timestamp));

        const participants = Array.from(group.participantSet).filter(Boolean);
        const firstMessage = group.messages[0];
        const lastMessage = group.messages[group.messages.length - 1];

        const conversation = new Conversation({
            platform: group.platform,
            title: group.title,
            participants,
            messages: group.messages,
            messageCount: group.messages.length,
            firstMessage: firstMessage ? firstMessage.timestamp : null,
            lastMessage: lastMessage ? lastMessage.timestamp : null,
            created: firstMessage ? firstMessage.timestamp : Date.now(),
            updated: lastMessage ? lastMessage.timestamp : Date.now(),
            metadata: {
                groupKey: key
            }
        });

        // Set conversation back-reference on each message
        group.messages.forEach(msg => {
            if (!msg.conversationId) {
                msg.conversationId = conversation.id;
            }
        });

        result.push(conversation);
    });

    // Sort conversations by most recently active
    result.sort((a, b) => (b.updated || 0) - (a.updated || 0));

    return result;
}

module.exports = {
    buildConversations
};
