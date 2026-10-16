/** Harness entry: mounts the Collasuyu full-screen (?lang=es|en, ?from=<world> picks the arrival). */
import "../../../styles/global.css";
import "../../world.css";
import { mountTiticaca } from "../index";

const q = new URLSearchParams(location.search);
const lang = q.get("lang") === "en" ? "en" : "es";
document.documentElement.lang = lang;
const host = document.getElementById("world");
if (host)
  (window as unknown as { __dispose?: () => void }).__dispose = mountTiticaca(host, { lang, skipIntro: q.has("skip") });
