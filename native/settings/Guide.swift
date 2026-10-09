import SwiftUI

/// "How Clod works": a short tour of every feature for new users, shown at the
/// top of the settings window. Each topic expands to a few one-line tips.
struct GuideSection: View {
    var body: some View {
        Section {
            ForEach(GuideTopic.all) { topic in
                DisclosureGroup {
                    VStack(alignment: .leading, spacing: 7) {
                        ForEach(topic.tips, id: \.self) { tip in
                            HStack(alignment: .firstTextBaseline, spacing: 8) {
                                Text("•").foregroundStyle(.secondary)
                                Text(.init(tip)) // Markdown, for **bold** keys
                                    .fixedSize(horizontal: false, vertical: true)
                            }
                        }
                    }
                    .font(.callout)
                    .padding(.vertical, 4)
                    .padding(.leading, 32)
                } label: {
                    RowLabel(topic.title, symbol: topic.symbol, color: topic.color)
                }
            }
        } header: {
            Text("How Clod works")
        } footer: {
            Text("Clod is a floating window for Claude Code. Everything you type runs in the real Claude Code on your Mac.")
        }
    }
}

struct GuideTopic: Identifiable {
    let title: String
    let symbol: String
    let color: Color
    let tips: [String]
    var id: String { title }

    static let all: [GuideTopic] = [
        GuideTopic(title: "Opening and closing", symbol: "keyboard", color: .gray, tips: [
            "Double-tap **⌥ Option** to show or hide Clod over any app. You can change this below, under **Show Clod with**.",
            "Clod lives in the menu bar, not the Dock. Click its menu bar icon to show it or quit.",
            "Drag the top of Clod to move it. Drag any edge to resize it.",
            "Every shortcut is listed in **Keyboard Shortcuts**, where you can change them.",
        ]),
        GuideTopic(title: "Asking Claude", symbol: "text.bubble.fill", color: .clodAccent, tips: [
            "Type in the bar at the bottom and press **Return**. Replies stream in as they're written.",
            "While Claude works, the dots next to the status show it's thinking. Change their style under **Thinking animation**.",
            "Messages sent while Claude is busy wait in line and go next.",
            "Start a message with **!** to run a Terminal command directly, for example `!ls`.",
            "Type **/** to see commands such as `/clear`, `/cost` and `/skills`.",
            "Select text in any app and press **⌥⌘E**: Clod opens and asks Claude to explain it. Change the shortcut in **Keyboard Shortcuts**.",
        ]),
        GuideTopic(title: "Editing and deleting messages", symbol: "pencil", color: .orange, tips: [
            "Hover over a message you sent and click the **pencil** to change it. Claude answers again from that point, as if what came after never happened.",
            "Hover over a reply and click **Delete** (twice to confirm) to remove it and your message before it. Claude forgets them too.",
            "The original conversation stays in your past conversations, so nothing is lost.",
        ]),
        GuideTopic(title: "Files, folders and screenshots", symbol: "paperclip", color: .cyan, tips: [
            "Click the paperclip to attach files, or paste an image straight into the message bar.",
            "Click the camera to capture part of your screen and send it with your message.",
            "Drag a folder onto Clod to make Claude work in that folder.",
            "Mention a folder by name (\"my tax folder\") and Claude can ask for it: Clod finds it and shows a card where you allow it, pick another or say no.",
            "The folder chip above the message bar shows where Claude is working. Click it to choose another.",
        ]),
        GuideTopic(title: "Tabs and past conversations", symbol: "clock.arrow.circlepath", color: .brown, tips: [
            "Click **+** or press **⌘T** to open another tab, and **⌘W** to close one. Each tab is its own conversation and keeps working in the background.",
            "Closed a tab by mistake? **⌘⇧T** brings it back.",
            "After Claude's first reply, the tab names itself in a few words.",
            "Click the clock to browse past conversations. You can search, rename, pin and export them.",
            "Type **?** followed by a word in the message bar to search every past conversation.",
            "Open tabs come back when Clod restarts. Conversations are kept for two weeks unless you pin them.",
        ]),
        GuideTopic(title: "Organising tabs", symbol: "rectangle.stack.fill", color: .teal, tips: [
            "Drag tabs to put them in a different order.",
            "Click the **pin** beside a tab's × to pin it. Pinned tabs sit first and can't be closed (even with ⌘W) until you unpin them.",
            "Right-click a tab and choose **Duplicate Tab** to try a different direction. The copy has the conversation so far, then goes its own way.",
            "Press **⌘K** or click the magnifying glass to search your tabs by title, group or anything said in them.",
        ]),
        GuideTopic(title: "Tab groups", symbol: "square.stack.3d.up.fill", color: .purple, tips: [
            "Right-click a tab and choose **Add to New Group**, then name the group. Drag tabs onto a group's label to add them, or out of the group to remove them.",
            "Click a group's label to hide or show its tabs, double-click it to rename it, or right-click it to change its colour, pin it, add a tab or close it.",
            "Each group has a **note** (Clod asks for one when you make the group). Every chat in the group sees it, and you can ask Claude to add to it: \"remember for this group that…\".",
            "Chats in a group can look at each other. Say \"use what we worked out in the other chat\" and Claude reads it.",
            "Folders are shared across a group: give one chat a folder and every chat in the group can use it.",
            "Pinned groups sit first, and their tabs can't be closed until you unpin the group.",
        ]),
        GuideTopic(title: "Models and permissions", symbol: "checkmark.shield.fill", color: .green, tips: [
            "Pick the model with the chip above the message bar. Clod always uses the newest version of each.",
            "In **Ask** mode, Clod shows a card before Claude edits files or runs commands, so you can allow or deny it.",
            "In **Auto** mode, Claude goes ahead without asking. Only use it for work you trust.",
        ]),
        GuideTopic(title: "Privacy", symbol: "hand.raised.fill", color: .blue, tips: [
            "Clod has no tracking or analytics. The only thing it contacts by itself is GitHub, once a day, to check for a new version.",
            "Your messages go to Anthropic through Claude Code, the same as using Claude Code in Terminal.",
            "Claude only sees files and folders you give it, and in **Ask** mode it asks before changing anything.",
            "A pasted token or API key is stored encrypted with your Mac's Keychain and only passed to Claude Code.",
            "Clod keeps a log on your Mac (`~/.clod-debug.log`) for fixing problems. It's only sent if you choose to send a report, and you see it first.",
        ]),
        GuideTopic(title: "Buttons at the top", symbol: "square.on.square", color: .indigo, tips: [
            "**Search** finds a tab (the same as ⌘K).",
            "**Copy** copies the whole conversation. Each code block and reply also has its own copy button.",
            "**Resize** switches between narrow and full width. Double-click it to go back to the default size.",
            "**Terminal** opens this conversation in Claude Code in Terminal, to carry on there.",
            "**Cog** opens these settings.",
        ]),
    ]
}
