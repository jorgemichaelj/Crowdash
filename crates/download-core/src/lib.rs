//! URL classification and download plans, independent of the desktop runtime.
pub mod posts;

use anyhow::{anyhow, bail, Result};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use url::Url;

#[derive(Debug, Clone, PartialEq)]
pub enum MediaUrl {
    Video {
        url: String,
        playlist_url: Option<String>,
    },
    Playlist {
        url: String,
    },
    Channel {
        url: String,
        name: String,
    },
}

pub fn classify_url(input: &str) -> Result<MediaUrl> {
    let parsed = Url::parse(input.trim()).map_err(|_| anyhow!("URL_INVALID"))?;
    if !matches!(parsed.scheme(), "http" | "https")
        || !parsed.username().is_empty()
        || parsed.password().is_some()
    {
        bail!("URL_INVALID");
    }
    let host = parsed.host_str().ok_or_else(|| anyhow!("URL_INVALID"))?;
    let youtube = matches!(
        host,
        "youtube.com" | "www.youtube.com" | "m.youtube.com" | "music.youtube.com"
    );
    let parts: Vec<_> = parsed.path().trim_matches('/').split('/').collect();
    if host == "youtu.be" || host == "www.youtu.be" {
        return video_url(parts.first().copied().unwrap_or(""), None);
    }
    if !youtube {
        return Ok(MediaUrl::Video {
            url: parsed.to_string(),
            playlist_url: None,
        });
    }
    let query = |key: &str| {
        parsed
            .query_pairs()
            .find(|(k, _)| k == key)
            .map(|(_, v)| v.into_owned())
    };
    let playlist = query("list").filter(|id| !id.is_empty());
    if parsed.path() == "/watch" {
        if let Some(id) = query("v") {
            return video_url(&id, playlist.as_deref());
        }
    }
    if matches!(parts.first(), Some(&"shorts" | &"live" | &"embed")) && parts.len() == 2 {
        return video_url(parts[1], playlist.as_deref());
    }
    if parsed.path() == "/playlist" {
        let id = playlist.ok_or_else(|| anyhow!("URL_INVALID"))?;
        if id.starts_with("RD") {
            bail!("RADIO_NOT_PLAYLIST: use o link de uma música para baixar o vídeo indicado");
        }
        let mut canonical = Url::parse("https://www.youtube.com/playlist")?;
        canonical.query_pairs_mut().append_pair("list", &id);
        return Ok(MediaUrl::Playlist {
            url: canonical.to_string(),
        });
    }
    let (base_parts, name) = if parts
        .first()
        .is_some_and(|p| p.starts_with('@') && p.len() > 1)
    {
        (1, parts[0].trim_start_matches('@'))
    } else if matches!(parts.first(), Some(&"channel" | &"c" | &"user"))
        && parts.get(1).is_some_and(|v| !v.is_empty())
    {
        (2, parts[1])
    } else {
        bail!("URL_INVALID");
    };
    if parts.len() > base_parts
        && (parts.len() != base_parts + 1
            || !matches!(
                parts[base_parts],
                "videos" | "shorts" | "streams" | "playlists" | "featured" | "posts" | "community"
            ))
    {
        bail!("URL_INVALID");
    }
    Ok(MediaUrl::Channel {
        url: format!("https://www.youtube.com/{}", parts[..base_parts].join("/")),
        name: name.to_string(),
    })
}

fn video_url(id: &str, playlist: Option<&str>) -> Result<MediaUrl> {
    if id.is_empty()
        || !id
            .bytes()
            .all(|c| c.is_ascii_alphanumeric() || c == b'_' || c == b'-')
    {
        bail!("URL_INVALID");
    }
    let mut playlist_url = None;
    // YouTube Mix/radio lists are generated, potentially unbounded collections.
    if let Some(id) = playlist.filter(|id| !id.starts_with("RD")) {
        let mut url = Url::parse("https://www.youtube.com/playlist")?;
        url.query_pairs_mut().append_pair("list", id);
        playlist_url = Some(url.to_string());
    }
    Ok(MediaUrl::Video {
        url: format!("https://www.youtube.com/watch?v={id}"),
        playlist_url,
    })
}

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ChannelSelection {
    VideosWithThumbnails,
    Videos,
    Shorts,
    Playlists,
    Thumbnails,
    Posts,
    All,
}

#[derive(Debug, Clone, PartialEq)]
pub struct DownloadStep {
    pub url: String,
    pub folder: PathBuf,
    pub thumbnails: bool,
    pub thumbnail_only: bool,
    pub playlists: bool,
    pub posts: bool,
}

