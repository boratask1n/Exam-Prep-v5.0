export function getYoutubeVideoId(url?: string | null): string | null {
  if (!url) return null;

  // Handle various YouTube URL formats
  const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
  const match = url.match(regExp);

  return match && match[2].length === 11 ? match[2] : null;
}

function normalizeSecond(second?: number | null): number | null {
  if (second == null) return null;
  if (!Number.isFinite(second)) return null;
  return Math.max(0, Math.floor(second));
}

export function parseVideoTimestampInput(value: unknown): number | null {
  if (value == null) return null;
  if (typeof value === "number") return normalizeSecond(value);

  const raw = String(value).trim();
  if (!raw) return null;
  if (/^\d+$/.test(raw)) return normalizeSecond(Number(raw));

  const parts = raw.split(":").map((part) => part.trim());
  if (parts.length !== 2 && parts.length !== 3) return Number.NaN;
  if (!parts.every((part) => /^\d+$/.test(part))) return Number.NaN;

  const numbers = parts.map((part) => Number.parseInt(part, 10));
  const [hours, minutes, seconds] =
    numbers.length === 3 ? numbers : [0, numbers[0], numbers[1]];

  if (minutes >= 60 || seconds >= 60) return Number.NaN;
  return hours * 3600 + minutes * 60 + seconds;
}

export function formatVideoTimestamp(second?: number | null): string {
  const normalized = normalizeSecond(second);
  if (normalized == null) return "";

  const hours = Math.floor(normalized / 3600);
  const minutes = Math.floor((normalized % 3600) / 60);
  const seconds = normalized % 60;
  const paddedSeconds = String(seconds).padStart(2, "0");

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${paddedSeconds}`;
  }

  return `${minutes}:${paddedSeconds}`;
}

export function formatVideoTimestampRange(
  startSecond?: number | null,
  endSecond?: number | null,
): string {
  const start = normalizeSecond(startSecond);
  const end = normalizeSecond(endSecond);

  if (start == null) return "Video çözümü";
  if (end != null && end > start) {
    return `${formatVideoTimestamp(start)}-${formatVideoTimestamp(end)} arası çözüm`;
  }

  return `${formatVideoTimestamp(start)} sonrası çözüm`;
}

/**
 * Converts a YouTube URL to an embed URL format.
 * @param url - The YouTube video URL
 * @param startSecond - Optional start point in seconds
 * @returns The embed URL for the video, or null if invalid
 */
export function getYoutubeEmbedSrc(
  url?: string | null,
  startSecond?: number | null,
  endSecond?: number | null,
): string | null {
  const videoId = getYoutubeVideoId(url);
  if (!videoId) return null;

  const start = normalizeSecond(startSecond);
  const end = normalizeSecond(endSecond);
  const params = new URLSearchParams();
  if (start != null) params.set("start", String(start));
  if (end != null && (start == null || end > start))
    params.set("end", String(end));
  params.set("rel", "0");
  params.set("modestbranding", "1");
  const query = params.toString();
  return `https://www.youtube.com/embed/${videoId}${query ? `?${query}` : ""}`;
}

export function getYoutubeWatchUrl(
  url?: string | null,
  startSecond?: number | null,
  endSecond?: number | null,
): string | null {
  const videoId = getYoutubeVideoId(url);
  if (!videoId) return null;

  const start = normalizeSecond(startSecond);
  const end = normalizeSecond(endSecond);
  return `https://www.youtube.com/watch?v=${videoId}${start != null ? `&t=${start}s` : ""}${end != null && start != null && end > start ? `&end=${end}` : ""}`;
}
