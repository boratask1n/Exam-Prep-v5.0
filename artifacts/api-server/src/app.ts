import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();
const payloadLimit = process.env["API_PAYLOAD_LIMIT"] ?? "12mb";

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors());
app.use(express.json({ limit: payloadLimit }));
app.use(express.urlencoded({ extended: true, limit: payloadLimit }));

app.use("/api", router);

// Global hata yakalayıcı — buraya kadar hiçbir route hatayı yakalamadıysa
// (örn. zod .parse() doğrudan fırlatırsa) Express'in varsayılan HTML/stack-trace
// sayfası yerine frontend'in beklediği JSON gövdeli, anlaşılır bir yanıt döner.
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (res.headersSent) {
    next(err);
    return;
  }

  const isZodError = err?.name === "ZodError" && Array.isArray(err?.issues);
  if (isZodError) {
    const firstIssue = err.issues[0];
    const field = Array.isArray(firstIssue?.path) ? firstIssue.path.join(".") : undefined;
    res.status(400).json({
      error: field
        ? `Geçersiz veya eksik alan: ${field}`
        : "Gönderilen veri geçersiz.",
      details: err.issues,
    });
    return;
  }

  if (err?.type === "entity.too.large") {
    res.status(413).json({ error: "Gönderilen veri çok büyük." });
    return;
  }

  req.log?.error({ err }, "Unhandled route error");
  res.status(500).json({ error: "Beklenmeyen bir sunucu hatası oluştu." });
});

export default app;
