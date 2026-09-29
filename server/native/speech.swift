// speech.swift — PokkaTomo 的語音辨識小幫手（macOS 內建的 Speech 框架）。
//
// 手機錄的音（WAV）傳到 Mac，server/speechService.js 用 `open` 叫起這個小 App（PokkaTomoSpeech.app），
// 辨識完把結果（JSON 一行）寫到 stdout。用 .app＋`open` 而不是直接執行：這樣 macOS 問「是否允許語音辨識」時
// 問的是「PokkaTomo 語音辨識」自己（Info.plist 裡有說明文字），不會算在終端機頭上。
//
// 用法：
//   PokkaTomoSpeech --authorize            要求語音辨識權限（第一次會跳出系統詢問），輸出 {"status": "..."}
//   PokkaTomoSpeech <音檔> <語言>           例如 /tmp/a.wav ja-JP，輸出 {"text": "...", "onDevice": true}
//                                          失敗：{"error": "代碼", "message": "..."}
// 盡量在這台電腦上辨識（requiresOnDeviceRecognition）；這台電腦沒有那個語言的離線辨識時，才改用 Apple 的伺服器。
//
// 編譯（speechService.js 會自動做）：xcrun swiftc -O -swift-version 5 speech.swift -o PokkaTomoSpeech

import Foundation
import Speech

setvbuf(stdout, nil, _IOLBF, 0)

func output(_ dict: [String: Any]) {
  if let data = try? JSONSerialization.data(withJSONObject: dict), let s = String(data: data, encoding: .utf8) {
    print(s)
  }
}

func statusName(_ s: SFSpeechRecognizerAuthorizationStatus) -> String {
  switch s {
  case .authorized: return "authorized"
  case .denied: return "denied"
  case .restricted: return "restricted"
  case .notDetermined: return "notDetermined"
  @unknown default: return "unknown"
  }
}

// 回呼裡要改的值放在 class 裡（Swift 不讓 @Sendable 的回呼直接改外面的 var）
final class Box<T>: @unchecked Sendable {
  var value: T
  init(_ v: T) { value = v }
}

// 等待非同步的結果：一邊轉 main run loop（Speech 的回呼預設在 main queue）
func spin(until done: () -> Bool, timeout: TimeInterval) {
  let deadline = Date().addingTimeInterval(timeout)
  while !done() && Date() < deadline {
    RunLoop.main.run(until: Date(timeIntervalSinceNow: 0.05))
  }
}

func ensureAuthorized() -> SFSpeechRecognizerAuthorizationStatus {
  let current = SFSpeechRecognizer.authorizationStatus()
  if current != .notDetermined { return current }
  let status = Box(current)
  let answered = Box(false)
  SFSpeechRecognizer.requestAuthorization { s in
    DispatchQueue.main.async {
      status.value = s
      answered.value = true
    }
  }
  // 使用者要在 Mac 的畫面上按「允許」，給久一點
  spin(until: { answered.value }, timeout: 120)
  return status.value
}

struct Outcome {
  var text: String = ""
  var error: NSError? = nil
}

func recognize(url: URL, recognizer: SFSpeechRecognizer, onDevice: Bool) -> Outcome {
  let request = SFSpeechURLRecognitionRequest(url: url)
  request.shouldReportPartialResults = false
  request.requiresOnDeviceRecognition = onDevice
  if #available(macOS 13.0, *) { request.addsPunctuation = true }
  let outcome = Box(Outcome())
  let finished = Box(false)
  let task = recognizer.recognitionTask(with: request) { result, error in
    let text = result?.bestTranscription.formattedString
    let isFinal = result?.isFinal ?? false
    let err = error as NSError?
    DispatchQueue.main.async {
      if let t = text { outcome.value.text = t }
      if isFinal { finished.value = true }
      if let e = err {
        outcome.value.error = e
        finished.value = true
      }
    }
  }
  spin(until: { finished.value }, timeout: 45)
  if !finished.value {
    task.cancel()
    outcome.value.error = NSError(domain: "PokkaTomo", code: -1, userInfo: [NSLocalizedDescriptionKey: "timeout"])
  }
  return outcome.value
}

let args = Array(CommandLine.arguments.dropFirst())

if args.first == "--authorize" {
  output(["status": statusName(ensureAuthorized())])
  exit(0)
}

guard args.count >= 2 else {
  output(["error": "usage", "message": "PokkaTomoSpeech <audio-file> <locale> | --authorize"])
  exit(2)
}

let status = ensureAuthorized()
guard status == .authorized else {
  output(["error": "not_authorized", "status": statusName(status), "message": "speech recognition not authorized"])
  exit(3)
}

guard let recognizer = SFSpeechRecognizer(locale: Locale(identifier: args[1])) else {
  output(["error": "unsupported_locale", "message": args[1]])
  exit(4)
}
guard recognizer.isAvailable else {
  output(["error": "unavailable", "message": "recognizer not available"])
  exit(5)
}

let url = URL(fileURLWithPath: args[0])
let tryOnDevice = recognizer.supportsOnDeviceRecognition
var result = recognize(url: url, recognizer: recognizer, onDevice: tryOnDevice)
var usedOnDevice = tryOnDevice

// 「沒聽到聲音」不是錯誤：回傳空字串
func isNoSpeech(_ e: NSError) -> Bool {
  return (e.domain == "kAFAssistantErrorDomain" && (e.code == 1110 || e.code == 203)) ||
    e.localizedDescription.lowercased().contains("no speech")
}

if let e = result.error, result.text.isEmpty, !isNoSpeech(e), tryOnDevice {
  // 離線辨識失敗（例如這個語言的離線資料還沒下載）→ 改用伺服器辨識再試一次
  result = recognize(url: url, recognizer: recognizer, onDevice: false)
  usedOnDevice = false
}

if let e = result.error, result.text.isEmpty, !isNoSpeech(e) {
  output(["error": "recognition_failed", "message": "\(e.domain) \(e.code): \(e.localizedDescription)"])
  exit(6)
}
output(["text": result.text, "onDevice": usedOnDevice])
exit(0)
