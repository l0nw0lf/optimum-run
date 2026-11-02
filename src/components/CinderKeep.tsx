import { useEffect, useRef, useState, type PointerEvent } from "react";
import { mountGame, type GameApi, type UiState } from "@/game/runtime";

const empty: UiState = {
  mode: "title",
  levelIndex: 0,
  world: "1-1",
  name: "Ash Gate",
  blurb: "Learn the run. Lava, a lift, and one slow fire bar.",
  coins: 0,
  score: 0,
  time: 180,
  bonus: 0,
  cause: "",
  bestCoins: [0, 0, 0],
  cleared: [false, false, false],
  muted: false,
  levelCount: 3,
};

const NAMES = ["Ash Gate", "Cinder Span", "The Keep"];
const WORLDS = ["1-1", "1-2", "1-3"];
const BLURBS = [
  "Learn the run. Brew, a lift, and one slow fire bar.",
  "Ride the lifts, slip the fire, double-jump the last pit.",
  "Towers, two lifts, and fire over the last bridge.",
];

export function CinderKeep() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const apiRef = useRef<GameApi | null>(null);
  const padsRef = useRef(new Map<number, "l" | "r" | "j">());
  const [ui, setUi] = useState<UiState>(empty);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const api = mountGame(canvas, setUi);
    apiRef.current = api;

    const releasePointer = (id: number) => {
      const which = padsRef.current.get(id);
      if (!which) return;
      padsRef.current.delete(id);
      let still = false;
      for (const w of padsRef.current.values()) if (w === which) still = true;
      api.touch(which, still);
    };
    const releaseAll = () => {
      padsRef.current.clear();
      api.touch("l", false);
      api.touch("r", false);
      api.touch("j", false);
    };
    const onPointerUp = (e: Event) => {
      const id = (e as globalThis.PointerEvent).pointerId;
      releasePointer(id);
    };
    const onTouchEnd = (e: TouchEvent) => {
      if (e.touches.length === 0) releaseAll();
    };
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerUp);
    window.addEventListener("touchend", onTouchEnd);
    window.addEventListener("touchcancel", releaseAll);

    return () => {
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);
      window.removeEventListener("touchend", onTouchEnd);
      window.removeEventListener("touchcancel", releaseAll);
      api.destroy();
    };
  }, []);

  const hold = (which: "l" | "r" | "j") => ({
    onPointerDown: (e: PointerEvent<HTMLButtonElement>) => {
      e.preventDefault();
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        /* iOS can refuse capture */
      }
      padsRef.current.set(e.pointerId, which);
      apiRef.current?.touch(which, true);
    },
    onPointerUp: (e: PointerEvent<HTMLButtonElement>) => {
      e.preventDefault();
      padsRef.current.delete(e.pointerId);
      let still = false;
      for (const w of padsRef.current.values()) if (w === which) still = true;
      apiRef.current?.touch(which, still);
    },
    onPointerCancel: (e: PointerEvent<HTMLButtonElement>) => {
      padsRef.current.delete(e.pointerId);
      let still = false;
      for (const w of padsRef.current.values()) if (w === which) still = true;
      apiRef.current?.touch(which, still);
    },
    onContextMenu: (e: PointerEvent<HTMLButtonElement>) => e.preventDefault(),
  });

  const showTouch = ui.mode === "play" || ui.mode === "pause";
  const showMenu = ui.mode === "play";

  return (
    <div className="shell">
      {showMenu && (
        <div className="topbar">
          <span className="muted hint">Arrows or WASD · Space jumps twice</span>
          <span className="top-actions">
            <button type="button" className="btn btn-ghost" onClick={() => apiRef.current?.toggleMute()}>
              {ui.muted ? "Muted" : "Mute"}
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => apiRef.current?.pause()}>
              Menu
            </button>
          </span>
        </div>
      )}
      <div className="stage">
        <canvas ref={canvasRef} className="playfield" width={256} height={240} aria-label="Cinder Keep playfield" />
        {ui.mode !== "play" && (
          <div className="veil">
            {ui.mode === "title" && (
              <div className="card">
                <p className="kicker">Haunted Hollow</p>
                <h1 className="wordmark">
                  OPTIMUM
                  <br />
                  RUN
                </h1>
                <p className="muted">
                  Run the keep and collect every Optimum logo. Jump the brew, light the lamps, and reach the
                  flag. Fastest propagation wins.
                </p>
                <p className="muted">Arrows or WASD. Space, W, or up to jump. M mutes.</p>
                <div className="stack">
                  <button type="button" className="btn" onClick={() => apiRef.current?.start(0)}>
                    Enter the mesh
                  </button>
                  <button type="button" className="btn btn-ghost" onClick={() => apiRef.current?.toSelect()}>
                    Choose a node
                  </button>
                </div>
              </div>
            )}
            {ui.mode === "select" && (
              <div className="card">
                <p className="kicker">Level select</p>
                <h2 className="wordmark">THREE KEEPS</h2>
                <div className="stack">
                  {WORLDS.map((world, i) => (
                    <button key={world} type="button" className="btn btn-ghost level-btn" onClick={() => apiRef.current?.start(i)}>
                      <span className="kicker">{world}</span>
                      <span>
                        {NAMES[i]}
                        {ui.cleared[i] ? " · clear" : ""}
                      </span>
                      <span className="muted">
                        {BLURBS[i]} Best coins {ui.bestCoins[i] ?? 0}.
                      </span>
                    </button>
                  ))}
                  <button type="button" className="btn" onClick={() => apiRef.current?.toTitle()}>
                    Back
                  </button>
                </div>
              </div>
            )}
            {ui.mode === "pause" && (
              <div className="card">
                <p className="kicker">{ui.world}</p>
                <h2 className="wordmark">PAUSED</h2>
                <p className="muted">{ui.name}. Esc resumes. R restarts the keep.</p>
                <div className="stack">
                  <button type="button" className="btn" onClick={() => apiRef.current?.resume()}>
                    Resume
                  </button>
                  <button type="button" className="btn btn-ghost" onClick={() => apiRef.current?.restart()}>
                    Restart
                  </button>
                  <button type="button" className="btn btn-ghost" onClick={() => apiRef.current?.toSelect()}>
                    Level select
                  </button>
                  <button type="button" className="btn btn-ghost" onClick={() => apiRef.current?.toggleMute()}>
                    {ui.muted ? "Sound off" : "Sound on"}
                  </button>
                </div>
              </div>
            )}
            {ui.mode === "dead" && (
              <div className="card">
                <p className="kicker">{ui.world}</p>
                <h2 className="wordmark">BURNT OUT</h2>
                <p className="muted">{ui.cause} The last lamp still holds your coins.</p>
                <div className="stack">
                  <button type="button" className="btn" onClick={() => apiRef.current?.respawn()}>
                    Respawn
                  </button>
                  <button type="button" className="btn btn-lava" onClick={() => apiRef.current?.restart()}>
                    Restart level
                  </button>
                  <button type="button" className="btn btn-ghost" onClick={() => apiRef.current?.toSelect()}>
                    Level select
                  </button>
                </div>
              </div>
            )}
            {ui.mode === "clear" && (
              <div className="card">
                <p className="kicker">{ui.world} clear</p>
                <h2 className="wordmark">FLAG TAKEN</h2>
                <div className="stat">
                  <span>Coins</span>
                  <span>{ui.coins}</span>
                </div>
                <div className="stat">
                  <span>Time bonus</span>
                  <span>{ui.bonus}</span>
                </div>
                <div className="stat">
                  <span>Score</span>
                  <span>{ui.score}</span>
                </div>
                <div className="stack">
                  {ui.levelIndex < ui.levelCount - 1 ? (
                    <button type="button" className="btn" onClick={() => apiRef.current?.next()}>
                      Next keep
                    </button>
                  ) : (
                    <button type="button" className="btn" onClick={() => apiRef.current?.toSelect()}>
                      All keeps clear
                    </button>
                  )}
                  <div className="row">
                    <button type="button" className="btn btn-ghost" onClick={() => apiRef.current?.restart()}>
                      Replay
                    </button>
                    <button type="button" className="btn btn-ghost" onClick={() => apiRef.current?.toSelect()}>
                      Levels
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
      {showTouch && (
        <div
          className="touchbar"
          ref={(node) => {
            if (!node || node.dataset.bound) return;
            node.dataset.bound = "1";
            const block = (e: Event) => e.preventDefault();
            node.addEventListener("touchstart", block, { passive: false });
            node.addEventListener("selectstart", block);
          }}
        >
          <div className="pad">
            <button type="button" className="pad-btn" data-label="Left" aria-label="Move left" {...hold("l")} />
            <button type="button" className="pad-btn" data-label="Right" aria-label="Move right" {...hold("r")} />
          </div>
          <button type="button" className="pad-btn jump" data-label="Jump" aria-label="Jump" {...hold("j")} />
        </div>
      )}
    </div>
  );
}
