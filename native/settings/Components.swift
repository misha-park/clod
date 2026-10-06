import AppKit
import SwiftUI

extension Color {
    /// Clod's accent, matching the overlay (#C15F3C).
    static let clodAccent = Color(red: 0xC1 / 255, green: 0x5F / 255, blue: 0x3C / 255)
}

/// A System Settings–style icon: a white symbol on a small coloured tile.
struct SettingIcon: View {
    let symbol: String
    let color: Color

    var body: some View {
        RoundedRectangle(cornerRadius: 6, style: .continuous)
            .fill(color.gradient)
            .frame(width: 22, height: 22)
            .overlay(
                Image(systemName: symbol)
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(.white)
            )
    }
}

/// A row label with its icon tile.
struct RowLabel: View {
    let title: String
    let symbol: String
    let color: Color

    init(_ title: String, symbol: String, color: Color) {
        self.title = title
        self.symbol = symbol
        self.color = color
    }

    var body: some View {
        HStack(spacing: 10) {
            SettingIcon(symbol: symbol, color: color)
            Text(title)
        }
    }
}

/// Top of the window: Clod's icon, name, version and a one-line status.
struct HeaderView: View {
    @EnvironmentObject var model: SettingsModel
    @State private var clodRunning = SettingsHeaderStatus.isClodRunning()

    private let refresh = Timer.publish(every: 2, on: .main, in: .common).autoconnect()

    var body: some View {
        HStack(spacing: 14) {
            Image(nsImage: NSApp.applicationIconImage)
                .resizable()
                .frame(width: 56, height: 56)
            VStack(alignment: .leading, spacing: 3) {
                HStack(alignment: .firstTextBaseline, spacing: 6) {
                    Text("Clod").font(.title2.weight(.semibold))
                    Text("Version \(SettingsHeaderStatus.version)")
                        .font(.callout)
                        .foregroundStyle(.secondary)
                }
                HStack(spacing: 6) {
                    statusDot(clodRunning ? .green : .secondary)
                    Text(statusLine)
                        .font(.callout)
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                }
            }
            Spacer(minLength: 0)
        }
        .padding(.vertical, 4)
        .onReceive(refresh) { _ in clodRunning = SettingsHeaderStatus.isClodRunning() }
    }

    private var statusLine: String {
        var parts = [clodRunning ? "Running" : "Not running"]
        if let label = model.models.first(where: { $0.id == model.preferredModel })?.label {
            parts.append(label)
        }
        if let granted = model.accessibilityGranted {
            parts.append(granted ? "Accessibility granted" : "Accessibility needed")
        }
        return parts.joined(separator: " · ")
    }

    private func statusDot(_ color: Color) -> some View {
        Circle().fill(color).frame(width: 7, height: 7)
    }
}

enum SettingsHeaderStatus {
    static var version: String {
        Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "–"
    }

    static func isClodRunning() -> Bool {
        !NSRunningApplication.runningApplications(withBundleIdentifier: "com.clod.app").isEmpty
    }
}
