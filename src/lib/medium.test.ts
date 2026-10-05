import { expect, test } from "bun:test";
import { parseMediumFeed } from "./medium";

test("parses Medium RSS items", () => {
  const xml = `<rss><channel><item><title><![CDATA[Kong & GitOps]]></title><link>https://medium.com/@ldiego73/kong-123?source=rss</link><category><![CDATA[kubernetes]]></category><pubDate>Mon, 01 Sep 2025 10:00:00 GMT</pubDate><content:encoded><![CDATA[<p>Hello <b>world</b></p>]]></content:encoded></item></channel></rss>`;
  const [post] = parseMediumFeed(xml);
  expect(post?.title).toBe("Kong & GitOps");
  expect(post?.url).toBe("https://medium.com/@ldiego73/kong-123");
  expect(post?.tags).toEqual(["kubernetes"]);
  expect(post?.excerpt).toBe("Hello world");
  expect(post?.date.getUTCFullYear()).toBe(2025);
});
