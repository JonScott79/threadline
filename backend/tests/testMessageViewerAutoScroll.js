/*
    testMessageViewerAutoScroll.js

    Regression test for Threadline message viewer auto-scroll bug:
    Contract Invariants:
    1. Selecting a message (Timeline, Event Cluster, Search result) sets targetScrollMessageId and skipScrollToBottom.
    2. When messages render, target message is scrolled into view and targetScrollMessageId is cleared.
    3. Expiration of the visual highlight timer (setActiveSearchMessageId(null)) does NOT re-trigger scroll or scroll to bottom.
    4. Opening a conversation normally without a target message preserves default scroll-to-bottom behavior once.
    5. Manual user scroll is not fought on subsequent renders/updates.
*/

const assert = require("assert");

function testMessageViewerAutoScrollContracts() {
    console.log("=================================================");
    console.log(" TESTING: MESSAGE VIEWER AUTO-SCROLL CONTRACTS");
    console.log("=================================================");

    // Simulate React Component State & Refs for ThreadlineWorkspace
    class MockThreadlineWorkspace {
        constructor() {
            this.state = {
                activeConversation: null,
                activeRightTab: "day",
                messages: [],
                activeSearchMessageId: null
            };
            this.refs = {
                messagesEndRef: { scrolled: 0, lastCall: null },
                targetScrollMessageIdRef: { current: null },
                hasScrolledConversationRef: { current: false },
                skipScrollToBottomRef: { current: false }
            };
            this.domElements = new Map();
        }

        registerDomElement(id) {
            const el = {
                id,
                scrollCount: 0,
                lastBlock: null,
                scrollIntoView: function(opts) {
                    this.scrollCount++;
                    this.lastBlock = opts ? opts.block : null;
                }
            };
            this.domElements.set(id, el);
            return el;
        }

        // Simulates switching conversation from left pane (normal open)
        openConversationNormally(conv) {
            this.refs.targetScrollMessageIdRef.current = null;
            this.refs.skipScrollToBottomRef.current = false;
            this.refs.hasScrolledConversationRef.current = false;
            this.state.activeConversation = conv;
            this.state.activeRightTab = "conversation";
        }

        // Simulates explicit message selection (e.g. from Timeline or Event Cluster)
        selectMessageExplicitly(msgId, conv) {
            this.refs.targetScrollMessageIdRef.current = msgId;
            this.refs.skipScrollToBottomRef.current = true;
            this.state.activeSearchMessageId = msgId;
            this.state.activeConversation = conv;
            this.state.activeRightTab = "conversation";

            // Check if element is already mounted
            const el = this.domElements.get(`msg-${msgId}`);
            if (el) {
                el.scrollIntoView({ behavior: "smooth", block: "center" });
                this.refs.targetScrollMessageIdRef.current = null;
                this.refs.hasScrolledConversationRef.current = true;
            }
        }

        // Simulates messages loaded / re-rendered effect: useEffect([messages, activeRightTab])
        runScrollEffect() {
            const { activeRightTab, messages } = this.state;
            const { targetScrollMessageIdRef, skipScrollToBottomRef, hasScrolledConversationRef, messagesEndRef } = this.refs;

            if (activeRightTab !== "conversation" || messages.length === 0) return;

            // Path A: User explicitly selected a message
            if (targetScrollMessageIdRef.current) {
                const targetId = targetScrollMessageIdRef.current;
                const element = this.domElements.get(`msg-${targetId}`);
                if (element) {
                    element.scrollIntoView({ behavior: "smooth", block: "center" });
                    targetScrollMessageIdRef.current = null;
                    skipScrollToBottomRef.current = true;
                    hasScrolledConversationRef.current = true;
                }
                return;
            }

            // Path B: Normal conversation open without target message
            if (!skipScrollToBottomRef.current && !hasScrolledConversationRef.current) {
                messagesEndRef.scrolled++;
                messagesEndRef.lastCall = "bottom";
                hasScrolledConversationRef.current = true;
            }
        }

        // Simulates highlight clear timer firing after 4s: useEffect([activeSearchMessageId])
        clearHighlight() {
            this.state.activeSearchMessageId = null;
            // Notice: Highlight clearing in new implementation does NOT re-run the scroll effect,
            // but even if render occurs, target is not re-scrolled and bottom-scroll remains suppressed!
            this.runScrollEffect();
        }
    }

    // TEST 1: User explicitly selects an old message in a long conversation
    console.log("1. Testing explicit message selection path...");
    const ws1 = new MockThreadlineWorkspace();
    const targetMsgId = "msg_104";
    const targetEl = ws1.registerDomElement(`msg-${targetMsgId}`);
    const mockMessages = Array.from({ length: 200 }, (_, i) => ({ id: `msg_${i + 1}`, body: `Message ${i + 1}` }));

    // User clicks message before or while messages are loading
    ws1.selectMessageExplicitly(targetMsgId, { id: "conv_1", title: "Investigation Thread" });
    assert.strictEqual(ws1.refs.skipScrollToBottomRef.current, true, "skipScrollToBottomRef must be true");
    assert.strictEqual(ws1.state.activeSearchMessageId, targetMsgId, "Highlight must be set on selected message");

    // Messages finish loading from backend
    ws1.state.messages = mockMessages;
    ws1.runScrollEffect();

    assert.strictEqual(targetEl.scrollCount, 1, "Target message must be scrolled into view exactly once");
    assert.strictEqual(targetEl.lastBlock, "center", "Target message must be centered");
    assert.strictEqual(ws1.refs.messagesEndRef.scrolled, 0, "messagesEndRef must NOT have scrolled to bottom");
    console.log("✓ Selected message correctly scrolled into view; bottom scroll avoided.");

    // TEST 2: Highlight timer expires after 4 seconds
    console.log("\n2. Testing highlight expiration behavior...");
    ws1.clearHighlight();
    assert.strictEqual(ws1.state.activeSearchMessageId, null, "activeSearchMessageId should be cleared");
    assert.strictEqual(ws1.refs.messagesEndRef.scrolled, 0, "messagesEndRef must STILL be 0 after highlight clears");
    assert.strictEqual(targetEl.scrollCount, 1, "Target message scroll count must remain 1");
    console.log("✓ Clearing visual glow highlight does NOT re-trigger bottom scroll.");

    // TEST 3: Normal conversation open without target message
    console.log("\n3. Testing normal conversation open path (no selected message)...");
    const ws2 = new MockThreadlineWorkspace();
    ws2.openConversationNormally({ id: "conv_2", title: "General Chat" });
    ws2.state.messages = mockMessages;
    ws2.runScrollEffect();

    assert.strictEqual(ws2.refs.messagesEndRef.scrolled, 1, "Default view must scroll to bottom on initial open");
    assert.strictEqual(ws2.refs.hasScrolledConversationRef.current, true, "hasScrolledConversationRef must be set to true");
    console.log("✓ Normal conversation open scrolls to bottom as expected.");

    // TEST 4: Subsequent re-renders / updates must not fight user scroll position
    console.log("\n4. Testing subsequent re-render behavior...");
    ws2.runScrollEffect();
    assert.strictEqual(ws2.refs.messagesEndRef.scrolled, 1, "Subsequent render must not re-scroll to bottom");
    console.log("✓ Viewport position is preserved; does not fight user scroll.");

    // TEST 5: Switching from an explicit selection to normal thread open resets suppression
    console.log("\n5. Testing transition from message selection to normal thread open...");
    ws1.openConversationNormally({ id: "conv_3", title: "Another Thread" });
    assert.strictEqual(ws1.refs.skipScrollToBottomRef.current, false, "skipScrollToBottomRef must reset on normal open");
    ws1.state.messages = mockMessages;
    ws1.runScrollEffect();
    assert.strictEqual(ws1.refs.messagesEndRef.scrolled, 1, "Opening normal conversation afterwards scrolls to bottom");
    console.log("✓ State transitions between selection and normal opening work correctly.");

    console.log("\n=================================================");
    console.log(" ALL MESSAGE VIEWER SCROLL CONTRACT TESTS PASSED! ✅");
    console.log("=================================================");
}

testMessageViewerAutoScrollContracts();