/// A single component, safe on both Windows and Unix. Never accepts a path.
pub fn safe_folder_name(name: &str) -> String {
    let clean: String = name
        .chars()
        .map(|c| {
            if c.is_control() || "<>:\"/\\|?*%".contains(c) {
                '_'
            } else {
                c
            }
        })
        .take(100)
        .collect();
    let clean = clean.trim().trim_matches('.').trim().to_string();
    let clean = if clean.is_empty() {
        "Canal".to_string()
    } else {
        clean
    };
    let stem = clean.split('.').next().unwrap_or("").to_uppercase();
    if matches!(stem.as_str(), "CON" | "PRN" | "AUX" | "NUL")
        || (stem.len() == 4
            && (stem.starts_with("COM") || stem.starts_with("LPT"))
            && matches!(stem.as_bytes()[3], b'1'..=b'9'))
    {
        format!("_{clean}")
    } else {
        clean
    }
}

pub fn channel_plan(
    url: &str,
    channel_name: &str,
    selection: ChannelSelection,
    output: &Path,
) -> Result<(PathBuf, Vec<DownloadStep>)> {
    let MediaUrl::Channel { url, .. } = classify_url(url)? else {
        bail!("URL_INVALID: canal esperado");
    };
    let root = output.join(safe_folder_name(channel_name));
    let sections: &[&str] = match selection {
        ChannelSelection::All => &["videos", "shorts", "playlists", "posts"],
        ChannelSelection::VideosWithThumbnails => &["videos"],
        ChannelSelection::Videos => &["videos"],
        ChannelSelection::Shorts => &["shorts"],
        ChannelSelection::Playlists => &["playlists"],
        ChannelSelection::Thumbnails => &["thumbnails"],
        ChannelSelection::Posts => &["posts"],
    };
    let steps = sections
        .iter()
        .map(|section| DownloadStep {
            url: format!(
                "{url}/{}",
                if *section == "thumbnails" {
                    "videos"
                } else {
                    section
                }
            ),
            folder: root.join(match *section {
                "thumbnails" => "thumbs",
                "posts" => "publicacoes",
                s => s,
            }),
            thumbnails: (selection == ChannelSelection::All && *section != "posts")
                || selection == ChannelSelection::VideosWithThumbnails
                || *section == "thumbnails",
            thumbnail_only: *section == "thumbnails",
            playlists: *section == "playlists",
            posts: *section == "posts",
        })
        .collect();
    Ok((root, steps))
}

pub fn metadata_args(url: &str, collection: bool) -> Vec<String> {
    let mut args: Vec<String> = [
        "--ignore-config",
        "--no-warnings",
        "--socket-timeout",
        "15",
        "--retries",
        "1",
        "--extractor-retries",
        "1",
        "--skip-download",
        "--dump-single-json",
    ]
    .map(String::from)
    .to_vec();
    if collection {
        args.extend(["--flat-playlist", "--playlist-end", "1"].map(String::from));
    } else {
        args.push("--no-playlist".into());
    }
    args.extend(["--".to_string(), url.to_string()]);
    args
}

/// Always bounded to one entry, with a wall-clock deadline in addition to socket timeouts.
pub async fn read_metadata(binary: &str, url: &str, collection: bool) -> Result<serde_json::Value> {
    read_metadata_with_timeout(binary, url, collection, std::time::Duration::from_secs(30)).await
}

async fn read_metadata_with_timeout(
    binary: &str,
    url: &str,
    collection: bool,
    deadline: std::time::Duration,
) -> Result<serde_json::Value> {
    let mut command = tokio::process::Command::new(binary);
    command
        .args(metadata_args(url, collection))
        .kill_on_drop(true);
    let output = tokio::time::timeout(deadline, command.output())
        .await
        .map_err(|_| anyhow!("NETWORK: análise excedeu 30 segundos; tente novamente"))??;
    if !output.status.success() {
        let error = String::from_utf8_lossy(&output.stderr);
        if error.contains("Sign in")
            || error.contains("Private video")
            || error.contains("HTTP Error 403")
        {
            bail!("LOGIN_REQUIRED: {error}");
        }
        if error.contains("Unsupported URL") || error.contains("not available") {
            bail!("UNSUPPORTED_FORMAT: {error}");
        }
        bail!("NETWORK: {error}");
    }
    Ok(serde_json::from_slice(&output.stdout)?)
}

