import { useState, useEffect, useRef } from "react";
import Lottie from "lottie-react";
import { track } from "../../lib/track";

interface HelpExplainerProps {
  title: string;
  lottieSrc: Record<string, unknown>;
  mp4Src?: string;
  captionsSrc?: string;
  alt: string;
}

export default function HelpExplainer({
  title,
  lottieSrc,
  mp4Src,
  captionsSrc,
  alt,
}: HelpExplainerProps) {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  const [isPlaying, setIsPlaying] = useState(true);
  const [useFallback, setUseFallback] = useState(false);
  const [hideOnLoad, setHideOnLoad] = useState(false);
  const lottieRef = useRef<any>(null); // eslint-disable-line @typescript-eslint/no-explicit-any
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setPrefersReducedMotion(mq.matches);
    if (mq.matches) setIsPlaying(false);

    const handler = (e: MediaQueryListEvent) => {
      setPrefersReducedMotion(e.matches);
      if (e.matches) setIsPlaying(false);
    };
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  useEffect(() => {
    const saved = localStorage.getItem("help_hide_animation");
    if (saved === "true") setHideOnLoad(true);
  }, []);

  const togglePlay = () => {
    const next = !isPlaying;
    setIsPlaying(next);
    track(next ? "help_animation_play" : "help_animation_pause");

    if (useFallback && videoRef.current) {
      next ? videoRef.current.play() : videoRef.current.pause();
    } else if (lottieRef.current) {
      next ? lottieRef.current.play() : lottieRef.current.pause();
    }
  };

  const replay = () => {
    setIsPlaying(true);
    track("help_animation_replay");
    if (useFallback && videoRef.current) {
      videoRef.current.currentTime = 0;
      videoRef.current.play();
    } else if (lottieRef.current) {
      lottieRef.current.goToAndPlay(0);
    }
  };

  const toggleHideOnLoad = () => {
    const next = !hideOnLoad;
    setHideOnLoad(next);
    localStorage.setItem("help_hide_animation", String(next));
  };

  if (hideOnLoad) {
    return (
      <div className="card mb-10">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-dark-100">{title}</h2>
          <button
            onClick={toggleHideOnLoad}
            className="text-sm text-accent-light hover:text-accent transition-colors"
          >
            Show Animation
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="card mb-10">
      <h2 className="text-lg font-semibold text-dark-100 mb-4">{title}</h2>

      <div className="relative bg-dark-800 rounded-xl overflow-hidden" role="img" aria-label={alt}>
        {useFallback && mp4Src ? (
          <video
            ref={videoRef}
            src={mp4Src}
            autoPlay={!prefersReducedMotion}
            loop
            muted
            playsInline
            className="w-full"
            aria-label={alt}
          >
            {captionsSrc && (
              <track kind="captions" src={captionsSrc} srcLang="en" label="English" default />
            )}
          </video>
        ) : (
          <Lottie
            lottieRef={lottieRef}
            animationData={lottieSrc}
            loop
            autoplay={!prefersReducedMotion}
            className="w-full"
            onError={() => {
              if (mp4Src) setUseFallback(true);
            }}
          />
        )}

        {/* Reduced motion overlay */}
        {prefersReducedMotion && !isPlaying && (
          <div className="absolute inset-0 bg-dark-900/60 flex items-center justify-center">
            <button
              onClick={togglePlay}
              className="bg-accent hover:bg-accent-light text-white px-6 py-3 rounded-xl font-medium transition-colors"
            >
              Play Animation
            </button>
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="flex items-center justify-between mt-3">
        <div className="flex items-center gap-2">
          <button
            onClick={togglePlay}
            className="text-xs text-dark-400 hover:text-dark-200 px-3 py-1.5 rounded-lg bg-dark-800 hover:bg-dark-700 transition-colors"
            aria-label={isPlaying ? "Pause animation" : "Play animation"}
          >
            {isPlaying ? "Pause" : "Play"}
          </button>
          <button
            onClick={replay}
            className="text-xs text-dark-400 hover:text-dark-200 px-3 py-1.5 rounded-lg bg-dark-800 hover:bg-dark-700 transition-colors"
            aria-label="Replay animation"
          >
            Replay
          </button>
          {mp4Src && (
            <button
              onClick={() => {
                setUseFallback(!useFallback);
                track("help_animation_toggle_fallback", { useFallback: !useFallback });
              }}
              className="text-xs text-dark-500 hover:text-dark-300 px-2 py-1.5 transition-colors"
            >
              {useFallback ? "Use Lottie" : "Use Video"}
            </button>
          )}
        </div>
        <label className="flex items-center gap-2 cursor-pointer text-xs text-dark-500">
          <input
            type="checkbox"
            checked={hideOnLoad}
            onChange={toggleHideOnLoad}
            className="rounded border-dark-600 bg-dark-800 text-accent focus:ring-accent/30"
          />
          Don't show on load
        </label>
      </div>
    </div>
  );
}
