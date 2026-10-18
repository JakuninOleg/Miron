import { expect, it } from "vitest";
import { isProductPath } from "./product-routes";

it("fences nested account routes without absorbing public lookalikes", () => {
  for (const route of ["/dashboard", "/workout", "/workout/owner-session", "/progress"])
    expect(isProductPath(route)).toBe(true);
  for (const route of ["/story", "/sign-in", "/workout-builder", "/workouts-public"])
    expect(isProductPath(route)).toBe(false);
});
