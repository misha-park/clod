// clod-selection: prints the text selected in the frontmost app, using the
// Accessibility API (so the clipboard is left alone). Exits 1 if the app
// doesn't share its selection this way; Clod then falls back to copying it.
import ApplicationServices
import Foundation

let systemWide = AXUIElementCreateSystemWide()
AXUIElementSetMessagingTimeout(systemWide, 0.4)

var focused: CFTypeRef?
guard AXUIElementCopyAttributeValue(systemWide, kAXFocusedUIElementAttribute as CFString, &focused) == .success,
      let element = focused, CFGetTypeID(element) == AXUIElementGetTypeID() else { exit(1) }

var selected: CFTypeRef?
guard AXUIElementCopyAttributeValue(element as! AXUIElement, kAXSelectedTextAttribute as CFString, &selected) == .success,
      let text = selected as? String,
      !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { exit(1) }

FileHandle.standardOutput.write(text.data(using: .utf8)!)
