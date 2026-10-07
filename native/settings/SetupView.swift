import AppKit
import SwiftUI

/// The guided first-run setup: install Claude Code, sign in, allow the
/// permissions, try the shortcut. Shown in the settings window while
/// "showSetup" is set in settings.json (Clod sets it on first launch).
struct SetupView: View {
    @EnvironmentObject var model: SettingsModel
    @State private var skipped: Set<SetupStep> = []
    @State private var error: String?

    private var status: SetupStatus { model.setup }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                header
                ForEach(SetupStep.allCases) { step in
                    StepCard(step: step, state: stepState(step), isCurrent: step == currentStep) {
                        content(for: step)
                    }
                }
                if let error {
                    Label(error, systemImage: "exclamationmark.triangle.fill")
                        .foregroundStyle(.orange)
                        .font(.callout)
                }
                HStack {
                    Button("Skip setup") { finish(relaunch: false) }
                        .buttonStyle(.link)
                    Spacer()
                }
            }
            .padding(24)
        }
        .tint(.clodAccent)
        .task { await send("refresh") }
    }

    private var header: some View {
        HStack(spacing: 14) {
            Image(nsImage: NSApp.applicationIconImage)
                .resizable()
                .frame(width: 56, height: 56)
            VStack(alignment: .leading, spacing: 3) {
                Text("Welcome to Clod").font(.title2.weight(.semibold))
                Text("A few steps and you're ready. This takes about five minutes.")
                    .foregroundStyle(.secondary)
            }
        }
    }

    // MARK: Steps

    private func isDone(_ step: SetupStep) -> Bool {
        switch step {
        case .install: return status.cliInstalled
        case .signIn: return status.loggedIn
        case .shortcut: return status.accessibility
        case .screenshots: return status.screen == "granted"
        case .terminal: return status.automation == "granted"
        case .finish: return false
        }
    }

    private var currentStep: SetupStep {
        SetupStep.allCases.first { !isDone($0) && !skipped.contains($0) } ?? .finish
    }

    private func stepState(_ step: SetupStep) -> StepState {
        if isDone(step) { return .done }
        if skipped.contains(step) { return .skipped }
        return step == currentStep ? .current : .upcoming
    }

    @ViewBuilder
    private func content(for step: SetupStep) -> some View {
        switch step {
        case .install: installContent
        case .signIn: signInContent
        case .shortcut: shortcutContent
        case .screenshots: screenshotsContent
        case .terminal: terminalContent
        case .finish: finishContent
        }
    }

    @ViewBuilder
    private var installContent: some View {
        if status.cliInstalled {
            Text("Claude Code \(status.cliVersion ?? "") is installed.").foregroundStyle(.secondary)
        } else {
            Text("Clod is a window for Claude Code, Anthropic's assistant that can read and edit files on your Mac. This downloads it from Anthropic. It takes about a minute.")
            if status.task("install") && status.isRunning {
                ProgressView { Text(status.taskMessage).lineLimit(1).font(.callout) }
            } else {
                if status.task("install") && status.taskState == "failed" {
                    Text(status.taskMessage).foregroundStyle(.orange).font(.callout)
                }
                Button("Install Claude Code") { Task { await send("installCli") } }
                    .buttonStyle(.borderedProminent)
            }
        }
    }

    @ViewBuilder
    private var signInContent: some View {
        if status.loggedIn {
            Text(status.accountSummary).foregroundStyle(.secondary)
        } else {
            SignInPanel()
        }
    }

    @ViewBuilder
    private var shortcutContent: some View {
        if status.accessibility {
            Text("Done. Double-tap ⌥ Option will work once Clod restarts at the end.").foregroundStyle(.secondary)
        } else {
            Text("Lets you open Clod from any app by double-tapping the ⌥ Option key. Clod only watches for that key.")
            Text("Click Allow, then turn on **Clod** in the list that opens in System Settings. Come back here when it's on.")
                .foregroundStyle(.secondary)
            Button("Allow…") {
                Task {
                    await send("requestPermission", ["name": "accessibility"])
                    await send("openPrivacyPane", ["name": "accessibility"])
                }
            }
            .buttonStyle(.borderedProminent)
        }
    }

    @ViewBuilder
    private var screenshotsContent: some View {
        if status.screen == "granted" {
            Text("Done.").foregroundStyle(.secondary)
        } else {
            Text("Only needed for the camera button, which sends Claude a picture of part of your screen. Clod never looks at your screen on its own.")
            Text("Click Allow, then turn on **Clod** under Screen Recording. If macOS offers to quit and reopen Clod, choose Quit & Reopen. This window stays open.")
                .foregroundStyle(.secondary)
            HStack {
                Button("Allow…") {
                    Task {
                        await send("requestPermission", ["name": "screen"])
                        await send("openPrivacyPane", ["name": "screen"])
                    }
                }
                .buttonStyle(.borderedProminent)
                Button("Skip for now") { skipped.insert(.screenshots) }
            }
        }
    }

    @ViewBuilder
    private var terminalContent: some View {
        if status.automation == "granted" {
            Text("Done.").foregroundStyle(.secondary)
        } else {
            Text("Only needed for the Terminal button, which continues a conversation in the Terminal app.")
            if status.automation == "denied" {
                Text("This was turned off. Turn on **Terminal** under Clod in System Settings → Automation.")
                    .foregroundStyle(.secondary)
            } else {
                Text("Click Allow, then choose **Allow** when macOS asks. Terminal may open for a moment.")
                    .foregroundStyle(.secondary)
            }
            HStack {
                Button(status.automation == "denied" ? "Open System Settings…" : "Allow…") {
                    Task {
                        if status.automation == "denied" { await send("openPrivacyPane", ["name": "automation"]) }
                        else { await send("requestPermission", ["name": "automation"]) }
                    }
                }
                .buttonStyle(.borderedProminent)
                Button("Skip for now") { skipped.insert(.terminal) }
            }
        }
    }

    @ViewBuilder
    private var finishContent: some View {
        Text("Clod restarts so everything takes effect. Then double-tap ⌥ Option, type a question and press Return.")
        Text("You can come back to these steps any time from Settings → Account.")
            .foregroundStyle(.secondary)
        Button("Finish and restart Clod") { finish(relaunch: true) }
            .buttonStyle(.borderedProminent)
            .disabled(!status.cliInstalled || !status.loggedIn)
        if !status.cliInstalled || !status.loggedIn {
            Text("Install Claude Code and sign in first.").font(.callout).foregroundStyle(.secondary)
        }
    }

    // MARK: Actions

    private func finish(relaunch: Bool) {
        model.set("setupCompleted", true)
        model.set("showSetup", false)
        if relaunch { Task { await send("relaunch") } }
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

enum SetupStep: Int, CaseIterable, Identifiable {
    case install, signIn, shortcut, screenshots, terminal, finish
    var id: Int { rawValue }

    var title: String {
        switch self {
        case .install: return "Install Claude Code"
        case .signIn: return "Sign in"
        case .shortcut: return "Allow the shortcut"
        case .screenshots: return "Allow screenshots (optional)"
        case .terminal: return "Allow Terminal (optional)"
        case .finish: return "Try it"
        }
    }
}

/// One numbered step. Only the current step shows its details.
enum StepState { case done, current, upcoming, skipped }

struct StepCard<Content: View>: View {
    let step: SetupStep
    let state: StepState
    let isCurrent: Bool
    @ViewBuilder let content: () -> Content

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            badge
            VStack(alignment: .leading, spacing: 8) {
                Text(step.title)
                    .font(.headline)
                    .foregroundStyle(state == .upcoming || state == .skipped ? .secondary : .primary)
                if isCurrent {
                    content()
                } else if state == .skipped {
                    Text("Skipped. You can allow this later in Settings → Permissions.")
                        .font(.callout).foregroundStyle(.secondary)
                }
            }
            Spacer(minLength: 0)
        }
        .padding(14)
        .background(
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .fill(isCurrent ? Color.clodAccent.opacity(0.08) : Color.primary.opacity(0.03))
        )
        .overlay(
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .strokeBorder(isCurrent ? Color.clodAccent.opacity(0.5) : .clear)
        )
    }

    @ViewBuilder
    private var badge: some View {
        ZStack {
            Circle().fill(state == .done ? Color.green : isCurrent ? Color.clodAccent : Color.secondary.opacity(0.25))
            if state == .done {
                Image(systemName: "checkmark").font(.system(size: 11, weight: .bold)).foregroundStyle(.white)
            } else {
                Text("\(step.rawValue + 1)").font(.system(size: 12, weight: .semibold)).foregroundStyle(.white)
            }
        }
        .frame(width: 24, height: 24)
    }
}

