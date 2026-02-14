import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { run } from "../../src/index.ts";
import { handler } from "./server";

let server: ReturnType<typeof Bun.serve> | null = null;

beforeAll(() => {
    server = Bun.serve({
        port: 8080,
        fetch: handler,
    });
    console.log('server started on port 8080');
    
});
afterAll(() => {
    server?.stop();
    console.log('server stopped');
});

describe("HTTP Server", () => {
    test("test ping/pong", async () => {
        const response = await fetch("http://localhost:8080/ping");
        const body = await response.text();
        expect(body).toBe("pong");
    });
    test("Test --http", async () => {
        const inlineHttp = `GET http://localhost:8080/nested/resource`;
        const exitCode = await run(["--http", inlineHttp ]);
        expect(exitCode).toBe(0);
    });
    test("Test --httpFile", async () => {
        const exitCode = await run(["--httpFile", "./tests/fixtures/file-finder/api/nested/deep.http" ]);
        expect(exitCode).toBe(0);
    });
    test("Test --httpFolder", async () => {
        const exitCode = await run(["--httpFolder", "./tests/fixtures/file-finder/api/two-files/" ]);
        expect(exitCode).toBe(0);
    });
    test("Test --httpFolder --concurrent", async () => {
        const exitCode = await run(["--httpFolder", "./tests/fixtures/file-finder/api/", "--concurrent" ]);
        expect(exitCode).toBe(0);
    });
    test("Test http-parser/sample.http", async () => {
        const exitCode = await run(["--httpFolder", "./tests/fixtures/http-parser/", "--concurrent" ]);
        expect(exitCode).toBe(0);
    });
    test("/returns/notfound/404", async () => {
        const exitCode = await run(["--httpFile", "./tests/fixtures/http-parser/sample5.http" ]);
        expect(exitCode).toBe(1);
    });
    test("Test sample 02", async () => {
        const exitCode = await run(["--httpFile", "./tests/fixtures/samples/sample02.http" ]);
        expect(exitCode).toBe(0);
    });
    test("Test sample 03", async () => {
        const exitCode = await run(["--httpFile", "./tests/fixtures/samples/sample03.http" ]);
        expect(exitCode).toBe(0);
    });
    test("Test all features 04", async () => {
        const exitCode = await run(["--httpFile", "./tests/fixtures/samples/sample04.http" ]);
        expect(exitCode).toBe(0);
    });
});
