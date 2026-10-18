const accountRoots = [
  "/dashboard",
  "/onboarding",
  "/workout",
  "/programs",
  "/progress",
  "/settings",
  "/chat",
  "/calendar",
  "/nutrition",
];

export function isProductPath(pathname: string): boolean {
  return accountRoots.some((root) => pathname === root || pathname.startsWith(`${root}/`));
}
