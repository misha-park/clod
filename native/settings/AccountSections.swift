import SwiftUI

/// Settings → Account: Claude Code's version, who it's signed in as, and the
/// ways to sign in, sign out or paste a token or API key.
struct AccountSection: View {
    @EnvironmentObject var model: SettingsModel
    @State private var showSignIn = false
    @State private var error: String?

    private var status: SetupStatus { model.setup }

    var body: some View {
        Section {
            LabeledContent {
                Text(status.cliInstalled ? status.cliVersion ?? "Installed" : "Not installed")
                    .foregroundStyle(.secondary)
            } label: {
                RowLabel("Claude Code", symbol: "terminal.fill", color: .black)
            }
            LabeledContent {
                Text(status.accountSummary)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
                    .truncationMode(.middle)
            } label: {
                RowLabel("Account", symbol: "person.crop.circle.fill", color: .clodAccent)
            }
            if status.needsPaidPlan {
                PaidPlanNotice()
            }
            if status.credential != nil {
                LabeledContent {
                    Button("Remove") { Task { await send("clearCredential") } }
                } label: {
                    Text(status.credential == "apiKey" ? "Pasted API key" : "Pasted Claude token")
                }
            }
            HStack {
                Button(status.loggedIn ? "Switch account…" : "Sign in…") { showSignIn.toggle() }
                    .disabled(!status.cliInstalled)
                if status.loggedIn && status.credential == nil {
                    Button("Sign out") { Task { await send("logout") } }
                }
                Spacer()
                Button("Run setup again") { model.set("showSetup", true) }
            }
            if showSignIn {
                SignInPanel()
                    .padding(.vertical, 4)
            }
            if let error {
                Text(error).foregroundStyle(.orange).font(.callout)
            }
        } footer: {
            if !status.known {
                Text("Open Clod to see your account.").foregroundStyle(.secondary)
            }
        }
        .task { await send("refresh") }
    }

    private func send(_ cmd: String, _ args: [String: String] = [:]) async {
        do {
            try await ClodControl.send(cmd, args)
            error = nil
        } catch {
            self.error = error.localizedDescription
        }
    }
}

/// Settings → Permissions: live status of the three macOS permissions Clod
/// uses, each with a button to allow it.
struct PermissionsSection: View {
    @EnvironmentObject var model: SettingsModel

    private var status: SetupStatus { model.setup }

    var body: some View {
        Section {
            PermissionRow(title: "Accessibility", detail: "Double-tap ⌥ Option",
                          symbol: "accessibility", color: .blue, name: "accessibility",
                          granted: status.accessibility || model.accessibilityGranted == true)
            PermissionRow(title: "Screen Recording", detail: "The screenshot button",
                          symbol: "camera.viewfinder", color: .purple, name: "screen",
                          granted: status.screen == "granted")
            PermissionRow(title: "Automation", detail: "The Terminal button",
                          symbol: "apple.terminal", color: .gray, name: "automation",
                          granted: status.automation == "granted")
        } footer: {
            Text("Accessibility works as soon as it's allowed. Screen Recording may need Clod to quit and reopen, which macOS offers to do.")
                .foregroundStyle(.secondary)
        }
    }
}

struct PermissionRow: View {
    let title: String
    let detail: String
    let symbol: String
    let color: Color
    let name: String
    let granted: Bool

    var body: some View {
        LabeledContent {
            if granted {
                Label("Allowed", systemImage: "checkmark.circle.fill").foregroundStyle(.green)
            } else {
                Button("Allow…") {
                    Task {
                        try? await ClodControl.send("requestPermission", ["name": name])
                        if name != "automation" { try? await ClodControl.send("openPrivacyPane", ["name": name]) }
                    }
                }
            }
        } label: {
            HStack(spacing: 10) {
                SettingIcon(symbol: symbol, color: color)
                VStack(alignment: .leading, spacing: 1) {
                    Text(title)
                    Text(detail).font(.caption).foregroundStyle(.secondary)
                }
            }
        }
    }
}

/// Shown at the top of the settings when GitHub has a newer Clod.
/// A newer Clod on GitHub, and how far its download has got.
struct UpdateInfo {
    let version: String
    let url: URL
    var progress: Double?
    var downloaded = false
    var error: String?
}

