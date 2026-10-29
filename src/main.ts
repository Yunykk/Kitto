import { mount } from "svelte";
import App from "./App.svelte";
import "./app.css";
import "./themes.css";
import "./motion.css"

const target = document.getElementById("app");

if (!target) {
  throw new Error("Missing #app element for Kitto.");
}

const app = mount(App, { target });

export default app;
