import AppKit
import Foundation

struct ModelOption: Identifiable, Hashable {
    let id: String
    let label: String
}

/// Reads and writes Clod's shared settings file.
///
/// ~/Library/Application Support/Clod/settings.json is owned by Clod's main
/// process, which merges updates and pushes changes to the overlay. This app
/// edits it with read-modify-write so keys it doesn't know about survive.
/// state.json is read-only here: values only Clod can determine.
@MainActor
final class SettingsModel: ObservableObject {
    static let directory = FileManager.default
        .urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        .appendingPathComponent("Clod", isDirectory: true)
    let settingsURL = directory.appendingPathComponent("settings.json")
    let stateURL = directory.appendingPathComponent("state.json")

    static let defaultPlaceholder = "Ask Claude anything…"
    static let defaultExplainShortcut = "Command+Alt+E"

    // Settings (keys and defaults mirror the overlay's stores)
    @Published private(set) var themeMode = "dark"
    @Published private(set) var soundEnabled = true
    @Published private(set) var expandedUI = true
    @Published private(set) var narrowWidth = SettingsModel.defaultNarrowWidth
    @Published private(set) var wideWidth = SettingsModel.defaultWideWidth
    @Published private(set) var windowPosition = "center"
    @Published private(set) var inputPlaceholder = SettingsModel.defaultPlaceholder
    @Published private(set) var borderAnimation = true
    @Published private(set) var thinkingAnimation = "mitosis"
    @Published private(set) var hotkeyMode = "double-option"
    @Published private(set) var hotkeyAccelerator = ""
    /// Shortcut that asks Claude to explain the selected text ("" = off)
    @Published private(set) var explainShortcut = SettingsModel.defaultExplainShortcut
    @Published private(set) var openAtLogin = true
    @Published private(set) var preferredModel = "sonnet"
    @Published private(set) var permissionMode = "ask"
    @Published private(set) var defaultDirOverride: String?
    @Published private(set) var historyLayout = "drawer"
    /// Set by Clod on first launch (or by "Run setup again") to show the setup steps.
    @Published private(set) var showSetup = false
    /// Set once the user has picked (or accepted) Claude's starting folder in setup.
    @Published private(set) var folderChosen = false
    /// Whether Clod offers to report problems it notices
    @Published private(set) var reportPrompts = true

    // State published by Clod
    @Published private(set) var accessibilityGranted: Bool?
    @Published private(set) var setup = SetupStatus()
    /// A newer Clod on GitHub, found by Clod's daily check
    @Published private(set) var update: UpdateInfo?
    @Published private(set) var defaultDir = "~/Documents/clod-scratch"
    @Published private(set) var models: [ModelOption] = [
        ModelOption(id: "fable", label: "Fable"),
        ModelOption(id: "opus", label: "Opus"),
        ModelOption(id: "sonnet", label: "Sonnet"),
        ModelOption(id: "haiku", label: "Haiku"),
    ]

    private var settingsMtime: Date?
    private var stateMtime: Date?
    private var timer: Timer?

    init() {
        reloadSettings()
        reloadState()
        // Poll for changes made by Clod (cheap: two stat calls).
        timer = Timer.scheduledTimer(withTimeInterval: 0.5, repeats: true) { [weak self] _ in
            Task { @MainActor in self?.pollFiles() }
        }
    }

    // MARK: Writing

    func set(_ key: String, _ value: Any?) {
        var dict = readJSON(settingsURL) ?? [:]
        dict[key] = value ?? NSNull()
        writeJSON(dict, to: settingsURL)
        settingsMtime = modificationDate(settingsURL)
        apply(dict)
    }

    // Card widths of the narrow / wide presets (mirror PRESETS in src/shared/layout.ts).
    static let defaultNarrowWidth = 460
    static let defaultWideWidth = 700
    static let presetWidthRange = 360...2400

    static func presetWidth(_ value: Any?) -> Int? {
        guard let n = value as? NSNumber, presetWidthRange.contains(n.intValue) else { return nil }
        return n.intValue
    }

    /** Saves a preset width; the default is stored as null so later default changes apply. */
    func setPresetWidth(_ key: String, _ value: Int, default defaultValue: Int) {
        set(key, value == defaultValue ? nil : value)
    }

