import AppKit
import SwiftUI

struct SettingsView: View {
    @EnvironmentObject var model: SettingsModel
    @State private var showWidthPresets = false

    var body: some View {
        Form {
            if let update = model.update {
                Section { UpdateBanner(version: update.version, url: update.url) }
            }

            Section {
                HeaderView()
            }

            GuideSection()

            AccountSection()

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
                    HStack {
                        RowLabel("Full width", symbol: "arrow.left.and.right", color: .teal)
                        Spacer()
                        Button("Change width presets…") { showWidthPresets = true }
                            .controlSize(.small)
                            .popover(isPresented: $showWidthPresets, arrowEdge: .bottom) {
                                VStack(alignment: .leading, spacing: 10) {
                                    Text("Width presets").font(.headline)
                                    presetWidthRow("Narrow", \.narrowWidth, "narrowWidth", SettingsModel.defaultNarrowWidth)
                                    presetWidthRow("Full width", \.wideWidth, "wideWidth", SettingsModel.defaultWideWidth)
                                }
                                .padding(14)
                                .frame(width: 300)
                            }
                    }
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
                Picker(selection: bind(\.thinkingAnimation, "thinkingAnimation")) {
                    Text("Mitosis").tag("mitosis")
                    Text("Claude").tag("claude")
                    Text("Tetra").tag("tetra")
                    Text("Origami").tag("origami")
                    Text("Leapfrog").tag("leapfrog")
                } label: {
                    RowLabel("Thinking animation", symbol: "circle.grid.cross", color: .orange)
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

            PermissionsSection()

            HelpSection()
        }
        .formStyle(.grouped)
        .tint(.clodAccent)
    }

    // MARK: Helpers

    /// A binding that reads from the model and writes the key to settings.json.
    private func bind<T>(_ path: KeyPath<SettingsModel, T>, _ key: String) -> Binding<T> {
        Binding(get: { model[keyPath: path] }, set: { model.set(key, $0) })
    }

    /// A stepper for one preset's card width, with a reset to its default.
    private func presetWidthRow(_ title: String, _ path: KeyPath<SettingsModel, Int>, _ key: String, _ defaultValue: Int) -> some View {
        let value = Binding(get: { model[keyPath: path] },
                            set: { model.setPresetWidth(key, $0, default: defaultValue) })
        return HStack {
            Stepper(value: value, in: SettingsModel.presetWidthRange, step: 20) {
                HStack {
                    Text(title)
                    Spacer()
                    Text("\(value.wrappedValue) pt").monospacedDigit().foregroundStyle(.secondary)
                }
            }
            Button("Reset") { value.wrappedValue = defaultValue }
                .buttonStyle(.borderless)
                .disabled(value.wrappedValue == defaultValue)
        }
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

}
