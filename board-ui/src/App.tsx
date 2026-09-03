import { useMemo, useState } from "react";
import type { BoardState } from "./types";
import { openWorkspace, reloadBoard } from "./api";
import { Board } from "./components/Board";
import "./App.css";

function App() {
  const [board, setBoard] = useState<BoardState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feature, setFeature] = useState("all");

  const features = useMemo(() => {
    if (!board) return [];
    return [...new Set(board.tasks.map((t) => t.feature))].sort();
  }, [board]);

  async function onOpen() {
    setBusy(true);
    setError(null);
    try {
      const next = await openWorkspace();
      if (!next) {
        setBusy(false);
        return;
      }
      setBoard(next);
      setFeature("all");
    } catch (e) {
      setError(String(e));
      setBoard(null);
    } finally {
      setBusy(false);
    }
  }

  async function onReload() {
    if (!board) return;
    setBusy(true);
    setError(null);
    try {
      setBoard(await reloadBoard(board.root));
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand__mark">the-office</span>
          <span className="brand__sub">Board</span>
        </div>
        <div className="topbar__actions">
          {board ? (
            <select
              value={feature}
              onChange={(e) => setFeature(e.target.value)}
              aria-label="Filter by feature"
            >
              <option value="all">All features</option>
              {features.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
          ) : null}
          {board ? (
            <button type="button" className="ghost" onClick={onReload} disabled={busy}>
              Reload
            </button>
          ) : null}
          <button type="button" onClick={onOpen} disabled={busy}>
            {busy ? "Opening…" : "Open folder"}
          </button>
        </div>
      </header>

      {error ? <p className="error banner">{error}</p> : null}

      {!board ? (
        <main className="welcome">
          <h1>Open a repository</h1>
          <p>
            Pick a folder that contains <code>.the-office/</code>. Tasks are
            markdown files under <code>.the-office/features/</code> — drag them
            across columns to claim, review, complete, or block.
          </p>
          <p className="welcome__hint">
            In the browser, use Chrome or Edge so the folder picker can read and
            write task files. For the native dialog, run{" "}
            <code>npm run tauri dev</code>.
          </p>
          <button type="button" className="primary" onClick={onOpen} disabled={busy}>
            Open folder
          </button>
        </main>
      ) : (
        <>
          <p className="root-path" title={board.root}>
            {board.root}
            <span>
              {" "}
              · {board.tasks.filter((t) => t.status === "completed").length}/
              {board.tasks.length} completed
            </span>
          </p>
          <Board board={board} onBoardChange={setBoard} featureFilter={feature} />
        </>
      )}
    </div>
  );
}

export default App;
