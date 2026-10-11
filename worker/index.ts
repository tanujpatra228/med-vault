import { Hono } from "hono";
import { auth, requireSession } from "./auth";
import type { AppEnv } from "./env";
import { files } from "./files";
import { HttpError, onError } from "./http";
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

app.use("*", requireSession);
app.route("/members", membersApi);
app.route("/doctors", doctorsApi);
app.route("/allergies", allergiesApi);
app.route("/conditions", conditionsApi);
app.route("/medications", medicationsApi);
app.route("/prescriptions", prescriptionsApi);
app.route("/reports", reportsApi);
app.route("/files", files);

app.notFound((c) => c.json({ error: "Not found" }, 404));

export default app;
