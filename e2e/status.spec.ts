import { expect, test } from "@playwright/test";

const status = (p: import("@playwright/test").Page) => p.getByRole("status");

test.describe("result announcements", () => {
  test("a tool page keeps the result body out of the live region and announces its size", async ({ page }) => {
    await page.goto("/json-formatter");
    const body = page.getByTestId("output");
    await expect(body).toContainText('"name": "BoringX"');
    await expect(body).not.toHaveAttribute("aria-live");
    await expect(status(page)).toHaveText(/^Result ready: [\d,]+ characters? in [\d,]+ lines?\.$/);
  });

  test("typing settles into one announcement for the final result", async ({ page }) => {
    await page.goto("/json-formatter");
    await expect(page.getByTestId("output")).not.toBeEmpty();
    const input = page.getByLabel("JSON", { exact: true });
    await input.fill('{"a":1}');
    await input.fill('{"a":1,"b":2}');
    await input.fill('{"a":1,"b":2,"c":3}');
    await expect(status(page)).toHaveText("Result ready: 32 characters in 5 lines.");
    await expect(status(page)).not.toContainText('"a"');
  });

  test("errors are read by the error note, and the status region stays quiet", async ({ page }) => {
    await page.goto("/json-formatter");
    await expect(page.getByTestId("output")).not.toBeEmpty();
    await page.getByLabel("JSON", { exact: true }).fill('{"a": 1,}');
    await expect(page.locator(".note-error")).toContainText(/Invalid JSON at line 1, column \d+/);
    await expect(status(page)).toHaveText("");
    await expect(status(page)).not.toContainText("Invalid JSON");
  });

  test("the sandbox announces results the same way", async ({ page }) => {
    await page.goto("/sandbox");
    const body = page.getByTestId("output");
    await expect(body).toContainText("fruit IN (");
    await expect(body).not.toHaveAttribute("aria-live");
    await expect(status(page)).toHaveText(/^Result ready: [\d,]+ characters? in [\d,]+ lines?\.$/);
  });
});
