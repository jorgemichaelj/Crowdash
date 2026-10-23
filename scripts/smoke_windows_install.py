"""CI: install the real NSIS package, download through its Native Messaging host, uninstall."""
import argparse
import functools
import hashlib
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import json
import os
from pathlib import Path
import struct
import subprocess
import tempfile
import threading
import time

ROOT = Path(__file__).resolve().parents[1]


def execute(arguments, **options):
    return subprocess.run([str(arg) for arg in arguments], check=True, capture_output=True, timeout=120,
                          creationflags=subprocess.CREATE_NO_WINDOW, **options)


def startup_diagnostics(process, log_path, expected_endpoint):
    print(f"Startup timeout: PID={process.pid}, exit={process.poll()}, endpoint={expected_endpoint}", flush=True)
    if log_path.exists():
        print(log_path.read_text(encoding="utf-8", errors="replace")[-6000:], flush=True)
    for base in ["APPDATA", "LOCALAPPDATA"]:
        candidate = Path(os.environ[base]) / "Crowdash/native-messaging/endpoint.json"
        print(f"{base} endpoint exists: {candidate.exists()}", flush=True)
    try:
        import ctypes
        from ctypes import wintypes
        user = ctypes.windll.user32
        callback_type = ctypes.WINFUNCTYPE(wintypes.BOOL, wintypes.HWND, wintypes.LPARAM)
        def inspect_window(handle, _):
            pid = wintypes.DWORD()
            user.GetWindowThreadProcessId(handle, ctypes.byref(pid))
            if pid.value == process.pid:
                text = ctypes.create_unicode_buffer(512)
                user.GetWindowTextW(handle, text, len(text))
                if text.value:
                    print(f"Application window: {text.value}", flush=True)
            return True
        user.EnumWindows(callback_type(inspect_window), 0)
    except Exception as error:
        print(f"Window diagnostics: {error}", flush=True)


