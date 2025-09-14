import { test, expect } from "@playwright/test";

test("can toggle text visibility", async ({ page }) => {
  // Go to your local app
  await page.goto("http://localhost:5173");

  // The "Hello, World!" text should initially be visible
  const initialText: string | null = await page.textContent("h1");
  expect(initialText).toBe("Hello, World!");

  // Click the button to hide the text
  await page.click("button");

  // The "Hello, World!" text should no longer be visible
  const hiddenText: any = await page.$("h1");
  expect(hiddenText).toBe(null);

  // Click the button to show the text
  await page.click("button");

  // The "Hello, World!" text should be visible again
  const visibleText: string | null = await page.textContent("h1");
  expect(visibleText).toBe("Hello, World!");
});
