import AppKit
import SwiftUI

struct SettingsView: View {
    @EnvironmentObject var model: SettingsModel

    var body: some View {
        Form {
            Section {
                HeaderView()
            }

            Section("General") {
                Toggle(isOn: bind(\.openAtLogin, "openAtLogin")) {
                    RowLabel("Open at login", symbol: "power", color: .gray)
                }
                Toggle(isOn: bind(\.soundEnabled, "soundEnabled")) {
                    RowLabel("Notification sound", symbol: "bell.fill", color: .red)
                }
            }

            Section("Appearance") {
                Picker(selection: bind(\.themeMode, "themeMode")) {
                    Text("Light").tag("light")
                    Text("Dark").tag("dark")
                } label: {
                    RowLabel("Theme", symbol: "circle.lefthalf.filled", color: .indigo)
                }
                .pickerStyle(.segmented)
                Picker(selection: bind(\.windowPosition, "windowPosition")) {
                    Text("Center").tag("center")
                    Text("Right").tag("right")
                } label: {
                    RowLabel("Screen position", symbol: "macwindow", color: .blue)
                }
                .pickerStyle(.segmented)
                Toggle(isOn: bind(\.expandedUI, "expandedUI")) {
                    RowLabel("Full width", symbol: "arrow.left.and.right", color: .teal)
                }
                Picker(selection: bind(\.historyLayout, "historyLayout")) {
                    Text("Beside Clod").tag("drawer")
                    Text("Inside Clod").tag("card")
                } label: {
                    RowLabel("Past conversations", symbol: "clock.arrow.circlepath", color: .brown)
                }
                .pickerStyle(.segmented)
                Toggle(isOn: bind(\.borderAnimation, "borderAnimation")) {
                    RowLabel("Input glow", symbol: "sparkles", color: .purple)
                }
                TextField(text: bind(\.inputPlaceholder, "inputPlaceholder"),
                          prompt: Text(SettingsModel.defaultPlaceholder)) {
                    RowLabel("Input prompt", symbol: "text.cursor", color: .pink)
                }
            }

            Section {
                Picker(selection: hotkeyModeBinding) {
                    Text("Double-tap ⌥ Option").tag("double-option")
                    Text("Custom shortcut").tag("accelerator")
                } label: {
                    RowLabel("Show Clod with", symbol: "keyboard", color: .gray)
                }
                .pickerStyle(.radioGroup)
                .horizontalRadioGroupLayout()
                if model.hotkeyMode == "accelerator" {
                    LabeledContent {
                        ShortcutRecorder(current: model.hotkeyAccelerator) { accel in
                            model.setHotkey(mode: "accelerator", accelerator: accel)
                        }
                    } label: {
                        RowLabel("Shortcut", symbol: "command", color: .blue)
                    }
                }
            } header: {
                Text("Shortcut")
            } footer: {
                Text("⌘⇧K always shows Clod too.").foregroundStyle(.secondary)
            }

            Section {
                Picker(selection: bind(\.preferredModel, "preferredModel")) {
                    ForEach(model.models) { m in Text(m.label).tag(m.id) }
                } label: {
                    RowLabel("Default model", symbol: "cpu", color: .clodAccent)
                }
                .tint(nil)
                LabeledContent {
                    HStack {
                        Text(abbreviate(model.defaultDirOverride ?? model.defaultDir))
                            .foregroundStyle(.secondary)
                            .lineLimit(1)
                            .truncationMode(.middle)
                            .help(model.defaultDirOverride ?? model.defaultDir)
                        Button("Change…", action: chooseFolder)
                        if model.defaultDirOverride != nil {
                            Button("Reset") { model.set("defaultDirOverride", nil) }
                        }
                    }
                } label: {
                    RowLabel("Default folder", symbol: "folder.fill", color: .cyan)
                }
                .tint(nil)
                Toggle(isOn: Binding(
                    get: { model.permissionMode == "auto" },
                    set: { model.set("permissionMode", $0 ? "auto" : "ask") }
                )) {
                    RowLabel("Auto-approve tools", symbol: "checkmark.shield.fill", color: .green)
                }
            } header: {
                Text("Claude")
            } footer: {
                Text("Auto-approve lets Claude run tools without asking first.").foregroundStyle(.secondary)
            }

            if let granted = model.accessibilityGranted {
                Section {
                    LabeledContent {
                        if granted {
                            Label("Granted", systemImage: "checkmark.circle.fill")
                                .foregroundStyle(.green)
                        } else {
                            HStack {
                                Label("Not granted", systemImage: "exclamationmark.triangle.fill")
                                    .foregroundStyle(.orange)
                                Button("Open Privacy Settings…", action: openAccessibilitySettings)
                                    .tint(nil)
                            }
                        }
                    } label: {
                        RowLabel("Accessibility", symbol: "accessibility", color: .blue)
                    }
                } header: {
                    Text("Permissions")
                } footer: {
                    if !granted {
                        Text("Double-tap ⌥ needs Accessibility. After granting it, quit and reopen Clod.")
                            .foregroundStyle(.secondary)
                    }
                }
            }
        }
        .formStyle(.grouped)
        .tint(.clodAccent)
    }

    // MARK: Helpers

    /// A binding that reads from the model and writes the key to settings.json.
    private func bind<T>(_ path: KeyPath<SettingsModel, T>, _ key: String) -> Binding<T> {
        Binding(get: { model[keyPath: path] }, set: { model.set(key, $0) })
    }

    private var hotkeyModeBinding: Binding<String> {
        Binding(get: { model.hotkeyMode }, set: { mode in
            model.setHotkey(mode: mode, accelerator: model.hotkeyAccelerator)
        })
    }

    private func abbreviate(_ path: String) -> String {
        (path as NSString).abbreviatingWithTildeInPath
    }

    private func chooseFolder() {
        let panel = NSOpenPanel()
        panel.canChooseDirectories = true
        panel.canChooseFiles = false
        panel.allowsMultipleSelection = false
        panel.prompt = "Choose"
        panel.directoryURL = URL(fileURLWithPath: (model.defaultDirOverride ?? model.defaultDir) as String)
        if panel.runModal() == .OK, let url = panel.url {
            model.set("defaultDirOverride", url.path)
        }
    }

    private func openAccessibilitySettings() {
        if let url = URL(string: "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility") {
            NSWorkspace.shared.open(url)
        }
    }
}
