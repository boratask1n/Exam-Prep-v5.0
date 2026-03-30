/**
 * Converts a YouTube URL to an embed URL format
 * @param url - The YouTube video URL
 * @returns The embed URL for the video, or null if invalid
 */
export function getYoutubeEmbedSrc(url?: string | null): string | null {
  if (!url) return null;
  
  // Handle various YouTube URL formats
  const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
  const match = url.match(regExp);
  
  if (match && match[2].length === 11) {
    return `https://www.youtube.com/embed/${match[2]}`;
  }
  
  return null;
}
