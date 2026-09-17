import { debug as d } from "../src/platform.deno.ts";
import { InputFile } from "../src/types.ts";
import {
    assertEquals,
    assertInstanceOf,
    assertRejects,
    assertStringIncludes,
    convertToUint8Array,
    stub,
} from "./deps.test.ts";

Deno.test({
    name: "file name inference",
    fn() {
        assertEquals(new InputFile("/tmp/file.txt").filename, "file.txt");
        assertEquals(
            new InputFile((function* (): Iterable<Uint8Array> {})()).filename,
            undefined,
        );
        assertEquals(
            new InputFile({ url: "https://grammy.dev/file.txt" }).filename,
            "file.txt",
        );
        assertEquals(
            new InputFile({ url: "https://grammy.dev" }).filename,
            "grammy.dev",
        );
        assertEquals(
            new InputFile(new URL("https://grammy.dev/file.txt")).filename,
            "file.txt",
        );
        assertEquals(
            new InputFile(new URL("https://grammy.dev")).filename,
            "grammy.dev",
        );
    },
});

Deno.test({
    name: "invalid usage warning",
    fn() {
        const debug = stub(d as Console, "log");
        d.enable("*");
        new InputFile("http://grammy.dev");
        new InputFile("https://grammy.dev");
        d.disable("*");
        debug.restore();
        assertEquals(debug.calls.length, 2);
        assertStringIncludes(debug.calls[0].args[0], "local file path");
        assertStringIncludes(debug.calls[1].args[0], "local file path");
    },
});

Deno.test({
    name: "throw upon using a consumed InputFile",
    fn() {
        const file = new InputFile((function* (): Iterable<Uint8Array> {})());
        const raw = () => file.toRaw();
        raw();
        assertRejects(raw, "consumed InputFile");
    },
});

Deno.test({
    name: "convert Uint8Array to raw",
    async fn() {
        const bytes = new Uint8Array([65, 66, 67]);
        const file = new InputFile(bytes);
        const data = await file.toRaw();
        assertInstanceOf(data, Uint8Array);
        assertEquals(data, bytes);
    },
});

Deno.test({
    name: "convert file to raw",
    async fn() {
        const bytes = new Uint8Array([65, 66, 67]);
        const open = stub(Deno, "open", (path) => {
            assertEquals(path, "/tmp/file.txt");
            function* data() {
                yield bytes;
            }

            const stream = ReadableStream.from(data());
            return Promise.resolve({ readable: stream } as Deno.FsFile);
        });
        const file = new InputFile("/tmp/file.txt");
        assertEquals(file.filename, "file.txt");
        const data = await file.toRaw();
        if (data instanceof Uint8Array) throw new Error("no itr");
        const values = await convertToUint8Array(data);
        assertEquals(values, bytes);
        open.restore();
    },
});

Deno.test({
    name: "convert blob to raw",
    async fn() {
        const blob = new Blob(["AB", "CD"]);
        const file = new InputFile(blob);
        const data = await file.toRaw();
        if (data instanceof Uint8Array) throw new Error("no itr");
        const values = await convertToUint8Array(data);
        assertEquals(values, new Uint8Array([65, 66, 67, 68])); // ABCD
    },
});

Deno.test({
    name: "convert URL to raw",
    async fn() {
        const bytes = new Uint8Array([65, 66, 67]);
        const source = stub(
            globalThis,
            "fetch",
            () => Promise.resolve(new Response(bytes)),
        );
        const file0 = new InputFile({ url: "https://grammy.dev" });
        const file1 = new InputFile(new URL("https://grammy.dev"));
        const data0 = await file0.toRaw();
        const data1 = await file1.toRaw();
        if (data0 instanceof Uint8Array) throw new Error("no itr");
        if (data1 instanceof Uint8Array) throw new Error("no itr");
        const values0 = await convertToUint8Array(data0);
        const values1 = await convertToUint8Array(data1);
        assertEquals(values0, bytes);
        assertEquals(values1, bytes);
        source.restore();
    },
});

Deno.test({
    name: "convert Response to raw",
    async fn() {
        const bytes = new Uint8Array([65, 66, 67]);
        const file0 = new InputFile(new Response(bytes));
        const data0 = await file0.toRaw();
        if (data0 instanceof Uint8Array) throw new Error("no itr");
        const values0 = await convertToUint8Array(data0);
        assertEquals(values0, bytes);
    },
});

Deno.test({
    name: "convert supplier function to raw",
    async fn() {
        const blob = new Blob(["AB", "CD"]);
        const file = new InputFile(() => blob);
        const data = await file.toRaw();
        if (data instanceof Uint8Array) throw new Error("no itr");
        const values = await convertToUint8Array(data);
        assertEquals(values, new Uint8Array([65, 66, 67, 68])); // ABCD
    },
});

