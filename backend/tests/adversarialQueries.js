/*
    adversarialQueries.js

    Benchmark Queries with Ground Truth definitions for Step 6 Adversarial Evaluation.
    Covers all 12 query categories requested in Step 6 prompt.
*/

const queries = [
    // 1. Participant + Action Search (Sep. Phrasal Verb)
    {
        id: "Q01",
        category: "Participant + Action",
        query: "Find when Darcy said she would pick me up.",
        expectedEvents: ["August Airport Pickup", "October Concert Ride"],
        expectedMessageSnippets: [
            "I can pick you up from the airport when your flight lands.",
            "I got our concert tickets, picking you up soon!"
        ],
        forbiddenSnippets: [
            "Did you feed the cat yesterday?",
            "Please review the quarterly budget spreadsheet."
        ],
        expectedConvs: ["Darcy"],
        description: "Participant Darcy + action 'pick me up', distinguishing genuine rides from pet noise."
    },

    // 2. Cross-Conversation Action Coordination
    {
        id: "Q02",
        category: "Cross-Conversation Event",
        query: "Find the conversation where Leila and I were trying to figure out transportation.",
        expectedEvents: ["October Concert Planning"],
        expectedMessageSnippets: [
            "Trying to figure out transportation so we don't pay $50 for parking."
        ],
        forbiddenSnippets: [
            "Did you feed the cat yesterday?",
            "Please review the quarterly budget spreadsheet."
        ],
        expectedConvs: ["Leila"],
        description: "Focus on Leila's transportation planning conversation."
    },

    // 3. Repeated-Event Disambiguation (Topic-based across time)
    {
        id: "Q03",
        category: "Repeated-Event Disambiguation",
        query: "When were we talking about the concert?",
        expectedEvents: ["October Rock Concert", "May Jazz Concert"],
        expectedMessageSnippets: [
            "Are you ready for the concert tonight?",
            "That jazz band concert back in May was amazing."
        ],
        forbiddenSnippets: [
            "Did you feed the cat yesterday?",
            "Please review the quarterly budget spreadsheet."
        ],
        expectedConvs: ["Leila", "Darcy", "John", "Alex"],
        description: "Topic search for 'concert' must partition May jazz concert and October rock concert into distinct clusters."
    },

    // 4. Participant + Action / Synonym
    {
        id: "Q04",
        category: "Participant + Action",
        query: "Find the time John mentioned the ride.",
        expectedEvents: ["October Concert Transportation"],
        expectedMessageSnippets: [
            "I can give two people a ride in my truck if needed."
        ],
        forbiddenSnippets: [
            "Did you feed the cat yesterday?",
            "Please review the quarterly budget spreadsheet."
        ],
        expectedConvs: ["John"],
        description: "Participant John + transportation synonym 'ride'."
    },

    // 5. Cross-Conversation Multi-Thread Group Planning
    {
        id: "Q05",
        category: "Cross-Conversation Multi-Thread",
        query: "Show me all the conversations involved in planning the concert.",
        expectedEvents: ["October Rock Concert Coordination"],
        expectedMessageSnippets: [
            "Are you ready for the concert tonight?",
            "I got our concert tickets, picking you up soon!",
            "We are figuring out transportation for everyone to get there.",
            "Who has the passes for the gig tonight?"
        ],
        forbiddenSnippets: [
            "Did you feed the cat yesterday?",
            "Please review the quarterly budget spreadsheet."
        ],
        expectedConvs: ["Leila", "Darcy", "John", "Concert Crew"],
        description: "Should group cross-thread communications across 1-on-1s and group thread."
    },

    // 6. Negative / Canceled Plans
    {
        id: "Q06",
        category: "Negative / Contradictory",
        query: "Find where we decided not to go.",
        expectedEvents: ["Canceled January Aspen Ski Trip"],
        expectedMessageSnippets: [
            "We decided not to go because of the blizzard.",
            "Yeah, totally canceled the trip, safety first."
        ],
        forbiddenSnippets: [
            "Did you feed the cat yesterday?",
            "Please review the quarterly budget spreadsheet."
        ],
        expectedConvs: ["Sarah"],
        description: "Detects cancellation phrasing 'decided not to go' in travel planning."
    },

    // 7. Relative Temporal Search ("after the meeting")
    {
        id: "Q07",
        category: "Relative Temporal",
        query: "Find the conversation where she called me after the meeting.",
        expectedEvents: ["Post-Meeting Follow-up Call"],
        expectedMessageSnippets: [
            "Hey, can I call you real quick right after the meeting?",
            "Thanks for discussing the follow-up items on that call."
        ],
        forbiddenSnippets: [
            "Are you ready for the concert tonight?",
            "Did you feed the cat yesterday?"
        ],
        expectedConvs: ["Rachel"],
        description: "Resolves anchor 'meeting' and finds subsequent communications with Rachel."
    },

    // 8. Cross-Conversation Shared Topic ("discussing the same trip")
    {
        id: "Q08",
        category: "Cross-Conversation Event",
        query: "Find the time they were discussing the same trip.",
        expectedEvents: ["December Colorado Holiday Trip Planning"],
        expectedMessageSnippets: [
            "Yes, we are all discussing the same trip together.",
            "Planning the winter trip again for December holidays!"
        ],
        forbiddenSnippets: [
            "Did you feed the cat yesterday?",
            "Please review the quarterly budget spreadsheet."
        ],
        expectedConvs: ["Marcus", "Sarah"],
        description: "Detects cross-conversation discussion of holiday trip between Sarah and Marcus."
    },

    // 9. Indirect Action Description ("figuring out how everyone was getting there")
    {
        id: "Q09",
        category: "Indirect Event / Action",
        query: "Which conversations were involved in figuring out how everyone was getting there?",
        expectedEvents: ["Concert Transportation Logistics"],
        expectedMessageSnippets: [
            "We are figuring out transportation for everyone to get there.",
            "Sweet! How is everyone getting there?"
        ],
        forbiddenSnippets: [
            "Did you feed the cat yesterday?",
            "Please review the quarterly budget spreadsheet."
        ],
        expectedConvs: ["John", "Concert Crew"],
        description: "Action-based description of transport coordination across John and Group thread."
    },

    // 10. Topic Search: Camping Gear & Outside
    {
        id: "Q10",
        category: "Topic-Based",
        query: "Find messages about camping and the tent.",
        expectedEvents: ["July Camping Trip Preparation"],
        expectedMessageSnippets: [
            "Do you have the tent and sleeping bags for the camping trip?",
            "Got the tent, outside gear, and portable stove ready."
        ],
        forbiddenSnippets: [
            "Are you ready for the concert tonight?",
            "Please review the quarterly budget spreadsheet."
        ],
        expectedConvs: ["Alex"],
        description: "Topic and concept search for camping gear."
    },

    // 11. Participant + Topic Dispute Search
    {
        id: "Q11",
        category: "Participant + Topic",
        query: "Find when David and I had an argument about custody.",
        expectedEvents: ["Custody & Visitation Dispute"],
        expectedMessageSnippets: [
            "We had a loud argument about custody times yesterday.",
            "I am refusing overnight sleepover tonight."
        ],
        forbiddenSnippets: [
            "Are you ready for the concert tonight?",
            "Please review the quarterly budget spreadsheet."
        ],
        expectedConvs: ["David"],
        description: "Participant David with dispute and custody concept."
    },

    // 12. Month Calendar Temporal Search ("in August")
    {
        id: "Q12",
        category: "Approximate Temporal",
        query: "Show me messages from August.",
        expectedEvents: ["August Airport Travel"],
        expectedMessageSnippets: [
            "I can pick you up from the airport when your flight lands.",
            "Your flight reservation #AB1234 is confirmed for August 20."
        ],
        forbiddenSnippets: [
            "Are you ready for the concert tonight?",
            "That jazz band concert back in May was amazing."
        ],
        expectedConvs: ["Darcy", "Travel Bot"],
        description: "Temporal month filter strictly scoping to August 2026."
    }
];

module.exports = queries;
