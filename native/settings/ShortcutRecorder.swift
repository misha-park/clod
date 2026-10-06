import AppKit
import SwiftUI

/// Converts a key press into an Electron accelerator string such as
/// "Command+Shift+K" — the format Clod registers with globalShortcut.
/// Modifier order matches the overlay's own recorder.
enum Accelerator {
    private static let specialKeys: [UInt16: String] = [
        49: "Space", 36: "Enter", 76: "Enter", 48: "Tab", 51: "Backspace", 117: "Delete",
        123: "Left", 124: "Right", 125: "Down", 126: "Up",
        115: "Home", 119: "End", 116: "PageUp", 121: "PageDown",
        122: "F1", 120: "F2", 99: "F3", 118: "F4", 96: "F5", 97: "F6",
        98: "F7", 100: "F8", 101: "F9", 109: "F10", 103: "F11", 111: "F12",
    ]

    static func from(_ event: NSEvent) -> String? {
        let flags = event.modifierFlags.intersection(.deviceIndependentFlagsMask)
        var parts: [String] = []
        if flags.contains(.command) { parts.append("Command") }
        if flags.contains(.control) { parts.append("Control") }
        if flags.contains(.option) { parts.append("Alt") }
        if flags.contains(.shift) { parts.append("Shift") }
        guard !parts.isEmpty else { return nil } // a bare key would hijack typing

        let key: String
        if let special = specialKeys[event.keyCode] {
            key = special
        } else if let chars = event.charactersIgnoringModifiers, chars.count == 1 {
            key = chars.uppercased()
        } else {
            return nil
        }
        return (parts + [key]).joined(separator: "+")
    }

    /// "Command+Shift+K" → "⌘⇧K" for display.
    static func symbols(_ accelerator: String) -> String {
        let map = ["Command": "⌘", "Control": "⌃", "Alt": "⌥", "Shift": "⇧",
                   "Space": "Space", "Enter": "↩", "Tab": "⇥", "Backspace": "⌫",
                   "Left": "←", "Right": "→", "Up": "↑", "Down": "↓"]
        return accelerator.split(separator: "+").map { map[String($0)] ?? String($0) }.joined()
    }
}

/// A button that records the next key combination while active.
struct ShortcutRecorder: View {
    let current: String
    let onRecord: (String) -> Void

    @State private var recording = false
    @State private var monitor: Any?

    var body: some View {
        Button {
            recording ? stop() : start()
        } label: {
            Text(recording ? "Type shortcut…" : (current.isEmpty ? "Record Shortcut" : Accelerator.symbols(current)))
                .frame(minWidth: 110)
        }
        .onDisappear(perform: stop)
    }

    private func start() {
        recording = true
        monitor = NSEvent.addLocalMonitorForEvents(matching: .keyDown) { event in
            if event.keyCode == 53 { // Escape cancels
                stop()
                return nil
            }
            if let accel = Accelerator.from(event) {
                onRecord(accel)
                stop()
            }
            return nil // swallow keys while recording
        }
    }

    private func stop() {
        recording = false
        if let monitor { NSEvent.removeMonitor(monitor) }
        monitor = nil
    }
}
