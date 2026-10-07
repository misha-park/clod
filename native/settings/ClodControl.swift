import Foundation

/// Sends commands to Clod over its control socket (see src/main/setup.ts).
/// Permission requests, installing Claude Code and signing in have to run
/// inside Clod itself, so this app asks Clod to do them.
enum ClodControl {
    static let socketPath = FileManager.default
        .urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        .appendingPathComponent("Clod/control.sock").path

    struct Failure: LocalizedError {
        let message: String
        var errorDescription: String? { message }
    }

    /// Sends one command and waits for Clod's reply. Throws with Clod's error message.
    static func send(_ cmd: String, _ args: [String: String] = [:]) async throws {
        try await Task.detached { try sendBlocking(cmd, args) }.value
    }

    private static func sendBlocking(_ cmd: String, _ args: [String: String]) throws {
        let fd = socket(AF_UNIX, SOCK_STREAM, 0)
        guard fd >= 0 else { throw Failure(message: "Couldn't reach Clod.") }
        defer { close(fd) }

        var addr = sockaddr_un()
        addr.sun_family = sa_family_t(AF_UNIX)
        let path = Array(socketPath.utf8)
        guard path.count < MemoryLayout.size(ofValue: addr.sun_path) else {
            throw Failure(message: "Clod's folder path is too long.")
        }
        withUnsafeMutableBytes(of: &addr.sun_path) { buffer in
            buffer.copyBytes(from: path)
            buffer[path.count] = 0
        }
        let connected = withUnsafePointer(to: &addr) {
            $0.withMemoryRebound(to: sockaddr.self, capacity: 1) {
                connect(fd, $0, socklen_t(MemoryLayout<sockaddr_un>.size))
            }
        }
        guard connected == 0 else { throw Failure(message: "Clod isn't running. Open Clod, then try again.") }

        var timeout = timeval(tv_sec: 30, tv_usec: 0)
        setsockopt(fd, SOL_SOCKET, SO_RCVTIMEO, &timeout, socklen_t(MemoryLayout<timeval>.size))

        var payload: [String: Any] = args
        payload["id"] = 1
        payload["cmd"] = cmd
        var data = try JSONSerialization.data(withJSONObject: payload)
        data.append(0x0A)
        let sent = data.withUnsafeBytes { write(fd, $0.baseAddress, data.count) }
        guard sent == data.count else { throw Failure(message: "Couldn't reach Clod.") }

        var reply = Data()
        var chunk = [UInt8](repeating: 0, count: 4096)
        while !reply.contains(0x0A) {
            let n = read(fd, &chunk, chunk.count)
            if n <= 0 { break }
            reply.append(chunk, count: n)
        }
        guard let line = reply.split(separator: 0x0A).first,
              let object = try? JSONSerialization.jsonObject(with: Data(line)) as? [String: Any] else {
            throw Failure(message: "Clod didn't reply.")
        }
        if object["ok"] as? Bool != true {
            throw Failure(message: object["error"] as? String ?? "Something went wrong.")
        }
    }
}

/// Setup and account status published by Clod in state.json ("setup").
struct SetupStatus: Equatable {
    var cliInstalled = false
    var cliVersion: String?
    var loggedIn = false
    var authMethod: String?
    var email: String?
    var orgName: String?
    var subscription: String?
    /// "oauthToken" or "apiKey" when one was pasted into Clod
    var credential: String?
    var accessibility = false
    /// Electron's media access status: "granted", "denied", "not-determined", …
    var screen = "not-determined"
    /// "granted", "denied" or "unknown"
    var automation = "unknown"
    var taskKind: String?
    var taskState: String?
    var taskMessage = ""
    var taskURL: String?
    /// Signing in in a Terminal window (the fallback)
    var taskTerminal = false

    /// False until Clod has published anything (e.g. an older Clod is running).
    var known = false

    init() {}

    init(_ d: [String: Any]) {
        known = true
        let cli = d["cli"] as? [String: Any] ?? [:]
        cliInstalled = cli["installed"] as? Bool ?? false
        cliVersion = cli["version"] as? String
        let auth = d["auth"] as? [String: Any] ?? [:]
        loggedIn = auth["loggedIn"] as? Bool ?? false
        authMethod = auth["method"] as? String
        email = auth["email"] as? String
        orgName = auth["orgName"] as? String
        subscription = auth["subscription"] as? String
        credential = d["credential"] as? String
        let permissions = d["permissions"] as? [String: Any] ?? [:]
        accessibility = permissions["accessibility"] as? Bool ?? false
        screen = permissions["screen"] as? String ?? "not-determined"
        automation = permissions["automation"] as? String ?? "unknown"
        if let task = d["task"] as? [String: Any] {
            taskKind = task["kind"] as? String
            taskState = task["state"] as? String
            taskMessage = task["message"] as? String ?? ""
            taskURL = task["url"] as? String
            taskTerminal = task["terminal"] as? Bool ?? false
        }
    }

    var isRunning: Bool { taskState == "running" }

    /// Signed in with a claude.ai account that has no paid plan. Claude Code
    /// needs Pro, Max, Team or Enterprise, or an API account instead.
    var needsPaidPlan: Bool {
        guard loggedIn, credential == nil, authMethod == "claude.ai" else { return false }
        let plan = (subscription ?? "").lowercased()
        return !["pro", "max", "team", "enterprise"].contains { plan.contains($0) }
    }

    /// Signed in with an account that can use Claude Code.
    var canUseClaude: Bool { loggedIn && !needsPaidPlan }
    func task(_ kind: String) -> Bool { taskKind == kind }

    /// One line describing who Claude Code is signed in as.
    var accountSummary: String {
        if credential == "apiKey" { return "Using a pasted API key" }
        if credential == "oauthToken" { return "Using a pasted Claude token" }
        guard loggedIn else { return cliInstalled ? "Not signed in" : "Claude Code isn't installed" }
        var parts = [email ?? "Signed in"]
        if let plan = subscription, !plan.isEmpty { parts.append("Claude \(plan.capitalized)") }
        else if authMethod == "console" || authMethod == "api_key" { parts.append("API account") }
        return parts.joined(separator: " · ")
    }
}