Deno.test({
    name: "handle invalid URLs",
    fn() {
        const source = stub(
            globalThis,
            "fetch",
            () => Promise.resolve(new Response(null)),
        );
        const file = new InputFile({ url: "https://grammy.dev" });

        assertRejects(
            () => file.toRaw(),
            "no response body from 'https://grammy.dev'",
        );
        source.restore();
    },
});

Deno.test({
    name: "reject URLs with HTTP error status",
    async fn() {
        for (const status of [400, 403, 404, 429, 500, 503, 599]) {
            const source = stub(
                globalThis,
                "fetch",
                () => Promise.resolve(new Response("error page", { status })),
            );
            try {
                const file0 = new InputFile({ url: "https://grammy.dev" });
                const file1 = new InputFile(new URL("https://grammy.dev"));
                await assertRejects(
                    () => file0.toRaw(),
                    Error,
                    `HTTP error status ${status} from 'https://grammy.dev`,
                );
                await assertRejects(
                    () => file1.toRaw(),
                    Error,
                    `HTTP error status ${status} from 'https://grammy.dev`,
                );
            } finally {
                source.restore();
            }
        }
    },
});

Deno.test({
    name: "accept URLs with non-error HTTP status",
    async fn() {
        const bytes = new Uint8Array([65, 66, 67]);
        for (const status of [200, 201, 206, 399]) {
            const source = stub(
                globalThis,
                "fetch",
                () => Promise.resolve(new Response(bytes, { status })),
            );
            try {
                const file = new InputFile({ url: "https://grammy.dev" });
                const data = await file.toRaw();
                if (data instanceof Uint8Array) throw new Error("no itr");
                assertEquals(await convertToUint8Array(data), bytes);
            } finally {
                source.restore();
            }
        }
    },
});

Deno.test({
    name: "reject Response with HTTP error status",
    async fn() {
        for (const status of [400, 404, 500, 599]) {
            const file = new InputFile(new Response("error page", { status }));
            await assertRejects(
                () => file.toRaw(),
                Error,
                `HTTP error status ${status}`,
            );
        }
        const empty = new InputFile(new Response(null, { status: 404 }));
        await assertRejects(
            () => empty.toRaw(),
            Error,
            "HTTP error status 404",
        );
    },
});

Deno.test({
    name: "abort the download upon HTTP error status",
    async fn() {
        const signals: (AbortSignal | undefined)[] = [];
        const source = stub(
            globalThis,
            "fetch",
            (_url, init) => {
                signals.push(init?.signal ?? undefined);
                return Promise.resolve(
                    new Response("error page", { status: 503 }),
                );
            },
        );
        try {
            const file = new InputFile({ url: "https://grammy.dev" });
            await assertRejects(
                () => file.toRaw(),
                Error,
                "HTTP error status 503",
            );
            assertEquals(signals.length, 1);
            assertEquals(signals[0]?.aborted, true);
        } finally {
            source.restore();
        }
    },
});

Deno.test({
    name: "do not abort the download upon success",
    async fn() {
        const bytes = new Uint8Array([65, 66, 67]);
        const signals: (AbortSignal | undefined)[] = [];
        const source = stub(
            globalThis,
            "fetch",
            (_url, init) => {
                signals.push(init?.signal ?? undefined);
                return Promise.resolve(new Response(bytes));
            },
        );
        try {
            const file = new InputFile({ url: "https://grammy.dev" });
            const data = await file.toRaw();
            if (data instanceof Uint8Array) throw new Error("no itr");
            assertEquals(await convertToUint8Array(data), bytes);
            assertEquals(signals.length, 1);
            assertEquals(signals[0]?.aborted, false);
        } finally {
            source.restore();
        }
    },
});

Deno.test({
    name: "reject Response with HTTP error status and locked body",
    async fn() {
        const response = new Response("error page", { status: 404 });
        const reader = response.body!.getReader(); // cancel() now rejects
        const file = new InputFile(response);
        await assertRejects(() => file.toRaw(), Error, "HTTP error status 404");
        reader.releaseLock();
    },
});

Deno.test({
    name: "reject Response with HTTP error status and hanging cancel",
    async fn() {
        const stream = new ReadableStream<Uint8Array>({
            cancel: () => new Promise<void>(() => {}), // never settles
        });
        const file = new InputFile(new Response(stream, { status: 500 }));
        const timeout = new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error("toRaw() hung")), 1000)
        );
        await assertRejects(
            () => Promise.race([file.toRaw(), timeout]),
            Error,
            "HTTP error status 500",
        );
    },
});
