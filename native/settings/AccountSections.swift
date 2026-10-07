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
        } header: {
            Text("Account")
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
        } header: {
            Text("Permissions")
        } footer: {
            Text("After allowing a permission in System Settings, quit and reopen Clod if it doesn't take effect.")
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
