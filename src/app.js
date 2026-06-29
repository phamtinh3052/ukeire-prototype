const { supabase } = require('./supabase');
const { createServices } = require('./services');
const { createRoutes } = require('./routes');

async function createApp() {
  const services = createServices({ supabase });
  await services.verifySchema();
  await services.ensureStorageBucket();
  await services.ensureDefaultAdmin();
  const app = createRoutes({ supabase, services });
  return app;
}

module.exports = { createApp };