pub fn format_args(mode: &str, quality: &str, container: &str) -> Result<Vec<String>> {
    if mode == "audio" {
        if !matches!(container, "mp3" | "m4a") {
            bail!("UNSUPPORTED_FORMAT");
        }
        Ok(["-x", "--audio-format", container, "--audio-quality", "0"]
            .map(String::from)
            .to_vec())
    } else if mode == "video" {
        if !matches!(container, "mp4" | "mkv") {
            bail!("UNSUPPORTED_FORMAT");
        }
        let format = match quality {
            "best" => "bestvideo+bestaudio/best",
            "1080p" => "bestvideo[height<=1080]+bestaudio/best[height<=1080]",
            "720p" => "bestvideo[height<=720]+bestaudio/best[height<=720]",
            "480p" => "bestvideo[height<=480]+bestaudio/best[height<=480]",
            _ => bail!("UNSUPPORTED_FORMAT"),
        };
        Ok([
            "-f",
            format,
            "--merge-output-format",
            container,
            "--remux-video",
            container,
        ]
        .map(String::from)
        .to_vec())
    } else {
        bail!("UNSUPPORTED_FORMAT");
    }
}

pub fn step_args(
    step: &DownloadStep,
    mode: &str,
    quality: &str,
    container: &str,
) -> Result<Vec<String>> {
    let mut args = [
        "--ignore-config",
        "--no-warnings",
        "--no-simulate",
        "--progress",
        "--newline",
        "--yes-playlist",
        "--socket-timeout",
        "30",
        "--retries",
        "3",
        "--windows-filenames",
    ]
    .map(String::from)
    .to_vec();
    if step.thumbnail_only {
        args.extend(["--skip-download", "--write-thumbnail"].map(String::from));
    } else {
        args.extend(format_args(mode, quality, container)?);
        if step.thumbnails {
            args.push("--write-thumbnail".into());
        }
    }
    let template = if step.playlists {
        "%(playlist_title,playlist_id)s/%(playlist_index)05d - %(title)s [%(id)s].%(ext)s"
    } else {
        "%(title)s [%(id)s].%(ext)s"
    };
    args.extend([
        "-P".into(),
        step.folder.to_string_lossy().into_owned(),
        "-o".into(),
        template.into(),
    ]);
    if step.thumbnails && !step.thumbnail_only {
        let thumbs = step.folder.parent().unwrap().join("thumbs");
        args.extend([
            "-P".into(),
            format!("thumbnail:{}", thumbs.to_string_lossy()),
        ]);
    }
    args.extend(["--".into(), step.url.clone()]);
    Ok(args)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn radio_is_always_one_video() {
        assert_eq!(
            classify_url(
                "https://www.youtube.com/watch?v=elzs9O5AZV8&list=RDelzs9O5AZV8&start_radio=1"
            )
            .unwrap(),
            MediaUrl::Video {
                url: "https://www.youtube.com/watch?v=elzs9O5AZV8".into(),
                playlist_url: None
            }
        );
    }
    #[test]
    fn video_in_playlist_needs_explicit_collection_action() {
        let MediaUrl::Video { url, playlist_url } =
            classify_url("https://www.youtube.com/watch?v=abc&list=PL123").unwrap()
        else {
            panic!()
        };
        assert_eq!(url, "https://www.youtube.com/watch?v=abc");
        assert_eq!(
            playlist_url.unwrap(),
            "https://www.youtube.com/playlist?list=PL123"
        );
        assert!(matches!(
            classify_url("https://www.youtube.com/playlist?list=PL123").unwrap(),
            MediaUrl::Playlist { .. }
        ));
    }
    #[test]
    fn channel_variants_and_host_validation() {
        for url in [
            "https://www.youtube.com/channel/UCIW4y9tEpVmx_iezUVA9blQ",
            "https://www.youtube.com/@gameferrarezi",
            "https://www.youtube.com/@manodeyvin/videos",
            "https://m.youtube.com/user/example",
        ] {
            assert!(matches!(
                classify_url(url).unwrap(),
                MediaUrl::Channel { .. }
            ));
        }
        assert!(matches!(
            classify_url("https://example.org/@someone").unwrap(),
            MediaUrl::Video { .. }
        ));
        assert!(classify_url("https://www.youtube.com/results?search_query=music").is_err());
        assert!(classify_url("file:///etc/passwd").is_err());
        assert!(classify_url("https://www.youtube.com/playlist?list=RD123").is_err());
    }
    #[test]
    fn channel_plan_only_creates_selected_section() {
        let (root, steps) = channel_plan(
            "https://www.youtube.com/@crowdash_yt",
            "Crowdash_yt",
            ChannelSelection::Shorts,
            Path::new("out"),
        )
        .unwrap();
        assert_eq!(root, Path::new("out/Crowdash_yt"));
        assert_eq!(steps.len(), 1);
        assert_eq!(steps[0].folder, root.join("shorts"));
        assert!(steps[0].url.ends_with("/@crowdash_yt/shorts"));
        let (_, all) = channel_plan(
            "https://www.youtube.com/@crowdash_yt",
            "Crowdash_yt",
            ChannelSelection::All,
            Path::new("out"),
        )
        .unwrap();
        assert_eq!(all.len(), 4);
        assert!(all.iter().any(|s| s.posts));
        assert!(all.iter().filter(|s| !s.posts).all(|s| s.thumbnails));
    }
    #[test]
    fn thumbnail_modes_never_download_unrequested_video() {
        let (_, steps) = channel_plan(
            "https://www.youtube.com/@crow",
            "Crow",
            ChannelSelection::Thumbnails,
            Path::new("out"),
        )
        .unwrap();
        assert!(step_args(&steps[0], "video", "best", "mp4")
            .unwrap()
            .contains(&"--skip-download".into()));
        let (_, steps) = channel_plan(
            "https://www.youtube.com/@crow",
            "Crow",
            ChannelSelection::VideosWithThumbnails,
            Path::new("out"),
        )
        .unwrap();
        let args = step_args(&steps[0], "video", "best", "mp4").unwrap();
        assert!(args
            .iter()
            .any(|a| a.contains("thumbnail:") && a.ends_with("thumbs")));
        assert!(!args.contains(&"--skip-download".into()));
    }
    #[test]
    fn folders_cannot_escape_output_or_break_templates() {
        for name in [
            "../outside",
            "C:\\Windows",
            "%TEMP%",
            "CON",
            "..",
            "Crow:Dash",
        ] {
            let safe = safe_folder_name(name);
            assert!(!safe.contains(['/', '\\', ':', '%']));
            assert_ne!(safe, "..");
            assert_ne!(safe, "CON");
        }
    }
    #[test]
    fn analysis_is_bounded_and_respects_selected_format() {
        let args = metadata_args("https://www.youtube.com/@crow/videos", true);
        assert!(args.windows(2).any(|v| v == ["--playlist-end", "1"]));
        assert!(metadata_args("https://www.youtube.com/watch?v=abc", false)
            .contains(&"--no-playlist".into()));
        assert!(format_args("audio", "best", "mp3")
            .unwrap()
            .contains(&"--audio-format".into()));
        assert!(format_args("video", "720p", "mkv")
            .unwrap()
            .contains(&"bestvideo[height<=720]+bestaudio/best[height<=720]".into()));
        assert!(format_args("audio", "best", "mp4").is_err());
    }
}

