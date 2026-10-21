//! Export public community posts. yt-dlp only extracts linked media from this tab,
//! so posts themselves must be read from YouTube's public browse responses.
use anyhow::{anyhow, bail, Context, Result};
use reqwest::Client;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::time::Duration;
use url::Url;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Post {
    pub id: String,
    pub url: String,
    pub author: String,
    pub text: String,
    pub published: String,
    pub images: Vec<String>,
    #[serde(default)]
    pub local_images: Vec<String>,
}

#[derive(Debug, Default)]
pub struct PostPage {
    pub posts: Vec<Post>,
    pub continuation: Option<String>,
}

pub struct PostsClient {
    client: Client,
    context: Value,
}

impl PostsClient {
    pub async fn open(channel_url: &str) -> Result<(Self, PostPage)> {
        let crate::MediaUrl::Channel { url, .. } = crate::classify_url(channel_url)? else {
            bail!("URL_INVALID");
        };
        let client = Client::builder().timeout(Duration::from_secs(30))
            .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130.0.0.0 Safari/537.36")
            .build()?;
        let html = client
            .get(format!("{url}/posts?hl=en"))
            .send()
            .await?
            .error_for_status()?
            .text()
            .await?;
        let data = extract_json(
            &html,
            &[
                "var ytInitialData =",
                "ytInitialData =",
                "window[\"ytInitialData\"] =",
            ],
        )?;
        let cfg = extract_json(&html, &["ytcfg.set("])?;
        let context = cfg
            .get("INNERTUBE_CONTEXT")
            .cloned()
            .ok_or_else(|| anyhow!("POSTS_UNAVAILABLE: contexto público não encontrado"))?;
        let tabs = data
            .pointer("/contents/twoColumnBrowseResultsRenderer/tabs")
            .and_then(Value::as_array)
            .ok_or_else(|| anyhow!("POSTS_UNAVAILABLE: formato da página mudou"))?;
        let tab = tabs
            .iter()
            .filter_map(|v| v.get("tabRenderer"))
            .find(|v| v["selected"].as_bool() == Some(true))
            .ok_or_else(|| anyhow!("POSTS_UNAVAILABLE: aba de publicações não encontrada"))?;
        if !matches!(tab["title"].as_str(), Some("Posts" | "Community")) {
            bail!("SECTION_UNAVAILABLE: canal sem aba de publicações públicas");
        }
        let page = parse_page(tab);
        Ok((Self { client, context }, page))
    }

    pub async fn next_page(&self, token: &str) -> Result<PostPage> {
        let data: Value = self
            .client
            .post("https://www.youtube.com/youtubei/v1/browse")
            .json(&json!({ "context": self.context, "continuation": token }))
            .send()
            .await?
            .error_for_status()?
            .json()
            .await?;
        if data.get("error").is_some() {
            bail!("NETWORK: falha ao buscar a próxima página de publicações");
        }
        if ![
            "onResponseReceivedActions",
            "onResponseReceivedEndpoints",
            "continuationContents",
        ]
        .iter()
        .any(|k| data.get(k).is_some())
        {
            bail!("POSTS_UNAVAILABLE: formato da paginação mudou; exportação parcial preservada");
        }
        Ok(parse_page(&data))
    }

    pub async fn image(&self, url: &str) -> Result<(Vec<u8>, &'static str)> {
        if !is_post_image(url) {
            bail!("UNSUPPORTED_FORMAT: URL de imagem inválida");
        }
        let response = self.client.get(url).send().await?.error_for_status()?;
        let mime = response
            .headers()
            .get(reqwest::header::CONTENT_TYPE)
            .and_then(|v| v.to_str().ok())
            .unwrap_or("")
            .split(';')
            .next()
            .unwrap_or("");
        let extension = match mime {
            "image/jpeg" => "jpg",
            "image/png" => "png",
            "image/webp" => "webp",
            "image/gif" => "gif",
            _ => bail!("UNSUPPORTED_FORMAT: tipo de imagem não reconhecido"),
        };
        Ok((response.bytes().await?.to_vec(), extension))
    }
}

fn extract_json(html: &str, markers: &[&str]) -> Result<Value> {
    for marker in markers {
        if let Some((_, rest)) = html.split_once(marker) {
            if let Some(Ok(value)) = serde_json::Deserializer::from_str(rest.trim_start())
                .into_iter::<Value>()
                .next()
            {
                return Ok(value);
            }
        }
    }
    bail!("POSTS_UNAVAILABLE: dados públicos da página não encontrados")
}

fn text(value: &Value) -> String {
    value["simpleText"]
        .as_str()
        .map(String::from)
        .unwrap_or_else(|| {
            value["runs"]
                .as_array()
                .map(|runs| runs.iter().filter_map(|r| r["text"].as_str()).collect())
                .unwrap_or_default()
        })
}

fn is_post_image(url: &str) -> bool {
    Url::parse(url).ok().is_some_and(|u| {
        u.scheme() == "https"
            && u.host_str().is_some_and(|h| {
                h == "yt3.ggpht.com"
                    || h.ends_with(".ggpht.com")
                    || h == "i.ytimg.com"
                    || h.ends_with(".ytimg.com")
                    || h.ends_with(".googleusercontent.com")
            })
    })
}

