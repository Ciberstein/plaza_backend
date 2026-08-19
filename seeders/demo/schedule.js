const cron = require("node-cron");
const { demoAllowed } = require("./guard");
const { resetGuest } = require("./guest");

/**
 * The recurring jobs, which in development is one job.
 *
 * node-cron rather than `setInterval`, and the difference is not style. An
 * interval fires twenty-four hours after the process happened to start, so the
 * guest account is rebuilt at whatever time somebody last restarted the
 * server — three in the afternoon, mid-demo. A cron expression fires at a time
 * somebody chose.
 *
 * The schedule is not the whole mechanism, though. A laptop is asleep at four
 * in the morning more often than it is awake, and a missed cron is simply
 * missed. So the boot path checks the account's age as well, and this only has
 * to cover the machine that stays up.
 */

// Four in the morning, local time. Late enough that nobody is looking at it
// and early enough that a working day starts on a fresh account.
const DAILY = "0 4 * * *";

const startDemoSchedule = () => {
  if (!demoAllowed()) return null;

  if (!cron.validate(DAILY)) {
    // Checked rather than assumed: a typo in a cron expression is otherwise a
    // job that silently never runs, which looks exactly like a job that ran
    // and did nothing.
    console.warn("\x1b[33mDEMO:\x1b[0m invalid cron expression, guest will only reset on boot");
    return null;
  }

  const task = cron.schedule(DAILY, async () => {
    try {
      await resetGuest({ force: true });
    } catch (error) {
      // Swallowed deliberately. A failed demo reset is worth a line in the log
      // and is not worth taking down an API that is otherwise serving fine.
      console.error("\x1b[31mDEMO:\x1b[0m guest reset failed —", error.message);
    }
  });

  console.log("\x1b[34mDEMO:\x1b[0m", "\x1b[32mguest resets daily at 04:00\x1b[0m");

  return task;
};

module.exports = { startDemoSchedule, DAILY };
