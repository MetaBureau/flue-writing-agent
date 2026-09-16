import "@std/dotenv/load";
import { App, staticFiles } from "jsr:@fresh/core@^2.3.3";

export const app = new App();

app.use(staticFiles());
app.fsRoutes();
