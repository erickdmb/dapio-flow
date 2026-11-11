use bpm_core::{
    calculate_dap_summary, validate_diagram, DapSummary, Diagram, NotationType, ProjectDocument,
    ValidationResult,
};
use std::fs;
use std::sync::Mutex;
use tauri::State;

#[derive(Default)]
pub struct AppState {
    pub document: Mutex<Option<ProjectDocument>>,
}

#[derive(serde::Serialize)]
pub struct SaveResult {
    pub ok: bool,
    pub path: String,
}

#[tauri::command]
fn validate_diagram_cmd(diagram: Diagram, notation: NotationType) -> ValidationResult {
    validate_diagram(&diagram, &notation)
}

#[tauri::command]
fn calculate_dap_summary_cmd(diagram: Diagram) -> DapSummary {
    calculate_dap_summary(&diagram)
}

#[tauri::command]
fn get_document(state: State<'_, AppState>) -> Option<ProjectDocument> {
    state.document.lock().ok().and_then(|d| d.clone())
}

#[tauri::command]
fn set_document(state: State<'_, AppState>, document: ProjectDocument) -> bool {
    if let Ok(mut guard) = state.document.lock() {
        *guard = Some(document);
        true
    } else {
        false
    }
}

#[tauri::command]
fn load_project_cmd(path: String) -> Result<ProjectDocument, String> {
    let content = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    serde_json::from_str(&content).map_err(|e| e.to_string())
}

#[tauri::command]
fn save_project_cmd(path: String, document: ProjectDocument) -> Result<SaveResult, String> {
    let json = serde_json::to_string_pretty(&document).map_err(|e| e.to_string())?;
    fs::write(&path, json).map_err(|e| e.to_string())?;
    Ok(SaveResult { ok: true, path })
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(AppState::default())
        .invoke_handler(tauri::generate_handler![
            validate_diagram_cmd,
            calculate_dap_summary_cmd,
            get_document,
            set_document,
            load_project_cmd,
            save_project_cmd
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}