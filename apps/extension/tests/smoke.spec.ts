import { test, expect } from "@playwright/test";

test("fixture page is available for future integration smoke tests", async ({ page }) => {
  await page.setContent("<html><body><textarea>int main(){return 0;}</textarea></body></html>");
  await expect(page.locator("textarea")).toHaveValue("int main(){return 0;}");
});
