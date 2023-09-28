import { resolve } from "path";
import { defineConfig } from "vite";

export default defineConfig({
	root: "src/main",
	publicDir: "../../public",
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
