export function getYoutubeVideoId(url?: string | null): string | null {
  if (!url) return null;

  // Handle various YouTube URL formats
  const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
  const match = url.match(regExp);

  return match && match[2].length === 11 ? match[2] : null;
}

function normalizeStartSecond(startSecond?: number | null): number | null {
  if (startSecond == null) return null;
  if (!Number.isFinite(startSecond)) return null;
  return Math.max(0, Math.floor(startSecond));
}

/**
 * Converts a YouTube URL to an embed URL format.
 * @param url - The YouTube video URL
 * @param startSecond - Optional start point in seconds
 * @returns The embed URL for the video, or null if invalid
 */
export function getYoutubeEmbedSrc(url?: string | null, startSecond?: number | null): string | null {
  const videoId = getYoutubeVideoId(url);
  if (!videoId) return null;

  const start = normalizeStartSecond(startSecond);
  return `https://www.youtube.com/embed/${videoId}${start ? `?start=${start}` : ""}`;
}

export function getYoutubeWatchUrl(url?: string | null, startSecond?: number | null): string | null {
  const videoId = getYoutubeVideoId(url);
  if (!videoId) return null;

  const start = normalizeStartSecond(startSecond);
  return `https://www.youtube.com/watch?v=${videoId}${start ? `&t=${start}s` : ""}`;
}
