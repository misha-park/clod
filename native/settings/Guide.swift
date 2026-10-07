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
        ]),
        GuideTopic(title: "Asking Claude", symbol: "text.bubble.fill", color: .clodAccent, tips: [
            "Type in the bar at the bottom and press **Return**. Replies stream in as they're written.",
            "While Claude works, the dots next to the status show it's thinking. Change their style under **Thinking animation**.",
            "Messages sent while Claude is busy wait in line and go next.",
            "Start a message with **!** to run a Terminal command directly, for example `!ls`.",
            "Type **/** to see commands such as `/clear`, `/cost` and `/skills`.",
        ]),
        GuideTopic(title: "Files, folders and screenshots", symbol: "paperclip", color: .cyan, tips: [
            "Click the paperclip to attach files, or paste an image straight into the message bar.",
            "Click the camera to capture part of your screen and send it with your message.",
            "Drag a folder onto Clod to make Claude work in that folder.",
            "The folder chip above the message bar shows where Claude is working. Click it to choose another.",
        ]),
        GuideTopic(title: "Tabs and past conversations", symbol: "clock.arrow.circlepath", color: .brown, tips: [
            "Click **+** to open another tab. Each tab is its own conversation and keeps working in the background.",
            "Click the clock to browse past conversations. You can search, rename, pin and export them.",
            "Type **?** followed by a word in the message bar to search every past conversation.",
            "Open tabs come back when Clod restarts. Conversations are kept for two weeks unless you pin them.",
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
            "Clod keeps a log on your Mac (`~/.clod-debug.log`) for fixing problems. It stays on your Mac unless you copy it.",
        ]),
        GuideTopic(title: "Buttons at the top", symbol: "square.on.square", color: .indigo, tips: [
            "**Copy** copies the whole conversation. Each code block and reply also has its own copy button.",
            "**Resize** switches between narrow and full width. Double-click it to go back to the default size.",
            "**Terminal** opens this conversation in Claude Code in Terminal, to carry on there.",
            "**Cog** opens these settings.",
        ]),
    ]
}
