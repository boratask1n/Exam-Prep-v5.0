import fs from "node:fs";
import path from "node:path";
import { Router, type IRouter } from "express";

const router: IRouter = Router();

const uploadsDir = process.env.UPLOADS_DIR || path.join(process.cwd(), "uploads");
const uploadFilenamePattern = /^img_[a-f0-9-]+\.(jpg|png|webp)$/i;

function resolveUploadPath(filename: string) {
  if (!uploadFilenamePattern.test(filename)) return null;
  const root = path.resolve(uploadsDir);
  const candidate = path.resolve(root, filename);
  return candidate.startsWith(`${root}${path.sep}`) ? candidate : null;
}

router.get("/uploads/:filename", (req, res) => {
  const filepath = resolveUploadPath(req.params.filename);
  if (!filepath) {
    res.status(400).json({ error: "Geçersiz dosya adı" });
    return;
  }
  if (!fs.existsSync(filepath)) {
    res.status(404).json({ error: "Dosya bulunamadı" });
    return;
  }
  res.sendFile(filepath);
});

export default router;