#[cfg(all(test, unix))]
mod process_tests {
    use super::*;
    use std::os::unix::fs::PermissionsExt;

    #[tokio::test]
    async fn runs_metadata_process_with_single_video_policy() {
        let script = std::env::temp_dir().join(format!("crowdash-ytdlp-{}", std::process::id()));
        std::fs::write(&script, "#!/bin/sh\ncase \" $* \" in *\" --no-playlist \"*) ;; *) exit 42;; esac\ncase \"$*\" in *\"list=\"*) exit 43;; esac\nprintf '%s' '{\"title\":\"selected song\",\"duration\":120}'\n").unwrap();
        std::fs::set_permissions(&script, std::fs::Permissions::from_mode(0o700)).unwrap();
        let MediaUrl::Video { url, .. } =
            classify_url("https://www.youtube.com/watch?v=abc&list=RDabc&start_radio=1").unwrap()
        else {
            panic!()
        };
        let result = read_metadata(script.to_str().unwrap(), &url, false).await;
        std::fs::remove_file(script).unwrap();
        assert_eq!(result.unwrap()["title"], "selected song");
    }
    #[tokio::test]
    async fn metadata_timeout_does_not_leave_the_ui_waiting_forever() {
        let script =
            std::env::temp_dir().join(format!("crowdash-ytdlp-timeout-{}", std::process::id()));
        std::fs::write(&script, "#!/bin/sh\nwhile :; do :; done\n").unwrap();
        std::fs::set_permissions(&script, std::fs::Permissions::from_mode(0o700)).unwrap();
        let started = std::time::Instant::now();
        let result = read_metadata_with_timeout(
            script.to_str().unwrap(),
            "https://example.org/video",
            false,
            std::time::Duration::from_millis(40),
        )
        .await;
        std::fs::remove_file(script).unwrap();
        assert!(result.unwrap_err().to_string().contains("NETWORK"));
        assert!(started.elapsed() < std::time::Duration::from_secs(2));
    }
}
