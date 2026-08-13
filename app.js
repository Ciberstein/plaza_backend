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
