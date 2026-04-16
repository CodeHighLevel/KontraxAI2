"use client";

import { useMemo, useRef, useState } from "react";
import { LiveAvatarSession } from "./LiveAvatarSession";
import { SessionInteractivityMode } from "@heygen/liveavatar-web-sdk";

export type SessionMode = "FULL" | "FULL_PTT" | "LITE";

export const LiveAvatarDemo = () => {
  const [sessionToken, setSessionToken] = useState("");
  const [mode, setMode] = useState<SessionMode>("FULL");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [manualToken, setManualToken] = useState("");
  const [isLandingFullscreen, setIsLandingFullscreen] = useState(false);
  const [startInFullscreen, setStartInFullscreen] = useState(false);
  const landingFrameRef = useRef<HTMLDivElement>(null);

  const handleStartFullSession = async (pushToTalk: boolean = false) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/start-session", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ pushToTalk }),
      });
      if (!res.ok) {
        const error = await res.json();
        console.error("Failed to start full session", error);
        setError(error.error);
        return;
      }
      const { session_token } = await res.json();
      setSessionToken(session_token);
      setMode(pushToTalk ? "FULL_PTT" : "FULL");
    } catch (error: unknown) {
      setError((error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleStartLiteSession = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/start-lite-session", {
        method: "POST",
      });
      if (!res.ok) {
        const error = await res.json();
        setError(error.error);
        return;
      }
      const { session_token } = await res.json();
      setSessionToken(session_token);
      setMode("LITE");
    } catch (error: unknown) {
      setError((error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleStartWithToken = () => {
    const trimmed = manualToken.trim();
    if (!trimmed) {
      setError("Please enter a session token.");
      return;
    }
    setSessionToken(trimmed);
    setMode(manualMode);
  };

  const onSessionStopped = () => {
    setSessionToken("");
    setManualToken("");
  };

  const voiceChatConfig = useMemo(() => {
    if (mode === "FULL_PTT") {
      return {
        mode: SessionInteractivityMode.PUSH_TO_TALK,
      };
    }
    return true;
  }, [mode]);

  return (
    <div className="w-full h-full flex flex-col items-center justify-center relative">
      {!sessionToken ? (
        <div
          ref={landingFrameRef}
          className={`relative overflow-hidden bg-black ${isLandingFullscreen ? "w-full h-full" : "rounded-lg"}`}
          style={
            isLandingFullscreen
              ? {}
              : { aspectRatio: "9/32", maxHeight: "90vh" }
          }
        >
          {isLandingFullscreen && <div className="absolute inset-0 bg-black" />}
          <div
            className={`relative flex flex-col overflow-hidden ${isLandingFullscreen ? "h-full mx-auto" : "w-full h-full"}`}
            style={
              isLandingFullscreen
                ? { aspectRatio: "9/32", maxHeight: "100vh" }
                : {}
            }
          >
            <button
              onClick={() => {
                if (isLandingFullscreen) {
                  document.exitFullscreen();
                  setIsLandingFullscreen(false);
                } else if (landingFrameRef.current) {
                  landingFrameRef.current.requestFullscreen();
                  setIsLandingFullscreen(true);
                }
              }}
              className="absolute top-3 right-3 z-20 px-3 py-1.5 text-xs font-medium rounded-lg bg-black/60 text-white/70 hover:bg-black/80 hover:text-white backdrop-blur-sm transition-colors"
            >
              {isLandingFullscreen ? "Exit Fullscreen" : "Fullscreen"}
            </button>
            <div className="landing-ambient">
              <div className="orb-1" />
              <div className="orb-2" />
              <div className="orb-3" />
              <div className="grid-overlay" />
              <div className="holo-ring" />
              <div className="holo-ring-2" />
              <div className="scanline" />
              <div className="particle" />
              <div className="particle" />
              <div className="particle" />
              <div className="particle" />
              <div className="particle" />
              <div className="particle" />
            </div>
            <div className="relative z-10 w-full h-full flex flex-col items-center justify-center gap-6 p-8">
              <div className="text-center mb-2">
                <h1
                  className="text-3xl font-bold text-white mb-1"
                  style={{
                    textShadow:
                      "0 0 20px rgba(0, 230, 150, 0.4), 0 0 40px rgba(0, 230, 150, 0.15)",
                  }}
                >
                  Kontrax AI
                </h1>
              </div>

              {error && (
                <div className="w-full px-4 py-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
                  {error}
                </div>
              )}

              <button
                onClick={() => {
                  setStartInFullscreen(isLandingFullscreen);
                  handleStartFullSession(false);
                }}
                disabled={loading}
                className="px-8 py-3 rounded-lg bg-green-600 text-white font-medium text-lg border border-green-500 hover:bg-green-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                style={{
                  boxShadow:
                    "0 0 20px rgba(0, 230, 150, 0.3), 0 0 40px rgba(0, 230, 150, 0.1)",
                }}
              >
                {loading ? "Зареждане..." : "Започни Разговор"}
              </button>
            </div>
          </div>
        </div>
      ) : (
        <LiveAvatarSession
          mode={mode}
          sessionAccessToken={sessionToken}
          voiceChatConfig={voiceChatConfig}
          onSessionStopped={onSessionStopped}
          startInFullscreen={startInFullscreen}
        />
      )}
    </div>
  );
};
