const multer = require('multer');

// Memory storage — file lives briefly as a Buffer, never touches disk.
const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
  const allowed = /^image\/(jpeg|png|webp|gif)$/;
  if (allowed.test(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Only image files (jpg, png, webp, gif) are allowed'));
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 2 * 1024 * 1024 }, // 2MB — keep base64 docs from bloating MongoDB
});

// Converts an uploaded file's Buffer into a base64 data URI, e.g.
// "data:image/jpeg;base64,/9j/4AAQSkZJRg...". This string is stored directly
// in MenuItem.image and works as a normal <img src="..."> with no external
// storage service or extra hosting needed.
function bufferToDataUri(file) {
  const base64 = file.buffer.toString('base64');
  return `data:${file.mimetype};base64,${base64}`;
}

module.exports = { upload, bufferToDataUri };