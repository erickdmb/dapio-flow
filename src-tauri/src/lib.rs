use bpm_core::{calculate_dap_summary, validate_diagram, DapSummary, Diagram, NotationType, ProjectDocument, ValidationResult};
use std::sync::Mutex;
use tauri::State;

#[derive(Default)]
pub struct AppState {
    pub document: Mutex<Option<ProjectDocument>>,
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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(AppState::default())
        .invoke_handler(tauri::generate_handler![
            validate_diagram_cmd,
            calculate_dap_summary_cmd,
            get_document
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}