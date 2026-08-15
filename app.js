const { cors: cors_conf } = require('./cors/config');
const cookieParser = require('cookie-parser');
const express = require("express");
const morgan = require("morgan");
const cors = require("cors");
const helmet = require("helmet");
const http = require('http');
const app = express();

const server = http.createServer(app);
const router = express.Router();

// CONTROLLERS //
const { globalErrorHandler } = require('./controllers/error.controllers');

// ROUTES //
const auth = require("./routes/auth");
const public = require("./routes/public");
const webhook = require("./routes/webhook");
const user = require("./routes/user");
const admin = require("./routes/admin");

// MIDDLEWARES //
const throttle = require("./middlewares/throttle.middlewares");

/**
 * How many proxies sit in front of this process.
 *
 * Everything that limits by address depends on this. Behind a load balancer
 * every request arrives from the balancer, so without this `req.ip` is one
 * value for the entire internet: ten failed logins by anybody would lock out
 * everybody, and the limiters that look like protection would be doing the
 * opposite of their job.
 *
 * A count, never `true`. `X-Forwarded-For` is written by whoever is calling,
 * and trusting the whole chain lets a caller prepend an address of their
 * choosing and take a fresh bucket on every request — which turns off rate
 * limiting entirely while leaving it looking switched on. The number says how
 * many entries at the end of that header were put there by infrastructure we
 * run, and Express reads no further back than that.
 *
 * Zero — no proxy — is right for local development and wrong for every
 * deployment. One is right behind a single balancer, which is what Render,
 * Railway, Fly and Heroku each put in front of you.
 */
const TRUST_PROXY = Number(process.env.TRUST_PROXY || 0);

app.set("trust proxy", TRUST_PROXY);

// Said out loud, because the failure is silent: everything keeps working and
// only the limits quietly stop applying per-visitor.
if (process.env.NODE_ENV === "production" && !TRUST_PROXY) {
  console.warn(
    "\x1b[33mTRUST_PROXY is 0 in production.\x1b[0m",
    "If anything proxies this app, every visitor shares one rate-limit bucket.",
    "Set TRUST_PROXY to the number of proxies in front of it, usually 1."
  );
}

if (process.env.NODE_ENV === "development")
  app.use(morgan("dev"));

app.use("/ping", (_, r) => r.send("pong"));
app.use(cors(cors_conf));
app.use(helmet());
app.use(cookieParser());

// The raw body is kept for payment providers, which sign the bytes they sent.
// A parsed body fails the signature check.
app.use(express.json({ verify: (r, _, b) => r.raw = b }));

// A POST with no body at all leaves req.body undefined, and every controller
// that destructures it throws a 500 on what is a valid request. Fixed once
// here rather than guarded at each call site.
app.use((req, _, next) => {
  if (req.body === undefined) req.body = {};
  next();
});

// The ceiling everything shares, before any router decides what it is. The
// tighter limits live next to the endpoints that need them; this one is here
// so that a route added later cannot be forgotten.
router.use(throttle.baseline);

router.use("/auth", auth);
router.use("/public", public);
router.use("/user", user);
router.use("/admin", admin);

// Payment providers authenticate by signature, not by session, so this router
// sits outside the protected ones and relies on the raw body captured above.
router.use("/webhook", webhook);

app.use("/api/v1", router);

app.use(globalErrorHandler);

module.exports = { app, server };
