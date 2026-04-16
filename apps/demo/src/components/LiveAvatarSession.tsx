"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  LiveAvatarContextProvider,
  useSession,
  useTextChat,
  useVoiceChat,
  useChatHistory,
  useMicrophoneDevices,
} from "../liveavatar";
import { SessionState, VoiceChatConfig } from "@heygen/liveavatar-web-sdk";
import { useAvatarActions } from "../liveavatar/useAvatarActions";
import { SessionMode } from "./LiveAvatarDemo";

const StatusDot: React.FC<{ active: boolean; label: string }> = ({
  active,
  label,
}) => (
  <div className="flex items-center gap-1.5 text-xs text-gray-400">
    <div
      className={`w-2 h-2 rounded-full ${active ? "bg-green-400" : "bg-gray-600"}`}
    />
    {label}
  </div>
);

const ActionButton: React.FC<{
  onClick: () => void;
  disabled?: boolean;
  variant?: "primary" | "secondary" | "danger";
  size?: "sm" | "md";
  children: React.ReactNode;
}> = ({ onClick, disabled, variant = "secondary", size = "md", children }) => {
  const base =
    "font-medium rounded-lg transition-all disabled:opacity-40 disabled:cursor-not-allowed";
  const sizes = {
    sm: "px-4 py-2 text-sm",
    md: "px-5 py-2.5 text-sm",
  };
  const variants = {
    primary: "bg-white text-black hover:bg-gray-100 active:bg-gray-200",
    secondary:
      "bg-white/10 text-white border border-white/10 hover:bg-white/15 active:bg-white/20",
    danger:
      "bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20 active:bg-red-500/30",
  };

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`${base} ${sizes[size]} ${variants[variant]}`}
    >
      {children}
    </button>
  );
};

