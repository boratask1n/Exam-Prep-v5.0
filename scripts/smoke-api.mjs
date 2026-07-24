import { spawn, spawnSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const port = 18080;
const command = "pnpm";
const cwd = fileURLToPath(new URL("..", import.meta.url));
const uploadsDir = await mkdtemp(join(tmpdir(), "exam-prep-smoke-"));
const child = spawn(command, ["--filter", "@workspace/api-server", "run", "start"], {
  cwd,
  env: {
    ...process.env,
    NODE_ENV: "test",
    PORT: String(port),
    API_PORT: String(port),
    HOST: "127.0.0.1",
    UPLOADS_DIR: uploadsDir,
    DISABLE_LEGACY_CLAIM: "1",
    DATABASE_URL: process.env.DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:5432/exam_prep",
  },
  stdio: ["ignore", "pipe", "pipe"],
  shell: process.platform === "win32",
});

function stopChild() {
  if (!child.pid) return;
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore" });
    return;
  }
  child.kill("SIGTERM");
}

const timeoutMs = 30_000;
const startedAt = Date.now();

async function waitForHealth(path) {
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}${path}`);
      if (response.ok) {
        const body = await response.json();
        if (body.status === "ok") return;
      }
    } catch {
      // Server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`API smoke test timed out for ${path}`);
}

async function createSmokeAccount() {
  const email = `smoke-${Date.now()}@local.test`;
  const response = await fetch(`http://127.0.0.1:${port}/api/auth/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      name: "Smoke Test",
      email,
      password: "smoke-test-123",
      remember: false,
    }),
  });
  if (!response.ok) {
    throw new Error(`Auth smoke test failed with HTTP ${response.status}`);
  }
  const body = await response.json();
  if (!body.token || !body.user?.id) {
    throw new Error("Auth smoke test returned an invalid session");
  }
  return body.token;
}

async function verifyImageUpload(token) {
  const response = await fetch(`http://127.0.0.1:${port}/api/questions/image`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify({
      mimeType: "image/png",
      imageData: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/lLQZxwAAAABJRU5ErkJggg==",
    }),
  });
  if (!response.ok) {
    throw new Error(`Upload smoke test failed with HTTP ${response.status}`);
  }
  const body = await response.json();
  if (typeof body.url !== "string" || !body.url.startsWith("/api/uploads/img_")) {
    throw new Error("Upload smoke test returned an invalid URL");
  }

  const fileResponse = await fetch(`http://127.0.0.1:${port}${body.url}`);
  if (!fileResponse.ok) {
    throw new Error(`Uploaded file smoke test failed with HTTP ${fileResponse.status}`);
  }
}

async function verifyQuestionReviewFlow(token) {
  const createResponse = await fetch(`http://127.0.0.1:${port}/api/questions`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify({
      lesson: "Smoke Test",
      topic: "Question Review",
      category: "TYT",
      source: "Deneme",
      status: "YanlisHocayaSor",
      options: [
        { label: "A", text: "1" },
        { label: "B", text: "\\\\sqrt{x}" },
      ],
      isOsymBadge: true,
      solutionYoutubeUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      solutionYoutubeStartSecond: 42,
    }),
  });
  if (!createResponse.ok) {
    throw new Error(`Question create smoke test failed with HTTP ${createResponse.status}`);
  }
  const question = await createResponse.json();
  if (
    question.solutionYoutubeUrl !== "https://www.youtube.com/watch?v=dQw4w9WgXcQ" ||
    question.solutionYoutubeStartSecond !== 42 ||
    question.isOsymBadge !== true ||
    !Array.isArray(question.options)
  ) {
    throw new Error("Question create smoke test did not persist extended metadata");
  }
  try {
    const feedResponse = await fetch(`http://127.0.0.1:${port}/api/questions/review/feed?search=Smoke%20Test&limit=3`, {
      headers: { authorization: `Bearer ${token}` },
    });
    if (!feedResponse.ok) {
      throw new Error(`Question review feed smoke test failed with HTTP ${feedResponse.status}`);
    }
    const feed = await feedResponse.json();
    if (!Array.isArray(feed.items) || !feed.items.some((item) => item.id === question.id)) {
      throw new Error("Question review feed did not include the smoke question");
    }

    const serveResponse = await fetch(`http://127.0.0.1:${port}/api/questions/review/serve/${question.id}`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}` },
    });
    if (!serveResponse.ok) {
      throw new Error(`Question review serve smoke test failed with HTTP ${serveResponse.status}`);
    }

    const feedbackResponse = await fetch(`http://127.0.0.1:${port}/api/questions/review/feedback/${question.id}`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({ feedback: "correct" }),
    });
    if (!feedbackResponse.ok) {
      throw new Error(`Question review feedback smoke test failed with HTTP ${feedbackResponse.status}`);
    }
  } finally {
    if (question?.id) {
      await fetch(`http://127.0.0.1:${port}/api/questions/${question.id}`, {
        method: "DELETE",
        headers: { authorization: `Bearer ${token}` },
      }).catch(() => {});
    }
  }
}

let exitCode = 0;
try {
  await waitForHealth("/api/health");
  await waitForHealth("/api/healthz");
  const token = await createSmokeAccount();
  await verifyImageUpload(token);
  await verifyQuestionReviewFlow(token);
  await fetch(`http://127.0.0.1:${port}/api/auth/account`, {
    method: "DELETE",
    headers: { authorization: `Bearer ${token}` },
  }).catch(() => {});
  console.log("API smoke test passed");
} catch (error) {
  exitCode = 1;
  console.error(error);
} finally {
  stopChild();
  await rm(uploadsDir, { recursive: true, force: true });
}

process.exit(exitCode);
