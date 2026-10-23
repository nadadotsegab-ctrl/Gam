import { defineConfig, loadEnv } from 'vite';
import { createOddsApiHandler } from './server/odds-feed.js';
import { createPropsApiHandler } from './server/props-feed.js';

export default defineConfig(({ mode }) => {
  const local = loadEnv(mode, process.cwd(), 'ODDS_API_KEY');
  return {
    plugins: [{
      name: 'ultrax-odds-feed',
      configureServer(server) {
        const options = { apiKey: process.env.ODDS_API_KEY || local.ODDS_API_KEY };
        const handle = createOddsApiHandler(options);
        const handleProps = createPropsApiHandler(options);
        server.middlewares.use((req, res, next) => {
          (async () => (await handleProps(req, res)) || (await handle(req, res)))().then(handled => { if (!handled) next(); }).catch(() => {
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: 'The odds service could not complete this request.' }));
          });
        });
      },
    }],
  };
});
