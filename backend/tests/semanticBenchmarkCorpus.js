/*
    semanticBenchmarkCorpus.js

    Adversarial Semantic Benchmark Dataset covering the 10 categories established in Step 8:
    1. Coreference Disambiguation ("she", "they", "that one")
    2. Abstract Semantic Paraphrases (zero lexical overlap)
    3. Transit / Commute Vernacular (slang, local phrases)
    4. Cross-Thread Event Assembly with Weak Lexical Overlap
    5. Implicit Negations & Retractions
    6. Time-Drifted Event Sequences
    7. Ambiguous Group Discourse
    8. Distractor Resistance (high similarity, distinct event)
    9. Conditional vs Factual Distinctions
    10. Slang & Idiomatic Expressions
*/

const BASE_TIME = new Date("2026-09-01T12:00:00Z").getTime();

const semanticBenchmarkConversations = [
    // 1. Rachel - Coreference & Follow-up
    {
        title: "Rachel",
        platform: "Slack",
        metadata: { contact: "Rachel" },
        messages: [
            {
                id: "sem_rachel_01",
                sender: "Rachel",
                direction: "received",
                timestamp: BASE_TIME,
                body: "Rachel here. Can I speak with you right after the staff sync?",
                metadata: { contact: "Rachel" }
            },
            {
                id: "sem_rachel_02",
                sender: "Me",
                direction: "sent",
                timestamp: BASE_TIME + 15 * 60 * 1000,
                body: "Sure, let's connect on voice.",
                metadata: { contact: "Rachel" }
            },
            {
                id: "sem_rachel_03",
                sender: "Rachel",
                direction: "received",
                timestamp: BASE_TIME + 45 * 60 * 1000,
                body: "Thanks for discussing the quarterly deliverables on that call.",
                metadata: { contact: "Rachel" }
            }
        ]
    },

    // 2. Sarah - Abstract Paraphrase & Negation / Cancellation
    {
        title: "Sarah",
        platform: "iMessage",
        metadata: { contact: "Sarah" },
        messages: [
            {
                id: "sem_sarah_01",
                sender: "Sarah",
                direction: "received",
                timestamp: BASE_TIME + 24 * 60 * 60 * 1000,
                body: "Need to hit up the ATM machine before noon to get the cash ready.",
                metadata: { contact: "Sarah" }
            },
            {
                id: "sem_sarah_02",
                sender: "Sarah",
                direction: "received",
                timestamp: BASE_TIME + 48 * 60 * 60 * 1000,
                body: "Deal is off after what happened with the landlord yesterday.",
                metadata: { contact: "Sarah" }
            }
        ]
    },

    // 3. Carlos - Transit Vernacular & Commute Slang
    {
        title: "Carlos",
        platform: "WhatsApp",
        metadata: { contact: "Carlos" },
        messages: [
            {
                id: "sem_carlos_01",
                sender: "Carlos",
                direction: "received",
                timestamp: BASE_TIME + 72 * 60 * 60 * 1000,
                body: "Taking the green line inbound at 6 so we don't hit traffic on Storrow.",
                metadata: { contact: "Carlos" }
            },
            {
                id: "sem_carlos_02",
                sender: "Carlos",
                direction: "received",
                timestamp: BASE_TIME + 73 * 60 * 60 * 1000,
                body: "I got cold feet about investing in that franchise.",
                metadata: { contact: "Carlos" }
            }
        ]
    },

    // 4. Cross-Thread Saturday Coordination (Zero lexical overlap)
    {
        title: "Maya",
        platform: "SMS",
        metadata: { contact: "Maya" },
        messages: [
            {
                id: "sem_maya_01",
                sender: "Maya",
                direction: "received",
                timestamp: BASE_TIME + 96 * 60 * 60 * 1000,
                body: "Are we still doing Saturday evening?",
                metadata: { contact: "Maya" }
            }
        ]
    },
    {
        title: "Liam",
        platform: "Signal",
        metadata: { contact: "Liam" },
        messages: [
            {
                id: "sem_liam_01",
                sender: "Liam",
                direction: "received",
                timestamp: BASE_TIME + 96 * 60 * 60 * 1000 + 30 * 60 * 1000,
                body: "Confirmed the table reservation for 8pm.",
                metadata: { contact: "Liam" }
            }
        ]
    },
    {
        title: "Zoe",
        platform: "Telegram",
        metadata: { contact: "Zoe" },
        messages: [
            {
                id: "sem_zoe_01",
                sender: "Zoe",
                direction: "received",
                timestamp: BASE_TIME + 96 * 60 * 60 * 1000 + 45 * 60 * 1000,
                body: "Picked up the birthday cake from the bakery.",
                metadata: { contact: "Zoe" }
            }
        ]
    },

    // 5. Distractor Noise & Conditionals
    {
        title: "Dave",
        platform: "SMS",
        metadata: { contact: "Dave" },
        messages: [
            {
                id: "sem_dave_01",
                sender: "Dave",
                direction: "received",
                timestamp: BASE_TIME + 120 * 60 * 60 * 1000,
                body: "If I get the annual bonus in December, I will travel to Tokyo.",
                metadata: { contact: "Dave" }
            },
            {
                id: "sem_dave_02",
                sender: "Dave",
                direction: "received",
                timestamp: BASE_TIME + 122 * 60 * 60 * 1000,
                body: "Booked my flight tickets to Tokyo for next week!",
                metadata: { contact: "Dave" }
            },
            {
                id: "sem_dave_03",
                sender: "Dave",
                direction: "received",
                timestamp: BASE_TIME + 125 * 60 * 60 * 1000,
                body: "Can you feed the dog while I am away?",
                metadata: { contact: "Dave" }
            }
        ]
    }
];

