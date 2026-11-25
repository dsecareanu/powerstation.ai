import { render } from "preact";
import { App } from "./App";
import "./ui-standins/tokens.css";
import "./styles.css";

const root = document.getElementById("app");
if (root) render(<App />, root);
