import AppKit
import SwiftUI

struct SettingsView: View {
    @EnvironmentObject var model: SettingsModel

    var body: some View {
        Form {
            Section("General") {
                Toggle("Open at login", isOn: bind(\.openAtLogin, "openAtLogin"))
                Toggle("Notification sound", isOn: bind(\.soundEnabled, "soundEnabled"))
            }

            Section("Appearance") {
                Picker("Theme", selection: bind(\.themeMode, "themeMode")) {
                    Text("Light").tag("light")
                    Text("Dark").tag("dark")
                }
                .pickerStyle(.segmented)
                Picker("Screen position", selection: bind(\.windowPosition, "windowPosition")) {
                    Text("Center").tag("center")
                    Text("Right").tag("right")
                }
                .pickerStyle(.segmented)
                Toggle("Full width", isOn: bind(\.expandedUI, "expandedUI"))
                Toggle("Input glow", isOn: bind(\.borderAnimation, "borderAnimation"))
                TextField("Input prompt", text: bind(\.inputPlaceholder, "inputPlaceholder"),
                          prompt: Text(SettingsModel.defaultPlaceholder))
            }

            Section {
                Picker("Show Clod with", selection: hotkeyModeBinding) {
                    Text("Double-tap ⌥ Option").tag("double-option")
                    Text("Custom shortcut").tag("accelerator")
                }
                .pickerStyle(.radioGroup)
                if model.hotkeyMode == "accelerator" {
                    LabeledContent("Shortcut") {
                        ShortcutRecorder(current: model.hotkeyAccelerator) { accel in
                            model.setHotkey(mode: "accelerator", accelerator: accel)
                        }
                    }
                }
            } header: {
                Text("Shortcut")
            } footer: {
                Text("⌘⇧K always shows Clod too.").foregroundStyle(.secondary)
            }

            Section {
                Picker("Default model", selection: bind(\.preferredModel, "preferredModel")) {
                    ForEach(model.models) { m in Text(m.label).tag(m.id) }
                }
                LabeledContent("Default folder") {
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
                }
                Toggle("Auto-approve tools", isOn: Binding(
                    get: { model.permissionMode == "auto" },
                    set: { model.set("permissionMode", $0 ? "auto" : "ask") }
                ))
            } header: {
                Text("Claude")
            } footer: {
                Text("Auto-approve lets Claude run tools without asking first.").foregroundStyle(.secondary)
            }

            if let granted = model.accessibilityGranted {
                Section {
                    LabeledContent("Accessibility") {
                        if granted {
                            Label("Granted", systemImage: "checkmark.circle.fill")
                                .foregroundStyle(.green)
                        } else {
                            HStack {
                                Label("Not granted", systemImage: "exclamationmark.triangle.fill")
                                    .foregroundStyle(.orange)
                                Button("Open Privacy Settings…", action: openAccessibilitySettings)
                            }
                        }
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
