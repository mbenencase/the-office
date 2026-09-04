mod board;

use board::{
    append_note, emit_number, emit_scalar, find_root, load_board, set_scalar, write_task_file,
    BoardError, BoardState, Task,
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
    /// claim | review | done | block
    action: String,
    reason: Option<String>,
}

fn load_task(root: &Path, id: &str) -> Result<(BoardState, Task), BoardError> {
    let state = load_board(root)?;
    let task = state
        .tasks
        .iter()
        .find(|t| t.id == id || t.id.ends_with(&format!("/{id}")))
        .cloned()
        .ok_or_else(|| BoardError::Message(format!("no task matching \"{id}\".")))?;
    Ok((state, task))
}

fn git(root: &Path, args: &[&str]) -> Option<String> {
    let out = Command::new("git")
        .args(args)
        .current_dir(root)
        .output()
        .ok()?;
    if !out.status.success() {
        return None;
    }
    let s = String::from_utf8_lossy(&out.stdout).trim().to_string();
    if s.is_empty() {
        None
    } else {
        Some(s)
    }
}

#[tauri::command]
fn transition_task(input: TransitionInput) -> Result<BoardState, BoardError> {
    let root = PathBuf::from(&input.root);
    let (_, task) = load_task(&root, &input.id)?;
    let path = PathBuf::from(&task.path);
    let mut text = std::fs::read_to_string(&path)?;

    match input.action.as_str() {
        "claim" => {
            if !matches!(task.status.as_str(), "pending" | "blocked") {
                return Err(BoardError::Message(format!(
                    "task {} is \"{}\"; expected one of: pending, blocked.",
                    task.id, task.status
                )));
            }
            text = set_scalar(&text, "status", "in-progress")?;
            let n = task.attempts.unwrap_or(0) + 1;
            text = set_scalar(&text, "attempts", &emit_number(n))?;
            write_task_file(&path, &text)?;
        }
        "review" => {
            if task.status != "in-progress" {
                return Err(BoardError::Message(format!(
                    "task {} is \"{}\"; expected one of: in-progress.",
                    task.id, task.status
                )));
            }
            text = set_scalar(&text, "status", "review")?;
            write_task_file(&path, &text)?;
        }
        "done" => {
            if !matches!(task.status.as_str(), "review" | "in-progress") {
                return Err(BoardError::Message(format!(
                    "task {} is \"{}\"; expected one of: review, in-progress.",
                    task.id, task.status
                )));
            }
            text = set_scalar(&text, "status", "completed")?;
            if let Some(branch) = git(&root, &["rev-parse", "--abbrev-ref", "HEAD"]) {
                text = set_scalar(&text, "branch", &emit_scalar(&branch))?;
            }
            if let Some(commit) = git(&root, &["rev-parse", "--short", "HEAD"]) {
                text = set_scalar(&text, "commit", &emit_scalar(&commit))?;
            }
            write_task_file(&path, &text)?;
        }
        "block" => {
            let reason = input
                .reason
                .as_deref()
                .map(str::trim)
                .filter(|s| !s.is_empty())
                .ok_or_else(|| BoardError::Message("block requires a reason.".into()))?;
            text = set_scalar(&text, "status", "blocked")?;
            text = append_note(&text, &format!("blocked: {reason}"));
            write_task_file(&path, &text)?;
        }
        other => {
            return Err(BoardError::Message(format!(
                "unknown action \"{other}\". Use claim, review, done, or block."
            )));
        }
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
