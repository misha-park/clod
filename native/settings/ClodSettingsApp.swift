import AppKit
import SwiftUI

/// "Clod Settings" — the native settings window for Clod, bundled inside
/// Clod.app/Contents/Helpers. It runs without a Dock icon (LSUIElement) and
/// quits when its window closes.
final class AppDelegate: NSObject, NSApplicationDelegate {
    func applicationDidFinishLaunching(_ notification: Notification) {
        bringToFront()
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool {
        true
    }

    // Opening the app again (cog, menu bar item, ⌘,) brings the window forward.
    func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows flag: Bool) -> Bool {
        bringToFront()
        return true
    }

    private func bringToFront() {
        if #available(macOS 14.0, *) {
            NSApp.activate()
        } else {
            NSApp.activate(ignoringOtherApps: true)
        }
        NSApp.windows.first?.makeKeyAndOrderFront(nil)
        // SwiftUI focuses (and selects) the first text field on open; clear it so
        // a stray keystroke can't overwrite the input prompt.
        DispatchQueue.main.async { NSApp.windows.first?.makeFirstResponder(nil) }
    }
}

@main
struct ClodSettingsApp: App {
    @NSApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate
    @StateObject private var model = SettingsModel()

    var body: some Scene {
        Window("Clod Settings", id: "settings") {
            RootView()
                .environmentObject(model)
                .frame(minWidth: 640, idealWidth: 760, maxWidth: 1100)
                .frame(minHeight: 460, idealHeight: 600)
        }
        .defaultSize(width: 760, height: 600)
        .windowResizability(.contentMinSize)
        .defaultPosition(.center)
    }
}

/// Shows the first-run setup while Clod asks for it, otherwise the settings.
struct RootView: View {
    @EnvironmentObject var model: SettingsModel

    var body: some View {
        if model.showSetup {
            SetupView()
        } else {
            SettingsView()
        }
    }
}
