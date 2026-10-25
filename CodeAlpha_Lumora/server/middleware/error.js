const multer = require('multer');

exports.notFound = (req, res) => {
  res.status(404).json({ message: `Route not found: ${req.method} ${req.originalUrl}` });
};

// eslint-disable-next-line no-unused-vars
exports.errorHandler = (err, _req, res, _next) => {
  let status = err.status || 500;
  let message = err.message || 'Server error';

  if (err instanceof multer.MulterError) {
    status = 400;
    message = err.code === 'LIMIT_FILE_SIZE' ? 'That file is too large' : err.message;
  } else if (err.name === 'ValidationError') {
    status = 400;
    message = Object.values(err.errors)[0].message;
  } else if (err.name === 'CastError') {
    status = 400;
    message = 'Invalid id';
  } else if (err.code === 11000) {
    status = 409;
    const field = Object.keys(err.keyPattern || {})[0] || 'value';
    message = `That ${field} is already taken`;
  }

  if (status >= 500) console.error(err);
  res.status(status).json({ message: status === 500 ? 'Something went wrong on our side' : message });
};