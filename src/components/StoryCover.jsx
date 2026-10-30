import React, { useEffect, useState } from "react";
import WorldArtwork from "./WorldArtwork.jsx";
import { coverStateOf, fallbackCoverVariantFor, fetchCoverObjectUrl } from "../cover.js";

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

  // A reader copy of a PUBLISHED book carries the publication's public
  // cover path (plazaReaderStory → detail.coverUrl): that picture is
  // the book's own cover — the same one the detail page shows — and it
  // outranks every fallback below (BOOK-FACE-FIX: the reader's cover
  // page used to land on the shared world art instead, because the
  // snapshot carries no cover state of its own). A failed load falls
  // through to the ordinary chain rather than a blank page.
  const publicCoverUrl = typeof story?.coverUrl === "string" ? story.coverUrl : "";
  const [publicCoverFailed, setPublicCoverFailed] = useState(false);
  useEffect(() => { setPublicCoverFailed(false); }, [publicCoverUrl]);
  if (publicCoverUrl && !publicCoverFailed) {
    return (
      <span className={`world-art story-cover ${className}`} aria-hidden="true">
        <img
          src={publicCoverUrl}
          alt=""
          width="768"
          height="1024"
          loading={eager ? "eager" : "lazy"}
          fetchPriority={eager ? "high" : "auto"}
          decoding="async"
          onError={() => setPublicCoverFailed(true)}
        />
      </span>
    );
  }

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
  // No painting of its own and no world painting that depicts this
  // story's world (custom / unknown world): a genre-flavoured stock
  // painting beats a wrong world (§37). Unmapped templates keep the
  // world artwork — a guessy match is worse than an honest generic.
  const variant = fallbackCoverVariantFor(story);
  if (variant) {
    return (
      <span className={`world-art story-cover-fallback ${className}`} aria-hidden="true">
        <img
          src={`/art/cover-${variant}-640.webp`}
          srcSet={`/art/cover-${variant}-640.webp 640w, /art/cover-${variant}-1122.webp 1122w`}
          sizes={sizes || "(min-width: 1050px) 310px, (min-width: 700px) 40vw, 44vw"}
          alt=""
          width="1122"
          height="1496"
          loading={eager ? "eager" : "lazy"}
          fetchPriority={eager ? "high" : "auto"}
          decoding="async"
        />
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
