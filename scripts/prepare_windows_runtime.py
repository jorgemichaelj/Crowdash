"""Assemble verified Windows tools for the installer; never execute downloaded files here."""
import argparse
import hashlib
import json
from pathlib import Path, PurePosixPath
import shutil
import tempfile
from urllib.request import Request, urlopen
import zipfile

ROOT = Path(__file__).resolve().parents[1]
ALLOWED_HOSTS = {"github.com", "raw.githubusercontent.com"}


def digest(path):
    with Path(path).open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def download(asset, cache):
    from urllib.parse import urlparse
    parsed = urlparse(asset["url"])
    if parsed.scheme != "https" or parsed.hostname not in ALLOWED_HOSTS:
        raise ValueError("Use an official HTTPS download URL")
    checksum = asset["sha256"].lower()
    if len(checksum) != 64 or any(c not in "0123456789abcdef" for c in checksum):
        raise ValueError("A pinned SHA256 is required")
    cache.mkdir(parents=True, exist_ok=True)
    target = cache / checksum
    if target.is_file() and digest(target) == checksum:
        return target
    temporary = target.with_suffix(".download")
    try:
        request = Request(asset["url"], headers={"User-Agent": "CrowDash-build/0.1.0"})
        with urlopen(request, timeout=120) as response, temporary.open("wb") as output:
            shutil.copyfileobj(response, output)
        if digest(temporary) != checksum:
            raise ValueError(f"SHA256 mismatch for {asset['url']}")
        temporary.replace(target)
    finally:
        temporary.unlink(missing_ok=True)
    return target


def zip_entry(archive, name):
    matches = [item for item in archive.infolist() if PurePosixPath(item.filename).name == name]
    if len(matches) != 1:
        raise ValueError(f"Expected exactly one {name} in archive")
    entry = matches[0]
    path = PurePosixPath(entry.filename)
    if path.is_absolute() or ".." in path.parts or "\\" in entry.filename or ":" in entry.filename:
        raise ValueError("Unsafe archive entry")
    return archive.read(entry)


def prepare(config, output, cache):
    output.parent.mkdir(parents=True, exist_ok=True)
    # Publish the directory only after all archives and required files pass validation.
    with tempfile.TemporaryDirectory(prefix="crowdash-runtime-", dir=output.parent) as staging:
        stage = Path(staging)
        notices = stage / "notices"
        notices.mkdir()
        records = []
        for tool in config["tools"]:
            print(f"Verificando {tool['name']} {tool['version']}…", flush=True)
            archive = download(tool, cache)
            if tool["url"].endswith(".zip"):
                with zipfile.ZipFile(archive) as zipped:
                    for name in tool["files"]:
                        (stage / name).write_bytes(zip_entry(zipped, name))
                    for name in tool.get("notices", []):
                        (notices / f"{tool['name']}-{name}").write_bytes(zip_entry(zipped, name))
            else:
                if len(tool["files"]) != 1:
                    raise ValueError("Direct assets must contain one executable")
                shutil.copyfile(archive, stage / tool["files"][0])
            if "license" in tool:
                shutil.copyfile(download(tool["license"], cache), notices / f"{tool['name']}-LICENSE.txt")
            for name in tool["files"]:
                with (stage / name).open("rb") as stream:
                    if stream.read(2) != b"MZ":
                        raise ValueError(f"{name} is not a Windows executable")
            records.append({**{k: v for k, v in tool.items() if k != "license"},
                            "executables": {name: digest(stage / name) for name in tool["files"]}})
        (stage / "manifest.json").write_text(json.dumps({"platform": config["platform"], "tools": records}, indent=2) + "\n", encoding="utf-8")
        sources = [f"{t['name']} {t['version']}\nDownload: {t['url']}\nSource: {t['source']}\nBuild: {t.get('build', t['source'])}" for t in config["tools"]]
        (notices / "SOURCES.txt").write_text("CrowDash 0.1.0 — third-party command-line tools\n\n" + "\n\n".join(sources) + "\n", encoding="utf-8")
        if output.exists():
            shutil.rmtree(output)
        shutil.copytree(stage, output)
    print(f"Runtime preparado em {output}", flush=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, default=ROOT / "apps/desktop/src-tauri/runtime/windows-x64")
    parser.add_argument("--cache", type=Path, default=ROOT / ".cache/windows-runtime")
    options = parser.parse_args()
    config = json.loads((ROOT / "scripts/windows-runtime.json").read_text())
    prepare(config, options.output, options.cache)
