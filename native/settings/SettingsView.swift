import AppKit
import SwiftUI

/// The settings pages, in sidebar order.
enum SettingsPane: String, CaseIterable, Identifiable {
    case start, general, appearance, claude, account, permissions, help
    var id: String { rawValue }

    var title: String {
        switch self {
        case .start: return "Getting started"
        case .general: return "General"
        case .appearance: return "Appearance"
        case .claude: return "Claude"
        case .account: return "Account"
        case .permissions: return "Permissions"
        case .help: return "Help"
        }
    }

    var symbol: String {
        switch self {
        case .start: return "sparkles"
        case .general: return "gearshape.fill"
        case .appearance: return "paintpalette.fill"
        case .claude: return "bubble.left.fill"
        case .account: return "person.crop.circle.fill"
        case .permissions: return "checkmark.shield.fill"
        case .help: return "lifepreserver.fill"
        }
    }

    var color: Color {
        switch self {
        case .start: return .clodAccent
        case .general: return .gray
        case .appearance: return .indigo
        case .claude: return .orange
        case .account: return .pink
        case .permissions: return .green
        case .help: return .blue
        }
    }
}

/// Clod's settings: a sidebar of pages, like System Settings.
struct SettingsView: View {
    @EnvironmentObject var model: SettingsModel
    @AppStorage("settingsPane") private var pane: SettingsPane = .start

    var body: some View {
        NavigationSplitView {
            List(SettingsPane.allCases, selection: Binding(get: { pane }, set: { if let p = $0 { pane = p } })) { p in
                Label {
                    Text(p.title)
                } icon: {
                    SettingIcon(symbol: p.symbol, color: p.color)
                }
                .badge(p == .help && model.update != nil ? 1 : 0)
                .tag(p)
            }
            .listStyle(.sidebar)
            .navigationSplitViewColumnWidth(min: 180, ideal: 200, max: 240)
        } detail: {
            Form {
                switch pane {
                case .start: startPage
                case .general: generalPage
                case .appearance: appearancePage
                case .claude: claudePage
                case .account: AccountSection()
                case .permissions: PermissionsSection()
                case .help:
                    UpdatesSection()
                    HelpSection()
                }
            }
            .formStyle(.grouped)
            .navigationTitle(pane.title)
        }
        .tint(.clodAccent)
    }

    // MARK: Pages

    @ViewBuilder
    private var startPage: some View {
        if let update = model.update {
            Section { UpdateBanner(version: update.version, url: update.url) }
        }
        Section {
            HeaderView()
        }
        GuideSection()
        Section {
            LabeledContent {
                Button("Run setup again") { model.set("showSetup", true) }
            } label: {
                RowLabel("Setup", symbol: "checklist", color: .clodAccent)
            }
        } footer: {
            Text("Goes through installing Claude Code, signing in and permissions again.").foregroundStyle(.secondary)
        }
    }

    @ViewBuilder
    private var generalPage: some View {
        Section {
            Toggle(isOn: bind(\.openAtLogin, "openAtLogin")) {
                RowLabel("Open at login", symbol: "power", color: .gray)
            }
            Toggle(isOn: bind(\.soundEnabled, "soundEnabled")) {
                RowLabel("Notification sound", symbol: "bell.fill", color: .red)
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
    }

    @ViewBuilder
    private var appearancePage: some View {
        Section {
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
        }
        Section {
            Toggle(isOn: bind(\.expandedUI, "expandedUI")) {
                RowLabel("Full width", symbol: "arrow.left.and.right", color: .teal)
            }
            presetWidthRow("Narrow width", \.narrowWidth, "narrowWidth", SettingsModel.defaultNarrowWidth)
            presetWidthRow("Full width", \.wideWidth, "wideWidth", SettingsModel.defaultWideWidth)
        } header: {
            Text("Size")
        } footer: {
            Text("The resize button at the top of Clod switches between these two widths. You can also drag Clod's edges.")
                .foregroundStyle(.secondary)
        }
        Section {
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
        } header: {
            Text("Details")
        }
    }

    @ViewBuilder
    private var claudePage: some View {
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
        } footer: {
            Text("Auto-approve lets Claude run tools without asking first.").foregroundStyle(.secondary)
        }
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
