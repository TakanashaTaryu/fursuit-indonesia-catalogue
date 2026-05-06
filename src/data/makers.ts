export interface FursuitMaker {
  id: string;
  name: string;
  logo: string;
  socials: { platform: string; url: string; handle: string }[];
  previews: string[];
  status: "Open" | "Closed" | "Waitlist";
  types: string[];
  priceMin: number;
  priceMax: number;
  priceUpdatedAt: string;
  followers: number;
  commissionsFinished: number;
}

export const makers: FursuitMaker[] = [];
