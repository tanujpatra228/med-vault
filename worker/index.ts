import { Hono } from "hono";
import { aiApi } from "./ai";
import { auth, requireDevice } from "./auth";
import { auditTrail, purgeAudit } from "./audit";
import type { AppEnv } from "./env";
import { files } from "./files";
import { HttpError, onError } from "./http";
import { reviewApi } from "./review";
import { visitsApi } from "./visits";
import { readingsApi } from "./readings";
import { labsApi } from "./labs";
import { searchApi } from "./search";
import { pushApi, runReminders } from "./reminders";
import type { Env } from "./env";
import { vaultApi } from "./vault";
import {
  allergiesApi,
  conditionsApi,
  doctorsApi,
  medicationsApi,
  membersApi,
  prescriptionsApi,
  reportsApi,
} from "./resources";

const app = new Hono<AppEnv>().basePath("/api");

app.onError((err, c) => {
  if (err.message?.includes("FOREIGN KEY constraint failed")) return onError(new HttpError(400, "A linked record does not exist"), c);
  return onError(err, c);
});

app.use("*", async (c, next) => {
  await next();
  c.header("Cache-Control", c.res.headers.get("Cache-Control") ?? "no-store");
});

app.route("/auth", auth);

app.use("*", requireDevice);
app.use("*", auditTrail);
app.route("/vault", vaultApi);
app.route("/ai/review", reviewApi);
app.route("/ai", aiApi);
app.route("/members", membersApi);
app.route("/doctors", doctorsApi);
app.route("/allergies", allergiesApi);
app.route("/conditions", conditionsApi);
app.route("/medications", medicationsApi);
app.route("/prescriptions", prescriptionsApi);
app.route("/reports", reportsApi);
app.route("/visits", visitsApi);
app.route("/readings", readingsApi);
app.route("/labs", labsApi);
app.route("/search", searchApi);
app.route("/push", pushApi);
app.route("/files", files);

app.notFound((c) => c.json({ error: "Not found" }, 404));

export default {
  fetch: app.fetch,
  /** Cron trigger (wrangler.jsonc "triggers", every 5 minutes): sends due reminders; once a day, deletes year-old log entries. */
  async scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(runReminders(env).then((r) => r.sent + r.failed > 0 && console.log("reminders", r)));
    const at = new Date(controller.scheduledTime);
    if (at.getUTCHours() === 3 && at.getUTCMinutes() < 5) ctx.waitUntil(purgeAudit(env.DB, at));
  },
} satisfies ExportedHandler<Env>;
