import React from "react";

const ids = new Set(["mist", "cultivation", "neon", "city", "court", "frontier"]);
const safeGenre = (value) => ids.has(value) ? value : "mist";

/** Fictional cover art. Titles and all interactive content stay in HTML. */
export default function WorldArtwork({ genreId = "mist", sources, eager = false, className = "", sizes = "(min-width: 1050px) 310px, (min-width: 700px) 40vw, 44vw" }) {
  const genres = sources?.length === 2 ? sources.map(safeGenre) : [safeGenre(genreId)];
  return (
    <span className={`world-art ${genres.length === 2 ? "world-art-pair" : ""} ${className}`} aria-hidden="true">
      {genres.map((genre, index) => (
        <img
          key={`${genre}-${index}`}
          src={`/art/${genre}-640.webp`}
          srcSet={`/art/${genre}-640.webp 640w, /art/${genre}-1122.webp 1122w`}
          sizes={sizes}
          alt=""
          width="1122"
          height="1402"
          loading={eager ? "eager" : "lazy"}
          fetchPriority={eager ? "high" : "auto"}
          decoding="async"
        />
      ))}
    </span>
  );
}