fn images(value: &Value, out: &mut Vec<String>) {
    if let Some(thumbs) = value.get("thumbnails").and_then(Value::as_array) {
        if let Some(url) = thumbs
            .iter()
            .rev()
            .filter_map(|v| v["url"].as_str())
            .find(|url| is_post_image(url))
        {
            if !out.iter().any(|u| u == url) {
                out.push(url.to_string());
            }
        }
    } else {
        match value {
            Value::Object(o) => {
                for v in o.values() {
                    images(v, out);
                }
            }
            Value::Array(a) => {
                for v in a {
                    images(v, out);
                }
            }
            _ => {}
        }
    }
}

pub fn parse_page(value: &Value) -> PostPage {
    fn visit(value: &Value, page: &mut PostPage) {
        if let Some(post) = value.get("backstagePostRenderer") {
            if let Some(id) = post["postId"].as_str().filter(|id| {
                !id.is_empty()
                    && id
                        .bytes()
                        .all(|c| c.is_ascii_alphanumeric() || c == b'_' || c == b'-')
            }) {
                if !page.posts.iter().any(|p| p.id == id) {
                    let mut image_urls = Vec::new();
                    images(&post["backstageAttachment"], &mut image_urls);
                    page.posts.push(Post {
                        id: id.to_string(),
                        url: format!("https://www.youtube.com/post/{id}"),
                        author: text(&post["authorText"]),
                        text: text(&post["contentText"]),
                        published: text(&post["publishedTimeText"]),
                        images: image_urls,
                        local_images: vec![],
                    });
                }
            }
            return;
        }
        if let Some(token) = value
            .pointer("/continuationItemRenderer/continuationEndpoint/continuationCommand/token")
            .and_then(Value::as_str)
        {
            page.continuation = Some(token.to_string());
        }
        match value {
            Value::Object(o) => {
                for v in o.values() {
                    visit(v, page);
                }
            }
            Value::Array(a) => {
                for v in a {
                    visit(v, page);
                }
            }
            _ => {}
        }
    }
    let mut page = PostPage::default();
    visit(value, &mut page);
    page
}

pub fn markdown(posts: &[Post]) -> String {
    posts
        .iter()
        .map(|p| {
            format!(
                "## {}\n\n{} · {}\n\n{}\n\n[Publicação original]({})\n\n{}\n\n",
                p.id,
                p.author,
                p.published,
                p.text,
                p.url,
                p.local_images
                    .iter()
                    .enumerate()
                    .map(|(i, path)| format!("![Imagem {}]({})", i + 1, path))
                    .collect::<Vec<_>>()
                    .join("\n")
            )
        })
        .collect()
}

pub fn save_posts(folder: &std::path::Path, posts: &[Post]) -> Result<()> {
    std::fs::write(
        folder.join("publicacoes.json"),
        serde_json::to_vec_pretty(posts)?,
    )
    .context("Não foi possível salvar publicações")?;
    std::fs::write(folder.join("publicacoes.md"), markdown(posts))?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn parses_posts_images_and_continuation_without_downloading_linked_videos() {
        let data = json!({"contents": [{"backstagePostThreadRenderer": {"post": {"backstagePostRenderer": {
            "postId": "Ug123", "authorText": {"runs": [{"text":"CrowDash"}]},
            "contentText": {"runs": [{"text":"Olá "}, {"text":"mundo!"}]},
            "publishedTimeText": {"simpleText":"1 day ago"},
            "backstageAttachment": {"imageRenderer": {"thumbnails":[{"url":"https://yt3.ggpht.com/small"},{"url":"https://yt3.ggpht.com/full"}]}}
        }}}}, {"continuationItemRenderer":{"continuationEndpoint":{"continuationCommand":{"token":"next-page"}}}}]});
        let page = parse_page(&data);
        assert_eq!(page.posts.len(), 1);
        assert_eq!(page.posts[0].text, "Olá mundo!");
        assert_eq!(page.posts[0].images, ["https://yt3.ggpht.com/full"]);
        assert_eq!(page.continuation.as_deref(), Some("next-page"));
        let mut posts = page.posts;
        posts[0].local_images.push("imagens/Ug123-1.jpg".into());
        assert!(markdown(&posts).contains("imagens/Ug123-1.jpg"));
    }
    #[test]
    fn rejects_unsafe_post_ids_and_image_hosts() {
        assert!(
            parse_page(&json!({"backstagePostRenderer":{"postId":"../../outside"}}))
                .posts
                .is_empty()
        );
        assert!(!is_post_image("https://evil.example/image.jpg"));
        assert!(!is_post_image("file:///tmp/image.jpg"));
    }
    #[test]
    fn extracts_nested_page_json_with_trailing_script() {
        assert_eq!(
            extract_json(
                "<script>var ytInitialData = {\"a\":{\"b\":1}};</script>",
                &["var ytInitialData ="]
            )
            .unwrap()["a"]["b"],
            1
        );
        assert!(extract_json("captcha", &["var ytInitialData ="]).is_err());
    }
}
