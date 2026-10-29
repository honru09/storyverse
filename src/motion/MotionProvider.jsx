import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { motionPolicy } from "./policy.js";
import { observeInputModality } from "./input-modality.js";

const MotionContext = createContext(null);
const PREFERENCE_KEY = "storyweave:motion";

function useMedia(query) {
  const [matches, setMatches] = useState(
    () => window.matchMedia(query).matches,
  );
  useEffect(() => {
    const media = window.matchMedia(query);
    const update = () => setMatches(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, [query]);
  return matches;
}

export function MotionProvider({ children }) {
  useEffect(() => observeInputModality(), []);
  // SALT §51 (draft §4.1): mirror the policy's low-power verdict onto
  // <html> so the stylesheet can trade backdrop blur for the near-solid
  // float colour on weak GPUs.
  useEffect(() => {
    const lite =
      (Number.isFinite(navigator.deviceMemory) &&
        navigator.deviceMemory <= 4) ||
      (Number.isFinite(navigator.hardwareConcurrency) &&
        navigator.hardwareConcurrency <= 4);
    document.documentElement.classList.toggle("is-lite-gpu", lite);
    return () => document.documentElement.classList.remove("is-lite-gpu");
  }, []);
  const [enabled, setEnabled] = useState(() => {
    try {
      return localStorage.getItem(PREFERENCE_KEY) !== "off";
    } catch {
      return true;
    }
  });
  const [visible, setVisible] = useState(() => !document.hidden);
  const [saveData, setSaveData] = useState(() =>
    Boolean(navigator.connection?.saveData),
  );
  const reducedMotion = useMedia("(prefers-reduced-motion: reduce)");
  const coarsePointer = useMedia("(pointer: coarse), (hover: none)");
  const wideViewport = useMedia("(min-width: 960px)");
  useEffect(() => {
    const onVisibility = () => setVisible(!document.hidden);
    const onConnection = () =>
      setSaveData(Boolean(navigator.connection?.saveData));
    document.addEventListener("visibilitychange", onVisibility);
    navigator.connection?.addEventListener?.("change", onConnection);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      navigator.connection?.removeEventListener?.("change", onConnection);
    };
  }, []);
  const value = useMemo(
    () => ({
      enabled,
      reducedMotion,
      coarsePointer,
      wideViewport,
      saveData,
      visible,
      deviceMemory: navigator.deviceMemory,
      hardwareConcurrency: navigator.hardwareConcurrency,
      toggle: () =>
        setEnabled((current) => {
          try {
            localStorage.setItem(PREFERENCE_KEY, current ? "off" : "on");
          } catch {
            /* Session preference still works. */
          }
          return !current;
        }),
    }),
    [enabled, reducedMotion, coarsePointer, wideViewport, saveData, visible],
  );
  return (
    <MotionContext.Provider value={value}>{children}</MotionContext.Provider>
  );
}

export function useMotionSettings() {
  return useContext(MotionContext);
}

export function useMotionPolicy(view = "home") {
  const settings = useMotionSettings();
  return motionPolicy({ ...settings, view });
}

export function MotionToggle() {
  const settings = useMotionSettings();
  const systemPaused = settings.reducedMotion || settings.saveData;
  const active = settings.enabled && !systemPaused;
  const label = systemPaused
    ? "系统已减少动态效果"
    : active
      ? "关闭动态效果"
      : "开启动效";
  return (
    <button
      type="button"
      className="motion-toggle"
      onClick={settings.toggle}
      aria-label={label}
      title={label}
      aria-pressed={active}
      disabled={systemPaused}
    >
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        aria-hidden="true"
      >
        {active ? (
          <>
            <path d="M8 6v12M16 6v12" />
          </>
        ) : (
          <path d="m9 5 10 7-10 7V5Z" />
        )}
      </svg>
    </button>
  );
}