/// Signing in: with Claude in the browser (subscription or API account), or by
/// pasting a token or API key. Used by setup and by Settings → Account.
struct SignInPanel: View {
    @EnvironmentObject var model: SettingsModel
    @State private var code = ""
    @State private var showPaste = false
    @State private var error: String?

    private var status: SetupStatus { model.setup }
    private var signingIn: Bool { status.task("login") && status.isRunning }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            if signingIn {
                Text("Your browser opened a Claude sign-in page. Approve it there.")
                Text("If the page shows a code, copy it and paste it here:").foregroundStyle(.secondary)
                HStack {
                    TextField("Code from the browser", text: $code)
                        .textFieldStyle(.roundedBorder)
                        .onSubmit(submitCode)
                    Button("Continue", action: submitCode)
                        .buttonStyle(.borderedProminent)
                        .disabled(code.trimmingCharacters(in: .whitespaces).isEmpty)
                }
                HStack {
                    if let url = status.taskURL, let link = URL(string: url) {
                        Button("Open the sign-in page again") { NSWorkspace.shared.open(link) }
                            .buttonStyle(.link)
                    }
                    Spacer()
                    Button("Cancel") { Task { await send("cancelLogin") } }
                }
                .font(.callout)
            } else {
                Text("Use your Claude account. Signing in with Claude needs a Pro or Max plan. With an Anthropic API account you pay for what you use instead.")
                if status.task("login") && status.taskState == "failed" {
                    Text(status.taskMessage).foregroundStyle(.orange).font(.callout)
                }
                HStack {
                    Button("Sign in with Claude") { Task { await send("login", ["method": "claudeai"]) } }
                        .buttonStyle(.borderedProminent)
                    Button("Sign in with an API account") { Task { await send("login", ["method": "console"]) } }
                }
                .disabled(!status.cliInstalled)
                Button(showPaste ? "Hide" : "Paste a token or API key instead…") { showPaste.toggle() }
                    .buttonStyle(.link)
                    .font(.callout)
                if showPaste { CredentialForm() }
            }
            if let error {
                Text(error).foregroundStyle(.orange).font(.callout)
            }
        }
    }

    private func submitCode() {
        let value = code
        code = ""
        Task { await send("submitCode", ["code": value]) }
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

/// Paste a Claude token (from `claude setup-token`) or an Anthropic API key.
/// Clod stores it encrypted with the Keychain; it never goes in a settings file.
struct CredentialForm: View {
    @State private var kind = "apiKey"
    @State private var value = ""
    @State private var message: String?
    @State private var failed = false

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Picker("", selection: $kind) {
                Text("API key").tag("apiKey")
                Text("Claude token").tag("oauthToken")
            }
            .pickerStyle(.segmented)
            .labelsHidden()
            Text(kind == "apiKey"
                 ? "Create a key at console.anthropic.com under API keys. It starts with sk-ant-api."
                 : "In Terminal, run `claude setup-token` and sign in. Copy the token it prints. It lasts a year.")
                .font(.callout)
                .foregroundStyle(.secondary)
            HStack {
                SecureField(kind == "apiKey" ? "sk-ant-api…" : "sk-ant-oat…", text: $value)
                    .textFieldStyle(.roundedBorder)
                Button("Save") { save() }
                    .disabled(value.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
            }
            if let message {
                Text(message).font(.callout).foregroundStyle(failed ? .orange : .secondary)
            }
        }
    }

    private func save() {
        let pasted = value
        Task {
            do {
                try await ClodControl.send("setCredential", ["kind": kind, "value": pasted])
                value = ""
                failed = false
                message = "Saved. Clod will use it from now on."
            } catch {
                failed = true
                message = error.localizedDescription
            }
        }
    }
}
