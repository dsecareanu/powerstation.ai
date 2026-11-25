import { render } from "preact";
import { App } from "./App";
import "@powerstation/ui/styles.css";
import "./styles.css";

const root = document.getElementById("app");
if (root) render(<App />, root);
