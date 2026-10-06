/**
 * Real-user Core Web Vitals → Umami events ("web-vital"). One event per metric per page view, reported
 * by web-vitals when final (usually when the page is hidden). Umami loads with `defer`, so events wait
 * for it briefly instead of being dropped.
 */
import { type Metric, onCLS, onFCP, onINP, onLCP, onTTFB } from "web-vitals";

type Umami = { track: (event: string, data?: Record<string, string | number>) => void };

function send(m: Metric) {
  const data = {
    metric: m.name,
    // CLS is unitless (keep 3 decimals); the rest are milliseconds.
    value: m.name === "CLS" ? Math.round(m.value * 1000) / 1000 : Math.round(m.value),
    rating: m.rating,
    path: location.pathname,
    device: matchMedia("(max-width: 720px)").matches ? "mobile" : "desktop",
  };
  let tries = 0;
  const go = () => {
    const umami = (window as unknown as { umami?: Umami }).umami;
    if (umami) umami.track("web-vital", data);
    else if (++tries < 10) setTimeout(go, 500);
  };
  go();
}

onLCP(send);
onCLS(send);
onINP(send);
onFCP(send);
onTTFB(send);
