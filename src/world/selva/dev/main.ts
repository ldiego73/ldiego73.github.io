/** Harness entry: mounts the jungle runtime full-screen (?lang=es|en, ?skip=1 accepted). */
import "../../../styles/global.css";
import "../../world.css";
import { mountSelva } from "../index";

const q = new URLSearchParams(location.search);
const lang = q.get("lang") === "en" ? "en" : "es";
document.documentElement.lang = lang;
const host = document.getElementById("world");
if (host)
  (window as unknown as { __dispose?: () => void }).__dispose = mountSelva(host, { lang, skipIntro: q.has("skip") });
