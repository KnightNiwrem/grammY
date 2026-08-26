import { assertEquals, assertStringIncludes, stub } from "./deps.test.ts";

Deno.test({
    name: "invalid usage warning",
    permissions: { env: ["DEBUG"] },
    async fn() {
        const previous = Deno.env.get("DEBUG");
        Deno.env.set("DEBUG", "grammy:warn");
        const debug = stub(console, "debug");
        try {
            const { InputFile } = await import("../src/types.ts?debug");
            new InputFile("http://grammy.dev");
            new InputFile("https://grammy.dev");
        } finally {
            debug.restore();
            if (previous === undefined) Deno.env.delete("DEBUG");
            else Deno.env.set("DEBUG", previous);
        }
        assertEquals(debug.calls.length, 2);
        assertStringIncludes(debug.calls[0].args[0], "local file path");
        assertStringIncludes(debug.calls[1].args[0], "local file path");
    },
});