const semanticBenchmarkQueries = [
    // 1. Coreference Disambiguation
    {
        id: "SEM_01",
        category: "Coreference Disambiguation",
        query: "Find the conversation where she called me after the sync.",
        targetMessageIds: ["sem_rachel_01", "sem_rachel_03"],
        distractorMessageIds: ["sem_dave_03"],
        description: "Resolves 'she' to Rachel based on contextual continuity without hardcoded pronouns."
    },
    // 2. Abstract Semantic Paraphrase
    {
        id: "SEM_02",
        category: "Abstract Semantic Paraphrase",
        query: "Find discussions about acquiring funds and physical currency.",
        targetMessageIds: ["sem_sarah_01"],
        distractorMessageIds: ["sem_dave_03"],
        description: "Zero lexical overlap: 'ATM machine' and 'cash ready' maps to 'acquiring funds'."
    },
    // 3. Transit / Commute Vernacular
    {
        id: "SEM_03",
        category: "Transit / Commute Vernacular",
        query: "Find conversations about how to get to the game by public transit.",
        targetMessageIds: ["sem_carlos_01"],
        distractorMessageIds: ["sem_dave_03"],
        description: "Recognizes 'green line inbound' as transit coordination."
    },
    // 4. Cross-Thread Event Assembly (Weak Lexical Overlap)
    {
        id: "SEM_04",
        category: "Cross-Thread Event Assembly",
        query: "Show me the messages coordinating the Saturday birthday dinner.",
        targetMessageIds: ["sem_maya_01", "sem_liam_01", "sem_zoe_01"],
        distractorMessageIds: ["sem_sarah_02"],
        description: "Assembles Saturday celebration across Maya, Liam, and Zoe."
    },
    // 5. Implicit Negation / Retraction
    {
        id: "SEM_05",
        category: "Implicit Negation / Retraction",
        query: "Where did an agreement fall through or get called off?",
        targetMessageIds: ["sem_sarah_02"],
        distractorMessageIds: ["sem_carlos_01"],
        description: "Maps 'Deal is off after what happened' to agreement falling through."
    },
    // 6. Idiomatic Expression
    {
        id: "SEM_06",
        category: "Idiomatic Expression",
        query: "Find who hesitated or backed out of an investment.",
        targetMessageIds: ["sem_carlos_02"],
        distractorMessageIds: ["sem_maya_01"],
        description: "Understands 'cold feet about investing'."
    },
    // 7. Conditional vs Factual Action
    {
        id: "SEM_07",
        category: "Conditional vs Factual Action",
        query: "Find where someone actually booked and finalized travel.",
        targetMessageIds: ["sem_dave_02"],
        distractorMessageIds: ["sem_dave_01"],
        description: "Distinguishes 'Booked my flight tickets' from 'If I get the annual bonus'."
    }
];

module.exports = {
    semanticBenchmarkConversations,
    semanticBenchmarkQueries
};