const LiveAvatarSessionComponent: React.FC<{
  mode: SessionMode;
  onSessionStopped: () => void;
  hasVoiceChat: boolean;
  startInFullscreen?: boolean;
}> = ({ mode, onSessionStopped, hasVoiceChat, startInFullscreen }) => {
  const [message, setMessage] = useState("");
  const {
    sessionState,
    isStreamReady,
    startSession,
    stopSession,
    connectionQuality,
    keepAlive,
    attachElement,
  } = useSession();
  const {
    isAvatarTalking,
    isUserTalking,
    isMuted,
    isActive,
    isLoading,
    start,
    stop,
    mute,
    unmute,
    startPushToTalk,
    stopPushToTalk,
    error: voiceChatError,
  } = useVoiceChat();

  const { devices, selectedDeviceId, selectDevice } = useMicrophoneDevices();

  const avatarActionsMode = mode === "FULL_PTT" ? "FULL" : mode;
  const { interrupt, repeat, startListening, stopListening } =
    useAvatarActions(avatarActionsMode);

  const textChatMode = mode === "FULL_PTT" ? "FULL" : mode;
  const { sendMessage } = useTextChat(textChatMode);
  const chatMessages = useChatHistory();
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const [videoHeight, setVideoHeight] = useState<number>(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [videoFilterEnabled, setVideoFilterEnabled] = useState(true);
  const animFrameRef = useRef<number>(0);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);
  const skipFrame = useRef(false);

  const processVideoFrame = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || video.paused || video.ended || !video.videoWidth) {
      animFrameRef.current = requestAnimationFrame(processVideoFrame);
      return;
    }

    // Process every other frame for performance
    skipFrame.current = !skipFrame.current;
    if (skipFrame.current) {
      animFrameRef.current = requestAnimationFrame(processVideoFrame);
      return;
    }

    if (!ctxRef.current) {
      ctxRef.current = canvas.getContext("2d", { willReadFrequently: true });
    }
    const ctx = ctxRef.current;
    if (!ctx) {
      animFrameRef.current = requestAnimationFrame(processVideoFrame);
      return;
    }

    const w = video.videoWidth;
    const h = video.videoHeight;
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }

    ctx.drawImage(video, 0, 0, w, h);
    const imageData = ctx.getImageData(0, 0, w, h);
    const d = imageData.data;

    for (let i = 0; i < d.length; i += 4) {
      const r = d[i]!;
      const g = d[i + 1]!;
      const b = d[i + 2]!;

      // Green screen → black
      if (g > 70 && g > r * 1.25 && g > b * 1.25) {
        d[i] = 0;
        d[i + 1] = 0;
        d[i + 2] = 0;
        continue;
      }

      // Pink/magenta suit (#ED0D7F, #D80060, #DA0266, #EC0D80 range) → green
      if (r > 160 && g < 80 && b > 40 && b < 160 && r > b * 1.3) {
        const brightness = (r + g + b) / 3;
        d[i] = Math.round(brightness * 0.15);
        d[i + 1] = Math.min(255, Math.round(brightness * 1.2));
        d[i + 2] = Math.round(brightness * 0.15);
      }
    }

    ctx.putImageData(imageData, 0, 0);
    animFrameRef.current = requestAnimationFrame(processVideoFrame);
  }, []);

  useEffect(() => {
    if (videoFilterEnabled && isStreamReady) {
      ctxRef.current = null;
      animFrameRef.current = requestAnimationFrame(processVideoFrame);
    }
    return () => {
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
      }
    };
  }, [videoFilterEnabled, isStreamReady, processVideoFrame]);

  useEffect(() => {
    const onFsChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onFsChange);
    return () => document.removeEventListener("fullscreenchange", onFsChange);
  }, []);

  useEffect(() => {
    if (!startInFullscreen) return;
    const enterFs = () => {
      if (frameRef.current) {
        frameRef.current.requestFullscreen().catch(() => {});
      }
    };
    if (document.fullscreenElement) {
      document
        .exitFullscreen()
        .then(() => {
          setTimeout(enterFs, 100);
        })
        .catch(() => {
          setTimeout(enterFs, 100);
        });
    } else {
      setTimeout(enterFs, 100);
    }
  }, [startInFullscreen]);

  const toggleFullscreen = () => {
    if (!isFullscreen && frameRef.current) {
      frameRef.current.requestFullscreen();
    } else if (document.fullscreenElement) {
      document.exitFullscreen();
    }
  };

  useEffect(() => {
    if (sessionState === SessionState.DISCONNECTED) {
      onSessionStopped();
    }
  }, [sessionState, onSessionStopped]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages]);

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setVideoHeight(entry.contentRect.height);
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [isStreamReady]);

  useEffect(() => {
    if (isStreamReady && videoRef.current) {
      attachElement(videoRef.current);
    }
  }, [attachElement, isStreamReady]);

  useEffect(() => {
    if (sessionState === SessionState.INACTIVE) {
      startSession();
    }
  }, [startSession, sessionState]);

  const qualityColor =
    connectionQuality === "GOOD"
      ? "text-green-400"
      : connectionQuality === "BAD"
        ? "text-red-400"
        : "text-gray-500";

  return (
    <div className="w-full max-w-[1400px] h-full flex flex-col gap-4 py-4">
      {/* Video + Chat row */}
      <div className="w-full flex flex-row items-start justify-center gap-4">
        <div
          ref={frameRef}
          className={`relative overflow-hidden flex flex-col bg-black ${isFullscreen ? "w-full h-full items-center justify-center" : "rounded-lg"}`}
          style={isFullscreen ? {} : { aspectRatio: "9/32", maxHeight: "90vh" }}
        >
          {isFullscreen && <div className="absolute inset-0 bg-black" />}
          <div
            className={`relative flex flex-col overflow-hidden ${isFullscreen ? "h-full" : "w-full h-full"}`}
            style={
              isFullscreen ? { aspectRatio: "9/32", maxHeight: "100vh" } : {}
            }
          >
            {/* Top-right controls */}
            <div className="absolute top-3 right-3 z-20 flex gap-2">
              <button
                onClick={() => setVideoFilterEnabled((v) => !v)}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg backdrop-blur-sm transition-colors ${
                  videoFilterEnabled
                    ? "bg-green-500/30 text-green-300 border border-green-400/30 hover:bg-green-500/40"
                    : "bg-black/60 text-white/70 hover:bg-black/80 hover:text-white"
                }`}
              >
                {videoFilterEnabled ? "Filter ON" : "Filter OFF"}
              </button>
              <button
                onClick={toggleFullscreen}
                className="px-3 py-1.5 text-xs font-medium rounded-lg bg-black/60 text-white/70 hover:bg-black/80 hover:text-white backdrop-blur-sm transition-colors"
              >
                {isFullscreen ? "Exit Fullscreen" : "Fullscreen"}
              </button>
            </div>
            {/* Top: Black space with spinning Kontrax logo */}
            <div
              className="flex items-center justify-center bg-black"
              style={{ flex: "0 0 25%" }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/logo-kontrax-white.svg"
                alt="Kontrax"
                className="w-48"
                style={{ animation: "spinY 4s linear infinite" }}
              />
            </div>
            {/* Middle: Video area */}
            <div className="relative flex-1 overflow-hidden">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                className="absolute inset-0 w-full h-full object-cover"
                style={{
                  transform: "scale(0.5)",
                  zIndex: videoFilterEnabled ? 0 : 1,
                }}
              />
              <canvas
                ref={canvasRef}
                className="absolute inset-0 w-full h-full object-cover"
                style={{
                  transform: "scale(0.5)",
                  zIndex: videoFilterEnabled ? 1 : 0,
                  display: videoFilterEnabled ? "block" : "none",
                }}
              />
              {/* Hologram projection effect - scaled to match video */}
              <div
                className="absolute inset-0 z-20 pointer-events-none"
                style={{ transform: "scale(0.5)" }}
              >
                <div className="hologram-beams" />
                <div className="hologram-base-glow" />
                <div className="hologram-laser-left" />
                <div className="hologram-laser-right" />
                <div className="hologram-laser-center-left" />
                <div className="hologram-laser-center-right" />
                <div className="hologram-laser-flash" />
                <div className="hologram-scanline" />
                <div className="hologram-edge-glow" />
              </div>
              {/* Overlay status badges */}
              <div className="absolute top-3 left-3 flex items-center gap-2 z-10">
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-black/60 backdrop-blur-sm">
                  <div
                    className={`w-2 h-2 rounded-full ${
                      sessionState === SessionState.CONNECTED
                        ? "bg-green-400"
                        : sessionState === SessionState.CONNECTING
                          ? "bg-yellow-400 animate-pulse"
                          : "bg-gray-500"
                    }`}
                  />
                  <span className="text-xs text-white/70 font-medium uppercase tracking-wider">
                    {sessionState}
                  </span>
                </div>
                <span
                  className={`text-xs font-medium uppercase tracking-wider px-3 py-1.5 rounded-full bg-black/60 backdrop-blur-sm ${qualityColor}`}
                >
                  {connectionQuality}
                </span>
              </div>
              {/* Talking indicators */}
              <div className="absolute bottom-3 left-3 flex items-center gap-2 z-10">
                {(mode === "FULL" || mode === "FULL_PTT") && (
                  <div
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full backdrop-blur-sm transition-colors ${
                      isUserTalking
                        ? "bg-blue-500/30 border border-blue-400/30"
                        : "bg-black/40"
                    }`}
                  >
                    <div
                      className={`w-2 h-2 rounded-full transition-colors ${isUserTalking ? "bg-blue-400 animate-pulse" : "bg-gray-500"}`}
                    />
                    <span className="text-xs text-white/70 font-medium">
                      You
                    </span>
                  </div>
                )}
                <div
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full backdrop-blur-sm transition-colors ${
                    isAvatarTalking
                      ? "bg-purple-500/30 border border-purple-400/30"
                      : "bg-black/40"
                  }`}
                >
                  <div
                    className={`w-2 h-2 rounded-full transition-colors ${isAvatarTalking ? "bg-purple-400 animate-pulse" : "bg-gray-500"}`}
                  />
                  <span className="text-xs text-white/70 font-medium">
                    Avatar
                  </span>
                </div>
              </div>
              {/* Stop button */}
              <button
                className="absolute bottom-3 right-3 px-4 py-2 text-sm font-medium rounded-lg bg-red-500/80 text-white hover:bg-red-500 backdrop-blur-sm transition-colors z-10"
                onClick={() => stopSession()}
              >
                End Session
              </button>
            </div>
            {/* Bottom: Desk image overlaid in front of the video */}
            <div
              className="relative z-10 pointer-events-none"
              style={{ flex: "0 0 37%", marginTop: "-30%" }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/desk.png"
                alt="Desk"
                className="w-full h-full object-cover object-top"
                style={{ transform: "scale(1.2)" }}
              />
            </div>
          </div>
        </div>

        {/* Chat History */}
        {(mode === "FULL" || mode === "FULL_PTT") && (
          <div
            className="w-[350px] shrink-0 overflow-hidden border border-white/10 rounded-lg bg-white/5 flex flex-col"
            style={{ height: videoHeight > 0 ? videoHeight : 400 }}
          >
            <div className="px-4 py-3 border-b border-white/10 shrink-0">
              <p className="font-medium text-sm text-white">Chat</p>
            </div>
            <div
              className="flex-1 overflow-y-auto p-3 flex flex-col gap-2"
              style={{ scrollbarWidth: "none" }}
            >
              {chatMessages.length === 0 && (
                <p className="text-gray-500 text-xs text-center mt-8">
                  Transcriptions will appear here
                </p>
              )}
              {chatMessages.map((msg, i) => (
                <div
                  key={i}
                  className={`flex ${msg.sender === "user" ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[85%] px-3 py-2 rounded-lg text-sm ${
                      msg.sender === "user"
                        ? "bg-blue-500/20 text-blue-100 border border-blue-500/10"
                        : "bg-white/10 text-gray-200 border border-white/5"
                    }`}
                  >
                    <span className="font-medium text-xs uppercase tracking-wider opacity-50 block mb-0.5">
                      {msg.sender === "user" ? "You" : "Avatar"}
                    </span>
                    <p className="leading-relaxed">{msg.message}</p>
                  </div>
                </div>
              ))}
              <div ref={chatEndRef} />
            </div>
            <div className="shrink-0 px-3 py-3 border-t border-white/10 flex flex-col gap-2">
              <input
                type="text"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && message.trim()) {
                    sendMessage(message);
                    setMessage("");
                  }
                }}
                placeholder="Type a message..."
                className="w-full px-4 py-2 rounded-lg bg-white/5 text-white text-sm border border-white/10 focus:outline-none focus:border-white/30 placeholder-gray-500 transition-colors"
              />
              <div className="flex items-center gap-2">
                <ActionButton
                  onClick={() => {
                    sendMessage(message);
                    setMessage("");
                  }}
                  variant="primary"
                  size="sm"
                >
                  Send
                </ActionButton>
                <ActionButton
                  onClick={() => {
                    repeat(message);
                    setMessage("");
                  }}
                  size="sm"
                >
                  Repeat
                </ActionButton>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="w-full flex flex-col items-center gap-3">
        {voiceChatError && (
          <p className="text-red-400 text-xs bg-red-500/10 border border-red-500/20 px-3 py-1.5 rounded-lg">
            {voiceChatError}
          </p>
        )}

        {/* Microphone Selection */}
        {hasVoiceChat && devices.length > 1 && (
          <div className="flex items-center gap-2">
            <label className="text-xs text-gray-400">Microphone:</label>
            <select
              value={selectedDeviceId ?? ""}
              onChange={(e) => selectDevice(e.target.value)}
              className="px-3 py-1.5 rounded-lg bg-white/5 text-white text-sm border border-white/10 focus:outline-none focus:border-white/30 transition-colors"
            >
              {devices.map((device) => (
                <option key={device.deviceId} value={device.deviceId}>
                  {device.label}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Voice Chat */}
        {mode === "FULL" && (
          <div className="flex items-center gap-2">
            <StatusDot active={isActive} label="Voice Chat" />
            <ActionButton
              onClick={() => (isActive ? stop() : start())}
              disabled={isLoading}
              variant={isActive ? "danger" : "primary"}
              size="sm"
            >
              {isLoading
                ? "Loading..."
                : isActive
                  ? "Stop Voice Chat"
                  : "Start Voice Chat"}
            </ActionButton>
            {isActive && (
              <ActionButton
                onClick={() => (isMuted ? unmute() : mute())}
                size="sm"
                variant={isMuted ? "primary" : "secondary"}
              >
                {isMuted ? "Unmute" : "Mute"}
              </ActionButton>
            )}
          </div>
        )}

        {mode === "FULL_PTT" && (
          <div className="flex items-center gap-2">
            <ActionButton
              onClick={() => {
                startListening();
                startPushToTalk();
              }}
              variant="primary"
              size="sm"
            >
              Push to Talk
            </ActionButton>
            <ActionButton
              onClick={() => {
                stopPushToTalk();
                stopListening();
              }}
              size="sm"
            >
              Release
            </ActionButton>
          </div>
        )}

        {/* Avatar Controls */}
        <div className="flex items-center gap-2">
          <ActionButton onClick={startListening} size="sm">
            Start Listening Pose
          </ActionButton>
          <ActionButton onClick={stopListening} size="sm">
            Stop Listening Pose
          </ActionButton>
          <ActionButton onClick={interrupt} size="sm">
            Interrupt
          </ActionButton>
          <ActionButton onClick={keepAlive} size="sm">
            Keep Alive
          </ActionButton>
        </div>

        {/* Text input for LITE mode (no chat panel) */}
        {mode === "LITE" && (
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && message.trim()) {
                  sendMessage(message);
                  setMessage("");
                }
              }}
              placeholder="Type a message..."
              className="w-[350px] px-4 py-2 rounded-lg bg-white/5 text-white text-sm border border-white/10 focus:outline-none focus:border-white/30 placeholder-gray-500 transition-colors"
            />
            <ActionButton
              onClick={() => {
                sendMessage(message);
                setMessage("");
              }}
              variant="primary"
              size="sm"
            >
              Send
            </ActionButton>
            <ActionButton
              onClick={() => {
                repeat(message);
                setMessage("");
              }}
              size="sm"
            >
              Repeat
            </ActionButton>
          </div>
        )}
      </div>
    </div>
  );
};

export const LiveAvatarSession: React.FC<{
  mode: SessionMode;
  sessionAccessToken: string;
  onSessionStopped: () => void;
  voiceChatConfig?: boolean | VoiceChatConfig;
  startInFullscreen?: boolean;
}> = ({
  mode,
  sessionAccessToken,
  onSessionStopped,
  voiceChatConfig = true,
  startInFullscreen,
}) => {
  return (
    <LiveAvatarContextProvider
      sessionAccessToken={sessionAccessToken}
      voiceChatConfig={voiceChatConfig}
    >
      <LiveAvatarSessionComponent
        mode={mode}
        onSessionStopped={onSessionStopped}
        hasVoiceChat={!!voiceChatConfig}
        startInFullscreen={startInFullscreen}
      />
    </LiveAvatarContextProvider>
  );
};
