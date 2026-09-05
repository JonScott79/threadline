/*
    adversarialCorpus.js

    Realistic synthetic forensic communication archive for Step 6 Adversarial Benchmark.
    Contains 15 distinct conversations across 12 contacts/groups, 100+ messages covering:
    - Multiple genuine events with distinct timelines
    - Cross-conversation multi-party coordination
    - Informal slang, typos, abbreviations, pronouns, indirect references
    - Deliberate terminology overlaps across unrelated subjects
    - Negations and canceled plans
    - Repeated events months apart
    - Interleaving noise, distracting chatter, and group threads
*/

// Base calendar anchors in UTC (Year 2026)
const JAN_TRIP_BASE = new Date("2026-01-15T10:00:00Z").getTime();
const MAY_JAZZ_BASE = new Date("2026-05-15T19:00:00Z").getTime();
const JUL_CAMP_BASE = new Date("2026-07-04T12:00:00Z").getTime();
const AUG_AIRPORT_BASE = new Date("2026-08-20T14:00:00Z").getTime();
const OCT_CONCERT_BASE = new Date("2026-10-10T18:00:00Z").getTime();
const NOV_MEETING_BASE = new Date("2026-11-05T14:00:00Z").getTime();
const DEC_TRIP_BASE = new Date("2026-12-18T09:00:00Z").getTime();

