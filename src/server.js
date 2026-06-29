const { PORT } = require('./config');
const { createApp } = require('./app');

Promise.resolve()
  .then(createApp)
  .then((app) => {
    app.listen(PORT, () => {
      console.log(`Server running on http://localhost:${PORT} (supabase REST backend)`);
    });
  })
  .catch((error) => {
    console.error('Failed to initialize server:', error);
    process.exit(1);
  });
