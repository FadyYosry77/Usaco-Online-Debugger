import { createAppContext } from "./server/appContext.js";
import { createServer } from "./server/createServer.js";

const context = await createAppContext();
const settings = await context.settingsService.getSettings();
const server = await createServer(context);

await server.listen({
  host: settings.localhostHost,
  port: settings.localhostPort
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, async () => {
    context.runService.stopActiveRun();
    context.debugService.stop();
    await server.close();
    process.exit(0);
  });
}
