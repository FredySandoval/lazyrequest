export function handler(req: Request): Response {
    const url = new URL(req.url);

    if (url.pathname === "/ping") {
        return new Response("pong");
    }

    if (req.method === "GET" && url.pathname === "/nested/resource") {
        console.log(`${url.pathname} : ${req.method}`);
        return new Response("Mock response for nested/resource", { status: 200 });
    }
    if (req.method === "GET" && url.pathname === "/fixtures/file-finder/api/posts1") {
        console.log(`${url.pathname} : ${req.method}`);
        return new Response("Mock response for fixtures/file-finder/api/posts1", { status: 200 });
    }
    if (req.method === "DELETE" && url.pathname === "/fixtures/file-finder/api/posts2") {
        console.log(`${url.pathname} : ${req.method}`);
        return new Response("Mock response for DELETE fixtures/file-finder/api/posts2", { status: 200 });
    }
    if (req.method === "GET" && url.pathname === "/fixtures/file-finder/api/users1") {
        console.log(`${url.pathname} : ${req.method}`);
        return new Response("Mock response for fixtures/file-finder/api/users1", { status: 200 });
    }
    if (req.method === "POST" && url.pathname === "/fixtures/file-finder/api/users2") {
        console.log(`${url.pathname} : ${req.method}`);
        return new Response("Mock response for POST fixtures/file-finder/api/users2", { status: 200 });
    }
    if (req.method === "GET" && url.pathname === "/fixtures/http-parser/sample") {
        console.log(`${url.pathname} : ${req.method}`);
        return new Response("Mock response for fixtures/http-parser/sample", { status: 200 });
    }
    if (req.method === "GET" && url.pathname === "/fixtures/http-parser/sample2GET") {
        console.log(`${url.pathname} : ${req.method}`);
        return new Response("Mock response for fixtures/http-parser/sample2GET", { status: 200 });
    }
    if (req.method === "POST" && url.pathname === "/fixtures/http-parser/sample2POST") {
        console.log(`${url.pathname} : ${req.method}`);
        return new Response("Mock response for POST fixtures/http-parser/sample2POST", { status: 200 });
    }
    if (req.method === "GET" && url.pathname === "/fixtures/http-parser/sample3-GET") {
        console.log(`${url.pathname} : ${req.method}`);
        return new Response("Mock response for fixtures/http-parser/sample3-GET", { status: 200 });
    }
    if (req.method === "POST" && url.pathname === "/fixtures/http-parser/sample3-POST") {
        console.log(`${url.pathname} : ${req.method}`);
        return new Response("Mock response for POST fixtures/http-parser/sample3-POST", { status: 200 });
    }
    if (req.method === "GET" && url.pathname === "/fixtures/http-parser/sample4-GET") {
        console.log(`${url.pathname} : ${req.method}`);
        return new Response("Mock response for fixtures/http-parser/sample4-GET", { status: 200 });
    }
    if (req.method === "POST" && url.pathname === "/fixtures/http-parser/sample4-POST") {
        console.log(`${url.pathname} : ${req.method}`);
        return new Response("Mock response for POST fixtures/http-parser/sample4-POST", { status: 200 });
    }
    if (req.method === "GET" && url.pathname === "/returns/notfound/404") {
        console.log(`server: ${url.pathname} : ${req.method}`);
        return new Response("Not Found", { status: 404 });
    }
    if (req.method === "GET" && url.pathname === "/returns200sample03") {
        console.log(`server: ${url.pathname} : ${req.method}`);
        return new Response(`pathname: ${url.pathname}`, { status: 200 });
    }
    if (req.method === "GET" && url.pathname === "/scoped/returns200sample03") {
        console.log(`server: ${url.pathname} : ${req.method}`);
        return new Response(`pathname: ${url.pathname}`, { status: 200 });
    }
    // GET http://localhost:8080/returns/notfound/404
    if (req.method === "GET" && url.pathname === "/returns/notfound/404") {
        console.log(`server: ${url.pathname} : ${req.method}`);
        return new Response("Not Found", { status: 404 });
    }
    if (req.method === "GET" && url.pathname === "/health") {
        console.log(`server: ${url.pathname} : ${req.method}`);
        const acceptHeader = req.headers.get("Accept");
        if (acceptHeader && (acceptHeader.includes("application/json") || acceptHeader.includes("text/plain"))) {
            return new Response(JSON.stringify({ status: "ok" }), { status: 200, headers: { "Content-Type": "application/json" } });
        } else {
            return new Response("Something went wrong", { status: 415 });
        }
    }
    if (req.method === "GET" && url.pathname === "/users/123") {
        console.log(`server: ${url.pathname} : ${req.method}`);
        const acceptHeader = req.headers.get("Accept");
        const authHeader = req.headers.get("Authorization");
        if (acceptHeader && acceptHeader.includes("application/json") && authHeader === "Bearer demo-token") {
            const userUrl = `http://localhost:8080/users/123`;
            return new Response(JSON.stringify({ id: 123, url: userUrl }), { status: 200, headers: { "Content-Type": "application/json", "Location": userUrl } });
        } else {
            return new Response("Unauthorized", { status: 401 });
        }
    }
    if (req.method === "POST" && url.pathname === "/scoped/users") {
        console.log(`server: ${url.pathname} : ${req.method}`);
        const contentType = req.headers.get("Content-Type");
        const xEnvHeader = req.headers.get("X-Env");
        if (contentType && contentType.includes("application/json") && xEnvHeader === "scoped") {
            return new Response(JSON.stringify({ ok: true, id: 123 }), { status: 201, headers: { "Content-Type": "application/json", "Location": "http://localhost:8080/scoped/users/123" } });
        } else {
            return new Response("Bad Request", { status: 400 });
        }
    }
    if (req.method === "GET" && url.pathname === "/plain") {
        console.log(`server: ${url.pathname} : ${req.method}`);
        const acceptHeader = req.headers.get("Accept");
        if (acceptHeader && acceptHeader.includes("text/plain")) {
            return new Response("exact-value", { status: 200, headers: { "Content-Type": "text/plain" } });
        } else {
            return new Response("Unsupported Media Type", { status: 415 });
        }
    }
    if (req.method === "GET" && url.pathname === "/page") {
        console.log(`server: ${url.pathname} : ${req.method}`);
        const acceptHeader = req.headers.get("Accept");
        if (acceptHeader && acceptHeader.includes("text/html")) {
            return new Response("<html><body><div>hello world</div></body></html>", { status: 200, headers: { "Content-Type": "text/html" } });
        } else {
            return new Response("Unsupported Media Type", { status: 415 });
        }
    }

    console.log(`NOT RESOLVED: ${url.pathname} with method ${req.method}`);
    return new Response("Not Found", { status: 404 });
};