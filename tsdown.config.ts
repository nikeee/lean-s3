import { defineConfig } from "tsdown";
import zig from "vite-plugin-zig-wasm";

export default defineConfig({
	entry: ["src/index.ts"],
	target: "esnext",
	plugins: [
		zig({
			zig: {
				releaseMode: "Debug"
			}
		}),
	],
});