def run(installer):
    if os.name != "nt" or os.environ.get("GITHUB_ACTIONS") != "true":
        raise RuntimeError("This installation smoke test runs only on the isolated Windows CI runner")
    # No yt-dlp, FFmpeg, Deno, Node or Rust from the runner may be used by the installed app.
    environment = {**os.environ, "PATH": os.pathsep.join([os.path.join(os.environ["SystemRoot"], "System32"), os.environ["SystemRoot"]])}
    config = Path(os.environ["APPDATA"]) / "com.crowdash.app" / "settings.json"
    previous = config.read_bytes() if config.exists() else None
    endpoint = Path(os.environ["APPDATA"]) / "Crowdash/native-messaging/endpoint.json"
    extension_id = json.loads((ROOT / "packages/shared/src/protocol/nativeHost.json").read_text())["extensionId"]
    app = None
    server = None
    with tempfile.TemporaryDirectory(prefix="CrowDash installed test ") as folder:
        root = Path(folder)
        install = root / "CrowDash com espaços"
        # Hosted runners can have no usable GPU. Exercise the same GUI with software rendering.
        environment["WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS"] = "--disable-gpu"
        environment["WEBVIEW2_USER_DATA_FOLDER"] = str(root / "webview-profile")
        environment["RUST_LOG"] = "crowdash=debug,tauri=debug,wry=debug"
        try:
            result = subprocess.run(f'"{installer}" /S /D={install}', timeout=240, creationflags=subprocess.CREATE_NO_WINDOW)
            if result.returncode not in (0, 3010):
                raise RuntimeError(f"NSIS installation failed: {result.returncode}")
            executable = next(path for path in install.glob("*.exe") if path.stem.lower() == "crowdash")
            runtime = install / "runtime"
            manifest = json.loads((runtime / "manifest.json").read_text())
            for tool in manifest["tools"]:
                for name, checksum in tool["executables"].items():
                    assert hashlib.sha256((runtime / name).read_bytes()).hexdigest() == checksum, name
                    flag = "-version" if name in ("ffmpeg.exe", "ffprobe.exe") else "--version"
                    execute([runtime / name, flag], env=environment)
            assert (install / "extension/manifest.json").is_file()
            print("PASS installer: tools and extension installed, checksums valid, tools run without system PATH", flush=True)

            fixtures = root / "fixtures"
            fixtures.mkdir()
            ffmpeg = runtime / "ffmpeg.exe"
            execute([ffmpeg, "-v", "error", "-f", "lavfi", "-i", "testsrc=size=160x90:rate=10", "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=44100", "-t", "2", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", fixtures / "sample.mp4"])
            # Relative manifests plus an explicit cwd also keep Windows segment files
            # next to the manifest, rather than in the repository working directory.
            execute([ffmpeg, "-v", "error", "-i", fixtures / "sample.mp4", "-c", "copy", "-hls_time", "1", "-hls_list_size", "0", "stream.m3u8"], cwd=fixtures)
            execute([ffmpeg, "-v", "error", "-i", fixtures / "sample.mp4", "-c", "copy", "-f", "dash", "dash.mpd"], cwd=fixtures)
            for name in ["init-stream0.m4s", "init-stream1.m4s"]:
                assert (fixtures / name).is_file(), f"DASH fixture is missing {name}"
            handler = functools.partial(SimpleHTTPRequestHandler, directory=str(fixtures))
            server = ThreadingHTTPServer(("127.0.0.1", 0), handler)
            threading.Thread(target=server.serve_forever, daemon=True).start()
            downloads = root / "Downloads reais"
            downloads.mkdir()
            config.parent.mkdir(parents=True, exist_ok=True)
            config.write_text(json.dumps({"outputFolder": str(downloads), "hardwareAcceleration": "off", "theme": "dark", "notifyOnComplete": False, "concurrency": 1, "browserSessions": [], "advanced": {"showTechnicalLogs": False}}), encoding="utf-8")
            endpoint.unlink(missing_ok=True)
            log_dir = ROOT / "artifacts/windows"
            log_dir.mkdir(parents=True, exist_ok=True)
            log_path = log_dir / "app-smoke.log"
            with log_path.open("wb") as log:
                app = subprocess.Popen([str(executable)], env=environment, stdout=log, stderr=log)
                for _ in range(480):
                    if endpoint.exists():
                        break
                    if app.poll() is not None:
                        raise RuntimeError(f"Installed app exited before startup: {app.returncode}")
                    time.sleep(0.25)
                if not endpoint.exists():
                    startup_diagnostics(app, log_path, endpoint)
                    raise AssertionError("Installed app did not start its native connection within 120 seconds")
                import winreg
                for browser in [r"Google\Chrome", r"Microsoft\Edge", "Chromium"]:
                    with winreg.OpenKey(winreg.HKEY_CURRENT_USER, fr"Software\{browser}\NativeMessagingHosts\com.crowdash.host") as key:
                        manifest_path = Path(winreg.QueryValue(key, None))
                    native_manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
                    assert Path(native_manifest["path"]).resolve() == executable.resolve()
                    assert native_manifest["allowed_origins"] == [f"chrome-extension://{extension_id}/"]

                def message(payload):
                    data = json.dumps(payload).encode()
                    response = execute([executable, f"chrome-extension://{extension_id}/"], env=environment,
                                       input=struct.pack("<I", len(data)) + data).stdout
                    assert len(response) >= 4 and struct.unpack("<I", response[:4])[0] == len(response) - 4, response[:200]
                    value = json.loads(response[4:])
                    assert value["id"] == payload["id"] and value["ok"], value
                    return value

                assert message({"v": 1, "id": "installed-ping", "type": "ping"})["status"] == "connected"
                print("PASS installed GUI and authenticated Native Messaging executable", flush=True)
                for index, name in enumerate(["sample.mp4", "stream.m3u8", "dash.mpd"]):
                    request = {"v": 1, "id": f"installed-download-{index}", "type": "handoff", "payload": {
                        "mediaUrl": f"http://127.0.0.1:{server.server_port}/{name}", "pageUrl": f"http://127.0.0.1:{server.server_port}/",
                        "kind": ["direct", "hls", "dash"][index], "action": "download", "preset": {"mode": "video", "quality": "best", "container": "mp4"}, "useBrowserSession": False}}
                    before = set(downloads.glob("*.mp4"))
                    response = message(request)
                    assert message(request)["jobId"] == response["jobId"], "Repeated request created another job"
                    completed = False
                    for _ in range(160):
                        for output in set(downloads.glob("*.mp4")) - before:
                            try:
                                probe = json.loads(execute([runtime / "ffprobe.exe", "-v", "quiet", "-show_format", "-show_streams", "-of", "json", output], env=environment).stdout)
                                completed = float(probe["format"]["duration"]) > 1 and {s["codec_type"] for s in probe["streams"]} >= {"audio", "video"}
                            except (subprocess.CalledProcessError, ValueError, KeyError):
                                pass
                        if completed:
                            break
                        time.sleep(0.25)
                    assert completed, f"Installed download did not complete: {name}"
                    print(f"PASS installed {name}: playable MP4 with audio and video", flush=True)
        finally:
            if app is not None and app.poll() is None:
                app.terminate()
                app.wait(timeout=30)
            if server:
                server.shutdown()
                server.server_close()
            uninstallers = list(install.glob("*ninstall*.exe"))
            if uninstallers:
                # _?= keeps NSIS in this process, so waiting actually waits for removal.
                subprocess.run(f'"{uninstallers[0]}" /S _?={install}', check=True, capture_output=True, timeout=120,
                               creationflags=subprocess.CREATE_NO_WINDOW)
            if previous is None:
                config.unlink(missing_ok=True)
            else:
                config.write_bytes(previous)
        assert not (install / "runtime/ffmpeg.exe").exists(), "Uninstaller left runtime files behind"
        for browser in [r"Google\Chrome", r"Microsoft\Edge", "Chromium"]:
            try:
                with winreg.OpenKey(winreg.HKEY_CURRENT_USER, fr"Software\{browser}\NativeMessagingHosts\com.crowdash.host"):
                    raise AssertionError("Uninstaller left Native Messaging registration behind")
            except FileNotFoundError:
                pass
        print("PASS uninstaller removes installed tools and browser registration", flush=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("installer", type=Path)
    run(parser.parse_args().installer.resolve())
