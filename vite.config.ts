import { resolve } from "path";
import { defineConfig } from "vite";

export default defineConfig({
	root: resolve(__dirname, "src/main"),
	build: {
		outDir: "../../dist",
		emptyOutDir: true,
	},
	base: "./",
	server: {
		port: 8080,
		hot: true,
	},
});
