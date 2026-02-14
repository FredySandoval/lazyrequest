import { serve } from "bun";
import { handler } from "./server";

serve({
    port: 8080,
    fetch: handler,
});