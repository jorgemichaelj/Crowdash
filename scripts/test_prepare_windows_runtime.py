import hashlib
import io
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import zipfile

import prepare_windows_runtime as runtime


class RuntimePackagingTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.root = Path(self.directory.name)

    def test_refuses_a_corrupt_download_and_removes_partial_file(self):
        asset = {"url": "https://github.com/vendor/repo/releases/download/v1/tool.exe", "sha256": "a" * 64}
        with patch.object(runtime, "urlopen", return_value=io.BytesIO(b"corrupt")):
            with self.assertRaisesRegex(ValueError, "SHA256 mismatch"):
                runtime.download(asset, self.root)
        self.assertEqual(list(self.root.iterdir()), [])

    def test_rechecks_cached_files_instead_of_trusting_existing_names(self):
        data = b"MZverified fixture"
        checksum = hashlib.sha256(data).hexdigest()
        (self.root / checksum).write_bytes(b"tampered")
        asset = {"url": "https://github.com/vendor/repo/releases/download/v1/tool.exe", "sha256": checksum}
        with patch.object(runtime, "urlopen", return_value=io.BytesIO(data)) as fetch:
            self.assertEqual(runtime.download(asset, self.root).read_bytes(), data)
            fetch.assert_called_once()

    def test_rejects_a_selected_zip_entry_that_would_escape_the_archive_directory(self):
        data = io.BytesIO()
        with zipfile.ZipFile(data, "w") as archive:
            archive.writestr("../ffmpeg.exe", b"MZfixture")
        with zipfile.ZipFile(data) as archive:
            with self.assertRaisesRegex(ValueError, "Unsafe archive"):
                runtime.zip_entry(archive, "ffmpeg.exe")

    def test_incomplete_runtime_does_not_replace_previous_valid_output(self):
        output = self.root / "runtime"
        output.mkdir()
        (output / "previous.txt").write_text("keep until validated")
        asset = self.root / "invalid.exe"
        asset.write_bytes(b"not a Windows executable")
        config = {"platform": "windows-x64", "tools": [{"name": "fixture", "version": "1", "url": "https://github.com/vendor/tool.exe", "sha256": "a" * 64, "source": "source", "files": ["tool.exe"]}]}
        with patch.object(runtime, "download", return_value=asset):
            with self.assertRaisesRegex(ValueError, "not a Windows executable"):
                runtime.prepare(config, output, self.root / "cache")
        self.assertEqual((output / "previous.txt").read_text(), "keep until validated")


if __name__ == "__main__":
    unittest.main()
