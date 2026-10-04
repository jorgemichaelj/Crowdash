// settings.rs — Persistência de configurações do usuário

use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use tauri::{AppHandle, Manager};
use anyhow::Result;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BrowserSessionConsent {
    pub domain: String,
    pub granted: bool,
    #[serde(rename = "grantedAt")]
    pub granted_at: Option<u64>,
    pub browser: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AdvancedSettings {
    #[serde(rename = "showTechnicalLogs")]
    pub show_technical_logs: bool,
    #[serde(rename = "customCodecArgs", skip_serializing_if = "Option::is_none")]
    pub custom_codec_args: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppSettings {
    #[serde(rename = "outputFolder")]
    pub output_folder: String,
    #[serde(rename = "hardwareAcceleration")]
    pub hardware_acceleration: String, // "auto" | "off"
    pub theme: String,                 // "system" | "dark" | "light"
    #[serde(rename = "notifyOnComplete")]
    pub notify_on_complete: bool,
    pub concurrency: u8,
    #[serde(rename = "browserSessions")]
    pub browser_sessions: Vec<BrowserSessionConsent>,
    pub advanced: AdvancedSettings,
}

impl Default for AppSettings {
    fn default() -> Self {
        let downloads_dir = dirs::download_dir()
            .unwrap_or_else(|| PathBuf::from("C:\\Users\\Public\\Downloads"))
            .join("Crowdash");

        AppSettings {
            output_folder: downloads_dir.to_string_lossy().to_string(),
            hardware_acceleration: "auto".to_string(),
            theme: "dark".to_string(),
            notify_on_complete: true,
            concurrency: 1,
            browser_sessions: vec![],
            advanced: AdvancedSettings {
                show_technical_logs: false,
                custom_codec_args: None,
            },
        }
    }
}

pub struct SettingsStore {
    pub settings: AppSettings,
    config_path: PathBuf,
}

impl SettingsStore {
    pub fn load(app: &AppHandle) -> Result<Self> {
        let config_dir = app.path().app_config_dir()?;
        std::fs::create_dir_all(&config_dir)?;
        let config_path = config_dir.join("settings.json");

        let settings = if config_path.exists() {
            let content = std::fs::read_to_string(&config_path)?;
            serde_json::from_str(&content).unwrap_or_default()
        } else {
            AppSettings::default()
        };

        // Garantir que a pasta de saída existe
        if let Err(e) = std::fs::create_dir_all(&settings.output_folder) {
            tracing::warn!("Não foi possível criar pasta de saída: {}", e);
        }

        Ok(SettingsStore { settings, config_path })
    }

    pub fn save(&self) -> Result<()> {
        let json = serde_json::to_string_pretty(&self.settings)?;
        std::fs::write(&self.config_path, json)?;
        Ok(())
    }

    pub fn update(&mut self, patch: serde_json::Value) -> Result<AppSettings> {
        let mut current = serde_json::to_value(&self.settings)?;
        if let (Some(obj), Some(patch_obj)) = (current.as_object_mut(), patch.as_object()) {
            for (k, v) in patch_obj {
                obj.insert(k.clone(), v.clone());
            }
        }
        self.settings = serde_json::from_value(current)?;

        // Garantir que a pasta de saída existe após update
        if let Err(e) = std::fs::create_dir_all(&self.settings.output_folder) {
            tracing::warn!("Não foi possível criar pasta de saída: {}", e);
        }

        self.save()?;
        Ok(self.settings.clone())
    }
}

// Para compatibilidade com o setup do lib.rs
impl Default for SettingsStore {
    fn default() -> Self {
        SettingsStore {
            settings: AppSettings::default(),
            config_path: PathBuf::from("settings.json"),
        }
    }
}
