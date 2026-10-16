/** Harness entry: mounts the Kuntisuyu full-screen (?lang=es|en). */
import "../../../styles/global.css";
import "../../world.css";
import { mountColca } from "../index";

const q = new URLSearchParams(location.search);
const lang = q.get("lang") === "en" ? "en" : "es";
document.documentElement.lang = lang;
const host = document.getElementById("world");
if (host)
  (window as unknown as { __dispose?: () => void }).__dispose = mountColca(host, { lang, skipIntro: q.has("skip") });
