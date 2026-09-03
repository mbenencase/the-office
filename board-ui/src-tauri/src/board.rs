use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use thiserror::Error;

#[derive(Debug, Error)]
pub enum BoardError {
    #[error("{0}")]
    Message(String),
    #[error(transparent)]
    Io(#[from] std::io::Error),
    #[error(transparent)]
    Yaml(#[from] serde_yaml::Error),
}

impl Serialize for BoardError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.serialize_str(&self.to_string())
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Task {
    pub id: String,
    pub feature: String,
    pub path: String,
    pub task_no: Option<i64>,
    pub title: Option<String>,
    pub depends_on: Vec<String>,
    pub status: String,
    pub tier: Option<String>,
    pub scope: Vec<String>,
    pub checks: Vec<String>,
    pub sensors_added: Vec<String>,
    pub dod: Option<String>,
    pub attempts: Option<i64>,
    pub max_attempts: Option<i64>,
    pub branch: Option<String>,
    pub commit: Option<String>,
    /// Markdown body after the YAML frontmatter.
    pub body: String,
    /// Full file contents (frontmatter + body).
    pub raw: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BoardState {
    pub root: String,
    pub tasks: Vec<Task>,
}

#[derive(Debug, Deserialize)]
struct Frontmatter {
    id: Option<String>,
    task_no: Option<i64>,
    title: Option<String>,
    #[serde(default)]
    depends_on: Vec<String>,
    status: Option<String>,
    tier: Option<String>,
    #[serde(default)]
    scope: Vec<String>,
    #[serde(default)]
    checks: Vec<String>,
    #[serde(default)]
    sensors_added: Vec<String>,
    dod: Option<String>,
    attempts: Option<i64>,
    max_attempts: Option<i64>,
    branch: Option<serde_yaml::Value>,
    commit: Option<serde_yaml::Value>,
}

fn yaml_opt_string(v: Option<serde_yaml::Value>) -> Option<String> {
    match v {
        None | Some(serde_yaml::Value::Null) => None,
        Some(serde_yaml::Value::String(s)) => Some(s),
        Some(other) => Some(serde_yaml::to_string(&other).ok()?.trim().to_string()),
    }
}

pub fn find_root(from: &Path) -> Option<PathBuf> {
    let mut d = from.to_path_buf();
    if d.is_file() {
        d.pop();
    }
    loop {
        if d.join(".the-office").is_dir() {
            return Some(d);
        }
        if !d.pop() {
            return None;
        }
    }
}

pub fn split_frontmatter(text: &str) -> Option<(&str, &str)> {
    let trimmed = text.strip_prefix("---\n").or_else(|| text.strip_prefix("---\r\n"))?;
    let rest = trimmed;
    // Find closing ---
    let mut offset = 0;
    for line in rest.split_inclusive('\n') {
        let bare = line.trim_end_matches(['\r', '\n']);
        if bare == "---" {
            let fm = &rest[..offset];
            let body = &rest[offset + line.len()..];
            return Some((fm, body));
        }
        offset += line.len();
    }
    None
}

fn parse_task(path: &Path, feature: &str, expected_id: &str, text: String) -> Result<Task, BoardError> {
    let (fm_text, body) = split_frontmatter(&text).ok_or_else(|| {
        BoardError::Message(format!("{}: missing YAML frontmatter", path.display()))
    })?;
    let fm: Frontmatter = serde_yaml::from_str(fm_text)?;
    Ok(Task {
        id: fm.id.unwrap_or_else(|| expected_id.to_string()),
        feature: feature.to_string(),
        path: path.display().to_string(),
        task_no: fm.task_no,
        title: fm.title,
        depends_on: fm.depends_on,
        status: fm.status.unwrap_or_else(|| "pending".into()),
        tier: fm.tier,
        scope: fm.scope,
        checks: fm.checks,
        sensors_added: fm.sensors_added,
        dod: fm.dod,
        attempts: fm.attempts,
        max_attempts: fm.max_attempts,
        branch: yaml_opt_string(fm.branch),
        commit: yaml_opt_string(fm.commit),
        body: body.to_string(),
        raw: text,
    })
}

pub fn load_board(root: &Path) -> Result<BoardState, BoardError> {
    let base = root.join(".the-office").join("features");
    let mut tasks = Vec::new();
    if !base.is_dir() {
        return Ok(BoardState {
            root: root.display().to_string(),
            tasks,
        });
    }

    let mut features: Vec<_> = fs::read_dir(&base)?
        .filter_map(|e| e.ok())
        .filter(|e| e.file_type().ok().map(|t| t.is_dir()).unwrap_or(false))
        .collect();
    features.sort_by_key(|e| e.file_name());

    for feat in features {
        let feature = feat.file_name().to_string_lossy().to_string();
        let dir = feat.path();
        let mut files: Vec<_> = fs::read_dir(&dir)?
            .filter_map(|e| e.ok())
            .filter(|e| {
                let name = e.file_name().to_string_lossy().to_string();
                name.starts_with("task-") && name.ends_with(".md")
            })
            .collect();
        files.sort_by_key(|e| e.file_name());

        for entry in files {
            let path = entry.path();
            let stem = path
                .file_stem()
                .map(|s| s.to_string_lossy().to_string())
                .unwrap_or_default();
            let expected_id = format!("{feature}/{stem}");
            let text = fs::read_to_string(&path)?;
            match parse_task(&path, &feature, &expected_id, text) {
                Ok(t) => tasks.push(t),
                Err(e) => {
                    // Surface broken files as placeholder cards so the UI can show them.
                    tasks.push(Task {
                        id: expected_id.clone(),
                        feature: feature.clone(),
                        path: path.display().to_string(),
                        task_no: None,
                        title: Some(format!("(broken) {e}")),
                        depends_on: vec![],
                        status: "blocked".into(),
                        tier: None,
                        scope: vec![],
                        checks: vec![],
                        sensors_added: vec![],
                        dod: None,
                        attempts: None,
                        max_attempts: None,
                        branch: None,
                        commit: None,
                        body: String::new(),
                        raw: fs::read_to_string(&path).unwrap_or_default(),
                    });
                }
            }
        }
    }

    Ok(BoardState {
        root: root.display().to_string(),
        tasks,
    })
}

/// Surgical single-key rewrite — preserves human-authored formatting.
pub fn set_scalar(text: &str, key: &str, value: &str) -> Result<String, BoardError> {
    let (fm, body) = split_frontmatter(text)
        .ok_or_else(|| BoardError::Message("no frontmatter to update".into()))?;
    let mut lines: Vec<String> = text.lines().map(|l| l.to_string()).collect();
    // Account for trailing newline: text.lines() drops it; we rejoin with \n.
    let has_trailing = text.ends_with('\n');
    let rendered = format!("{key}: {value}");
    let prefix = format!("{key}:");
    let mut found = false;
    // Frontmatter starts at line 1 (index 1) after opening ---
    let fm_line_count = fm.lines().count();
    for i in 1..=fm_line_count {
        if lines.get(i).map(|l| l.starts_with(&prefix)).unwrap_or(false) {
            lines[i] = rendered.clone();
            found = true;
            break;
        }
    }
    if !found {
        // Insert before closing ---
        lines.insert(1 + fm_line_count, rendered);
    }
    let mut out = lines.join("\n");
    if has_trailing || body.is_empty() || text.ends_with('\n') {
        if !out.ends_with('\n') {
            out.push('\n');
        }
    }
    let _ = body; // body is already in lines via full-text split
    Ok(out)
}

pub fn append_note(text: &str, line: &str) -> String {
    let mut t = text.to_string();
    if !regex_has_notes(&t) {
        t = format!("{}\n\n## Notes\n", t.trim_end());
    }
    format!("{}\n- {}\n", t.trim_end(), line)
}

fn regex_has_notes(text: &str) -> bool {
    text.lines().any(|l| {
        let t = l.trim();
        t.eq_ignore_ascii_case("## Notes") || t.eq_ignore_ascii_case("## notes")
    })
}

pub fn write_task_file(path: &Path, text: &str) -> Result<(), BoardError> {
    fs::write(path, text)?;
    Ok(())
}

pub fn emit_scalar(value: &str) -> String {
    if value.is_empty() {
        return "\"\"".into();
    }
    if value == "null" {
        return "null".into();
    }
    if value.chars().any(|c| matches!(c, ':' | '#' | '[' | ']' | '{' | '}' | '"' | '\'' | '\n'))
        || value.starts_with(' ')
        || value.ends_with(' ')
    {
        return serde_json::to_string(value).unwrap_or_else(|_| format!("\"{value}\""));
    }
    value.to_string()
}

pub fn emit_number(n: i64) -> String {
    n.to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn set_scalar_updates_status() {
        let text = "---\nid: sample/task-01\nstatus: pending\n---\n\n## Context\n";
        let out = set_scalar(text, "status", "in-progress").unwrap();
        assert!(out.contains("status: in-progress"));
        assert!(out.contains("## Context"));
    }

    #[test]
    fn split_roundtrip() {
        let text = "---\nid: a/b\n---\n\n## Notes\n";
        let (fm, body) = split_frontmatter(text).unwrap();
        assert!(fm.contains("id: a/b"));
        assert!(body.contains("## Notes"));
    }

    #[test]
    fn loads_fixture_board() {
        let root = Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("../../tests/fixtures/good");
        let board = load_board(&root).unwrap();
        assert_eq!(board.tasks.len(), 2);
        assert_eq!(board.tasks[0].id, "sample/task-01");
        assert!(board.tasks[0].body.contains("## Context"));
    }
}
