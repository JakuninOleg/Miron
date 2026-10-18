export interface ProductAccess {
  mode: "trial" | "archive";
  startsAt: string;
  endsAt: string;
  serverNow: string;
  remainingReplies: number;
  paymentsAvailable: false;
}