    func setHotkey(mode: String, accelerator: String) {
        var dict = readJSON(settingsURL) ?? [:]
        dict["hotkeyMode"] = mode
        dict["hotkeyAccelerator"] = accelerator
        writeJSON(dict, to: settingsURL)
        settingsMtime = modificationDate(settingsURL)
        apply(dict)
    }

    // MARK: Reading

    private func pollFiles() {
        if modificationDate(settingsURL) != settingsMtime { reloadSettings() }
        if modificationDate(stateURL) != stateMtime { reloadState() }
    }

    private func reloadSettings() {
        settingsMtime = modificationDate(settingsURL)
        if let dict = readJSON(settingsURL) { apply(dict) }
    }

    private func apply(_ d: [String: Any]) {
        themeMode = (d["themeMode"] as? String) == "light" ? "light" : "dark"
        soundEnabled = d["soundEnabled"] as? Bool ?? true
        expandedUI = d["expandedUI"] as? Bool ?? true
        narrowWidth = SettingsModel.presetWidth(d["narrowWidth"]) ?? SettingsModel.defaultNarrowWidth
        wideWidth = SettingsModel.presetWidth(d["wideWidth"]) ?? SettingsModel.defaultWideWidth
        windowPosition = (d["windowPosition"] as? String) == "right" ? "right" : "center"
        inputPlaceholder = d["inputPlaceholder"] as? String ?? SettingsModel.defaultPlaceholder
        borderAnimation = d["borderAnimation"] as? Bool ?? true
        let animation = d["thinkingAnimation"] as? String ?? ""
        thinkingAnimation = ["claude", "tetra", "origami", "leapfrog", "mitosis"].contains(animation) ? animation : "mitosis"
        hotkeyMode = (d["hotkeyMode"] as? String) == "accelerator" ? "accelerator" : "double-option"
        hotkeyAccelerator = d["hotkeyAccelerator"] as? String ?? ""
        explainShortcut = d["explainShortcut"] as? String ?? SettingsModel.defaultExplainShortcut
        openAtLogin = d["openAtLogin"] as? Bool ?? true
        preferredModel = d["preferredModel"] as? String ?? "sonnet"
        permissionMode = (d["permissionMode"] as? String) == "auto" ? "auto" : "ask"
        defaultDirOverride = d["defaultDirOverride"] as? String
        historyLayout = (d["historyLayout"] as? String) == "card" ? "card" : "drawer"
        showSetup = d["showSetup"] as? Bool ?? false
        folderChosen = d["folderChosen"] as? Bool ?? false
        reportPrompts = d["reportPrompts"] as? Bool ?? true
    }

    private func reloadState() {
        stateMtime = modificationDate(stateURL)
        guard let d = readJSON(stateURL) else { return }
        accessibilityGranted = d["accessibilityGranted"] as? Bool
        if let s = d["setup"] as? [String: Any] { setup = SetupStatus(s) }
        if let u = d["update"] as? [String: Any], let version = u["version"] as? String,
           let link = (u["url"] as? String).flatMap(URL.init(string:)) {
            update = UpdateInfo(version: version, url: link,
                                progress: u["progress"] as? Double,
                                downloaded: u["downloaded"] != nil,
                                error: u["error"] as? String)
        } else {
            update = nil
        }
        if let dir = d["defaultDir"] as? String { defaultDir = dir }
        if let list = d["models"] as? [[String: Any]] {
            let parsed = list.compactMap { m -> ModelOption? in
                guard let id = m["id"] as? String, let label = m["label"] as? String else { return nil }
                return ModelOption(id: id, label: label)
            }
            if !parsed.isEmpty { models = parsed }
        }
    }

    // MARK: Files

    private func modificationDate(_ url: URL) -> Date? {
        (try? FileManager.default.attributesOfItem(atPath: url.path))?[.modificationDate] as? Date
    }

    private func readJSON(_ url: URL) -> [String: Any]? {
        guard let data = try? Data(contentsOf: url) else { return nil }
        return (try? JSONSerialization.jsonObject(with: data)) as? [String: Any]
    }

    private func writeJSON(_ dict: [String: Any], to url: URL) {
        try? FileManager.default.createDirectory(at: SettingsModel.directory, withIntermediateDirectories: true)
        guard let data = try? JSONSerialization.data(withJSONObject: dict, options: [.prettyPrinted, .sortedKeys]) else { return }
        // Atomic write: Clod never sees a half-written file.
        try? data.write(to: url, options: .atomic)
    }
}