/// Shown when GitHub has a newer Clod. "Download and install" saves the DMG,
/// opens it and quits Clod, leaving only the drag into Applications.
struct UpdateBanner: View {
    let update: UpdateInfo
    @State private var failed: String?

    var body: some View {
        HStack(spacing: 10) {
            SettingIcon(symbol: "arrow.down.circle.fill", color: .green)
            VStack(alignment: .leading, spacing: 3) {
                Text("Clod \(update.version) is available").font(.headline)
                if update.downloaded {
                    Text("Opened. Drag Clod into Applications and choose Replace.")
                        .font(.callout).foregroundStyle(.secondary)
                } else if let progress = update.progress, update.error == nil {
                    ProgressView(value: progress).frame(maxWidth: 220)
                    Text("Downloading… Clod will quit when it's ready so it can be replaced.")
                        .font(.callout).foregroundStyle(.secondary)
                } else {
                    Text(failed ?? update.error ?? "Clod downloads it, opens it and quits. Then drag Clod into Applications.")
                        .font(.callout)
                        .foregroundStyle(failed ?? update.error == nil ? Color.secondary : Color.orange)
                }
            }
            Spacer()
            if update.progress == nil || update.error != nil {
                Button("Download and install") {
                    Task {
                        do { try await ClodControl.send("downloadUpdate"); failed = nil }
                        catch { failed = error.localizedDescription }
                    }
                }
                .buttonStyle(.borderedProminent)
            }
        }
    }
}

/// Settings → Help: version, licence, debug info for bug reports, uninstalling.
struct HelpSection: View {
    @State private var copied = false
    @State private var confirmUninstall = false
    @State private var error: String?

    var body: some View {
        Section {
            LabeledContent {
                Text(SettingsHeaderStatus.version).foregroundStyle(.secondary)
            } label: {
                RowLabel("Version", symbol: "info.circle.fill", color: .gray)
            }
            LabeledContent {
                Button(copied ? "Copied" : "Copy debug info") {
                    Task {
                        do {
                            try await ClodControl.send("copyDebugInfo")
                            copied = true
                            error = nil
                            try? await Task.sleep(nanoseconds: 2_000_000_000)
                            copied = false
                        } catch {
                            self.error = error.localizedDescription
                        }
                    }
                }
            } label: {
                VStack(alignment: .leading, spacing: 1) {
                    RowLabel("Report a problem", symbol: "ladybug.fill", color: .red)
                    Text("Copies versions, setup status and the recent log. Read it before sharing: the log can mention folder and file names.")
                        .font(.caption).foregroundStyle(.secondary)
                        .padding(.leading, 32)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            LabeledContent {
                Button("Uninstall Clod…", role: .destructive) { confirmUninstall = true }
            } label: {
                RowLabel("Uninstall", symbol: "trash.fill", color: .gray)
            }
            if let error {
                Text(error).foregroundStyle(.orange).font(.callout)
            }
        } footer: {
            Text("Clod is open source under the MIT licence. Based on Clui CC by Lucas Couto.")
                .foregroundStyle(.secondary)
        }
        .alert("Uninstall Clod?", isPresented: $confirmUninstall) {
            Button("Uninstall", role: .destructive) {
                Task {
                    do {
                        try await ClodControl.send("uninstall")
                        NSApp.terminate(nil)
                    } catch {
                        self.error = error.localizedDescription
                    }
                }
            }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("This moves Clod to the Bin and deletes its settings, saved sign-in and log. Your conversations in Claude Code and Claude Code itself are kept.")
        }
    }
}

/// Help → Updates: whether this is the newest Clod, from Clod's daily check.
struct UpdatesSection: View {
    @EnvironmentObject var model: SettingsModel

    var body: some View {
        Section {
            if let update = model.update {
                UpdateBanner(update: update)
            } else {
                LabeledContent {
                    Text("Up to date").foregroundStyle(.secondary)
                } label: {
                    RowLabel("Updates", symbol: "arrow.down.circle.fill", color: .green)
                }
            }
        } footer: {
            Text("Clod checks GitHub for a new version once a day.").foregroundStyle(.secondary)
        }
    }
}
