mod board;

use board::{
    emit_scalar, find_root, load_board, set_scalar, write_task_file, BoardError, BoardState, Task,
};
use serde::Deserialize;
use std::path::{Path, PathBuf};
use std::process::Command;
use tauri_plugin_dialog::DialogExt;

#[tauri::command]
fn open_board(path: String) -> Result<BoardState, BoardError> {
    let p = PathBuf::from(&path);
    let root = find_root(&p).ok_or_else(|| {
        BoardError::Message(format!(
            "no .the-office/ found in \"{path}\" or any parent.\nRun `office init` first, or pick a repo that already has a board."
        ))
    })?;
    load_board(&root)
}

#[tauri::command]
fn reload_board(root: String) -> Result<BoardState, BoardError> {
    load_board(Path::new(&root))
}

fn protect_lifecycle_fields(previous: &str, proposed: &str) -> Result<(), BoardError> {
    let parse = |text: &str| -> Result<serde_yaml::Value, BoardError> {
        let (fm, _) = board::split_frontmatter(text)
            .ok_or_else(|| BoardError::Message("no frontmatter".into()))?;
        serde_yaml::from_str(fm).map_err(|e| BoardError::Message(e.to_string()))
    };
    let before = parse(previous)?;
    let after = parse(proposed)?;
    for key in ["id", "status", "attempts", "base_commit", "branch", "commit"] {
        if before[key] != after[key] {
            return Err(BoardError::Message(format!("{key} is managed by the office CLI; use a lifecycle action.")));
        }
    }
    Ok(())
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SaveTaskInput {
    path: String,
    /// Full markdown file contents to write.
    raw: String,
}

#[tauri::command]
fn save_task(input: SaveTaskInput) -> Result<Task, BoardError> {
    let path = PathBuf::from(&input.path);
    let previous = std::fs::read_to_string(&path)?;
    protect_lifecycle_fields(&previous, &input.raw)?;
    write_task_file(&path, &input.raw)?;
    let root = find_root(&path).ok_or_else(|| BoardError::Message("board root lost".into()))?;
    let state = load_board(&root)?;
    state
        .tasks
        .into_iter()
        .find(|t| t.path == path.display().to_string())
        .ok_or_else(|| BoardError::Message("saved task but failed to reload it".into()))
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct TransitionInput {
    root: String,
    id: String,
    /// claim | review | done | block | retry
    action: String,
    reason: Option<String>,
}

// Lifecycle decisions belong to the installed CLI so the UI cannot bypass
// verification or drift from dependency and retry rules.
#[tauri::command]
fn transition_task(input: TransitionInput) -> Result<BoardState, BoardError> {
    let root = PathBuf::from(&input.root);
    if !matches!(
        input.action.as_str(),
        "claim" | "review" | "done" | "block" | "retry"
    ) {
        return Err(BoardError::Message("unknown lifecycle action".into()));
    }
    let cli = [".claude/office/bin/office.mjs", ".cursor/office/bin/office.mjs"]
        .iter()
        .map(|relative| root.join(relative))
        .find(|candidate| candidate.is_file())
        .ok_or_else(|| BoardError::Message("Install or upgrade the-office in this repository before changing task status.".into()))?;
    let probe = Command::new("node")
        .arg(&cli)
        .arg("capabilities")
        .current_dir(&root)
        .output()?;
    let capabilities: serde_json::Value = serde_json::from_slice(&probe.stdout).unwrap_or_default();
    if !probe.status.success() || capabilities["lifecycle"] != 1 || capabilities["verification"] != 1 {
        return Err(BoardError::Message("Upgrade the installed office CLI before changing task status.".into()));
    }
    let mut command = Command::new("node");
    command
        .arg(cli)
        .arg(&input.action)
        .arg(&input.id)
        .current_dir(&root);
    if let Some(reason) = input.reason {
        command.arg("--reason").arg(reason);
    }
    let output = command.output()?;
    if !output.status.success() {
        return Err(BoardError::Message(format!(
            "{}{}",
            String::from_utf8_lossy(&output.stdout),
            String::from_utf8_lossy(&output.stderr)
        )));
    }
    load_board(&root)
}

/// Rebuild raw markdown from structured fields + body (full rewrite of file).
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct UpdateContentInput {
    path: String,
    title: Option<String>,
    dod: Option<String>,
    body: String,
    tier: Option<String>,
}

#[tauri::command]
fn update_task_content(input: UpdateContentInput) -> Result<BoardState, BoardError> {
    let path = PathBuf::from(&input.path);
    let mut text = std::fs::read_to_string(&path)?;
    if let Some(title) = &input.title {
        text = set_scalar(&text, "title", &emit_scalar(title))?;
    }
    if let Some(tier) = &input.tier {
        text = set_scalar(&text, "tier", &emit_scalar(tier))?;
    }
    if let Some(dod) = &input.dod {
        // dod is a block scalar in the schema; keep it as a quoted/escaped single line
        // when it has no newlines, otherwise use a literal block.
        if dod.contains('\n') {
            let indented = dod
                .lines()
                .map(|l| format!("  {l}"))
                .collect::<Vec<_>>()
                .join("\n");
            text = replace_dod_block(&text, &format!("dod: |\n{indented}"))?;
        } else {
            text = set_scalar(&text, "dod", &emit_scalar(dod))?;
        }
    }
    text = replace_body(&text, &input.body)?;
    write_task_file(&path, &text)?;
    let root = find_root(&path).ok_or_else(|| BoardError::Message("board root lost".into()))?;
    load_board(&root)
}

fn replace_body(text: &str, body: &str) -> Result<String, BoardError> {
    let (fm, _) = board::split_frontmatter(text)
        .ok_or_else(|| BoardError::Message("no frontmatter".into()))?;
    let body = if body.ends_with('\n') {
        body.to_string()
    } else {
        format!("{body}\n")
    };
    Ok(format!("---\n{fm}---\n{body}"))
}

fn replace_dod_block(text: &str, new_block: &str) -> Result<String, BoardError> {
    // Replace `dod:` through the next top-level key or closing frontmatter.
    let lines: Vec<&str> = text.lines().collect();
    if lines.first().map(|l| l.trim()) != Some("---") {
        return Err(BoardError::Message("no frontmatter".into()));
    }
    let mut out = Vec::new();
    let mut i = 0;
    while i < lines.len() {
        if lines[i].starts_with("dod:") {
            for bl in new_block.lines() {
                out.push(bl.to_string());
            }
            i += 1;
            // Skip continuation lines of the old block (indented) and old scalar
            while i < lines.len() {
                let l = lines[i];
                if l.trim() == "---" {
                    break;
                }
                if !l.is_empty() && !l.starts_with(' ') && !l.starts_with('\t') && l.contains(':')
                {
                    break;
                }
                i += 1;
            }
            continue;
        }
        out.push(lines[i].to_string());
        i += 1;
    }
    let mut s = out.join("\n");
    if text.ends_with('\n') && !s.ends_with('\n') {
        s.push('\n');
    }
    Ok(s)
}

#[tauri::command]
fn pick_folder(app: tauri::AppHandle) -> Result<Option<String>, BoardError> {
    let folder = app.dialog().file().blocking_pick_folder();
    Ok(folder.map(|p| p.to_string()))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            open_board,
            reload_board,
            save_task,
            transition_task,
            update_task_content,
            pick_folder
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod lifecycle_tests {
    use super::protect_lifecycle_fields;

    #[test]
    fn raw_editor_cannot_bypass_lifecycle() {
        let original = "---\nid: demo/task-01\nstatus: pending\nattempts: 0\nbase_commit: null\nbranch: null\ncommit: null\n---\n";
        for (old, new) in [
            ("status: pending", "status: completed"),
            ("attempts: 0", "attempts: 3"),
            ("base_commit: null", "base_commit: abc"),
            ("commit: null", "commit: abc"),
            ("id: demo/task-01", "id: demo/task-02"),
        ] {
            assert!(protect_lifecycle_fields(original, &original.replace(old, new)).is_err());
        }
    }

    #[test]
    fn raw_editor_accepts_content_and_explicit_budget_updates() {
        let original = "---\nid: demo/task-01\nstatus: blocked\nmax_attempts: 3\n---\nOld context\n";
        let updated = original.replace("max_attempts: 3", "max_attempts: 4").replace("Old context", "New context");
        assert!(protect_lifecycle_fields(original, &updated).is_ok());
    }
}
