// Wraps an async handler so a rejected promise reaches Express instead of
// becoming an unhandled rejection that kills the process.
const catchAsync = (fn) => (req, res, next) => {
  fn(req, res, next).catch(next);
};

module.exports = catchAsync;
