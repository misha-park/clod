// Turns the recorded frames into the film's files, using macOS's own
// frameworks (no ffmpeg needed):
//   clod-film.mp4         1920×1080, 30 fps, H.264 (download page)
//   clod-film.gif         800×450, 10 fps, looping (README)
//   clod-film-poster.jpg  a still for the video before it plays
//
//   encode <frames folder> <output folder>
import AVFoundation
import CoreGraphics
import Foundation
import ImageIO
import UniformTypeIdentifiers

let framesDir = URL(fileURLWithPath: CommandLine.arguments[1])
let outDir = URL(fileURLWithPath: CommandLine.arguments[2])
let fps: Int32 = 30
let names = try FileManager.default.contentsOfDirectory(atPath: framesDir.path).filter { $0.hasSuffix(".png") }.sorted()
guard !names.isEmpty else { fatalError("No frames in \(framesDir.path)") }

func load(_ name: String) -> CGImage {
    let src = CGImageSourceCreateWithURL(framesDir.appendingPathComponent(name) as CFURL, nil)!
    return CGImageSourceCreateImageAtIndex(src, 0, nil)!
}

func scaled(_ image: CGImage, _ width: Int, _ height: Int) -> CGImage {
    let ctx = CGContext(data: nil, width: width, height: height, bitsPerComponent: 8, bytesPerRow: 0,
                        space: CGColorSpace(name: CGColorSpace.sRGB)!, bitmapInfo: CGImageAlphaInfo.noneSkipFirst.rawValue)!
    ctx.interpolationQuality = .high
    ctx.draw(image, in: CGRect(x: 0, y: 0, width: width, height: height))
    return ctx.makeImage()!
}

// ─── MP4 ───
let mp4 = outDir.appendingPathComponent("clod-film.mp4")
try? FileManager.default.removeItem(at: mp4)
let writer = try AVAssetWriter(outputURL: mp4, fileType: .mp4)
let input = AVAssetWriterInput(mediaType: .video, outputSettings: [
    AVVideoCodecKey: AVVideoCodecType.h264,
    AVVideoWidthKey: 1920,
    AVVideoHeightKey: 1080,
    AVVideoColorPropertiesKey: [
        AVVideoColorPrimariesKey: AVVideoColorPrimaries_ITU_R_709_2,
        AVVideoTransferFunctionKey: AVVideoTransferFunction_ITU_R_709_2,
        AVVideoYCbCrMatrixKey: AVVideoYCbCrMatrix_ITU_R_709_2,
    ],
    AVVideoCompressionPropertiesKey: [
        AVVideoAverageBitRateKey: 5_000_000,
        AVVideoProfileLevelKey: AVVideoProfileLevelH264HighAutoLevel,
        AVVideoMaxKeyFrameIntervalKey: 60,
    ],
])
input.expectsMediaDataInRealTime = false
let adaptor = AVAssetWriterInputPixelBufferAdaptor(assetWriterInput: input, sourcePixelBufferAttributes: [
    kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32ARGB,
    kCVPixelBufferWidthKey as String: 1920,
    kCVPixelBufferHeightKey as String: 1080,
])
writer.add(input)
writer.startWriting()
writer.startSession(atSourceTime: .zero)
for (i, name) in names.enumerated() {
    while !input.isReadyForMoreMediaData { usleep(2000) }
    var buffer: CVPixelBuffer?
    CVPixelBufferPoolCreatePixelBuffer(nil, adaptor.pixelBufferPool!, &buffer)
    CVPixelBufferLockBaseAddress(buffer!, [])
    let ctx = CGContext(data: CVPixelBufferGetBaseAddress(buffer!), width: 1920, height: 1080, bitsPerComponent: 8,
                        bytesPerRow: CVPixelBufferGetBytesPerRow(buffer!), space: CGColorSpace(name: CGColorSpace.sRGB)!,
                        bitmapInfo: CGImageAlphaInfo.noneSkipFirst.rawValue)!
    ctx.interpolationQuality = .high
    ctx.draw(load(name), in: CGRect(x: 0, y: 0, width: 1920, height: 1080))
    CVPixelBufferUnlockBaseAddress(buffer!, [])
    adaptor.append(buffer!, withPresentationTime: CMTime(value: CMTimeValue(i), timescale: fps))
}
input.markAsFinished()
let done = DispatchSemaphore(value: 0)
writer.finishWriting { done.signal() }
done.wait()
if writer.status != .completed { fatalError("MP4 failed: \(String(describing: writer.error))") }
print("Wrote \(mp4.lastPathComponent)")

// ─── GIF (every third frame: 10 fps) ───
let gif = outDir.appendingPathComponent("clod-film.gif")
let picks = stride(from: 0, to: names.count, by: 3).map { names[$0] }
let dest = CGImageDestinationCreateWithURL(gif as CFURL, UTType.gif.identifier as CFString, picks.count, nil)!
CGImageDestinationSetProperties(dest, [kCGImagePropertyGIFDictionary: [kCGImagePropertyGIFLoopCount: 0]] as CFDictionary)
for name in picks {
    CGImageDestinationAddImage(dest, scaled(load(name), 800, 450),
        [kCGImagePropertyGIFDictionary: [kCGImagePropertyGIFDelayTime: 0.1, kCGImagePropertyGIFUnclampedDelayTime: 0.1]] as CFDictionary)
}
if !CGImageDestinationFinalize(dest) { fatalError("GIF failed") }
print("Wrote \(gif.lastPathComponent)")

// ─── Poster (Clod at work, from the middle of the film) ───
let poster = outDir.appendingPathComponent("clod-film-poster.jpg")
let posterDest = CGImageDestinationCreateWithURL(poster as CFURL, UTType.jpeg.identifier as CFString, 1, nil)!
CGImageDestinationAddImage(posterDest, load(names[min(names.count - 1, Int(14.0 * Double(fps)))]),
                           [kCGImageDestinationLossyCompressionQuality: 0.88] as CFDictionary)
CGImageDestinationFinalize(posterDest)
print("Wrote \(poster.lastPathComponent)")
