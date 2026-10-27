import React, { useEffect, useState } from "react";
import WorldArtwork from "./WorldArtwork.jsx";
import { coverStateOf, fetchCoverObjectUrl } from "../cover.js";

/**
 * A story's own painting when one exists, the shared world artwork
 * otherwise. The swap is invisible by design: until the generated cover
 * is ready — and whenever it failed or the reader is signed out — the
 * surface shows exactly what it showed before covers existed. The DOM
 * mirrors WorldArtwork (span.world-art > img) so cover CSS keeps working.
 */
export default function StoryCover({ story, genreId = "mist", sources, eager = false, className = "", sizes, getAccessToken, authSignal = "" }) {
  const { status, version } = coverStateOf(story);
  const storyId = story?.id;
  const [url, setUrl] = useState(null);

  useEffect(() => {
    if (status !== "ready" || !storyId) {
      setUrl(null);
      return undefined;
    }
    let cancelled = false;
    fetchCoverObjectUrl({ story, getAccessToken })
      .then((next) => { if (!cancelled) setUrl(next); })
      .catch(() => { if (!cancelled) setUrl(null); });
    return () => { cancelled = true; };
    // story identity is keyed by id+version; the object itself is rebuilt
    // on every library write and must not retrigger the fetch. authSignal
    // re-runs the fetch when sign-in settles: covers mount before the
    // session restore lands, and a guest 401 must not pin the fallback
    // painting for the whole session.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, version, storyId, authSignal]);

  if (url) {
    return (
      <span className={`world-art story-cover ${className}`} aria-hidden="true">
        <img
          src={url}
          alt=""
          width="768"
          height="1024"
          loading={eager ? "eager" : "lazy"}
          fetchPriority={eager ? "high" : "auto"}
          decoding="async"
        />
      </span>
    );
  }
  if (status === "pending") {
    // Honest placeholder (DESIGN §27): while the painting is being made,
    // the world artwork stands in WITH a visible note — never a silent
    // swap that leaves the reader wondering which cover is real. A
    // failed attempt stays silent (the world art is a fine cover; the
    // re-roll lives in the reader's cover dialog).
    return (
      <span className={`world-art story-cover-pending-wrap ${className}`} aria-hidden="true">
        <WorldArtwork genreId={genreId} sources={sources} eager={eager} {...(sizes ? { sizes } : {})} />
        <span className="story-cover-pending-chip">封面生成中</span>
      </span>
    );
  }
  return (
    <WorldArtwork
      genreId={genreId}
      sources={sources}
      eager={eager}
      className={className}
      {...(sizes ? { sizes } : {})}
    />
  );
}