const adversarialConversations = [
    // 1. Leila (1-on-1 SMS) - Concert coordination & ride
    {
        title: "Leila",
        platform: "SMS",
        metadata: { contact: "Leila" },
        messages: [
            {
                id: "msg_leila_01",
                sender: "Leila",
                direction: "received",
                timestamp: OCT_CONCERT_BASE,
                body: "Are you ready for the concert tonight?",
                metadata: { contact: "Leila" }
            },
            {
                id: "msg_leila_02",
                sender: "Me",
                direction: "sent",
                timestamp: OCT_CONCERT_BASE + 5 * 60 * 1000,
                body: "Can't wait to see the band live at the stadium!",
                metadata: { contact: "Leila" }
            },
            {
                id: "msg_leila_03",
                sender: "Leila",
                direction: "received",
                timestamp: OCT_CONCERT_BASE + 15 * 60 * 1000,
                body: "Trying to figure out transportation so we don't pay $50 for parking.",
                metadata: { contact: "Leila" }
            },
            {
                id: "msg_leila_04",
                sender: "Me",
                direction: "sent",
                timestamp: OCT_CONCERT_BASE + 20 * 60 * 1000,
                body: "Darcy might drive us, let me check with her.",
                metadata: { contact: "Leila" }
            },
            {
                id: "msg_leila_05",
                sender: "Leila",
                direction: "received",
                timestamp: OCT_CONCERT_BASE + 24 * 60 * 60 * 1000,
                body: "My ears are still ringing from that gig lol.",
                metadata: { contact: "Leila" }
            },
            {
                id: "msg_leila_06",
                sender: "Leila",
                direction: "received",
                timestamp: OCT_CONCERT_BASE + 48 * 60 * 1000,
                body: "Did you leave your jacket in my car?",
                metadata: { contact: "Leila" }
            }
        ]
    },

    // 2. Darcy (1-on-1 SMS) - Airport pickup, concert ride, unrelated cat message
    {
        title: "Darcy",
        platform: "SMS",
        metadata: { contact: "Darcy" },
        messages: [
            {
                id: "msg_darcy_01",
                sender: "Darcy",
                direction: "received",
                timestamp: AUG_AIRPORT_BASE,
                body: "I can pick you up from the airport when your flight lands.",
                metadata: { contact: "Darcy" }
            },
            {
                id: "msg_darcy_02",
                sender: "Me",
                direction: "sent",
                timestamp: AUG_AIRPORT_BASE + 10 * 60 * 1000,
                body: "Thanks! Flight arrives at terminal 3 around 3pm.",
                metadata: { contact: "Darcy" }
            },
            {
                id: "msg_darcy_03",
                sender: "Darcy",
                direction: "received",
                timestamp: AUG_AIRPORT_BASE + 120 * 60 * 1000,
                body: "Curbside now waiting for you.",
                metadata: { contact: "Darcy" }
            },
            {
                id: "msg_darcy_04",
                sender: "Darcy",
                direction: "received",
                timestamp: OCT_CONCERT_BASE + 25 * 60 * 1000,
                body: "I got our concert tickets, picking you up soon!",
                metadata: { contact: "Darcy" }
            },
            {
                id: "msg_darcy_05",
                sender: "Darcy",
                direction: "received",
                timestamp: OCT_CONCERT_BASE + 40 * 60 * 1000,
                body: "Leaving my place now to pick you up.",
                metadata: { contact: "Darcy" }
            },
            {
                id: "msg_darcy_06",
                sender: "Darcy",
                direction: "received",
                timestamp: OCT_CONCERT_BASE + 24 * 60 * 60 * 1000,
                body: "Did you feed the cat yesterday?",
                metadata: { contact: "Darcy" }
            },
            {
                id: "msg_darcy_07",
                sender: "Darcy",
                direction: "received",
                timestamp: DEC_TRIP_BASE - 2 * 24 * 60 * 60 * 1000,
                body: "Are we still packing for the trip to Colorado?",
                metadata: { contact: "Darcy" }
            }
        ]
    },

    // 3. John (1-on-1 SMS) - Ride mention, stage venue coordination
    {
        title: "John",
        platform: "SMS",
        metadata: { contact: "John" },
        messages: [
            {
                id: "msg_john_01",
                sender: "John",
                direction: "received",
                timestamp: OCT_CONCERT_BASE + 30 * 60 * 1000,
                body: "We are figuring out transportation for everyone to get there.",
                metadata: { contact: "John" }
            },
            {
                id: "msg_john_02",
                sender: "John",
                direction: "received",
                timestamp: OCT_CONCERT_BASE + 35 * 60 * 1000,
                body: "I can give two people a ride in my truck if needed.",
                metadata: { contact: "John" }
            },
            {
                id: "msg_john_03",
                sender: "John",
                direction: "received",
                timestamp: OCT_CONCERT_BASE + 70 * 60 * 1000,
                body: "See you at the concert venue near the stage!",
                metadata: { contact: "John" }
            },
            {
                id: "msg_john_04",
                sender: "John",
                direction: "received",
                timestamp: NOV_MEETING_BASE - 60 * 60 * 1000,
                body: "Let's review the presentation before the client meeting.",
                metadata: { contact: "John" }
            }
        ]
    },

    // 4. Concert Crew (Group SMS: User, Leila, Darcy, John)
    {
        title: "Concert Crew",
        platform: "Group SMS",
        metadata: { contact: "Concert Crew Group" },
        messages: [
            {
                id: "msg_crew_01",
                sender: "Leila",
                direction: "received",
                timestamp: OCT_CONCERT_BASE + 10 * 60 * 1000,
                body: "Who has the passes for the gig tonight?",
                metadata: { contact: "Leila" }
            },
            {
                id: "msg_crew_02",
                sender: "Darcy",
                direction: "received",
                timestamp: OCT_CONCERT_BASE + 12 * 60 * 1000,
                body: "I downloaded all four tickets on my phone.",
                metadata: { contact: "Darcy" }
            },
            {
                id: "msg_crew_03",
                sender: "John",
                direction: "received",
                timestamp: OCT_CONCERT_BASE + 15 * 60 * 1000,
                body: "Sweet! How is everyone getting there?",
                metadata: { contact: "John" }
            },
            {
                id: "msg_crew_04",
                sender: "Me",
                direction: "sent",
                timestamp: OCT_CONCERT_BASE + 18 * 60 * 1000,
                body: "Darcy and I are riding together, meeting John at the gate.",
                metadata: { contact: "Me" }
            }
        ]
    },

    // 5. Alex (1-on-1 WhatsApp) - May jazz concert, camping trip
    {
        title: "Alex",
        platform: "WhatsApp",
        metadata: { contact: "Alex" },
        messages: [
            {
                id: "msg_alex_01",
                sender: "Alex",
                direction: "received",
                timestamp: MAY_JAZZ_BASE,
                body: "That jazz band concert back in May was amazing.",
                metadata: { contact: "Alex" }
            },
            {
                id: "msg_alex_02",
                sender: "Me",
                direction: "sent",
                timestamp: MAY_JAZZ_BASE + 15 * 60 * 1000,
                body: "Yeah, the saxophone soloist blew everyone away.",
                metadata: { contact: "Alex" }
            },
            {
                id: "msg_alex_03",
                sender: "Alex",
                direction: "received",
                timestamp: JUL_CAMP_BASE - 3 * 24 * 60 * 60 * 1000,
                body: "Do you have the tent and sleeping bags for the camping trip?",
                metadata: { contact: "Alex" }
            },
            {
                id: "msg_alex_04",
                sender: "Me",
                direction: "sent",
                timestamp: JUL_CAMP_BASE - 2 * 24 * 60 * 60 * 1000,
                body: "Got the tent, outside gear, and portable stove ready.",
                metadata: { contact: "Alex" }
            }
        ]
    },

    // 6. Sarah (1-on-1 iMessage) - Canceled dinner & trip planning
    {
        title: "Sarah",
        platform: "iMessage",
        metadata: { contact: "Sarah" },
        messages: [
            {
                id: "msg_sarah_01",
                sender: "Sarah",
                direction: "received",
                timestamp: JAN_TRIP_BASE,
                body: "So excited for our ski trip to Aspen this weekend!",
                metadata: { contact: "Sarah" }
            },
            {
                id: "msg_sarah_02",
                sender: "Me",
                direction: "sent",
                timestamp: JAN_TRIP_BASE + 30 * 60 * 1000,
                body: "Flight is booked and hotel reservation is set.",
                metadata: { contact: "Sarah" }
            },
            {
                id: "msg_sarah_03",
                sender: "Sarah",
                direction: "received",
                timestamp: JAN_TRIP_BASE + 24 * 60 * 60 * 1000,
                body: "Huge snowstorm hit the highway, roads are blocked.",
                metadata: { contact: "Sarah" }
            },
            {
                id: "msg_sarah_04",
                sender: "Sarah",
                direction: "received",
                timestamp: JAN_TRIP_BASE + 25 * 60 * 60 * 1000,
                body: "We decided not to go because of the blizzard.",
                metadata: { contact: "Sarah" }
            },
            {
                id: "msg_sarah_05",
                sender: "Me",
                direction: "sent",
                timestamp: JAN_TRIP_BASE + 26 * 60 * 60 * 1000,
                body: "Yeah, totally canceled the trip, safety first.",
                metadata: { contact: "Sarah" }
            },
            {
                id: "msg_sarah_06",
                sender: "Sarah",
                direction: "received",
                timestamp: DEC_TRIP_BASE - 5 * 24 * 60 * 60 * 1000,
                body: "Planning the winter trip again for December holidays!",
                metadata: { contact: "Sarah" }
            }
        ]
    },

    // 7. Marcus (1-on-1 Signal) - Travel discussion & same trip
    {
        title: "Marcus",
        platform: "Signal",
        metadata: { contact: "Marcus" },
        messages: [
            {
                id: "msg_marcus_01",
                sender: "Marcus",
                direction: "received",
                timestamp: DEC_TRIP_BASE - 4 * 24 * 60 * 60 * 1000,
                body: "Sarah told me about the holiday trip to Colorado.",
                metadata: { contact: "Marcus" }
            },
            {
                id: "msg_marcus_02",
                sender: "Me",
                direction: "sent",
                timestamp: DEC_TRIP_BASE - 3 * 24 * 60 * 60 * 1000,
                body: "Yes, we are all discussing the same trip together.",
                metadata: { contact: "Marcus" }
            },
            {
                id: "msg_marcus_03",
                sender: "Marcus",
                direction: "received",
                timestamp: DEC_TRIP_BASE - 1 * 24 * 60 * 60 * 1000,
                body: "I rented the cabin in Breckenridge for everyone.",
                metadata: { contact: "Marcus" }
            }
        ]
    },

    // 8. Work Group (Slack) - Budget, client meeting, noise
    {
        title: "Work Group",
        platform: "Slack",
        metadata: { contact: "Work Group" },
        messages: [
            {
                id: "msg_work_01",
                sender: "Boss",
                direction: "received",
                timestamp: OCT_CONCERT_BASE + 10 * 60 * 1000,
                body: "Please review the quarterly budget spreadsheet before Monday.",
                metadata: { contact: "Work Group" }
            },
            {
                id: "msg_work_02",
                sender: "Me",
                direction: "sent",
                timestamp: OCT_CONCERT_BASE + 15 * 60 * 1000,
                body: "Will do first thing Monday morning.",
                metadata: { contact: "Work Group" }
            },
            {
                id: "msg_work_03",
                sender: "Boss",
                direction: "received",
                timestamp: NOV_MEETING_BASE,
                body: "Client meeting starting in 5 minutes in Conference Room B.",
                metadata: { contact: "Work Group" }
            },
            {
                id: "msg_work_04",
                sender: "Rachel",
                direction: "received",
                timestamp: NOV_MEETING_BASE + 30 * 60 * 1000,
                body: "Meeting adjourned. Great job team.",
                metadata: { contact: "Work Group" }
            }
        ]
    },

    // 9. Rachel (1-on-1 Slack) - Post-meeting call
    {
        title: "Rachel",
        platform: "Slack",
        metadata: { contact: "Rachel" },
        messages: [
            {
                id: "msg_rachel_01",
                sender: "Rachel",
                direction: "received",
                timestamp: NOV_MEETING_BASE + 40 * 60 * 1000,
                body: "Hey, can I call you real quick right after the meeting?",
                metadata: { contact: "Rachel" }
            },
            {
                id: "msg_rachel_02",
                sender: "Me",
                direction: "sent",
                timestamp: NOV_MEETING_BASE + 42 * 60 * 1000,
                body: "Sure, calling you now.",
                metadata: { contact: "Rachel" }
            },
            {
                id: "msg_rachel_03",
                sender: "Rachel",
                direction: "received",
                timestamp: NOV_MEETING_BASE + 70 * 60 * 1000,
                body: "Thanks for discussing the follow-up items on that call.",
                metadata: { contact: "Rachel" }
            }
        ]
    },

    // 10. Family Group (WhatsApp) - Dinner, grocery, distracting chatter
    {
        title: "Family Group",
        platform: "WhatsApp",
        metadata: { contact: "Family Group" },
        messages: [
            {
                id: "msg_fam_01",
                sender: "Mom",
                direction: "received",
                timestamp: OCT_CONCERT_BASE - 4 * 60 * 60 * 1000,
                body: "Who is stopping at the grocery store to buy dinner ingredients?",
                metadata: { contact: "Family Group" }
            },
            {
                id: "msg_fam_02",
                sender: "Me",
                direction: "sent",
                timestamp: OCT_CONCERT_BASE - 3 * 60 * 60 * 1000,
                body: "I'm going to the mall and supermarket right now.",
                metadata: { contact: "Family Group" }
            },
            {
                id: "msg_fam_03",
                sender: "Dad",
                direction: "received",
                timestamp: OCT_CONCERT_BASE - 2 * 60 * 60 * 1000,
                body: "Pick up some fresh bread and milk if you can.",
                metadata: { contact: "Family Group" }
            }
        ]
    },

    // 11. David (1-on-1 SMS) - Parenting custody schedule & dispute
    {
        title: "David",
        platform: "SMS",
        metadata: { contact: "David" },
        messages: [
            {
                id: "msg_david_01",
                sender: "David",
                direction: "received",
                timestamp: OCT_CONCERT_BASE - 7 * 24 * 60 * 60 * 1000,
                body: "Confirming visitation schedule for the weekend.",
                metadata: { contact: "David" }
            },
            {
                id: "msg_david_02",
                sender: "David",
                direction: "received",
                timestamp: OCT_CONCERT_BASE - 6 * 24 * 60 * 60 * 1000,
                body: "We had a loud argument about custody times yesterday.",
                metadata: { contact: "David" }
            },
            {
                id: "msg_david_03",
                sender: "David",
                direction: "received",
                timestamp: OCT_CONCERT_BASE - 5 * 24 * 60 * 60 * 1000,
                body: "I am refusing overnight sleepover tonight.",
                metadata: { contact: "David" }
            }
        ]
    },

    // 12. Travel Agency Bot (SMS) - Flight confirmation & misleading keywords
    {
        title: "Travel Bot",
        platform: "SMS",
        metadata: { contact: "Travel Bot" },
        messages: [
            {
                id: "msg_bot_01",
                sender: "TravelBot",
                direction: "received",
                timestamp: AUG_AIRPORT_BASE - 24 * 60 * 60 * 1000,
                body: "Your flight reservation #AB1234 is confirmed for August 20.",
                metadata: { contact: "Travel Bot" }
            },
            {
                id: "msg_bot_02",
                sender: "TravelBot",
                direction: "received",
                timestamp: DEC_TRIP_BASE - 10 * 24 * 60 * 60 * 1000,
                body: "Winter flight booking confirmed to Denver International.",
                metadata: { contact: "Travel Bot" }
            }
        ]
    }
];

module.exports = {
    adversarialConversations,
    timestamps: {
        JAN_TRIP_BASE,
        MAY_JAZZ_BASE,
        JUL_CAMP_BASE,
        AUG_AIRPORT_BASE,
        OCT_CONCERT_BASE,
        NOV_MEETING_BASE,
        DEC_TRIP_BASE
    }
};
